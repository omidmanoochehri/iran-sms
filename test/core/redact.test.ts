import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { maskSecret, redactHeaders, redactUrl, redactValue } from '../imports.ts';

describe('redaction', () => {
  describe('maskSecret', () => {
    it('fully masks short values — a partial reveal of 8 chars is not a redaction', () => {
      assert.equal(maskSecret('abcd1234'), '********');
      assert.doesNotMatch(maskSecret('abcd1234'), /abcd/);
    });

    it('keeps a short recognisable prefix on long values', () => {
      const masked = maskSecret('sk_abcdefghijklmnop');
      assert.ok(masked.startsWith('sk_a'));
      assert.doesNotMatch(masked, /efghijklmnop/);
    });

    it('masks non-strings', () => {
      assert.equal(maskSecret(undefined), '****');
      assert.equal(maskSecret(12345678), '****');
    });
  });

  describe('redactHeaders', () => {
    it('masks known secret headers and leaves others alone', () => {
      const redacted = redactHeaders({
        Authorization: 'Bearer supersecretvalue',
        'X-API-KEY': 'abcdefghijklmnop',
        'Api-Key': 'abcdefghijklmnop',
        'Content-Type': 'application/json',
        'User-Agent': 'iran-sms',
      });

      assert.doesNotMatch(redacted['Authorization']!, /supersecretvalue/);
      assert.doesNotMatch(redacted['X-API-KEY']!, /efghijklmnop/);
      assert.doesNotMatch(redacted['Api-Key']!, /efghijklmnop/);
      assert.equal(redacted['Content-Type'], 'application/json');
      assert.equal(redacted['User-Agent'], 'iran-sms');
    });

    it('handles a Headers instance', () => {
      const redacted = redactHeaders(new Headers({ authorization: 'secretsecretsecret' }));
      assert.doesNotMatch(redacted['authorization']!, /secretsecret/);
    });
  });

  describe('redactValue', () => {
    it('masks credential-shaped keys at any depth', () => {
      const out = redactValue({
        username: 'omid',
        password: 'hunter2hunter2',
        nested: { apiKey: 'abcdefghijklmnop', token: 'tokentokentoken' },
      }) as Record<string, unknown>;

      assert.equal(out['username'], 'omid');
      assert.doesNotMatch(String(out['password']), /hunter2hunter2/);
      const nested = out['nested'] as Record<string, unknown>;
      assert.doesNotMatch(String(nested['apiKey']), /efghijklmnop/);
      assert.doesNotMatch(String(nested['token']), /tokentoken/);
    });

    it('masks one-time codes, which are live credentials while valid', () => {
      const out = redactValue({ code: '123456', otp: '9999' }) as Record<string, unknown>;
      assert.doesNotMatch(String(out['code']), /123456/);
      assert.doesNotMatch(String(out['otp']), /9999/);
    });

    it('can be told to keep OTP values', () => {
      const out = redactValue({ code: '123456' }, { redactOtp: false }) as Record<string, unknown>;
      assert.equal(out['code'], '123456');
    });

    it('walks arrays', () => {
      const out = redactValue([{ password: 'longpasswordvalue' }]) as Array<Record<string, unknown>>;
      assert.doesNotMatch(String(out[0]!['password']), /longpassword/);
    });

    it('survives circular references', () => {
      const cyclic: Record<string, unknown> = { a: 1 };
      cyclic['self'] = cyclic;
      const out = redactValue(cyclic) as Record<string, unknown>;
      assert.equal(out['self'], '[Circular]');
    });

    it('leaves primitives untouched', () => {
      assert.equal(redactValue('plain'), 'plain');
      assert.equal(redactValue(42), 42);
      assert.equal(redactValue(null), null);
    });
  });

  describe('redactUrl', () => {
    it('masks secret query parameters', () => {
      const out = redactUrl('https://api.test/send?apikey=abcdefghijklmnop&to=0912');
      assert.doesNotMatch(out, /efghijklmnop/);
      assert.match(out, /to=0912/);
    });

    it('masks a secret embedded in the path — the Kavenegar case', () => {
      const key = '613472435563797A3767733D';
      const out = redactUrl(`https://api.kavenegar.com/v1/${key}/sms/send.json`, [key]);
      assert.doesNotMatch(out, new RegExp(key));
      assert.match(out, /\/sms\/send\.json/);
    });

    it('does not throw on a non-URL string', () => {
      assert.equal(typeof redactUrl('not a url', []), 'string');
    });

    it('ignores very short "secrets" that would mangle unrelated text', () => {
      const out = redactUrl('https://api.test/abc', ['abc']);
      assert.match(out, /abc/);
    });
  });
});
