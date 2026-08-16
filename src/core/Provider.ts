/**
 * The contract every provider adapter implements.
 *
 * Capability methods are **optional**. A provider declares what it can do in
 * `capabilities`, and the {@link SMS} facade turns a call to a missing method into a clear
 * {@link SMSUnsupportedFeatureError} rather than a `TypeError`. This is what keeps the
 * unified API honest: nothing is faked, and nothing is silently degraded.
 */

import { HttpClient } from './http.js';
import { EventBus } from './events.js';
import { SMSConfigurationError, SMSUnsupportedFeatureError } from './errors.js';
import { PatternRegistry } from './pattern-registry.js';
import { formatPhone, formatPhones } from './phone.js';
import type {
  AccountInfo,
  BalanceResult,
  BulkSendOptions,
  Capabilities,
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
  RequestConfig,
  SendOptions,
  SendResult,
  Sender,
  StatusResult,
} from './types.js';

/** Credentials are provider-shaped; each adapter validates its own. */
export type Credentials = Record<string, unknown>;

export interface ProviderConfig {
  credentials?: Credentials;
  request?: RequestConfig;
  debug?: boolean;
  patterns?: PatternRegistry;
  events?: EventBus;
  /** Default sender line used when a call omits `from`. */
  sender?: string;
}

/** Describes one required credential so validation can fail early and specifically. */
export interface CredentialSpec {
  key: string;
  /** Environment variable conventionally used for it, quoted in the error message. */
  env?: string;
  description: string;
  /** When several keys are interchangeable, list the alternatives. */
  oneOf?: readonly string[];
}

export abstract class BaseProvider {
  abstract readonly meta: ProviderMeta;
  /** Credentials this provider needs. Checked in {@link validateCredentials}. */
  protected abstract readonly requiredCredentials: readonly CredentialSpec[];

  readonly credentials: Credentials;
  readonly patterns: PatternRegistry;
  readonly events: EventBus;
  readonly debug: boolean;
  protected readonly requestConfig: RequestConfig;
  protected readonly defaultSender: string | undefined;
  private httpClient: HttpClient | undefined;

  constructor(config: ProviderConfig = {}) {
    this.credentials = config.credentials ?? {};
    this.patterns = config.patterns ?? new PatternRegistry();
    this.events = config.events ?? new EventBus();
    this.debug = config.debug ?? false;
    this.requestConfig = config.request ?? {};
    this.defaultSender = config.sender ?? (this.credentials['sender'] as string | undefined);
  }

  get id(): string {
    return this.meta.id;
  }

  get capabilities(): Capabilities {
    return this.meta.capabilities;
  }

  supports(capability: keyof Capabilities): boolean {
    return this.meta.capabilities[capability] === true;
  }

  /** Default base URL. Adapters override; `request.baseUrl` always wins. */
  protected abstract defaultBaseUrl(): string;

  /** Auth headers for every request. Adapters that authenticate in the URL return `{}`. */
  protected abstract authHeaders(): Record<string, string>;

