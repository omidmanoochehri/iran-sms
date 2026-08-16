import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HttpClient, SMSNetworkError, SMSTimeoutError } from '../imports.ts';
import { countingFetch, failingFetch, hangingFetch, mockFetch } from '../helpers.ts';

const base = { baseUrl: 'https://example.test', provider: 'demo' };

describe('HttpClient', () => {
  it('builds URLs from base + path + query, skipping null and undefined', async () => {
    const mock = mockFetch({ body: { ok: true } });
    const client = new HttpClient({ ...base, fetch: mock.fetch });

    await client.request({ path: '/v1/send', query: { a: 1, b: null, c: undefined, d: 'x' } });

    const url = new URL(mock.last().url);
    assert.equal(url.pathname, '/v1/send');
    assert.equal(url.searchParams.get('a'), '1');
    assert.equal(url.searchParams.get('d'), 'x');
    assert.equal(url.searchParams.has('b'), false);
    assert.equal(url.searchParams.has('c'), false);
  });

  it('repeats array query parameters', async () => {
    const mock = mockFetch({ body: {} });
    const client = new HttpClient({ ...base, fetch: mock.fetch });
    await client.request({ path: '/x', query: { id: [1, 2, 3] } });
    assert.equal(new URL(mock.last().url).searchParams.getAll('id').join(','), '1,2,3');
  });

  it('sends JSON bodies with a charset-qualified content type', async () => {
    const mock = mockFetch({ body: {} });
    const client = new HttpClient({ ...base, fetch: mock.fetch });
    await client.request({ method: 'POST', path: '/x', body: { a: 1 }, bodyKind: 'json' });

    assert.match(mock.last().headers['content-type']!, /application\/json/);
    assert.deepEqual(mock.last().body, { a: 1 });
  });

  it('sends form bodies as urlencoded and flattens arrays', async () => {
    const mock = mockFetch({ body: {} });
    const client = new HttpClient({ ...base, fetch: mock.fetch });
    await client.request({ method: 'POST', path: '/x', body: { a: 'b', list: [1, 2] }, bodyKind: 'form' });

    assert.match(mock.last().headers['content-type']!, /x-www-form-urlencoded/);
    assert.equal(mock.last().rawBody, 'a=b&list=1&list=2');
  });

  it('omits the content-type for multipart so fetch can set the boundary', async () => {
    const mock = mockFetch({ body: {} });
    const client = new HttpClient({ ...base, fetch: mock.fetch });
    await client.request({ method: 'POST', path: '/x', body: { a: 'b' }, bodyKind: 'multipart' });

    assert.equal(mock.last().headers['content-type'], undefined);
  });

  it('parses JSON even when the provider mislabels it as text/html', async () => {
    const mock = mockFetch({ body: '{"ok":true}', headers: { 'content-type': 'text/html' } });
    const client = new HttpClient({ ...base, fetch: mock.fetch });
    const response = await client.request<{ ok: boolean }>({ path: '/x' });
    assert.deepEqual(response.data, { ok: true });
  });

  it('falls back to text when the body is not JSON', async () => {
    const mock = mockFetch({ body: 'not json', headers: { 'content-type': 'text/plain' } });
    const client = new HttpClient({ ...base, fetch: mock.fetch });
    const response = await client.request({ path: '/x' });
    assert.equal(response.data, 'not json');
  });

  it('wraps transport failures as SMSNetworkError with the OS error code', async () => {
    const client = new HttpClient({ ...base, fetch: failingFetch('ENOTFOUND') });
    await assert.rejects(
      () => client.request({ path: '/x' }),
      (error: unknown) => {
        assert.ok(error instanceof SMSNetworkError);
        assert.equal(error.code, 'ENOTFOUND');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  });

  it('aborts and raises SMSTimeoutError past the timeout', async () => {
    const client = new HttpClient({ ...base, fetch: hangingFetch(), timeout: 40 });
    await assert.rejects(
      () => client.request({ path: '/x' }),
      (error: unknown) => {
        assert.ok(error instanceof SMSTimeoutError);
        assert.equal(error.timeoutMs, 40);
        return true;
      },
    );
  });

  describe('retries', () => {
    it('never retries a request that is not explicitly idempotent', async () => {
      const counting = countingFetch(failingFetch());
      const client = new HttpClient({ ...base, fetch: counting.fetch, retries: 3, retryDelay: 1 });

      await assert.rejects(() => client.request({ method: 'POST', path: '/send' }));
      assert.equal(counting.count(), 1, 'a non-idempotent request must be attempted exactly once');
    });

    it('retries an idempotent request on a network failure', async () => {
      const counting = countingFetch(failingFetch());
      const client = new HttpClient({ ...base, fetch: counting.fetch, retries: 2, retryDelay: 1 });

      await assert.rejects(() => client.request({ path: '/read', idempotent: true }));
      assert.equal(counting.count(), 3, 'initial attempt plus two retries');
    });

    it('retries an idempotent request on a retryable status, then returns', async () => {
      const mock = mockFetch([
        { status: 503, body: {} },
        { status: 200, body: { ok: true } },
      ]);
      const counting = countingFetch(mock.fetch);
      const client = new HttpClient({ ...base, fetch: counting.fetch, retries: 2, retryDelay: 1 });

      const response = await client.request<{ ok: boolean }>({ path: '/read', idempotent: true });
      assert.equal(counting.count(), 2);
      assert.deepEqual(response.data, { ok: true });
    });

    it('does not retry a 4xx', async () => {
      const mock = mockFetch({ status: 422, body: { error: 'bad' } });
      const counting = countingFetch(mock.fetch);
      const client = new HttpClient({ ...base, fetch: counting.fetch, retries: 3, retryDelay: 1 });

      const response = await client.request({ path: '/read', idempotent: true });
      assert.equal(response.status, 422);
      assert.equal(counting.count(), 1);
    });
  });

  describe('redaction', () => {
    it('masks secret headers in the request event', async () => {
      const mock = mockFetch({ body: {} });
      const seen: Array<Record<string, string>> = [];
      const client = new HttpClient({
        ...base,
        fetch: mock.fetch,
        headers: { Authorization: 'super-secret-token-value' },
        onRequest: (info) => {
          seen.push(info.headers);
        },
      });

      await client.request({ path: '/x' });

      assert.ok(seen[0]);
      assert.notEqual(seen[0]!['Authorization'], 'super-secret-token-value');
      assert.match(seen[0]!['Authorization']!, /\*/);
      // The real header still went out on the wire.
      assert.equal(mock.last().headers['authorization'], 'super-secret-token-value');
    });

    it('scrubs a secret embedded in the URL path', async () => {
      const mock = mockFetch({ body: {} });
      let reported = '';
      const client = new HttpClient({
        ...base,
        fetch: mock.fetch,
        secrets: ['abcdef1234567890'],
        onRequest: (info) => {
          reported = info.url;
        },
      });

      await client.request({ path: '/v1/abcdef1234567890/sms/send.json' });

      assert.doesNotMatch(reported, /abcdef1234567890/);
      assert.match(mock.last().url, /abcdef1234567890/);
    });
  });

  it('honours an external abort signal', async () => {
    const controller = new AbortController();
    const client = new HttpClient({ ...base, fetch: hangingFetch() });
    const promise = client.request({ path: '/x', signal: controller.signal });
    controller.abort();
    await assert.rejects(promise, SMSNetworkError);
  });
});
