import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseProviderDate,
  SMSValidationError,
  TEHRAN_TIME_ZONE,
  toIsoUtc,
  toTehranDateTime,
  toUnixSeconds,
  toUtcDateTime,
} from '../imports.ts';

const sample = new Date('2026-08-04T11:50:00.000Z');

describe('datetime', () => {
  it('exposes the Iran timezone id', () => {
    assert.equal(TEHRAN_TIME_ZONE, 'Asia/Tehran');
  });

  describe('toUnixSeconds', () => {
    it('converts a Date to whole seconds', () => {
      assert.equal(toUnixSeconds(sample), Math.floor(sample.getTime() / 1000));
    });

    it('accepts an ISO string', () => {
      assert.equal(toUnixSeconds('2026-08-04T11:50:00Z'), Math.floor(sample.getTime() / 1000));
    });

    it('rejects an unparseable string', () => {
      assert.throws(() => toUnixSeconds('not-a-date'), SMSValidationError);
    });
  });

  describe('toUtcDateTime', () => {
    it('renders YYYY-MM-DD HH:mm:ss in UTC', () => {
      assert.equal(toUtcDateTime(sample), '2026-08-04 11:50:00');
    });

    it('passes a caller-supplied string through untouched', () => {
      assert.equal(toUtcDateTime('2026-08-04 15:20:00'), '2026-08-04 15:20:00');
    });
  });

  describe('toTehranDateTime', () => {
    it('renders Iran wall-clock time, not UTC', () => {
      // Iran is UTC+03:30 with no DST since 2022, so 11:50Z is 15:20 local.
      assert.equal(toTehranDateTime(sample), '2026-08-04 15:20:00');
    });

    it('rolls the date over correctly near midnight', () => {
      // 21:00Z on the 4th is 00:30 local on the 5th.
      assert.equal(toTehranDateTime(new Date('2026-08-04T21:00:00Z')), '2026-08-05 00:30:00');
    });

    it('passes a caller-supplied string through untouched', () => {
      assert.equal(toTehranDateTime('literal'), 'literal');
    });
  });

  it('toIsoUtc drops milliseconds', () => {
    assert.equal(toIsoUtc(sample), '2026-08-04T11:50:00Z');
  });

  describe('parseProviderDate', () => {
    it('reads Unix seconds', () => {
      assert.equal(
        parseProviderDate(1_754_308_200)?.toISOString(),
        new Date(1_754_308_200_000).toISOString(),
      );
    });

    it('reads Unix milliseconds', () => {
      assert.equal(parseProviderDate(1_754_308_200_000)?.getTime(), 1_754_308_200_000);
    });

    it('reads a numeric string', () => {
      assert.equal(parseProviderDate('1754308200')?.getTime(), 1_754_308_200_000);
    });

    it('treats a naive datetime as Iran local time', () => {
      // Providers that omit a timezone are Iran-local platforms.
      assert.equal(parseProviderDate('2026-08-04T15:20:00')?.toISOString(), '2026-08-04T11:50:00.000Z');
      assert.equal(parseProviderDate('2026-08-04 15:20:00')?.toISOString(), '2026-08-04T11:50:00.000Z');
    });

    it('honours an explicit zone when one is present', () => {
      assert.equal(parseProviderDate('2026-08-04T11:50:00Z')?.toISOString(), '2026-08-04T11:50:00.000Z');
    });

    it('returns null for the empty and zero sentinels providers use', () => {
      assert.equal(parseProviderDate(null), null);
      assert.equal(parseProviderDate(undefined), null);
      assert.equal(parseProviderDate(''), null);
      assert.equal(parseProviderDate('0'), null);
      assert.equal(parseProviderDate(0), null);
    });

    it('returns null for junk rather than an Invalid Date', () => {
      assert.equal(parseProviderDate('nonsense'), null);
      assert.equal(parseProviderDate({}), null);
    });
  });
});
