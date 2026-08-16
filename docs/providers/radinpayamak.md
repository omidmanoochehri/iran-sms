# Radin Payamak

**Provider:** Radin Payamak
**Official website:** https://radinpayamak.ir
**Documentation URL:** https://radinpayamak.ir/web-service-documentation/
**API base URL:** **Must be supplied via `request.baseUrl`.** The Payamak Panel host is `https://rest.payamak-panel.com`, but because this mapping is _inferred_ the package will not default to it — use the host your own panel documents.
**Current API version:** rest (unversioned; `/api/SendSMS/<Method>` and `/api/SmartSMS/<Method>`)
**Platform:** `payamak-panel` — the full wire protocol is documented in [`melipayamak.md`](./melipayamak.md).
**Legacy APIs:** None separately documented.

---

## Platform relationship

**Inferred, not confirmed.** The public site advertises web services for SMS, voice
messages and messenger apps, plus pattern sending, plugins and connection code samples — a feature set
consistent with the Payamak Panel product line — but every documentation link resolves to a page that
requires a panel login (`radinpayamak.ir/login/`).

The complete endpoint list, request/response schemas, error tables and quirks are in
[`melipayamak.md`](./melipayamak.md) and are **not duplicated here** — this package implements the
protocol once and configures it per provider. The reasoning and the evidence standard are in
[`../provider-relations.md`](../provider-relations.md).

> **This mapping is inferred, not confirmed.** Verify against your own panel's documentation
> before sending production traffic, and please open an issue with a link if it is wrong.

## Setup

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'radinpayamak',
  credentials: {
    username: process.env.RADINPAYAMAK_USERNAME!,
    password: process.env.RADINPAYAMAK_PASSWORD!,
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
import { RadinPayamakProvider } from 'iran-sms/providers/radinpayamak';
```

See [`melipayamak.md`](./melipayamak.md) for the full native surface.

## Pattern usage

Called **متن خدماتی / base service number**, identified by a numeric `bodyId`.

The platform does **not** substitute variables server-side: you send the fully rendered
`text` and it is checked against the approved template (error `-5` on mismatch). Register the
approved body in the pattern registry so this package can render it for you:

```ts
patterns: { login: { radinpayamak: { code: 12345, body: 'Your code is %code%' } } }
```

## Limitations

- The platform mapping is **inferred**; confirm it against your panel before production use.
- Anything the platform does not support is unsupported here; see the capability table.

## Important provider-specific behaviour

Radin advertises capabilities this package's platform adapter does **not** cover, including
messenger-app sending (`/social-messaging-api/`), international SMS and behaviour-based targeting. If
you use those, reach for the provider's own documentation once you have panel access.

## Official documentation source

- https://radinpayamak.ir/web-service-documentation/
- Platform reference: [`melipayamak.md`](./melipayamak.md)
- Relationship evidence: [`../provider-relations.md`](../provider-relations.md)

**Last verified:** 2026-08-16
