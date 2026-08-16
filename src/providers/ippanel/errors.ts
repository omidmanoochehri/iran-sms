/**
 * IPPanel Edge envelope handling and error mapping.
 *
 * Every Edge response is `{ data, meta }`, and `meta.status` is the real success flag —
 * a 200 with `meta.status: false` is a failure. Validation detail arrives as
 * `meta.errors: { field: [messages] }`, except on the login endpoint where `errors` sits
 * at the *top level*; both shapes are handled here.
 *
 * Source: https://docs.ippanel.com/ — verified 2026-08-16.
 */

import {
  SMSAuthenticationError,
  SMSError,
  SMSInsufficientCreditError,
  SMSPatternError,
  SMSRateLimitError,
  SMSValidationError,
  type SMSErrorOptions,
} from '../../core/errors.js';

export interface EdgeMeta {
  status?: boolean;
  message?: string;
  message_code?: string;
  message_parameters?: unknown[];
  errors?: Record<string, string[]>;
  current_page?: number;
  from?: number;
  last_page?: number;
  per_page?: number;
  to?: number;
  total?: number;
  path?: string;
}

export interface EdgeEnvelope<T = unknown> {
  data: T;
  meta?: EdgeMeta;
  /** Present only on the login endpoint, which puts validation errors at the top level. */
  errors?: Record<string, string[]>;
}

/** True when the body looks like an Edge envelope. */
export function isEnvelope(value: unknown): value is EdgeEnvelope {
  return typeof value === 'object' && value !== null && ('meta' in value || 'data' in value);
}

function collectFields(body: EdgeEnvelope | undefined): Record<string, string[]> | undefined {
  const fields = body?.meta?.errors ?? body?.errors;
  if (!fields || Object.keys(fields).length === 0) return undefined;
  return fields;
}

/**
 * Turn a non-successful Edge response into a typed error.
 *
 * Classification uses the HTTP status first (which Edge sets meaningfully) and then the
 * Persian `meta.message`, because Edge has no numeric business-error taxonomy — its
 * `message_code` values (`400-1`, `400-2`, …) describe the *shape* of the failure, not its
 * cause.
 */
export function toError(
  status: number,
  body: unknown,
  context: { endpoint: string; provider: string },
): SMSError {
  const envelope = isEnvelope(body) ? body : undefined;
  const meta = envelope?.meta;
  const message = meta?.message ?? `IPPanel request failed with HTTP ${status}`;
  const fields = collectFields(envelope);

  const base: SMSErrorOptions = {
    provider: context.provider,
    code: meta?.message_code ?? status,
    status,
    endpoint: context.endpoint,
    raw: body,
  };

  if (status === 401 || status === 403) {
    return new SMSAuthenticationError(`${message} (IPPanel rejected the API key or token)`, base);
  }

  if (status === 429) {
    return new SMSRateLimitError(message, base);
  }

  if (status === 422 || fields) {
    return new SMSValidationError(message, fields ? { ...base, fields } : base);
  }

  // Edge reports these in prose only; match on the Persian text the API actually returns.
  if (/اعتبار/.test(message) && /کافی|کم/.test(message)) {
    return new SMSInsufficientCreditError(message, base);
  }
  if (/پترن|الگو/.test(message)) {
    return new SMSPatternError(message, base);
  }

  return new SMSError(message, { ...base, retryable: status >= 500 });
}

/**
 * Unwrap a successful envelope, or throw.
 *
 * `meta.status === false` on a 2xx is a real IPPanel behaviour, so HTTP-level success is
 * not sufficient to treat a response as good.
 */
export function unwrap<T>(
  response: { status: number; ok: boolean; data: unknown; url: string },
  context: { endpoint: string; provider: string },
): { data: T; meta: EdgeMeta | undefined } {
  const body = response.data;
  const envelope = isEnvelope(body) ? (body as EdgeEnvelope<T>) : undefined;

  if (!response.ok || envelope?.meta?.status === false) {
    throw toError(response.status, body, context);
  }

  if (!envelope) {
    // Not an envelope at all — usually an HTML error page from an intermediary.
    throw new SMSError('IPPanel returned an unrecognised response body.', {
      provider: context.provider,
      status: response.status,
      endpoint: context.endpoint,
      raw: body,
    });
  }

  return { data: envelope.data, meta: envelope.meta };
}
