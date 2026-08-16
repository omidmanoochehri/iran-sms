# Configuration

```ts
new SMS({
  provider: 'ippanel',
  credentials: { apiKey: process.env.IPPANEL_API_KEY! },
  sender: '+983000505',
  debug: false,
  request: { timeout: 15000, retries: 2 },
  patterns: { login: { ippanel: 'fg88js0v32' } },
});
```

## `provider` (required)

A provider id or alias. `SMS.providers()` lists the canonical ids; aliases are matched
case-insensitively and ignore spaces, dots and underscores, so `'SMS.ir'`, `'sms_ir'` and
`'smsir'` are the same provider.

An unknown id throws `SMSConfigurationError` at construction, listing the valid ids.

## `credentials` (required)

Provider-shaped — there is no single schema, because the providers do not share one:

| Shape                    | Providers                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `{ apiKey }`             | `ippanel`, `farazsms`, `kavenegar`, `smsir`, `mediana`, `tabansms`, `smsaram`, `yekpayamak` |
| `{ token }`              | `amoot` (also accepts `apiKey`)                                                             |
| `{ username, password }` | `melipayamak` and the whole Payamak Panel family, `mizbansms`                               |

Missing credentials are detected **at construction**, before any network call:

```ts
new SMS({ provider: 'ippanel', credentials: {} });
// SMSConfigurationError: Missing credentials for provider "ippanel":
//   - credentials.apiKey or token (commonly IPPANEL_API_KEY): Access key from Developers → Access Keys.
```

See the credentials table in [provider-matrix.md](./provider-matrix.md) for exact keys.

## `sender`

The default sender line, used whenever a call omits `from`. Providers that require one raise
`SMSConfigurationError` with `code: 'missing_sender'` if neither is set.

Some providers can infer it (Kavenegar falls back to the account's default sender;
SMS.ir's Verify send picks a line itself), so this is not universally required.

## `request`

| Option       | Default            | Notes                                                    |
| ------------ | ------------------ | -------------------------------------------------------- |
| `timeout`    | `15000`            | Milliseconds. Aborts the socket, not just the promise.   |
| `retries`    | `2`                | **Reads only.** See below.                               |
| `retryDelay` | `300`              | Base for exponential backoff with full jitter.           |
| `baseUrl`    | provider default   | Required for providers with no published host.           |
| `headers`    | —                  | Merged into every request. Cannot override auth headers. |
| `fetch`      | `globalThis.fetch` | For proxies, instrumentation, or tests.                  |
| `userAgent`  | —                  | Appended to this package's own.                          |

### `retries` never applies to a send

`retries` governs **safe** requests: balance, reports, inbox, listings. A send is retried only
when the provider supports a caller-supplied idempotency key _and_ you supplied one — which
today means Kavenegar and its `localid`:

```ts
// Retried on a network failure: localid makes a repeat safe at the provider.
await sms.send({ to: '09121234567', message: 'x', idempotencyKey: `order-${id}` });

// Not retried: a timeout does not tell you whether the message was accepted.
await sms.send({ to: '09121234567', message: 'x' });
```

A duplicate SMS costs money and looks broken to the recipient, so the default is not to
guess. See [errors.md](./errors.md#retries-and-duplicates).

### `baseUrl`

Eleven providers have no published API host — either the platform mapping is inferred, or the
deployment's host is not documented. They throw at construction until you supply one:

```ts
new SMS({
  provider: 'takiran',
  request: { baseUrl: 'https://…' }, // from your panel
  credentials: { username, password },
});
```

Which providers and why: [provider-relations.md](./provider-relations.md).

## `patterns`

Logical pattern names mapped to per-provider codes. Full guide: [patterns.md](./patterns.md).

```ts
patterns: {
  login: {
    ippanel: 'fg88js0v32',
    smsir: 187543,
    kavenegar: 'login',
    melipayamak: { code: 94651, body: 'Your code is %code%' },
    amoot: { code: 4021, variableOrder: ['name', 'code'] },
  },
}
```

## `debug`

Writes redacted request/response diagnostics to **stderr**:

```
[iran-sms:kavenegar] → POST https://api.kavenegar.com/v1/6134****/sms/send.json
[iran-sms:kavenegar] ← 200 https://api.kavenegar.com/v1/6134****/sms/send.json 214ms
```

Authorization headers, API keys (including Kavenegar's URL-path key), passwords, tokens and
OTP values are masked. See [SECURITY.md](../SECURITY.md).

## Events

```ts
sms.on('request', (info) => metrics.increment('sms.request', { provider: info.provider }));
sms.on('response', (info) => metrics.timing('sms.latency', info.durationMs));
sms.on('sent', ({ result }) => audit.log(result.messageId));
sms.on('error', ({ error }) => logger.error(error));
```

Payloads are pre-redacted. A listener that throws is swallowed — an observer must never fail
the operation it is observing.

## Environment variables

This package reads no environment variables of its own. Wire them yourself, so credential
handling stays visible in your code:

```ts
const sms = new SMS({
  provider: process.env.SMS_PROVIDER ?? 'ippanel',
  credentials: { apiKey: process.env.IPPANEL_API_KEY! },
  sender: process.env.SMS_SENDER!,
});
```

[`.env.example`](../.env.example) lists the names the examples use.

## Framework notes

The package is server-side and framework-independent: plain Node, Express, Fastify, NestJS,
Next.js route handlers and server actions, cron jobs, CLIs. It uses only `fetch`,
`AbortController`, `URL`, `FormData` and `Intl` — no Node-only APIs — so it also runs in
Workers-style runtimes.

Construct the client **once** and reuse it. It memoises the loaded adapter and its HTTP
client, so a per-request instance throws that away.

```ts
// lib/sms.ts
import { SMS } from 'iran-sms';

export const sms = new SMS({
  provider: process.env.SMS_PROVIDER!,
  credentials: { apiKey: process.env.SMS_API_KEY! },
  sender: process.env.SMS_SENDER!,
});
```
