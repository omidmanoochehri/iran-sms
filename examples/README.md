# Examples

```bash
cp .env.example .env      # fill in the providers you use
node --env-file=.env examples/basic-send.mjs
```

`--env-file` needs Node 20+. On Node 18, export the variables yourself.

All examples read credentials from the environment — none contains a key.

## Cross-cutting

| File                                         | Shows                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`basic-send.mjs`](./basic-send.mjs)         | Send one message; switch provider with `SMS_PROVIDER`                                    |
| [`pattern.mjs`](./pattern.mjs)               | OTP through the pattern registry, including the two providers that need more than a code |
| [`multi-provider.mjs`](./multi-provider.mjs) | Several providers, routing, parallel balances                                            |
| [`failover.mjs`](./failover.mjs)             | Failover, and exactly what will and will not trigger it                                  |
| [`commonjs.cjs`](./commonjs.cjs)             | The same API from CommonJS                                                               |

## Provider-native

Deeper tours of the three largest APIs:

| File                                             | Shows                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| [`ippanel-native.mjs`](./ippanel-native.mjs)     | Demographic targeting, tariffs, patterns, drafts, tickets                 |
| [`kavenegar-native.mjs`](./kavenegar-native.mjs) | Server clock, account config (incl. debug mode), template CRUD, blacklist |
| [`smsir-native.mjs`](./smsir-native.mjs)         | Packs, live vs archive reports, and the sandbox                           |

## One per provider

Read-only tours — none of these send a message.

`amoot` · `farapayamak` · `farazsms` · `mediana` · `melipayamak` · `mizbansms` ·
`shahvarpayam` · `smsaram` · `tabansms` · `yekpayamak` · `afrasms` · `ganjesms` · `icosms` ·
`pishgamsms` · `radinpayamak` · `saharsms` · `takiran`

```bash
node --env-file=.env examples/amoot.mjs
```

## Safety

- **Nothing sends without `SMS_INTEGRATION_RECIPIENT`.** The examples that do send require a
  number you have explicitly nominated, so you cannot message a stranger by accident.
- **The per-provider examples only read.** Balances, lines, patterns, inbox — no billing.
- **`DEBUG=true`** turns on redacted request/response logging:

  ```bash
  DEBUG=true node --env-file=.env examples/basic-send.mjs
  ```

- **Free ways to test a send path:**
  - SMS.ir — create a Sandbox API key and set `SMSIR_SANDBOX=true`
  - Kavenegar — enable `debugmode` via `account/config`; sends are accepted and cancelled
    rather than delivered

## Providers with no published API host

Eleven providers require `request.baseUrl` from your own panel, because their platform mapping
is inferred or their host is unpublished. Their examples read it from
`<PROVIDER>_BASE_URL` and fail with an explanation if it is missing.

Why: [`../docs/provider-relations.md`](../docs/provider-relations.md).
