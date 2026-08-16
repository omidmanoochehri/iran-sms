/**
 * Minimal typed event bus.
 *
 * Deliberately not Node's `EventEmitter`: this keeps the package usable in Workers and
 * other non-Node runtimes, and it lets listener errors be swallowed rather than taking
 * down a send. Payloads are always pre-redacted by the caller.
 */

import type { HttpRequestInfo, HttpResponseInfo } from './http.js';
import type { SendResult } from './types.js';

export interface EventMap {
  request: HttpRequestInfo;
  response: HttpResponseInfo;
  error: { provider: string | undefined; error: unknown };
  sent: { provider: string; result: SendResult };
  /** Emitted by `Multi` when it moves on to the next provider. */
  failover: { from: string; to: string; reason: string };
}

export type EventName = keyof EventMap;
export type Listener<E extends EventName> = (payload: EventMap[E]) => void;

export class EventBus {
  private readonly listeners = new Map<EventName, Set<Listener<EventName>>>();

  on<E extends EventName>(event: E, listener: Listener<E>): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as Listener<EventName>);
    this.listeners.set(event, set);
    return this;
  }

  once<E extends EventName>(event: E, listener: Listener<E>): this {
    const wrapper = ((payload: EventMap[E]) => {
      this.off(event, wrapper as Listener<E>);
      listener(payload);
    }) as Listener<E>;
    return this.on(event, wrapper);
  }

  off<E extends EventName>(event: E, listener: Listener<E>): this {
    this.listeners.get(event)?.delete(listener as Listener<EventName>);
    return this;
  }

  removeAllListeners(event?: EventName): this {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }

  listenerCount(event: EventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    const set = this.listeners.get(event);
    if (!set?.size) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<E>)(payload);
      } catch {
        // A broken listener must never fail the SMS it was observing.
      }
    }
  }
}
