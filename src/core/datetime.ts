/**
 * Date/time handling for scheduled sends.
 *
 * Providers disagree, and several simply do not say. What each one is documented to expect
 * is recorded in its `docs/providers/*.md`; the assumptions this module encodes are:
 *
 * - IPPanel Edge documents `YYYY-MM-DD HH:mm:ss` in **UTC** — explicit, so we honour it.
 * - Kavenegar and SMS.ir use **Unix seconds**, which are unambiguous.
 * - MeliPayamak and AmootSMS document `yyyy-MM-dd HH:mm:ss` with **no timezone**. Both are
 *   Iran-local platforms, and MeliPayamak's own "07:00–22:00 window" error only makes sense
 *   in local time, so naive datetimes are interpreted as **Asia/Tehran**.
 *
 * A caller who passes a `string` gets it forwarded verbatim — if you already know the exact
 * literal your provider wants, this module gets out of the way.
 */

import { SMSValidationError } from './errors.js';

export const TEHRAN_TIME_ZONE = 'Asia/Tehran';

/** Coerce user input to a `Date`, or return the string unchanged for pass-through. */
export function coerceDate(value: Date | string | number): Date | string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new SMSValidationError('scheduleAt is an Invalid Date.', { code: 'invalid_schedule' });
    }
    return value;
  }
  throw new SMSValidationError('scheduleAt must be a Date, timestamp, or string.', {
    code: 'invalid_schedule',
  });
}

/** Unix timestamp in **seconds**. */
export function toUnixSeconds(value: Date | string | number): number {
  const coerced = coerceDate(value);
  const date = typeof coerced === 'string' ? new Date(coerced) : coerced;
  if (Number.isNaN(date.getTime())) {
    throw new SMSValidationError(`Could not parse scheduleAt: ${String(value)}`, {
      code: 'invalid_schedule',
    });
  }
  return Math.floor(date.getTime() / 1000);
}

/** `YYYY-MM-DD HH:mm:ss` in UTC. */
export function toUtcDateTime(value: Date | string | number, separator = ' '): string {
  const coerced = coerceDate(value);
  if (typeof coerced === 'string') return coerced;
  const iso = coerced.toISOString();
  return `${iso.slice(0, 10)}${separator}${iso.slice(11, 19)}`;
}

/** ISO-8601 with a `Z` suffix. */
export function toIsoUtc(value: Date | string | number): string {
  const coerced = coerceDate(value);
  if (typeof coerced === 'string') return coerced;
  return coerced.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const tehranFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * `YYYY-MM-DD HH:mm:ss` rendered as **Asia/Tehran wall-clock time**.
 *
 * Uses `Intl` rather than a fixed +03:30 offset — Iran abolished DST in 2022, but a
 * hard-coded offset would silently produce wrong times if that ever changes again, and
 * would already be wrong for historical dates.
 */
export function toTehranDateTime(value: Date | string | number, separator = ' '): string {
  const coerced = coerceDate(value);
  if (typeof coerced === 'string') return coerced;

  const parts = tehranFormatter.formatToParts(coerced);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  // `hour12: false` can yield "24" for midnight in some ICU versions.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}${separator}${hour}:${get('minute')}:${get('second')}`;
}

/** Parse a provider timestamp that may be Unix seconds, Unix ms, or an ISO-ish string. */
export function parseProviderDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '0') return null;
    if (/^\d{9,13}$/.test(trimmed)) return parseProviderDate(Number(trimmed));
    // `2026-08-04T15:20:00` with no zone: providers mean local Iran time.
    const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (naive) {
      const [, y, mo, d, h, mi, s] = naive;
      // Iran has had a fixed +03:30 offset since DST was abolished in 2022.
      const iso = `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}+03:30`;
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return null;
}

/** Reject a schedule that is already in the past — every provider errors on it anyway. */
export function assertFuture(value: Date | string | number, toleranceMs = 60_000): void {
  const coerced = coerceDate(value);
  if (typeof coerced === 'string') return; // caller-supplied literal: not ours to judge
  if (coerced.getTime() < Date.now() - toleranceMs) {
    throw new SMSValidationError(
      `scheduleAt is in the past (${coerced.toISOString()}). Providers reject past schedules.`,
      { code: 'schedule_in_past' },
    );
  }
}
