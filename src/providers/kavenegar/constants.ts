/**
 * Kavenegar constants.
 * Source: https://kavenegar.com/rest.html — verified 2026-08-16.
 * Research log: docs/providers/kavenegar.md
 */

import type { MessageStatus } from '../../core/types.js';

export const BASE_URL = 'https://api.kavenegar.com';

/** Table 2 — message status codes. */
export const MESSAGE_STATUS: Readonly<Record<string, MessageStatus>> = {
  '1': 'queued',
  '2': 'scheduled',
  '4': 'sent',
  '5': 'sent',
  '6': 'failed',
  '10': 'delivered',
  '11': 'undelivered',
  '13': 'cancelled',
  '14': 'blocked',
  '100': 'unknown',
};

/** Table 1 — API return codes, with the documented meaning of each. */
export const RETURN_CODES: Readonly<Record<number, string>> = {
  200: 'Request approved',
  400: 'Parameters are incomplete',
  401: 'Account is disabled',
  402: 'Operation failed',
  403: 'API key is not valid',
  404: 'Unknown method',
  405: 'Wrong GET/POST method',
  406: 'Required parameters were sent empty',
  407: 'Access to the requested data is not permitted (IP allowlist may be required)',
  409: 'Server unable to respond; try again later',
  411: 'Invalid recipient',
  412: 'Invalid sender',
  413: 'Message empty or longer than the maximum permitted length',
  414: 'Request volume exceeds the limit (200 per send, 500 per status check)',
  415: 'Start index is greater than the total record count',
  416: 'Source IP does not match the configured settings',
  417: 'Send date is invalid, in the past, or wrongly formatted',
  418: 'Insufficient credit',
  419: 'message / receptor / sender array lengths differ',
  420: 'Use of links in message text is restricted for this account',
  422: 'Data not processable due to an unsuitable character',
  424: 'Template not found',
  426: 'This method requires the advanced service',
  427: 'This line requires an access level to be created',
  428: 'Sending the code by voice call is not possible',
  429: 'IP restricted',
  431: 'Invalid code structure',
  432: 'The %token parameter was not found in the template text',
  451: 'Too many calls in the time window; IP restricted',
  501: 'Test messages can only be sent to the account owner',
  604: 'Too many numbers in a blacklist call (max 200)',
  607: 'Invalid tag name',
};

/**
 * Valid Verify Lookup token slots.
 *
 * The docs are explicit that only these five exist — an empty suffix plus 2, 3, 10 and 20.
 * Third-party guides that describe `token2`…`token20` as a contiguous range are wrong.
 */
export const TOKEN_SLOTS = ['token', 'token2', 'token3', 'token10', 'token20'] as const;

/** Maximum spaces permitted in each slot, per the docs. */
export const TOKEN_SPACE_LIMITS: Readonly<Record<string, number>> = {
  token: 0,
  token2: 0,
  token3: 0,
  token10: 5,
  token20: 8,
};

export const MAX_TOKEN_LENGTH = 100;
export const MAX_RECIPIENTS_PER_SEND = 200;
export const MAX_IDS_PER_STATUS_CALL = 500;
export const MAX_BLACKLIST_ADD = 200;
export const MAX_BLACKLIST_REMOVE = 50;
