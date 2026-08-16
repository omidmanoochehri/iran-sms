import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Multi, SMS, SMSConfigurationError } from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const KAVENEGAR_OK = {
  body: { return: { status: 200 }, entries: [{ messageid: 11, status: 5, receptor: '09121234567' }] },
};
const SMSIR_OK = { body: { status: 1, message: 'ok', data: { packId: 'p1', messageIds: [22], cost: 1 } } };

function kavenegar(fetchImpl: typeof globalThis.fetch) {
  return {
    provider: 'kavenegar',
    credentials: { apiKey: 'k-abcdefghij' },
    sender: '10004346',
    request: { fetch: fetchImpl, retries: 0 },
  };
}

function smsir(fetchImpl: typeof globalThis.fetch) {
  return {
    provider: 'smsir',
    credentials: { apiKey: 's-abcdefghij' },
    sender: '30000000000',
    request: { fetch: fetchImpl, retries: 0 },
  };
}

describe('Multi', () => {
  it('requires at least one provider', () => {
    // @ts-expect-error deliberately invalid
    assert.throws(() => new Multi({}), SMSConfigurationError);
    assert.throws(() => new Multi({ providers: {} }), SMSConfigurationError);
  });

  it('exposes members by configured name and by provider id', () => {
    const multi = new Multi({
      providers: {
        primary: kavenegar(mockFetch(KAVENEGAR_OK).fetch),
        backup: smsir(mockFetch(SMSIR_OK).fetch),
      },
    });

    assert.deepEqual(multi.names(), ['primary', 'backup']);
    assert.equal(multi.use('primary').providerId, 'kavenegar');
    assert.equal(multi.use('kavenegar').providerId, 'kavenegar');
    assert.equal(multi.primary.providerId, 'kavenegar');
  });

  it('rejects an unknown member name', () => {
    const multi = new Multi({ providers: { primary: kavenegar(mockFetch(KAVENEGAR_OK).fetch) } });
    assert.throws(() => multi.use('nope'), SMSConfigurationError);
  });

  it('accepts an array of configs', () => {
    const multi = new Multi({
      providers: [kavenegar(mockFetch(KAVENEGAR_OK).fetch), smsir(mockFetch(SMSIR_OK).fetch)],
    });
    assert.deepEqual(multi.names(), ['kavenegar', 'smsir']);
  });

  it('sends through a named member', async () => {
    const kv = mockFetch(KAVENEGAR_OK);
    const multi = new Multi({ providers: { primary: kavenegar(kv.fetch) } });

    const result = await multi.use('primary').send({ to: '09121234567', message: 'hi' });
    assert.equal(result.provider, 'kavenegar');
    assert.equal(kv.calls.length, 1);
  });

  describe('routing', () => {
    it('routes by traffic kind', async () => {
      const kv = mockFetch(KAVENEGAR_OK);
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(kv.fetch), b: smsir(si.fetch) },
        routing: { default: 'b' },
      });

      await multi.send({ to: '09121234567', message: 'hi' });
      assert.equal(si.calls.length, 1, 'default route must select smsir');
      assert.equal(kv.calls.length, 0);
    });

    it('an explicit provider overrides routing', async () => {
      const kv = mockFetch(KAVENEGAR_OK);
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(kv.fetch), b: smsir(si.fetch) },
        routing: { default: 'b' },
      });

      await multi.send({ to: '09121234567', message: 'hi', provider: 'a' });
      assert.equal(kv.calls.length, 1);
      assert.equal(si.calls.length, 0);
    });

    it('rejects a routing rule pointing at an unconfigured provider', async () => {
      const multi = new Multi({
        providers: { a: kavenegar(mockFetch(KAVENEGAR_OK).fetch) },
        routing: { default: 'ghost' },
      });
      await assert.rejects(() => multi.send({ to: '09121234567', message: 'hi' }), SMSConfigurationError);
    });
  });

  describe('failover', () => {
    it('is off by default — one provider, one attempt', async () => {
      const kv = mockFetch({ status: 503, body: { return: { status: 503 } } });
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({ providers: { a: kavenegar(kv.fetch), b: smsir(si.fetch) } });

      await assert.rejects(() => multi.send({ to: '09121234567', message: 'hi' }));
      assert.equal(si.calls.length, 0, 'no failover without opting in');
    });

    it('moves to the next provider on a rate limit', async () => {
      const kv = mockFetch({ status: 429, body: { return: { status: 429, message: 'slow down' } } });
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(kv.fetch), b: smsir(si.fetch) },
        failover: { enabled: true },
      });

      const result = await multi.send({ to: '09121234567', message: 'hi' });
      assert.equal(result.provider, 'smsir');
      assert.equal(si.calls.length, 1);
    });

    it('emits a failover event naming both providers and the reason', async () => {
      const kv = mockFetch({ status: 429, body: { return: { status: 429 } } });
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(kv.fetch), b: smsir(si.fetch) },
        failover: { enabled: true },
      });

      const seen: Array<{ from: string; to: string; reason: string }> = [];
      multi.on('failover', (payload) => seen.push(payload));

      await multi.send({ to: '09121234567', message: 'hi' });
      assert.deepEqual(seen, [{ from: 'kavenegar', to: 'smsir', reason: 'rate_limit' }]);
    });

    it('never fails over on a request-level error, however many providers exist', async () => {
      // 411 = invalid recipient. Another vendor would reject it too.
      const kv = mockFetch({ status: 200, body: { return: { status: 411, message: 'bad recipient' } } });
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(kv.fetch), b: smsir(si.fetch) },
        failover: { enabled: true, on: ['rate_limit', 'provider_unavailable', 'network_error', 'timeout'] },
      });

      await assert.rejects(() => multi.send({ to: '09121234567', message: 'hi' }));
      assert.equal(si.calls.length, 0, 'a bad request must not be re-sent elsewhere');
    });

    it('does not fail over on a network error unless it is explicitly enabled', async () => {
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(failingFetch()), b: smsir(si.fetch) },
        failover: { enabled: true },
      });

      await assert.rejects(() => multi.send({ to: '09121234567', message: 'hi' }));
      assert.equal(si.calls.length, 0, 'a timeout does not prove the first provider rejected the message');
    });

    it('does fail over on a network error when the caller opts in', async () => {
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(failingFetch()), b: smsir(si.fetch) },
        failover: { enabled: true, on: ['network_error'] },
      });

      const result = await multi.send({ to: '09121234567', message: 'hi' });
      assert.equal(result.provider, 'smsir');
    });

    it('does not fail away from an explicitly named provider', async () => {
      const si = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(failingFetch()), b: smsir(si.fetch) },
        failover: { enabled: true, on: ['network_error'] },
      });

      await assert.rejects(() => multi.send({ to: '09121234567', message: 'hi', provider: 'a' }));
      assert.equal(si.calls.length, 0);
    });

    it('honours maxAttempts', async () => {
      const a = mockFetch({ status: 429, body: { return: { status: 429 } } });
      const b = mockFetch({ status: 429, body: { status: 20, message: 'too many' } });
      const c = mockFetch(SMSIR_OK);
      const multi = new Multi({
        providers: { a: kavenegar(a.fetch), b: smsir(b.fetch), c: smsir(c.fetch) },
        failover: { enabled: true, maxAttempts: 2 },
      });

      await assert.rejects(() => multi.send({ to: '09121234567', message: 'hi' }));
      assert.equal(c.calls.length, 0, 'the third provider is beyond maxAttempts');
    });
  });

  it('collects balances from every member, capturing failures', async () => {
    const kv = mockFetch({ body: { return: { status: 200 }, entries: { remaincredit: 500 } } });
    const multi = new Multi({ providers: { a: kavenegar(kv.fetch), b: smsir(failingFetch()) } });

    const balances = await multi.getBalances();
    assert.equal(balances.length, 2);
    assert.equal(balances[0]!.balance?.amount, 500);
    assert.equal(balances[1]!.balance, null);
    assert.ok(balances[1]!.error);
  });

  it('is reachable as SMS.Multi', () => {
    assert.equal(SMS.Multi, Multi);
  });
});
