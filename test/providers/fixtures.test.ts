/**
 * Fixture-driven response parsing.
 *
 * Every file in `test/fixtures/` is a response shape taken from a provider's own
 * documentation (or observed from a live error). This suite feeds each one through the
 * matching adapter and asserts what comes out — so parsing is verified against what the
 * providers actually return, not against what this package finds convenient.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AmootProvider,
  FarazSMSProvider,
  IPPanelProvider,
  KavenegarProvider,
  MedianaProvider,
  MeliPayamakProvider,
  MizbanSmsProvider,
  SmsIrProvider,
  SMSAuthenticationError,
  SMSInsufficientCreditError,
  SMSPatternError,
  SMSRateLimitError,
} from '../imports.ts';
import type { SMSError } from '../imports.ts';
import { mockFetch } from '../helpers.ts';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

function load(provider: string, name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, provider, name), 'utf8'));
}

function names(provider: string): string[] {
  return readdirSync(join(FIXTURES, provider)).filter((file) => file.endsWith('.json'));
}

const CREDENTIALS = {
  apiKey: 'fixture-key-abcdefghij',
  token: 'fixture-token-abcdefghij',
  username: 'fixture-user',
  password: 'fixture-pass-abcdefghij',
};

/* ------------------------------------------------------------------ every fixture is valid JSON */

describe('fixtures', () => {
  const providers = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('covers the providers with published response schemas', () => {
    assert.deepEqual(providers.sort(), [
      'amoot',
      'farazsms',
      'ippanel',
      'kavenegar',
      'mediana',
      'melipayamak',
      'mizbansms',
      'smsir',
    ]);
  });

  for (const provider of providers) {
    it(`${provider}: every fixture parses and contains no credentials`, () => {
      const files = names(provider);
      assert.ok(files.length > 0, `${provider} has no fixtures`);

      for (const file of files) {
        const body = JSON.stringify(load(provider, file));
        // Fixtures are committed to the repository; a real secret must never reach one.
        assert.doesNotMatch(body, /sk_live|Bearer\s+[A-Za-z0-9._-]{20,}/, `${provider}/${file}`);
      }
    });
  }
});

/* ------------------------------------------------------------------ IPPanel */

