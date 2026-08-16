/**
 * SMS.ir contract tests.
 * References: https://api.sms.ir/swagger/v1/swagger.json and https://sms.ir/rest-api/
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SmsIrProvider,
  SMSAuthenticationError,
  SMSInsufficientCreditError,
  SMSNetworkError,
  SMSPatternError,
  SMSRateLimitError,
  SMSRecipientError,
  SMSValidationError,
} from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const ok = (data: unknown) => ({ body: { status: 1, message: 'موفق', data } });
const appError = (status: number, message = 'خطا') => ({
  status: 200,
  body: { status, message, data: null },
});

function provider(fetchImpl: typeof globalThis.fetch) {
  return new SmsIrProvider({
    credentials: { apiKey: 'smsir-key-abcdefghij' },
    sender: '30000000000',
    request: { fetch: fetchImpl, retries: 0 },
  });
}

describe('SMS.ir', () => {
  describe('authentication', () => {
    it('sends X-API-KEY', async () => {
      const mock = mockFetch(ok({ packId: 'p', messageIds: [1], cost: 1 }));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });
      assert.equal(mock.last().headers['x-api-key'], 'smsir-key-abcdefghij');
    });

    const authCodes = [10, 11, 12, 13, 14];
    for (const code of authCodes) {
      it(`maps application status ${code} to SMSAuthenticationError`, async () => {
        const mock = mockFetch(appError(code));
        await assert.rejects(
          () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
          SMSAuthenticationError,
        );
      });
    }
  });

  describe('send', () => {
    it('produces the documented bulk payload with bare significant numbers', async () => {
      const mock = mockFetch(ok({ packId: '2b99e63c', messageIds: [101, 102], cost: 2 }));
      await provider(mock.fetch).send({ to: ['09121234567', '+989351234567'], message: 'Your Text' });

      assert.match(mock.last().url, /\/v1\/send\/bulk$/);
      assert.deepEqual(mock.last().body, {
        lineNumber: 30000000000,
        messageText: 'Your Text',
        mobiles: ['9121234567', '9351234567'],
        sendDateTime: null,
      });
    });

    it('sends sendDateTime as Unix seconds', async () => {
      const mock = mockFetch(ok({ packId: 'p', messageIds: [1] }));
      const when = new Date('2027-01-01T12:00:00Z');
      await provider(mock.fetch).send({ to: '09121234567', message: 'x', scheduleAt: when });
      assert.equal(
        (mock.last().body as { sendDateTime: number }).sendDateTime,
        Math.floor(when.getTime() / 1000),
      );
    });

    it('enforces the documented 100-recipient cap locally', async () => {
      const mock = mockFetch(ok({}));
      const many = Array.from({ length: 101 }, (_, i) => `0912${String(1000000 + i)}`);
      await assert.rejects(
        () => provider(mock.fetch).send({ to: many, message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.equal(error.code, 105);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });

    it('normalises the pack response', async () => {
      const mock = mockFetch(ok({ packId: '2b99e63c', messageIds: [101], cost: 1.5 }));
      const result = await provider(mock.fetch).send({ to: '09121234567', message: 'x' });

      assert.equal(result.batchId, '2b99e63c');
      assert.equal(result.messageId, '101');
      assert.equal(result.cost, 1.5);
      assert.equal(result.currency, 'credit');
    });
  });

  describe('like-to-like', () => {
    it('sends parallel arrays', async () => {
      const mock = mockFetch(ok({ packId: 'p', messageIds: [1, 2] }));
      await provider(mock.fetch).sendPeerToPeer([
        { to: '09121234567', message: 'one' },
        { to: '09351234567', message: 'two' },
      ]);

      assert.match(mock.last().url, /\/v1\/send\/likeTolike$/);
      assert.deepEqual(mock.last().body, {
        lineNumber: 30000000000,
        messageTexts: ['one', 'two'],
        mobiles: ['9121234567', '9351234567'],
        sendDateTime: null,
      });
    });
  });

  describe('verify (pattern)', () => {
    it('sends parameters as an array of name/value pairs', async () => {
      const mock = mockFetch(ok({ messageId: 89545112, cost: 1 }));
      await provider(mock.fetch).sendPattern({
        to: '09121234567',
        pattern: 100000,
        variables: { NAME: 'Omid', CODE: '12345' },
      });

      assert.match(mock.last().url, /\/v1\/send\/verify$/);
      assert.deepEqual(mock.last().body, {
        mobile: '9121234567',
        templateId: 100000,
        parameters: [
          { name: 'NAME', value: 'Omid' },
          { name: 'CODE', value: '12345' },
        ],
      });
    });

    it('rejects a non-numeric template id', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(
        () => provider(mock.fetch).sendPattern({ to: '09121234567', pattern: 'not-a-number', variables: {} }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.equal(error.code, 113);
          return true;
        },
      );
    });

    it('enforces the documented 25-character parameter limit locally', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(
        () =>
          provider(mock.fetch).sendPattern({
            to: '09121234567',
            pattern: 1,
            variables: { CODE: 'x'.repeat(26) },
          }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.equal(error.code, 114);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });

    it('rejects more than one recipient', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(
        () => provider(mock.fetch).sendPattern({ to: ['09121234567', '09351234567'], pattern: 1 }),
        SMSValidationError,
      );
    });
  });

  describe('error mapping', () => {
    it('treats a 200 with status 102 as insufficient credit', async () => {
      const mock = mockFetch(appError(102));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSInsufficientCreditError);
          assert.match(error.message, /Insufficient credit/);
          return true;
        },
      );
    });

    it('maps 20 to rate limit', async () => {
      const mock = mockFetch(appError(20));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        SMSRateLimitError,
      );
    });

    it('maps 115 (blacklisted) to a recipient error', async () => {
      const mock = mockFetch(appError(115));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        SMSRecipientError,
      );
    });

    it('maps 113 to a pattern error', async () => {
      const mock = mockFetch(appError(113));
      await assert.rejects(
        () => provider(mock.fetch).sendPattern({ to: '09121234567', pattern: 1, variables: {} }),
        SMSPatternError,
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
    it('maps deliveryState to a normalized status', async () => {
      const mock = mockFetch(
        ok({ messageId: 1, mobile: 9121234567, deliveryState: 1, deliveryDateTime: 1704094200 }),
      );
      const status = await provider(mock.fetch).getStatus('1');

      assert.equal(status.status, 'delivered');
      assert.equal(status.nativeStatus, 1);
      assert.ok(status.deliveredAt instanceof Date);
    });

    it('maps deliveryState 7 to blocked', async () => {
      const mock = mockFetch(ok({ messageId: 1, deliveryState: 7 }));
      assert.equal((await provider(mock.fetch).getStatus('1')).status, 'blocked');
    });

    it('reads a bare numeric credit', async () => {
      const mock = mockFetch(ok(165.3));
      const balance = await provider(mock.fetch).getBalance();
      assert.equal(balance.amount, 165.3);
      assert.match(mock.last().url, /\/v1\/credit$/);
    });

    it('reads the line list', async () => {
      const mock = mockFetch(ok([10002155613464, 30004505000017]));
      const senders = await provider(mock.fetch).listSenders();
      assert.deepEqual(
        senders.map((sender) => sender.number),
        ['10002155613464', '30004505000017'],
      );
    });

    it('cancels a scheduled pack with DELETE', async () => {
      const mock = mockFetch(ok({ returnedCreditCount: 2, smsCount: 2 }));
      await provider(mock.fetch).cancelScheduled('2b99e63c');
      assert.equal(mock.last().method, 'DELETE');
      assert.match(mock.last().url, /\/v1\/send\/scheduled\/2b99e63c$/);
    });
  });
});
