/**
 * Payamak Panel platform adapter.
 *
 * Shared by MeliPayamak and every reseller running the same panel software. Concrete
 * providers subclass this and supply only their catalog id — the wire protocol is
 * identical, which is exactly why this package implements it once.
 *
 * Documentation: https://docs.melipayamak.com/webservice-rest (verified 2026-08-16)
 * Relationship evidence: docs/provider-relations.md
 *
 * ## Reading a Payamak Panel response
 *
 * Three envelope shapes coexist, and `Value` is overloaded: on a successful send it is the
 * record id, but the same field carries a small integer *status code* on failure. The
 * adapter separates them by length — record ids are documented as "more than 15 digits",
 * so a short `Value` is a status. `RetStatus === 1` is the outer gate; a live probe with
 * bad credentials returns `{"Value":"","RetStatus":0,"StrRetStatus":"UserNameAndPasswordFailed"}`.
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import {
  SMSAuthenticationError,
  SMSError,
  SMSInsufficientCreditError,
  SMSPatternError,
  SMSRecipientError,
  SMSValidationError,
  type SMSErrorOptions,
} from '../../core/errors.js';
import { assertFuture, parseProviderDate, toTehranDateTime } from '../../core/datetime.js';
import { renderPatternBody } from '../../core/pattern-registry.js';
import {
  makeBalanceResult,
  makeInboxMessage,
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
  Page,
  PatternSendOptions,
  PeerMessage,
  PriceEstimate,
  ProviderMeta,
  SendOptions,
  SendResult,
  Sender,
  StatusResult,
} from '../../core/types.js';
import { CATALOG, type CatalogEntry } from '../../providers/catalog.js';
import {
  BASE_URL,
  DELIVERY_ERRORS,
  DELIVERY_STATUS,
  MAX_INBOX_COUNT,
  MAX_MULTIPLE_ROWS,
  MIN_RECORD_ID_LENGTH,
  SCHEDULE_ERRORS,
  SEND_ERRORS,
  SEND_SCOPE,
  SMART_SCOPE,
  TEMPLATE_ERRORS,
} from './constants.js';

const mapDelivery = statusMapper(DELIVERY_STATUS);

/** Envelope A — scalar result. */
interface ScalarEnvelope {
  Value?: string | number;
  RetStatus?: number;
  StrRetStatus?: string;
}

/** Envelope B — wrapped list. `MyBase` on most methods, `BaseClass` on GetSchedule. */
interface ListEnvelope<T> {
  MyBase?: ScalarEnvelope;
  BaseClass?: ScalarEnvelope;
  Data?: T[];
}

/** Envelope C — per-recipient result. */
interface MultiEnvelope {
  ReqStatus?: string | number;
  Message?: string;
  Result?: Array<{
    Mobile?: string;
    ReqID?: number;
    ID?: number;
    ReqStatus?: number;
    Status?: number;
    Message?: string;
  }>;
}

export abstract class PayamakPanelProvider extends BaseProvider {
  readonly meta: ProviderMeta;
  protected readonly requiredCredentials: readonly CredentialSpec[];
  private readonly entry: CatalogEntry;

  /** @param catalogId canonical id of the concrete provider in the catalog. */
  constructor(catalogId: string, config: ProviderConfig = {}) {
    super(config);
    const entry = CATALOG.find((item) => item.id === catalogId);
    if (!entry) throw new SMSError(`Unknown catalog entry "${catalogId}".`, { code: 'unknown_provider' });

    this.entry = entry;
    this.requiredCredentials = entry.requiredCredentials;
    this.meta = {
      id: entry.id,
      name: entry.name,
      apiVersion: entry.apiVersion,
      documentation: entry.documentation,
      phoneFormat: entry.phoneFormat,
      capabilities: entry.capabilities,
      platform: 'payamak-panel',
    };
  }

  protected defaultBaseUrl(): string {
    return this.entry.defaultBaseUrl ?? BASE_URL;
  }

  /** Credentials travel in the body, so there is no auth header. */
  protected authHeaders(): Record<string, string> {
    return {};
  }

  private get auth(): { username: string; password: string } {
    return {
      username: String(this.credentials['username'] ?? ''),
      password: String(this.credentials['password'] ?? ''),
    };
  }

  /* ---------------------------------------------------------------- transport */

