/**
 * FarazSMS / IranPayamak adapter.
 *
 * Official documentation: https://docs.farazsms.com/
 * Authoritative source: the provider's own OpenAPI 3.0.1 document at
 * https://docs.farazsms.com/download/openapi.json (55 paths) — verified 2026-08-16.
 * Research log: docs/providers/farazsms.md
 *
 * Notes that shaped this implementation:
 * - Auth is the `Api-Key` header (case-sensitive per the provider's own `llms.txt`).
 * - The base URL is `api.iranpayamak.com` even for FarazSMS-branded accounts; the two brands
 *   are one platform (docs/provider-relations.md).
 * - Recipients use the **national** format `09121234567`, explicitly *not* `+98`.
 * - `status` is the success flag: `llms.txt` says "Check `status`, not just the HTTP code."
 * - Success responses name the third field `messages`, errors name it `message`. Both are read.
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import {
  SMSAuthenticationError,
  SMSError,
  SMSInsufficientCreditError,
  SMSPatternError,
  SMSRateLimitError,
  SMSValidationError,
  type SMSErrorOptions,
} from '../../core/errors.js';
import { assertFuture, parseProviderDate, toIsoUtc } from '../../core/datetime.js';
import {
  makeBalanceResult,
  makeInboxMessage,
  makeOutboxMessage,
  makePage,
  makePatternInfo,
  makeSendResult,
  makeStatusResult,
  statusMapper,
} from '../../core/normalize.js';
import type {
  AccountInfo,
  BalanceResult,
  BulkSendOptions,
  Contact,
  ContactGroup,
  InboxMessage,
  ListOptions,
  OutboxMessage,
  Page,
  PatternInfo,
  PatternSendOptions,
  PeerMessage,
  ProviderMeta,
  SendOptions,
  SendResult,
  Sender,
  StatusResult,
} from '../../core/types.js';
import { CATALOG } from '../catalog.js';
import { BASE_URL, DELIVERY_STATUS, SEND_REQUEST_STATUS } from './constants.js';

const entry = CATALOG.find((item) => item.id === 'farazsms')!;
const mapDelivery = statusMapper(DELIVERY_STATUS);

interface FarazEnvelope<T> {
  status?: 'success' | 'error' | string;
  data?: T;
  /** Errors use `message`; successes use `messages`. Both are read. */
  message?: unknown;
  messages?: unknown;
}

interface FarazPage<T> {
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  itemsPerPage?: number;
  items?: T[];
}

export class FarazSMSProvider extends BaseProvider {
  readonly meta: ProviderMeta = {
    id: entry.id,
    name: entry.name,
    apiVersion: entry.apiVersion,
    documentation: entry.documentation,
    phoneFormat: entry.phoneFormat,
    capabilities: entry.capabilities,
    platform: 'farazsms',
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
    return key ? { 'Api-Key': key, Accept: 'application/json' } : {};
  }

  /**
   * `number_format` controls whether digits inside the message are rendered as English or
   * Persian numerals. The spec declares both `en|fa` and `english|persian`; every official
   * example sends the long form, so that is what goes on the wire.
   */
  private numberFormat(value?: unknown): 'english' | 'persian' {
    const raw = String(value ?? this.credentials['numberFormat'] ?? 'english').toLowerCase();
    return raw === 'fa' || raw === 'persian' ? 'persian' : 'english';
  }

  /**
   * Split `providerOptions` into the number-format hint and everything else.
   *
   * Without this, spreading `providerOptions` over the mapped body would let a caller's
   * shorthand (`'fa'`) reach the wire unnormalised, defeating the mapping — and the spec
   * declares both `en|fa` and `english|persian`, so only one of them is safe to send.
   */
  private splitOptions(
    providerOptions: Record<string, unknown> | undefined,
    key: 'number_format' | 'numberFormat',
  ): { format: 'english' | 'persian'; rest: Record<string, unknown> } {
    const { [key]: hint, ...rest } = providerOptions ?? {};
    return { format: this.numberFormat(hint), rest };
  }

  /* ---------------------------------------------------------------- transport */

