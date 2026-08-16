import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderRegistry, SMS, SMSConfigurationError, SMSUnsupportedFeatureError } from '../imports.ts';
import { mockFetch } from '../helpers.ts';

const kavenegarConfig = {
  provider: 'kavenegar',
  credentials: { apiKey: 'test-key-abcdefghij' },
  sender: '10004346',
};

describe('SMS', () => {
  describe('construction', () => {
    it('rejects a missing config object', () => {
      // @ts-expect-error deliberately invalid
      assert.throws(() => new SMS(), SMSConfigurationError);
    });

    it('rejects a missing provider and lists the valid ones', () => {
      assert.throws(
        // @ts-expect-error deliberately invalid
        () => new SMS({}),
        (error: unknown) => {
          assert.ok(error instanceof SMSConfigurationError);
          assert.match(error.message, /kavenegar/);
          return true;
        },
      );
    });

    it('rejects an unknown provider', () => {
      assert.throws(
        () => new SMS({ provider: 'not-a-provider', credentials: {} }),
        (error: unknown) => {
          assert.ok(error instanceof SMSConfigurationError);
          assert.equal(error.code, 'unknown_provider');
          return true;
        },
      );
    });

    it('validates credentials up front, before any network call', () => {
      assert.throws(
        () => new SMS({ provider: 'ippanel', credentials: {} }),
        (error: unknown) => {
          assert.ok(error instanceof SMSConfigurationError);
          assert.equal(error.code, 'missing_credentials');
          assert.match(error.message, /IPPANEL_API_KEY/);
          return true;
        },
      );
    });

    it('accepts either key when credentials declare alternatives', () => {
      assert.doesNotThrow(() => new SMS({ provider: 'ippanel', credentials: { token: 'x' } }));
      assert.doesNotThrow(() => new SMS({ provider: 'ippanel', credentials: { apiKey: 'x' } }));
    });

    it('resolves aliases', () => {
      assert.equal(new SMS({ provider: 'sms.ir', credentials: { apiKey: 'x' } }).providerId, 'smsir');
      assert.equal(new SMS({ provider: 'IranPayamak', credentials: { apiKey: 'x' } }).providerId, 'farazsms');
      assert.equal(new SMS({ provider: 'Kave', credentials: { apiKey: 'x' } }).providerId, 'kavenegar');
    });

    it('requires an explicit base URL for providers whose platform is unverified', () => {
      assert.throws(
        () => new SMS({ provider: 'takiran', credentials: { username: 'u', password: 'p' } }),
        (error: unknown) => {
          assert.ok(error instanceof SMSConfigurationError);
          assert.equal(error.code, 'base_url_required');
          assert.match(error.message, /will not guess/);
          return true;
        },
      );
    });

    it('accepts an unverified provider once a base URL is supplied', () => {
      assert.doesNotThrow(
        () =>
          new SMS({
            provider: 'takiran',
            credentials: { username: 'u', password: 'p' },
            request: { baseUrl: 'https://sms.example.test' },
          }),
      );
    });
  });

  describe('introspection', () => {
    it('exposes capabilities synchronously, without loading the adapter', () => {
      const sms = new SMS(kavenegarConfig);
      assert.equal(sms.capabilities.pattern, true);
      assert.equal(sms.capabilities.blacklistWrite, true);
      assert.equal(sms.capabilities.contacts, false);
    });

    it('supports() matches the capability map', () => {
      const sms = new SMS(kavenegarConfig);
      assert.equal(sms.supports('voice'), true);
      assert.equal(sms.supports('contacts'), false);
    });

    it('reports provider metadata including platform lineage', () => {
      const taban = new SMS({
        provider: 'tabansms',
        credentials: { apiKey: 'x' },
        request: { baseUrl: 'https://x.test/v1' },
      });
      assert.equal(taban.providerInfo.platform, 'ippanel-rest-v1');
      assert.equal(taban.providerInfo.id, 'tabansms');
    });

    it('exposes the package version', () => {
      assert.match(SMS.version, /^\d+\.\d+\.\d+$/);
    });

    it('lists all twenty providers', () => {
      assert.equal(SMS.providers().length, 20);
      assert.equal(SMS.hasProvider('kavenegar'), true);
      assert.equal(SMS.hasProvider('nope'), false);
    });
  });

  describe('capability gating', () => {
    it('raises a typed error naming the capability, not a TypeError', async () => {
      const sms = new SMS(kavenegarConfig);
      await assert.rejects(
        () => sms.contacts.list(),
        (error: unknown) => {
          assert.ok(error instanceof SMSUnsupportedFeatureError);
          assert.equal(error.feature, 'contacts');
          assert.match(error.message, /sms\.supports\('contacts'\)/);
          return true;
        },
      );
    });

    it('rejects an unknown native method rather than failing silently', async () => {
      const sms = new SMS(kavenegarConfig);
      await assert.rejects(
        () => sms.provider['noSuchMethod']!(),
        (error: unknown) => {
          assert.ok(error instanceof SMSUnsupportedFeatureError);
          assert.equal(error.code, 'unknown_native_method');
          return true;
        },
      );
    });
  });

  describe('lazy loading', () => {
    it('loads the adapter only on first use and memoises it', async () => {
      const sms = new SMS(kavenegarConfig);
      const first = await sms.ready();
      const second = await sms.ready();
      assert.equal(first, second);
      assert.equal(first.id, 'kavenegar');
    });

    it('resolves concurrent ready() calls to the same instance', async () => {
      const sms = new SMS(kavenegarConfig);
      const [a, b] = await Promise.all([sms.ready(), sms.ready()]);
      assert.equal(a, b);
    });
  });

  describe('native access', () => {
    it('forwards to the provider through sms.provider', async () => {
      const mock = mockFetch({
        body: { return: { status: 200, message: 'ok' }, entries: { remaincredit: 5000 } },
      });
      const sms = new SMS({ ...kavenegarConfig, request: { fetch: mock.fetch } });

      const result = await sms.provider['getBalance']!();
      assert.equal((result as { amount: number }).amount, 5000);
    });

    it('sms.raw is an alias for sms.provider', async () => {
      const mock = mockFetch({ body: { return: { status: 200 }, entries: { remaincredit: 1 } } });
      const sms = new SMS({ ...kavenegarConfig, request: { fetch: mock.fetch } });
      assert.ok(await sms.raw['getBalance']!());
    });
  });

  describe('events', () => {
    it('emits request, response and sent', async () => {
      const mock = mockFetch({
        body: { return: { status: 200 }, entries: [{ messageid: 1, status: 5, receptor: '09121234567' }] },
      });
      const sms = new SMS({ ...kavenegarConfig, request: { fetch: mock.fetch } });

      const events: string[] = [];
      sms.on('request', () => events.push('request'));
      sms.on('response', () => events.push('response'));
      sms.on('sent', () => events.push('sent'));

      await sms.send({ to: '09121234567', message: 'hi' });
      assert.deepEqual(events, ['request', 'response', 'sent']);
    });

    it('never lets a broken listener fail the send', async () => {
      const mock = mockFetch({
        body: { return: { status: 200 }, entries: [{ messageid: 1, status: 5 }] },
      });
      const sms = new SMS({ ...kavenegarConfig, request: { fetch: mock.fetch } });
      sms.on('sent', () => {
        throw new Error('listener exploded');
      });

      const result = await sms.send({ to: '09121234567', message: 'hi' });
      assert.equal(result.success, true);
    });

    it('does not leak credentials into event payloads', async () => {
      const mock = mockFetch({ body: { return: { status: 200 }, entries: [{ messageid: 1 }] } });
      const sms = new SMS({ ...kavenegarConfig, request: { fetch: mock.fetch } });

      let seenUrl = '';
      sms.on('request', (info) => {
        seenUrl = info.url;
      });
      await sms.send({ to: '09121234567', message: 'hi' });

      assert.doesNotMatch(seenUrl, /test-key-abcdefghij/);
    });
  });

  describe('custom providers', () => {
    it('can be registered and used', async () => {
      class Stub {
        readonly meta = { id: 'stub' };
        get id() {
          return 'stub';
        }
        validateCredentials() {}
        async getBalance() {
          return { provider: 'stub', amount: 1, currency: null, messageCount: null, raw: {} };
        }
      }

      ProviderRegistry.register('kavenegar-stub', Stub as never);
      try {
        const loaded = await ProviderRegistry.load('kavenegar-stub');
        assert.equal(loaded, Stub as never);
      } finally {
        ProviderRegistry.unregister('kavenegar-stub');
      }
      assert.equal(ProviderRegistry.has('kavenegar-stub'), false);
    });
  });
});
