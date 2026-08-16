/**
 * FarazSMS / IranPayamak constants.
 * Source: https://docs.farazsms.com/download/openapi.json — verified 2026-08-16.
 * Research log: docs/providers/farazsms.md
 */

import type { MessageStatus } from '../../core/types.js';

export const BASE_URL = 'https://api.iranpayamak.com';

/** Default sender line published in the provider's own `llms.txt`. */
export const DEFAULT_LINE_NUMBER = '90008361';

/**
 * Per-recipient delivery statuses (`send_request/{id}/items?status=`).
 *
 * The spec's description string is truncated at `bla`; `blacklist` is the evident value but
 * is treated as a pass-through string rather than a validated enum.
 */
export const DELIVERY_STATUS: Readonly<Record<string, MessageStatus>> = {
  'not-started': 'queued',
  'in-queue': 'queued',
  sent: 'sent',
  'send-failure': 'failed',
  delivered: 'delivered',
  'delivery-failure': 'undelivered',
  'delivery-undetermined': 'unknown',
  'system-error': 'failed',
  blacklist: 'blocked',
};

/** Send-request level statuses (`send_request?status=`). */
export const SEND_REQUEST_STATUS: Readonly<Record<string, MessageStatus>> = {
  init: 'queued',
  'pending-approval': 'queued',
  'insufficient-balance': 'failed',
  cancelled: 'cancelled',
  rejected: 'failed',
  'in-queue': 'queued',
  sent: 'sent',
};

/** Ticket statuses. */
export const TICKET_STATUS = ['pending', 'referred', 'closed', 'asked', 'answered'] as const;

/** Pattern categories accepted by `POST /ws/v1/patterns`. */
export const PATTERN_CATEGORY = { otp: 1, club: 2, order: 3, other: 255 } as const;

/** Max contacts per `bulk-upsert` call. */
export const MAX_BULK_CONTACTS = 500;
