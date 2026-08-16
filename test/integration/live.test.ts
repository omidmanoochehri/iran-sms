/**
 * Live integration tests — skipped unless you opt in.
 *
 *   SMS_INTEGRATION_TESTS=true node --env-file=.env --test "test/integration/*.test.ts"
 *
 * These talk to real provider APIs with real credentials. Two rules shape everything below:
 *
 *  1. **Read-only by default.** Balance, sender lines, patterns, inbox. No billing, no SMS.
 *  2. **A send needs a second, separate opt-in.** Set `SMS_INTEGRATION_RECIPIENT` to a number
 *     you own. Without it the send tests skip, so a stray `SMS_INTEGRATION_TESTS=true` in CI
 *     cannot message anybody.
 *
 * Every provider is independent: a provider with no credentials in the environment is skipped,
 * not failed. Run one provider by exporting only its variables.
 *
 * Credentials come from the environment only. Never commit them — see `.env.example`.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, SMS, SMSError, SMSUnsupportedFeatureError } from '../imports.ts';

const ENABLED = process.env.SMS_INTEGRATION_TESTS === 'true';
const RECIPIENT = process.env.SMS_INTEGRATION_RECIPIENT;

/** Credential env var names, per provider, matching `.env.example`. */
const CREDENTIAL_ENV: Record<string, Record<string, string>> = {
  ippanel: { apiKey: 'IPPANEL_API_KEY' },
  kavenegar: { apiKey: 'KAVENEGAR_API_KEY' },
  smsir: { apiKey: 'SMSIR_API_KEY' },
  farazsms: { apiKey: 'FARAZSMS_API_KEY' },
  melipayamak: { username: 'MELIPAYAMAK_USERNAME', password: 'MELIPAYAMAK_PASSWORD' },
  farapayamak: { username: 'FARAPAYAMAK_USERNAME', password: 'FARAPAYAMAK_PASSWORD' },
  shahvarpayam: { username: 'SHAHVARPAYAM_USERNAME', password: 'SHAHVARPAYAM_PASSWORD' },
  amoot: { token: 'AMOOT_TOKEN' },
  mediana: { apiKey: 'MEDIANA_API_KEY' },
  mizbansms: { username: 'MIZBANSMS_USERNAME', password: 'MIZBANSMS_PASSWORD' },
};

function credentialsFor(id: string): Record<string, string> | null {
  const mapping = CREDENTIAL_ENV[id];
  if (!mapping) return null;

  const credentials: Record<string, string> = {};
  for (const [field, variable] of Object.entries(mapping)) {
    const value = process.env[variable];
    if (!value) return null; // one missing variable means "not configured"
    credentials[field] = value;
  }
  return credentials;
}

function baseUrlFor(id: string): string | undefined {
  return process.env[`${id.toUpperCase()}_BASE_URL`];
}

function clientFor(id: string): InstanceType<typeof SMS> | null {
  const credentials = credentialsFor(id);
  if (!credentials) return null;

  const entry = CATALOG.find((candidate) => candidate.id === id);
  const baseUrl = baseUrlFor(id);
  if (entry && !entry.defaultBaseUrl && !baseUrl) return null; // needs a panel host we do not have

  return new SMS({
    provider: id,
    credentials,
    sender: process.env[`${id.toUpperCase()}_SENDER`] ?? process.env.SMS_SENDER,
    request: { ...(baseUrl ? { baseUrl } : {}), timeout: 20_000 },
  });
}

/**
 * A capability the provider does not implement is a pass, not a failure — the suite asserts
 * that the *declared* capabilities work, and `SMSUnsupportedFeatureError` is a correct answer
 * for anything else.
 */
async function tolerateUnsupported<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SMSUnsupportedFeatureError) return null;
    throw error;
  }
}

