# FaraPayamak

**Provider:** FaraPayamak
**Official website:** https://farapayamak.ir
**Documentation URL:** https://farapayamak.ir/content/webservice/
**API base URL:** `https://rest.payamak-panel.com` (the shared Payamak Panel host — resellers authenticate against it with their own credentials)
**Current API version:** rest (unversioned; `/api/SendSMS/<Method>` and `/api/SmartSMS/<Method>`)
**Platform:** `payamak-panel` — the full wire protocol is documented in [`melipayamak.md`](./melipayamak.md).
**Legacy APIs:** None separately documented.

---

## Platform relationship

FaraPayamak's own web-service page documents the same method families as the platform
vendor — REST, SOAP, a service-SMS REST API for OTP, timed sends, phonebook, ticket management and
user management — and the same "smart web service" product that falls back across up to three
sender lines. The Elementor SMS plugin's published _"Payamak Panel source"_ list corroborates it.

The complete endpoint list, request/response schemas, error tables and quirks are in
[`melipayamak.md`](./melipayamak.md) and are **not duplicated here** — this package implements the
protocol once and configures it per provider. The reasoning and the evidence standard are in
[`../provider-relations.md`](../provider-relations.md).

## Setup

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'farapayamak',
  credentials: {
    username: process.env.FARAPAYAMAK_USERNAME!,
    password: process.env.FARAPAYAMAK_PASSWORD!,
  },
  sender: process.env.SMS_SENDER!,
});
```

## Credentials

| Key        | Required | Description                                     |
| ---------- | -------- | ----------------------------------------------- |
| `username` | Yes      | Panel username                                  |
| `password` | Yes      | **Web-service API key**, not the login password |

## Capabilities

| Capability                             | Supported      | Notes                                                         |
| -------------------------------------- | -------------- | ------------------------------------------------------------- |
| Send / bulk                            | Yes            | `SendSMS`                                                     |
| Peer-to-peer                           | Yes            | `SendMultipleSMS`, max 100 rows                               |
| OTP                                    | Yes            | `SendOTP` — needs no approved text                            |
| Template send                          | Yes            | `BaseServiceNumber` with a numeric `bodyId`                   |
| Scheduled                              | Yes            | `SendSchedule`; template scheduling is limited to 07:00–22:00 |
| Cancel scheduled                       | SOAP only      | `Schedule.RemoveSchedule`                                     |
| Delivery reports                       | Yes            | `GetDeliveries`, `GetNewDeliveries`, public `GetDeliveries2`  |
| Inbox                                  | Yes            | `GetMessages`, `GetInboxCount`                                |
| Balance                                | Yes            | `GetCredit` (units), `GetCredit2` (Rial)                      |
| Sender lines                           | Yes            | `GetUserNumbers`                                              |
| Pricing                                | Yes            | `GetSmsPrice`, `GetBasePrice`                                 |
| Smart send (fallback lines)            | Yes            | `/api/SmartSMS/*`                                             |
| Contacts / voice / tickets / sub-users | SOAP only      | see the platform document                                     |
| Webhooks                               | Not documented |                                                               |

Check at runtime rather than trusting this table:

```ts
if (sms.supports('pattern')) {
  /* … */
}
```

## Unified usage

```ts
await sms.send({ to: '09121234567', message: 'Hello' });
await sms.patterns.send({ to: '09121234567', pattern: 'login', variables: { code: '123456' } });
const balance = await sms.account.getBalance();
```

## Provider-native usage

```ts
// Every documented method of the underlying platform, unwrapped.
await sms.provider.native;
```

```ts
import { FaraPayamakProvider } from 'iran-sms/providers/farapayamak';
```

See [`melipayamak.md`](./melipayamak.md) for the full native surface.

## Pattern usage

Called **متن خدماتی / base service number**, identified by a numeric `bodyId`.

The platform does **not** substitute variables server-side: you send the fully rendered
`text` and it is checked against the approved template (error `-5` on mismatch). Register the
approved body in the pattern registry so this package can render it for you:

```ts
patterns: { login: { farapayamak: { code: 12345, body: 'Your code is %code%' } } }
```

## Limitations

- Anything the platform does not support is unsupported here; see the capability table.

## Important provider-specific behaviour

FaraPayamak is operated by شرکت دانش‌بنیان فراداده and has been running since 1386 (2007).
Its documentation additionally advertises a GitHub library and code samples for C#, VB.NET, PHP,
VB6, Delphi, .NET Core and Linux shell.

## Official documentation source

- https://farapayamak.ir/content/webservice/
- Platform reference: [`melipayamak.md`](./melipayamak.md)
- Relationship evidence: [`../provider-relations.md`](../provider-relations.md)

**Last verified:** 2026-08-16
