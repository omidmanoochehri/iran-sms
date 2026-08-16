/**
 * IPPanel `rest/v1` platform adapter.
 *
 * Shared by Mediana and the IPPanel-source resellers that run this generation. Concrete
 * providers subclass this and supply only their catalog id.
 *
 * Reference implementation: the official Mediana Go SDK (github.com/medianasms/go-rest-sdk).
 * Verified 2026-08-16. Research log: docs/providers/mediana.md
 *
 * Envelope: `{ status, code, data, meta: { total, limit, page, pages, prev, next } }`.
 * `code` carries the business error and is a **string** (`"10006"`, `"1402"`, …).
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import {
  SMSAuthenticationError,
  SMSConfigurationError,
  SMSError,
  SMSInsufficientCreditError,
  SMSPatternError,
  SMSRecipientError,
  SMSValidationError,
  type SMSErrorOptions,
} from '../../core/errors.js';
import { parseProviderDate } from '../../core/datetime.js';
import {
  makeBalanceResult,
  makeInboxMessage,
  makePage,
  makePatternInfo,
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
  PatternInfo,
  PatternSendOptions,
  ProviderMeta,
  SendOptions,
  SendResult,
  StatusResult,
} from '../../core/types.js';
import { CATALOG, type CatalogEntry } from '../../providers/catalog.js';
import {
  AUTH_ERRORS,
  AUTH_SCHEME,
  CREDIT_ERRORS,
  ERROR_CODES,
  MESSAGE_STATUS,
  PATTERN_ERRORS,
  PATTERN_STATUS,
  RECIPIENT_ERRORS,
  RETRYABLE_ERRORS,
} from './constants.js';

const mapStatus = statusMapper(MESSAGE_STATUS);

interface RestV1Meta {
  total?: number;
  limit?: number;
  page?: number;
  pages?: number;
  prev?: string | null;
  next?: string | null;
}

interface RestV1Envelope<T> {
  status?: string;
  code?: string;
  data?: T;
  meta?: RestV1Meta;
}

export abstract class IPPanelRestV1Provider extends BaseProvider {
  readonly meta: ProviderMeta;
  protected readonly requiredCredentials: readonly CredentialSpec[];
  private readonly entry: CatalogEntry;

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
      platform: 'ippanel-rest-v1',
    };
  }

  /**
   * These deployments each have their own host, and several of the ones this package
   * supports have no published endpoint at all. Guessing one would mean sending a real
   * customer's messages to an address nobody verified, so the adapter refuses.
   */
  protected defaultBaseUrl(): string {
    if (this.entry.defaultBaseUrl) return this.entry.defaultBaseUrl;
    throw new SMSConfigurationError(
      `Provider "${this.meta.id}" has no published API host, so this package will not guess one. ` +
        `Set it explicitly:\n  new SMS({ provider: '${this.meta.id}', request: { baseUrl: 'https://…/v1' }, … })\n` +
        'See docs/providers/' +
        this.meta.id +
        '.md.',
      { provider: this.meta.id, code: 'base_url_required' },
    );
  }

  protected authHeaders(): Record<string, string> {
    const key = String(this.credentials['apiKey'] ?? this.credentials['token'] ?? '');
    return key ? { Authorization: `${AUTH_SCHEME} ${key}` } : {};
  }

  /* ---------------------------------------------------------------- transport */

  async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; idempotent?: boolean } = {},
  ): Promise<{ data: T; meta: RestV1Meta | undefined; raw: unknown }> {
    const response = await this.http.request<RestV1Envelope<T>>({
      method,
      path,
      query: options.query,
      body: options.body,
      bodyKind: options.body === undefined ? 'none' : 'json',
      idempotent: options.idempotent ?? method === 'GET',
    });

    const body = response.data;
    const code = body?.code === undefined ? undefined : String(body.code);

    if (!response.ok || (code !== undefined && code !== '200' && ERROR_CODES[code])) {
      throw this.toError(code, response.status, body, path);
    }

    return { data: (body?.data ?? null) as T, meta: body?.meta, raw: body };
  }

  private toError(code: string | undefined, httpStatus: number, raw: unknown, endpoint: string): SMSError {
    const described = code ? ERROR_CODES[code] : undefined;
    const message = described ?? `Request failed with HTTP ${httpStatus}`;
    const base: SMSErrorOptions = {
      provider: this.meta.id,
      code: code ?? httpStatus,
      status: httpStatus,
      endpoint,
      raw,
    };

    if (code) {
      if (AUTH_ERRORS.has(code)) return new SMSAuthenticationError(message, base);
      if (CREDIT_ERRORS.has(code)) return new SMSInsufficientCreditError(message, base);
      if (PATTERN_ERRORS.has(code)) return new SMSPatternError(message, base);
      if (RECIPIENT_ERRORS.has(code)) return new SMSRecipientError(message, base);
      if (RETRYABLE_ERRORS.has(code)) return new SMSError(message, { ...base, retryable: true });
      if (code === '422') {
        const fields = extractFieldErrors(raw);
        return new SMSValidationError(message, fields ? { ...base, fields } : base);
      }
      return new SMSValidationError(message, base);
    }

    if (httpStatus === 401 || httpStatus === 403) return new SMSAuthenticationError(message, base);
    return new SMSError(message, { ...base, retryable: httpStatus >= 500 });
  }

  /* ---------------------------------------------------------------- unified: send */

  override async send(options: SendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length === 0) {
      throw new SMSValidationError('At least one recipient is required.', {
        provider: this.meta.id,
        code: '10005',
      });
    }
    if (options.scheduleAt) {
      throw new SMSValidationError(
        `Provider "${this.meta.id}" does not document a scheduled-send parameter on this API ` +
          'generation. Remove `scheduleAt` or send at the desired time.',
        { provider: this.meta.id, code: 'schedule_unsupported' },
      );
    }

    const { data, raw } = await this.call<{ bulk_id?: number }>('POST', '/messages', {
      body: {
        originator: this.requireSender(options.from),
        recipients,
        message: options.message,
        ...(options.providerOptions ?? {}),
      },
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: recipients.length === 1 ? (data?.bulk_id ?? null) : null,
      batchId: data?.bulk_id ?? null,
      recipients,
      status: 'queued',
      currency: 'IRR',
    });
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length !== 1) {
      throw new SMSValidationError(
        `Pattern send accepts exactly one recipient (received ${recipients.length}).`,
        { provider: this.meta.id, code: '10017' },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.variables ?? {})) values[key] = String(value);

    const { data, raw } = await this.call<{ bulk_id?: number }>('POST', '/messages/patterns/send', {
      body: {
        pattern_code: resolved.code,
        originator: this.requireSender(options.from),
        recipient: recipients[0],
        values,
        ...(options.providerOptions ?? {}),
      },
      idempotent: false,
    });

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: data?.bulk_id ?? null,
      batchId: data?.bulk_id ?? null,
      recipients,
      status: 'queued',
      currency: 'IRR',
    });
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const { data, raw } = await this.call<{ message?: Record<string, unknown> }>(
      'GET',
      `/messages/${encodeURIComponent(messageId)}`,
      { idempotent: true },
    );
    const message = data?.message ?? {};

    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      status: mapStatus(message['status']),
      nativeStatus: (message['status'] as string | undefined) ?? null,
      deliveredAt: parseProviderDate(message['sent_at']),
      raw,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    return Promise.all(messageIds.map((id) => this.getStatus(id)));
  }

  override async getMessage(messageId: string): Promise<OutboxMessage> {
    const { data, raw } = await this.call<{ message?: Record<string, unknown> }>(
      'GET',
      `/messages/${encodeURIComponent(messageId)}`,
      { idempotent: true },
    );
    const message = data?.message ?? {};

    return {
      provider: this.meta.id,
      messageId: String(message['bulk_id'] ?? messageId),
      batchId: String(message['bulk_id'] ?? messageId),
      to: null,
      from: (message['number'] as string | undefined) ?? null,
      text: (message['message'] as string | undefined) ?? null,
      status: mapStatus(message['status']),
      cost: typeof message['cost'] === 'number' ? message['cost'] : null,
      sentAt: parseProviderDate(message['sent_at']),
      raw,
    };
  }

  /** Per-recipient delivery detail for one bulk. */
  async getRecipients(
    bulkId: string,
    options: ListOptions = {},
  ): Promise<Page<{ recipient: string; status: string; raw: unknown }>> {
    const { data, meta, raw } = await this.call<{
      recipients?: Array<{ recipient: string; status: string }>;
    }>('GET', `/messages/${encodeURIComponent(bulkId)}/recipients`, {
      query: { page: options.page ?? 1, limit: options.pageSize ?? 10 },
      idempotent: true,
    });

    return makePage({
      items: (data?.recipients ?? []).map((item) => ({
        recipient: item.recipient,
        status: item.status,
        raw: item,
      })),
      page: meta?.page,
      pageSize: meta?.limit,
      total: meta?.total,
      raw,
    });
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const { data, meta, raw } = await this.call<{ messages?: Array<Record<string, unknown>> }>(
      'GET',
      '/messages/inbox',
      { query: { page: options.page ?? 1, limit: options.pageSize ?? 10 }, idempotent: true },
    );

    return makePage({
      items: (data?.messages ?? []).map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          from: String(item['sender'] ?? ''),
          to: (item['number'] as string | undefined) ?? null,
          text: String(item['message'] ?? ''),
          receivedAt: parseProviderDate(item['time']),
          raw: item,
        }),
      ),
      page: meta?.page,
      pageSize: meta?.limit,
      total: meta?.total,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const { data, raw } = await this.call<{ credit?: number }>('GET', '/credit', { idempotent: true });
    return makeBalanceResult({ provider: this.meta.id, amount: data?.credit, currency: 'IRR', raw });
  }

  /* ---------------------------------------------------------------- unified: patterns */

  override async createPattern(input: { body: string; shared?: boolean }): Promise<PatternInfo> {
    const { data, raw } = await this.call<{ pattern?: Record<string, unknown> }>(
      'POST',
      '/messages/patterns',
      {
        body: { pattern: input.body, is_shared: input.shared ?? false },
        idempotent: false,
      },
    );
    const pattern = data?.pattern ?? {};

    return makePatternInfo({
      provider: this.meta.id,
      code: String(pattern['code'] ?? ''),
      body: (pattern['message'] as string | undefined) ?? input.body,
      status: PATTERN_STATUS[String(pattern['status'] ?? '')] ?? 'unknown',
      raw,
    });
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    send: (body: { originator: string; recipients: string[]; message: string }) =>
      this.call<{ bulk_id: number }>('POST', '/messages', { body, idempotent: false }),
    getMessage: (bulkId: number | string) =>
      this.call('GET', `/messages/${encodeURIComponent(String(bulkId))}`, { idempotent: true }),
    fetchStatuses: (bulkId: number | string, page = 1, limit = 10) =>
      this.call('GET', `/messages/${encodeURIComponent(String(bulkId))}/recipients`, {
        query: { page, limit },
        idempotent: true,
      }),
    fetchInbox: (page = 1, limit = 10) =>
      this.call('GET', '/messages/inbox', { query: { page, limit }, idempotent: true }),
    createPattern: (pattern: string, isShared = false) =>
      this.call('POST', '/messages/patterns', { body: { pattern, is_shared: isShared }, idempotent: false }),
    sendPattern: (body: {
      pattern_code: string;
      originator: string;
      recipient: string;
      values: Record<string, string>;
    }) => this.call<{ bulk_id: number }>('POST', '/messages/patterns/send', { body, idempotent: false }),
    getCredit: () => this.call<{ credit: number }>('GET', '/credit', { idempotent: true }),
  };
}

/** `422` responses carry `data.error` as either a string or a `{field: [{code, err}]}` map. */
function extractFieldErrors(raw: unknown): Record<string, string[]> | undefined {
  const data = (raw as { data?: unknown } | undefined)?.data;
  const error = (data as { error?: unknown } | undefined)?.error;
  if (!error || typeof error !== 'object') return undefined;

  const out: Record<string, string[]> = {};
  for (const [field, value] of Object.entries(error as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[field] = value.map((item) =>
        typeof item === 'string' ? item : String((item as { err?: unknown })?.err ?? JSON.stringify(item)),
      );
    } else if (typeof value === 'string') {
      out[field] = [value];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
