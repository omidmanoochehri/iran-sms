/**
 * The unified facade.
 *
 * `SMS` is deliberately thin: it validates configuration up front, lazily loads exactly one
 * adapter, groups the common operations into stable namespaces, and forwards everything
 * else to the provider untouched. It never emulates a capability a provider lacks — see
 * {@link SMSUnsupportedFeatureError}.
 */

import { EventBus, type EventMap, type EventName, type Listener } from './events.js';
import { PatternRegistry } from './pattern-registry.js';
import { ProviderRegistry } from './ProviderRegistry.js';
import { SMSConfigurationError, SMSUnsupportedFeatureError } from './errors.js';
import type { BaseProvider, Credentials, ProviderConfig } from './Provider.js';
import type { CatalogEntry } from '../providers/catalog.js';
import type {
  AccountInfo,
  BalanceResult,
  BulkSendOptions,
  Capabilities,
  CapabilityName,
  Contact,
  ContactGroup,
  InboxMessage,
  ListOptions,
  OutboxMessage,
  Page,
  PatternInfo,
  PatternRegistryConfig,
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

export interface SMSConfig {
  /** Provider id or alias. See `SMS.providers()`. */
  provider: string;
  credentials?: Credentials;
  /** Default sender line, used when a call omits `from`. */
  sender?: string;
  request?: RequestConfig;
  /** Emit redacted request/response diagnostics to stderr. */
  debug?: boolean;
  /** Logical pattern name → per-provider code. */
  patterns?: PatternRegistryConfig;
}

/**
 * Native provider surface, reached through `sms.provider`.
 *
 * Every method is wrapped to await adapter loading first, so it is always async even when
 * the underlying method is not. For a fully-typed native client, import the provider
 * directly: `import { KavenegarProvider } from 'iran-sms/providers/kavenegar'`.
 */
export type NativeProxy = Record<string, (...args: unknown[]) => Promise<unknown>>;

const PACKAGE_VERSION = '0.1.0';

export class SMS {
  readonly providerId: string;
  private readonly config: SMSConfig;
  private readonly entry: CatalogEntry;
  private readonly patternRegistry: PatternRegistry;
  private readonly bus = new EventBus();
  private instance: BaseProvider | undefined;
  private loading: Promise<BaseProvider> | undefined;

  /** Package version. */
  static readonly version = PACKAGE_VERSION;

  constructor(config: SMSConfig) {
    if (!config || typeof config !== 'object') {
      throw new SMSConfigurationError('SMS requires a configuration object.', { code: 'invalid_config' });
    }
    if (typeof config.provider !== 'string' || config.provider.trim() === '') {
      throw new SMSConfigurationError(
        `\`provider\` is required. Available providers: ${ProviderRegistry.list().join(', ')}.`,
        { code: 'missing_provider' },
      );
    }

    this.config = config;
    this.entry = ProviderRegistry.require(config.provider);
    this.providerId = this.entry.id;
    this.patternRegistry = new PatternRegistry(config.patterns ?? {});

    this.assertCredentials();
    this.assertBaseUrl();
  }

  /* -------------------------------------------------------------- static helpers */

  /** Canonical ids of every built-in provider. */
  static providers(): string[] {
    return ProviderRegistry.list();
  }

  /** True when `id` names a known provider (aliases included). */
  static hasProvider(id: string): boolean {
    return ProviderRegistry.has(id);
  }

  /** Catalog metadata without constructing anything. */
  static describeProvider(id: string): CatalogEntry | undefined {
    return ProviderRegistry.describe(id);
  }

  /* -------------------------------------------------------------- introspection */

  /** Capability flags for the configured provider. Available synchronously. */
  get capabilities(): Capabilities {
    return this.entry.capabilities;
  }

  /** True when the provider supports `capability`. */
  supports(capability: CapabilityName): boolean {
    return this.entry.capabilities[capability] === true;
  }

  /** Static description of the configured provider. */
  get providerInfo(): ProviderMeta & { platform: string; unverified: boolean } {
    return {
      id: this.entry.id,
      name: this.entry.name,
      apiVersion: this.entry.apiVersion,
      documentation: this.entry.documentation,
      phoneFormat: this.entry.phoneFormat,
      capabilities: this.entry.capabilities,
      platform: this.entry.platform,
      unverified: this.entry.unverified === true,
    };
  }

  /* -------------------------------------------------------------- lifecycle */

  /** Load the adapter and return it. Idempotent; safe to call concurrently. */
  async ready(): Promise<BaseProvider> {
    if (this.instance) return this.instance;
    this.loading ??= (async () => {
      const Ctor = await ProviderRegistry.load(this.config.provider);
      const providerConfig: ProviderConfig = {
        credentials: this.config.credentials ?? {},
        request: this.config.request ?? {},
        debug: this.config.debug ?? false,
        patterns: this.patternRegistry,
        events: this.bus,
      };
      if (this.config.sender !== undefined) providerConfig.sender = this.config.sender;
      const provider = new Ctor(providerConfig);
      provider.validateCredentials();
      this.instance = provider;
      return provider;
    })();
    try {
      return await this.loading;
    } catch (error) {
      this.loading = undefined;
      throw error;
    }
  }

  /**
   * The provider's full native API.
   *
   * `await sms.provider.verifyLookup({ … })` — every method is awaited through adapter
   * loading. Nothing is hidden: if the adapter implements it, it is reachable here.
   */
  get provider(): NativeProxy {
    return this.makeNativeProxy();
  }

  /** Alias for {@link provider}. */
  get raw(): NativeProxy {
    return this.makeNativeProxy();
  }

  private makeNativeProxy(): NativeProxy {
    const load = () => this.ready();
    return new Proxy(Object.create(null) as NativeProxy, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        return async (...args: unknown[]): Promise<unknown> => {
          const provider = await load();
          const method = (provider as unknown as Record<string, unknown>)[prop];
          if (typeof method !== 'function') {
            throw new SMSUnsupportedFeatureError(
              `Provider "${provider.id}" has no native method "${prop}".`,
              { provider: provider.id, feature: prop, code: 'unknown_native_method' },
            );
          }
          return (method as (...a: unknown[]) => unknown).apply(provider, args);
        };
      },
      has(_target, prop) {
        return typeof prop === 'string';
      },
    });
  }

  /* -------------------------------------------------------------- events */

  on<E extends EventName>(event: E, listener: Listener<E>): this {
    this.bus.on(event, listener);
    return this;
  }

  once<E extends EventName>(event: E, listener: Listener<E>): this {
    this.bus.once(event, listener);
    return this;
  }

  off<E extends EventName>(event: E, listener: Listener<E>): this {
    this.bus.off(event, listener);
    return this;
  }

  private emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    this.bus.emit(event, payload);
  }

  /* -------------------------------------------------------------- shortcuts */

  /** Send a text message. Shorthand for `sms.messages.send`. */
  async send(options: SendOptions): Promise<SendResult> {
    return this.messages.send(options);
  }

  /** Singular alias, so `sms.pattern.send(...)` reads naturally for OTP call sites. */
  get pattern(): { send: (options: PatternSendOptions) => Promise<SendResult> } {
    return { send: (options) => this.patterns.send(options) };
  }

  /* -------------------------------------------------------------- namespaces */

  readonly messages = {
    send: async (options: SendOptions): Promise<SendResult> => {
      const provider = await this.call('send', 'send');
      const result = await provider.send!(options);
      this.emit('sent', { provider: provider.id, result });
      return result;
    },

    sendBulk: async (options: BulkSendOptions): Promise<SendResult> => {
      const provider = await this.call('bulk', 'sendBulk');
      const result = await provider.sendBulk!(options);
      this.emit('sent', { provider: provider.id, result });
      return result;
    },

    sendPeerToPeer: async (
      peers: readonly PeerMessage[],
      options?: Omit<SendOptions, 'to' | 'message'>,
    ): Promise<SendResult> => {
      const provider = await this.call('peerToPeer', 'sendPeerToPeer');
      const result = await provider.sendPeerToPeer!(peers, options);
      this.emit('sent', { provider: provider.id, result });
      return result;
    },

    /** Send at a future time. Equivalent to `send` with `scheduleAt` set. */
    schedule: async (options: SendOptions & { scheduleAt: Date | string }): Promise<SendResult> => {
      const provider = await this.call('scheduled', 'send');
      const result = await provider.send!(options);
      this.emit('sent', { provider: provider.id, result });
      return result;
    },

    cancelScheduled: async (id: string): Promise<{ success: boolean; raw: unknown }> => {
      const provider = await this.call('cancelScheduled', 'cancelScheduled');
      return provider.cancelScheduled!(id);
    },

    getStatus: async (messageId: string): Promise<StatusResult> => {
      const provider = await this.call('deliveryReports', 'getStatus');
      return provider.getStatus!(messageId);
    },

    getStatuses: async (messageIds: readonly string[]): Promise<StatusResult[]> => {
      const provider = await this.call('deliveryReports', 'getStatuses');
      return provider.getStatuses!(messageIds);
    },

    list: async (options?: ListOptions): Promise<Page<OutboxMessage>> => {
      const provider = await this.call('outbox', 'listOutbox');
      return provider.listOutbox!(options);
    },

    get: async (messageId: string): Promise<OutboxMessage> => {
      const provider = await this.call('outbox', 'getMessage');
      return provider.getMessage!(messageId);
    },
  };

  readonly patterns = {
    send: async (options: PatternSendOptions): Promise<SendResult> => {
      const provider = await this.call('pattern', 'sendPattern');
      const result = await provider.sendPattern!(options);
      this.emit('sent', { provider: provider.id, result });
      return result;
    },
    list: async (options?: ListOptions): Promise<Page<PatternInfo>> => {
      const provider = await this.call('patternManagement', 'listPatterns');
      return provider.listPatterns!(options);
    },
    get: async (code: string): Promise<PatternInfo> => {
      const provider = await this.call('patternManagement', 'getPattern');
      return provider.getPattern!(code);
    },
    create: async (input: {
      body: string;
      description?: string;
      variables?: readonly string[];
      shared?: boolean;
    }): Promise<PatternInfo> => {
      const provider = await this.call('patternManagement', 'createPattern');
      return provider.createPattern!(input);
    },
    update: async (
      code: string,
      input: { body?: string; description?: string; variables?: readonly string[]; shared?: boolean },
    ): Promise<PatternInfo> => {
      const provider = await this.call('patternManagement', 'updatePattern');
      return provider.updatePattern!(code, input);
    },
    delete: async (code: string): Promise<{ success: boolean; raw: unknown }> => {
      const provider = await this.call('patternManagement', 'deletePattern');
      return provider.deletePattern!(code);
    },
  };

  readonly account = {
    getBalance: async (): Promise<BalanceResult> => {
      const provider = await this.call('balance', 'getBalance');
      return provider.getBalance!();
    },
    getInfo: async (): Promise<AccountInfo> => {
      const provider = await this.call('balance', 'getAccountInfo');
      return provider.getAccountInfo!();
    },
    estimatePrice: async (options: {
      to: string | readonly string[];
      message: string;
      from?: string;
    }): Promise<PriceEstimate> => {
      const provider = await this.call('pricing', 'estimatePrice');
      return provider.estimatePrice!(options);
    },
  };

  readonly senders = {
    list: async (): Promise<Sender[]> => {
      const provider = await this.call('senders', 'listSenders');
      return provider.listSenders!();
    },
  };

  readonly inbox = {
    list: async (options?: ListOptions): Promise<Page<InboxMessage>> => {
      const provider = await this.call('inbox', 'listInbox');
      return provider.listInbox!(options);
    },
  };

  readonly contacts = {
    list: async (options?: ListOptions): Promise<Page<Contact>> => {
      const provider = await this.call('contacts', 'listContacts');
      return provider.listContacts!(options);
    },
    create: async (input: {
      number: string;
      name?: string;
      email?: string;
      groupId?: string;
    }): Promise<Contact> => {
      const provider = await this.call('contacts', 'createContact');
      return provider.createContact!(input);
    },
    delete: async (id: string): Promise<{ success: boolean; raw: unknown }> => {
      const provider = await this.call('contacts', 'deleteContact');
      return provider.deleteContact!(id);
    },
  };

  readonly groups = {
    list: async (options?: ListOptions): Promise<Page<ContactGroup>> => {
      const provider = await this.call('contacts', 'listContactGroups');
      return provider.listContactGroups!(options);
    },
  };

  readonly blacklist = {
    check: async (number: string, line?: string): Promise<boolean> => {
      const provider = await this.call('blacklistRead', 'isBlacklisted');
      return provider.isBlacklisted!(number, line);
    },
    list: async (line: string, options?: ListOptions): Promise<Page<{ number: string; raw: unknown }>> => {
      const provider = await this.call('blacklistRead', 'listBlacklist');
      return provider.listBlacklist!(line, options);
    },
    add: async (line: string, numbers: readonly string[]): Promise<{ success: boolean; raw: unknown }> => {
      const provider = await this.call('blacklistWrite', 'addToBlacklist');
      return provider.addToBlacklist!(line, numbers);
    },
    remove: async (line: string, numbers: readonly string[]): Promise<{ success: boolean; raw: unknown }> => {
      const provider = await this.call('blacklistWrite', 'removeFromBlacklist');
      return provider.removeFromBlacklist!(line, numbers);
    },
  };

  readonly webhooks = {
    list: async (): Promise<
      Array<{ id: string; url: string; active: boolean; kind: string; raw: unknown }>
    > => {
      const provider = await this.call('webhookManagement', 'listWebhooks');
      return provider.listWebhooks!();
    },
    create: async (input: {
      url: string;
      kind: 'delivery' | 'inbound';
    }): Promise<{ id: string; raw: unknown }> => {
      const provider = await this.call('webhookManagement', 'createWebhook');
      return provider.createWebhook!(input);
    },
    setActive: async (
      id: string,
      active: boolean,
      kind: 'delivery' | 'inbound',
    ): Promise<{ success: boolean; raw: unknown }> => {
      const provider = await this.call('webhookManagement', 'setWebhookActive');
      return provider.setWebhookActive!(id, active, kind);
    },
  };

  readonly voice = {
    send: async (options: {
      to: string | readonly string[];
      message: string;
      scheduleAt?: Date | string;
    }): Promise<SendResult> => {
      const provider = await this.call('voice', 'sendVoice');
      return provider.sendVoice!(options);
    },
  };

  /* -------------------------------------------------------------- internals */

  /**
   * Load the adapter and assert it really implements `method`.
   *
   * Checks the capability flag *and* the method, because the two can disagree — a provider
   * may support a feature that this adapter has not implemented yet, and the caller
   * deserves to know which of the two is the problem.
   */
  private async call(capability: CapabilityName, method: keyof BaseProvider): Promise<BaseProvider> {
    const provider = await this.ready();
    const implemented = typeof (provider as unknown as Record<string, unknown>)[method] === 'function';

    if (!implemented) {
      const declared = this.entry.capabilities[capability];
      throw new SMSUnsupportedFeatureError(
        declared
          ? `Provider "${provider.id}" declares "${capability}" but this adapter does not implement ` +
              `"${String(method)}" yet. See docs/API-COVERAGE.md.`
          : `Provider "${provider.id}" does not support "${capability}". ` +
              `Check \`sms.supports('${capability}')\` first, or see docs/provider-matrix.md.`,
        { provider: provider.id, feature: capability, code: 'unsupported_feature' },
      );
    }
    return provider;
  }

  private assertCredentials(): void {
    const credentials = this.config.credentials ?? {};
    const missing: string[] = [];

    for (const spec of this.entry.requiredCredentials) {
      const keys = spec.oneOf ?? [spec.key];
      const satisfied = keys.some((key) => {
        const value = credentials[key];
        return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
      });
      if (!satisfied) {
        const label = spec.oneOf ? spec.oneOf.join(' or ') : spec.key;
        const env = spec.env ? ` (commonly ${spec.env})` : '';
        missing.push(`  - credentials.${label}${env}: ${spec.description}`);
      }
    }

    if (missing.length > 0) {
      throw new SMSConfigurationError(
        `Missing credentials for provider "${this.entry.id}":\n${missing.join('\n')}`,
        { provider: this.entry.id, code: 'missing_credentials' },
      );
    }
  }

  /**
   * A provider with no known API host must be given one explicitly.
   *
   * Two situations lead here, and both are treated the same way: the platform mapping is
   * inferred rather than confirmed, or the platform is confirmed but the deployment's host
   * is not published (or no longer resolves). Either way, defaulting a URL would mean this
   * package had decided, with no evidence, where a real customer's messages get sent.
   */
  private assertBaseUrl(): void {
    if (this.entry.defaultBaseUrl) return;
    if (this.config.request?.baseUrl) return;

    const reason = this.entry.unverified
      ? `Its platform mapping ("${this.entry.platform}") is inferred rather than confirmed`
      : `It runs the "${this.entry.platform}" platform, but its API host is not published`;

    throw new SMSConfigurationError(
      `Provider "${this.entry.id}" has no known API endpoint, so this package will not guess one. ` +
        'Supply the base URL from your panel:\n' +
        `  new SMS({ provider: '${this.entry.id}', request: { baseUrl: 'https://…' }, credentials: { … } })\n` +
        `${reason} — see docs/providers/${this.entry.id}.md and docs/provider-relations.md.`,
      { provider: this.entry.id, code: 'base_url_required' },
    );
  }
}
