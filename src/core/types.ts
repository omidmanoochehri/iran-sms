/** Shared, provider-independent types for the unified API. */

import type { PhoneFormat } from './phone.js';

/* ------------------------------------------------------------------ capabilities */

/**
 * Capability flags. Every value is derived from the provider's own documentation and
 * recorded in `docs/provider-matrix.md`; nothing here is inferred from a sibling provider.
 */
export interface Capabilities {
  /** Send a plain text message to one or more recipients. */
  send: boolean;
  /** Send one text to many recipients in a single call. */
  bulk: boolean;
  /** Send a different text per recipient in a single call. */
  peerToPeer: boolean;
  /** Send using a pre-approved pattern/template. */
  pattern: boolean;
  /** Create/update/delete patterns through the API. */
  patternManagement: boolean;
  /** Schedule a message for a future time. */
  scheduled: boolean;
  /** Cancel a previously scheduled message. */
  cancelScheduled: boolean;
  /** Per-message or per-batch delivery status. */
  deliveryReports: boolean;
  /** List previously sent messages. */
  outbox: boolean;
  /** Read received (inbound) messages. */
  inbox: boolean;
  /** Query account balance. */
  balance: boolean;
  /** List available sender lines. */
  senders: boolean;
  /** Contact / phonebook management. */
  contacts: boolean;
  /** Read blacklist state. */
  blacklistRead: boolean;
  /** Add to / remove from the blacklist. */
  blacklistWrite: boolean;
  /** Register or manage webhook URLs through the API. */
  webhookManagement: boolean;
  /** Provider can push delivery/inbound events to a URL (even if configured in the panel). */
  webhookDelivery: boolean;
  /** Voice call / text-to-speech / voice OTP. */
  voice: boolean;
  /** Estimate the cost of a send before making it. */
  pricing: boolean;
  /** Documented support for sending outside Iran. */
  international: boolean;
  /** A caller-supplied key that makes a send idempotent at the provider. */
  idempotentSend: boolean;
}

export type CapabilityName = keyof Capabilities;

/** All capabilities off. Adapters start here and switch on only what they can prove. */
export const NO_CAPABILITIES: Readonly<Capabilities> = Object.freeze({
  send: false,
  bulk: false,
  peerToPeer: false,
  pattern: false,
  patternManagement: false,
  scheduled: false,
  cancelScheduled: false,
  deliveryReports: false,
  outbox: false,
  inbox: false,
  balance: false,
  senders: false,
  contacts: false,
  blacklistRead: false,
  blacklistWrite: false,
  webhookManagement: false,
  webhookDelivery: false,
  voice: false,
  pricing: false,
  international: false,
  idempotentSend: false,
});

/* ------------------------------------------------------------------ results */

/** Normalized lifecycle state, mapped from each provider's own vocabulary. */
export type MessageStatus =
  | 'queued'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'unknown';

/** Every normalized result carries the untouched provider payload in `raw`. */
export interface RawCarrier {
  /** The provider's response, exactly as received. Never reshaped. */
  raw: unknown;
}

export interface SendResult extends RawCarrier {
  success: boolean;
  provider: string;
  /**
   * Provider message id. `null` when the provider only returns a batch identifier —
   * check `batchId` in that case.
   */
  messageId: string | null;
  /** Batch/pack/bulk identifier, when the provider groups sends. */
  batchId: string | null;
  /** Recipients as this package sent them to the provider. */
  recipients: string[];
  status: MessageStatus;
  /** Cost in the provider's own unit; see `currency`. `null` when not reported. */
  cost: number | null;
  /** Unit `cost` is expressed in. Providers differ: Kavenegar reports Rial, others Toman. */
  currency: 'IRR' | 'IRT' | 'credit' | null;
  /** Per-recipient outcomes, when the provider reports them individually. */
  parts?: SendResultPart[];
}

export interface SendResultPart {
  recipient: string;
  messageId: string | null;
  status: MessageStatus;
  cost: number | null;
  /** Provider-native status value for this recipient, unmapped. */
  nativeStatus: string | number | null;
}

export interface StatusResult extends RawCarrier {
  provider: string;
  messageId: string;
  status: MessageStatus;
  /** Provider-native status value, unmapped. */
  nativeStatus: string | number | null;
  recipient: string | null;
  deliveredAt: Date | null;
}

export interface BalanceResult extends RawCarrier {
  provider: string;
  /** Remaining balance in `currency`. */
  amount: number | null;
  currency: 'IRR' | 'IRT' | 'credit' | null;
  /** Remaining message count, when the provider expresses balance that way. */
  messageCount: number | null;
}

export interface AccountInfo extends RawCarrier {
  provider: string;
  username: string | null;
  displayName: string | null;
  mobile: string | null;
  expiresAt: Date | null;
}

export interface Sender extends RawCarrier {
  provider: string;
  number: string;
  /** `true` when the line is dedicated to this account, `null` when not reported. */
  dedicated: boolean | null;
}

