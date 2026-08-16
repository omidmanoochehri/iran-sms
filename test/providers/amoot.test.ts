/**
 * AmootSMS contract tests.
 * References: https://hub.amootsoft.com/Payamak/docs/* and https://portal.amootsms.com/rest
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AmootProvider,
  PatternRegistry,
  SMSAuthenticationError,
  SMSError,
  SMSNetworkError,
  SMSPatternError,
  SMSValidationError,
} from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

const success = (extra: Record<string, unknown> = {}) => ({ body: { Status: 'Success', ...extra } });

function provider(fetchImpl: typeof globalThis.fetch, patterns?: PatternRegistry) {
  return new AmootProvider({
    credentials: { token: 'amoot-token-abcdefghij' },
    sender: 'public',
    request: { fetch: fetchImpl, retries: 0 },
    ...(patterns ? { patterns } : {}),
  });
}

describe('AmootSMS', () => {
  describe('authentication', () => {
    it('sends the token in Authorization and mirrors it into the body', async () => {
      const mock = mockFetch(success({ Data: [] }));
      await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });

      assert.equal(mock.last().headers['authorization'], 'amoot-token-abcdefghij');
      assert.equal((mock.last().body as Record<string, string>)['token'], 'amoot-token-abcdefghij');
    });

    it('maps Token_Invalid to SMSAuthenticationError', async () => {
      const mock = mockFetch({ body: { Status: 'Token_Invalid', RemaindCredit: 0 } });
      await assert.rejects(
        () => provider(mock.fetch).getBalance(),
        (error: unknown) => {
          assert.ok(error instanceof SMSAuthenticationError);
          assert.equal(error.code, 'Token_Invalid');
          return true;
        },
      );
    });
  });

  describe('send', () => {
    it('posts urlencoded fields with comma-joined mobiles', async () => {
      const mock = mockFetch(
        success({
          MessageText: 'hi',
          SMSPagesCount: 1,
          CampaignID: 12345678,
          Price: 1234,
          Data: [{ Mobile: 9120000000, MessageID: 1, Status: 'Success' }],
        }),
      );

      await provider(mock.fetch).send({ to: ['09120000000', '09150000000'], message: 'hi' });

      const call = mock.last();
      assert.match(call.url, /\/SendSimple$/);
      assert.match(call.headers['content-type']!, /x-www-form-urlencoded/);
      assert.equal((call.body as Record<string, string>)['Mobiles'], '09120000000,09150000000');
      assert.equal((call.body as Record<string, string>)['SendDateTime'], '0');
      assert.equal((call.body as Record<string, string>)['LineNumber'], 'public');
    });

    it('uses "0" for send-now and Iran local time for a schedule', async () => {
      const mock = mockFetch(success({ Data: [] }));
      await provider(mock.fetch).send({
        to: '09120000000',
        message: 'x',
        scheduleAt: new Date('2027-08-04T11:50:00Z'),
      });
      assert.equal((mock.last().body as Record<string, string>)['SendDateTime'], '2027-08-04 15:20:00');
    });

    it('normalises campaign id and price', async () => {
      const mock = mockFetch(
        success({ CampaignID: 999, Price: 2299, Data: [{ Mobile: 1, MessageID: 5, Status: 'Success' }] }),
      );
      const result = await provider(mock.fetch).send({ to: '09120000000', message: 'x' });

      assert.equal(result.batchId, '999');
      assert.equal(result.cost, 2299);
      assert.equal(result.parts?.[0]?.messageId, '5');
    });

    it('maps a non-Success status to an error and keeps the raw body', async () => {
      const mock = mockFetch({ body: { Status: 'LineNumber_Empty', Data: [] } });
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09120000000', message: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof SMSError);
          assert.equal(error.code, 'LineNumber_Empty');
          assert.match(error.message, /LineNumber was not supplied/);
          return true;
        },
      );
    });

    it('marks an undocumented status as an error without inventing a meaning', async () => {
      const mock = mockFetch({ body: { Status: 'Some_New_Status' } });
      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09120000000', message: 'x' }),
        (error: unknown) => {
          assert.equal((error as SMSError).code, 'Some_New_Status');
          assert.match((error as SMSError).message, /Undocumented status/);
          return true;
        },
      );
    });

    it('keeps a .NET exception body out of the user-facing message', async () => {
      const leak =
        "The parameters dictionary contains a null entry ... in 'Amoot.AmootSMS.Mvc.Controllers.RestController'";
      const mock = mockFetch({ body: { Status: 'ServerError', ErrorMessage: leak } });

      await assert.rejects(
        () => provider(mock.fetch).send({ to: '09120000000', message: 'x' }),
        (error: unknown) => {
          const smsError = error as SMSError;
          assert.doesNotMatch(smsError.message, /RestController/);
          assert.match(JSON.stringify(smsError.raw), /RestController/);
          assert.equal(smsError.retryable, true);
          return true;
        },
      );
    });
  });

  describe('pattern', () => {
    const patterns = new PatternRegistry({
      login: { amoot: { code: 4021, variableOrder: ['name', 'code'] } },
      single: { amoot: 5000 },
      unordered: { amoot: 6000 },
    });

    it('flattens variables into positional PatternValues', async () => {
      const mock = mockFetch(success({ Data: { Mobile: 9120000000, MessageID: 1, Status: 'Success' } }));
      await provider(mock.fetch, patterns).sendPattern({
        to: '09120000000',
        pattern: 'login',
        variables: { code: '1234', name: 'Omid' },
      });

      const body = mock.last().body as Record<string, string>;
      assert.match(mock.last().url, /\/SendWithPatternOWN$/);
      assert.equal(body['PatternValues'], 'Omid,1234');
      assert.equal(body['PatternCodeID'], '4021');
    });

    it('refuses to guess the order for several unordered variables', async () => {
      const mock = mockFetch(success({}));
      await assert.rejects(
        () =>
          provider(mock.fetch, patterns).sendPattern({
            to: '09120000000',
            pattern: 'unordered',
            variables: { a: '1', b: '2' },
          }),
        (error: unknown) => {
          assert.ok(error instanceof SMSPatternError);
          assert.match(error.message, /variableOrder/);
          return true;
        },
      );
      assert.equal(mock.calls.length, 0);
    });

    it('allows a single variable without an explicit order', async () => {
      const mock = mockFetch(success({ Data: {} }));
      await provider(mock.fetch, patterns).sendPattern({
        to: '09120000000',
        pattern: 'single',
        variables: { code: '99' },
      });
      assert.equal((mock.last().body as Record<string, string>)['PatternValues'], '99');
    });

    it('rejects a non-numeric pattern code', async () => {
      const mock = mockFetch(success({}));
      await assert.rejects(
        () => provider(mock.fetch).sendPattern({ to: '09120000000', pattern: 'not-numeric', variables: {} }),
        SMSValidationError,
      );
    });
  });

  describe('quick OTP', () => {
    it('returns the provider-generated code', async () => {
      const mock = mockFetch(
        success({
          CampaignID: 1,
          Price: 1,
          Data: { Mobile: 9150000000, MessageID: 2, Code: '917649', Status: 'Success' },
        }),
      );

      const result = await provider(mock.fetch).sendQuickOtp({
        to: '09150000000',
        patternCodeId: 42,
        codeLength: 6,
      });
      assert.equal(result.code, '917649');
      assert.equal((mock.last().body as Record<string, string>)['CodeLength'], '6');
    });

    it('enforces the documented 4–8 length bounds', async () => {
      const mock = mockFetch(success({}));
      await assert.rejects(
        () => provider(mock.fetch).sendQuickOtp({ to: '09150000000', patternCodeId: 1, codeLength: 9 }),
        SMSValidationError,
      );
      assert.equal(mock.calls.length, 0);
    });
  });

  describe('webhooks', () => {
    it('registers a delivery relay and returns its id', async () => {
      const mock = mockFetch(success({ RelayMessageDeliveryID: 9999 }));
      const result = await provider(mock.fetch).createWebhook({
        url: 'https://hook.test/dlr',
        kind: 'delivery',
      });

      assert.match(mock.last().url, /\/RelayMessageDeliveryCreate$/);
      assert.equal((mock.last().body as Record<string, string>)['URLAddress'], 'https://hook.test/dlr');
      assert.equal(result.id, '9999');
    });

    it('registers an inbound relay', async () => {
      const mock = mockFetch(success({ RelayRecieveMessageID: 999 }));
      const result = await provider(mock.fetch).createWebhook({
        url: 'https://hook.test/in',
        kind: 'inbound',
      });
      assert.match(mock.last().url, /\/RelayRecieveMessageCreate$/);
      assert.equal(result.id, '999');
    });

    it('handles the bare-string "Success" response from SetActive', async () => {
      const mock = mockFetch({ body: '"Success"' });
      const result = await provider(mock.fetch).setWebhookActive('1', false, 'delivery');
      assert.equal(result.success, true);
    });
  });

  describe('account', () => {
    it('reads credit, tariffs and lines from one call', async () => {
      const mock = mockFetch({
        body: {
          Status: 'Success',
          AccountName: 'demo',
          RemaindCredit: 987654,
          ListLineNumbers: ['50004', '3000'],
        },
      });

      const client = provider(mock.fetch);
      const balance = await client.getBalance();
      assert.equal(balance.amount, 987654);

      const senders = await client.listSenders();
      assert.deepEqual(
        senders.map((sender) => sender.number),
        ['50004', '3000'],
      );
    });

    it('handles the numeric Status on CalculatePatternMessagePrice', async () => {
      const mock = mockFetch({ body: { Status: 1, ReturnValue: 1500 } });
      const result = await provider(mock.fetch).native.calculatePatternMessagePrice({
        Mobile: '09120000000',
        PatternCodeID: 1,
        PatternValues: 'x',
      });
      assert.equal((result as { ReturnValue: number }).ReturnValue, 1500);
    });
  });

  it('wraps transport failures', async () => {
    await assert.rejects(
      () => provider(failingFetch()).send({ to: '09120000000', message: 'x' }),
      SMSNetworkError,
    );
  });
});
