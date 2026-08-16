/**
 * Mizban SMS contract tests.
 * Reference: https://services.mizbansms.com/swagger/v1/swagger.json
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MizbanSmsProvider, SMSError, SMSNetworkError, SMSValidationError } from '../imports.ts';
import { failingFetch, mockFetch } from '../helpers.ts';

function provider(fetchImpl: typeof globalThis.fetch) {
  return new MizbanSmsProvider({
    credentials: { username: 'user', password: 'pass-abcdefghij' },
    sender: '5000',
    request: { fetch: fetchImpl, retries: 0 },
  });
}

describe('Mizban SMS', () => {
  it('defaults to https, not the http host the spec declares', async () => {
    const mock = mockFetch({ body: { deliveryCode: '1' } });
    await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });
    assert.match(mock.last().url, /^https:\/\/services\.mizbansms\.com\//);
  });

  it('authenticates with username/password/usertype in the body', async () => {
    const mock = mockFetch({ body: { deliveryCode: '1' } });
    await provider(mock.fetch).send({ to: '09121234567', message: 'hi' });

    const body = mock.last().body as Record<string, unknown>;
    assert.equal(body['username'], 'user');
    assert.equal(body['password'], 'pass-abcdefghij');
    assert.equal(body['usertype'], 1);
  });

  it('produces the documented SendSMS payload', async () => {
    const mock = mockFetch({ body: { deliveryCode: 'abc' } });
    await provider(mock.fetch).send({ to: ['09121234567', '+989351234567'], message: 'hello' });

    assert.match(mock.last().url, /\/api\/Customer\/SendSMS$/);
    const body = mock.last().body as Record<string, unknown>;
    assert.deepEqual(body['to'], ['09121234567', '09351234567']);
    assert.equal(body['message'], 'hello');
    assert.equal(body['from'], '5000');
  });

  it('routes a scheduled send to SendSMSFuture with Iran local time', async () => {
    const mock = mockFetch({ body: { deliveryCode: 'abc' } });
    await provider(mock.fetch).send({
      to: '09121234567',
      message: 'x',
      scheduleAt: new Date('2027-08-04T11:50:00Z'),
    });

    assert.match(mock.last().url, /\/SendSMSFuture$/);
    assert.equal((mock.last().body as Record<string, string>)['sendDate'], '2027-08-04 15:20:00');
  });

  it('sends parallel arrays for peer-to-peer', async () => {
    const mock = mockFetch({ body: { deliveryCode: 'abc' } });
    await provider(mock.fetch).sendPeerToPeer([
      { to: '09121234567', message: 'one' },
      { to: '09351234567', message: 'two' },
    ]);

    assert.match(mock.last().url, /\/SendSMS2$/);
    const body = mock.last().body as Record<string, unknown>;
    assert.deepEqual(body['messages'], ['one', 'two']);
    assert.deepEqual(body['to'], ['09121234567', '09351234567']);
  });

  it('rejects an empty recipient list', async () => {
    const mock = mockFetch({ body: {} });
    await assert.rejects(() => provider(mock.fetch).send({ to: [], message: 'x' }), SMSValidationError);
    assert.equal(mock.calls.length, 0);
  });

  it('does not invent a delivery-status mapping the API never published', async () => {
    const mock = mockFetch({ body: { status: 'SomethingProviderSpecific' } });
    const status = await provider(mock.fetch).getStatus('code-1');

    assert.equal(status.status, 'unknown');
    assert.equal(status.nativeStatus, 'SomethingProviderSpecific');
  });

  it('sends delivery lookups without the shared auth wrapper', async () => {
    const mock = mockFetch({ body: {} });
    await provider(mock.fetch).getStatus('code-1');

    const body = mock.last().body as Record<string, unknown>;
    // This endpoint spells the field `userType`, unlike the send endpoints' `usertype`.
    assert.equal(body['userType'], 1);
    assert.equal(body['deliveryCode'], 'code-1');
    assert.equal(body['usertype'], undefined);
  });

  it('maps an HTTP failure to a typed error', async () => {
    const mock = mockFetch({ status: 500, body: { message: 'boom' } });
    await assert.rejects(
      () => provider(mock.fetch).getBalance(),
      (error: unknown) => {
        assert.ok(error instanceof SMSError);
        assert.equal(error.retryable, true);
        return true;
      },
    );
  });

  it('wraps transport failures', async () => {
    await assert.rejects(
      () => provider(failingFetch()).send({ to: '09121234567', message: 'x' }),
      SMSNetworkError,
    );
  });

  it('exposes an escape hatch to any documented path', async () => {
    const mock = mockFetch({ body: { ok: true } });
    await provider(mock.fetch).native.raw('/api/Report/ReportSendSms', { page: 1 }, true);
    assert.match(mock.last().url, /\/api\/Report\/ReportSendSms$/);
  });
});
