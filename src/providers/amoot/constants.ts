/**
 * AmootSMS constants.
 * Sources: https://hub.amootsoft.com/Payamak/docs/* and https://portal.amootsms.com/rest
 * Verified 2026-08-16. Research log: docs/providers/amoot.md
 */

export const BASE_URL = 'https://portal.amootsms.com/rest';

/** AmootSMS's literal "send immediately" value for `SendDateTime`. */
export const SEND_NOW = '0';

/**
 * Status strings observed against the live API and in the official documentation examples.
 *
 * AmootSMS does **not** publish an exhaustive status table, so this map is explicitly
 * partial. The adapter treats any non-`Success` status as an error and forwards the raw
 * string as `error.code` rather than inventing a meaning for values it has not seen.
 */
export const KNOWN_STATUS: Readonly<Record<string, string>> = {
  Success: 'Operation succeeded',
  Token_Invalid: 'The token is missing or not valid',
  LineNumber_Empty: 'LineNumber was not supplied',
  ServerError: 'Server-side failure; see ErrorMessage in the raw response',
};

/** `OrderType` values for number-bank sends. */
export const ORDER_TYPE = { sequential: 'Sequential', random: 'Random' } as const;

/** Operator vocabulary used by the LBS/BTS campaign methods. */
export const OPERATOR_TYPES = ['TCI', 'Irancell', 'RighTel'] as const;

/** Gender vocabulary used by the LBS/BTS campaign methods. */
export const GENDERS = ['All', 'Male', 'Female'] as const;

/** OTP code length bounds documented for `SendQuickOTP`. */
export const MIN_OTP_LENGTH = 4;
export const MAX_OTP_LENGTH = 8;
