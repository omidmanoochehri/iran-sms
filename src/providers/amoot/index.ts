/**
 * AmootSMS adapter.
 *
 * Official documentation: https://hub.amootsoft.com/Payamak/docs/account-status
 * Method inventory: https://portal.amootsms.com/rest (the platform's own action index,
 * which prints every public controller action's signature). Verified 2026-08-16.
 * Research log: docs/providers/amoot.md
 *
 * Notes that shaped this implementation:
 * - Requests are `application/x-www-form-urlencoded`; array parameters are **comma-joined
 *   strings**, not repeated keys.
 * - Errors arrive with **HTTP 200** and a non-`Success` `Status` string. There is no
 *   published status table, so anything that is not `"Success"` is treated as an error and
 *   the raw value is preserved rather than guessed at.
 * - `Status` is a string on most methods, an **integer** on `CalculatePatternMessagePrice`,
 *   and the whole body on the two `SetActive` methods. All three shapes are normalised.
 * - Pattern values are **positional** (`PatternValues` is comma-separated with no names),
 *   so a `variableOrder` is required for multi-variable patterns.
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import {
  SMSAuthenticationError,
  SMSError,
  SMSValidationError,
  type SMSErrorOptions,
} from '../../core/errors.js';
import { assertFuture, parseProviderDate, toTehranDateTime } from '../../core/datetime.js';
import { orderVariables } from '../../core/pattern-registry.js';
import {
  makeBalanceResult,
  makeInboxMessage,
  makeOutboxMessage,
  makePage,
  makeSendResult,
  makeStatusResult,
} from '../../core/normalize.js';
import type {
  AccountInfo,
  BalanceResult,
  Contact,
  ContactGroup,
  BulkSendOptions,
  InboxMessage,
  ListOptions,
  OutboxMessage,
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
import { CATALOG } from '../catalog.js';
import { BASE_URL, KNOWN_STATUS, SEND_NOW } from './constants.js';

const entry = CATALOG.find((item) => item.id === 'amoot')!;

/** Narrow a loosely-typed provider field to the id shape the normalizers accept. */
const asId = (value: unknown): string | number | null =>
  typeof value === 'string' || typeof value === 'number' ? value : null;

interface AmootResponse {
  Status?: string | number;
  ErrorMessage?: string;
  Data?: unknown;
  MessageText?: string;
  SMSPagesCount?: number;
  CampaignID?: number;
  Price?: number;
  ReturnValue?: number;
  RelayMessageDeliveryID?: number;
  RelayRecieveMessageID?: number;
}

export class AmootProvider extends BaseProvider {
  readonly meta: ProviderMeta = {
    id: entry.id,
    name: entry.name,
    apiVersion: entry.apiVersion,
    documentation: entry.documentation,
    phoneFormat: entry.phoneFormat,
    capabilities: entry.capabilities,
    platform: 'amoot',
  };

  protected readonly requiredCredentials: readonly CredentialSpec[] = entry.requiredCredentials;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected defaultBaseUrl(): string {
    return BASE_URL;
  }

  private get token(): string {
    return String(this.credentials['token'] ?? this.credentials['apiKey'] ?? '');
  }

  protected authHeaders(): Record<string, string> {
    // The API reference lists `Token` with location `Header`; the official C# sample sends
    // it as the `Authorization` value with no scheme prefix.
    return this.token ? { Authorization: this.token } : {};
  }

  /* ---------------------------------------------------------------- transport */