export interface InboxMessage extends RawCarrier {
  provider: string;
  messageId: string | null;
  from: string;
  to: string | null;
  text: string;
  receivedAt: Date | null;
}

export interface OutboxMessage extends RawCarrier {
  provider: string;
  messageId: string | null;
  batchId: string | null;
  to: string | null;
  from: string | null;
  text: string | null;
  status: MessageStatus;
  cost: number | null;
  sentAt: Date | null;
}

export interface PatternInfo extends RawCarrier {
  provider: string;
  /** The identifier used when sending. String even when the provider uses an integer. */
  code: string;
  title: string | null;
  body: string | null;
  status: 'active' | 'pending' | 'rejected' | 'unknown';
  variables: string[];
}

export interface Contact extends RawCarrier {
  provider: string;
  id: string | null;
  number: string;
  name: string | null;
  email: string | null;
  groupId: string | null;
}

export interface ContactGroup extends RawCarrier {
  provider: string;
  id: string;
  title: string | null;
  count: number | null;
}

export interface PriceEstimate extends RawCarrier {
  provider: string;
  /** Total cost for the whole request, when the provider gives one. */
  total: number | null;
  currency: 'IRR' | 'IRT' | 'credit' | null;
  /** Number of SMS parts the text will be split into. */
  parts: number | null;
}

/** Normalized page wrapper. Provider-native paging fields stay available in `raw`. */
export interface Page<T> extends RawCarrier {
  items: T[];
  page: number | null;
  pageSize: number | null;
  total: number | null;
}

/* ------------------------------------------------------------------ requests */

export interface SendOptions {
  /** One recipient or many. */
  to: string | readonly string[];
  message: string;
  /** Sender line. Falls back to the provider-level `sender` credential when omitted. */
  from?: string;
  /** Schedule for a future time. See `docs/sending.md` for per-provider timezone handling. */
  scheduleAt?: Date | string;
  /**
   * Caller-supplied idempotency key. Only honoured by providers whose
   * `capabilities.idempotentSend` is `true`; ignored (with a debug log) elsewhere.
   */
  idempotencyKey?: string;
  /** Escape hatch: merged into the provider request body verbatim, after mapping. */
  providerOptions?: Record<string, unknown>;
}

export interface BulkSendOptions extends Omit<SendOptions, 'to'> {
  to: readonly string[];
}

export interface PeerMessage {
  to: string | readonly string[];
  message: string;
}

export interface PatternSendOptions {
  to: string | readonly string[];
  /** Logical pattern name (resolved via the pattern registry) or a raw provider code. */
  pattern: string | number;
  /** Variable name → value. Adapters map this to whatever shape the provider needs. */
  variables?: Record<string, string | number>;
  from?: string;
  scheduleAt?: Date | string;
  providerOptions?: Record<string, unknown>;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  from?: Date | string;
  to?: Date | string;
  providerOptions?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ config */

export interface RequestConfig {
  /** Per-request timeout in milliseconds. Default 15000, or the provider's own default. */
  timeout?: number;
  /**
   * Retry attempts for **safe** requests only. Sends are never retried unless the provider
   * supports idempotency *and* the caller supplied an idempotency key. Default 2.
   */
  retries?: number;
  /** Base delay for exponential backoff, in ms. Default 300. */
  retryDelay?: number;
  /** Extra headers merged into every request. Cannot override auth headers. */
  headers?: Record<string, string>;
  /** Override the provider's base URL. Required for some white-label deployments. */
  baseUrl?: string;
  /** Custom `fetch`. Useful for proxies, mocking, and instrumentation. */
  fetch?: typeof globalThis.fetch;
  /** User-Agent suffix appended to the package's own. */
  userAgent?: string;
}

/** Logical pattern name → per-provider code. See `docs/patterns.md`. */
export type PatternRegistryConfig = Record<string, Record<string, string | number | PatternBinding>>;

/**
 * A pattern binding with explicit variable ordering.
 *
 * Required for providers that accept pattern values **positionally** (AmootSMS sends a
 * comma-separated `PatternValues` with no names). Without an order this package refuses to
 * guess, because guessing wrong silently sends the wrong values to a real person.
 */
export interface PatternBinding {
  code: string | number;
  /** Variable names in the exact order the provider expects them. */
  variableOrder?: readonly string[];
  /** Literal template body, for providers that require the fully rendered text. */
  body?: string;
}

export interface ProviderMeta {
  id: string;
  name: string;
  /** Human-readable API generation, e.g. `edge-v1`. */
  apiVersion: string;
  documentation: string;
  /** Wire format this provider expects for recipient numbers. */
  phoneFormat: PhoneFormat;
  capabilities: Capabilities;
  /** Set when this provider runs another vendor's platform. See `docs/provider-relations.md`. */
  platform?: string;
}
