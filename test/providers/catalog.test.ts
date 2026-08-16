/**
 * Catalog integrity.
 *
 * Every provider is exercised here — loaded, constructed, and checked against the metadata
 * the catalog advertises. This is the test that would catch a provider being declared but
 * not actually shipped, or a capability being claimed that the adapter cannot honour.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, ProviderRegistry, SMS, type CapabilityName } from '../imports.ts';

/** Every capability that maps to a method on the unified API. */
const CAPABILITY_METHODS: Partial<Record<CapabilityName, string>> = {
  send: 'send',
  bulk: 'sendBulk',
  peerToPeer: 'sendPeerToPeer',
  pattern: 'sendPattern',
  cancelScheduled: 'cancelScheduled',
  deliveryReports: 'getStatus',
  outbox: 'listOutbox',
  inbox: 'listInbox',
  balance: 'getBalance',
  senders: 'listSenders',
  contacts: 'listContacts',
  blacklistRead: 'isBlacklisted',
  blacklistWrite: 'addToBlacklist',
  webhookManagement: 'createWebhook',
  voice: 'sendVoice',
  pricing: 'estimatePrice',
  patternManagement: 'listPatterns',
};

/**
 * Providers that publish **no** customer-facing template/pattern send endpoint.
 *
 * Pattern sending is supported for every provider whose API documents it. This set is the
 * explicit, reviewed exception list — adding to it should require reading the provider's
 * documentation and updating `docs/providers/<id>.md` to say why.
 */
const NO_PUBLISHED_PATTERN_API = new Set(['mizbansms']);

/** Credentials good enough to construct any provider in the catalog. */
const CREDENTIALS = {
  apiKey: 'test-key-abcdefghij',
  token: 'test-token-abcdefghij',
  username: 'test-user',
  password: 'test-pass-abcdefghij',
};

describe('provider catalog', () => {
  it('ships exactly the twenty documented providers', () => {
    assert.equal(CATALOG.length, 20);
    assert.equal(SMS.providers().length, 20);
  });

  it('has unique ids and no alias collisions', () => {
    const seen = new Map<string, string>();
    for (const entry of CATALOG) {
      for (const key of [entry.id, ...entry.aliases]) {
        const previous = seen.get(key);
        assert.equal(previous, undefined, `"${key}" is claimed by both ${previous} and ${entry.id}`);
        seen.set(key, entry.id);
      }
    }
  });

  it('gives every entry a documentation URL and at least one required credential', () => {
    for (const entry of CATALOG) {
      assert.match(entry.documentation, /^https?:\/\//, `${entry.id} has no documentation URL`);
      assert.ok(entry.requiredCredentials.length > 0, `${entry.id} declares no credentials`);
      assert.ok(entry.apiVersion.length > 0, `${entry.id} has no apiVersion`);
    }
  });

  it('never ships a default base URL for a provider whose platform is unverified', () => {
    for (const entry of CATALOG) {
      if (!entry.unverified) continue;
      assert.equal(
        entry.defaultBaseUrl,
        undefined,
        `${entry.id} is unverified, so it must not ship a default base URL`,
      );
    }
  });

  it('demands an explicit base URL from every provider without a known host', () => {
    for (const entry of CATALOG) {
      if (entry.defaultBaseUrl) continue;

      assert.throws(
        () => new SMS({ provider: entry.id, credentials: CREDENTIALS }),
        (error: unknown) => {
          assert.equal((error as { code?: unknown }).code, 'base_url_required');
          return true;
        },
        `${entry.id} has no default host, so constructing it without request.baseUrl must fail`,
      );

      assert.doesNotThrow(
        () =>
          new SMS({ provider: entry.id, credentials: CREDENTIALS, request: { baseUrl: 'https://x.test' } }),
        `${entry.id} must construct once a base URL is supplied`,
      );
    }
  });

  it('constructs providers that do have a published host without extra configuration', () => {
    for (const entry of CATALOG) {
      if (!entry.defaultBaseUrl) continue;
      assert.doesNotThrow(
        () => new SMS({ provider: entry.id, credentials: CREDENTIALS }),
        `${entry.id} publishes ${entry.defaultBaseUrl} and must construct without extra config`,
      );
    }
  });

  for (const entry of CATALOG) {
    describe(entry.id, () => {
      it('loads its adapter', async () => {
        const Ctor = await ProviderRegistry.load(entry.id);
        assert.equal(typeof Ctor, 'function');
      });

      it('constructs and reports matching metadata', async () => {
        const Ctor = await ProviderRegistry.load(entry.id);
        const instance = new Ctor({ credentials: CREDENTIALS, sender: '5000' });

        assert.equal(instance.meta.id, entry.id);
        assert.equal(instance.meta.apiVersion, entry.apiVersion);
        assert.equal(instance.meta.phoneFormat, entry.phoneFormat);
        assert.deepEqual(instance.meta.capabilities, entry.capabilities);
      });

      it('implements every capability it advertises', async () => {
        const Ctor = await ProviderRegistry.load(entry.id);
        const instance = new Ctor({ credentials: CREDENTIALS, sender: '5000' });
        const record = instance as unknown as Record<string, unknown>;

        for (const [capability, method] of Object.entries(CAPABILITY_METHODS)) {
          if (!entry.capabilities[capability as CapabilityName]) continue;
          assert.equal(
            typeof record[method!],
            'function',
            `${entry.id} declares "${capability}" but has no ${method}() — see docs/API-COVERAGE.md`,
          );
        }
      });

      it('supports pattern sending, unless the provider genuinely publishes none', async () => {
        const Ctor = await ProviderRegistry.load(entry.id);
        const instance = new Ctor({ credentials: CREDENTIALS, sender: '5000' });

        if (NO_PUBLISHED_PATTERN_API.has(entry.id)) {
          assert.equal(
            entry.capabilities.pattern,
            false,
            `${entry.id} is on the no-pattern-API list, so it must not claim the capability`,
          );
          return;
        }

        assert.equal(entry.capabilities.pattern, true, `${entry.id} must support pattern/template sending`);
        assert.equal(typeof (instance as unknown as Record<string, unknown>)['sendPattern'], 'function');
      });

      it('validates its credentials rather than failing at request time', async () => {
        const Ctor = await ProviderRegistry.load(entry.id);
        const instance = new Ctor({ credentials: {} });
        assert.throws(() => instance.validateCredentials(), /Missing credentials/);
      });

      it('is reachable through every one of its aliases', () => {
        for (const alias of [entry.id, ...entry.aliases]) {
          assert.equal(ProviderRegistry.require(alias).id, entry.id);
        }
      });

      it('exposes a native surface', async () => {
        const Ctor = await ProviderRegistry.load(entry.id);
        const instance = new Ctor({ credentials: CREDENTIALS, sender: '5000' });
        const record = instance as unknown as Record<string, unknown>;
        assert.equal(
          typeof record['native'],
          'object',
          `${entry.id} must expose provider-native methods under .native`,
        );
      });
    });
  }

  it('resolves identifiers case- and separator-insensitively', () => {
    assert.equal(ProviderRegistry.require('SMS.IR').id, 'smsir');
    assert.equal(ProviderRegistry.require('sms_ir').id, 'smsir');
    assert.equal(ProviderRegistry.require('  Kavenegar  ').id, 'kavenegar');
  });
});
