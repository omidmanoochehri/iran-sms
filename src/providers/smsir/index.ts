/**
 * SMS.ir adapter.
 *
 * Official documentation: https://sms.ir/rest-api/ · Swagger: https://api.sms.ir/swagger/v1/swagger.json
 * Research log: docs/providers/sms-ir.md (verified 2026-08-16)
 *
 * Notes that shaped this implementation:
 * - Two error layers: the HTTP status *and* the envelope's `status` field. A 200 with
 *   `status: 102` is an insufficient-credit failure, so both are checked.
 * - All timestamps are Unix **seconds, UTC**.
 * - Hard caps of 100 recipients / 100 texts per call are enforced locally so the caller
 *   gets a precise message instead of status `105`/`106`.
 * - Template parameters are an **array of `{name, value}`**, not an object.
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import {
  SMSAuthenticationError,
  SMSError,
  SMSInsufficientCreditError,
  SMSPatternError,
  SMSRateLimitError,
  SMSRecipientError,
  SMSValidationError,
  type SMSErrorOptions,
} from '../../core/errors.js';
import { assertFuture, parseProviderDate, toUnixSeconds } from '../../core/datetime.js';
import {
  makeBalanceResult,
  makeInboxMessage,
  makeOutboxMessage,
  makePage,
  makeSendResult,
  makeStatusResult,
  statusMapper,
} from '../../core/normalize.js';
import type {
  BalanceResult,
  BulkSendOptions,
  InboxMessage,
  ListOptions,
  OutboxMessage,
  Page,
  PatternSendOptions,
  PeerMessage,
  ProviderMeta,
  SendOptions,
  SendResult,
  Sender,
  StatusResult,
} from '../../core/types.js';
import { CATALOG } from '../catalog.js';
import {
  BASE_URL,
  DELIVERY_STATE,
  MAX_PAGE_SIZE,
  MAX_PARAMETER_LENGTH,
  MAX_RECIPIENTS,
  MAX_TEXTS,
  STATUS_CODES,
} from './constants.js';

const entry = CATALOG.find((item) => item.id === 'smsir')!;
const mapDelivery = statusMapper(DELIVERY_STATE);

interface SmsIrEnvelope<T> {
  status?: number;
  message?: string;
  data?: T;
}

interface SmsIrReport {
  messageId?: number;
  mobile?: number | string;
  messageText?: string;
  sendDateTime?: number;
  lineNumber?: number | string;
  cost?: number;
  deliveryState?: number;
  deliveryDateTime?: number;
}

export class SmsIrProvider extends BaseProvider {
  readonly meta: ProviderMeta = {
    id: entry.id,
    name: entry.name,
    apiVersion: entry.apiVersion,
    documentation: entry.documentation,
    phoneFormat: entry.phoneFormat,
    capabilities: entry.capabilities,
    platform: 'smsir',
  };

  protected readonly requiredCredentials: readonly CredentialSpec[] = entry.requiredCredentials;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected defaultBaseUrl(): string {
    return BASE_URL;
  }

  protected authHeaders(): Record<string, string> {
    const key = String(this.credentials['apiKey'] ?? '');
    return key ? { 'X-API-KEY': key, Accept: 'application/json' } : {};
  }

  /* ---------------------------------------------------------------- transport */

  async call<T = unknown>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; idempotent?: boolean } = {},
  ): Promise<{ data: T; raw: unknown }> {
    const response = await this.http.request<SmsIrEnvelope<T>>({
      method,
      path,
      query: options.query,
      body: options.body,
      bodyKind: options.body === undefined ? 'none' : 'json',
      idempotent: options.idempotent ?? method === 'GET',
    });

    const body = response.data;
    const status = body?.status;

    if (!response.ok || (typeof status === 'number' && status !== 1)) {
      throw this.toError(response.status, status, body?.message, path, body);
    }

    return { data: (body?.data ?? null) as T, raw: body };
  }

  private toError(
    httpStatus: number,
    appStatus: number | undefined,
    message: string | undefined,
    endpoint: string,
    raw: unknown,
  ): SMSError {
    const code = appStatus ?? httpStatus;
    const documented = appStatus !== undefined ? STATUS_CODES[appStatus] : undefined;
    const text = documented ?? message ?? `SMS.ir request failed (HTTP ${httpStatus})`;
    const detail = message && documented && message !== documented ? `${documented} — ${message}` : text;

    const base: SMSErrorOptions = {
      provider: this.meta.id,
      code,
      status: httpStatus,
      endpoint,
      raw,
    };

    // Application status codes are more specific than the HTTP status, so they win.
    if (appStatus !== undefined) {
      if ([10, 11, 12, 13, 14].includes(appStatus)) return new SMSAuthenticationError(detail, base);
      if (appStatus === 20) return new SMSRateLimitError(detail, base);
      if (appStatus === 102) return new SMSInsufficientCreditError(detail, base);
      if ([113, 114, 116, 117, 119].includes(appStatus)) return new SMSPatternError(detail, base);
      if ([104, 105, 107, 115].includes(appStatus)) return new SMSRecipientError(detail, base);
      if (appStatus !== 0) return new SMSValidationError(detail, base);
      return new SMSError(detail, { ...base, retryable: true });
    }

    switch (httpStatus) {
      case 401:
      case 403:
        return new SMSAuthenticationError(detail, base);
      case 429:
        return new SMSRateLimitError(detail, base);
      case 400:
        return new SMSValidationError(detail, base);
      default:
        return new SMSError(detail, { ...base, retryable: httpStatus >= 500 });
    }
  }

  private lineNumber(from?: string): number | string {
    const sender = this.requireSender(from);
    // Line numbers are numeric but long enough to lose precision if mishandled; keep the
    // string when it is not safely representable.
    const asNumber = Number(sender);
    return Number.isSafeInteger(asNumber) ? asNumber : sender;
  }

  private scheduleField(scheduleAt: SendOptions['scheduleAt']): number | null {
    if (!scheduleAt) return null;
    assertFuture(scheduleAt);
    return toUnixSeconds(scheduleAt);
  }

  /* ---------------------------------------------------------------- unified: send */

  override async send(options: SendOptions): Promise<SendResult> {
    const mobiles = this.phoneList(options.to);
    if (mobiles.length === 0) {
      throw new SMSValidationError('At least one recipient is required.', {
        provider: this.meta.id,
        code: 107,
      });
    }
    if (mobiles.length > MAX_RECIPIENTS) {
      throw new SMSValidationError(
        `SMS.ir accepts at most ${MAX_RECIPIENTS} recipients per bulk send (received ${mobiles.length}). ` +
          'Split the list into chunks.',
        { provider: this.meta.id, code: 105 },
      );
    }

    const body = {
      lineNumber: this.lineNumber(options.from),
      messageText: options.message,
      mobiles,
      sendDateTime: this.scheduleField(options.scheduleAt),
      ...(options.providerOptions ?? {}),
    };

    const { data, raw } = await this.call<{ packId?: string; messageIds?: number[]; cost?: number }>(
      'POST',
      '/v1/send/bulk',
      { body, idempotent: false },
    );

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: mobiles.length === 1 ? (data?.messageIds?.[0] ?? null) : null,
      batchId: data?.packId ?? null,
      recipients: mobiles,
      status: options.scheduleAt ? 'scheduled' : 'queued',
      cost: data?.cost ?? null,
      currency: 'credit',
    });
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  /** `likeTolike` — parallel arrays of texts and mobiles, equal length. */
  override async sendPeerToPeer(
    peers: readonly PeerMessage[],
    options: Omit<SendOptions, 'to' | 'message'> = {},
  ): Promise<SendResult> {
    const mobiles: string[] = [];
    const messageTexts: string[] = [];

    for (const peer of peers) {
      for (const recipient of this.phoneList(peer.to)) {
        mobiles.push(recipient);
        messageTexts.push(peer.message);
      }
    }

    if (mobiles.length === 0) {
      throw new SMSValidationError('At least one peer message is required.', {
        provider: this.meta.id,
        code: 107,
      });
    }
    if (mobiles.length > MAX_RECIPIENTS || messageTexts.length > MAX_TEXTS) {
      throw new SMSValidationError(
        `SMS.ir accepts at most ${MAX_RECIPIENTS} recipients and ${MAX_TEXTS} texts per like-to-like send.`,
        { provider: this.meta.id, code: 105 },
      );
    }

    const { data, raw } = await this.call<{ packId?: string; messageIds?: number[]; cost?: number }>(
      'POST',
      '/v1/send/likeTolike',
      {
        body: {
          lineNumber: this.lineNumber(options.from),
          messageTexts,
          mobiles,
          sendDateTime: this.scheduleField(options.scheduleAt),
          ...(options.providerOptions ?? {}),
        },
        idempotent: false,
      },
    );

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: null,
      batchId: data?.packId ?? null,
      recipients: mobiles,
      status: options.scheduleAt ? 'scheduled' : 'queued',
      cost: data?.cost ?? null,
      currency: 'credit',
    });
  }

  /**
   * Verify send — SMS.ir's template path.
   *
   * This is also the only method that can reach numbers on the system blacklist, which is
   * why OTP traffic belongs here rather than on `send`.
   */
  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const mobiles = this.phoneList(options.to);
    if (mobiles.length !== 1) {
      throw new SMSValidationError(
        `SMS.ir verify send accepts exactly one recipient (received ${mobiles.length}).`,
        { provider: this.meta.id, code: 'pattern_single_recipient' },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);
    const templateId = Number(resolved.code);
    if (!Number.isFinite(templateId)) {
      throw new SMSPatternError(`SMS.ir template ids are numeric; received "${resolved.code}".`, {
        provider: this.meta.id,
        code: 113,
      });
    }

    const parameters = Object.entries(options.variables ?? {}).map(([name, value]) => {
      const stringValue = String(value);
      if (stringValue.length > MAX_PARAMETER_LENGTH) {
        throw new SMSPatternError(
          `SMS.ir template parameter "${name}" exceeds ${MAX_PARAMETER_LENGTH} characters (${stringValue.length}).`,
          { provider: this.meta.id, code: 114 },
        );
      }
      if (name.trim() === '') {
        throw new SMSPatternError('SMS.ir template parameter names cannot be empty.', {
          provider: this.meta.id,
          code: 116,
        });
      }
      return { name, value: stringValue };
    });

    const { data, raw } = await this.call<{ messageId?: number; cost?: number }>('POST', '/v1/send/verify', {
      body: { mobile: mobiles[0], templateId, parameters, ...(options.providerOptions ?? {}) },
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: data?.messageId ?? null,
      batchId: null,
      recipients: mobiles,
      status: 'queued',
      cost: data?.cost ?? null,
      currency: 'credit',
    });
  }

  /** Cancel a scheduled pack. SMS.ir refunds the credit and reports how much. */
  override async cancelScheduled(packId: string): Promise<{ success: boolean; raw: unknown }> {
    const { raw } = await this.call('DELETE', `/v1/send/scheduled/${encodeURIComponent(packId)}`, {
      idempotent: false,
    });
    return { success: true, raw };
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const { data, raw } = await this.call<SmsIrReport>('GET', `/v1/send/${encodeURIComponent(messageId)}`, {
      idempotent: true,
    });

    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      status: mapDelivery(data?.deliveryState),
      nativeStatus: data?.deliveryState ?? null,
      recipient: data?.mobile === undefined ? null : String(data.mobile),
      deliveredAt: parseProviderDate(data?.deliveryDateTime),
      raw,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    // No batch endpoint exists; the documented route is one call per id.
    return Promise.all(messageIds.map((id) => this.getStatus(id)));
  }

  /** All messages in a pack (the identifier a bulk send returns). */
  async getPackReport(packId: string): Promise<StatusResult[]> {
    const { data, raw } = await this.call<SmsIrReport[]>(
      'GET',
      `/v1/send/pack/${encodeURIComponent(packId)}`,
      { idempotent: true },
    );

    return (data ?? []).map((item) =>
      makeStatusResult({
        provider: this.meta.id,
        messageId: item.messageId ?? 0,
        status: mapDelivery(item.deliveryState),
        nativeStatus: item.deliveryState ?? null,
        recipient: item.mobile === undefined ? null : String(item.mobile),
        deliveredAt: parseProviderDate(item.deliveryDateTime),
        raw,
      }),
    );
  }

  override async listOutbox(options: ListOptions = {}): Promise<Page<OutboxMessage>> {
    const pageSize = Math.min(options.pageSize ?? 100, MAX_PAGE_SIZE);
    const archive = options.from !== undefined || options.to !== undefined;

    const query: Record<string, unknown> = {
      pageNumber: options.page ?? 1,
      pageSize,
      ...(options.providerOptions ?? {}),
    };
    if (options.from) query['fromDate'] = toUnixSeconds(options.from);
    if (options.to) query['toDate'] = toUnixSeconds(options.to);

    const { data, raw } = await this.call<SmsIrReport[]>(
      'GET',
      archive ? '/v1/send/archive' : '/v1/send/live',
      { query, idempotent: true },
    );

    return makePage({
      items: (data ?? []).map((item) =>
        makeOutboxMessage({
          provider: this.meta.id,
          messageId: item.messageId ?? null,
          to: item.mobile === undefined ? null : String(item.mobile),
          from: item.lineNumber === undefined ? null : String(item.lineNumber),
          text: item.messageText ?? null,
          status: mapDelivery(item.deliveryState),
          cost: item.cost,
          sentAt: parseProviderDate(item.sendDateTime),
          raw: item,
        }),
      ),
      page: options.page ?? 1,
      pageSize,
      raw,
    });
  }

  override async getMessage(messageId: string): Promise<OutboxMessage> {
    const { data, raw } = await this.call<SmsIrReport>('GET', `/v1/send/${encodeURIComponent(messageId)}`, {
      idempotent: true,
    });
    return makeOutboxMessage({
      provider: this.meta.id,
      messageId: data?.messageId ?? messageId,
      to: data?.mobile === undefined ? null : String(data.mobile),
      from: data?.lineNumber === undefined ? null : String(data.lineNumber),
      text: data?.messageText ?? null,
      status: mapDelivery(data?.deliveryState),
      cost: data?.cost,
      sentAt: parseProviderDate(data?.sendDateTime),
      raw,
    });
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const pageSize = Math.min(options.pageSize ?? 100, MAX_PAGE_SIZE);
    const archive = options.from !== undefined || options.to !== undefined;

    const query: Record<string, unknown> = {
      pageNumber: options.page ?? 1,
      pageSize,
      ...(options.providerOptions ?? {}),
    };
    if (options.from) query['fromDate'] = toUnixSeconds(options.from);
    if (options.to) query['toDate'] = toUnixSeconds(options.to);

    const { data, raw } = await this.call<
      Array<{
        receiveReturnId?: number;
        messageText?: string;
        number?: number;
        mobile?: number;
        receivedDateTime?: number;
      }>
    >('GET', archive ? '/v1/receive/archive' : '/v1/receive/live', { query, idempotent: true });

    return makePage({
      items: (data ?? []).map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          messageId: item.receiveReturnId ?? null,
          from: String(item.mobile ?? ''),
          to: item.number === undefined ? null : String(item.number),
          text: item.messageText ?? '',
          receivedAt: parseProviderDate(item.receivedDateTime),
          raw: item,
        }),
      ),
      page: options.page ?? 1,
      pageSize,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const { data, raw } = await this.call<number>('GET', '/v1/credit', { idempotent: true });
    return makeBalanceResult({ provider: this.meta.id, amount: data, currency: 'credit', raw });
  }

  override async listSenders(): Promise<Sender[]> {
    const { data, raw } = await this.call<Array<number | string>>('GET', '/v1/line', { idempotent: true });
    return (data ?? []).map((line) => ({
      provider: this.meta.id,
      number: String(line),
      dedicated: null,
      raw,
    }));
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    bulkSend: (body: Record<string, unknown>) =>
      this.call('POST', '/v1/send/bulk', { body, idempotent: false }),
    likeToLikeSend: (body: Record<string, unknown>) =>
      this.call('POST', '/v1/send/likeTolike', { body, idempotent: false }),
    verifySend: (body: Record<string, unknown>) =>
      this.call('POST', '/v1/send/verify', { body, idempotent: false }),
    removeScheduled: (packId: string) =>
      this.call('DELETE', `/v1/send/scheduled/${encodeURIComponent(packId)}`, { idempotent: false }),

    /**
     * URL send — accepts `username`/`password` as query parameters instead of the header.
     * Kept because some legacy integrations depend on it.
     */
    urlSend: (query: { username: string; password: string; mobile: string; line: number; text: string }) =>
      this.call('GET', '/v1/send', { query, idempotent: false }),

    getReport: (messageId: number | string) =>
      this.call('GET', `/v1/send/${encodeURIComponent(String(messageId))}`, { idempotent: true }),
    getPackReport: (packId: string) =>
      this.call('GET', `/v1/send/pack/${encodeURIComponent(packId)}`, { idempotent: true }),
    getSendPacks: (pageNumber = 1, pageSize = 100) =>
      this.call('GET', '/v1/send/pack', { query: { pageNumber, pageSize }, idempotent: true }),
    getLiveReport: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/v1/send/live', { query, idempotent: true }),
    getArchivedReport: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/v1/send/archive', { query, idempotent: true }),

    getLatestReceives: (count = 100) =>
      this.call('GET', '/v1/receive/latest', { query: { count }, idempotent: true }),
    getLiveReceives: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/v1/receive/live', { query, idempotent: true }),
    getArchivedReceives: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/v1/receive/archive', { query, idempotent: true }),

    getCredit: () => this.call('GET', '/v1/credit', { idempotent: true }),
    getLines: () => this.call('GET', '/v1/line', { idempotent: true }),
  };
}

export default SmsIrProvider;
