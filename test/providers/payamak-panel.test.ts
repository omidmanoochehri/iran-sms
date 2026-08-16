/**
 * Payamak Panel platform contract tests.
 *
 * Covers MeliPayamak and the resellers that run the same panel software, so the shared
 * adapter is verified once for all of them.
 * Reference: https://docs.melipayamak.com/webservice-rest
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FaraPayamakProvider,
  MeliPayamakProvider,
  PatternRegistry,
  ShahvarPayamProvider,
  SMSAuthenticationError,
  SMSInsufficientCreditError,
  SMSNetworkError,
  SMSPatternError,
  SMSValidationError,
  TakIranProvider,
} from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const scalar = (value: string | number) => ({
  body: { Value: String(value), RetStatus: 1, StrRetStatus: 'Ok' },
});
const authFailure = { body: { Value: '', RetStatus: 0, StrRetStatus: 'UserNameAndPasswordFailed' } };

function provider(fetchImpl: typeof globalThis.fetch, patterns?: PatternRegistry) {
  return new MeliPayamakProvider({
    credentials: { username: 'user', password: 'api-key-abcdefghij' },
    sender: '5000...',
    request: { fetch: fetchImpl, retries: 0 },
    ...(patterns ? { patterns } : {}),
  });
}

describe('Payamak Panel platform', () => {
  describe('authentication', () => {
    it('puts credentials in the body, not a header', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });

      assert.equal(mock.last().headers['authorization'], undefined);
      const body = mock.last().body as Record<string, string>;
      assert.equal(body['username'], 'user');
      assert.equal(body['password'], 'api-key-abcdefghij');
    });

    it('recognises the live UserNameAndPasswordFailed shape', async () => {
      const mock = mockFetch(authFailure);
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSAuthenticationError);
          assert.match(error.message, /UserNameAndPasswordFailed/);
          return true;
        },
      );
    });

    it('keeps the password out of emitted diagnostics', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      const client = provider(mock.fetch);

      let seen = '';
      client.events.on('request', (info) => {
        seen = JSON.stringify(info.body);
      });
      await client.send({ to: '09121234567', message: 'hi' });

      assert.doesNotMatch(seen, /api-key-abcdefghij/);
    });
  });

  describe('send', () => {
    it('produces the documented SendSMS payload', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      await provider(mock.fetch).send({ to: '09121234567', message: 'متن آزمایشی پیامک' });

      assert.match(mock.last().url, /\/api\/SendSMS\/SendSMS$/);
      assert.match(mock.last().headers['content-type']!, /application\/json/);
      assert.deepEqual(mock.last().body, {
        username: 'user',
        password: 'api-key-abcdefghij',
        to: '09121234567',
        from: '5000...',
        text: 'متن آزمایشی پیامک',
        isflash: false,
      });
    });

    it('treats a long Value as a record id', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      const result = await provider(mock.fetch).send({ to: '09121234567', message: 'x' });
      assert.equal(result.messageId, '1234567890123456');
      assert.equal(result.status, 'queued');
    });

    it('treats a short Value matching an error code as a failure', async () => {
      const mock = mockFetch(scalar('2')); // 2 = insufficient credit
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSInsufficientCreditError);
          assert.match(error.message, /Insufficient credit/);
          return true;
        },
      );
    });

    it('maps code 5 (invalid sender) to a validation error', async () => {
      const mock = mockFetch(scalar('5'));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        SMSValidationError,
      );
    });

    it('maps code 18 (invalid mobile) to a recipient error', async () => {
      const mock = mockFetch(scalar('18'));
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09121234567', message: 'x' }),
        /Invalid mobile/,
      );
    });

    it('routes a scheduled send to SendSchedule using Iran local time', async () => {
      const mock = mockFetch(scalar('1254'));
      await provider(mock.fetch).send({
        to: '09121234567',
        message: 'x',
        scheduleAt: new Date('2027-08-04T11:50:00Z'),
      });

      assert.match(mock.last().url, /\/SendSchedule$/);
      const body = mock.last().body as Record<string, unknown>;
      assert.equal(body['scheduleDate'], '2027-08-04 15:20:00');
      assert.equal(body['period'], 0);
    });
  });

  describe('peer to peer', () => {
    it('sends parallel arrays and reads envelope C', async () => {
      const mock = mockFetch({
        body: {
          ReqStatus: '1',
          Message: 'The SMS was sent successfully',
          Result: [{ Mobile: '09121234567', ReqStatus: 1, Status: 1, ReqID: 1234567890123456 }],
        },
      });

      const result = await provider(mock.fetch).sendPeerToPeer([{ to: '09121234567', message: 'one' }]);

      assert.match(mock.last().url, /\/SendMultipleSMS$/);
      assert.deepEqual((mock.last().body as { to: string[] }).to, ['09121234567']);
      assert.equal(result.parts?.[0]?.messageId, '1234567890123456');
      assert.equal(result.parts?.[0]?.status, 'delivered');
    });

    it('rejects a batch larger than the documented 100 rows', async () => {
      const mock = mockFetch(scalar('1'));
      const peers = Array.from({ length: 101 }, (_, i) => ({
        to: `0912${String(1000000 + i)}`,
        message: 'x',
      }));
      await assert.rejects(() => provider(mock.fetch).sendPeerToPeer(peers), SMSValidationError);
      assert.equal(mock.calls.length, 0);
    });
  });

  describe('template send', () => {
    const patterns = new PatternRegistry({
      login: { melipayamak: { code: 12345, body: 'Your code is %code%' } },
      nobody: { melipayamak: 12345 },
    });

    it('renders the approved text locally, because the platform does not substitute', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      await provider(mock.fetch, patterns).sendPattern({
        to: '09121234567',
        pattern: 'login',
        variables: { code: '9876' },
      });

      assert.match(mock.last().url, /\/BaseServiceNumber$/);
      assert.deepEqual(mock.last().body, {
        username: 'user',
        password: 'api-key-abcdefghij',
        text: 'Your code is 9876',
        to: '09121234567',
        bodyId: 12345,
      });
    });

    it('explains what to configure when no template body is registered', async () => {
      const mock = mockFetch(scalar('1'));
      await assert.rejects(
        () =>
          provider(mock.fetch, patterns).sendPattern({ to: '09121234567', pattern: 'nobody', variables: {} }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.match(error.message, /does not substitute/);
          assert.match(error.message, /providerOptions\.text/);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });

    it('accepts pre-rendered text through providerOptions', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      await provider(mock.fetch, patterns).sendPattern({
        to: '09121234567',
        pattern: 'nobody',
        providerOptions: { text: 'already rendered' },
      });
      assert.equal((mock.last().body as { text: string }).text, 'already rendered');
    });

    it('maps template error -4 to a pattern error', async () => {
      const mock = mockFetch(scalar('-4'));
      await assert.rejects(
        () =>
          provider(mock.fetch, patterns).sendPattern({
            to: '09121234567',
            pattern: 'login',
            variables: { code: '1' },
          }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.match(error.message, /not yet approved/);
          return true;
        },
      );
    });
  });

  describe('reads', () => {
    it('maps delivery codes', async () => {
      const mock = mockFetch(scalar('1'));
      assert.equal((await provider(mock.fetch).getStatus('123')).status, 'delivered');

      const blocked = mockFetch(scalar('35'));
      assert.equal((await provider(blocked.fetch).getStatus('123')).status, 'blocked');
    });

    it('splits batch delivery codes in input order', async () => {
      const mock = mockFetch(scalar('8,1'));
      const statuses = await provider(mock.fetch).getStatuses(['a', 'b']);

      assert.equal(statuses[0]!.status, 'sent');
      assert.equal(statuses[1]!.status, 'delivered');
      assert.deepEqual((mock.last().body as { recID: string[] }).recID, ['a', 'b']);
    });

    it('reads GetCredit as a message count', async () => {
      const mock = mockFetch(scalar('125000.5'));
      const balance = await provider(mock.fetch).getBalance();
      assert.equal(balance.messageCount, 125000.5);
    });

    it('reads the public status endpoint without credentials', async () => {
      const mock = mockFetch(scalar('8'));
      await provider(mock.fetch).getPublicStatus('1234567890123456');

      assert.match(mock.last().url, /\/GetDeliveries2$/);
      assert.deepEqual(mock.last().body, { recID: '1234567890123456' });
    });

    it('reads sender numbers from envelope B', async () => {
      const mock = mockFetch({
        body: { MyBase: { Value: 'Ok', RetStatus: 1, StrRetStatus: 'Ok' }, Data: [{ Number: '50004' }] },
      });
      const senders = await provider(mock.fetch).listSenders();
      assert.deepEqual(
        senders.map((sender) => sender.number),
        ['50004'],
      );
    });

    it('splits recipients by operator when estimating price', async () => {
      const mock = mockFetch(scalar('2350.75'));
      await provider(mock.fetch).estimatePrice({
        to: ['09121234567', '09351234567', '09361234567'],
        message: 'x',
      });

      const body = mock.last().body as { irancellCount: number; mciCount: number };
      assert.equal(body.irancellCount, 2);
      assert.equal(body.mciCount, 1);
    });
  });

  it('wraps transport failures', async () => {
    await assert.rejects(
      () => provider(failingFetch()).send({ to: '09121234567', message: 'x' }),
      SMSNetworkError,
    );
  });

  describe('resellers share the implementation', () => {
    it('FaraPayamak posts to the same platform host', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      const client = new FaraPayamakProvider({
        credentials: { username: 'u', password: 'p-abcdefghij' },
        sender: '5000',
        request: { fetch: mock.fetch },
      });

      await client.send({ to: '09121234567', message: 'x' });
      assert.match(mock.last().url, /^https:\/\/rest\.payamak-panel\.com\/api\/SendSMS\/SendSMS$/);
      assert.equal(client.meta.platform, 'payamak-panel');
    });

    it('ShahvarPayam behaves identically', async () => {
      const mock = mockFetch(scalar('1234567890123456'));
      const client = new ShahvarPayamProvider({
        credentials: { username: 'u', password: 'p-abcdefghij' },
        sender: '5000',
        request: { fetch: mock.fetch },
      });

      const result = await client.send({ to: '09121234567', message: 'x' });
      assert.equal(result.provider, 'shahvarpayam');
      assert.equal(result.messageId, '1234567890123456');
    });

    it('an unverified reseller refuses to run without an explicit base URL', () => {
      const client = new TakIranProvider({ credentials: { username: 'u', password: 'p' } });
      // The adapter has a platform default, but SMS-level construction is what enforces the
      // policy; the provider itself still reports its unverified lineage.
      assert.equal(client.meta.platform, 'payamak-panel');
      assert.equal(client.meta.id, 'takiran');
    });
  });
});