  /** Literal secrets to scrub from logs, events and error messages. */
  protected secretValues(): string[] {
    return Object.entries(this.credentials)
      .filter(([key]) => /key|token|password|secret|pass/i.test(key))
      .map(([, value]) => value)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  /** Lazily-built, memoised HTTP client. */
  protected get http(): HttpClient {
    this.httpClient ??= new HttpClient({
      baseUrl: this.requestConfig.baseUrl ?? this.defaultBaseUrl(),
      headers: this.authHeaders(),
      timeout: this.requestConfig.timeout ?? 15_000,
      retries: this.requestConfig.retries ?? 2,
      retryDelay: this.requestConfig.retryDelay ?? 300,
      fetch: this.requestConfig.fetch ?? globalThis.fetch,
      userAgent: this.requestConfig.userAgent ?? '',
      debug: this.debug,
      provider: this.meta.id,
      secrets: this.secretValues(),
      events: this.events,
    });
    return this.httpClient;
  }

  /**
   * Fail fast on missing credentials, before any network call.
   *
   * Called by {@link SMS} at construction time so a typo in configuration surfaces
   * immediately instead of as a confusing 401 on the first send.
   */
  validateCredentials(): void {
    const missing: CredentialSpec[] = [];
    for (const spec of this.requiredCredentials) {
      const keys = spec.oneOf ?? [spec.key];
      const satisfied = keys.some((key) => {
        const value = this.credentials[key];
        return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
      });
      if (!satisfied) missing.push(spec);
    }

    if (missing.length > 0) {
      const lines = missing.map((spec) => {
        const keys = spec.oneOf ? spec.oneOf.join(' or ') : spec.key;
        const env = spec.env ? ` (commonly from ${spec.env})` : '';
        return `  - credentials.${keys}${env}: ${spec.description}`;
      });
      throw new SMSConfigurationError(
        `Missing credentials for provider "${this.meta.id}":\n${lines.join('\n')}`,
        { provider: this.meta.id, code: 'missing_credentials' },
      );
    }
  }

  /** Resolve the sender line for a call, or `undefined` when the provider infers it. */
  protected resolveSender(from?: string): string | undefined {
    return from ?? this.defaultSender;
  }

  /** Require a sender line, with a message that says where to set it. */
  protected requireSender(from?: string): string {
    const sender = this.resolveSender(from);
    if (!sender) {
      throw new SMSConfigurationError(
        `Provider "${this.meta.id}" requires a sender line. Pass \`from\` on the call, ` +
          'or set `sender` in the provider config.',
        { provider: this.meta.id, code: 'missing_sender' },
      );
    }
    return sender;
  }

  /** Format a single recipient into this provider's wire format. */
  protected phone(value: string): string {
    return formatPhone(value, this.meta.phoneFormat);
  }

  /** Format many recipients into this provider's wire format. */
  protected phoneList(values: string | readonly string[]): string[] {
    return formatPhones(typeof values === 'string' ? [values] : values, this.meta.phoneFormat);
  }

  /** Throw a consistent, actionable error for an unimplemented capability. */
  protected unsupported(feature: string): never {
    throw new SMSUnsupportedFeatureError(
      `Provider "${this.meta.id}" does not support "${feature}". ` +
        `Check \`sms.supports('${feature}')\` before calling, or see docs/provider-matrix.md.`,
      { provider: this.meta.id, feature, code: 'unsupported_feature' },
    );
  }

  /* ---------------------------------------------------------------- optional surface */
  /* Adapters implement whatever they can prove from the provider's documentation. */

  send?(options: SendOptions): Promise<SendResult>;
  sendBulk?(options: BulkSendOptions): Promise<SendResult>;
  sendPeerToPeer?(
    messages: readonly PeerMessage[],
    options?: Omit<SendOptions, 'to' | 'message'>,
  ): Promise<SendResult>;
  sendPattern?(options: PatternSendOptions): Promise<SendResult>;
  cancelScheduled?(id: string): Promise<{ success: boolean; raw: unknown }>;

  getStatus?(messageId: string): Promise<StatusResult>;
  getStatuses?(messageIds: readonly string[]): Promise<StatusResult[]>;
  listOutbox?(options?: ListOptions): Promise<Page<OutboxMessage>>;
  getMessage?(messageId: string): Promise<OutboxMessage>;

  listInbox?(options?: ListOptions): Promise<Page<InboxMessage>>;

  getBalance?(): Promise<BalanceResult>;
  getAccountInfo?(): Promise<AccountInfo>;
  listSenders?(): Promise<Sender[]>;
  estimatePrice?(options: {
    to: string | readonly string[];
    message: string;
    from?: string;
  }): Promise<PriceEstimate>;

  listPatterns?(options?: ListOptions): Promise<Page<PatternInfo>>;
  getPattern?(code: string): Promise<PatternInfo>;
  createPattern?(input: {
    body: string;
    description?: string;
    variables?: readonly string[];
    shared?: boolean;
  }): Promise<PatternInfo>;
  updatePattern?(
    code: string,
    input: { body?: string; description?: string; variables?: readonly string[]; shared?: boolean },
  ): Promise<PatternInfo>;
  deletePattern?(code: string): Promise<{ success: boolean; raw: unknown }>;

  listContacts?(options?: ListOptions): Promise<Page<Contact>>;
  createContact?(input: {
    number: string;
    name?: string;
    email?: string;
    groupId?: string;
  }): Promise<Contact>;
  deleteContact?(id: string): Promise<{ success: boolean; raw: unknown }>;
  listContactGroups?(options?: ListOptions): Promise<Page<ContactGroup>>;

  isBlacklisted?(number: string, line?: string): Promise<boolean>;
  listBlacklist?(line: string, options?: ListOptions): Promise<Page<{ number: string; raw: unknown }>>;
  addToBlacklist?(line: string, numbers: readonly string[]): Promise<{ success: boolean; raw: unknown }>;
  removeFromBlacklist?(line: string, numbers: readonly string[]): Promise<{ success: boolean; raw: unknown }>;

  listWebhooks?(): Promise<Array<{ id: string; url: string; active: boolean; kind: string; raw: unknown }>>;
  createWebhook?(input: { url: string; kind: 'delivery' | 'inbound' }): Promise<{ id: string; raw: unknown }>;
  setWebhookActive?(
    id: string,
    active: boolean,
    kind: 'delivery' | 'inbound',
  ): Promise<{ success: boolean; raw: unknown }>;

  sendVoice?(options: {
    to: string | readonly string[];
    message: string;
    scheduleAt?: Date | string;
  }): Promise<SendResult>;
}
