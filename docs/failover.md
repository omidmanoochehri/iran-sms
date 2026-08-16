# Multi-provider and failover

## Several providers at once

```ts
import { SMS } from 'iran-sms';

const sms = new SMS.Multi({
  providers: {
    primary: {
      provider: 'ippanel',
      credentials: { apiKey: process.env.IPPANEL_API_KEY! },
      sender: '+983000505',
    },
    backup: {
      provider: 'kavenegar',
      credentials: { apiKey: process.env.KAVENEGAR_API_KEY! },
      sender: '10004346',
    },
  },
});

await sms.use('primary').send({ to: '09121234567', message: 'Hello' });
await sms.use('kavenegar').account.getBalance(); // also reachable by provider id
```

`use()` returns a full `SMS` instance, so every namespace and the native surface work exactly
as they do standalone.

An array works too, when order is all you need:

```ts
new SMS.Multi({ providers: [ippanelConfig, kavenegarConfig, smsirConfig] });
```

## Failover

**Off by default.** Turn it on deliberately:

```ts
const sms = new SMS.Multi({
  providers: [ippanelConfig, kavenegarConfig, smsirConfig],
  failover: { enabled: true },
});

await sms.send({ to: '09121234567', message: 'Hello' });
```

Providers are tried in order until one succeeds.

### What triggers it, and what does not

This is the part worth reading carefully, because getting it wrong sends people duplicate
messages.

**Default (`on: ['rate_limit', 'provider_unavailable']`)**

Both are _definite refusals_: the provider answered, and the answer was no. Nothing was
accepted, so nothing can be duplicated. Failing over is free.

**Opt-in (`'network_error'`, `'timeout'`)**

Neither is a refusal. A timeout means you did not get an answer — the provider may well have
accepted the message and failed to tell you. Failing over then can deliver the same SMS twice.

That is sometimes the right trade (an OTP that must arrive beats an OTP that arrives twice),
but it is a decision, not a default:

```ts
failover: {
  enabled: true,
  on: ['rate_limit', 'provider_unavailable', 'network_error', 'timeout'],
}
```

**Never**

Anything wrong with the request itself. Another provider will reject it identically:

- `authentication` — wrong credentials for provider A; provider B has different ones, but the
  failure was not about reachability
- `validation` — the request is malformed
- `pattern` — the template is unknown or unapproved
- `recipient` — the number is invalid or blacklisted
- `insufficient_credit` — provider A is out of balance; failing to B would silently move spend
  to a different account, which is a decision only you can make
- `unsupported_feature`, `configuration`

This is enforced by `isFailoverEligible()` and cannot be overridden by `on`.

### An explicit provider is an instruction

```ts
await sms.send({ to: '09121234567', message: 'x', provider: 'primary' });
```

Naming a provider disables failover for that call. You asked for that provider; silently
using another would be surprising.

### Limiting attempts

```ts
failover: { enabled: true, maxAttempts: 2 }   // try at most two providers
```

### Observing it

```ts
sms.on('failover', ({ from, to, reason }) => {
  logger.warn(`SMS failover ${from} → ${to} (${reason})`);
  metrics.increment('sms.failover', { from, to, reason });
});
```

If this fires often, treat it as a signal to fix the primary rather than as normal operation.

## Reducing duplicate risk further

Combine failover with an idempotency key where the provider supports one:

```ts
await sms.send({
  to: '09121234567',
  message: 'Your order shipped',
  idempotencyKey: `order-${orderId}`,
});
```

On Kavenegar this makes the send genuinely repeat-safe. Elsewhere the key is ignored — see
[errors.md](./errors.md#retries-and-duplicates).

## Balances across providers

```ts
for (const { name, provider, balance, error } of await sms.getBalances()) {
  if (error) logger.warn(`${name}: unreachable`);
  else logger.info(`${name} (${provider}): ${balance!.amount} ${balance!.currency}`);
}
```

Failures are captured per provider rather than rejecting the whole call. Note that `currency`
differs — `IRR`, `IRT` and `credit` are not comparable without conversion.

## A worked example

```ts
const sms = new SMS.Multi({
  providers: {
    ippanel: {
      provider: 'ippanel',
      credentials: { apiKey: process.env.IPPANEL_API_KEY! },
      sender: '+983000505',
    },
    kavenegar: {
      provider: 'kavenegar',
      credentials: { apiKey: process.env.KAVENEGAR_API_KEY! },
      sender: '10004346',
    },
    smsir: { provider: 'smsir', credentials: { apiKey: process.env.SMSIR_API_KEY! }, sender: '30000000000' },
  },

  routing: {
    pattern: 'kavenegar', // OTP: never filtered, reaches opted-out numbers
    default: 'ippanel', // everything else
  },

  failover: {
    enabled: true,
    on: ['rate_limit', 'provider_unavailable'],
    maxAttempts: 2,
  },

  patterns: undefined,
});

// Goes to Kavenegar, falls back to IPPanel then SMS.ir on a definite refusal.
await sms.sendPattern({ to: user.mobile, pattern: 'login', variables: { code } });

// Goes to IPPanel first.
await sms.send({ to: user.mobile, message: 'Welcome!' });
```

More on routing: [routing.md](./routing.md).
