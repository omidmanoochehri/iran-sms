/**
 * SMS.ir constants.
 * Sources: https://api.sms.ir/swagger/v1/swagger.json and https://sms.ir/rest-api/
 * Verified 2026-08-16. Research log: docs/providers/sms-ir.md
 */

import type { MessageStatus } from '../../core/types.js';

export const BASE_URL = 'https://api.sms.ir';

/** Application `status` codes returned in the response envelope. */
export const STATUS_CODES: Readonly<Record<number, string>> = {
  1: 'Operation succeeded',
  0: 'A system problem occurred; contact support',
  10: 'Invalid API key',
  11: 'API key is disabled',
  12: 'API key is restricted to allowlisted IPs',
  13: 'Account is inactive',
  14: 'Account is suspended',
  20: 'Request count exceeds the permitted limit',
  101: 'Invalid line number',
  102: 'Insufficient credit',
  103: 'Request contains empty text(s)',
  104: 'Request contains invalid mobile number(s)',
  105: 'More than the permitted 100 mobile numbers',
  106: 'More than the permitted 100 texts',
  107: 'Mobile list is empty',
  108: 'Text list is empty',
  109: 'Invalid send time',
  110: 'Mobile count and text count are not equal',
  111: 'No send found with this id',
  112: 'No record found to delete',
  113: 'Template not found',
  114: 'A parameter value exceeds the permitted 25 characters',
  115: 'Mobile number(s) are on the system blacklist',
  116: 'Parameter name cannot be empty',
  117: 'Message text is not approved',
  118: 'Message count exceeds the limit',
  119: 'Upgrade your plan to use a custom template',
  123: 'Sender line needs activation',
};

/** `deliveryState` values. */
export const DELIVERY_STATE: Readonly<Record<string, MessageStatus>> = {
  '1': 'delivered',
  '2': 'undelivered',
  '3': 'sent', // processing at the carrier
  '4': 'failed', // not delivered to the carrier
  '5': 'sent', // delivered to the carrier
  '6': 'failed',
  '7': 'blocked', // blacklisted
};

export const MAX_RECIPIENTS = 100;
export const MAX_TEXTS = 100;
export const MAX_PAGE_SIZE = 100;
export const MAX_PARAMETER_LENGTH = 25;

/** The single template available to Sandbox API keys. */
export const SANDBOX_TEMPLATE_ID = 123456;
