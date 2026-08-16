/**
 * IPPanel — Edge API adapter.
 *
 * Official documentation: https://docs.ippanel.com/
 * Research log: docs/providers/ippanel.md (verified 2026-08-16)
 *
 * Notes that shaped this implementation:
 * - Auth is `Authorization: <key>` with **no** `Bearer` prefix (docs' own curl samples).
 * - All send methods POST to `/api/send` and are discriminated by `sending_type`.
 * - Every send returns `data.message_outbox_ids`, an **array**, even for one recipient.
 * - `send_time` is `YYYY-MM-DD HH:mm:ss` in **UTC** — explicitly stated in the docs.
 * - Pattern send accepts exactly **one** recipient.
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import { SMSValidationError } from '../../core/errors.js';
import { assertFuture, parseProviderDate, toUtcDateTime } from '../../core/datetime.js';
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
  PriceEstimate,
  ProviderMeta,
  SendOptions,
  SendResult,
  Sender,
  StatusResult,
} from '../../core/types.js';
import { CATALOG } from '../catalog.js';
import { ENDPOINTS, EDGE_BASE_URL, OUTBOX_STATE, RECIPIENT_STATUS, SENDING_TYPES } from './constants.js';
import { unwrap, type EdgeMeta } from './errors.js';

const entry = CATALOG.find((item) => item.id === 'ippanel')!;

const mapOutboxState = statusMapper(OUTBOX_STATE);
const mapRecipientStatus = statusMapper(RECIPIENT_STATUS);

interface SendResponse {
  message_outbox_ids?: Array<string | number>;
}

export class IPPanelProvider extends BaseProvider {
  readonly meta: ProviderMeta = {
    id: entry.id,
    name: entry.name,
    apiVersion: entry.apiVersion,
    documentation: entry.documentation,
    phoneFormat: entry.phoneFormat,
    capabilities: entry.capabilities,
    platform: 'ippanel-edge',
  };

  protected readonly requiredCredentials: readonly CredentialSpec[] = entry.requiredCredentials;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected defaultBaseUrl(): string {
    return EDGE_BASE_URL;
  }

  protected authHeaders(): Record<string, string> {
    const key = (this.credentials['apiKey'] ?? this.credentials['token']) as string | undefined;
    // No `Bearer` prefix: the Edge docs send the raw key.
    return key ? { Authorization: key } : {};
  }

  /* ---------------------------------------------------------------- transport */

  /** Raw Edge call returning the unwrapped `data`, for native use. */
  async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: {
      query?: Record<string, unknown>;
      body?: unknown;
      idempotent?: boolean;
      multipart?: boolean;
    } = {},
  ): Promise<T> {
    const response = await this.http.request<unknown>({
      method,
      path,
      query: options.query,
      body: options.body,
      bodyKind: options.body === undefined ? 'none' : options.multipart ? 'multipart' : 'json',
      idempotent: options.idempotent ?? method === 'GET',
    });
    const { data } = unwrap<T>(response, { endpoint: path, provider: this.meta.id });
    return data;
  }

  /** Raw Edge call returning both `data` and `meta` (needed for pagination). */
  private async callWithMeta<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; idempotent?: boolean } = {},
  ): Promise<{ data: T; meta: EdgeMeta | undefined; raw: unknown }> {
    const response = await this.http.request<unknown>({
      method,
      path,
      query: options.query,
      body: options.body,
      bodyKind: options.body === undefined ? 'none' : 'json',
      idempotent: options.idempotent ?? method === 'GET',
    });
    const { data, meta } = unwrap<T>(response, { endpoint: path, provider: this.meta.id });
    return { data, meta, raw: response.data };
  }

  private scheduleField(scheduleAt: SendOptions['scheduleAt']): Record<string, string> {
    if (!scheduleAt) return {};
    assertFuture(scheduleAt);
    // Edge documents UTC explicitly.
    return { send_time: toUtcDateTime(scheduleAt) };
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

    const body = {
      sending_type: SENDING_TYPES.webservice,
      from_number: this.requireSender(options.from),
      message: options.message,
      params: { recipients },
      ...this.scheduleField(options.scheduleAt),
      ...(options.providerOptions ?? {}),
    };

    const response = await this.http.request<unknown>({
      method: 'POST',
      path: ENDPOINTS.send,
      body,
      bodyKind: 'json',
      // Never retried: IPPanel has no idempotency key, so a replay could duplicate delivery.
      idempotent: false,
    });
    const { data } = unwrap<SendResponse>(response, { endpoint: ENDPOINTS.send, provider: this.meta.id });
    const ids = data?.message_outbox_ids ?? [];

    return makeSendResult({
      provider: this.meta.id,
      raw: response.data,
      // Edge returns one outbox id per *bulk*, not per recipient, so it is only a
      // meaningful per-message id when the bulk had a single recipient.
      messageId: recipients.length === 1 ? (ids[0] ?? null) : null,
      batchId: ids[0] ?? null,
      recipients,
      status: options.scheduleAt ? 'scheduled' : 'queued',
      currency: 'IRR',
    });
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

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

    const params = peers.map((peer) => ({
      recipients: this.phoneList(peer.to),
      message: peer.message,
    }));

    const body = {
      sending_type: SENDING_TYPES.peerToPeer,
      from_number: this.requireSender(options.from),
      params,
      ...this.scheduleField(options.scheduleAt),
      ...(options.providerOptions ?? {}),
    };

    const response = await this.http.request<unknown>({
      method: 'POST',
      path: ENDPOINTS.send,
      body,
      bodyKind: 'json',
      idempotent: false,
    });
    const { data } = unwrap<SendResponse>(response, { endpoint: ENDPOINTS.send, provider: this.meta.id });
    const ids = (data?.message_outbox_ids ?? []).map(String);

    return makeSendResult({
      provider: this.meta.id,
      raw: response.data,
      messageId: null,
      batchId: ids[0] ?? null,
      recipients: params.flatMap((param) => param.recipients),
      status: options.scheduleAt ? 'scheduled' : 'queued',
      currency: 'IRR',
    });
  }

  override async sendPattern(options: PatternSendOptions): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length !== 1) {
      throw new SMSValidationError(
        `IPPanel pattern send accepts exactly one recipient (received ${recipients.length}). ` +
          'Send them one at a time.',
        { provider: this.meta.id, code: 'pattern_single_recipient' },
      );
    }

    const resolved = this.patterns.resolve(options.pattern, this.meta.id);

    const body: Record<string, unknown> = {
      sending_type: SENDING_TYPES.pattern,
      from_number: this.requireSender(options.from),
      code: resolved.code,
      recipients,
      // Edge takes an object keyed by variable name, with no `%` delimiters.
      params: options.variables ?? {},
      ...(options.providerOptions ?? {}),
    };

    const response = await this.http.request<unknown>({
      method: 'POST',
      path: ENDPOINTS.send,
      body,
      bodyKind: 'json',
      idempotent: false,
    });
    const { data } = unwrap<SendResponse>(response, { endpoint: ENDPOINTS.send, provider: this.meta.id });
    const ids = data?.message_outbox_ids ?? [];

    return makeSendResult({
      provider: this.meta.id,
      raw: response.data,
      messageId: ids[0] ?? null,
      batchId: ids[0] ?? null,
      recipients,
      status: 'queued',
      currency: 'IRR',
    });
  }

  /** Voice one-time password. `message` is the digit string to read out. */
  override async sendVoice(options: {
    to: string | readonly string[];
    message: string;
  }): Promise<SendResult> {
    const recipients = this.phoneList(options.to);
    if (recipients.length !== 1) {
      throw new SMSValidationError(
        `IPPanel VOTP accepts exactly one recipient (received ${recipients.length}).`,
        { provider: this.meta.id, code: 'votp_single_recipient' },
      );
    }

    const response = await this.http.request<unknown>({
      method: 'POST',
      path: ENDPOINTS.send,
      body: { sending_type: SENDING_TYPES.votp, message: options.message, params: { recipients } },
      bodyKind: 'json',
      idempotent: false,
    });
    const { data } = unwrap<SendResponse>(response, { endpoint: ENDPOINTS.send, provider: this.meta.id });
    const ids = data?.message_outbox_ids ?? [];

    return makeSendResult({
      provider: this.meta.id,
      raw: response.data,
      messageId: ids[0] ?? null,
      batchId: ids[0] ?? null,
      recipients,
      status: 'queued',
      currency: 'IRR',
    });
  }

  override async cancelScheduled(id: string): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call('POST', ENDPOINTS.cancel, {
      body: { message_outbox_id: Number(id) },
      idempotent: false,
    });
    return { success: true, raw };
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>('GET', ENDPOINTS.outboxByBulk, {
      query: { messages_outbox_id: messageId },
    });

    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      status: mapOutboxState(data?.['state_id']),
      nativeStatus: (data?.['state_id'] as number | undefined) ?? null,
      recipient: null,
      deliveredAt: parseProviderDate(data?.['time_send']),
      raw,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    // Edge has no batch status endpoint; the per-bulk report is the documented route.
    return Promise.all(messageIds.map((id) => this.getStatus(id)));
  }

  /** Per-recipient delivery detail for one bulk. */
  async getRecipients(
    bulkId: string,
    options: ListOptions = {},
  ): Promise<Page<{ recipient: string; status: string; raw: unknown }>> {
    const { data, meta, raw } = await this.callWithMeta<Array<Record<string, unknown>>>(
      'GET',
      ENDPOINTS.bulkRecipients,
      { query: { bulk_id: bulkId, page: options.page ?? 1, per_page: options.pageSize ?? 10 } },
    );

    return makePage({
      items: (data ?? []).map((item) => ({
        recipient: String(item['recipient'] ?? ''),
        status: mapRecipientStatus(item['message_status']),
        raw: item,
      })),
      page: meta?.current_page,
      pageSize: meta?.per_page,
      total: meta?.total,
      raw,
    });
  }

  override async listOutbox(options: ListOptions = {}): Promise<Page<OutboxMessage>> {
    const filters: Record<string, unknown> = { ...(options.providerOptions ?? {}) };
    if (options.from)
      filters['create_from_date'] = String(Math.floor(new Date(options.from).getTime() / 1000));
    if (options.to) filters['create_to_date'] = String(Math.floor(new Date(options.to).getTime() / 1000));

    const { data, meta, raw } = await this.callWithMeta<Array<Record<string, unknown>>>(
      'POST',
      ENDPOINTS.outboxList,
      {
        body: { page: options.page ?? 1, limit: options.pageSize ?? 10, filters },
        idempotent: true,
      },
    );

    return makePage({
      items: (data ?? []).map((item) => this.toOutbox(item)),
      page: meta?.current_page,
      pageSize: meta?.per_page,
      total: meta?.total,
      raw,
    });
  }

  override async getMessage(messageId: string): Promise<OutboxMessage> {
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>('GET', ENDPOINTS.outboxByBulk, {
      query: { messages_outbox_id: messageId },
    });
    return this.toOutbox(data ?? {}, raw);
  }

  private toOutbox(item: Record<string, unknown>, raw: unknown = item): OutboxMessage {
    return makeOutboxMessage({
      provider: this.meta.id,
      messageId: (item['messages_outbox_id'] as string | undefined) ?? null,
      batchId: (item['messages_outbox_id'] as string | undefined) ?? null,
      from: (item['number'] as string | undefined) ?? null,
      text: (item['message'] as string | undefined) ?? null,
      status: mapOutboxState(item['state_id']),
      cost: item['cost'],
      sentAt: parseProviderDate(item['time_send']),
      raw,
    });
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const filters: Record<string, unknown> = { ...(options.providerOptions ?? {}) };

    const { data, meta, raw } = await this.callWithMeta<Array<Record<string, unknown>>>(
      'POST',
      ENDPOINTS.inbox,
      {
        body: { page: options.page ?? 1, per_page: options.pageSize ?? 10, filters },
        idempotent: true,
      },
    );

    return makePage({
      items: (data ?? []).map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          messageId: (item['messages_inbox_id'] as number | undefined) ?? null,
          from: String(item['from'] ?? ''),
          to: (item['number'] as string | undefined) ?? null,
          text: String(item['message'] ?? ''),
          receivedAt: parseProviderDate(item['time']),
          raw: item,
        }),
      ),
      page: meta?.current_page,
      pageSize: meta?.per_page,
      total: meta?.total,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>('GET', ENDPOINTS.credit);
    return makeBalanceResult({
      provider: this.meta.id,
      amount: data?.['credit'],
      currency: 'IRR',
      raw,
    });
  }

  override async getAccountInfo(): Promise<AccountInfo> {
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>('POST', ENDPOINTS.checkToken, {
      body: {},
      idempotent: true,
    });
    return {
      provider: this.meta.id,
      username: (data?.['user_name'] as string | undefined) ?? null,
      displayName: (data?.['name'] as string | undefined) ?? null,
      mobile: null,
      expiresAt: null,
      raw,
    };
  }

  override async listSenders(): Promise<Sender[]> {
    const { data } = await this.callWithMeta<Array<Record<string, unknown>>>('GET', ENDPOINTS.numbersList, {
      query: { page: 1, per_page: 100 },
    });
    return (data ?? []).map((item) => ({
      provider: this.meta.id,
      number: String(item['number'] ?? ''),
      dedicated: item['gets'] === 1 || item['gets'] === '1' ? true : null,
      raw: item,
    }));
  }

  override async estimatePrice(options: {
    to: string | readonly string[];
    message: string;
    from?: string;
  }): Promise<PriceEstimate> {
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>('POST', ENDPOINTS.calculatePrice, {
      body: { number: this.requireSender(options.from), message: options.message },
      idempotent: true,
    });

    // The endpoint prices per operator; report the higher of the two so an estimate never
    // under-promises.
    const mci = Number(data?.['mci_price'] ?? 0);
    const other = Number(data?.['other_price'] ?? 0);
    const recipients = typeof options.to === 'string' ? 1 : options.to.length;

    return {
      provider: this.meta.id,
      total: Number.isFinite(mci) || Number.isFinite(other) ? Math.max(mci, other) * recipients : null,
      currency: 'IRR',
      parts: Number(data?.['parts'] ?? 0) || null,
      raw,
    };
  }

  /* ---------------------------------------------------------------- unified: patterns */

  override async listPatterns(options: ListOptions = {}): Promise<Page<PatternInfo>> {
    const { data, meta, raw } = await this.callWithMeta<Array<Record<string, unknown>>>(
      'GET',
      ENDPOINTS.patternList,
      {
        query: {
          page: options.page ?? 1,
          per_page: options.pageSize ?? 10,
          ...(options.providerOptions ?? {}),
        },
      },
    );

    return makePage({
      items: (data ?? []).map((item) => this.toPattern(item)),
      page: meta?.current_page,
      pageSize: meta?.per_page,
      total: meta?.total,
      raw,
    });
  }

  override async getPattern(code: string): Promise<PatternInfo> {
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>(
      'GET',
      ENDPOINTS.patternByCode(code),
    );
    return this.toPattern(data ?? {}, raw);
  }

  override async createPattern(input: {
    body: string;
    description?: string;
    title?: string;
    website?: string;
    variables?: readonly string[];
    shared?: boolean;
  }): Promise<PatternInfo> {
    const variable = (input.variables ?? []).map((name) => ({ name, type: 'string' }));
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>('POST', ENDPOINTS.patternCreate, {
      body: {
        title: input.title,
        description: input.description ?? '',
        is_share: input.shared ?? false,
        message: input.body,
        website: input.website,
        variable,
      },
      idempotent: false,
    });
    return this.toPattern(data ?? {}, raw);
  }

  override async updatePattern(
    code: string,
    input: {
      body?: string;
      description?: string;
      variables?: readonly string[];
      shared?: boolean;
      title?: string;
    },
  ): Promise<PatternInfo> {
    const variable = (input.variables ?? []).map((name) => ({ name, type: 'string' }));
    const { data, raw } = await this.callWithMeta<Record<string, unknown>>(
      'PUT',
      ENDPOINTS.patternUpdate(code),
      {
        body: {
          title: input.title,
          description: input.description ?? '',
          is_share: input.shared ?? false,
          message: input.body,
          variable,
        },
        idempotent: false,
      },
    );
    return this.toPattern(data ?? {}, raw);
  }

  override async deletePattern(code: string): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call('DELETE', ENDPOINTS.patternDelete(code), { idempotent: false });
    return { success: true, raw };
  }

  private toPattern(item: Record<string, unknown>, raw: unknown = item): PatternInfo {
    const status = String(item['pattern_status'] ?? '').toLowerCase();
    const variables = Array.isArray(item['variable'])
      ? (item['variable'] as Array<{ name?: string }>).map((v) => String(v?.name ?? ''))
      : [];

    return makePatternInfo({
      provider: this.meta.id,
      code: String(item['pattern_code'] ?? ''),
      title: (item['title'] as string | undefined) ?? null,
      body: (item['pattern_message'] as string | undefined) ?? null,
      status:
        status === 'active'
          ? 'active'
          : status === 'pending'
            ? 'pending'
            : status === 'inactive'
              ? 'rejected'
              : 'unknown',
      variables,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: contacts */

  override async listContacts(options: ListOptions = {}): Promise<Page<Contact>> {
    const { data, meta, raw } = await this.callWithMeta<Array<Record<string, unknown>>>(
      'GET',
      ENDPOINTS.contactList,
      {
        query: {
          page: options.page ?? 1,
          per_page: options.pageSize ?? 10,
          ...(options.providerOptions ?? {}),
        },
      },
    );

    return makePage({
      items: (data ?? []).map((item) => ({
        provider: this.meta.id,
        id: item['id'] === undefined ? null : String(item['id']),
        number: String(item['number'] ?? ''),
        name: (item['name'] as string | undefined) ?? null,
        email: (item['email'] as string | undefined) ?? null,
        groupId: item['phonebook_id'] === undefined ? null : String(item['phonebook_id']),
        raw: item,
      })),
      page: meta?.current_page,
      pageSize: meta?.per_page,
      total: meta?.total,
      raw,
    });
  }

  override async createContact(input: {
    number: string;
    name?: string;
    email?: string;
    groupId?: string;
  }): Promise<Contact> {
    if (!input.groupId) {
      throw new SMSValidationError('IPPanel requires `groupId` (the phonebook id) when creating a contact.', {
        provider: this.meta.id,
        code: 'phonebook_required',
      });
    }

    const raw = await this.call('POST', ENDPOINTS.contactAdd, {
      body: {
        list: [
          {
            number: this.phone(input.number),
            name: input.name,
            email: input.email,
            phonebook_id: input.groupId,
          },
        ],
      },
      idempotent: false,
    });

    return {
      provider: this.meta.id,
      id: null,
      number: this.phone(input.number),
      name: input.name ?? null,
      email: input.email ?? null,
      groupId: input.groupId,
      raw,
    };
  }

  override async deleteContact(id: string): Promise<{ success: boolean; raw: unknown }> {
    const raw = await this.call('POST', ENDPOINTS.contactDelete, {
      body: { listNumbers: [Number(id)] },
      idempotent: false,
    });
    return { success: true, raw };
  }

  override async listContactGroups(options: ListOptions = {}): Promise<Page<ContactGroup>> {
    const { data, meta, raw } = await this.callWithMeta<Array<Record<string, unknown>>>(
      'GET',
      ENDPOINTS.phonebookList,
      { query: { page: options.page ?? 1, per_page: options.pageSize ?? 10 } },
    );

    return makePage({
      items: (data ?? []).map((item) => ({
        provider: this.meta.id,
        id: String(item['id'] ?? ''),
        title: (item['title'] as string | undefined) ?? null,
        count: typeof item['count'] === 'number' ? item['count'] : Number(item['count'] ?? 0) || null,
        raw: item,
      })),
      page: meta?.current_page,
      pageSize: meta?.per_page,
      total: meta?.total,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: blacklist */

  /**
   * IPPanel exposes blacklist state only as read-only flags on a phonebook contact —
   * there is no blacklist query endpoint. This reads the contact record.
   */
  override async isBlacklisted(number: string): Promise<boolean> {
    const { data } = await this.callWithMeta<Array<Record<string, unknown>>>('GET', ENDPOINTS.contactList, {
      query: { number: this.phone(number), per_page: 1 },
    });
    const contact = data?.[0];
    if (!contact?.['id']) return false;

    const detail = await this.call<Record<string, unknown>>(
      'GET',
      ENDPOINTS.contactShow(String(contact['id'])),
    );
    return detail?.['is_send_blacklist'] === true;
  }

  /* ---------------------------------------------------------------- native surface */

  /**
   * The full Edge surface, grouped by documentation section. Anything not covered by the
   * unified API above is reachable here without losing type-safety or the raw response.
   */
  readonly native = {
    /** POST /api/send with an arbitrary `sending_type`. */
    send: (body: Record<string, unknown>) =>
      this.call<SendResponse>('POST', ENDPOINTS.send, { body, idempotent: false }),

    sendToPhonebook: (input: {
      from_number: string;
      message: string;
      params: Array<Record<string, unknown>>;
      send_time?: string;
    }) =>
      this.call<SendResponse>('POST', ENDPOINTS.send, {
        body: { sending_type: SENDING_TYPES.phonebook, ...input },
        idempotent: false,
      }),

    sendByPostalCode: (input: Record<string, unknown>) =>
      this.call<SendResponse>('POST', ENDPOINTS.send, {
        body: { sending_type: SENDING_TYPES.postalCode, ...input },
        idempotent: false,
      }),

    sendByGeolocation: (input: Record<string, unknown>) =>
      this.call<SendResponse>('POST', ENDPOINTS.send, {
        body: { sending_type: SENDING_TYPES.geolocation, ...input },
        idempotent: false,
      }),

    sendByJob: (input: Record<string, unknown>) =>
      this.call<SendResponse>('POST', ENDPOINTS.send, {
        body: { sending_type: SENDING_TYPES.job, ...input },
        idempotent: false,
      }),

    sendByKeywordPhonebook: (input: Record<string, unknown>) =>
      this.call<SendResponse>('POST', ENDPOINTS.send, {
        body: { sending_type: SENDING_TYPES.keywordPhonebook, ...input },
        idempotent: false,
      }),

    calculatePrice: (input: { number: string; message: string }) =>
      this.call<{ mci_price: number; other_price: number; parts: number }>('POST', ENDPOINTS.calculatePrice, {
        body: input,
        idempotent: true,
      }),

    provinces: () => this.call('GET', ENDPOINTS.provinces),
    counties: (provinceId: number) =>
      this.call('GET', ENDPOINTS.counties, { query: { province_id: provinceId } }),
    cities: (countyId: number) => this.call('GET', ENDPOINTS.cities, { query: { county_id: countyId } }),
    genders: () => this.call('GET', ENDPOINTS.genders),
    provincesV2: () => this.call('GET', ENDPOINTS.provincesV2),
    countiesV2: (provinceId: number) =>
      this.call('GET', ENDPOINTS.countiesV2, { query: { province_id: provinceId } }),
    citiesV2: (countyId: number) => this.call('GET', ENDPOINTS.citiesV2, { query: { county_id: countyId } }),
    recipientCounts: (query: Record<string, unknown>) => this.call('GET', ENDPOINTS.countsV2, { query }),
    jobCategories: () => this.call('GET', ENDPOINTS.jobCategories),
    jobSubCategories: (mainCategoryId: number) =>
      this.call('GET', ENDPOINTS.jobSubCategories, { query: { main_category_id: mainCategoryId } }),
    jobNumberCount: (query: Record<string, unknown>) => this.call('GET', ENDPOINTS.jobNumberCount, { query }),

    bulkStats: (bulkId: string) => this.call('GET', ENDPOINTS.bulkStats, { query: { bulk_id: bulkId } }),

    // reseller / account
    listUsers: (query: Record<string, unknown> = {}) => this.call('GET', ENDPOINTS.userList, { query }),
    showUser: (userId: number) => this.call('GET', ENDPOINTS.userShow, { query: { user_id: userId } }),
    createUser: (body: Record<string, unknown>) =>
      this.call('POST', ENDPOINTS.userCreate, { body, idempotent: false }),
    updateUser: (body: Record<string, unknown>) =>
      this.call('POST', ENDPOINTS.userUpdate, { body, idempotent: false }),
    checkUserExists: (userName: string) =>
      this.call('POST', ENDPOINTS.userCheckExist, { body: { user_name: userName }, idempotent: true }),
    parentsTree: (userId: number) =>
      this.call('GET', ENDPOINTS.userParentsTree, { query: { user_id: userId } }),
    tariff: () => this.call('GET', ENDPOINTS.userTariff),
    documents: () => this.call('GET', ENDPOINTS.userDocuments),
    packages: (query: Record<string, unknown> = {}) => this.call('GET', ENDPOINTS.packageList, { query }),

    // numbers
    assignNumber: (body: Record<string, unknown>) =>
      this.call('POST', ENDPOINTS.numberAssign, { body, idempotent: false }),
    unassignNumber: (body: Record<string, unknown>) =>
      this.call('POST', ENDPOINTS.numberUnassign, { body, idempotent: false }),

    // phonebooks
    listPhonebooks: (query: Record<string, unknown> = {}) =>
      this.call('GET', ENDPOINTS.phonebookList, { query }),
    createPhonebook: (body: { title: string; options?: string[] }) =>
      this.call('POST', ENDPOINTS.phonebookCreate, { body, idempotent: false }),
    updatePhonebook: (id: string, body: { title?: string; options?: string[] }) =>
      this.call('PUT', ENDPOINTS.phonebookUpdate(id), { body, idempotent: false }),
    deletePhonebooks: (ids: number[]) =>
      this.call('POST', ENDPOINTS.phonebookDelete, { body: { listPhonebooks: ids }, idempotent: false }),
    exportPhonebook: (id: string) => this.call('GET', ENDPOINTS.phonebookExport(id)),
    /** `file` must be a `Blob`/`File` containing the XLSX. */
    importPhonebook: (id: string, file: Blob) =>
      this.call('POST', ENDPOINTS.phonebookImport(id), {
        body: { file },
        multipart: true,
        idempotent: false,
      }),
    phonebookImportSample: (id: string) => this.call('GET', ENDPOINTS.phonebookImportSample(id)),

    // phonebook contacts
    listContacts: (query: Record<string, unknown> = {}) => this.call('GET', ENDPOINTS.contactList, { query }),
    showContact: (contactId: string) => this.call('GET', ENDPOINTS.contactShow(contactId)),
    addContacts: (list: Array<Record<string, unknown>>) =>
      this.call('POST', ENDPOINTS.contactAdd, { body: { list }, idempotent: false }),
    updateContact: (contactId: string, body: Record<string, unknown>) =>
      this.call('PUT', ENDPOINTS.contactUpdate(contactId), { body, idempotent: false }),
    deleteContacts: (ids: number[]) =>
      this.call('POST', ENDPOINTS.contactDelete, { body: { listNumbers: ids }, idempotent: false }),
    exportContacts: (query: Record<string, unknown> = {}) =>
      this.call('GET', ENDPOINTS.contactExport, { query }),

    // phonebook custom fields
    listOptions: (query: Record<string, unknown> = {}) => this.call('GET', ENDPOINTS.optionList, { query }),
    createOption: (body: { type: 'int' | 'string' | 'date'; title: string }) =>
      this.call('POST', ENDPOINTS.optionCreate, { body, idempotent: false }),
    updateOption: (optionId: string, body: { title?: string }) =>
      this.call('PUT', ENDPOINTS.optionUpdate(optionId), { body, idempotent: false }),
    deleteOptions: (ids: number[]) =>
      this.call('POST', ENDPOINTS.optionDelete, { body: { listOptions: ids }, idempotent: false }),

    // drafts ("default messages")
    listDraftGroups: () => this.call('GET', ENDPOINTS.draftGroupList),
    createDraftGroup: (title: string) =>
      this.call('POST', ENDPOINTS.draftGroupCreate, { body: { title }, idempotent: false }),
    updateDraftGroup: (body: { draft_group_id: number; title: string }) =>
      this.call('PUT', ENDPOINTS.draftGroupUpdate, { body, idempotent: false }),
    deleteDraftGroup: (draftGroupId: number) =>
      this.call('POST', ENDPOINTS.draftGroupDelete, {
        body: { draft_group_id: draftGroupId },
        idempotent: false,
      }),
    listDrafts: (draftGroupId?: number) =>
      this.call('GET', ENDPOINTS.draftList, { query: draftGroupId ? { draft_group_id: draftGroupId } : {} }),
    createDraft: (body: { draft_group_id: number; message: string }) =>
      this.call('POST', ENDPOINTS.draftCreate, { body, idempotent: false }),
    updateDraft: (body: { draft_id: number; message: string }) =>
      this.call('PUT', ENDPOINTS.draftUpdate, { body, idempotent: false }),
    deleteDrafts: (draftIds: number[]) =>
      this.call('POST', ENDPOINTS.draftDelete, { body: { draft_ids: draftIds }, idempotent: false }),

    // user documents
    /**
     * Upload a KYC document.
     *
     * The docs label this endpoint `GET`, but the accompanying curl example posts a
     * multipart body. It is implemented as POST — see docs/providers/ippanel.md.
     */
    uploadDocument: (documentId: string, files: Blob[]) =>
      this.call('POST', ENDPOINTS.userDocumentUpload, {
        body: { document_id: documentId, ...Object.fromEntries(files.map((f, i) => [`files[${i}]`, f])) },
        multipart: true,
        idempotent: false,
      }),
    removeDocument: (documentId: string) =>
      this.call('POST', ENDPOINTS.userDocumentRemove, {
        body: { document_id: documentId },
        idempotent: false,
      }),

    // tickets
    listTickets: (query: Record<string, unknown> = {}) => this.call('GET', ENDPOINTS.ticketList, { query }),
    showTicket: (ticketId: number) =>
      this.call('GET', ENDPOINTS.ticketShow, { query: { ticket_id: ticketId } }),
    createTicket: (form: {
      subject: string;
      category_id: string;
      description: string;
      sms_notification?: '0' | '1';
      file?: Blob;
    }) => this.call('POST', ENDPOINTS.ticketCreate, { body: form, multipart: true, idempotent: false }),
    replyTicket: (form: { ticket_id: number; description: string; file?: Blob }) =>
      this.call('POST', ENDPOINTS.ticketReply, { body: form, multipart: true, idempotent: false }),

    /**
     * Panel authentication.
     *
     * Only needed by resellers implementing their own login UI — API-key holders never call
     * these. `login` returns `{method, token}` where `method` is `login` | `sms` | `ga`.
     */
    auth: {
      login: (body: { username: string; password: string }) =>
        this.call('POST', ENDPOINTS.login, { body, idempotent: false }),
      sendSmsOtp: (token: string) =>
        this.call('POST', ENDPOINTS.sendSmsOtp, { body: { token }, idempotent: false }),
      confirmOtp: (body: { token: string; otp: string }) =>
        this.call('POST', ENDPOINTS.confirmOtp, { body, idempotent: false }),
      forgotPassword: (body: { username: string; mobile: string }) =>
        this.call('POST', ENDPOINTS.forgotPassword, { body, idempotent: false }),
      changePasswordByToken: (body: { token: string; otp: string; password: string }) =>
        this.call('POST', ENDPOINTS.changePasswordByToken, { body, idempotent: false }),
      logout: () => this.call('POST', ENDPOINTS.logout, { body: {}, idempotent: false }),
      checkToken: () => this.call('POST', ENDPOINTS.checkToken, { body: {}, idempotent: true }),
    },
  };
}

export default IPPanelProvider;