describe('fixtures › ippanel', () => {
  const provider = (body: unknown, status = 200) =>
    new IPPanelProvider({
      credentials: CREDENTIALS,
      sender: '+983000505',
      request: { fetch: mockFetch({ status, body }).fetch, retries: 0 },
    });

  it('parses a send response', async () => {
    const result = await provider(load('ippanel', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.messageId, '1123544244');
    assert.equal(result.status, 'queued');
  });

  it('parses a balance response', async () => {
    const balance = await provider(load('ippanel', 'balance.json')).getBalance();
    assert.equal(balance.amount, 6084722932.705052);
    assert.equal(balance.currency, 'IRR');
  });

  it('parses an outbox report and maps state_id 6 to "sent"', async () => {
    const status = await provider(load('ippanel', 'outbox-report.json')).getStatus('12545856');
    assert.equal(status.status, 'sent');
    assert.equal(status.nativeStatus, 6);
  });

  it('parses per-recipient delivery statuses including blacklisted', async () => {
    const page = await provider(load('ippanel', 'delivery-report.json')).getRecipients('1');
    assert.equal(page.items[0]!.status, 'delivered');
    assert.equal(page.items[1]!.status, 'blocked');
    assert.equal(page.total, 2);
  });

  it('parses the inbox', async () => {
    const page = await provider(load('ippanel', 'inbox.json')).listInbox();
    assert.equal(page.items[0]!.from, '+989122222222');
    assert.ok(page.items[0]!.receivedAt instanceof Date);
  });

  it('raises SMSAuthenticationError from the auth fixture', async () => {
    await assert.rejects(
      () => provider(load('ippanel', 'auth-error.json'), 401).getBalance(),
      SMSAuthenticationError,
    );
  });

  it('raises SMSValidationError with fields from the validation fixture', async () => {
    await assert.rejects(
      () => provider(load('ippanel', 'validation-error.json'), 422).send({ to: '09121234567', message: '' }),
      (error: unknown) => {
        assert.deepEqual((error as { fields?: unknown }).fields, {
          message: ['تکمیل گزینه پیام الزامی است'],
        });
        return true;
      },
    );
  });
});

/* ------------------------------------------------------------------ Kavenegar */

describe('fixtures › kavenegar', () => {
  const provider = (body: unknown) =>
    new KavenegarProvider({
      credentials: CREDENTIALS,
      sender: '10004346',
      request: { fetch: mockFetch({ body }).fetch, retries: 0 },
    });

  it('parses a send response with cost', async () => {
    const result = await provider(load('kavenegar', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.messageId, '8792343');
    assert.equal(result.cost, 120);
    assert.equal(result.status, 'sent');
  });

  it('maps delivery statuses 10 and 11', async () => {
    const statuses = await provider(load('kavenegar', 'delivery-report.json')).getStatuses(['1', '2']);
    assert.equal(statuses[0]!.status, 'delivered');
    assert.equal(statuses[1]!.status, 'undelivered');
  });

  it('parses account info', async () => {
    const balance = await provider(load('kavenegar', 'balance.json')).getBalance();
    assert.equal(balance.amount, 1500000);
  });

  it('parses the blacklist existence check', async () => {
    const blocked = await provider(load('kavenegar', 'blocked-exists.json')).isBlacklisted('0911222333');
    assert.equal(blocked, true);
  });

  const errorCases: Array<[string, unknown]> = [
    ['auth-error.json', SMSAuthenticationError],
    ['insufficient-credit.json', SMSInsufficientCreditError],
    ['pattern-error.json', SMSPatternError],
    ['rate-limit.json', SMSRateLimitError],
  ];

  for (const [file, ErrorClass] of errorCases) {
    it(`raises ${(ErrorClass as { name: string }).name} from ${file}`, async () => {
      await assert.rejects(
        () => provider(load('kavenegar', file)).send({ to: '09121234567', message: 'x' }),
        ErrorClass as never,
      );
    });
  }
});

/* ------------------------------------------------------------------ SMS.ir */

describe('fixtures › smsir', () => {
  const provider = (body: unknown) =>
    new SmsIrProvider({
      credentials: CREDENTIALS,
      sender: '30004505000027',
      request: { fetch: mockFetch({ body }).fetch, retries: 0 },
    });

  it('parses a bulk send', async () => {
    const result = await provider(load('smsir', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.batchId, '2b99e63c-9bf8-4a21-9bfe-3f72dc1b46f1');
    assert.equal(result.cost, 1);
  });

  it('parses a delivery report', async () => {
    const status = await provider(load('smsir', 'delivery-report.json')).getStatus('89545112');
    assert.equal(status.status, 'delivered');
    assert.ok(status.deliveredAt instanceof Date);
  });

  it('parses a bare numeric balance', async () => {
    const balance = await provider(load('smsir', 'balance.json')).getBalance();
    assert.equal(balance.amount, 165.3);
  });

  it('parses the line list', async () => {
    const senders = await provider(load('smsir', 'lines.json')).listSenders();
    assert.equal(senders.length, 2);
  });

  it('parses the inbox', async () => {
    const page = await provider(load('smsir', 'inbox.json')).listInbox();
    assert.equal(page.items[0]!.text, 'سلام');
  });

  const errorCases: Array<[string, unknown]> = [
    ['auth-error.json', SMSAuthenticationError],
    ['insufficient-credit.json', SMSInsufficientCreditError],
    ['rate-limit.json', SMSRateLimitError],
  ];

  for (const [file, ErrorClass] of errorCases) {
    it(`raises ${(ErrorClass as { name: string }).name} from ${file}`, async () => {
      await assert.rejects(
        () => provider(load('smsir', file)).send({ to: '09121234567', message: 'x' }),
        ErrorClass as never,
      );
    });
  }
});

/* ------------------------------------------------------------------ Payamak Panel */

describe('fixtures › melipayamak', () => {
  const provider = (body: unknown) =>
    new MeliPayamakProvider({
      credentials: CREDENTIALS,
      sender: '5000',
      request: { fetch: mockFetch({ body }).fetch, retries: 0 },
    });

  it('reads a long Value as a record id', async () => {
    const result = await provider(load('melipayamak', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.messageId, '1234567890123456');
  });

  it('reads the live auth-failure envelope', async () => {
    await assert.rejects(
      () => provider(load('melipayamak', 'auth-error.json')).send({ to: '09121234567', message: 'x' }),
      SMSAuthenticationError,
    );
  });

  it('reads a short Value as a status code', async () => {
    await assert.rejects(
      () =>
        provider(load('melipayamak', 'insufficient-credit.json')).send({ to: '09121234567', message: 'x' }),
      SMSInsufficientCreditError,
    );
  });

  it('maps delivery code 8 to "sent"', async () => {
    const status = await provider(load('melipayamak', 'delivery-report.json')).getStatus('1');
    assert.equal(status.status, 'sent');
  });

  it('splits a batch delivery response in order', async () => {
    const statuses = await provider(load('melipayamak', 'delivery-report-batch.json')).getStatuses([
      'a',
      'b',
    ]);
    assert.equal(statuses[0]!.status, 'sent');
    assert.equal(statuses[1]!.status, 'delivered');
  });

  it('parses envelope B for sender lines', async () => {
    const senders = await provider(load('melipayamak', 'user-numbers.json')).listSenders();
    assert.equal(senders[0]!.number, '5000...');
  });

  it('parses envelope C for a multi send', async () => {
    const result = await provider(load('melipayamak', 'send-multiple.json')).sendPeerToPeer([
      { to: '09121234567', message: 'x' },
    ]);
    assert.equal(result.parts?.[0]?.messageId, '1234567890123456');
  });

  it('parses the inbox', async () => {
    const page = await provider(load('melipayamak', 'inbox.json')).listInbox();
    assert.equal(page.items[0]!.text, 'نمونه پیام دریافتی');
  });
});

/* ------------------------------------------------------------------ Mediana */

describe('fixtures › mediana', () => {
  const provider = (body: unknown, status = 200) =>
    new MedianaProvider({
      credentials: CREDENTIALS,
      sender: '+983000505',
      request: {
        fetch: mockFetch({ status, body }).fetch,
        baseUrl: 'https://rest.example.test/v1',
        retries: 0,
      },
    });

  it('parses a send response', async () => {
    const result = await provider(load('mediana', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.batchId, '12345');
  });

  it('parses a balance', async () => {
    const balance = await provider(load('mediana', 'balance.json')).getBalance();
    assert.equal(balance.amount, 250000);
  });

  it('parses per-recipient statuses with pagination', async () => {
    const page = await provider(load('mediana', 'delivery-report.json')).getRecipients('1');
    assert.equal(page.total, 1);
  });

  const errorCases: Array<[string, unknown]> = [
    ['auth-error.json', SMSAuthenticationError],
    ['insufficient-credit.json', SMSInsufficientCreditError],
    ['pattern-error.json', SMSPatternError],
  ];

  for (const [file, ErrorClass] of errorCases) {
    it(`raises ${(ErrorClass as { name: string }).name} from ${file}`, async () => {
      await assert.rejects(
        () => provider(load('mediana', file), 400).send({ to: '09121234567', message: 'x' }),
        ErrorClass as never,
      );
    });
  }
});

/* ------------------------------------------------------------------ FarazSMS */

describe('fixtures › farazsms', () => {
  const provider = (body: unknown, status = 200) =>
    new FarazSMSProvider({
      credentials: CREDENTIALS,
      sender: '50002178584000',
      request: { fetch: mockFetch({ status, body }).fetch, retries: 0 },
    });

  it('parses a send response', async () => {
    const result = await provider(load('farazsms', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.batchId, '456');
  });

  it('parses a balance in Toman plus a message count', async () => {
    const balance = await provider(load('farazsms', 'balance.json')).getBalance();
    assert.equal(balance.amount, 5000);
    assert.equal(balance.messageCount, 25);
    assert.equal(balance.currency, 'IRT');
  });

  it('parses the profile', async () => {
    const info = await provider(load('farazsms', 'profile.json')).getAccountInfo();
    assert.equal(info.displayName, 'فراز اس‌ام‌اس');
    assert.ok(info.expiresAt instanceof Date);
  });

  it('parses the inbox, including the provider misspelling of receivedAt', async () => {
    const page = await provider(load('farazsms', 'inbox.json')).listInbox();
    assert.equal(page.items[0]!.text, 'سلام');
    assert.ok(page.items[0]!.receivedAt instanceof Date);
  });

  it('maps blacklist to blocked in send-request items', async () => {
    const page = await provider(load('farazsms', 'delivery-report.json')).getSendRequestItems('1');
    assert.equal(page.items[1]!.status, 'blocked');
  });

  it('raises SMSAuthenticationError from the auth fixture', async () => {
    await assert.rejects(
      () => provider(load('farazsms', 'auth-error.json'), 401).getBalance(),
      SMSAuthenticationError,
    );
  });
});

/* ------------------------------------------------------------------ AmootSMS */

describe('fixtures › amoot', () => {
  const provider = (body: unknown) =>
    new AmootProvider({
      credentials: CREDENTIALS,
      sender: 'public',
      request: { fetch: mockFetch({ body }).fetch, retries: 0 },
    });

  it('parses a send response with per-recipient parts', async () => {
    const result = await provider(load('amoot', 'send-success.json')).send({
      to: ['09120000000', '09150000000'],
      message: 'x',
    });
    assert.equal(result.batchId, '12345678');
    assert.equal(result.cost, 1234);
    assert.equal(result.parts?.length, 2);
  });

  it('parses account status into balance and lines', async () => {
    const client = provider(load('amoot', 'account-status.json'));
    assert.equal((await client.getBalance()).amount, 987654);
  });

  it('parses a webhook registration', async () => {
    const hook = await provider(load('amoot', 'webhook-created.json')).createWebhook({
      url: 'https://hook.test',
      kind: 'delivery',
    });
    assert.equal(hook.id, '9999');
  });

  it('handles the numeric Status on the pattern-price response', async () => {
    const result = await provider(load('amoot', 'pattern-price.json')).native.calculatePatternMessagePrice({
      Mobile: '09120000000',
      PatternCodeID: 1,
      PatternValues: 'x',
    });
    assert.equal((result as { ReturnValue: number }).ReturnValue, 1500);
  });

  it('raises SMSAuthenticationError from Token_Invalid', async () => {
    await assert.rejects(
      () => provider(load('amoot', 'auth-error.json')).getBalance(),
      SMSAuthenticationError,
    );
  });

  it('keeps a .NET exception out of the message but preserves it in raw', async () => {
    await assert.rejects(
      () => provider(load('amoot', 'server-error.json')).send({ to: '09120000000', message: 'x' }),
      (error: unknown) => {
        const smsError = error as SMSError;
        assert.doesNotMatch(smsError.message, /PatternCodeID/);
        assert.match(JSON.stringify(smsError.raw), /PatternCodeID/);
        return true;
      },
    );
  });
});

/* ------------------------------------------------------------------ Mizban SMS */

describe('fixtures › mizbansms', () => {
  const provider = (body: unknown) =>
    new MizbanSmsProvider({
      credentials: CREDENTIALS,
      sender: '5000',
      request: { fetch: mockFetch({ body }).fetch, retries: 0 },
    });

  it('parses a send response', async () => {
    const result = await provider(load('mizbansms', 'send-success.json')).send({
      to: '09121234567',
      message: 'x',
    });
    assert.equal(result.messageId, 'abc-123');
  });

  it('parses a balance', async () => {
    const balance = await provider(load('mizbansms', 'balance.json')).getBalance();
    assert.equal(balance.amount, 45000);
  });

  it('parses sender lines', async () => {
    const senders = await provider(load('mizbansms', 'lines.json')).listSenders();
    assert.deepEqual(
      senders.map((s) => s.number),
      ['5000', '3000'],
    );
  });

  it('passes an unmapped delivery status through rather than guessing', async () => {
    const status = await provider(load('mizbansms', 'delivery-report.json')).getStatus('abc');
    assert.equal(status.status, 'unknown');
    assert.equal(status.nativeStatus, 'Delivered');
  });
});
