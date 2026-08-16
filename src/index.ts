/**
 * iran-sms — a unified SDK for Iranian SMS gateways.
 *
 * One normalized API across every supported provider, plus each provider's complete native
 * API. Nothing is emulated: a capability a provider does not have raises a typed
 * {@link SMSUnsupportedFeatureError} rather than being faked.
 *
 * @example Unified send
 * ```ts
 * import { SMS } from 'iran-sms';
 *
 * const sms = new SMS({
 *   provider: 'ippanel',
 *   credentials: { apiKey: process.env.IPPANEL_API_KEY! },
 *   sender: '+983000505',
 * });
 *
 * await sms.send({ to: '09121234567', message: 'Hello' });
 * ```
 *
 * @example Provider-native access
 * ```ts
 * import { KavenegarProvider } from 'iran-sms/providers/kavenegar';
 *
 * const kavenegar = new KavenegarProvider({ credentials: { apiKey: process.env.KAVENEGAR_API_KEY! } });
 * await kavenegar.native.verifyLookup({ receptor: '09121234567', token: '123456', template: 'login' });
 * ```
 */

import { SMS as SMSClass } from './core/SMS.js';
import { Multi } from './core/Multi.js';

export type SMSConstructor = typeof SMSClass & {
  /** Multi-provider orchestration with optional routing and failover. */
  Multi: typeof Multi;
};

/**
 * The unified client.
 *
 * `SMS.Multi` is attached as a static so the documented `new SMS.Multi({ … })` form works
 * alongside the named `Multi` export.
 */
export const SMS: SMSConstructor = Object.assign(SMSClass, { Multi });

export { Multi };
export type { SMSConfig, NativeProxy } from './core/SMS.js';
export type { MultiConfig, FailoverConfig, FailoverReason, RoutingConfig } from './core/Multi.js';
export { DEFAULT_FAILOVER_REASONS } from './core/Multi.js';

/* ------------------------------------------------------------------ errors */

export {
  SMSError,
  SMSProviderError,
  SMSAuthenticationError,
  SMSValidationError,
  SMSInsufficientCreditError,
  SMSRateLimitError,
  SMSPatternError,
  SMSRecipientError,
  SMSNetworkError,
  SMSTimeoutError,
  SMSUnsupportedFeatureError,
  SMSConfigurationError,
  isSMSError,
  isFailoverEligible,
} from './core/errors.js';
export type { SMSErrorKind, SMSErrorOptions } from './core/errors.js';

/* ------------------------------------------------------------------ phone utilities */

export {
  parsePhone,
  formatPhone,
  formatPhones,
  isIranianMobile,
  detectOperator,
  toAsciiDigits,
} from './core/phone.js';
export type { ParsedPhone, PhoneFormat, IranOperator } from './core/phone.js';

/* ------------------------------------------------------------------ registry & catalog */

export { ProviderRegistry } from './core/ProviderRegistry.js';
export { CATALOG, catalogIds, findCatalogEntry } from './providers/catalog.js';
export type { CatalogEntry, PlatformId, ProviderConstructor } from './providers/catalog.js';

/* ------------------------------------------------------------------ building blocks */

export { BaseProvider } from './core/Provider.js';
export type { Credentials, ProviderConfig, CredentialSpec } from './core/Provider.js';
export { PatternRegistry, renderPatternBody, orderVariables } from './core/pattern-registry.js';
export { EventBus } from './core/events.js';
export type { EventMap, EventName, Listener } from './core/events.js';
export { HttpClient } from './core/http.js';
export type { HttpRequestOptions, HttpResponse, HttpClientOptions } from './core/http.js';
export { maskSecret, redactValue, redactUrl, redactHeaders } from './core/redact.js';
export {
  parseProviderDate,
  toUnixSeconds,
  toUtcDateTime,
  toTehranDateTime,
  toIsoUtc,
  TEHRAN_TIME_ZONE,
} from './core/datetime.js';

/* ------------------------------------------------------------------ types */

export { NO_CAPABILITIES } from './core/types.js';
export type {
  AccountInfo,
  BalanceResult,
  BulkSendOptions,
  Capabilities,
  CapabilityName,
  Contact,
  ContactGroup,
  InboxMessage,
  ListOptions,
  MessageStatus,
  OutboxMessage,
  Page,
  PatternBinding,
  PatternInfo,
  PatternRegistryConfig,
  PatternSendOptions,
  PeerMessage,
  PriceEstimate,
  ProviderMeta,
  RequestConfig,
  SendOptions,
  SendResult,
  SendResultPart,
  Sender,
  StatusResult,
} from './core/types.js';

/** Package version, also available as `SMS.version`. */
export const version = '0.1.0';

export default SMS;
