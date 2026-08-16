/** Builders for the normalized result shapes, so every adapter produces identical output. */

import type {
  BalanceResult,
  InboxMessage,
  MessageStatus,
  OutboxMessage,
  Page,
  PatternInfo,
  SendResult,
  SendResultPart,
  StatusResult,
} from './types.js';

export interface SendResultInput {
  provider: string;
  raw: unknown;
  success?: boolean;
  messageId?: string | number | null | undefined;
  batchId?: string | number | null | undefined;
  recipients: readonly string[];
  status?: MessageStatus;
  cost?: number | null | undefined;
  currency?: SendResult['currency'];
  parts?: SendResultPart[] | undefined;
}

const str = (value: string | number | null | undefined): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function makeSendResult(input: SendResultInput): SendResult {
  const result: SendResult = {
    success: input.success ?? true,
    provider: input.provider,
    messageId: str(input.messageId ?? null),
    batchId: str(input.batchId ?? null),
    recipients: [...input.recipients],
    status: input.status ?? 'queued',
    cost: num(input.cost),
    currency: input.currency ?? null,
    raw: input.raw,
  };
  if (input.parts) result.parts = input.parts;
  return result;
}

export function makeStatusResult(input: {
  provider: string;
  messageId: string | number;
  status: MessageStatus;
  nativeStatus?: string | number | null;
  recipient?: string | null;
  deliveredAt?: Date | null;
  raw: unknown;
}): StatusResult {
  return {
    provider: input.provider,
    messageId: String(input.messageId),
    status: input.status,
    nativeStatus: input.nativeStatus ?? null,
    recipient: input.recipient ?? null,
    deliveredAt: input.deliveredAt ?? null,
    raw: input.raw,
  };
}

export function makeBalanceResult(input: {
  provider: string;
  amount?: unknown;
  currency?: BalanceResult['currency'];
  messageCount?: unknown;
  raw: unknown;
}): BalanceResult {
  return {
    provider: input.provider,
    amount: num(input.amount),
    currency: input.currency ?? null,
    messageCount: num(input.messageCount),
    raw: input.raw,
  };
}

export function makePage<T>(input: {
  items: T[];
  page?: unknown;
  pageSize?: unknown;
  total?: unknown;
  raw: unknown;
}): Page<T> {
  return {
    items: input.items,
    page: num(input.page),
    pageSize: num(input.pageSize),
    total: num(input.total),
    raw: input.raw,
  };
}

export function makeInboxMessage(input: {
  provider: string;
  messageId?: string | number | null;
  from: string;
  to?: string | null;
  text: string;
  receivedAt?: Date | null;
  raw: unknown;
}): InboxMessage {
  return {
    provider: input.provider,
    messageId: str(input.messageId ?? null),
    from: input.from,
    to: input.to ?? null,
    text: input.text,
    receivedAt: input.receivedAt ?? null,
    raw: input.raw,
  };
}

export function makeOutboxMessage(input: {
  provider: string;
  messageId?: string | number | null;
  batchId?: string | number | null;
  to?: string | null;
  from?: string | null;
  text?: string | null;
  status?: MessageStatus;
  cost?: unknown;
  sentAt?: Date | null;
  raw: unknown;
}): OutboxMessage {
  return {
    provider: input.provider,
    messageId: str(input.messageId ?? null),
    batchId: str(input.batchId ?? null),
    to: input.to ?? null,
    from: input.from ?? null,
    text: input.text ?? null,
    status: input.status ?? 'unknown',
    cost: num(input.cost),
    sentAt: input.sentAt ?? null,
    raw: input.raw,
  };
}

export function makePatternInfo(input: {
  provider: string;
  code: string | number;
  title?: string | null;
  body?: string | null;
  status?: PatternInfo['status'];
  variables?: string[];
  raw: unknown;
}): PatternInfo {
  return {
    provider: input.provider,
    code: String(input.code),
    title: input.title ?? null,
    body: input.body ?? null,
    status: input.status ?? 'unknown',
    variables: input.variables ?? [],
    raw: input.raw,
  };
}

/** Build a status mapper from a provider's own status table. */
export function statusMapper<K extends string | number>(
  table: Readonly<Record<K, MessageStatus>>,
  fallback: MessageStatus = 'unknown',
): (value: unknown) => MessageStatus {
  return (value: unknown): MessageStatus => {
    if (value === null || value === undefined) return fallback;
    const key = String(value) as K;
    return (table as Record<string, MessageStatus>)[key] ?? fallback;
  };
}