  /** POST a method and return the raw JSON body. */
  async call<T = unknown>(
    method: string,
    body: Record<string, unknown> = {},
    options: { scope?: string; idempotent?: boolean; withAuth?: boolean } = {},
  ): Promise<T> {
    const scope = options.scope ?? SEND_SCOPE;
    const path = `${scope}/${method}`;
    const withAuth = options.withAuth ?? true;

    const response = await this.http.request<T>({
      method: 'POST',
      path,
      body: withAuth ? { ...this.auth, ...body } : body,
      bodyKind: 'json',
      idempotent: options.idempotent ?? false,
    });

    if (!response.ok) {
      throw new SMSError(`Payamak Panel request failed with HTTP ${response.status}.`, {
        provider: this.meta.id,
        status: response.status,
        endpoint: path,
        raw: response.data,
        retryable: response.status >= 500,
      });
    }
    return response.data;
  }

  /** Read envelope A, applying the method's own `Value` error table. */
  private readScalar(
    body: ScalarEnvelope | undefined,
    errorTable: Readonly<Record<string, string>>,
    endpoint: string,
    options: { valueIsStatus?: boolean } = {},
  ): { value: string; isRecordId: boolean } {
    const retStatus = body?.RetStatus;
    const value = body?.Value === undefined || body?.Value === null ? '' : String(body.Value);

    if (retStatus !== 1) {
      throw this.toError(
        body?.StrRetStatus ?? `Request failed with RetStatus ${String(retStatus)}`,
        retStatus ?? 'unknown',
        endpoint,
        body,
      );
    }

    // A short `Value` is a status code, not a record id.
    const isRecordId = !options.valueIsStatus && value.length >= MIN_RECORD_ID_LENGTH;
    if (!isRecordId && !options.valueIsStatus) {
      const described = errorTable[value];
      if (described) {
        // `1` means "request completed"; every other documented code is a failure.
        if (value !== '1') throw this.toError(described, value, endpoint, body);
      }
    }

    return { value, isRecordId };
  }

  private toError(message: string, code: string | number, endpoint: string, raw: unknown): SMSError {
    const base: SMSErrorOptions = { provider: this.meta.id, code, endpoint, raw };
    const key = String(code);

    if (
      ['0', '-3', '-110', '-111', '-112', '-108', '-109', '-1'].includes(key) ||
      /UserNameAndPassword/i.test(message)
    ) {
      return new SMSAuthenticationError(message, base);
    }
    if (key === '2') return new SMSInsufficientCreditError(message, base);
    if (['-4', '-5', '-10'].includes(key)) return new SMSPatternError(message, base);
    if (['16', '18', '-2'].includes(key)) return new SMSRecipientError(message, base);
    if (['3', '4', '5', '6', '7', '9', '11', '12', '14', '15', '17', '19', '-8', '-9'].includes(key)) {
      return new SMSValidationError(message, base);
    }
    if (/InvalidData/i.test(message)) return new SMSValidationError(message, base);
    return new SMSError(message, base);
  }

  /* ---------------------------------------------------------------- unified: send */

  override async send(options: SendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length === 0) {
      throw new SMSValidationError('At least one recipient is required.', {
        provider: this.meta.id,
        code: 16,
      });
    }

    if (options.scheduleAt) {
      return this.sendScheduled(options, recipients);
    }

    const body = await this.call<ScalarEnvelope>(
      'SendSMS',
      {
        to: recipients.join(','),
        from: this.requireSender(options.from),
        text: options.message,
        isflash: false,
        ...(options.providerOptions ?? {}),
      },
      { idempotent: false },
    );

