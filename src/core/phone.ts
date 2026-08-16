/**
 * Iranian phone-number parsing and formatting.
 *
 * Providers in this package disagree about the wire format — IPPanel wants E.164
 * (`+989121234567`), FarazSMS wants the national form (`09121234567`), SMS.ir wants the
 * bare significant number (`9121234567`). Rather than pick a winner, this module parses
 * once into a canonical shape and lets each adapter render the form it needs.
 */

import { SMSValidationError } from './errors.js';

/** The formats an adapter can ask for. */
export type PhoneFormat =
  /** `09121234567` — national, leading zero. */
  | 'national'
  /** `9121234567` — national significant number, no leading zero. */
  | 'significant'
  /** `989121234567` — country code, no plus. */
  | 'international'
  /** `+989121234567` — E.164. */
  | 'e164'
  /** `00989121234567` — international access prefix. */
  | 'e164-00';

export interface ParsedPhone {
  /** National significant number, e.g. `9121234567` (mobile) or `2112345678` (landline). */
  significant: string;
  /** Country calling code without `+`. `98` for Iranian numbers. */
  countryCode: string;
  /** True when the number is an Iranian mobile number (`9xxxxxxxxx`). */
  isMobile: boolean;
  /** True when the number belongs to Iran. */
  isIranian: boolean;
  /** Mobile operator prefix (`912`, `935`, …) when it can be determined. */
  operatorPrefix: string | undefined;
  /** Detected operator name, when the prefix is a known allocation. */
  operator: IranOperator | undefined;
  /** The input exactly as supplied. */
  input: string;
}

export type IranOperator =
  'mci' | 'irancell' | 'rightel' | 'taliya' | 'shatel' | 'samantel' | 'aptel' | 'unknown';

/**
 * Iranian mobile prefix → operator.
 *
 * Prefix allocations do change and numbers port between operators, so this is a best-effort
 * hint for routing and cost estimation, never a guarantee. Nothing in this package makes a
 * delivery decision based on it.
 */
const OPERATOR_PREFIXES: Readonly<Record<string, IranOperator>> = {
  // MCI (همراه اول)
  '910': 'mci',
  '911': 'mci',
  '912': 'mci',
  '913': 'mci',
  '914': 'mci',
  '915': 'mci',
  '916': 'mci',
  '917': 'mci',
  '918': 'mci',
  '919': 'mci',
  '990': 'mci',
  '991': 'mci',
  '992': 'mci',
  '993': 'mci',
  '994': 'mci',
  '995': 'mci',
  '996': 'mci',
  // Irancell (ایرانسل)
  '930': 'irancell',
  '933': 'irancell',
  '935': 'irancell',
  '936': 'irancell',
  '937': 'irancell',
  '938': 'irancell',
  '939': 'irancell',
  '901': 'irancell',
  '902': 'irancell',
  '903': 'irancell',
  '904': 'irancell',
  '905': 'irancell',
  '941': 'irancell',
  // RighTel (رایتل)
  '920': 'rightel',
  '921': 'rightel',
  '922': 'rightel',
  '923': 'rightel',
  // Taliya (تالیا)
  '932': 'taliya',
  // Shatel Mobile
  '998': 'shatel',
  // SamanTel
  '999': 'samantel',
  // ApTel
  '9999': 'aptel',
};

/** Convert Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return String(code - 0x0660);
  });
}

/**
 * Parse a phone number into its canonical parts.
 *
 * Accepts `09121234567`, `9121234567`, `989121234567`, `+989121234567`, `00989121234567`,
 * Persian/Arabic digits, and separators (spaces, dashes, parentheses, dots).
 * Non-Iranian E.164 numbers are accepted and passed through — see {@link parsePhone} notes.
 */
export function parsePhone(input: string): ParsedPhone {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new SMSValidationError('Phone number must be a non-empty string.', {
      code: 'invalid_phone',
      raw: input,
    });
  }

  const original = input;
  let s = toAsciiDigits(input).trim();
  const hadPlus = s.startsWith('+');
  s = s.replace(/[\s()\-.]/g, '');
  if (hadPlus) s = s.slice(1);

  if (!/^\d+$/.test(s)) {
    throw new SMSValidationError(`Phone number contains non-digit characters: ${original}`, {
      code: 'invalid_phone',
      raw: original,
    });
  }

  // Strip international access prefix.
  if (s.startsWith('00')) s = s.slice(2);

  let countryCode = '98';
  let significant: string;
  let isIranian = true;

  if (s.startsWith('98') && s.length >= 12) {
    significant = s.slice(2);
  } else if (s.startsWith('0')) {
    significant = s.replace(/^0+/, '');
  } else if (hadPlus && !s.startsWith('98')) {
    // An explicit `+` with a non-98 country code is a foreign number. Keep it whole:
    // guessing where the country code ends would corrupt it.
    isIranian = false;
    countryCode = '';
    significant = s;
  } else {
    significant = s;
  }

  if (isIranian) {
    if (significant.length < 8 || significant.length > 11) {
      throw new SMSValidationError(
        `Phone number has an implausible length for Iran (${significant.length} significant digits): ${original}`,
        { code: 'invalid_phone', raw: original },
      );
    }
  }

  const isMobile = isIranian && /^9\d{9}$/.test(significant);
  const operatorPrefix = isMobile ? significant.slice(0, 3) : undefined;
  const operator = operatorPrefix ? (OPERATOR_PREFIXES[operatorPrefix] ?? 'unknown') : undefined;

  return { significant, countryCode, isMobile, isIranian, operatorPrefix, operator, input: original };
}

/** Render a parsed or raw number in the requested wire format. */
export function formatPhone(input: string | ParsedPhone, format: PhoneFormat): string {
  const parsed = typeof input === 'string' ? parsePhone(input) : input;

  if (!parsed.isIranian) {
    // Foreign numbers only have one sensible rendering; the national forms are meaningless.
    switch (format) {
      case 'e164':
        return `+${parsed.significant}`;
      case 'e164-00':
        return `00${parsed.significant}`;
      default:
        return parsed.significant;
    }
  }

  const { countryCode, significant } = parsed;
  switch (format) {
    case 'national':
      return `0${significant}`;
    case 'significant':
      return significant;
    case 'international':
      return `${countryCode}${significant}`;
    case 'e164':
      return `+${countryCode}${significant}`;
    case 'e164-00':
      return `00${countryCode}${significant}`;
    default: {
      const exhaustive: never = format;
      throw new SMSValidationError(`Unknown phone format: ${String(exhaustive)}`, { code: 'invalid_format' });
    }
  }
}

/** Format a list, preserving order. Throws on the first invalid entry, naming its index. */
export function formatPhones(inputs: readonly string[], format: PhoneFormat): string[] {
  return inputs.map((value, index) => {
    try {
      return formatPhone(value, format);
    } catch (error) {
      if (error instanceof SMSValidationError) {
        throw new SMSValidationError(`${error.message} (recipient at index ${index})`, {
          code: error.code,
          raw: error.raw,
          cause: error,
        });
      }
      throw error;
    }
  });
}

/** True when the value parses as an Iranian mobile number. */
export function isIranianMobile(input: string): boolean {
  try {
    return parsePhone(input).isMobile;
  } catch {
    return false;
  }
}

/** Detect the operator for an Iranian mobile number, or `undefined` if not determinable. */
export function detectOperator(input: string): IranOperator | undefined {
  try {
    return parsePhone(input).operator;
  } catch {
    return undefined;
  }
}
