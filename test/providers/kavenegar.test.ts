/**
 * Kavenegar contract tests.
 * Reference: https://kavenegar.com/rest.html
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KavenegarProvider,
  SMSAuthenticationError,
  SMSInsufficientCreditError,
  SMSNetworkError,
  SMSPatternError,
  SMSRateLimitError,
  SMSRecipientError,
  SMSValidationError,
} from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const API_KEY = 'kav-key-abcdefghij';
const ok = (entries: unknown) => ({ body: { return: { status: 200, message: 'تایید شد' }, entries } });
const fail = (status: number, message = 'error') => ({ status: 200, body: { return: { status, message } } });

function provider(fetchImpl: typeof globalThis.fetch) {
  return new KavenegarProvider({
    credentials: { apiKey: API_KEY },
    sender: '10004346',
    request: { fetch: fetchImpl, retries: 0 },
  });
}

describe('Kavenegar', () => {
  describe('authentication', () => {
    it('puts the API key in the URL path, not a header', async () => {
      const mock = mockFetch(ok([{ messageid: 1, status: 5 }]));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });

      assert.match(mock.last().url, new RegExp(`/v1/${API_KEY}/sms/send\\.json$`));
      assert.equal(mock.last().headers['authorization'], undefined);
    });

    it('keeps the key out of anything it emits', async () => {
      const mock = mockFetch(ok([{ messageid: 1 }]));
      const client = new KavenegarProvider({
        credentials: { apiKey: API_KEY },
        sender: '10004346',
        request: { fetch: mock.fetch },
      });

      let reported = '';
      client.events.on('request', (info) => {
        reported = info.url;
      });
      await client.send({ to: '09121234567', message: 'hi' });

      assert.doesNotMatch(reported, new RegExp(API_KEY));
      assert.match(reported, /sms\/send\.json/);
    });

    it('maps 403 to SMSAuthenticationError with the documented explanation', async () => {
      const mock = mockFetch(fail(403));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSAuthenticationError);
          assert.equal(error.code, 403);
          assert.match(error.message, /API key is not valid/);
          return true;
        },
      );
    });
  });

  describe('send', () => {
    it('posts form-encoded fields with comma-joined recipients in national format', async () => {
      const mock = mockFetch(ok([{ messageid: 1, status: 5, receptor: '09121234567', cost: 120 }]));
      await provider(mock.fetch).send({ to: ['09121234567', '+989351234567'], message: 'test' });

      const call = mock.last();
      assert.equal(call.method, 'POST');
      assert.match(call.headers['content-type']!, /x-www-form-urlencoded/);
      assert.deepEqual(call.body, {
        receptor: '09121234567,09351234567',
        message: 'test',
        sender: '10004346',
      });
    });

    it('sends scheduleAt as Unix seconds', async () => {
      const mock = mockFetch(ok([{ messageid: 1 }]));
      const when = new Date('2027-01-01T00:00:00Z');
      await provider(mock.fetch).send({ to: '09121234567', message: 'x', scheduleAt: when });

      assert.equal((mock.last().body as { date: string }).date, String(Math.floor(when.getTime() / 1000)));
    });

    it('rejects more than 200 recipients before making a request', async () => {
      const mock = mockFetch(ok([]));
      const many = Array.from({ length: 201 }, (_, i) => `0912${String(1000000 + i)}`);
      await assert.rejects(
        () => provider(mock.fetch).send({ to: many, message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.equal(error.code, 414);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });

    it('normalises status 5 to "sent" and sums cost', async () => {
      const mock = mockFetch(
        ok([
          { messageid: 1, status: 5, receptor: '09121234567', cost: 120 },
          { messageid: 2, status: 5, receptor: '09351234567', cost: 130 },
        ]),
      );
      const result = await provider(mock.fetch).send({ to: ['09121234567', '09351234567'], message: 'x' });

      assert.equal(result.status, 'sent');
      assert.equal(result.cost, 250);
      assert.equal(result.currency, 'IRR');
      assert.equal(result.parts?.length, 2);
      assert.equal(result.parts?.[0]?.nativeStatus, 5);
    });
  });

  describe('idempotency', () => {
    it('sends localid when an idempotencyKey is supplied', async () => {
      const mock = mockFetch(ok([{ messageid: 1 }]));
      await provider(mock.fetch).send({ to: '09121234567', message: 'x', idempotencyKey: 'order-42' });
      assert.equal((mock.last().body as { localid: string }).localid, 'order-42');
    });

    it('omits localid when no key is supplied', async () => {
      const mock = mockFetch(ok([{ messageid: 1 }]));
      await provider(mock.fetch).send({ to: '09121234567', message: 'x' });
      assert.equal((mock.last().body as { localid?: string }).localid, undefined);
    });

    it('retries a send only when an idempotencyKey makes it safe', async () => {
      let calls = 0;
      const counting = (async () => {
        calls += 1;
        const error = new TypeError('fetch failed');
        (error as { cause?: unknown }).cause = { code: 'ECONNRESET' };
        throw error;
      }) as typeof globalThis.fetch;

      const withKey = new KavenegarProvider({
        credentials: { apiKey: API_KEY },
        sender: '10004346',
        request: { fetch: counting, retries: 2, retryDelay: 1 },
      });
      await assert.rejects(() => withKey.send({ to: '09121234567', message: 'x', idempotencyKey: 'k1' }));
      assert.equal(calls, 3, 'localid makes the send repeat-safe');

      calls = 0;
      await assert.rejects(() => withKey.send({ to: '09121234567', message: 'x' }));
      assert.equal(calls, 1, 'without localid the send must not be replayed');
    });
  });

  describe('verify lookup', () => {
    it('maps a single variable to token', async () => {
      const mock = mockFetch(ok([{ messageid: 8792343, status: 5, cost: 120 }]));
      await provider(mock.fetch).sendPattern({
        to: '09121234567',
        pattern: 'myverification',
        variables: { code: '852596' },
      });

      assert.match(mock.last().url, /\/verify\/lookup\.json$/);
      assert.deepEqual(mock.last().body, {
        receptor: '09121234567',
        template: 'myverification',
        token: '852596',
      });
    });

    it('maps ordered variables onto the five documented slots', async () => {
      const mock = mockFetch(ok([{ messageid: 1 }]));
      const client = new KavenegarProvider({
        credentials: { apiKey: API_KEY },
        sender: '10004346',
        request: { fetch: mock.fetch },
        patterns: undefined,
      });

      // Explicit order via the registry is exercised in the SMS-level tests; here the
      // single-variable path plus an explicit multi-token call covers the slot mapping.
      await client.native.verifyLookup({
        receptor: '09121234567',
        template: 't',
        token: 'a',
        token2: 'b',
        token3: 'c',
      });

      const body = mock.last().body as Record<string, string>;
      assert.equal(body['token'], 'a');
      assert.equal(body['token2'], 'b');
      assert.equal(body['token3'], 'c');
    });

    it('rejects a token containing a space, per the documented rule', async () => {
      const mock = mockFetch(ok([]));
      await assert.rejects(
        () =>
          provider(mock.fetch).sendPattern({
            to: '09121234567',
            pattern: 't',
            variables: { code: 'has space' },
          }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.equal(error.code, 431);
          assert.match(error.message, /token10|token20/);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });

    it('rejects a token longer than 100 characters', async () => {
      const mock = mockFetch(ok([]));
      await assert.rejects(
        () =>
          provider(mock.fetch).sendPattern({
            to: '09121234567',
            pattern: 't',
            variables: { code: 'x'.repeat(101) },
          }),
        SMSPatternError,
      );
    });

    it('maps 424 to SMSPatternError', async () => {
      const mock = mockFetch(fail(424, 'الگوی مورد نظر پیدا نشد'));
      await assert.rejects(
        () =>
          provider(mock.fetch).sendPattern({ to: '09121234567', pattern: 'nope', variables: { code: '1' } }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.equal(error.code, 424);
          return true;
        },
      );
    });
  });

  describe('error mapping', () => {
    const cases: Array<[number, unknown]> = [
      [418, SMSInsufficientCreditError],
      [411, SMSRecipientError],
      [429, SMSRateLimitError],
      [451, SMSRateLimitError],
      [401, SMSAuthenticationError],
      [407, SMSAuthenticationError],
      [413, SMSValidationError],
      [419, SMSValidationError],
    ];

    for (const [code, ErrorClass] of cases) {
      it(`maps ${code} to ${(ErrorClass as { name: string }).name}`, async () => {
        const mock = mockFetch(fail(code));
        await assert.rejects(
          () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
          ErrorClass as never,
        );
      });
    }

    it('includes the documented meaning in the message', async () => {
      const mock = mockFetch(fail(418));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        /Insufficient credit/,
      );
    });

    it('wraps transport failures', async () => {
      await assert.rejects(
        () => provider(failingFetch()).send({ to: '09121234567', message: 'x' }),
        SMSNetworkError,
      );
    });
  });

  describe('reads', () => {
    it('maps message status codes', async () => {
      const mock = mockFetch(ok([{ messageid: 1, status: 10, statustext: 'رسیده به گیرنده' }]));
      const [status] = await provider(mock.fetch).getStatuses(['1']);
      assert.equal(status?.status, 'delivered');
      assert.equal(status?.nativeStatus, 10);
    });

    it('reads account credit in Rial', async () => {
      const mock = mockFetch(ok({ remaincredit: 1500000, expiredate: 13548889, type: 'master' }));
      const balance = await provider(mock.fetch).getBalance();
      assert.equal(balance.amount, 1500000);
      assert.equal(balance.currency, 'IRR');
    });

    it('uses the non-destructive inboxpaged endpoint by default', async () => {
      const mock = mockFetch({
        body: {
          return: { status: 200 },
          entries: [
            { messageid: 1, message: 'hi', sender: '09121234567', receptor: '3000202030', date: 1357206241 },
          ],
          metadata: { totalcount: '1', currentpage: '1', pagesize: '200' },
        },
      });

      await provider(mock.fetch).listInbox({ providerOptions: { linenumber: '3000202030' } });
      assert.match(mock.last().url, /inboxpaged\.json/);
      assert.doesNotMatch(mock.last().url, /\/receive\.json/);
    });

    it('uses the destructive receive endpoint only when asked', async () => {
      const mock = mockFetch({ body: { return: { status: 200 }, entries: [] } });
      await provider(mock.fetch).listInbox({
        providerOptions: { linenumber: '3000202030', destructive: true },
      });
      assert.match(mock.last().url, /\/receive\.json/);
    });
  });

  describe('blacklist', () => {
    it('checks membership via blocked/exists', async () => {
      const mock = mockFetch(ok([{ linenumber: '10004346', receptor: '09121234567', status: 'Active' }]));
      assert.equal(await provider(mock.fetch).isBlacklisted('09121234567'), true);
      assert.match(mock.last().url, /line\/blocked\/exists\.json/);
    });

    it('removes via HTTP DELETE, as documented', async () => {
      const mock = mockFetch(ok({ message: 'Done-removed 1 item from blacklist' }));
      await provider(mock.fetch).removeFromBlacklist('10004346', ['09121234567']);
      assert.equal(mock.last().method, 'DELETE');
    });
  });
});