    const { value } = this.readScalar(body, SEND_ERRORS, 'SendSMS');
    return makeSendResult({
      provider: this.meta.id,
      raw: body,
      messageId: value || null,
      batchId: value || null,
      recipients,
      status: 'queued',
      currency: 'credit',
    });
  }

  private async sendScheduled(options: SendOptions, recipients: string[]): Promise<SendResult> {
    assertFuture(options.scheduleAt!);
    const body = await this.call<ScalarEnvelope>(
      'SendSchedule',
      {
        text: options.message,
        to: recipients.join(','),
        from: this.requireSender(options.from),
        // No timezone is documented; the platform is Iran-local (see docs/sending.md).
        scheduleDate: toTehranDateTime(options.scheduleAt!),
        period: (options.providerOptions?.['period'] as number | undefined) ?? 0,
        ...(options.providerOptions ?? {}),
      },
      { idempotent: false },
    );

    const { value } = this.readScalar(body, SCHEDULE_ERRORS, 'SendSchedule');
    return makeSendResult({
      provider: this.meta.id,
      raw: body,
      messageId: null,
      batchId: value || null,
      recipients,
      status: 'scheduled',
      currency: 'credit',
    });
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  /** `SendMultipleSMS` — parallel `to[]`/`text[]` arrays, max 100 rows. */
  override async sendPeerToPeer(
    peers: readonly PeerMessage[],
    options: Omit<SendOptions, 'to' | 'message'> = {},
  ): Promise<SendResult> {
    const to: string[] = [];
    const text: string[] = [];

    for (const peer of peers) {
      for (const recipient of this.phoneList(peer.to)) {
        to.push(recipient);
        text.push(peer.message);
      }
    }

    if (to.length === 0) {
      throw new SMSValidationError('At least one peer message is required.', {
        provider: this.meta.id,
        code: 16,
      });
    }
    if (to.length > MAX_MULTIPLE_ROWS) {
      throw new SMSValidationError(
        `Payamak Panel accepts at most ${MAX_MULTIPLE_ROWS} rows per SendMultipleSMS call (received ${to.length}).`,
        { provider: this.meta.id, code: 4 },
      );
    }

    const body = await this.call<MultiEnvelope>(
      'SendMultipleSMS',
      { from: this.requireSender(options.from), to, text, ...(options.providerOptions ?? {}) },
      { idempotent: false },
    );

    // Envelope C reports per-row results and uses `ReqStatus` rather than `RetStatus`.
    if (String(body?.ReqStatus ?? '') === '0') {
      throw this.toError(body?.Message ?? 'SendMultipleSMS failed', 0, 'SendMultipleSMS', body);
    }

    const results = body?.Result ?? [];
    return makeSendResult({
      provider: this.meta.id,
      raw: body,
      messageId: results.length === 1 ? (results[0]?.ReqID ?? null) : null,
      batchId: results[0]?.ReqID ?? null,
      recipients: to,
      status: 'queued',
      currency: 'credit',
      parts: results.map((item) => ({
        recipient: String(item.Mobile ?? ''),
        messageId: item.ReqID === undefined ? null : String(item.ReqID),
        status: mapDelivery(item.Status),
        cost: null,
        nativeStatus: item.Status ?? null,
      })),
    });
  }

  /**
   * Template send (`BaseServiceNumber`).
   *
   * Payamak Panel is unusual: it does **not** substitute variables server-side. You send
   * the fully rendered `text` alongside the approved `bodyId`, and the platform verifies
   * that the text matches the template's fixed parts (error `-5` when it does not).
   *
   * So the pattern registry entry needs a `body` to render from. Callers who prefer to
   * render themselves can pass `providerOptions.text`.
   */
  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length !== 1) {
      throw new SMSValidationError(
        `Payamak Panel template send accepts exactly one recipient (received ${recipients.length}).`,
        { provider: this.meta.id, code: -2 },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);
    const bodyId = Number(resolved.code);
    if (!Number.isFinite(bodyId)) {
      throw new SMSPatternError(
        `Payamak Panel template ids (bodyId) are numeric; received "${resolved.code}".`,
        { provider: this.meta.id, code: -4 },
      );
    }

    const explicitText = options.providerOptions?.['text'] as string | undefined;
    const template = resolved.body;
    if (!explicitText && !template) {
      throw new SMSPatternError(
        `Payamak Panel requires the fully rendered message text, because it does not substitute ` +
          `variables server-side. Add the approved template text to the pattern registry:\n` +
          `  patterns: { "${String(options.pattern)}": { "${this.meta.id}": { code: ${bodyId}, body: "…%code%…" } } }\n` +
          `or pass it directly via providerOptions.text.`,
        { provider: this.meta.id, code: 'pattern_body_required' },
      );
    }

    const text = explicitText ?? renderPatternBody(template!, options.variables ?? {});
    const scheduled = options.scheduleAt !== undefined;
    if (scheduled) assertFuture(options.scheduleAt!);

    const responseBody = await this.call<ScalarEnvelope>(
      scheduled ? 'BaseServiceNumberSchedule' : 'BaseServiceNumber',
      {
        text,
        to: recipients[0],
        bodyId,
        ...(scheduled ? { scheduleDate: toTehranDateTime(options.scheduleAt!) } : {}),
      },
      { idempotent: false },
    );

    const { value } = this.readScalar(responseBody, TEMPLATE_ERRORS, 'BaseServiceNumber');
    return makeSendResult({
      provider: this.meta.id,
      raw: responseBody,
      messageId: value || null,
      batchId: value || null,
      recipients,
      status: scheduled ? 'scheduled' : 'queued',
      currency: 'credit',
    });
  }

  /**
   * One-time password via `SendOTP`.
   *
   * Distinct from `sendPattern`: it needs no approved text at all, just the code.
   */
  async sendOtp(options: { to: string; code: string; from?: string }): Promise<SendResult> {
    const recipient = this.phone(options.to);
    const body = await this.call<ScalarEnvelope>(
      'SendOTP',
      { to: recipient, from: this.requireSender(options.from), code: options.code },
      { idempotent: false },
    );

    const { value } = this.readScalar(body, SEND_ERRORS, 'SendOTP');
    return makeSendResult({
      provider: this.meta.id,
      raw: body,
      messageId: value || null,
      batchId: value || null,
      recipients: [recipient],
      status: 'queued',
      currency: 'credit',
    });
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const body = await this.call<ScalarEnvelope>('GetDeliveries', { recID: messageId }, { idempotent: true });
    const { value } = this.readScalar(body, DELIVERY_ERRORS, 'GetDeliveries', { valueIsStatus: true });

    if (DELIVERY_ERRORS[value]) {
      throw this.toError(DELIVERY_ERRORS[value]!, value, 'GetDeliveries', body);
    }

    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      status: mapDelivery(value),
      nativeStatus: value,
      raw: body,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    const body = await this.call<ScalarEnvelope>(
      'GetNewDeliveries',
      { recID: [...messageIds] },
      { idempotent: true },
    );
    const { value } = this.readScalar(body, DELIVERY_ERRORS, 'GetNewDeliveries', { valueIsStatus: true });

    if (DELIVERY_ERRORS[value]) {
      throw this.toError(DELIVERY_ERRORS[value]!, value, 'GetNewDeliveries', body);
    }

    // Codes come back comma-joined, in the order the ids were supplied.
    const codes = value.split(',');
    return messageIds.map((id, index) =>
      makeStatusResult({
        provider: this.meta.id,
        messageId: id,
        status: mapDelivery(codes[index]),
        nativeStatus: codes[index] ?? null,
        raw: body,
      }),
    );
  }

  /** Public status lookup — needs no credentials at all. */
  async getPublicStatus(messageId: string): Promise<StatusResult> {
    const body = await this.call<ScalarEnvelope>(
      'GetDeliveries2',
      { recID: messageId },
      { idempotent: true, withAuth: false },
    );
    const { value } = this.readScalar(body, DELIVERY_ERRORS, 'GetDeliveries2', { valueIsStatus: true });
    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      status: mapDelivery(value),
      nativeStatus: value,
      raw: body,
    });
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const count = Math.min(options.pageSize ?? 20, MAX_INBOX_COUNT);
    const index = ((options.page ?? 1) - 1) * count;

    const body = await this.call<ListEnvelope<Record<string, unknown>>>(
      'GetMessages',
      {
        location: (options.providerOptions?.['location'] as number | undefined) ?? 1,
        index,
        count,
        ...(options.providerOptions ?? {}),
      },
      { idempotent: true },
    );

    const status = body?.MyBase ?? body?.BaseClass;
    if (status?.RetStatus !== 1) {
      throw this.toError(
        status?.StrRetStatus ?? 'GetMessages failed',
        status?.RetStatus ?? 'unknown',
        'GetMessages',
        body,
      );
    }

    return makePage({
      items: (body?.Data ?? []).map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          messageId: (item['MsgID'] as number | undefined) ?? null,
          from: String(item['Sender'] ?? ''),
          to: (item['Receiver'] as string | undefined) ?? null,
          text: String(item['Body'] ?? ''),
          receivedAt: parseProviderDate(item['SendDate']),
          raw: item,
        }),
      ),
      page: options.page ?? 1,
      pageSize: count,
      raw: body,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const body = await this.call<ScalarEnvelope>('GetCredit', {}, { idempotent: true });
    const { value } = this.readScalar(body, {}, 'GetCredit', { valueIsStatus: true });
    return makeBalanceResult({
      provider: this.meta.id,
      messageCount: value,
      currency: 'credit',
      raw: body,
    });
  }

  /** Balance in Rial rather than message units. */
  async getBalanceRial(): Promise<BalanceResult> {
    const body = await this.call<ScalarEnvelope>('GetCredit2', {}, { idempotent: true });
    const { value } = this.readScalar(body, {}, 'GetCredit2', { valueIsStatus: true });
    return makeBalanceResult({ provider: this.meta.id, amount: value, currency: 'IRR', raw: body });
  }

  override async listSenders(): Promise<Sender[]> {
    const body = await this.call<ListEnvelope<{ Number?: string }>>(
      'GetUserNumbers',
      {},
      { idempotent: true },
    );
    const status = body?.MyBase ?? body?.BaseClass;
    if (status?.RetStatus !== 1) {
      throw this.toError(
        status?.StrRetStatus ?? 'GetUserNumbers failed',
        status?.RetStatus ?? 'unknown',
        'GetUserNumbers',
        body,
      );
    }
    return (body?.Data ?? []).map((item) => ({
      provider: this.meta.id,
      number: String(item.Number ?? ''),
      dedicated: null,
      raw: item,
    }));
  }

  override async estimatePrice(options: {
    to: string | readonly string[];
    message: string;
    from?: string;
  }): Promise<PriceEstimate> {
    const recipients = this.phoneList(options.to);
    // The endpoint wants operator-split counts; classify by prefix so the estimate is real.
    let irancellCount = 0;
    let mciCount = 0;
    for (const recipient of recipients) {
      const prefix = recipient.replace(/^0/, '').slice(0, 3);
      if (
        ['930', '933', '935', '936', '937', '938', '939', '901', '902', '903', '904', '905', '941'].includes(
          prefix,
        )
      ) {
        irancellCount += 1;
      } else {
        mciCount += 1;
      }
    }

    const body = await this.call<ScalarEnvelope>(
      'GetSmsPrice',
      { irancellCount, mciCount, from: this.requireSender(options.from), text: options.message },
      { idempotent: true },
    );
    const { value } = this.readScalar(body, {}, 'GetSmsPrice', { valueIsStatus: true });

    return {
      provider: this.meta.id,
      total: Number(value) || null,
      currency: 'IRR',
      parts: null,
      raw: body,
    };
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    sendSMS: (body: Record<string, unknown>) => this.call('SendSMS', body),
    sendMultipleSMS: (body: Record<string, unknown>) => this.call('SendMultipleSMS', body),
    sendOTP: (body: Record<string, unknown>) => this.call('SendOTP', body),
    sendSchedule: (body: Record<string, unknown>) => this.call('SendSchedule', body),
    getSchedule: (scheduleId: number) => this.call('GetSchedule', { scheduleId }, { idempotent: true }),
    baseServiceNumber: (body: Record<string, unknown>) => this.call('BaseServiceNumber', body),
    baseServiceNumberSchedule: (body: Record<string, unknown>) =>
      this.call('BaseServiceNumberSchedule', body),

    getDeliveries: (recID: string) => this.call('GetDeliveries', { recID }, { idempotent: true }),
    getNewDeliveries: (recID: readonly string[]) =>
      this.call('GetNewDeliveries', { recID: [...recID] }, { idempotent: true }),
    getDeliveries2: (recID: string) =>
      this.call('GetDeliveries2', { recID }, { idempotent: true, withAuth: false }),
    getMessages: (body: Record<string, unknown>) => this.call('GetMessages', body, { idempotent: true }),
    getInboxCount: (isRead = false) => this.call('GetInboxCount', { isRead }, { idempotent: true }),

    getCredit: () => this.call('GetCredit', {}, { idempotent: true }),
    getCredit2: () => this.call('GetCredit2', {}, { idempotent: true }),
    getUserNumbers: () => this.call('GetUserNumbers', {}, { idempotent: true }),
    getSmsPrice: (body: Record<string, unknown>) => this.call('GetSmsPrice', body, { idempotent: true }),
    getBasePrice: () => this.call('GetBasePrice', {}, { idempotent: true }),

    /** Smart SMS — primary line with up to two documented fallbacks. */
    smart: {
      send: (body: Record<string, unknown>) => this.call('Send', body, { scope: SMART_SCOPE }),
      sendMultiple: (body: Record<string, unknown>) =>
        this.call('SendMultiple', body, { scope: SMART_SCOPE }),
      getDelivery: (Id: number) =>
        this.call('GetDeliveries2', { Id }, { scope: SMART_SCOPE, idempotent: true }),
      getDeliveries: (Ids: readonly number[]) =>
        this.call('GetDeliveries', { Ids: [...Ids] }, { scope: SMART_SCOPE, idempotent: true }),
    },
  };
}