  /**
   * Call a method.
   *
   * The token is also mirrored into the body: a few methods (`SendBankWithBackupLine`)
   * document `Token` with location `Body`, and the server accepts it in either place.
   */
  async call<T extends AmootResponse = AmootResponse>(
    method: string,
    params: Record<string, unknown> = {},
    options: { idempotent?: boolean } = {},
  ): Promise<T> {
    const body: Record<string, unknown> = { token: this.token };
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) body[key] = value;
    }

    const response = await this.http.request<T | string>({
      method: 'POST',
      path: `/${method}`,
      body,
      bodyKind: 'form',
      idempotent: options.idempotent ?? false,
    });

    // `RelayMessageDeliverySetActive` and friends return a bare JSON string.
    const data: T =
      typeof response.data === 'string' ? ({ Status: response.data } as T) : ((response.data ?? {}) as T);

    if (!response.ok) {
      throw new SMSError(`AmootSMS request failed with HTTP ${response.status}.`, {
        provider: this.meta.id,
        status: response.status,
        endpoint: `/${method}`,
        raw: response.data,
        retryable: response.status >= 500,
      });
    }

    this.assertSuccess(data, method);
    return data;
  }

  /**
   * AmootSMS publishes no exhaustive status table, so this treats anything that is not
   * `Success` as a failure and passes the raw value through as `error.code` rather than
   * inventing a meaning for it.
   */
  private assertSuccess(body: AmootResponse, method: string): void {
    const status = body.Status;

    // `CalculatePatternMessagePrice` breaks the convention and returns `Status: 1`.
    if (typeof status === 'number') {
      if (status === 1) return;
      throw new SMSError(`AmootSMS ${method} returned status ${status}.`, {
        provider: this.meta.id,
        code: status,
        endpoint: `/${method}`,
        raw: body,
      });
    }

    if (status === undefined || status === 'Success') return;

    const described = KNOWN_STATUS[status] ?? 'Undocumented status returned by AmootSMS';
    const base: SMSErrorOptions = {
      provider: this.meta.id,
      code: status,
      endpoint: `/${method}`,
      // `ErrorMessage` can contain a raw .NET exception; kept in `raw`, out of `message`.
      raw: body,
    };
    const message = `AmootSMS ${method}: ${status} — ${described}`;

    if (status === 'Token_Invalid') throw new SMSAuthenticationError(message, base);
    if (status === 'ServerError') throw new SMSError(message, { ...base, retryable: true });
    if (status.endsWith('_Empty') || status.endsWith('_Invalid')) throw new SMSValidationError(message, base);
    throw new SMSError(message, base);
  }

  /** AmootSMS uses the literal `"0"` for "send now". */
  private sendDateTime(scheduleAt: SendOptions['scheduleAt']): string {
    if (!scheduleAt) return SEND_NOW;
    assertFuture(scheduleAt);
    // No timezone is documented; the platform is Iran-local (LBS windows use local HH:mm).
    return toTehranDateTime(scheduleAt);
  }

  /* ---------------------------------------------------------------- unified: send */

  override async send(options: SendOptions): Promise<SendResult> {
    const mobiles = this.phoneList(options.to);
    if (mobiles.length === 0) {
      throw new SMSValidationError('At least one recipient is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    const body = await this.call('SendSimple', {
      SendDateTime: this.sendDateTime(options.scheduleAt),
      SMSMessageText: options.message,
      LineNumber: this.requireSender(options.from),
      Mobiles: mobiles.join(','),
      ...(options.providerOptions ?? {}),
    });

    return this.toSendResult(body, mobiles, options.scheduleAt ? 'scheduled' : 'queued');
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  override async sendPeerToPeer(
    peers: readonly PeerMessage[],
    options: Omit<SendOptions, 'to' | 'message'> = {},
  ): Promise<SendResult> {
    const input: Array<{ Number: string; MessageText: string }> = [];
    for (const peer of peers) {
      for (const recipient of this.phoneList(peer.to)) {
        input.push({ Number: recipient, MessageText: peer.message });
      }
    }

    if (input.length === 0) {
      throw new SMSValidationError('At least one peer message is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    const body = await this.call('SendPeerToPeer', {
      SendDateTime: this.sendDateTime(options.scheduleAt),
      LineNumber: this.requireSender(options.from),
      Input: JSON.stringify(input),
    });

    return this.toSendResult(
      body,
      input.map((item) => item.Number),
      options.scheduleAt ? 'scheduled' : 'queued',
    );
  }

  /**
   * Pattern send.
   *
   * `PatternValues` is positional and comma-separated — the variable names never reach the
   * wire — so a multi-variable pattern must declare `variableOrder` in the registry.
   */
  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const mobiles = this.phoneList(options.to);
    if (mobiles.length !== 1) {
      throw new SMSValidationError(
        `AmootSMS pattern send accepts exactly one recipient (received ${mobiles.length}).`,
        { provider: this.meta.id, code: 'pattern_single_recipient' },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);
    const patternCodeId = Number(resolved.code);
    if (!Number.isFinite(patternCodeId)) {
      throw new SMSValidationError(`AmootSMS PatternCodeID must be numeric; received "${resolved.code}".`, {
        provider: this.meta.id,
        code: 'invalid_pattern_code',
      });
    }

    const ordered = orderVariables(options.variables ?? {}, resolved.variableOrder, {
      provider: this.meta.id,
      pattern: String(options.pattern),
    });

    // `SendWithPatternOWN` sends the same pattern from a dedicated line.
    const useOwnLine = options.from !== undefined || this.defaultSender !== undefined;

    const body = useOwnLine
      ? await this.call('SendWithPatternOWN', {
          SendDateTime: this.sendDateTime(options.scheduleAt),
          PatternCodeID: patternCodeId,
          PatternValues: ordered.join(','),
          LineNumber: this.requireSender(options.from),
          Mobile: mobiles[0],
          ...(options.providerOptions ?? {}),
        })
      : await this.call('SendWithPattern', {
          Mobile: mobiles[0],
          PatternCodeID: patternCodeId,
          PatternValues: ordered.join(','),
          ...(options.providerOptions ?? {}),
        });

    return this.toSendResult(body, mobiles, 'queued');
  }

  /**
   * Quick OTP — AmootSMS generates the one-time code itself.
   *
   * Returns the generated code in `result.raw.Data.Code`. Requires a pattern containing a
   * `code` variable.
   */
  async sendQuickOtp(options: {
    to: string;
    patternCodeId: number;
    codeLength?: number;
    code?: string;
  }): Promise<SendResult & { code: string | null }> {
    const mobile = this.phone(options.to);
    const length = options.codeLength ?? 5;
    if (length < 4 || length > 8) {
      throw new SMSValidationError(`AmootSMS OTP code length must be between 4 and 8 (received ${length}).`, {
        provider: this.meta.id,
        code: 'invalid_code_length',
      });
    }

    const body = await this.call('SendQuickOTP', {
      Mobile: mobile,
      CodeLength: length,
      OptionalCode: options.code,
      PatternCodeID: options.patternCodeId,
    });

    const result = this.toSendResult(body, [mobile], 'queued');
    const data = body.Data as { Code?: string } | undefined;
    return { ...result, code: data?.Code ?? null };
  }

  private toSendResult(body: AmootResponse, recipients: string[], status: SendResult['status']): SendResult {
    const data = body.Data;
    const items = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    const single = !Array.isArray(data) && data ? (data as Record<string, unknown>) : undefined;

    return makeSendResult({
      provider: this.meta.id,
      raw: body,
      messageId: asId(single?.['MessageID'] ?? (items.length === 1 ? items[0]?.['MessageID'] : null)),
      batchId: body.CampaignID ?? null,
      recipients,
      status,
      cost: body.Price ?? null,
      currency: 'IRR',
      parts: items.length
        ? items.map((item) => ({
            recipient: String(item['Mobile'] ?? ''),
            messageId: item['MessageID'] === undefined ? null : String(item['MessageID']),
            status: item['Status'] === 'Success' ? 'queued' : 'failed',
            cost: null,
            nativeStatus: (item['Status'] as string | undefined) ?? null,
          }))
        : undefined,
    });
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const body = await this.call('GetDelivery', { MessageID: Number(messageId) }, { idempotent: true });
    const data = body.Data as Record<string, unknown> | undefined;
    const native = data?.['Status'] ?? body.Status ?? null;

    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      // No delivery-code table is published; the provider's own value is passed through.
      status: 'unknown',
      nativeStatus: native as string | number | null,
      raw: body,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    const body = await this.call(
      'GetDeliveries',
      { ListMessageID: messageIds.join(',') },
      { idempotent: true },
    );
    const items = Array.isArray(body.Data) ? (body.Data as Array<Record<string, unknown>>) : [];

    return messageIds.map((id, index) =>
      makeStatusResult({
        provider: this.meta.id,
        messageId: id,
        status: 'unknown',
        nativeStatus: (items[index]?.['Status'] as string | undefined) ?? null,
        raw: body,
      }),
    );
  }

  /** Sent messages over a date range (`GetMessages`). */
  override async listOutbox(options: ListOptions = {}): Promise<Page<OutboxMessage>> {
    if (!options.from) {
      throw new SMSValidationError(
        'AmootSMS GetMessages requires a date range. Pass `from` (and optionally `to`).',
        { provider: this.meta.id, code: 'date_range_required' },
      );
    }

    const body = await this.call(
      'GetMessages',
      {
        FromDateTime: toTehranDateTime(options.from),
        ToDateTime: toTehranDateTime(options.to ?? new Date()),
      },
      { idempotent: true },
    );

    const items = Array.isArray(body.Data) ? (body.Data as Array<Record<string, unknown>>) : [];
    return makePage({
      items: items.map((item) =>
        makeOutboxMessage({
          provider: this.meta.id,
          messageId: asId(item['MessageID']),
          batchId: asId(item['CampaignID']),
          to: (item['Mobile'] as string | undefined) ?? null,
          from: (item['LineNumber'] as string | undefined) ?? null,
          text: (item['MessageText'] as string | undefined) ?? null,
          // AmootSMS publishes no delivery-code table; the native value stays in `raw`.
          status: 'unknown',
          cost: item['Price'],
          sentAt: parseProviderDate(item['SendDateTime'] ?? item['DateTime']),
          raw: item,
        }),
      ),
      raw: body,
    });
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const body = options.from
      ? await this.call(
          'RecieveMessages',
          {
            FromDateTime: toTehranDateTime(options.from),
            ToDateTime: options.to ? toTehranDateTime(options.to) : undefined,
            LineNumber: options.providerOptions?.['LineNumber'],
          },
          { idempotent: true },
        )
      : await this.call('RecieveNewMessages', { Count: options.pageSize ?? 100 }, { idempotent: true });

    const items = Array.isArray(body.Data) ? (body.Data as Array<Record<string, unknown>>) : [];
    return makePage({
      items: items.map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          messageId: (item['MessageID'] as number | undefined) ?? null,
          from: String(item['Mobile'] ?? item['Number'] ?? ''),
          to: (item['LineNumber'] as string | undefined) ?? null,
          text: String(item['MessageText'] ?? ''),
          receivedAt: parseProviderDate(item['ReceiveDateTime'] ?? item['DateTime']),
          raw: item,
        }),
      ),
      pageSize: options.pageSize ?? null,
      raw: body,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const body = await this.call('AccountStatus', {}, { idempotent: true });
    const status = body as unknown as { RemaindCredit?: number };
    return makeBalanceResult({
      provider: this.meta.id,
      amount: status.RemaindCredit,
      currency: 'IRR',
      raw: body,
    });
  }

  override async getAccountInfo(): Promise<AccountInfo> {
    const body = await this.call('AccountStatus', {}, { idempotent: true });
    const status = body as unknown as { AccountName?: string };
    return {
      provider: this.meta.id,
      username: status.AccountName ?? null,
      displayName: status.AccountName ?? null,
      mobile: null,
      expiresAt: null,
      raw: body,
    };
  }

  override async listSenders(): Promise<Sender[]> {
    const body = await this.call('AccountStatus', {}, { idempotent: true });
    const status = body as unknown as { ListLineNumbers?: Array<string | Record<string, unknown>> };
    return (status.ListLineNumbers ?? []).map((line) => ({
      provider: this.meta.id,
      number: typeof line === 'string' ? line : String(line['LineNumber'] ?? line['Number'] ?? ''),
      dedicated: null,
      raw: line,
    }));
  }

  override async estimatePrice(options: {
    to: string | readonly string[];
    message: string;
    from?: string;
  }): Promise<PriceEstimate> {
    const body = await this.call(
      'CalculateMessagePrice',
      {
        SMSMessageText: options.message,
        LineNumber: this.requireSender(options.from),
        Mobiles: this.phoneList(options.to).join(','),
      },
      { idempotent: true },
    );

    return {
      provider: this.meta.id,
      total: body.ReturnValue ?? body.Price ?? null,
      currency: 'IRR',
      parts: body.SMSPagesCount ?? null,
      raw: body,
    };
  }

  /* ---------------------------------------------------------------- unified: blacklist */

  override async isBlacklisted(number: string, line?: string): Promise<boolean> {
    const body = await this.call(
      'IsBlackList_ByCancelation',
      { Mobile: this.phone(number), LineNumber: line ?? this.requireSender() },
      { idempotent: true },
    );
    const data = body.Data;
    return data === true || String(data).toLowerCase() === 'true';
  }

  /* ---------------------------------------------------------------- unified: contacts */

  override async listContacts(options: ListOptions = {}): Promise<Page<Contact>> {
    const body = await this.call(
      'ContactList',
      { ContactGroupID: Number(options.providerOptions?.['ContactGroupID'] ?? 0) },
      { idempotent: true },
    );
    const items = Array.isArray(body.Data) ? (body.Data as Array<Record<string, unknown>>) : [];

    return makePage({
      items: items.map((item) => ({
        provider: this.meta.id,
        id: item['ContactID'] === undefined ? null : String(item['ContactID']),
        number: String(item['Mobile'] ?? ''),
        name: [item['FName'], item['LName']].filter(Boolean).join(' ') || null,
        email: (item['Email'] as string | undefined) ?? null,
        groupId: item['ContactGroupID'] === undefined ? null : String(item['ContactGroupID']),
        raw: item,
      })),
      raw: body,
    });
  }

  override async createContact(input: {
    number: string;
    name?: string;
    email?: string;
    groupId?: string;
  }): Promise<Contact> {
    const [first = '', ...rest] = (input.name ?? '').split(' ');
    const body = await this.call('ContactCreate', {
      // Grouping is by label; the docs mark ContactGroupID as disabled and require 0.
      ContactGroupID: 0,
      Active: true,
      Mobile: this.phone(input.number),
      FName: first,
      LName: rest.join(' '),
      Email: input.email,
      Labels: input.groupId,
    });

    return {
      provider: this.meta.id,
      id: null,
      number: this.phone(input.number),
      name: input.name ?? null,
      email: input.email ?? null,
      groupId: input.groupId ?? null,
      raw: body,
    };
  }

  override async deleteContact(id: string): Promise<{ success: boolean; raw: unknown }> {
    const body = await this.call('ContactDelete', { ContactID: Number(id) });
    return { success: true, raw: body };
  }

  override async listContactGroups(): Promise<Page<ContactGroup>> {
    const body = await this.call('ContactGroupList', {}, { idempotent: true });
    const items = Array.isArray(body.Data) ? (body.Data as Array<Record<string, unknown>>) : [];

    return makePage({
      items: items.map((item) => ({
        provider: this.meta.id,
        id: String(item['ContactGroupID'] ?? item['Label'] ?? ''),
        title: (item['Title'] as string | undefined) ?? (item['Label'] as string | undefined) ?? null,
        count: typeof item['Count'] === 'number' ? item['Count'] : null,
        raw: item,
      })),
      raw: body,
    });
  }

  /* ---------------------------------------------------------------- unified: webhooks */

  override async listWebhooks(): Promise<
    Array<{ id: string; url: string; active: boolean; kind: string; raw: unknown }>
  > {
    const [delivery, inbound] = await Promise.all([
      this.call('RelayMessageDeliveryList', {}, { idempotent: true }),
      this.call('RelayRecieveMessageList', {}, { idempotent: true }),
    ]);

    const map = (body: AmootResponse, kind: string) => {
      const items = Array.isArray(body.Data) ? (body.Data as Array<Record<string, unknown>>) : [];
      return items.map((item) => ({
        id: String(item['ID'] ?? item['RelayMessageDeliveryID'] ?? item['RelayRecieveMessageID'] ?? ''),
        url: String(item['URLAddress'] ?? ''),
        active: item['Active'] === true,
        kind,
        raw: item,
      }));
    };

    return [...map(delivery, 'delivery'), ...map(inbound, 'inbound')];
  }

  override async createWebhook(input: {
    url: string;
    kind: 'delivery' | 'inbound';
  }): Promise<{ id: string; raw: unknown }> {
    const body =
      input.kind === 'delivery'
        ? await this.call('RelayMessageDeliveryCreate', { URLAddress: input.url })
        : await this.call('RelayRecieveMessageCreate', { URLAddress: input.url });

    const id = body.RelayMessageDeliveryID ?? body.RelayRecieveMessageID;
    return { id: id === undefined ? '' : String(id), raw: body };
  }

  override async setWebhookActive(
    id: string,
    active: boolean,
    kind: 'delivery' | 'inbound',
  ): Promise<{ success: boolean; raw: unknown }> {
    const body =
      kind === 'delivery'
        ? await this.call('RelayMessageDeliverySetActive', {
            RelayMessageDeliveryID: Number(id),
            Active: active,
          })
        : await this.call('RelayRecieveMessageSetActive', {
            RelayRecieveMessageID: Number(id),
            Active: active,
          });
    return { success: true, raw: body };
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    accountStatus: () => this.call('AccountStatus', {}, { idempotent: true }),
    signUp: (params: Record<string, unknown>) => this.call('SignUp', params),
    statistics: (fromDate: string, toDate: string) =>
      this.call('Statistics', { FromDate: fromDate, ToDate: toDate }, { idempotent: true }),

    sendSimple: (params: Record<string, unknown>) => this.call('SendSimple', params),
    sendWithBackupLine: (params: Record<string, unknown>) => this.call('SendWithBackupLine', params),
    sendQuickOTP: (params: Record<string, unknown>) => this.call('SendQuickOTP', params),
    sendOTP: (params: Record<string, unknown>) => this.call('SendOTP', params),
    sendWithPattern: (params: Record<string, unknown>) => this.call('SendWithPattern', params),
    sendWithPatternOWN: (params: Record<string, unknown>) => this.call('SendWithPatternOWN', params),
    sendBank: (params: Record<string, unknown>) => this.call('SendBank', params),
    sendBankWithBackupLine: (params: Record<string, unknown>) => this.call('SendBankWithBackupLine', params),
    sendPeerToPeer: (params: Record<string, unknown>) => this.call('SendPeerToPeer', params),
    getBankTree: (parentId: number) => this.call('GetBankTree', { ParentID: parentId }, { idempotent: true }),
    calculateMessagePrice: (params: Record<string, unknown>) =>
      this.call('CalculateMessagePrice', params, { idempotent: true }),
    calculatePatternMessagePrice: (params: Record<string, unknown>) =>
      this.call('CalculatePatternMessagePrice', params, { idempotent: true }),

    getDelivery: (messageId: number) =>
      this.call('GetDelivery', { MessageID: messageId }, { idempotent: true }),
    getDeliveries: (listMessageId: string) =>
      this.call('GetDeliveries', { ListMessageID: listMessageId }, { idempotent: true }),
    getDeliveriesByCampaignID: (campaignId: number) =>
      this.call('GetDeliveriesByCampaignID', { CampaignID: campaignId }, { idempotent: true }),
    getMessage: (messageId: number) =>
      this.call('GetMessage', { MessageID: messageId }, { idempotent: true }),
    getMessages: (fromDateTime: string, toDateTime: string) =>
      this.call('GetMessages', { FromDateTime: fromDateTime, ToDateTime: toDateTime }, { idempotent: true }),
    recieveNewMessages: (count: number) =>
      this.call('RecieveNewMessages', { Count: count }, { idempotent: true }),
    recieveMessages: (params: Record<string, unknown>) =>
      this.call('RecieveMessages', params, { idempotent: true }),

    patternCodeList: () => this.call('PatternCodeList', {}, { idempotent: true }),
    patternCodeCreate: (params: Record<string, unknown>) => this.call('PatternCodeCreate', params),

    contactGet: (contactId: number) =>
      this.call('ContactGet', { ContactID: contactId }, { idempotent: true }),
    contactList: (contactGroupId: number) =>
      this.call('ContactList', { ContactGroupID: contactGroupId }, { idempotent: true }),
    contactListUpdates: (contactGroupId: number) =>
      this.call('ContactListUpdates', { ContactGroupID: contactGroupId }, { idempotent: true }),
    contactGroupList: () => this.call('ContactGroupList', {}, { idempotent: true }),
    contactSearch: (params: Record<string, unknown>) =>
      this.call('ContactSearch', params, { idempotent: true }),
    contactCreate: (params: Record<string, unknown>) => this.call('ContactCreate', params),
    contactEdit: (params: Record<string, unknown>) => this.call('ContactEdit', params),
    contactDelete: (contactId: number) => this.call('ContactDelete', { ContactID: contactId }),
    contactChangeLabel: (fromLabel: string, toLabel: string) =>
      this.call('ContactChangeLabel', { FromLabel: fromLabel, ToLabel: toLabel }),
    contactAutoSendCreate: (params: Record<string, unknown>) => this.call('ContactAutoSendCreate', params),
    contactAutoSendEdit: (params: Record<string, unknown>) => this.call('ContactAutoSendEdit', params),

    isBlackListByCancelation: (mobile: string, lineNumber: string) =>
      this.call(
        'IsBlackList_ByCancelation',
        { Mobile: mobile, LineNumber: lineNumber },
        { idempotent: true },
      ),

    relayMessageDeliveryCreate: (url: string) => this.call('RelayMessageDeliveryCreate', { URLAddress: url }),
    relayMessageDeliveryList: () => this.call('RelayMessageDeliveryList', {}, { idempotent: true }),
    relayMessageDeliverySetActive: (id: number, active: boolean) =>
      this.call('RelayMessageDeliverySetActive', { RelayMessageDeliveryID: id, Active: active }),
    relayRecieveMessageCreate: (url: string) => this.call('RelayRecieveMessageCreate', { URLAddress: url }),
    relayRecieveMessageList: () => this.call('RelayRecieveMessageList', {}, { idempotent: true }),
    relayRecieveMessageSetActive: (id: number, active: boolean) =>
      this.call('RelayRecieveMessageSetActive', { RelayRecieveMessageID: id, Active: active }),

    lbsAreaCreate: (title: string, coordinates: string) =>
      this.call('LBSAreaCreate', { Title: title, Coordinates: coordinates }),
    lbsRequestCreate: (params: Record<string, unknown>) => this.call('LBSRequestCreate', params),
    lbsGetDeviceTypes: () => this.call('LBSGetDeviceTypes', {}, { idempotent: true }),
    lbsGetDeviceBrands: () => this.call('LBSGetDeviceBrands', {}, { idempotent: true }),
    lbsGetProvinces: () => this.call('LBSGetProvinces', {}, { idempotent: true }),
    btsRequestCreate: (params: Record<string, unknown>) => this.call('BTSRequestCreate', params),
    btsRequestCheckReady: (btsRequestId: number) =>
      this.call('BTSRequestCheckReady', { BTSRequestID: btsRequestId }, { idempotent: true }),
    btsRequestSend: (params: Record<string, unknown>) => this.call('BTSRequestSend', params),
  };
}

export default AmootProvider;
