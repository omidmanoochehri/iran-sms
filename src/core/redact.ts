/**
 * Secret redaction for debug output, events and error messages.
 *
 * The rule this package follows: a credential is redacted at the point it would leave the
 * process, not at the point it is stored. Everything that can emit — the debug logger, the
 * event bus, error `endpoint` fields — passes through here first.
 */

/** Header names whose values are always secret, matched case-insensitively. */
const SECRET_HEADERS = new Set([
  'authorization',
  'api-key',
  'apikey',
  'x-api-key',
  'x-apikey',
  'token',
  'x-token',
  'access-token',
  'x-access-token',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

/** Body/query keys whose values are always secret, matched case-insensitively. */
const SECRET_KEYS = new Set([
  'apikey',
  'api_key',
  'api-key',
  'accesskey',
  'access_key',
  'password',
  'pass',
  'passwd',
  'pwd',
  'secret',
  'token',
  'access_token',
  'accesstoken',
  'auth_key',
  'authkey',
  'authorization',
  'key',
  'signature',
]);

/**
 * Keys holding one-time codes. Redacted by default because an OTP in a log is a live
 * credential for as long as it is valid.
 */
const OTP_KEYS = new Set(['otp', 'code', 'token1', 'verificationcode', 'verification_code']);

/**
 * Mask a secret so it stays diagnosable (you can tell *which* key it is) without being
 * usable. Short values are fully masked — showing 4 of 8 characters is not a redaction.
 */
export function maskSecret(value: unknown): string {
  if (typeof value !== 'string') return '****';
  if (value.length <= 8) return '*'.repeat(Math.max(value.length, 4));
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 4, 12))}`;
}

export function isSecretHeader(name: string): boolean {
  return SECRET_HEADERS.has(name.toLowerCase());
}

export function isSecretKey(name: string): boolean {
  return SECRET_KEYS.has(name.toLowerCase().replace(/[\s-]/g, '_')) || SECRET_KEYS.has(name.toLowerCase());
}

export function redactHeaders(headers: Record<string, string> | Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const entries: Iterable<[string, string]> =
    headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [k, v] of entries) {
    out[k] = isSecretHeader(k) ? maskSecret(v) : v;
  }
  return out;
}

export interface RedactValueOptions {
  /** Also redact one-time codes. Default `true`. */
  redactOtp?: boolean;
  /** Recursion guard. */
  maxDepth?: number;
}

/** Deep-copy a value with every secret-looking field masked. Cycles become `"[Circular]"`. */
export function redactValue<T>(value: T, options: RedactValueOptions = {}): unknown {
  const { redactOtp = true, maxDepth = 8 } = options;
  const seen = new WeakSet<object>();

  const walk = (input: unknown, depth: number): unknown => {
    if (depth > maxDepth) return '[MaxDepth]';
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input);

    if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));
    if (input instanceof Date) return input.toISOString();
    if (input instanceof URLSearchParams) return walk(Object.fromEntries(input.entries()), depth);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSecretKey(k) || (redactOtp && OTP_KEYS.has(k.toLowerCase()))) {
        out[k] = maskSecret(v);
      } else {
        out[k] = walk(v, depth + 1);
      }
    }
    return out;
  };

  return walk(value, 0);
}

/**
 * Redact secrets carried inside a URL — both query parameters and path segments.
 *
 * The path-segment case is not theoretical: Kavenegar puts the API key in the path
 * (`/v1/{API-KEY}/sms/send.json`), so a naive query-only redactor would leak the key
 * into every log line and error message.
 */
export function redactUrl(url: string, extraSecrets: readonly string[] = []): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return redactRawSecrets(url, extraSecrets);
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (isSecretKey(key)) parsed.searchParams.set(key, maskSecret(parsed.searchParams.get(key)));
  }

  let result = parsed.toString();
  result = redactRawSecrets(result, extraSecrets);
  return result;
}

/** Replace known secret literals wherever they appear in a string. */
export function redactRawSecrets(input: string, secrets: readonly string[]): string {
  let out = input;
  for (const secret of secrets) {
    if (!secret || secret.length < 6) continue;
    out = out.split(secret).join(maskSecret(secret));
  }
  return out;
}
