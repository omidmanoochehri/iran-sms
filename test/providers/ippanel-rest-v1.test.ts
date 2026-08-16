/**
 * IPPanel rest/v1 platform contract tests.
 *
 * Covers Mediana and the IPPanel-source resellers that run this generation.
 * Reference: the official Mediana Go SDK (github.com/medianasms/go-rest-sdk).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MedianaProvider,
  SMSAuthenticationError,
  SMSConfigurationError,
  SMSInsufficientCreditError,
  SMSNetworkError,
  SMSPatternError,
  SMSRecipientError,
  SMSValidationError,
  SmsAramProvider,
  TabanSmsProvider,
  YekPayamakProvider,
} from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const BASE = 'https://rest.example.test/v1';
const ok = (data: unknown, meta?: unknown) => ({ body: { status: 'ok', code: '200', data, meta } });
const err = (code: string, data: unknown = {}) => ({ status: 400, body: { status: 'error', code, data } });

function provider(fetchImpl: typeof globalThis.fetch) {
  return new MedianaProvider({
    credentials: { apiKey: 'med-key-abcdefghij' },
    sender: '+983000505',
    request: { fetch: fetchImpl, baseUrl: BASE, retries: 0 },
  });
}

describe('IPPanel rest/v1 platform', () => {
  describe('authentication', () => {
    it('uses the AccessKey scheme', async () => {
      const mock = mockFetch(ok({ bulk_id: 1 }));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });
      assert.equal(mock.last().headers['authorization'], 'AccessKey med-key-abcdefghij');
    });

    const authCodes = ['10001', '10013', '1401', '1402', '1403'];
    for (const code of authCodes) {
      it(`maps ${code} to SMSAuthenticationError`, async () => {
        const mock = mockFetch(err(code));
        await assert.rejects(() => provider(mock.fetch).getBalance(), SMSAuthenticationError);
      });
    }

    it('explains the documented meaning of the code', async () => {
      const mock = mockFetch(err('1402'));
      await assert.rejects(() => provider(mock.fetch).getBalance(), /API key is not valid/);
    });
  });

  describe('base URL policy', () => {
    it('refuses to guess a host when the deployment has no published one', async () => {
      const client = new MedianaProvider({ credentials: { apiKey: 'x-abcdefghij' } });
      await assert.rejects(
        () => client.native.getCredit(),
        (error: unknown) => {
          assert.ok(error instanceof SMSConfigurationError);
          assert.equal(error.code, 'base_url_required');
          assert.match(error.message, /will not guess/);
          return true;
        },
      );
    });
  });

  describe('send', () => {
    it('produces the documented /messages payload in E.164', async () => {
      const mock = mockFetch(ok({ bulk_id: 12345 }));
      await provider(mock.fetch).send({ to: ['09121234567', '09351234567'], message: 'hello' });

      assert.equal(mock.last().url, `${BASE}/messages`);
      assert.deepEqual(mock.last().body, {
        originator: '+983000505',
        recipients: ['+989121234567', '+989351234567'],
        message: 'hello',
      });
    });

    it('returns bulk_id as the batch id', async () => {
      const mock = mockFetch(ok({ bulk_id: 12345 }));
      const result = await provider(mock.fetch).send({ to: '09121234567', message: 'x' });
      assert.equal(result.batchId, '12345');
      assert.equal(result.messageId, '12345');
    });

    it('rejects scheduleAt rather than silently dropping it', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(
        () =>
          provider(mock.fetch).send({ to: '09121234567', message: 'x', scheduleAt: new Date('2030-01-01') }),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.match(error.message, /does not document a scheduled-send/);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });
  });

  describe('pattern', () => {
    it('sends values as a named map', async () => {
      const mock = mockFetch(ok({ bulk_id: 999 }));
      await provider(mock.fetch).sendPattern({
        to: '09121234567',
        pattern: 'abc123',
        variables: { code: '4321' },
      });

      assert.equal(mock.last().url, `${BASE}/messages/patterns/send`);
      assert.deepEqual(mock.last().body, {
        pattern_code: 'abc123',
        originator: '+983000505',
        recipient: '+989121234567',
        values: { code: '4321' },
      });
    });

    it('maps pattern error codes', async () => {
      for (const code of ['10014', '10015', '10016']) {
        const mock = mockFetch(err(code));
        await assert.rejects(
          () => provider(mock.fetch).sendPattern({ to: '09121234567', pattern: 'p', variables: {} }),
          SMSPatternError,
        );
      }
    });
  });

  describe('error mapping', () => {
    it('maps 10006 to insufficient credit', async () => {
      const mock = mockFetch(err('10006'));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        SMSInsufficientCreditError,
      );
    });

    it('maps recipient errors', async () => {
      for (const code of ['10005', '10009', '10023']) {
        const mock = mockFetch(err(code));
        await assert.rejects(
          () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
          SMSRecipientError,
        );
      }
    });

    it('marks gateway failures retryable', async () => {
      const mock = mockFetch(err('10010'));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        (error: unknown) => {
          assert.equal((error as { retryable: boolean }).retryable, true);
          return true;
        },
      );
    });

    it('extracts field errors from a 422', async () => {
      const mock = mockFetch({
        status: 422,
        body: {
          status: 'error',
          code: '422',
          data: { error: { message: [{ code: 'required', err: 'message is required' }] } },
        },
      });

      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: '' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.deepEqual(error.fields, { message: ['message is required'] });
          return true;
        },
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
    it('parses the credit envelope', async () => {
      const mock = mockFetch(ok({ credit: 250000 }));
      const balance = await provider(mock.fetch).getBalance();
      assert.equal(balance.amount, 250000);
      assert.equal(balance.currency, 'IRR');
    });

    it('parses per-recipient statuses with pagination meta', async () => {
      const mock = mockFetch(
        ok(
          { recipients: [{ recipient: '+989121234567', status: 'delivered' }] },
          { total: 1, limit: 10, page: 1, pages: 1 },
        ),
      );

      const page = await provider(mock.fetch).getRecipients('55');
      assert.equal(page.total, 1);
      assert.equal(page.items[0]!.recipient, '+989121234567');
    });

    it('parses the inbox', async () => {
      const mock = mockFetch(
        ok(
          { messages: [{ sender: '+989121234567', number: '+983000', message: 'hi', time: 1747808125 }] },
          { total: 1 },
        ),
      );

      const page = await provider(mock.fetch).listInbox();
      assert.equal(page.items[0]!.text, 'hi');
      assert.ok(page.items[0]!.receivedAt instanceof Date);
    });
  });

  describe('resellers share the implementation', () => {
    const cases = [
      ['tabansms', TabanSmsProvider],
      ['smsaram', SmsAramProvider],
      ['yekpayamak', YekPayamakProvider],
    ] as const;

    for (const [id, Ctor] of cases) {
      it(`${id} uses the same wire protocol`, async () => {
        const mock = mockFetch(ok({ bulk_id: 7 }));
        const client = new Ctor({
          credentials: { apiKey: 'x-abcdefghij' },
          sender: '+983000505',
          request: { fetch: mock.fetch, baseUrl: BASE },
        });

        const result = await client.send({ to: '09121234567', message: 'x' });
        assert.equal(result.provider, id);
        assert.equal(client.meta.platform, 'ippanel-rest-v1');
        assert.equal(mock.last().headers['authorization'], 'AccessKey x-abcdefghij');
      });
    }
  });
});
