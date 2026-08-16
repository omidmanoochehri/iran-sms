/**
 * Test helpers.
 *
 * Provider tests never touch the network. Each one installs a `fetch` double that records
 * the exact outgoing request, so the assertions are *contract* tests: they check that the
 * adapter produces the request the provider's documentation specifies, byte for byte.
 */

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Parsed body: JSON object, form fields, or raw text. */
  body: unknown;
  rawBody: string | null;
  /** Convenience: parsed query parameters. */
  query: Record<string, string>;
}

export interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  /** Object bodies are JSON-encoded; strings are sent verbatim. */
  body?: unknown;
}

export interface MockFetch {
  fetch: typeof globalThis.fetch;
  /** Every request made, in order. */
  calls: RecordedRequest[];
  /** The most recent request. Throws when nothing has been sent. */
  last(): RecordedRequest;
}

function parseBody(raw: string | null, contentType: string): unknown {
  if (raw === null || raw === '') return undefined;
  if (contentType.includes('json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (contentType.includes('x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return raw;
}

/**
 * Build a `fetch` double.
 *
 * @param responses One response per call, or a single response reused for every call.
 */
export function mockFetch(responses: MockResponse | MockResponse[]): MockFetch {
  const queue = Array.isArray(responses) ? [...responses] : null;
  const single = Array.isArray(responses) ? null : responses;
  const calls: RecordedRequest[] = [];

  const impl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value;
    }

    let rawBody: string | null = null;
    if (typeof init?.body === 'string') rawBody = init.body;
    else if (init?.body instanceof FormData) {
      const entries: Record<string, unknown> = {};
      for (const [key, value] of (init.body as FormData).entries()) entries[key] = value;
      rawBody = JSON.stringify(entries);
    }

    const contentType = headers['content-type'] ?? '';
    const parsedUrl = new URL(url);

    calls.push({
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers,
      rawBody,
      body: init?.body instanceof FormData ? JSON.parse(rawBody ?? '{}') : parseBody(rawBody, contentType),
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
    });

    const next = single ?? queue?.shift() ?? { status: 200, body: {} };
    const payload = typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});

    return new Response(payload, {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    });
  }) as typeof globalThis.fetch;

  return {
    fetch: impl,
    calls,
    last(): RecordedRequest {
      const call = calls.at(-1);
      if (!call) throw new Error('No request was made.');
      return call;
    },
  };
}

/** A `fetch` that always rejects, for network-failure tests. */
export function failingFetch(code = 'ECONNREFUSED'): typeof globalThis.fetch {
  return (async () => {
    const error = new TypeError('fetch failed');
    (error as { cause?: unknown }).cause = { code };
    throw error;
  }) as typeof globalThis.fetch;
}

/**
 * A `fetch` that never settles, for timeout and abort tests.
 *
 * Mirrors real `fetch` semantics: a signal that is *already* aborted rejects immediately
 * rather than waiting for an `abort` event that has been and gone.
 */
export function hangingFetch(): typeof globalThis.fetch {
  const abortError = (): Error => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  };

  return ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(abortError());
        return;
      }
      init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
    })) as typeof globalThis.fetch;
}

/** Count how many times a `fetch` double was invoked. */
export function countingFetch(inner: typeof globalThis.fetch): {
  fetch: typeof globalThis.fetch;
  count: () => number;
} {
  let count = 0;
  return {
    fetch: (async (...args: Parameters<typeof globalThis.fetch>) => {
      count += 1;
      return inner(...args);
    }) as typeof globalThis.fetch,
    count: () => count,
  };
}
