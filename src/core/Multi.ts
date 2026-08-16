/**
 * Multi-provider orchestration: named instances, routing, and failover.
 *
 * ## The duplicate-SMS problem
 *
 * Failover on a *send* is not free. If provider A times out, you do not know whether it
 * accepted the message — a timeout is the absence of an answer, not a "no". Retrying on
 * provider B can therefore deliver the same SMS twice, which costs the account twice and
 * looks broken to the recipient.
 *
 * So this class draws a line:
 *
 * - **Safe to fail over**: the provider gave a definite refusal it will keep giving —
 *   `rate_limit`, or an unambiguous server error (`provider_unavailable`). Nothing was
 *   accepted, so nothing can be duplicated.
 * - **Not safe by default**: `network_error` and `timeout`. Enabling these is a deliberate
 *   choice that trades a small duplicate risk for higher delivery odds, so they must be
 *   named explicitly in `failover.on`.
 * - **Never**: anything wrong with the request itself — bad credentials, invalid recipient,
 *   unapproved pattern, insufficient credit. Another provider will reject it too.
 */

import { EventBus, type EventName, type Listener } from './events.js';
import { SMS, type SMSConfig } from './SMS.js';
import { SMSConfigurationError, SMSError, isFailoverEligible } from './errors.js';
import type { BalanceResult, PatternSendOptions, SendOptions, SendResult } from './types.js';

/** Failure classes that can trigger a move to the next provider. */
export type FailoverReason = 'rate_limit' | 'provider_unavailable' | 'network_error' | 'timeout';

/** Reasons enabled unless the caller says otherwise. Both are definite refusals. */
export const DEFAULT_FAILOVER_REASONS: readonly FailoverReason[] = ['rate_limit', 'provider_unavailable'];

export interface FailoverConfig {
  enabled?: boolean;
  /**
   * Which failures move on to the next provider.
   * Defaults to {@link DEFAULT_FAILOVER_REASONS}. Adding `network_error` or `timeout`
   * accepts a small risk of duplicate delivery — see the note at the top of this file.
   */
  on?: readonly FailoverReason[];
  /** Cap on providers tried per call. Defaults to all of them. */
  maxAttempts?: number;
}

/** Route a kind of traffic to a specific provider. Keys are free-form; `default` is special. */
export interface RoutingConfig {
  default?: string;
  pattern?: string;
  promotional?: string;
  transactional?: string;
  voice?: string;
  bulk?: string;
  [key: string]: string | undefined;
}

export interface MultiConfig {
  /** Named map (`{ primary: cfg, backup: cfg }`) or an ordered array. */
  providers: Record<string, SMSConfig> | readonly SMSConfig[];
  failover?: FailoverConfig;
  routing?: RoutingConfig;
  debug?: boolean;
}

interface Member {
  name: string;
  sms: SMS;
}

function reasonFor(error: unknown): FailoverReason | undefined {
  if (!(error instanceof SMSError)) return undefined;
  switch (error.kind) {
    case 'rate_limit':
      return 'rate_limit';
    case 'network':
      return 'network_error';
    case 'timeout':
      return 'timeout';
    case 'provider':
      // Only a server-side failure is worth moving on for; a 4xx means the request is wrong.
      return error.status !== undefined && error.status >= 500 ? 'provider_unavailable' : undefined;
    default:
      return undefined;
  }
}

export class Multi {
  private readonly members: Member[] = [];
  private readonly byName = new Map<string, Member>();
  private readonly failover: Required<Omit<FailoverConfig, 'maxAttempts'>> & { maxAttempts: number };
  private readonly routing: RoutingConfig;
  private readonly bus = new EventBus();

  constructor(config: MultiConfig) {
    if (!config?.providers) {
      throw new SMSConfigurationError('SMS.Multi requires a `providers` map or array.', {
        code: 'missing_providers',
      });
    }

    const entries: Array<[string, SMSConfig]> = Array.isArray(config.providers)
      ? config.providers.map((cfg, index) => [cfg.provider ?? `provider${index}`, cfg])
      : Object.entries(config.providers as Record<string, SMSConfig>);

    if (entries.length === 0) {
      throw new SMSConfigurationError('SMS.Multi requires at least one provider.', {
        code: 'missing_providers',
      });
    }

    for (const [name, cfg] of entries) {
      const sms = new SMS({ ...cfg, debug: cfg.debug ?? config.debug ?? false });
      const member: Member = { name, sms };
      this.members.push(member);
      this.byName.set(name, member);
      // Also reachable by provider id, so `use('kavenegar')` works with an array config.
      if (!this.byName.has(sms.providerId)) this.byName.set(sms.providerId, member);
    }

    this.failover = {
      enabled: config.failover?.enabled ?? false,
      on: config.failover?.on ?? DEFAULT_FAILOVER_REASONS,
      maxAttempts: config.failover?.maxAttempts ?? this.members.length,
    };
    this.routing = config.routing ?? {};
  }