  async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: {
      query?: Record<string, unknown>;
      body?: unknown;
      multipart?: boolean;
      idempotent?: boolean;
    } = {},
  ): Promise<{ data: T; raw: unknown }> {
    const response = await this.http.request<FarazEnvelope<T>>({
      method,
      path,
      query: options.query,
      body: options.body,
      bodyKind: options.body === undefined ? 'none' : options.multipart ? 'multipart' : 'json',
      idempotent: options.idempotent ?? method === 'GET',
    });

    const body = response.data;
    const ok = response.ok && body?.status !== 'error';

    if (!ok) {
      throw this.toError(response.status, body, path);
    }

    return { data: (body?.data ?? null) as T, raw: body };
  }

  private toError(httpStatus: number, body: FarazEnvelope<unknown> | undefined, endpoint: string): SMSError {
    const rawMessage = body?.message ?? body?.messages;
    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : rawMessage
          ? JSON.stringify(rawMessage)
          : `FarazSMS request failed with HTTP ${httpStatus}`;

    const base: SMSErrorOptions = {
      provider: this.meta.id,
      code: httpStatus,
      status: httpStatus,
      endpoint,
      raw: body,
    };

    switch (httpStatus) {
      case 401:
      case 403:
        return new SMSAuthenticationError(message, base);
      case 429:
        return new SMSRateLimitError(message, base);
      case 402:
        return new SMSInsufficientCreditError(message, base);
      case 404:
        return /pattern/i.test(message)
          ? new SMSPatternError(message, base)
          : new SMSValidationError(message, base);
      case 400:
      case 422:
        return new SMSValidationError(message, base);
      default:
        return new SMSError(message, { ...base, retryable: httpStatus >= 500 });
    }
  }

  private schedule(scheduleAt: SendOptions['scheduleAt']): Record<string, string> {
    if (!scheduleAt) return {};
    assertFuture(scheduleAt);
    // Official examples show both ISO-8601 with `Z` and `YYYY-MM-DD HH:mm:ss`; no timezone
    // is documented, so ISO-8601 UTC is used because it is unambiguous.
    return { schedule: toIsoUtc(scheduleAt) };
  }

  /* ---------------------------------------------------------------- unified: send */

  override async send(options: SendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length === 0) {
      throw new SMSValidationError('At least one recipient is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    const { format, rest } = this.splitOptions(options.providerOptions, 'number_format');
    const { data, raw } = await this.call<number>('POST', '/ws/v1/sms/simple', {
      body: {
        ...rest,
        text: options.message,
        recipients,
        line_number: this.requireSender(options.from),
        number_format: format,
        ...this.schedule(options.scheduleAt),
      },
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: null,
      batchId: data ?? null,
      recipients,
      status: options.scheduleAt ? 'scheduled' : 'queued',
      currency: 'IRT',
    });
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  /**
   * Peer-to-peer.
   *
   * This endpoint is `multipart/form-data` with a JSON-encoded `peers` field, and returns
   * an **array** of send-request ids — one per peer group.
   */
  override async sendPeerToPeer(
    peers: readonly PeerMessage[],
    options: Omit<SendOptions, 'to' | 'message'> = {},
  ): Promise<SendResult> {
    if (peers.length === 0) {
      throw new SMSValidationError('At least one peer message is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    const normalized = peers.map((peer) => ({
      text: peer.message,
      recipients: this.phoneList(peer.to),
    }));

    const { format, rest } = this.splitOptions(options.providerOptions, 'numberFormat');
    const { data, raw } = await this.call<number[]>('POST', '/ws/v1/send/peer-to-peer', {
      body: {
        ...rest,
        from: this.requireSender(options.from),
        peers: JSON.stringify(normalized),
        numberFormat: format,
        ...(options.scheduleAt ? { schedule: toIsoUtc(options.scheduleAt) } : {}),
      },
      multipart: true,
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: null,
      batchId: Array.isArray(data) ? (data[0] ?? null) : (data ?? null),
      recipients: normalized.flatMap((peer) => peer.recipients),
      status: options.scheduleAt ? 'scheduled' : 'queued',
      currency: 'IRT',
    });
  }

  /**
   * Pattern send.
   *
   * Values go in `attributes`, keyed by variable name (placeholders are `%name%` in the
   * pattern text). Exactly one recipient — the field is `recipient`, singular.
   */
  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length !== 1) {
      throw new SMSValidationError(
        `FarazSMS pattern send accepts exactly one recipient (received ${recipients.length}).`,
        { provider: this.meta.id, code: 'pattern_single_recipient' },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.variables ?? {})) attributes[key] = String(value);

    const { format, rest } = this.splitOptions(options.providerOptions, 'number_format');
    const body: Record<string, unknown> = {
      ...rest,
      code: resolved.code,
      attributes,
      recipient: recipients[0],
      line_number: this.requireSender(options.from),
      number_format: format,
    };

    // The official spec annotates `schedule` on this endpoint as "Maybe it must be null for
    // patterns" — genuinely uncertain, so it is only sent when explicitly requested.
    if (options.scheduleAt) {
      assertFuture(options.scheduleAt);
      body['schedule'] = toIsoUtc(options.scheduleAt);
    }

    const { data, raw } = await this.call<number>('POST', '/ws/v1/sms/pattern', {
      body,
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: data ?? null,
      batchId: data ?? null,
      recipients,
      status: 'queued',
      currency: 'IRT',
    });
  }

  /** Voice message. Requires a `file_id` from `native.uploadVoiceFile` first. */
  override async sendVoice(options: {
    to: string | readonly string[];
    message: string;
    scheduleAt?: Date | string;
  }): Promise<SendResult> {
    const fileId = Number(options.message);
    if (!Number.isFinite(fileId)) {
      throw new SMSValidationError(
        'FarazSMS voice sending takes a `file_id` from a previously uploaded audio file, not text. ' +
          'Upload with `provider.native.uploadVoiceFile(...)`, then pass the returned id as `message`.',
        { provider: this.meta.id, code: 'voice_file_required' },
      );
    }

    const recipients = this.phoneList(options.to);
    const { data, raw } = await this.call<number>('POST', '/ws/v1/sms/voice/send', {
      body: {
        file_id: fileId,
        recipients,
        ...(options.scheduleAt ? { schedule: toIsoUtc(options.scheduleAt) } : {}),
      },
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: data ?? null,
      batchId: data ?? null,
      recipients,
      status: 'queued',
      currency: 'IRT',
    });
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const { data, raw } = await this.call<Record<string, unknown>>(
      'GET',
      `/ws/v1/send_request/${encodeURIComponent(messageId)}`,
      { idempotent: true },
    );

    const native = String((data as { status?: unknown })?.status ?? '');
    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      status: SEND_REQUEST_STATUS[native] ?? 'unknown',
      nativeStatus: native || null,
      raw,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    return Promise.all(messageIds.map((id) => this.getStatus(id)));
  }

  /** Per-recipient delivery detail for one send request. */
  async getSendRequestItems(
    sendRequestId: string,
    options: ListOptions = {},
  ): Promise<Page<{ recipient: string; status: string; raw: unknown }>> {
    const { data, raw } = await this.call<FarazPage<Record<string, unknown>>>(
      'GET',
      `/ws/v1/send_request/${encodeURIComponent(sendRequestId)}/items`,
      { query: { page: options.page ?? 1, limit: options.pageSize ?? 20 }, idempotent: true },
    );

    return makePage({
      items: (data?.items ?? []).map((item) => ({
        recipient: String(item['mobile'] ?? item['recipient'] ?? ''),
        // Normalized status, with the provider's own value kept alongside it in `raw`.
        status: mapDelivery(item['status']),
        raw: item,
      })),
      page: data?.currentPage,
      pageSize: data?.itemsPerPage,
      total: data?.totalItems,
      raw,
    });
  }

  override async listOutbox(options: ListOptions = {}): Promise<Page<OutboxMessage>> {
    const { data, raw } = await this.call<FarazPage<Record<string, unknown>>>('GET', '/ws/v1/send_request', {
      query: { page: options.page ?? 1, limit: options.pageSize ?? 20, ...(options.providerOptions ?? {}) },
      idempotent: true,
    });

    return makePage({
      items: (data?.items ?? []).map((item) =>
        makeOutboxMessage({
          provider: this.meta.id,
          messageId: (item['id'] as number | undefined) ?? null,
          batchId: (item['id'] as number | undefined) ?? null,
          text: (item['text'] as string | undefined) ?? null,
          status: SEND_REQUEST_STATUS[String(item['status'] ?? '')] ?? 'unknown',
          sentAt: parseProviderDate(item['created_at'] ?? item['createdAt']),
          raw: item,
        }),
      ),
      page: data?.currentPage,
      pageSize: data?.itemsPerPage,
      total: data?.totalItems,
      raw,
    });
  }

  override async getMessage(messageId: string): Promise<OutboxMessage> {
    const { data, raw } = await this.call<Record<string, unknown>>(
      'GET',
      `/ws/v1/send_request/${encodeURIComponent(messageId)}`,
      { idempotent: true },
    );
    return makeOutboxMessage({
      provider: this.meta.id,
      messageId,
      batchId: messageId,
      text: (data?.['text'] as string | undefined) ?? null,
      status: SEND_REQUEST_STATUS[String(data?.['status'] ?? '')] ?? 'unknown',
      sentAt: parseProviderDate(data?.['created_at']),
      raw,
    });
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const { data, raw } = await this.call<
      FarazPage<{ from?: string; to?: string; text?: string; recievedAt?: string }>
    >('GET', '/ws/v1/inbox', {
      query: { page: options.page ?? 1, limit: options.pageSize ?? 20 },
      idempotent: true,
    });

    return makePage({
      items: (data?.items ?? []).map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          from: String(item.from ?? ''),
          to: item.to ?? null,
          text: String(item.text ?? ''),
          // The API spells this field `recievedAt`; preserved on the wire, fixed in our shape.
          receivedAt: parseProviderDate(item.recievedAt),
          raw: item,
        }),
      ),
      page: data?.currentPage,
      pageSize: data?.itemsPerPage,
      total: data?.totalItems,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const { data, raw } = await this.call<{ balanceAmount?: number; balanceCount?: number }>(
      'GET',
      '/ws/v1/account/balance',
      { idempotent: true },
    );
    return makeBalanceResult({
      provider: this.meta.id,
      amount: data?.balanceAmount,
      messageCount: data?.balanceCount,
      currency: 'IRT',
      raw,
    });
  }

  override async getAccountInfo(): Promise<AccountInfo> {
    const { data, raw } = await this.call<{
      displayName?: string;
      mobile?: string;
      plan?: { expiryDate?: string };
    }>('GET', '/ws/v1/account/profile', { idempotent: true });

    return {
      provider: this.meta.id,
      username: null,
      displayName: data?.displayName ?? null,
      mobile: data?.mobile ?? null,
      expiresAt: parseProviderDate(data?.plan?.expiryDate),
      raw,
    };
  }

  override async listSenders(): Promise<Sender[]> {
    const { data, raw } = await this.call<unknown>('GET', '/ws/v1/lines/accessible', { idempotent: true });
    const items = Array.isArray(data)
      ? data
      : ((data as FarazPage<Record<string, unknown>> | null)?.items ?? []);

    return items.map((item: unknown) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        provider: this.meta.id,
        number: String(record['number'] ?? record['line_number'] ?? record['title'] ?? item),
        dedicated: typeof record['is_dedicated'] === 'boolean' ? record['is_dedicated'] : null,
        raw,
      };
    });
  }

  /* ---------------------------------------------------------------- unified: patterns */

  override async listPatterns(options: ListOptions = {}): Promise<Page<PatternInfo>> {
    // The published spec attaches a request body to this GET (an Apidog artefact); the
    // fields it lists are list filters, so they are sent as query parameters.
    const { data, raw } = await this.call<FarazPage<Record<string, unknown>>>('GET', '/ws/v1/patterns', {
      query: { page: options.page ?? 1, limit: options.pageSize ?? 20, ...(options.providerOptions ?? {}) },
      idempotent: true,
    });

    const items = Array.isArray(data) ? data : (data?.items ?? []);
    return makePage({
      items: items.map((item: Record<string, unknown>) => this.toPattern(item)),
      page: data?.currentPage,
      pageSize: data?.itemsPerPage,
      total: data?.totalItems,
      raw,
    });
  }

  override async getPattern(code: string): Promise<PatternInfo> {
    const { data, raw } = await this.call<Record<string, unknown>>(
      'GET',
      `/ws/v1/patterns/${encodeURIComponent(code)}`,
      { idempotent: true },
    );
    return this.toPattern(data ?? {}, raw);
  }

  override async createPattern(input: {
    body: string;
    description?: string;
    variables?: readonly string[];
    shared?: boolean;
    website?: string;
    category?: 1 | 2 | 3 | 255;
  }): Promise<PatternInfo> {
    const vars = (input.variables ?? []).map((name) => ({ var: name, length: 40, type: 'str' }));
    const { data, raw } = await this.call<string>('POST', '/ws/v1/patterns', {
      body: {
        text: input.body,
        description: input.description ?? '',
        share: input.shared ? 1 : 0,
        website: input.website ?? '',
        category: input.category ?? 1,
        vars,
      },
      idempotent: false,
    });

    return makePatternInfo({
      provider: this.meta.id,
      code: String(data ?? ''),
      body: input.body,
      status: 'pending',
      variables: [...(input.variables ?? [])],
      raw,
    });
  }

  override async updatePattern(
    code: string,
    input: {
      body?: string;
      description?: string;
      variables?: readonly string[];
      shared?: boolean;
      website?: string;
    },
  ): Promise<PatternInfo> {
    const vars = (input.variables ?? []).map((name) => ({ var: name, length: 40, type: 'str' }));
    const { data, raw } = await this.call<string>('PUT', `/ws/v1/patterns/${encodeURIComponent(code)}`, {
      body: {
        text: input.body,
        description: input.description ?? '',
        share: input.shared ? 1 : 0,
        website: input.website ?? '',
        vars,
      },
      idempotent: false,
    });

    return makePatternInfo({
      provider: this.meta.id,
      code: String(data ?? code),
      body: input.body ?? null,
      status: 'pending',
      variables: [...(input.variables ?? [])],
      raw,
    });
  }

  private toPattern(item: Record<string, unknown>, raw: unknown = item): PatternInfo {
    const status = String(item['status'] ?? item['staus'] ?? '').toLowerCase();
    const attributes = Array.isArray(item['attributes'])
      ? (item['attributes'] as Array<{ name?: string }>)
      : [];

    return makePatternInfo({
      provider: this.meta.id,
      code: String(item['code'] ?? ''),
      title: (item['title'] as string | undefined) ?? null,
      body: (item['text'] as string | undefined) ?? null,
      status:
        status === 'active'
          ? 'active'
          : status === 'rejected'
            ? 'rejected'
            : status === 'pending'
              ? 'pending'
              : 'unknown',
      variables: attributes.map((attribute) => String(attribute?.name ?? '')),
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: contacts */

  override async listContacts(options: ListOptions = {}): Promise<Page<Contact>> {
    const { data, raw } = await this.call<FarazPage<Record<string, unknown>>>(
      'GET',
      '/ws/v1/phone_book_data',
      {
        query: {
          page: options.page ?? 1,
          limit: options.pageSize ?? 20,
          ...(options.providerOptions ?? {}),
        },
        idempotent: true,
      },
    );

    return makePage({
      items: (data?.items ?? []).map((item) => ({
        provider: this.meta.id,
        id: item['id'] === undefined ? null : String(item['id']),
        number: String(item['mobile'] ?? ''),
        name: (item['name'] as string | undefined) ?? null,
        email: null,
        groupId: null,
        raw: item,
      })),
      page: data?.currentPage,
      pageSize: data?.itemsPerPage,
      total: data?.totalItems,
      raw,
    });
  }

  override async createContact(input: { number: string; name?: string; groupId?: string }): Promise<Contact> {
    if (!input.groupId) {
      throw new SMSValidationError('FarazSMS requires `groupId` (phone_book_id) when adding a contact.', {
        provider: this.meta.id,
        code: 'phonebook_required',
      });
    }

    const { raw } = await this.call('POST', '/ws/v1/phone_book_data', {
      body: {
        phone_book_id: Number(input.groupId),
        mobile: this.phone(input.number),
        name: input.name,
      },
      idempotent: false,
    });

    return {
      provider: this.meta.id,
      id: null,
      number: this.phone(input.number),
      name: input.name ?? null,
      email: null,
      groupId: input.groupId,
      raw,
    };
  }

  override async deleteContact(id: string): Promise<{ success: boolean; raw: unknown }> {
    const { raw } = await this.call('DELETE', `/ws/v1/phone_book_data/${encodeURIComponent(id)}`, {
      idempotent: false,
    });
    return { success: true, raw };
  }

  override async listContactGroups(options: ListOptions = {}): Promise<Page<ContactGroup>> {
    const { data, raw } = await this.call<FarazPage<Record<string, unknown>>>('GET', '/ws/v1/phone_book', {
      query: { page: options.page ?? 1, limit: options.pageSize ?? 20 },
      idempotent: true,
    });

    return makePage({
      items: (data?.items ?? []).map((item) => ({
        provider: this.meta.id,
        id: String(item['id'] ?? ''),
        title: (item['title'] as string | undefined) ?? null,
        count: typeof item['records'] === 'number' ? item['records'] : null,
        raw: item,
      })),
      page: data?.currentPage,
      pageSize: data?.itemsPerPage,
      total: data?.totalItems,
      raw,
    });
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    sendPattern: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/pattern', { body, idempotent: false }),
    sendSimple: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/simple', { body, idempotent: false }),
    sendSimpleFile: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/simple-file', { body, multipart: true, idempotent: false }),
    sendKeywords: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/keywords', { body, idempotent: false }),
    sendKeywordFile: (body: Record<string, unknown>) =>
      this.call('POST', '/v1/send/keyword-file', { body, multipart: true, idempotent: false }),
    sendPeerToPeer: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/send/peer-to-peer', { body, multipart: true, idempotent: false }),
    sendPeerToPeerFile: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/send/peer-to-peer-file', { body, multipart: true, idempotent: false }),
    sendToNumberBank: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/bank', { body, idempotent: false }),
    sendSample: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/sample', { body, idempotent: false }),
    calculateCost: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/calculate-cost', { body, idempotent: true }),

    uploadVoiceFile: (form: Record<string, unknown>) =>
      this.call<number>('POST', '/ws/v1/sms/voice/upload-file', {
        body: form,
        multipart: true,
        idempotent: false,
      }),
    sendVoice: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/sms/voice/send', { body, idempotent: false }),
    downloadVoiceFile: (fileId: number) =>
      this.call('GET', '/ws/v1/sms/voice/download-file', { query: { file_id: fileId }, idempotent: true }),

    /** Location-based campaigns — unique to this provider among those supported here. */
    lbs: {
      create: (body: Record<string, unknown>) => this.call('POST', '/ws/v1/lbs', { body, idempotent: false }),
      list: () => this.call('GET', '/ws/v1/lbs', { idempotent: true }),
      get: (lbsId: string) =>
        this.call('GET', `/ws/v1/lbs/${encodeURIComponent(lbsId)}`, { idempotent: true }),
      update: (lbsId: string, body: Record<string, unknown>) =>
        this.call('PUT', `/ws/v1/lbs/${encodeURIComponent(lbsId)}`, { body, idempotent: false }),
      cancel: (lbsId: string) =>
        this.http
          .request({
            method: 'PATCH',
            path: `/ws/v1/lbs/${encodeURIComponent(lbsId)}/cancel`,
            idempotent: false,
          })
          .then((response) => response.data),
    },

    sendRequests: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/ws/v1/send_request', { query, idempotent: true }),
    sendRequest: (id: string) =>
      this.call('GET', `/ws/v1/send_request/${encodeURIComponent(id)}`, { idempotent: true }),
    sendRequestItems: (id: string, query: Record<string, unknown> = {}) =>
      this.call('GET', `/ws/v1/send_request/${encodeURIComponent(id)}/items`, { query, idempotent: true }),
    inbox: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/ws/v1/inbox', { query, idempotent: true }),

    balance: () => this.call('GET', '/ws/v1/account/balance', { idempotent: true }),
    profile: () => this.call('GET', '/ws/v1/account/profile', { idempotent: true }),
    chargeWallet: (body: { amount: number; redirectUrl?: string }) =>
      this.call('POST', '/ws/v1/account/wallet/charge', { body, idempotent: false }),
    updateAccount: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/account/update', { body, idempotent: false }),
    registerAccount: (body: Record<string, unknown>) =>
      this.call('POST', '/ws/v1/account/register', { body, idempotent: false }),
    lines: (query: Record<string, unknown> = {}) =>
      this.call('GET', '/ws/v1/lines/accessible', { query, idempotent: true }),

    orders: {
      pay: (form: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/orders/pay', { body: form, multipart: true, idempotent: false }),
      cancel: (form: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/orders/cancel', { body: form, multipart: true, idempotent: false }),
      applyDiscount: (form: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/orders/apply-discount', { body: form, multipart: true, idempotent: false }),
    },

    phonebook: {
      list: (query: Record<string, unknown> = {}) =>
        this.call('GET', '/ws/v1/phone_book', { query, idempotent: true }),
      create: (body: { title: string; attributes?: number[] }) =>
        this.call('POST', '/ws/v1/phone_book', { body, idempotent: false }),
      update: (id: string, body: Record<string, unknown>) =>
        this.call('PUT', `/ws/v1/phone_book/${encodeURIComponent(id)}`, { body, idempotent: false }),
      attributes: (query: Record<string, unknown> = {}) =>
        this.call('GET', '/ws/v1/phone_book_attribute', { query, idempotent: true }),
      createAttribute: (body: { title: string; type: 'date' | 'number' | 'string' }) =>
        this.call('POST', '/ws/v1/phone_book_attribute', { body, idempotent: false }),
      contacts: (query: Record<string, unknown> = {}) =>
        this.call('GET', '/ws/v1/phone_book_data', { query, idempotent: true }),
      addContact: (body: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/phone_book_data', { body, idempotent: false }),
      bulkUpsert: (body: { phone_book_id: number; items: Array<Record<string, unknown>> }) =>
        this.call('POST', '/ws/v1/phone_book_data/bulk-upsert', { body, idempotent: false }),
      excelUpsert: (form: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/phone_book_data/excel-upsert', {
          body: form,
          multipart: true,
          idempotent: false,
        }),
      deleteContact: (id: string) =>
        this.call('DELETE', `/ws/v1/phone_book_data/${encodeURIComponent(id)}`, { idempotent: false }),
    },

    tickets: {
      list: (query: Record<string, unknown> = {}) =>
        this.call('GET', '/ws/v1/ticket', { query, idempotent: true }),
      create: (form: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/ticket', { body: form, multipart: true, idempotent: false }),
      show: (id: string) => this.call('GET', `/ws/v1/ticket/${encodeURIComponent(id)}`, { idempotent: true }),
      /** The API really does spell this "replay". */
      reply: (form: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/ticket/replay', { body: form, multipart: true, idempotent: false }),
      close: (ticketId: number) =>
        this.call('POST', '/ws/v1/ticket/closed', { body: { ticket_id: ticketId }, idempotent: false }),
      downloadFile: (query: { ticket_message_id: string; file_index: string }) =>
        this.call('GET', '/ws/v1/ticket/file/download', { query, idempotent: true }),
    },

    /**
     * Panel login flow.
     *
     * Not needed to use the web service — the `Api-Key` header is sufficient. These exist
     * for resellers building their own panel UI, and are included for completeness.
     */
    auth: {
      login: (body: { username: string; password: string; method?: 'sms' | 'ga' | null }) =>
        this.call('POST', '/ws/v1/auth/login', { body, idempotent: false }),
      logout: () => this.call('POST', '/ws/v1/auth/logout', { body: {}, idempotent: false }),
      register: (body: Record<string, unknown>) =>
        this.call('POST', '/ws/v1/auth/register', { body, idempotent: false }),
      showRegisterForm: () => this.call('GET', '/ws/v1/auth/show_register_form', { idempotent: true }),
      verify2fa: (body: { token: string; code: string; method?: 'sms' | 'ga' | null }) =>
        this.call('POST', '/ws/v1/auth/verify-2fa', { body, idempotent: false }),
    },

    /** Download the Excel import template for a phonebook. Note: no `/ws/v1` prefix. */
    phonebookExcelSample: (phoneBookId: string) =>
      this.call('GET', `/example/phone-book/${encodeURIComponent(phoneBookId)}/data.xlsx`, {
        idempotent: true,
      }),

    reference: {
      /** Note: no `/ws/v1` prefix on these two — verbatim from the official spec. */
      provinces: (hasAnyBanks?: boolean) =>
        this.call('GET', '/provinces', { query: { has_any_banks: hasAnyBanks }, idempotent: true }),
      cities: (provinceId: string, hasAnyBanks?: boolean) =>
        this.call('GET', '/cities', {
          query: { province_id: provinceId, has_any_banks: hasAnyBanks },
          idempotent: true,
        }),
      numberBanks: (query: Record<string, unknown>) =>
        this.call('GET', '/ws/v1/number_bank', { query, idempotent: true }),
      postalAvailableLines: () =>
        this.call('GET', '/ws/v1/sms/postal/get-available-lines', { idempotent: true }),
      postalGenders: () => this.call('GET', '/ws/v1/sms/postal/get-genders', { idempotent: true }),
      postalReceiverCount: (query: Record<string, unknown>) =>
        this.call('GET', '/ws/v1/sms/postal/get-receiver-count', { query, idempotent: true }),
    },
  };
}

export default FarazSMSProvider;
