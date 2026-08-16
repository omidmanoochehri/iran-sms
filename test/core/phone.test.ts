import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectOperator,
  formatPhone,
  formatPhones,
  isIranianMobile,
  parsePhone,
  toAsciiDigits,
} from '../imports.ts';
import { SMSValidationError } from '../imports.ts';

describe('phone', () => {
  describe('parsePhone', () => {
    const equivalent = [
      '09121234567',
      '9121234567',
      '989121234567',
      '+989121234567',
      '00989121234567',
      '0912 123 4567',
      '0912-123-4567',
      '(0912) 123.4567',
    ];

    for (const input of equivalent) {
      it(`normalizes ${input} to the same significant number`, () => {
        const parsed = parsePhone(input);
        assert.equal(parsed.significant, '9121234567');
        assert.equal(parsed.countryCode, '98');
        assert.equal(parsed.isMobile, true);
        assert.equal(parsed.isIranian, true);
      });
    }

    it('converts Persian digits', () => {
      assert.equal(parsePhone('۰۹۱۲۱۲۳۴۵۶۷').significant, '9121234567');
    });

    it('converts Arabic-Indic digits', () => {
      assert.equal(parsePhone('٠٩١٢١٢٣٤٥٦٧').significant, '9121234567');
    });

    it('preserves the original input', () => {
      assert.equal(parsePhone(' +98 912 123 4567 ').input, ' +98 912 123 4567 ');
    });

    it('detects landlines as non-mobile', () => {
      const parsed = parsePhone('02112345678');
      assert.equal(parsed.isMobile, false);
      assert.equal(parsed.operator, undefined);
    });

    it('keeps a foreign E.164 number intact rather than guessing its country code', () => {
      const parsed = parsePhone('+14155552671');
      assert.equal(parsed.isIranian, false);
      assert.equal(parsed.significant, '14155552671');
      assert.equal(formatPhone(parsed, 'e164'), '+14155552671');
    });

    it('rejects empty input', () => {
      assert.throws(() => parsePhone(''), SMSValidationError);
    });

    it('rejects non-digit characters', () => {
      assert.throws(() => parsePhone('0912abc4567'), SMSValidationError);
    });

    it('rejects implausible lengths', () => {
      assert.throws(() => parsePhone('0912'), SMSValidationError);
      assert.throws(() => parsePhone('091212345678901'), SMSValidationError);
    });
  });

  describe('formatPhone', () => {
    const cases: Array<[Parameters<typeof formatPhone>[1], string]> = [
      ['national', '09121234567'],
      ['significant', '9121234567'],
      ['international', '989121234567'],
      ['e164', '+989121234567'],
      ['e164-00', '00989121234567'],
    ];

    for (const [format, expected] of cases) {
      it(`renders ${format}`, () => {
        assert.equal(formatPhone('09121234567', format), expected);
      });
    }

    it('names the offending index when a list entry is invalid', () => {
      assert.throws(
        () => formatPhones(['09121234567', 'nope'], 'e164'),
        (error: unknown) => {
          assert.ok(error instanceof SMSValidationError);
          assert.match(error.message, /index 1/);
          return true;
        },
      );
    });
  });

  describe('operator detection', () => {
    const cases: Array<[string, string]> = [
      ['09121234567', 'mci'],
      ['09351234567', 'irancell'],
      ['09201234567', 'rightel'],
      ['09321234567', 'taliya'],
      ['09981234567', 'shatel'],
    ];

    for (const [number, operator] of cases) {
      it(`maps ${number} to ${operator}`, () => {
        assert.equal(detectOperator(number), operator);
      });
    }

    it('returns unknown for an unallocated mobile prefix', () => {
      assert.equal(detectOperator('09701234567'), 'unknown');
    });

    it('returns undefined for invalid input rather than throwing', () => {
      assert.equal(detectOperator('nonsense'), undefined);
      assert.equal(isIranianMobile('nonsense'), false);
    });
  });

  it('toAsciiDigits leaves ASCII untouched', () => {
    assert.equal(toAsciiDigits('0912'), '0912');
  });
});
