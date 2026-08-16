# Routing

Different traffic suits different providers. OTP wants a service line that is never filtered;
bulk marketing wants the cheapest per-message rate; voice needs a provider that offers it.
Routing expresses that once, in configuration, instead of scattering `if (provider === …)`
through your code.

## Configure

```ts
const sms = new SMS.Multi({
  providers: {
    ippanel: { provider: 'ippanel', credentials: {/* … */} },
    kavenegar: { provider: 'kavenegar', credentials: {/* … */} },
    smsir: { provider: 'smsir', credentials: {/* … */} },
  },

  routing: {
    pattern: 'kavenegar',
    promotional: 'smsir',
    default: 'ippanel',
  },
});
```

Values are member names _or_ provider ids — both resolve.

## Route keys

| Key           | Used by                            | Notes                                    |
| ------------- | ---------------------------------- | ---------------------------------------- |
| `default`     | `send()` when no other key matches | The general fallback                     |
| `pattern`     | `sendPattern()`                    | Where OTP and transactional templates go |
| anything else | `send({ route: 'promotional' })`   | Free-form; define what you like          |

```ts
await sms.send({ to, message, route: 'promotional' }); // → smsir
await sms.send({ to, message }); // → ippanel (default)
await sms.sendPattern({ to, pattern: 'login', variables }); // → kavenegar
```

An unknown route falls back to `default`, and then to configuration order.

## Overriding per call

```ts
await sms.send({ to, message, provider: 'smsir' });
```

An explicit `provider` beats routing, and also disables failover for that call — see
[failover.md](./failover.md#an-explicit-provider-is-an-instruction).

## Routing plus failover

Routing chooses who goes **first**; failover decides who goes **next**:

```ts
new SMS.Multi({
  providers: { a: ippanelCfg, b: kavenegarCfg, c: smsirCfg },
  routing: { pattern: 'b' },
  failover: { enabled: true },
});
```

A pattern send tries `b`, then `a`, then `c`. The routed provider is moved to the front of the
list rather than replacing it, so failover still has somewhere to go.

## A mistake worth catching early

A routing rule pointing at a provider you did not configure raises
`SMSConfigurationError` on the first call that uses it:

```
SMSConfigurationError: Routing rule "pattern" points at unknown provider "kavengar".
Configured: ippanel, kavenegar, smsir.
```

## Route on capability, not on hope

Routing does not check that the target can do the job. If you route voice to a provider
without voice, the call raises `SMSUnsupportedFeatureError`. Check first when it matters:

```ts
const voiceProvider = ['kavenegar', 'ippanel'].find((id) => sms.use(id).supports('voice'));
if (voiceProvider) {
  await sms.use(voiceProvider).voice.send({ to, message: 'Your code is 1 2 3 4' });
}
```

The capability table is in [provider-matrix.md](./provider-matrix.md).

## Routing outside `Multi`

You do not need `Multi` to route. Keeping separate clients is often clearer, and gives full
type completion on each:

```ts
// lib/sms.ts
export const otpSms = new SMS({ provider: 'kavenegar', credentials: {/* … */} });
export const bulkSms = new SMS({ provider: 'smsir', credentials: {/* … */} });
export const voiceSms = new SMS({ provider: 'ippanel', credentials: {/* … */} });
```

Reach for `Multi` when you want failover, a shared event stream, or provider selection driven
by data rather than by the call site.
