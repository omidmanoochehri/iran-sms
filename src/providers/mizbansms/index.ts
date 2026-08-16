/**
 * Mizban SMS adapter.
 *
 * Official documentation: https://services.mizbansms.com/swagger/index.html
 * (OpenAPI document: https://services.mizbansms.com/swagger/v1/swagger.json — 226 paths.)
 * Verified 2026-08-16. Research log: docs/providers/mizbansms.md
 *
 * Notes that shaped this implementation:
 * - The Swagger document exposes the whole panel backend, most of which is administrative.
 *   Only the customer-facing `/api/Customer/*` surface is mapped onto the unified API; the
 *   rest is reachable through `provider.native.raw(...)`.
 * - Those methods authenticate with `username`/`password`/`usertype` **in the body**, not
 *   with the bearer token the panel endpoints use.
 * - The spec's declared server is `http://services.mizbansms.com`. This adapter defaults to
 *   **https**, because sending account credentials in a cleartext body is not acceptable;
 *   set `request.baseUrl` explicitly to override.
 */

import { BaseProvider, type CredentialSpec, type ProviderConfig } from '../../core/Provider.js';
import { SMSError, SMSValidationError } from '../../core/errors.js';
import { assertFuture, parseProviderDate, toTehranDateTime } from '../../core/datetime.js';
import {
  makeBalanceResult,
  makeInboxMessage,
  makePage,
  makeSendResult,
  makeStatusResult,
} from '../../core/normalize.js';
import type {
  BalanceResult,
  BulkSendOptions,
  InboxMessage,
  ListOptions,
  Page,
  PeerMessage,
  ProviderMeta,
  SendOptions,
  SendResult,
  Sender,
  StatusResult,
} from '../../core/types.js';
import { CATALOG } from '../catalog.js';
import { BASE_URL, DEFAULT_USER_TYPE } from './constants.js';

const entry = CATALOG.find((item) => item.id === 'mizbansms')!;

export class MizbanSmsProvider extends BaseProvider {
  readonly meta: ProviderMeta = {
    id: entry.id,
    name: entry.name,
    apiVersion: entry.apiVersion,
    documentation: entry.documentation,
    phoneFormat: entry.phoneFormat,
    capabilities: entry.capabilities,
    platform: 'mizban',
  };

  protected readonly requiredCredentials: readonly CredentialSpec[] = entry.requiredCredentials;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected defaultBaseUrl(): string {
    return BASE_URL;
  }

  /** A bearer token is only needed for the panel API; customer methods use the body. */
  protected authHeaders(): Record<string, string> {
    const token = this.credentials['token'] as string | undefined;
    return token ? { Authorization: token } : {};
  }

  private get auth(): { username: string; password: string; usertype: number } {
    return {
      username: String(this.credentials['username'] ?? ''),
      password: String(this.credentials['password'] ?? ''),
      usertype: Number(this.credentials['usertype'] ?? DEFAULT_USER_TYPE),
    };
  }

  /* ---------------------------------------------------------------- transport */

  async call<T = unknown>(
    path: string,
    body: Record<string, unknown> = {},
    options: { idempotent?: boolean; withAuth?: boolean; query?: Record<string, unknown> } = {},
  ): Promise<{ data: T; raw: unknown }> {
    const payload = options.withAuth === false ? body : { ...this.auth, ...body };

    const response = await this.http.request<T>({
      method: 'POST',
      path,
      query: options.query,
      body: payload,
      bodyKind: 'json',
      idempotent: options.idempotent ?? false,
    });

    if (!response.ok) {
      throw new SMSError(`Mizban SMS request failed with HTTP ${response.status}.`, {
        provider: this.meta.id,
        status: response.status,
        endpoint: path,
        raw: response.data,
        retryable: response.status >= 500,
      });
    }

    return { data: response.data, raw: response.data };
  }

  /* ---------------------------------------------------------------- unified: send */

