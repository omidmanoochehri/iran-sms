/**
 * Shared HTTP transport.
 *
 * Design notes that matter:
 *
 * - **Retries are opt-in per call, never per client.** `HttpClient` will only retry a
 *   request whose `idempotent` flag is explicitly `true`. Adapters set it on reads. Sends
 *   set it only when the provider supports a duplicate-protection key *and* the caller
 *   supplied one. A duplicated SMS costs the user money and annoys their customer, so the
 *   default has to be "don't".
 * - **Timeouts abort the socket**, they do not merely reject the promise, so a slow provider
 *   cannot pin a connection open.
 * - Every emitted string — debug lines, events, error `endpoint` — goes through redaction.
 */

import { SMSNetworkError, SMSTimeoutError, type SMSErrorOptions } from './errors.js';
import { redactHeaders, redactUrl, redactValue } from './redact.js';
import type { EventBus } from './events.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type BodyKind = 'json' | 'form' | 'multipart' | 'text' | 'none';

export interface HttpRequestOptions {
  method?: HttpMethod;
  /** Path appended to the client's base URL, or an absolute URL. */
  path: string;
  query?: Record<string, unknown> | undefined;
  headers?: Record<string, string> | undefined;
  body?: unknown;
  bodyKind?: BodyKind;
  /** Overrides the client default for this call only. */
  timeout?: number | undefined;
  /**
   * Whether replaying this exact request is safe. Only `true` enables retries.
   * Defaults to `false`.
   */
  idempotent?: boolean;
  /** Attempts for this call, when idempotent. Defaults to the client's `retries`. */
  retries?: number | undefined;
  /** Expected response shape. `auto` sniffs the content-type. */
  responseType?: 'auto' | 'json' | 'text' | 'buffer';
  signal?: AbortSignal | undefined;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
  /** Response body as text, when it was textual. */
  text: string | null;
  /** Total wall time in milliseconds. */
  durationMs: number;
  url: string;
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Static headers applied to every request (typically auth). */
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
  debug?: boolean;
  /** Provider id, used to tag errors and events. */
  provider?: string;
  /** Literal secret values to scrub from any emitted string. */
  secrets?: readonly string[];
  events?: EventBus | undefined;
  /** Called before each attempt; may mutate the outgoing options. */
  onRequest?: (info: HttpRequestInfo) => void | Promise<void>;
  /** Called after each completed attempt. */
  onResponse?: (info: HttpResponseInfo) => void | Promise<void>;
}

export interface HttpRequestInfo {
  provider: string | undefined;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  attempt: number;
}

export interface HttpResponseInfo extends HttpRequestInfo {
  status: number;
  durationMs: number;
  data: unknown;
}

const PACKAGE_UA = 'iran-sms';

/**
 * The only body shapes this client produces. Declared locally rather than relying on the
 * DOM's `BodyInit`, so the package type-checks against `@types/node` alone without pulling
 * `lib.dom` (and every browser global) into a server-side package.
 */
type FetchBody = string | FormData | undefined;

