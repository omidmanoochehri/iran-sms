/**
 * IPPanel contract tests.
 *
 * These assert the exact request the adapter puts on the wire against the shapes published
 * at https://docs.ippanel.com/ — so a future refactor cannot silently change what a real
 * gateway receives.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  IPPanelProvider,
  SMSAuthenticationError,
  SMSNetworkError,
  SMSTimeoutError,
  SMSValidationError,
} from '../imports.ts';
import { failingFetch, hangingFetch, mockFetch } from '../helpers.ts';

const ok = (data: unknown) => ({
  body: { data, meta: { status: true, message: 'انجام شد', message_code: '200-1' } },
});

function provider(fetchImpl: typeof globalThis.fetch, overrides: Record<string, unknown> = {}) {
  return new IPPanelProvider({
    credentials: { apiKey: 'ip-key-abcdefghij' },
    sender: '+983000505',
    request: { fetch: fetchImpl, retries: 0 },
    ...overrides,
  });
}

describe('IPPanel', () => {
  describe('authentication', () => {
    it('sends the raw key in Authorization with no Bearer prefix', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1] }));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });

      assert.equal(mock.last().headers['authorization'], 'ip-key-abcdefghij');
      assert.doesNotMatch(mock.last().headers['authorization']!, /Bearer/);
    });

    it('accepts a token instead of an apiKey', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1] }));
      const client = new IPPanelProvider({
        credentials: { token: 'tok-abcdefghij' },
        sender: '+983000505',
        request: { fetch: mock.fetch },
      });
      await client.send({ to: '09121234567', message: 'hi' });
      assert.equal(mock.last().headers['authorization'], 'tok-abcdefghij');
    });

    it('maps 401 to SMSAuthenticationError', async () => {
      const mock = mockFetch({
        status: 401,
        body: {
          data: null,
          meta: { status: false, message: 'اطلاعات وارد شده صحیح نمی باشد', message_code: '400-1' },
        },
      });

      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'hi' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSAuthenticationError);
          assert.equal(error.code, '400-1');
          assert.equal(error.status, 401);
          return true;
        },
      );
    });
  });

  describe('send', () => {
    it('produces the documented webservice payload', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1123544244] }));
      await provider(mock.fetch).send({ to: ['09121234567', '09351234567'], message: 'متن پیام' });

      const call = mock.last();
      assert.equal(call.method, 'POST');
      assert.match(call.url, /\/api\/send$/);
      assert.deepEqual(call.body, {
        sending_type: 'webservice',
        from_number: '+983000505',
        message: 'متن پیام',
        params: { recipients: ['+989121234567', '+989351234567'] },
      });
    });

    it('converts recipients to E.164, whatever the caller supplies', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1] }));
      await provider(mock.fetch).send({
        to: ['09121234567', '9121234567', '+989121234567', '00989121234567', '۰۹۱۲۱۲۳۴۵۶۷'],
        message: 'x',
      });

      const recipients = (mock.last().body as { params: { recipients: string[] } }).params.recipients;
      assert.deepEqual(recipients, Array(5).fill('+989121234567'));
    });

    it('formats scheduleAt as UTC, which is what the docs specify', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1] }));
      await provider(mock.fetch).send({
        to: '09121234567',
        message: 'x',
        scheduleAt: new Date('2027-03-12T21:20:02Z'),
      });

      assert.equal((mock.last().body as { send_time: string }).send_time, '2027-03-12 21:20:02');
    });

    it('rejects a schedule in the past before making a request', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(
        () =>
          provider(mock.fetch).send({ to: '09121234567', message: 'x', scheduleAt: new Date('2020-01-01') }),
        SMSValidationError,
      );
      assert.equal(mock.calls.length, 0, 'nothing should reach the network');
    });

    it('requires a sender', async () => {
      const mock = mockFetch(ok({}));
      const client = new IPPanelProvider({
        credentials: { apiKey: 'x-abcdefghij' },
        request: { fetch: mock.fetch },
      });
      await assert.rejects(() => client.send({ to: '09121234567', message: 'x' }), /requires a sender line/);
    });

    it('rejects an empty recipient list', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(() => provider(mock.fetch).send({ to: [], message: 'x' }), SMSValidationError);
    });

    it('normalises the response, always returning an array-derived id', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1123544244] }));
      const result = await provider(mock.fetch).send({ to: '09121234567', message: 'x' });

      assert.equal(result.success, true);
      assert.equal(result.provider, 'ippanel');
      assert.equal(result.messageId, '1123544244');
      assert.equal(result.batchId, '1123544244');
      assert.equal(result.status, 'queued');
      assert.deepEqual(result.recipients, ['+989121234567']);
      assert.ok(result.raw, 'the untouched provider body must be preserved');
    });

    it('leaves messageId null for a multi-recipient batch', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [42] }));
      const result = await provider(mock.fetch).send({ to: ['09121234567', '09351234567'], message: 'x' });
      assert.equal(result.messageId, null);
      assert.equal(result.batchId, '42');
    });
  });

  describe('peer to peer', () => {
    it('groups recipients per message', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1, 2] }));
      await provider(mock.fetch).sendPeerToPeer([
        { to: ['09121234567', '09351234567'], message: 'پیام اول' },
        { to: '09131234567', message: 'پیام دوم' },
      ]);

      assert.deepEqual(mock.last().body, {
        sending_type: 'peer_to_peer',
        from_number: '+983000505',
        params: [
          { recipients: ['+989121234567', '+989351234567'], message: 'پیام اول' },
          { recipients: ['+989131234567'], message: 'پیام دوم' },
        ],
      });
    });
  });

  describe('pattern', () => {
    it('sends variables as a named object under params', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [1123594208] }));
      await provider(mock.fetch).sendPattern({
        to: '09121234567',
        pattern: 'xxxxxxxxxxxxxxx',
        variables: { code: '123456' },
      });

      assert.deepEqual(mock.last().body, {
        sending_type: 'pattern',
        from_number: '+983000505',
        code: 'xxxxxxxxxxxxxxx',
        recipients: ['+989121234567'],
        params: { code: '123456' },
      });
    });

    it('rejects more than one recipient, as the API documents', async () => {
      const mock = mockFetch(ok({}));
      await assert.rejects(
        () =>
          provider(mock.fetch).sendPattern({
            to: ['09121234567', '09351234567'],
            pattern: 'abc',
            variables: {},
          }),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.match(error.message, /exactly one recipient/);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });
  });

  describe('votp', () => {
    it('sends the code as the message body with no sender', async () => {
      const mock = mockFetch(ok({ message_outbox_ids: [7] }));
      await provider(mock.fetch).sendVoice({ to: '09121234567', message: '45852' });

      assert.deepEqual(mock.last().body, {
        sending_type: 'votp',
        message: '45852',
        params: { recipients: ['+989121234567'] },
      });
    });
  });

  describe('reads', () => {
    it('parses the credit response', async () => {
      const mock = mockFetch(ok({ credit: 6084722932.7, yesterday_credit: 1, gift: 0 }));
      const balance = await provider(mock.fetch).getBalance();

      assert.equal(balance.amount, 6084722932.7);
      assert.equal(balance.currency, 'IRR');
      assert.match(mock.last().url, /\/api\/payment\/credit\/mine/);
    });

    it('maps outbox state ids to normalized statuses', async () => {
      const mock = mockFetch(ok({ messages_outbox_id: '55', state_id: 6, time_send: '1745409418' }));
      const status = await provider(mock.fetch).getStatus('55');

      assert.equal(status.status, 'sent');
      assert.equal(status.nativeStatus, 6);
      assert.ok(status.deliveredAt instanceof Date);
    });

    it('maps per-recipient statuses, including blacklisted', async () => {
      const mock = mockFetch({
        body: {
          data: [
            { recipient: '+989121234567', message_status: '2' },
            { recipient: '+989351234567', message_status: '4' },
          ],
          meta: { status: true, current_page: 1, per_page: 10, total: 2 },
        },
      });

      const page = await provider(mock.fetch).getRecipients('55');
      assert.equal(page.items[0]!.status, 'delivered');
      assert.equal(page.items[1]!.status, 'blocked');
      assert.equal(page.total, 2);
    });

    it('reads the inbox via POST with filters', async () => {
      const mock = mockFetch({
        body: {
          data: [
            {
              messages_inbox_id: 123,
              from: '+989122222222',
              number: '+981000123',
              message: 'hi',
              time: 1747808125,
            },
          ],
          meta: { status: true, current_page: 1, per_page: 10, total: 1 },
        },
      });

      const page = await provider(mock.fetch).listInbox({ page: 2, pageSize: 5 });
      assert.equal(mock.last().method, 'POST');
      assert.deepEqual(mock.last().body, { page: 2, per_page: 5, filters: {} });
      assert.equal(page.items[0]!.from, '+989122222222');
      assert.ok(page.items[0]!.receivedAt instanceof Date);
    });
  });

  describe('errors', () => {
    it('treats meta.status false on a 200 as a failure', async () => {
      const mock = mockFetch({
        status: 200,
        body: { data: null, meta: { status: false, message: 'خطا', message_code: '400-1' } },
      });
      await assert.rejects(() => provider(mock.fetch).getBalance());
    });

    it('surfaces field-level validation detail', async () => {
      const mock = mockFetch({
        status: 422,
        body: {
          data: null,
          meta: {
            status: false,
            message: 'تکمیل گزینه پیام الزامی است',
            message_code: '400-2',
            errors: { message: ['تکمیل گزینه پیام الزامی است'] },
          },
        },
      });

      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: '' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.deepEqual(error.fields, { message: ['تکمیل گزینه پیام الزامی است'] });
          return true;
        },
      );
    });

    it('wraps a transport failure', async () => {
      await assert.rejects(
        () => provider(failingFetch()).send({ to: '09121234567', message: 'x' }),
        SMSNetworkError,
      );
    });

    it('times out', async () => {
      const client = provider(hangingFetch(), {
        request: { fetch: hangingFetch(), timeout: 30, retries: 0 },
      });
      await assert.rejects(() => client.send({ to: '09121234567', message: 'x' }), SMSTimeoutError);
    });

    it('never retries a send, even when the transport fails', async () => {
      let calls = 0;
      const counting = (async () => {
        calls += 1;
        const error = new TypeError('fetch failed');
        (error as { cause?: unknown }).cause = { code: 'ECONNRESET' };
        throw error;
      }) as typeof globalThis.fetch;

      const client = new IPPanelProvider({
        credentials: { apiKey: 'x-abcdefghij' },
        sender: '+983000505',
        request: { fetch: counting, retries: 5 },
      });

      await assert.rejects(() => client.send({ to: '09121234567', message: 'x' }));
      assert.equal(calls, 1, 'IPPanel has no idempotency key, so a send must never be replayed');
    });
  });
});