  override async send(options: SendOptions): Promise<SendResult> {
    const to = this.phoneList(options.to);
    if (to.length === 0) {
      throw new SMSValidationError('At least one recipient is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    if (options.scheduleAt) {
      assertFuture(options.scheduleAt);
      const { data, raw } = await this.call<Record<string, unknown>>('/api/Customer/SendSMSFuture', {
        message: options.message,
        message2: [],
        // No timezone is documented; the platform is Iran-local.
        sendDate: toTehranDateTime(options.scheduleAt),
        from: this.requireSender(options.from),
        to,
        api: 1,
        ...(options.providerOptions ?? {}),
      });
      return this.toSendResult(data, to, raw, 'scheduled');
    }

    const { data, raw } = await this.call<Record<string, unknown>>('/api/Customer/SendSMS', {
      message: options.message,
      from: this.requireSender(options.from),
      to,
      api: 1,
      ...(options.providerOptions ?? {}),
    });

    return this.toSendResult(data, to, raw, 'queued');
  }

  override async sendBulk(options: BulkSendOptions): Promise<SendResult> {
    return this.send(options);
  }

  /** `SendSMS2` — parallel `messages[]` / `to[]` arrays. */
  override async sendPeerToPeer(
    peers: readonly PeerMessage[],
    options: Omit<SendOptions, 'to' | 'message'> = {},
  ): Promise<SendResult> {
    const to: string[] = [];
    const messages: string[] = [];

    for (const peer of peers) {
      for (const recipient of this.phoneList(peer.to)) {
        to.push(recipient);
        messages.push(peer.message);
      }
    }

    if (to.length === 0) {
      throw new SMSValidationError('At least one peer message is required.', {
        provider: this.meta.id,
        code: 'no_recipients',
      });
    }

    const { data, raw } = await this.call<Record<string, unknown>>('/api/Customer/SendSMS2', {
      messages,
      from: this.requireSender(options.from),
      to,
      api: 1,
    });

    return this.toSendResult(data, to, raw, 'queued');
  }

  private toSendResult(
    data: Record<string, unknown> | null,
    recipients: string[],
    raw: unknown,
    status: SendResult['status'],
  ): SendResult {
    const record = data ?? {};
    return makeSendResult({
      provider: this.meta.id,
      raw,
      messageId: (record['deliveryCode'] ?? record['DeliveryCode'] ?? record['id']) as string | number | null,
      batchId: (record['deliveryCode'] ?? record['DeliveryCode']) as string | number | null,
      recipients,
      status,
      currency: 'credit',
    });
  }

  /* ---------------------------------------------------------------- unified: reports */

  override async getStatus(messageId: string): Promise<StatusResult> {
    const { data, raw } = await this.call<Record<string, unknown>>(
      '/api/Customer/GetDeliveryCode',
      {
        userType: this.auth.usertype,
        username: this.auth.username,
        password: this.auth.password,
        deliveryCode: messageId,
      },
      { idempotent: true, withAuth: false },
    );

    return makeStatusResult({
      provider: this.meta.id,
      messageId,
      // No delivery-code table is published, so the provider's value passes through.
      status: 'unknown',
      nativeStatus: (data?.['status'] ?? data?.['Status'] ?? null) as string | number | null,
      raw,
    });
  }

  override async getStatuses(messageIds: readonly string[]): Promise<StatusResult[]> {
    const { data, raw } = await this.call<Array<Record<string, unknown>>>(
      '/api/Customer/GetArrayDeliveryCode',
      {
        userType: this.auth.usertype,
        username: this.auth.username,
        password: this.auth.password,
        deliveryCodes: [...messageIds],
      },
      { idempotent: true, withAuth: false },
    );

    const items = Array.isArray(data) ? data : [];
    return messageIds.map((id, index) =>
      makeStatusResult({
        provider: this.meta.id,
        messageId: id,
        status: 'unknown',
        nativeStatus: (items[index]?.['status'] ?? null) as string | number | null,
        raw,
      }),
    );
  }

  override async listInbox(options: ListOptions = {}): Promise<Page<InboxMessage>> {
    const { data, raw } = await this.call<Array<Record<string, unknown>>>(
      '/api/Customer/RecieveMessageArray',
      {
        count: options.pageSize ?? 100,
      },
      { idempotent: true },
    );

    const items = Array.isArray(data) ? data : [];
    return makePage({
      items: items.map((item) =>
        makeInboxMessage({
          provider: this.meta.id,
          messageId: (item['id'] ?? null) as number | null,
          from: String(item['from'] ?? item['mobile'] ?? ''),
          to: (item['to'] as string | undefined) ?? null,
          text: String(item['message'] ?? item['text'] ?? ''),
          receivedAt: parseProviderDate(item['date'] ?? item['receiveDate']),
          raw: item,
        }),
      ),
      pageSize: options.pageSize ?? null,
      raw,
    });
  }

  /* ---------------------------------------------------------------- unified: account */

  override async getBalance(): Promise<BalanceResult> {
    const { data, raw } = await this.call<Record<string, unknown> | number>(
      '/api/Customer/Credites',
      {},
      {
        idempotent: true,
      },
    );
    const amount = typeof data === 'number' ? data : (data?.['credit'] ?? data?.['Credit'] ?? null);
    return makeBalanceResult({ provider: this.meta.id, amount, currency: 'credit', raw });
  }

  override async listSenders(): Promise<Sender[]> {
    const { data, raw } = await this.call<Array<Record<string, unknown> | string>>(
      '/api/Customer/SMSNumbers',
      {},
      { idempotent: true },
    );

    const items = Array.isArray(data) ? data : [];
    return items.map((item) => ({
      provider: this.meta.id,
      number: typeof item === 'string' ? item : String(item['number'] ?? item['smsNumber'] ?? ''),
      dedicated: null,
      raw,
    }));
  }

  /* ---------------------------------------------------------------- native surface */

  readonly native = {
    /** Escape hatch to any of the 226 documented paths. */
    raw: <T = unknown>(path: string, body: Record<string, unknown> = {}, idempotent = false) =>
      this.call<T>(path, body, { idempotent }),

    sendSMS: (body: Record<string, unknown>) => this.call('/api/Customer/SendSMS', body),
    sendSMS2: (body: Record<string, unknown>) => this.call('/api/Customer/SendSMS2', body),
    sendSMS3: (body: Record<string, unknown>) => this.call('/api/Customer/SendSMS3', body),
    sendSMSFuture: (body: Record<string, unknown>) => this.call('/api/Customer/SendSMSFuture', body),
    smartSendSMS: (body: Record<string, unknown>) => this.call('/api/Customer/SmartSendSMS', body),
    deleteSendSMS: (body: Record<string, unknown>) => this.call('/api/Message/DeleteSendSMS', body),

    credits: () => this.call('/api/Customer/Credites', {}, { idempotent: true }),
    smsNumbers: () => this.call('/api/Customer/SMSNumbers', {}, { idempotent: true }),
    smsCounter: (message: string) =>
      this.call('/api/Customer/SmsCounter', {}, { query: { message }, idempotent: true, withAuth: false }),

    getDeliveryCode: (deliveryCode: string) =>
      this.call(
        '/api/Customer/GetDeliveryCode',
        {
          userType: this.auth.usertype,
          username: this.auth.username,
          password: this.auth.password,
          deliveryCode,
        },
        { idempotent: true, withAuth: false },
      ),
    getArrayDeliveryCode: (deliveryCodes: readonly string[]) =>
      this.call(
        '/api/Customer/GetArrayDeliveryCode',
        {
          userType: this.auth.usertype,
          username: this.auth.username,
          password: this.auth.password,
          deliveryCodes: [...deliveryCodes],
        },
        { idempotent: true, withAuth: false },
      ),
    recieveMessageArray: (count: number) =>
      this.call('/api/Customer/RecieveMessageArray', { count }, { idempotent: true }),

    /** Mizban's own OTP flow, distinct from sending an OTP you generated. */
    getOtpUser: (body: Record<string, unknown>) =>
      this.call('/api/Customer/GetOtpUser', body, { withAuth: false }),
    verifyOtpUser: (mobileNumber: string, otp: string) =>
      this.call('/api/Customer/VerifyOtpUser', { mobileNumber, otp }, { withAuth: false }),

    reports: {
      sendSms: (body: Record<string, unknown>) =>
        this.call('/api/Report/ReportSendSms', body, { idempotent: true }),
      recieveMessage: (body: Record<string, unknown>) =>
        this.call('/api/Report/RecieveMessage', body, { idempotent: true }),
      searchDetailSendSMS: (body: Record<string, unknown>) =>
        this.call('/api/Report/SearchDetailSendSMS', body, { idempotent: true }),
      financials: (body: Record<string, unknown>) =>
        this.call('/api/Report/Financials', body, { idempotent: true }),
    },

    contacts: {
      list: (body: Record<string, unknown>) =>
        this.call('/api/Feature/ContactList', body, { idempotent: true }),
      add: (body: Record<string, unknown>) => this.call('/api/Feature/AddContact', body),
      delete: (body: Record<string, unknown>) => this.call('/api/Feature/DeleteContact', body),
    },
  };
}

export default MizbanSmsProvider;
