# ShahvarPayam

**Provider:** ShahvarPayam
**Official website:** https://shahvarpayam.ir
**Documentation URL:** https://shahvarpayam.ir/api/
**API base URL:** `https://rest.payamak-panel.com` (the shared Payamak Panel host — resellers authenticate against it with their own credentials)
**Current API version:** rest (unversioned; `/api/SendSMS/<Method>` and `/api/SmartSMS/<Method>`)
**Platform:** `payamak-panel` — the full wire protocol is documented in [`melipayamak.md`](./melipayamak.md).
**Legacy APIs:** None separately documented.

---

## Platform relationship

The provider's API page publishes the Payamak Panel client signature verbatim:
`RestClient restClient = new RestClient(username, password); restClient.Send(to, from, text, isFlash)`.

The complete endpoint list, request/response schemas, error tables and quirks are in
[`melipayamak.md`](./melipayamak.md) and are **not duplicated here** — this package implements the
protocol once and configures it per provider. The reasoning and the evidence standard are in
[`../provider-relations.md`](../provider-relations.md).

## Setup

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'shahvarpayam',
  credentials: {
    username: process.env.SHAHVARPAYAM_USERNAME!,
    password: process.env.SHAHVARPAYAM_PASSWORD!,
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
import { ShahvarPayamProvider } from 'iran-sms/providers/shahvarpayam';
```

See [`melipayamak.md`](./melipayamak.md) for the full native surface.

## Pattern usage

Called **متن خدماتی / base service number**, identified by a numeric `bodyId`.

The platform does **not** substitute variables server-side: you send the fully rendered
`text` and it is checked against the approved template (error `-5` on mismatch). Register the
approved body in the pattern registry so this package can render it for you:

```ts
patterns: { login: { shahvarpayam: { code: 12345, body: 'Your code is %code%' } } }
```

## Limitations

- Anything the platform does not support is unsupported here; see the capability table.

## Important provider-specific behaviour

⚠️ The published API page is a purchased WordPress theme ("قالب بلو") whose sample copy has
not been fully rewritten — the code samples still name _یک پیامک_, _ملی پیامک_ and _گرین_, and the FAQ
entries are placeholders. The **signature** is nonetheless the Payamak Panel contract, which is what
determines the wire protocol. Treat the surrounding prose on that page with caution.

## Official documentation source

- https://shahvarpayam.ir/api/
- Platform reference: [`melipayamak.md`](./melipayamak.md)
- Relationship evidence: [`../provider-relations.md`](../provider-relations.md)

**Last verified:** 2026-08-16
