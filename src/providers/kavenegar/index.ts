/**
 * Kavenegar adapter.
 *
 * Official documentation: https://kavenegar.com/rest.html
 * Research log: docs/providers/kavenegar.md (verified 2026-08-16)
 *
 * Notes that shaped this implementation:
 * - The API key is a **URL path segment**, not a header. Everything this package emits runs
 *   through redaction so the key never reaches a log line — see `core/redact.ts`.
 * - Kavenegar is the one provider here with real idempotency: `localid` makes a send
 *   repeat-safe, so it is the only provider whose sends this package will ever retry, and
 *   only when the caller supplied `idempotencyKey`.
 * - Verify Lookup has exactly five token slots with per-slot whitespace rules.
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
import { orderVariables } from '../../core/pattern-registry.js';
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
  StatusResult,
} from '../../core/types.js';
import { CATALOG } from '../catalog.js';
import {
  BASE_URL,
  MAX_IDS_PER_STATUS_CALL,
  MAX_RECIPIENTS_PER_SEND,
  MAX_TOKEN_LENGTH,
  MESSAGE_STATUS,
  RETURN_CODES,
  TOKEN_SLOTS,
  TOKEN_SPACE_LIMITS,
} from './constants.js';

const entry = CATALOG.find((item) => item.id === 'kavenegar')!;
const mapStatus = statusMapper(MESSAGE_STATUS);

interface KavenegarEnvelope<T> {
  return?: { status?: number; message?: string };
  entries?: T;
  metadata?: Record<string, unknown>;
}

interface KavenegarMessage {
  messageid?: number;
  message?: string;
  status?: number;
  statustext?: string;
  sender?: string;
  receptor?: string;
  date?: number;
  cost?: number;
}

export class KavenegarProvider extends BaseProvider {
  readonly meta: ProviderMeta = {
    id: entry.id,
    name: entry.name,
    apiVersion: entry.apiVersion,
    documentation: entry.documentation,
    phoneFormat: entry.phoneFormat,
    capabilities: entry.capabilities,
    platform: 'kavenegar',
  };

  protected readonly requiredCredentials: readonly CredentialSpec[] = entry.requiredCredentials;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected defaultBaseUrl(): string {
    return BASE_URL;
  }

  /** Kavenegar authenticates via the URL path, so there is nothing to put in a header. */
  protected authHeaders(): Record<string, string> {
    return {};
  }

  private get apiKey(): string {
    return String(this.credentials['apiKey'] ?? '');
  }

  private path(scope: string, method: string): string {
    return `/v1/${encodeURIComponent(this.apiKey)}/${scope}/${method}.json`;
  }

  /* ---------------------------------------------------------------- transport */

  /**
   * Call a Kavenegar method and return `entries`.
   *
   * `idempotent` defaults to `false`; callers that know a request is a safe read set it.
   */
  async call<T = unknown>(
    scope: string,
    method: string,
    params: Record<string, unknown> = {},
    options: { httpMethod?: 'GET' | 'POST' | 'DELETE'; idempotent?: boolean } = {},
  ): Promise<T> {
    const { entries } = await this.callFull<T>(scope, method, params, options);
    return entries;
  }

  private async callFull<T>(
    scope: string,
    method: string,
    params: Record<string, unknown> = {},
    options: { httpMethod?: 'GET' | 'POST' | 'DELETE'; idempotent?: boolean } = {},
  ): Promise<{ entries: T; metadata: Record<string, unknown> | undefined; raw: unknown }> {
    const httpMethod = options.httpMethod ?? 'POST';
    const path = this.path(scope, method);

    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') clean[key] = value;
    }

    const response = await this.http.request<KavenegarEnvelope<T>>({
      method: httpMethod,
      path,
      ...(httpMethod === 'POST' ? { body: clean, bodyKind: 'form' as const } : { query: clean }),
      idempotent: options.idempotent ?? false,
    });

    const body = response.data;
    const status = body?.return?.status ?? response.status;

    if (status !== 200 || !response.ok) {
      throw this.toError(status, body?.return?.message, path, body);
    }

    return {
      entries: (body?.entries ?? null) as T,
      metadata: body?.metadata,
      raw: body,
    };
  }

  private toError(status: number, message: string | undefined, endpoint: string, raw: unknown): SMSError {
    const text = message ?? RETURN_CODES[status] ?? `Kavenegar returned status ${status}`;
    const base: SMSErrorOptions = {
      provider: this.meta.id,
      code: status,
      status,
      endpoint,
      raw,
    };
    const detail = `${text} (Kavenegar ${status}: ${RETURN_CODES[status] ?? 'undocumented code'})`;

    switch (status) {
      case 401:
      case 403:
      case 407:
      case 416:
        return new SMSAuthenticationError(detail, base);
      case 418:
        return new SMSInsufficientCreditError(detail, base);
      case 429:
      case 451:
        return new SMSRateLimitError(detail, base);
      case 411:
        return new SMSRecipientError(detail, base);
      case 424:
      case 426:
      case 428:
      case 431:
      case 432:
        return new SMSPatternError(detail, base);
      case 400:
      case 406:
      case 412:
      case 413:
      case 414:
      case 415:
      case 417:
      case 419:
      case 420:
      case 422:
      case 604:
      case 607:
        return new SMSValidationError(detail, base);
      case 409:
        return new SMSError(detail, { ...base, retryable: true });
      default:
        return new SMSError(detail, base);
    }
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
    if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
      throw new SMSValidationError(
        `Kavenegar accepts at most ${MAX_RECIPIENTS_PER_SEND} recipients per send (received ${recipients.length}).`,
        { provider: this.meta.id, code: 414 },
      );
    }

    const params: Record<string, unknown> = {
      receptor: recipients.join(','),
      message: options.message,
      sender: this.resolveSender(options.from),
      ...(options.providerOptions ?? {}),
    };

    if (options.scheduleAt) {
      assertFuture(options.scheduleAt);
      params['date'] = toUnixSeconds(options.scheduleAt);
    }

    // `localid` is Kavenegar's duplicate-protection key: if the id already exists in the
    // outbox the message is NOT re-sent, and the existing record is returned. That is what
    // makes retrying this particular send safe.
    const hasIdempotency = typeof options.idempotencyKey === 'string' && options.idempotencyKey !== '';
    if (hasIdempotency) {
      params['localid'] = recipients.map(() => options.idempotencyKey).join(',');
    }

    const { entries, raw } = await this.callFull<KavenegarMessage[]>('sms', 'send', params, {
      idempotent: hasIdempotency,
    });

    return this.toSendResult(entries, recipients, raw, options.scheduleAt ? 'scheduled' : undefined);
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  /** `sms/sendarray` — a different sender and text per recipient. POST only. */
  override async sendPeerToPeer(
    peers: readonly PeerMessage[],
    options: Omit<SendOptions, 'to' | 'message'> = {},
  ): Promise<SendResult> {
    const receptor: string[] = [];
    const message: string[] = [];
    const sender: string[] = [];
    const defaultSender = this.requireSender(options.from);

    for (const peer of peers) {
      for (const recipient of this.phoneList(peer.to)) {
        receptor.push(recipient);
        message.push(peer.message);
        sender.push(defaultSender);
      }
    }

    if (receptor.length === 0) {
      throw new SMSValidationError('At least one peer message is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    const params: Record<string, unknown> = {
      // sendarray takes JSON arrays, not comma-joined strings.
      receptor: JSON.stringify(receptor),
      sender: JSON.stringify(sender),
      message: JSON.stringify(message),
      ...(options.providerOptions ?? {}),
    };
    if (options.scheduleAt) {
      assertFuture(options.scheduleAt);
      params['date'] = toUnixSeconds(options.scheduleAt);
    }

    const { entries, raw } = await this.callFull<KavenegarMessage[]>('sms', 'sendarray', params, {
      httpMethod: 'POST',
      idempotent: false,
    });

    return this.toSendResult(entries, receptor, raw, options.scheduleAt ? 'scheduled' : undefined);
  }

  /**
   * Verify Lookup — Kavenegar's pattern send.
   *
   * Values map onto the five documented token slots. When the pattern registry supplies a
   * `variableOrder` it is honoured; otherwise variables are assigned in declaration order,
   * and more than five is a hard error rather than a silent truncation.
   */
  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length !== 1) {
      throw new SMSValidationError(
        `Kavenegar Verify Lookup accepts exactly one recipient (received ${recipients.length}).`,
        { provider: this.meta.id, code: 'pattern_single_recipient' },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);
    const variables = options.variables ?? {};
    const ordered = orderVariables(variables, resolved.variableOrder, {
      provider: this.meta.id,
      pattern: String(options.pattern),
    });

    if (ordered.length > TOKEN_SLOTS.length) {
      throw new SMSPatternError(
        `Kavenegar templates have ${TOKEN_SLOTS.length} token slots (${TOKEN_SLOTS.join(', ')}), ` +
          `but ${ordered.length} variables were supplied.`,
        { provider: this.meta.id, code: 'too_many_tokens' },
      );
    }

    const params: Record<string, unknown> = {
      receptor: recipients[0],
      template: resolved.code,
      ...(options.providerOptions ?? {}),
    };

    ordered.forEach((value, index) => {
      const slot = TOKEN_SLOTS[index]!;
      this.assertTokenValue(slot, value);
      params[slot] = value;
    });

    const { entries, raw } = await this.callFull<KavenegarMessage[]>('verify', 'lookup', params, {
      idempotent: false,
    });

    return this.toSendResult(entries, recipients, raw);
  }

  /**
   * Enforce Kavenegar's documented token rules locally.
   *
   * These produce errors 431/422 server-side, but failing here gives a message that names
   * the offending slot and rule, which the API response does not.
   */
  private assertTokenValue(slot: string, value: string): void {
    if (value.length > MAX_TOKEN_LENGTH) {
      throw new SMSPatternError(
        `Kavenegar token "${slot}" exceeds ${MAX_TOKEN_LENGTH} characters (${value.length}).`,
        { provider: this.meta.id, code: 431 },
      );
    }
    const spaces = (value.match(/ /g) ?? []).length;
    const limit = TOKEN_SPACE_LIMITS[slot] ?? 0;
    if (spaces > limit) {
      throw new SMSPatternError(
        `Kavenegar token "${slot}" allows ${limit} space(s) but the value contains ${spaces}. ` +
          (limit === 0 ? 'Use token10 (5 spaces) or token20 (8 spaces) for values with spaces.' : ''),
        { provider: this.meta.id, code: 431 },
      );
    }
    if (/[\n\r_]/.test(value)) {
      throw new SMSPatternError(
        `Kavenegar token "${slot}" must not contain newlines or underscores (documented error 431).`,
        { provider: this.meta.id, code: 431 },
      );
    }
  }

  /** Text-to-speech voice call. */
  override async sendVoice(options: {
    to: string | readonly string[];
    message: string;
    scheduleAt?: Date | string;
  }): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    const params: Record<string, unknown> = {
      receptor: recipients.join(','),
      message: options.message,
    };
    if (options.scheduleAt) {
      assertFuture(options.scheduleAt);
      params['date'] = toUnixSeconds(options.scheduleAt);
    }

    const { entries, raw } = await this.callFull<KavenegarMessage[]>('call', 'maketts', params, {
      idempotent: false,
    });
    return this.toSendResult(entries, recipients, raw);
  }

  override async cancelScheduled(id: string): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call('sms', 'cancel', { messageid: id }, { idempotent: false });
    return { success: true, raw };
  }

  private toSendResult(
    entries: KavenegarMessage[] | null,
    recipients: string[],
    raw: unknown,
    forcedStatus?: SendResult['status'],
  ): SendResult {
    const list = Array.isArray(entries) ? entries : [];
    const first = list[0];

    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: list.length === 1 ? (first?.messageid ?? null) : null,
      batchId: first?.messageid ?? null,
      recipients,
      status: forcedStatus ?? mapStatus(first?.status),
      cost: list.reduce((sum, item) => sum + (item.cost ?? 0), 0) || null,
      currency: 'IRR',
      parts: list.map((item) => ({
        recipient: String(item.receptor ?? ''),
        messageId: item.messageid === undefined ? null : String(item.messageid),
        status: mapStatus(item.status),
        cost: item.cost ?? null,
        nativeStatus: item.status ?? null,
      })),
    });
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const results = await this.getStatuses([messageId]);
    const first = results[0];
    if (!first) {
      throw new SMSError(`Kavenegar returned no status for message ${messageId}.`, {
        provider: this.meta.id,
        code: 100,
      });
    }
    return first;
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    if (messageIds.length > MAX_IDS_PER_STATUS_CALL) {
      throw new SMSValidationError(
        `Kavenegar accepts at most ${MAX_IDS_PER_STATUS_CALL} message ids per status call.`,
        { provider: this.meta.id, code: 414 },
      );
    }

    const { entries, raw } = await this.callFull<
      Array<{ messageid: number; status: number; statustext: string }>
    >('sms', 'status', { messageid: messageIds.join(',') }, { httpMethod: 'GET', idempotent: true });

    return (entries ?? []).map((item) =>
      makeStatusResult({
        provider: this.meta.id,
        messageId: item.messageid,
        status: mapStatus(item.status),
        nativeStatus: item.status,
        raw,
      }),
    );
  }

  override async listOutbox(options: ListOptions = {}): Promise<Page<OutboxMessage>> {
    // `latestoutbox` needs no date range, which makes it the safer default: `selectoutbox`
    // rejects windows wider than 1 day and start dates older than 4 days.
    const params: Record<string, unknown> = { pagesize: options.pageSize ?? 200 };
    const { entries, raw } = await this.callFull<KavenegarMessage[]>('sms', 'latestoutbox', params, {
      httpMethod: 'GET',
      idempotent: true,
    });

    return makePage({
      items: (entries ?? []).map((item) =>
        makeOutboxMessage({
          provider: this.meta.id,
          messageId: item.messageid ?? null,
          to: item.receptor ?? null,
          from: item.sender ?? null,
          text: item.message ?? null,
          status: mapStatus(item.status),
          cost: item.cost,
          sentAt: parseProviderDate(item.date),
          raw: item,
        }),
      ),
      pageSize: options.pageSize ?? 200,
      raw,
    });
  }

  override async getMessage(messageId: string): Promise<OutboxMessage> {
    const { entries, raw } = await this.callFull<KavenegarMessage[]>(
      'sms',
      'select',
      { messageid: messageId },
      { httpMethod: 'GET', idempotent: true },
    );
    const item = (entries ?? [])[0] ?? {};
    return makeOutboxMessage({
      provider: this.meta.id,
      messageId: item.messageid ?? messageId,
      to: item.receptor ?? null,
      from: item.sender ?? null,
      text: item.message ?? null,
      status: mapStatus(item.status),
      cost: item.cost,
      sentAt: parseProviderDate(item.date),
      raw,
    });
  }

  /**
   * Inbox.
   *
   * Uses `inboxpaged` rather than `receive`: `receive` **marks the messages read**, which
   * makes it destructive and easy to lose data with. Pass `providerOptions.destructive`
   * to opt into the old behaviour.
   */
  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const linenumber = (options.providerOptions?.['linenumber'] ?? this.defaultSender) as string | undefined;
    if (!linenumber) {
      throw new SMSValidationError(
        'Kavenegar inbox requires a line number. Pass `providerOptions.linenumber` or set `sender`.',
        { provider: this.meta.id, code: 406 },
      );
    }

    const isread = options.providerOptions?.['isread'] ?? 0;
    const destructive = options.providerOptions?.['destructive'] === true;

    const params: Record<string, unknown> = { linenumber, isread };
    if (!destructive) {
      params['pagenumber'] = options.page ?? 1;
      if (options.from) params['startdate'] = toUnixSeconds(options.from);
      if (options.to) params['enddate'] = toUnixSeconds(options.to);
    }

    const { entries, metadata, raw } = await this.callFull<
      Array<{ messageid: number; message: string; sender: string; receptor: string; date: number }>
    >('sms', destructive ? 'receive' : 'inboxpaged', params, { httpMethod: 'GET', idempotent: !destructive });

    return makePage({
      items: (entries ?? []).map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          messageId: item.messageid,
          from: item.sender,
          to: item.receptor,
          text: item.message,
          receivedAt: parseProviderDate(item.date),
          raw: item,
        }),
      ),
      page: metadata?.['currentpage'],
      pageSize: metadata?.['pagesize'],
      total: metadata?.['totalcount'],
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const { entries, raw } = await this.callFull<{ remaincredit: number; expiredate: number; type: string }>(
      'account',
      'info',
      {},
      { httpMethod: 'GET', idempotent: true },
    );
    return makeBalanceResult({
      provider: this.meta.id,
      amount: entries?.remaincredit,
      currency: 'IRR',
      raw,
    });
  }

  override async getAccountInfo(): Promise<AccountInfo> {
    const { entries, raw } = await this.callFull<{ remaincredit: number; expiredate: number; type: string }>(
      'account',
      'info',
      {},
      { httpMethod: 'GET', idempotent: true },
    );
    return {
      provider: this.meta.id,
      username: null,
      displayName: entries?.type ?? null,
      mobile: null,
      expiresAt: parseProviderDate(entries?.expiredate),
      raw,
    };
  }

  /* ---------------------------------------------------------------- unified: patterns */

  override async listPatterns(options: ListOptions = {}): Promise<Page<PatternInfo>> {
    const { entries, metadata, raw } = await this.callFull<Array<Record<string, unknown>>>(
      'verify',
      'templatelist',
      { page: options.page ?? 1 },
      { httpMethod: 'GET', idempotent: true },
    );

    return makePage({
      items: (entries ?? []).map((item) => this.toPattern(item)),
      page: metadata?.['CurrentPage'],
      pageSize: metadata?.['PageSize'],
      total: metadata?.['TotalCount'],
      raw,
    });
  }

  override async getPattern(code: string): Promise<PatternInfo> {
    const { entries, raw } = await this.callFull<Record<string, unknown>>(
      'verify',
      'gettemplate',
      { id: code },
      { httpMethod: 'GET', idempotent: true },
    );
    return this.toPattern(entries ?? {}, raw);
  }

  override async createPattern(input: {
    body: string;
    description?: string;
    name?: string;
    variables?: readonly string[];
    shared?: boolean;
    sendMethod?: 1 | 2;
    sourceType?: 0 | 1;
  }): Promise<PatternInfo> {
    if (!input.name) {
      throw new SMSValidationError(
        'Kavenegar templates are referenced by name; pass `name` (English, no spaces or underscore).',
        { provider: this.meta.id, code: 406 },
      );
    }
    const { entries, raw } = await this.callFull<Record<string, unknown>>('verify', 'addtemplate', {
      name: input.name,
      sourceType: input.sourceType ?? 0,
      sendMethod: input.sendMethod ?? 1,
      textMessage: input.body,
    });
    return this.toPattern(entries ?? {}, raw);
  }

  override async updatePattern(
    code: string,
    input: { body?: string; name?: string; sendMethod?: 1 | 2; sourceType?: 0 | 1 },
  ): Promise<PatternInfo> {
    const { entries, raw } = await this.callFull<Record<string, unknown>>('verify', 'updatetemplate', {
      templateId: code,
      name: input.name,
      sourceType: input.sourceType ?? 0,
      sendMethod: input.sendMethod ?? 1,
      textMessage: input.body,
    });
    return this.toPattern(entries ?? {}, raw);
  }

  override async deletePattern(code: string): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call('verify', 'deletetemplate', { id: code });
    return { success: true, raw };
  }

  private toPattern(item: Record<string, unknown>, raw: unknown = item): PatternInfo {
    const approval = String(item['approvalStatus'] ?? '').toLowerCase();
    return makePatternInfo({
      provider: this.meta.id,
      code: String(item['name'] ?? item['templateid'] ?? item['id'] ?? ''),
      title: (item['name'] as string | undefined) ?? null,
      body: (item['smsMessage'] ?? item['textmessage']) as string | null,
      status:
        approval === 'approved'
          ? 'active'
          : approval === 'rejected'
            ? 'rejected'
            : approval === 'pendingreview'
              ? 'pending'
              : 'unknown',
      variables: [],
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: blacklist */

  override async isBlacklisted(number: string, line?: string): Promise<boolean> {
    const linenumber = line ?? this.requireSender();
    const entries = await this.call<Array<{ receptor: string; status: string }>>(
      'line',
      'blocked/exists',
      { linenumber, receptor: this.phone(number) },
      { httpMethod: 'GET', idempotent: true },
    );
    return (entries ?? []).some((item) => item.status === 'Active');
  }

  override async listBlacklist(
    line: string,
    options: ListOptions = {},
  ): Promise<Page<{ number: string; raw: unknown }>> {
    const { entries, metadata, raw } = await this.callFull<Array<{ number: string }>>(
      'line',
      'blocked/list',
      {
        linenumber: line,
        pagenumber: options.page ?? 1,
        ...(options.from ? { startdate: toUnixSeconds(options.from) } : {}),
        ...(options.providerOptions ?? {}),
      },
      { httpMethod: 'GET', idempotent: true },
    );

    return makePage({
      items: (entries ?? []).map((item) => ({ number: item.number, raw: item })),
      page: metadata?.['currentpage'],
      pageSize: metadata?.['pagesize'],
      total: metadata?.['totalcount'],
      raw,
    });
  }

  override async addToBlacklist(
    line: string,
    numbers: readonly string[],
  ): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call('line', 'blocked/add', {
      linenumber: line,
      receptor: this.phoneList(numbers).join(','),
    });
    return { success: true, raw };
  }

  override async removeFromBlacklist(
    line: string,
    numbers: readonly string[],
  ): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call(
      'line',
      'blocked/remove',
      { linenumber: line, receptor: this.phoneList(numbers).join(',') },
      { httpMethod: 'DELETE' },
    );
    return { success: true, raw };
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    send: (params: Record<string, unknown>) => this.call('sms', 'send', params),
    sendArray: (params: Record<string, unknown>) => this.call('sms', 'sendarray', params),
    status: (messageid: string) =>
      this.call('sms', 'status', { messageid }, { httpMethod: 'GET', idempotent: true }),
    statusLocalMessageId: (localid: string) =>
      this.call('sms', 'statuslocalmessageid', { localid }, { httpMethod: 'GET', idempotent: true }),
    statusByReceptor: (receptor: string, startdate: number, enddate?: number) =>
      this.call(
        'sms',
        'statusbyreceptor',
        { receptor, startdate, enddate },
        { httpMethod: 'GET', idempotent: true },
      ),
    select: (messageid: string) =>
      this.call('sms', 'select', { messageid }, { httpMethod: 'GET', idempotent: true }),
    selectOutbox: (startdate: number, enddate?: number, sender?: string) =>
      this.call(
        'sms',
        'selectoutbox',
        { startdate, enddate, sender },
        { httpMethod: 'GET', idempotent: true },
      ),
    latestOutbox: (pagesize = 200, sender?: string) =>
      this.call('sms', 'latestoutbox', { pagesize, sender }, { httpMethod: 'GET', idempotent: true }),
    countOutbox: (startdate: number, enddate?: number, status?: number) =>
      this.call(
        'sms',
        'countoutbox',
        { startdate, enddate, status },
        { httpMethod: 'GET', idempotent: true },
      ),
    cancel: (messageid: string) => this.call('sms', 'cancel', { messageid }),
    receive: (linenumber: string, isread: 0 | 1) =>
      this.call('sms', 'receive', { linenumber, isread }, { httpMethod: 'GET' }),
    inboxPaged: (params: Record<string, unknown>) =>
      this.call('sms', 'inboxpaged', params, { httpMethod: 'GET', idempotent: true }),
    countInbox: (params: Record<string, unknown>) =>
      this.call('sms', 'countinbox', params, { httpMethod: 'GET', idempotent: true }),

    verifyLookup: (params: Record<string, unknown>) => this.call('verify', 'lookup', params),
    templateList: (page = 1) =>
      this.call('verify', 'templatelist', { page }, { httpMethod: 'GET', idempotent: true }),
    addTemplate: (params: Record<string, unknown>) => this.call('verify', 'addtemplate', params),
    updateTemplate: (params: Record<string, unknown>) => this.call('verify', 'updatetemplate', params),
    getTemplate: (id: number | string) =>
      this.call('verify', 'gettemplate', { id }, { httpMethod: 'GET', idempotent: true }),
    deleteTemplate: (id: number | string) => this.call('verify', 'deletetemplate', { id }),
    cloneTemplate: (params: Record<string, unknown>) => this.call('verify', 'clonetemplate', params),

    makeTTS: (params: Record<string, unknown>) => this.call('call', 'maketts', params),

    accountInfo: () => this.call('account', 'info', {}, { httpMethod: 'GET', idempotent: true }),
    accountConfig: (params: Record<string, unknown> = {}) => this.call('account', 'config', params),

    blockedList: (params: Record<string, unknown>) =>
      this.call('line', 'blocked/list', params, { httpMethod: 'GET', idempotent: true }),
    blockedAdd: (linenumber: string, receptor: string) =>
      this.call('line', 'blocked/add', { linenumber, receptor }),
    blockedExists: (linenumber: string, receptor: string) =>
      this.call('line', 'blocked/exists', { linenumber, receptor }, { httpMethod: 'GET', idempotent: true }),
    blockedRemove: (linenumber: string, receptor: string) =>
      this.call('line', 'blocked/remove', { linenumber, receptor }, { httpMethod: 'DELETE' }),

    /**
     * Upload a media file for internal-messenger lines.
     *
     * Limits: JPEG/GIF ≤ 10 MB, MP4 ≤ 20 MB and ≤ 60 s. Unused files are deleted after
     * 30 days. Pass a `Blob`/`File` — the field name is `File`, capitalised, as documented.
     */
    mediaUpload: async (file: Blob) => {
      const form = new FormData();
      form.append('File', file);
      const response = await this.http.request<KavenegarEnvelope<unknown>>({
        method: 'POST',
        path: this.path('media', 'upload'),
        body: form,
        bodyKind: 'multipart',
        idempotent: false,
      });
      const status = response.data?.return?.status ?? response.status;
      if (status !== 200 || !response.ok) {
        throw this.toError(
          status,
          response.data?.return?.message,
          this.path('media', 'upload'),
          response.data,
        );
      }
      return response.data?.entries ?? null;
    },
    mediaList: (page = 1, size = 50) =>
      this.call('media', 'list', { page, size }, { httpMethod: 'GET', idempotent: true }),
    mediaGet: (id: string) => this.call('media', 'get', { id }, { httpMethod: 'GET', idempotent: true }),
    mediaDelete: (id: string) => this.call('media', 'delete', { id }, { httpMethod: 'DELETE' }),

    /** Server clock. Callable with API key `0`, so useful for aligning scheduled sends. */
    getDate: () => this.call('utils', 'getdate', {}, { httpMethod: 'GET', idempotent: true }),
  };
}

export default KavenegarProvider;