/** Statuses worth retrying on an idempotent request. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });

export class HttpClient {
  readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly debug: boolean;
  private readonly provider: string | undefined;
  private readonly secrets: readonly string[];
  private readonly events: EventBus | undefined;
  private readonly onRequest: HttpClientOptions['onRequest'];
  private readonly onResponse: HttpClientOptions['onResponse'];

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeout = options.timeout ?? 15_000;
    this.retries = options.retries ?? 2;
    this.retryDelay = options.retryDelay ?? 300;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.debug = options.debug ?? false;
    this.provider = options.provider;
    this.secrets = options.secrets ?? [];
    this.events = options.events;
    this.onRequest = options.onRequest;
    this.onResponse = options.onResponse;

    const ua = options.userAgent ? `${PACKAGE_UA} ${options.userAgent}` : PACKAGE_UA;
    this.defaultHeaders = { 'User-Agent': ua, ...(options.headers ?? {}) };

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError(
        'No global fetch available. Node 18.17+ is required, or pass `request.fetch` explicitly.',
      );
    }
  }

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(options.path, options.query);
    const maxAttempts = options.idempotent === true ? Math.max(1, (options.retries ?? this.retries) + 1) : 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.attempt<T>(method, url, options, attempt);
        if (options.idempotent === true && attempt < maxAttempts && RETRYABLE_STATUS.has(response.status)) {
          await this.backoff(attempt, response.headers, options.signal);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof SMSNetworkError || error instanceof SMSTimeoutError;
        if (options.idempotent === true && retryable && attempt < maxAttempts) {
          await this.backoff(attempt, undefined, options.signal);
          continue;
        }
        throw error;
      }
    }
    /* c8 ignore next -- unreachable: the loop either returns or throws */
    throw lastError;
  }

  private async attempt<T>(
    method: HttpMethod,
    url: string,
    options: HttpRequestOptions,
    attempt: number,
  ): Promise<HttpResponse<T>> {
    const { headers, body } = this.buildBody(options);
    const merged: Record<string, string> = { ...this.defaultHeaders, ...headers, ...(options.headers ?? {}) };

    // Abort wiring must be installed before the first `await`: a caller that aborts
    // synchronously after `request()` returns would otherwise be missed entirely and the
    // request would run to its full timeout.
    const timeoutMs = options.timeout ?? this.timeout;
    const controller = new AbortController();
    const onOuterAbort = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) onOuterAbort();
    else options.signal?.addEventListener('abort', onOuterAbort, { once: true });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const info: HttpRequestInfo = {
      provider: this.provider,
      method,
      url: this.redact(url),
      headers: redactHeaders(merged),
      body: redactValue(options.body),
      attempt,
    };

    const started = Date.now();
    try {
      await this.onRequest?.(info);
    } catch (error) {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
      throw error;
    }
    this.events?.emit('request', info);
    this.log('→', `${method} ${info.url}`, attempt > 1 ? `(attempt ${attempt})` : '');

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: merged,
        body,
        signal: controller.signal,
        redirect: 'follow',
      });

      const { data, text } = await this.readBody<T>(response, options.responseType ?? 'auto');
      const durationMs = Date.now() - started;

      const responseInfo: HttpResponseInfo = {
        ...info,
        status: response.status,
        durationMs,
        data: redactValue(data),
      };
      await this.onResponse?.(responseInfo);
      this.events?.emit('response', responseInfo);
      this.log('←', `${response.status} ${info.url} ${durationMs}ms`);

      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        data,
        text,
        durationMs,
        url,
      };
    } catch (error) {
      const durationMs = Date.now() - started;
      const base: SMSErrorOptions = {
        provider: this.provider,
        endpoint: this.redact(url),
        cause: error,
      };
      if (timedOut) {
        throw new SMSTimeoutError(`Request timed out after ${timeoutMs}ms`, { ...base, timeoutMs });
      }
      if (options.signal?.aborted) {
        throw new SMSNetworkError('Request was aborted by the caller.', { ...base, retryable: false });
      }
      const cause = (error as { cause?: { code?: string } })?.cause;
      const code = cause?.code ?? (error as { code?: string })?.code;
      throw new SMSNetworkError(
        `Network request failed after ${durationMs}ms${code ? ` (${code})` : ''}: ${
          (error as Error)?.message ?? 'unknown error'
        }`,
        { ...base, code },
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private async backoff(attempt: number, headers?: Headers, signal?: AbortSignal): Promise<void> {
    const retryAfter = headers?.get('retry-after');
    let delay = this.retryDelay * 2 ** (attempt - 1);
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) delay = Math.min(seconds * 1000, 30_000);
    }
    // Full jitter: without it, concurrent senders retry in lockstep and re-create the spike.
    const jittered = Math.random() * delay;
    this.log('↺', `retrying in ${Math.round(jittered)}ms`);
    await sleep(jittered, signal);
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = /^https?:\/\//i.test(path)
      ? new URL(path)
      : new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
        }
      } else if (value instanceof Date) {
        url.searchParams.set(key, value.toISOString());
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildBody(options: HttpRequestOptions): {
    headers: Record<string, string>;
    body: FetchBody;
  } {
    const kind = options.bodyKind ?? (options.body === undefined ? 'none' : 'json');
    if (kind === 'none' || options.body === undefined) return { headers: {}, body: undefined };

    switch (kind) {
      case 'json':
        return {
          headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
          body: JSON.stringify(options.body),
        };
      case 'form': {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(options.body as Record<string, unknown>)) {
          if (value === undefined || value === null) continue;
          if (Array.isArray(value)) {
            for (const item of value) params.append(key, String(item));
          } else {
            params.append(key, String(value));
          }
        }
        return {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            Accept: 'application/json',
          },
          body: params.toString(),
        };
      }
      case 'multipart': {
        // Content-Type is deliberately omitted: fetch must set the multipart boundary.
        const form = options.body instanceof FormData ? options.body : toFormData(options.body);
        return { headers: { Accept: 'application/json' }, body: form };
      }
      case 'text':
        return { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: String(options.body) };
      /* c8 ignore next 2 -- exhaustive */
      default:
        return { headers: {}, body: undefined };
    }
  }

  private async readBody<T>(
    response: Response,
    responseType: NonNullable<HttpRequestOptions['responseType']>,
  ): Promise<{ data: T; text: string | null }> {
    if (responseType === 'buffer') {
      const buffer = new Uint8Array(await response.arrayBuffer());
      return { data: buffer as unknown as T, text: null };
    }

    const text = await response.text();
    if (responseType === 'text') return { data: text as unknown as T, text };

    const contentType = response.headers.get('content-type') ?? '';
    const looksJson = responseType === 'json' || /\bjson\b/i.test(contentType);

    if (text === '') return { data: null as unknown as T, text };

    if (looksJson) {
      try {
        return { data: JSON.parse(text) as T, text };
      } catch {
        // Fall through: some providers mislabel plain text (or an HTML error page) as JSON.
        return { data: text as unknown as T, text };
      }
    }

    // Several Iranian gateways return JSON under text/html or text/plain. Try anyway.
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        return { data: JSON.parse(trimmed) as T, text };
      } catch {
        /* not JSON after all */
      }
    }
    return { data: text as unknown as T, text };
  }

  private redact(value: string): string {
    return redactUrl(value, this.secrets);
  }

  private log(...parts: unknown[]): void {
    if (!this.debug) return;
    // stderr, not stdout: diagnostics must never contaminate a program's real output.
    console.error(`[iran-sms${this.provider ? `:${this.provider}` : ''}]`, ...parts);
  }
}

function toFormData(body: unknown): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries((body ?? {}) as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item as string | Blob);
    } else if (value instanceof Blob) {
      form.append(key, value);
    } else {
      form.append(key, String(value));
    }
  }
  return form;
}
