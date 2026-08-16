/**
 * Normalized error hierarchy.
 *
 * Every error thrown by this package is an {@link SMSError}. Provider adapters map their
 * native failure codes onto these subclasses so that calling code can branch on error
 * *kind* without knowing which gateway produced it, while `code` and `raw` always preserve
 * the untouched provider-native detail.
 */

/** Machine-readable kind, stable across providers. */
export type SMSErrorKind =
  | 'provider'
  | 'authentication'
  | 'validation'
  | 'insufficient_credit'
  | 'rate_limit'
  | 'pattern'
  | 'recipient'
  | 'network'
  | 'timeout'
  | 'unsupported_feature'
  | 'configuration';

export interface SMSErrorOptions {
  /** Provider id the error originated from, when known. */
  provider?: string | undefined;
  /** Provider-native error code, preserved verbatim (string or number). */
  code?: string | number | undefined;
  /** HTTP status code, when the failure came from an HTTP response. */
  status?: number | undefined;
  /** Untouched provider response body or underlying error. */
  raw?: unknown;
  /** Underlying error, when this one wraps another. */
  cause?: unknown;
  /** Endpoint that produced the failure, with secrets already redacted. */
  endpoint?: string | undefined;
  /**
   * Whether retrying the identical request is safe. Defaults to `false`: the library
   * never assumes a send can be repeated (see `docs/errors.md`).
   */
  retryable?: boolean | undefined;
}

/** Base class for every error this package throws. */
export class SMSError extends Error {
  /** Stable, provider-independent classification. */
  readonly kind: SMSErrorKind = 'provider';
  readonly provider: string | undefined;
  readonly code: string | number | undefined;
  readonly status: number | undefined;
  readonly endpoint: string | undefined;
  readonly raw: unknown;
  readonly retryable: boolean;

  constructor(message: string, options: SMSErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.provider = options.provider;
    this.code = options.code;
    this.status = options.status;
    this.endpoint = options.endpoint;
    this.raw = options.raw;
    this.retryable = options.retryable ?? false;
    Error.captureStackTrace?.(this, new.target);
  }

  /**
   * JSON-safe view. `raw` is included because advanced consumers rely on it, but note
   * that it is the provider's response body — this package guarantees it never contains
   * credentials the *library* added, not that a provider never echoes something back.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      provider: this.provider,
      code: this.code,
      status: this.status,
      endpoint: this.endpoint,
      retryable: this.retryable,
      raw: this.raw,
    };
  }
}

/** Credentials missing, malformed, rejected, revoked, or IP-restricted. */
export class SMSAuthenticationError extends SMSError {
  override readonly kind = 'authentication' as const;
}

/** The request was well-formed for HTTP but rejected on its contents. */
export class SMSValidationError extends SMSError {
  override readonly kind = 'validation' as const;
  /** Field-level detail when the provider supplies it. */
  readonly fields: Record<string, string[]> | undefined;

  constructor(
    message: string,
    options: SMSErrorOptions & { fields?: Record<string, string[]> | undefined } = {},
  ) {
    super(message, options);
    this.fields = options.fields;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), fields: this.fields };
  }
}

/** Account balance too low to accept the request. */
export class SMSInsufficientCreditError extends SMSError {
  override readonly kind = 'insufficient_credit' as const;
}

/** Provider throttled the request. */
export class SMSRateLimitError extends SMSError {
  override readonly kind = 'rate_limit' as const;
  /** Seconds to wait before retrying, when the provider says. */
  readonly retryAfter: number | undefined;

  constructor(message: string, options: SMSErrorOptions & { retryAfter?: number | undefined } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), retryAfter: this.retryAfter };
  }
}

/** Pattern/template unknown, unapproved, rejected, or given wrong variables. */
export class SMSPatternError extends SMSError {
  override readonly kind = 'pattern' as const;
}

/** Recipient invalid, blacklisted, or otherwise unreachable. */
export class SMSRecipientError extends SMSError {
  override readonly kind = 'recipient' as const;
}

/** Transport failed: DNS, TCP, TLS, socket reset, aborted stream. */
export class SMSNetworkError extends SMSError {
  override readonly kind = 'network' as const;
  constructor(message: string, options: SMSErrorOptions = {}) {
    super(message, { retryable: true, ...options });
  }
}

/** The request exceeded the configured timeout. */
export class SMSTimeoutError extends SMSError {
  override readonly kind = 'timeout' as const;
  readonly timeoutMs: number | undefined;

  constructor(message: string, options: SMSErrorOptions & { timeoutMs?: number | undefined } = {}) {
    super(message, { retryable: true, ...options });
    this.timeoutMs = options.timeoutMs;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs };
  }
}

/** The selected provider does not offer the requested capability. */
export class SMSUnsupportedFeatureError extends SMSError {
  override readonly kind = 'unsupported_feature' as const;
  readonly feature: string | undefined;

  constructor(message: string, options: SMSErrorOptions & { feature?: string | undefined } = {}) {
    super(message, options);
    this.feature = options.feature;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), feature: this.feature };
  }
}

/** Client-side misconfiguration, detected before any network call. */
export class SMSConfigurationError extends SMSError {
  override readonly kind = 'configuration' as const;
}

/** Backwards-compatible alias; `SMSError` is the base of the whole hierarchy. */
export const SMSProviderError = SMSError;

/**
 * Errors that mean "the request itself is wrong". Failing over to another provider with
 * the identical request cannot succeed, so {@link Multi} must never do it.
 */
const NON_FAILOVER_KINDS: ReadonlySet<SMSErrorKind> = new Set<SMSErrorKind>([
  'authentication',
  'validation',
  'pattern',
  'recipient',
  'unsupported_feature',
  'configuration',
  'insufficient_credit',
]);

/** True when trying the same request against a different provider could plausibly help. */
export function isFailoverEligible(error: unknown): boolean {
  if (!(error instanceof SMSError)) return false;
  return !NON_FAILOVER_KINDS.has(error.kind);
}

export function isSMSError(value: unknown): value is SMSError {
  return value instanceof SMSError;
}
