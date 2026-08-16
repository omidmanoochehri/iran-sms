/**
 * IPPanel `rest/v1` platform constants.
 *
 * This is the generation used by Mediana and by several IPPanel-source resellers. It is a
 * different API from IPPanel's current Edge product — different base path, different auth
 * header, different envelope — so it is implemented separately rather than bolted onto the
 * Edge adapter.
 *
 * Source: the official Mediana Go SDK (github.com/medianasms/go-rest-sdk), which is the
 * only place this generation's error taxonomy is published in full. Verified 2026-08-16.
 * Research log: docs/providers/mediana.md
 */

import type { MessageStatus } from '../../core/types.js';

/** Auth scheme: `Authorization: AccessKey <key>`. */
export const AUTH_SCHEME = 'AccessKey';

/**
 * Business error codes. Verified against `errors.go` of the official SDK.
 * These are strings on the wire, not integers.
 */
export const ERROR_CODES: Readonly<Record<string, string>> = {
  '10001': 'Invalid credentials',
  '10002': 'Message body is empty',
  '10003': 'User is limited',
  '10004': 'The line is not assigned to you',
  '10005': 'Recipients list is empty',
  '10006': 'Insufficient credit',
  '10007': 'The line is not suitable for bulk sending',
  '10008': 'The line is temporarily deactivated',
  '10009': 'Maximum recipient count exceeded',
  '10010': 'Gateway is offline',
  '10011': 'No pricing is defined for this user',
  '10012': 'Ticket is invalid',
  '10013': 'Access denied',
  '10014': 'Pattern is invalid',
  '10015': 'Pattern parameters are invalid',
  '10016': 'Pattern is inactive',
  '10017': 'Pattern recipient is invalid',
  '10019': 'Sending is only permitted between 08:00 and 23:00',
  '10021': 'One or more of the user documents are not approved',
  '10022': 'Internal error',
  '10023': 'The provided number is not valid',
  '10024': 'Gateway is disabled',
  '422': 'Input validation failed',
  '1401': 'Unauthorized',
  '1402': 'API key is not valid',
  '1403': 'API key has been revoked',
};

export const AUTH_ERRORS = new Set(['10001', '10013', '1401', '1402', '1403']);
export const CREDIT_ERRORS = new Set(['10006']);
export const PATTERN_ERRORS = new Set(['10014', '10015', '10016', '10017']);
export const RECIPIENT_ERRORS = new Set(['10005', '10009', '10017', '10023']);
export const RETRYABLE_ERRORS = new Set(['10010', '10022', '10024']);

/**
 * Per-recipient delivery status.
 *
 * The official SDK types this field as a bare string and does not enumerate the values
 * (`// TODO: Add other message status codes`). Rather than invent a mapping, the adapter
 * passes the provider's own value through as `nativeStatus` and only maps what the SDK
 * does define.
 */
export const MESSAGE_STATUS: Readonly<Record<string, MessageStatus>> = {
  active: 'sent',
  pending: 'queued',
  delivered: 'delivered',
  undelivered: 'undelivered',
  failed: 'failed',
  blocked: 'blocked',
};

export const PATTERN_STATUS: Readonly<Record<string, 'active' | 'pending' | 'rejected'>> = {
  active: 'active',
  pending: 'pending',
  inactive: 'rejected',
};
