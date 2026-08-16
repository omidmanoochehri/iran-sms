# iran-sms

**One API for twenty Iranian SMS gateways — plus the complete native API of every one of them.**

[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

```bash
npm install iran-sms
```

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'ippanel',
  credentials: { apiKey: process.env.IPPANEL_API_KEY! },
  sender: '+983000505',
});

await sms.send({ to: '09121234567', message: 'سلام!' });

await sms.patterns.send({
  to: '09121234567',
  pattern: 'login',
  variables: { code: '183942' },
});
```

---

## Why this exists

Iranian SMS providers all do the same job and none of them do it the same way.

One wants `+989121234567`, another `09121234567`, another `9121234567`. One returns
`{return: {status: 200}, entries: []}`, another `{status: 1, data: {}}`, another
`{Value: "…", RetStatus: 1}` where `Value` is _either_ a message id _or_ an error code
depending on how long it is. Template variables are a named object here, a positional
comma-separated string there, five numbered slots with different whitespace rules somewhere
else — and on one platform there is no substitution at all: you send the fully rendered text
and it gets diffed against the approved template.

This package absorbs that, and then **gets out of the way**: every provider's full documented
API is still there under `sms.provider`.

## What makes it trustworthy

- **Researched, not guessed.** Every endpoint traces to a first-party source — an OpenAPI
  document, a Swagger file, official docs, or official SDK source. All of them are listed in
  [`docs/SOURCES.md`](./docs/SOURCES.md) with the date they were read.
- **No invented endpoints.** Where a provider does not document something, the capability is
  `false` and the docs say why. One provider gets `pattern: false` because it genuinely has
  no template API — [see the search](./docs/providers/mizbansms.md#why-pattern-support-is-false).
- **Sends are never silently retried.** A timeout is not a "no". Retrying can bill the account
  twice and message the customer twice, so it only happens where a provider offers a real
  idempotency key. [Why](./docs/errors.md#retries-and-duplicates).
- **Credentials do not leak.** Including Kavenegar's API key, which lives in the URL _path_
  and is redacted from every log line, event and error.
- **469 tests**, most of them contract tests asserting the exact bytes each adapter puts on
  the wire against the published specification.
- **Zero runtime dependencies.** Node 18.17+. ESM and CommonJS. Full TypeScript types.

## Providers

| Provider                                               | Send | Pattern | Bulk | Schedule | Reports | Inbox | Native API |
| ------------------------------------------------------ | :--: | :-----: | :--: | :------: | :-----: | :---: | :--------: |
| [IPPanel](./docs/providers/ippanel.md)                 |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 88 ops  |
| [FarazSMS / IranPayamak](./docs/providers/farazsms.md) |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 55 ops  |
| [Kavenegar](./docs/providers/kavenegar.md)             |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 32 ops  |
| [SMS.ir](./docs/providers/smsir.md)                    |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 16 ops  |
| [MeliPayamak](./docs/providers/melipayamak.md)         |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 21 ops  |
| [Mediana](./docs/providers/mediana.md)                 |  ✅  |   ✅    |  ✅  |    —     |   ✅    |  ✅   |  ✅ 7 ops  |
| [AmootSMS](./docs/providers/amoot.md)                  |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 50 ops  |
| [Mizban SMS](./docs/providers/mizbansms.md)            |  ✅  |    —    |  ✅  |    ✅    |   ✅    |  ✅   | ✅ 226 ops |
| [FaraPayamak](./docs/providers/farapayamak.md)         |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [ShahvarPayam](./docs/providers/shahvarpayam.md)       |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [Taban SMS](./docs/providers/tabansms.md)              |  ✅  |   ✅    |  ✅  |    —     |   ✅    |  ✅   |     ✅     |
| [SMS Aram](./docs/providers/smsaram.md)                |  ✅  |   ✅    |  ✅  |    —     |   ✅    |  ✅   |     ✅     |
| [YekPayamak](./docs/providers/yekpayamak.md)           |  ✅  |   ✅    |  ✅  |    —     |   ✅    |  ✅   |     ✅     |
| [Radin Payamak](./docs/providers/radinpayamak.md) ⚠️   |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [Sahar SMS](./docs/providers/saharsms.md) ⚠️           |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [iCO SMS](./docs/providers/icosms.md) ⚠️               |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [TakIran](./docs/providers/takiran.md) ⚠️              |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [Pishgam SMS](./docs/providers/pishgamsms.md) ⚠️       |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [AfraSMS](./docs/providers/afrasms.md) ⚠️              |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |
| [GanjeSMS](./docs/providers/ganjesms.md) ⚠️            |  ✅  |   ✅    |  ✅  |    ✅    |   ✅    |  ✅   |     ✅     |

⚠️ Runs a known platform, but the mapping is **inferred, not confirmed** — these require an
explicit `request.baseUrl` and will not start without one. This package does not guess where
your messages get sent. [Details](./docs/provider-relations.md).

Full capability grid: [`docs/provider-matrix.md`](./docs/provider-matrix.md) — generated from
code, so it cannot drift.

## Highlights

### Capability detection, not hope

```ts
sms.supports('voice'); // false on most providers
sms.capabilities; // the whole map, synchronously

