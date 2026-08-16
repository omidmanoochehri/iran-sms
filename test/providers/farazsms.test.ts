/**
 * FarazSMS / IranPayamak contract tests.
 * Reference: https://docs.farazsms.com/download/openapi.json
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FarazSMSProvider, SMSAuthenticationError, SMSNetworkError, SMSValidationError } from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const ok = (data: unknown) => ({ body: { status: 'success', data, messages: null } });

function provider(fetchImpl: typeof globalThis.fetch) {
  return new FarazSMSProvider({
    credentials: { apiKey: 'faraz-key-abcdefghij' },
    sender: '50002178584000',
    request: { fetch: fetchImpl, retries: 0 },
  });
}

describe('FarazSMS', () => {
  describe('authentication', () => {
    it('sends the Api-Key header', async () => {
      const mock = mockFetch(ok(123));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });
      assert.equal(mock.last().headers['api-key'], 'faraz-key-abcdefghij');
    });

    it('targets the IranPayamak host, which is the platform base for both brands', async () => {
      const mock = mockFetch(ok(1));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });
      assert.match(mock.last().url, /^https:\/\/api\.iranpayamak\.com\//);
    });

    it('maps 401 to SMSAuthenticationError', async () => {
      const mock = mockFetch({ status: 401, body: { status: 'error', data: null, message: 'Unauthorized' } });
      await assert.rejects(
        () => provider(mock.fetch).getBalance(),
        (error: unknown) => {
          assert.ok(error instanceof SMSAuthenticationError);
          assert.match(error.message, /Unauthorized/);
          return true;
        },
      );
    });

    it('treats status:"error" on a 200 as a failure', async () => {
      const mock = mockFetch({ status: 200, body: { status: 'error', data: null, message: 'nope' } });
      await assert.rejects(() => provider(mock.fetch).getBalance());
    });
  });

  describe('send', () => {
    it('uses the national number format, not E.164', async () => {
      const mock = mockFetch(ok(1));
      await provider(mock.fetch).send({ to: ['+989121234567', '9121234567'], message: 'x' });

      const body = mock.last().body as { recipients: string[] };
      assert.deepEqual(body.recipients, ['09121234567', '09121234567']);
    });

    it('produces the documented simple-send payload', async () => {
      const mock = mockFetch(ok(456));
      await provider(mock.fetch).send({ to: '09121234567', message: 'test message' });

      assert.match(mock.last().url, /\/ws\/v1\/sms\/simple$/);
      assert.deepEqual(mock.last().body, {
        text: 'test message',
        recipients: ['09121234567'],
        line_number: '50002178584000',
        number_format: 'english',
      });
    });

    it('emits the long number_format spelling the official examples use', async () => {
      const mock = mockFetch(ok(1));
      await provider(mock.fetch).send({
        to: '09121234567',
        message: 'x',
        providerOptions: { number_format: 'fa' },
      });
      assert.equal((mock.last().body as { number_format: string }).number_format, 'persian');
    });

    it('returns the send-request id as the batch id', async () => {
      const mock = mockFetch(ok(789));
      const result = await provider(mock.fetch).send({ to: '09121234567', message: 'x' });
      assert.equal(result.batchId, '789');
      assert.equal(result.currency, 'IRT');
    });
  });

  describe('pattern', () => {
    it('sends variables under attributes with a singular recipient field', async () => {
      const mock = mockFetch(ok(999));
      await provider(mock.fetch).sendPattern({
        to: '09121234567',
        pattern: 'SJ3FgPrE0C',
        variables: { var1: '1', var2: '2' },
      });

      assert.match(mock.last().url, /\/ws\/v1\/sms\/pattern$/);
      assert.deepEqual(mock.last().body, {
        code: 'SJ3FgPrE0C',
        attributes: { var1: '1', var2: '2' },
        recipient: '09121234567',
        line_number: '50002178584000',
        number_format: 'english',
      });
    });

    it('omits schedule unless the caller sets it, because the spec is uncertain there', async () => {
      const mock = mockFetch(ok(1));
      await provider(mock.fetch).sendPattern({ to: '09121234567', pattern: 'p', variables: {} });
      assert.equal((mock.last().body as { schedule?: string }).schedule, undefined);
    });

    it('rejects more than one recipient', async () => {
      const mock = mockFetch(ok(1));
      await assert.rejects(
        () => provider(mock.fetch).sendPattern({ to: ['09121234567', '09351234567'], pattern: 'p' }),
        SMSValidationError,
      );
    });
  });

  describe('peer to peer', () => {
    it('posts multipart with JSON-encoded peers', async () => {
      const mock = mockFetch(ok([1, 2]));
      await provider(mock.fetch).sendPeerToPeer([
        { to: '09121234567', message: 'one' },
        { to: '09351234567', message: 'two' },
      ]);

      assert.match(mock.last().url, /\/ws\/v1\/send\/peer-to-peer$/);
      assert.equal(mock.last().headers['content-type'], undefined, 'multipart boundary is set by fetch');

      const body = mock.last().body as { peers: string; from: string };
      assert.deepEqual(JSON.parse(body.peers), [
        { text: 'one', recipients: ['09121234567'] },
        { text: 'two', recipients: ['09351234567'] },
      ]);
    });
  });

  describe('reads', () => {
    it('parses the balance envelope', async () => {
      const mock = mockFetch(ok({ balanceAmount: 5000, balanceCount: 25, details: [] }));
      const balance = await provider(mock.fetch).getBalance();

      assert.equal(balance.amount, 5000);
      assert.equal(balance.messageCount, 25);
      assert.equal(balance.currency, 'IRT');
    });

    it('parses the profile', async () => {
      const mock = mockFetch(
        ok({
          displayName: 'فراز',
          mobile: '09120000000',
          verified: true,
          plan: { expiryDate: '2027-02-04T15:41:35.000000Z' },
        }),
      );
      const info = await provider(mock.fetch).getAccountInfo();

      assert.equal(info.displayName, 'فراز');
      assert.equal(info.mobile, '09120000000');
      assert.ok(info.expiresAt instanceof Date);
    });

    it('parses the paginated inbox, including the provider misspelling', async () => {
      const mock = mockFetch(
        ok({
          currentPage: 1,
          totalPages: 1,
          totalItems: 1,
          itemsPerPage: 20,
          items: [{ from: '09121234567', to: '50002', text: 'hello', recievedAt: '2026-08-04T15:20:00' }],
        }),
      );

      const page = await provider(mock.fetch).listInbox();
      assert.equal(page.total, 1);
      assert.equal(page.items[0]!.text, 'hello');
      assert.ok(page.items[0]!.receivedAt instanceof Date);
    });

    it('maps per-recipient delivery statuses', async () => {
      const mock = mockFetch(
        ok({
          currentPage: 1,
          itemsPerPage: 20,
          totalItems: 2,
          items: [
            { mobile: '09121234567', status: 'delivered' },
            { mobile: '09351234567', status: 'blacklist' },
          ],
        }),
      );

      const page = await provider(mock.fetch).getSendRequestItems('55');
      assert.equal(page.items[0]!.status, 'delivered');
      assert.equal(page.items[1]!.status, 'blocked');
    });
  });

  it('wraps transport failures', async () => {
    await assert.rejects(
      () => provider(failingFetch()).send({ to: '09121234567', message: 'x' }),
      SMSNetworkError,
    );
  });
});