  /** Configured member names, in order. */
  names(): string[] {
    return this.members.map((member) => member.name);
  }

  /** A specific member, by configured name or provider id. */
  use(name: string): SMS {
    const member = this.byName.get(name);
    if (!member) {
      throw new SMSConfigurationError(
        `Unknown provider "${name}" in this Multi. Configured: ${this.names().join(', ')}.`,
        { code: 'unknown_provider' },
      );
    }
    return member.sms;
  }

  /** The first configured member. */
  get primary(): SMS {
    return this.members[0]!.sms;
  }

  on<E extends EventName>(event: E, listener: Listener<E>): this {
    this.bus.on(event, listener);
    for (const member of this.members) member.sms.on(event, listener);
    return this;
  }

  off<E extends EventName>(event: E, listener: Listener<E>): this {
    this.bus.off(event, listener);
    for (const member of this.members) member.sms.off(event, listener);
    return this;
  }

  /* -------------------------------------------------------------- operations */

  /** Send, honouring `provider` override → routing → failover order. */
  async send(options: SendOptions & { provider?: string; route?: string }): Promise<SendResult> {
    const { provider, route, ...rest } = options;
    return this.run({ explicit: provider, route: route ?? 'default' }, (sms) => sms.messages.send(rest));
  }

  /** Send a pattern message. Routes on `routing.pattern` when no explicit provider is given. */
  async sendPattern(options: PatternSendOptions & { provider?: string }): Promise<SendResult> {
    const { provider, ...rest } = options;
    return this.run({ explicit: provider, route: 'pattern' }, (sms) => sms.patterns.send(rest));
  }

  /** Balance for every configured member. Failures are captured, not thrown. */
  async getBalances(): Promise<
    Array<{ name: string; provider: string; balance: BalanceResult | null; error: unknown }>
  > {
    return Promise.all(
      this.members.map(async (member) => {
        try {
          return {
            name: member.name,
            provider: member.sms.providerId,
            balance: await member.sms.account.getBalance(),
            error: null,
          };
        } catch (error) {
          return { name: member.name, provider: member.sms.providerId, balance: null, error };
        }
      }),
    );
  }

  /* -------------------------------------------------------------- internals */

  private order(selector: { explicit?: string | undefined; route: string }): Member[] {
    if (selector.explicit) {
      const member = this.byName.get(selector.explicit);
      if (!member) {
        throw new SMSConfigurationError(
          `Unknown provider "${selector.explicit}". Configured: ${this.names().join(', ')}.`,
          { code: 'unknown_provider' },
        );
      }
      // An explicit provider is an instruction, not a preference: never fail away from it.
      return [member];
    }

    const routed = this.routing[selector.route] ?? this.routing.default;
    if (routed) {
      const member = this.byName.get(routed);
      if (!member) {
        throw new SMSConfigurationError(
          `Routing rule "${selector.route}" points at unknown provider "${routed}". ` +
            `Configured: ${this.names().join(', ')}.`,
          { code: 'unknown_route_target' },
        );
      }
      return [member, ...this.members.filter((m) => m !== member)];
    }

    return [...this.members];
  }

  private async run<T>(
    selector: { explicit?: string | undefined; route: string },
    operation: (sms: SMS) => Promise<T>,
  ): Promise<T> {
    const candidates = this.order(selector);
    const attempts = this.failover.enabled
      ? candidates.slice(0, Math.max(1, this.failover.maxAttempts))
      : candidates.slice(0, 1);

    let lastError: unknown;

    for (let index = 0; index < attempts.length; index += 1) {
      const member = attempts[index]!;
      try {
        return await operation(member.sms);
      } catch (error) {
        lastError = error;

        const isLast = index === attempts.length - 1;
        if (isLast || !this.failover.enabled) break;

        // A request-level problem is not going to be fixed by a different vendor.
        if (!isFailoverEligible(error)) break;

        const reason = reasonFor(error);
        if (!reason || !this.failover.on.includes(reason)) break;

        const next = attempts[index + 1]!;
        this.bus.emit('failover', {
          from: member.sms.providerId,
          to: next.sms.providerId,
          reason,
        });
      }
    }

    throw lastError;
  }
}