await sms.contacts.list();
// SMSUnsupportedFeatureError: Provider "kavenegar" does not support "contacts".
// Check `sms.supports('contacts')` first, or see docs/provider-matrix.md.
```

Never a `TypeError`, never a silent no-op.

### One pattern name, every provider

```ts
const sms = new SMS({
  provider: process.env.SMS_PROVIDER!,
  credentials: {/* … */},
  patterns: {
    login: {
      ippanel: 'fg88js0v32',
      smsir: 187543,
      kavenegar: 'login',
      melipayamak: { code: 94651, body: 'کد ورود شما %code% است' },
      amoot: { code: 4021, variableOrder: ['name', 'code'] },
    },
  },
});

await sms.patterns.send({ to, pattern: 'login', variables: { code } });
```

Two providers need more than a code — a positional order, or the approved template body. Both
raise an error that tells you exactly what to add rather than sending the wrong thing.
[How patterns work](./docs/patterns.md).

### Failover that will not double-send

```ts
const sms = new SMS.Multi({
  providers: [ippanelConfig, kavenegarConfig, smsirConfig],
  routing: { pattern: 'kavenegar', default: 'ippanel' },
  failover: { enabled: true },
});
```

Fails over on a _definite refusal_ (rate limit, 5xx). Never on an invalid recipient, a bad
template or wrong credentials — another provider would reject those too. Network errors and
timeouts are opt-in, because they do not prove the first provider refused anything.
[Reasoning](./docs/failover.md).

### The full native API, always

```ts
await sms.provider.addToBlacklist('10004346', ['09121234567']); // Kavenegar
await sms.provider.native.lbs.create({/* … */}); // FarazSMS geo campaign
await sms.provider.native.raw('/api/Report/ReportSendSms', { page: 1 }); // Mizban
```

Or import one provider directly, fully typed, without loading the other nineteen:

```ts
import { KavenegarProvider } from 'iran-sms/providers/kavenegar';
```

### Phone numbers, handled

```ts
await sms.send({ to: '۰۹۱۲۱۲۳۴۵۶۷', message: 'x' }); // Persian digits
await sms.send({ to: '+98 912 123 4567', message: 'x' });
await sms.send({ to: '00989121234567', message: 'x' });
```

All three reach the same handset, converted to whatever the provider wants.

```ts
import { parsePhone, detectOperator } from 'iran-sms/phone';
detectOperator('09351234567'); // 'irancell'
```

### Errors you can act on

```ts
catch (error) {
  if (error instanceof SMSInsufficientCreditError) await alertOps();
  else if (error instanceof SMSRecipientError)     await markInvalid(user);
  console.log(error.provider, error.code, error.raw);   // native detail preserved
}
```

[The hierarchy](./docs/errors.md).

## Documentation

|                                                    |                                                    |
| -------------------------------------------------- | -------------------------------------------------- |
| [Getting started](./docs/getting-started.md)       | Install to first message                           |
| [Configuration](./docs/configuration.md)           | Every option, and the retry policy                 |
| [Sending](./docs/sending.md)                       | Bulk, peer-to-peer, scheduling, timezones          |
| [Patterns](./docs/patterns.md)                     | The registry, and the two providers that need more |
| [Errors](./docs/errors.md)                         | The hierarchy, and duplicate-send safety           |
| [Failover](./docs/failover.md)                     | Multi-provider, and what must never fail over      |
| [Routing](./docs/routing.md)                       | Sending different traffic to different providers   |
| [Webhooks](./docs/webhooks.md)                     | What exists, and why there is no `verify()`        |
| [Providers](./docs/providers.md)                   | Per-provider notes and how to choose               |
| [Capability matrix](./docs/provider-matrix.md)     | Generated from code                                |
| [Provider relations](./docs/provider-relations.md) | Who runs whose panel software                      |
| [API coverage](./docs/API-COVERAGE.md)             | What is implemented, and what is not               |
| [Sources](./docs/SOURCES.md)                       | Every source, with dates                           |
| [Migration](./docs/migration.md)                   | From another provider or SDK                       |

Per-provider research logs live in [`docs/providers/`](./docs/providers/) — base URLs, auth,
every endpoint, error tables, quirks, limitations and verification dates.

## Examples

Runnable scripts in [`examples/`](./examples/), one per provider plus the cross-cutting ones:

```bash
cp .env.example .env    # fill in the providers you use
node examples/basic-send.mjs
```

## Contributing

Adding a provider means meeting the research standard in
[CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-provider): first-party sources, a research log, a
capability declaration you can defend, and contract tests. Corrections to the inferred
platform mappings are especially welcome — open an issue with a link to the provider's own
documentation.

## Security

Credential handling, redaction and vulnerability reporting: [SECURITY.md](./SECURITY.md).

## License

MIT © Cactus Software Group. See [LICENSE](./LICENSE).

---

_Not affiliated with, endorsed by, or sponsored by any of the providers listed. All product
names and trademarks belong to their respective owners._