describe('integration', { skip: ENABLED ? false : 'set SMS_INTEGRATION_TESTS=true to run' }, () => {
  const configured: string[] = [];

  before(() => {
    for (const id of Object.keys(CREDENTIAL_ENV)) {
      if (clientFor(id)) configured.push(id);
    }
    // Visible in the test output so a run that silently configured nothing is obvious.
    console.log(
      configured.length > 0
        ? `configured providers: ${configured.join(', ')}`
        : 'no provider credentials found in the environment — every provider will skip',
    );
  });

  for (const id of Object.keys(CREDENTIAL_ENV)) {
    describe(id, () => {
      const skip = clientFor(id) ? false : `no credentials for ${id} in the environment`;

      it('authenticates and reports a balance', { skip }, async () => {
        const sms = clientFor(id)!;
        const balance = await sms.account.getBalance();

        assert.equal(typeof balance.amount, 'number');
        assert.ok(Number.isFinite(balance.amount), 'balance must be a finite number');
        assert.ok(['IRR', 'IRT', 'messages', 'unknown', null].includes(balance.currency));
        assert.ok(balance.raw !== undefined, 'raw provider response must be preserved');
      });

      it('lists sender lines when it supports them', { skip }, async () => {
        const sms = clientFor(id)!;
        const senders = await tolerateUnsupported(() => sms.senders.list());
        if (senders === null) return;

        assert.ok(Array.isArray(senders));
        for (const sender of senders) assert.equal(typeof sender.number, 'string');
      });

      it('lists patterns when it supports them', { skip }, async () => {
        const sms = clientFor(id)!;
        const patterns = await tolerateUnsupported(() => sms.patterns.list());
        if (patterns === null) return;

        for (const pattern of patterns.items) assert.equal(typeof pattern.code, 'string');
      });

      it('reads the inbox when it supports one', { skip }, async () => {
        const sms = clientFor(id)!;
        const inbox = await tolerateUnsupported(() => sms.inbox.list({ pageSize: 5 }));
        if (inbox === null) return;

        assert.ok(Array.isArray(inbox.items));
        for (const message of inbox.items) {
          assert.equal(typeof message.text, 'string');
          assert.ok(message.receivedAt === undefined || message.receivedAt instanceof Date);
        }
      });

      it('rejects bad credentials with SMSAuthenticationError', { skip }, async () => {
        const entry = CATALOG.find((candidate) => candidate.id === id)!;
        const wrong = Object.fromEntries(
          entry.requiredCredentials.map((spec) => [spec.key, 'definitely-not-a-real-credential']),
        );
        const baseUrl = baseUrlFor(id);

        const sms = new SMS({
          provider: id,
          credentials: wrong,
          sender: process.env.SMS_SENDER ?? '10000',
          request: { ...(baseUrl ? { baseUrl } : {}), timeout: 20_000, retries: 0 },
        });

        await assert.rejects(
          () => sms.account.getBalance(),
          (error: unknown) => {
            assert.ok(error instanceof SMSError, `expected SMSError, got ${String(error)}`);
            // Some providers answer a bad key with a generic failure rather than a 401; both
            // are acceptable, an untyped crash is not.
            assert.ok(
              ['authentication', 'provider', 'validation'].includes(error.kind),
              `unexpected error kind "${error.kind}" for a bad credential`,
            );
            // The credential must not travel back inside the error.
            assert.doesNotMatch(error.message, /definitely-not-a-real-credential/);
            return true;
          },
        );
      });

      const sendSkip = skip || (RECIPIENT ? false : 'set SMS_INTEGRATION_RECIPIENT to send a real SMS');

      it('sends a real message', { skip: sendSkip }, async () => {
        const sms = clientFor(id)!;
        const result = await sms.messages.send({
          to: RECIPIENT!,
          message: `iran-sms integration test ${process.pid}`,
        });

        assert.ok(result.raw !== undefined, 'raw provider response must be preserved');
        assert.ok(
          ['queued', 'sent', 'delivered', 'unknown'].includes(result.status),
          `unexpected send status "${result.status}"`,
        );
        assert.ok(
          result.messageId !== null || result.batchId !== null,
          'a successful send must return an id of some kind',
        );
        console.log(`  ${id}: sent ${result.messageId ?? result.batchId} (${result.status})`);
      });
    });
  }
});
