import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isFailoverEligible,
  isSMSError,
  SMSAuthenticationError,
  SMSError,
  SMSInsufficientCreditError,
  SMSNetworkError,
  SMSPatternError,
  SMSRateLimitError,
  SMSRecipientError,
  SMSTimeoutError,
  SMSUnsupportedFeatureError,
  SMSValidationError,
} from '../imports.ts';

describe('errors', () => {
  it('sets name from the concrete class', () => {
    assert.equal(new SMSAuthenticationError('x').name, 'SMSAuthenticationError');
    assert.equal(new SMSPatternError('x').name, 'SMSPatternError');
  });

  it('preserves provider-native detail', () => {
    const error = new SMSPatternError('Pattern was rejected', {
      provider: 'mediana',
      code: '1072',
      raw: { detail: 'nope' },
    });

    assert.equal(error.provider, 'mediana');
    assert.equal(error.code, '1072');
    assert.deepEqual(error.raw, { detail: 'nope' });
    assert.equal(error.kind, 'pattern');
  });

  it('defaults retryable to false so sends are never replayed by accident', () => {
    assert.equal(new SMSError('x').retryable, false);
    assert.equal(new SMSValidationError('x').retryable, false);
  });

  it('marks transport failures retryable', () => {
    assert.equal(new SMSNetworkError('x').retryable, true);
    assert.equal(new SMSTimeoutError('x').retryable, true);
  });

  it('carries field-level detail on validation errors', () => {
    const error = new SMSValidationError('bad', { fields: { message: ['required'] } });
    assert.deepEqual(error.fields, { message: ['required'] });
    assert.deepEqual(error.toJSON()['fields'], { message: ['required'] });
  });

  it('serialises to JSON without losing the kind or code', () => {
    const json = new SMSRateLimitError('slow down', { provider: 'smsir', code: 20, retryAfter: 30 }).toJSON();
    assert.equal(json['kind'], 'rate_limit');
    assert.equal(json['code'], 20);
    assert.equal(json['retryAfter'], 30);
  });

  it('keeps the underlying cause', () => {
    const cause = new Error('socket hang up');
    const error = new SMSNetworkError('failed', { cause });
    assert.equal(error.cause, cause);
  });

  it('isSMSError narrows correctly', () => {
    assert.equal(isSMSError(new SMSError('x')), true);
    assert.equal(isSMSError(new Error('x')), false);
    assert.equal(isSMSError('x'), false);
  });

  describe('failover eligibility', () => {
    it('allows transport and throttling failures', () => {
      assert.equal(isFailoverEligible(new SMSNetworkError('x')), true);
      assert.equal(isFailoverEligible(new SMSTimeoutError('x')), true);
      assert.equal(isFailoverEligible(new SMSRateLimitError('x')), true);
      assert.equal(isFailoverEligible(new SMSError('x')), true);
    });

    it('refuses request-level failures, which another provider would also reject', () => {
      const refused = [
        new SMSAuthenticationError('x'),
        new SMSValidationError('x'),
        new SMSPatternError('x'),
        new SMSRecipientError('x'),
        new SMSUnsupportedFeatureError('x'),
        new SMSInsufficientCreditError('x'),
      ];
      for (const error of refused) {
        assert.equal(isFailoverEligible(error), false, `${error.name} must not fail over`);
      }
    });

    it('refuses non-SMS errors', () => {
      assert.equal(isFailoverEligible(new Error('x')), false);
    });
  });
});
