/**
 * Payamak Panel platform constants.
 *
 * This is the platform behind MeliPayamak and its resellers (FaraPayamak, ShahvarPayam and
 * others). All of them speak to the same host with their own username/password — see
 * docs/provider-relations.md for the evidence.
 *
 * Source: https://docs.melipayamak.com/webservice-rest — verified 2026-08-16.
 */

import type { MessageStatus } from '../../core/types.js';

export const BASE_URL = 'https://rest.payamak-panel.com';
export const SOAP_BASE_URL = 'https://api.payamak-panel.com/post';

export const SEND_SCOPE = '/api/SendSMS';
export const SMART_SCOPE = '/api/SmartSMS';

/** Errors shared by every method — API access and IP restrictions. */
export const COMMON_ERRORS: Readonly<Record<string, string>> = {
  '-112': 'Web-service access is disabled for this account',
  '-111': 'The requesting IP is not allowed',
  '-110': 'You must use the ApiKey instead of the account password',
  '-109': 'An allowed IP must be configured before using the API',
  '-108': 'The IP is blocked after failed API attempts',
  '-100': 'Internal error or invalid parameter',
};

/** `Value` codes for SendSMS / SendOTP / SmartSMS.Send. */
export const SEND_ERRORS: Readonly<Record<string, string>> = {
  ...COMMON_ERRORS,
  '0': 'Username or password is incorrect',
  '2': 'Insufficient credit',
  '3': 'Daily send limit reached',
  '4': 'Send-volume limit not respected',
  '5': 'Invalid sender number',
  '6': 'Sending from this line is not allowed, or the system is updating',
  '7': 'The text contains a filtered word',
  '9': 'Sending from public lines is not possible via the web service',
  '10': 'User is not active',
  '11': 'Send failed',
  '12': 'User documents are incomplete',
  '14': 'The text contains a link',
  '15': 'The text does not end with «لغو 11»',
  '16': 'No recipient number was found',
  '17': 'Message text is empty',
  '18': 'Invalid mobile number',
  '19': 'Daily API send cap reached',
};

/** `Value` codes for SendSchedule. */
export const SCHEDULE_ERRORS: Readonly<Record<string, string>> = {
  ...COMMON_ERRORS,
  '-2': 'Invalid repeat period (0–4 allowed)',
  '-1': 'The chosen time is in the past',
  '0': 'Credentials are incorrect',
  '4': 'Too many recipients',
  '5': 'Invalid sender number',
  '6': 'Sending from this line is not allowed',
  '9': 'Sending from a public line is not possible',
  '15': 'The text does not end with «لغو 11»',
};

/** `Value` codes for BaseServiceNumber (template send). */
export const TEMPLATE_ERRORS: Readonly<Record<string, string>> = {
  ...COMMON_ERRORS,
  '-10': 'Links are not allowed inside template variables',
  '-6': 'An internal error occurred',
  '-5': 'The supplied text does not match the approved template variables',
  '-4': 'The bodyId is invalid or the template is not yet approved',
  '-3': 'The sender line is not defined in the system',
  '-2': 'Only one mobile number is allowed per call',
  '-1': 'Service web-service access is disabled',
  '0': 'Username or password is incorrect',
  '2': 'Insufficient credit',
  '6': 'The system is updating',
  '7': 'The text contains a filtered word',
  '10': 'User is not active',
  '11': 'Send failed',
  '12': 'User documents are incomplete',
  '18': 'Invalid mobile number',
  '19': 'Daily API cap reached',
  '-9': 'The chosen time is in the past',
  '-8': 'The send time is outside the permitted 07:00–22:00 window',
};

/** Delivery status codes returned by GetDeliveries / GetNewDeliveries. */
export const DELIVERY_STATUS: Readonly<Record<string, MessageStatus>> = {
  '0': 'sent', // sent to carrier
  '1': 'delivered',
  '2': 'undelivered',
  '3': 'failed', // carrier error
  '5': 'failed', // unknown error
  '8': 'sent', // received by carrier
  '16': 'failed', // not received by carrier
  '35': 'blocked', // blacklisted
  '100': 'unknown',
  '200': 'sent',
  '300': 'failed', // filtered
  '400': 'queued',
  '500': 'failed', // rejected by the operator
};

export const DELIVERY_ERRORS: Readonly<Record<string, string>> = {
  '-2': 'The requested id count exceeds the account limit, or the record was not found',
  '-3': 'Credentials are incorrect',
  '-10': 'Error retrieving the delivery report',
};

/** Maximum rows accepted by SendMultipleSMS. */
export const MAX_MULTIPLE_ROWS = 100;

/** Maximum items per GetMessages page. */
export const MAX_INBOX_COUNT = 100;

/**
 * A record id is documented as "more than 15 digits". Anything shorter in `Value` is a
 * status code, not an id — this threshold is what lets the adapter tell them apart.
 */
export const MIN_RECORD_ID_LENGTH = 10;
