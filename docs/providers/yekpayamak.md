# YekPayamak

**Provider:** YekPayamak
**Official website:** https://yekpayamak.com
**Documentation URL:** https://yekpayamak.com/webservice/
**API base URL:** **Must be supplied via `request.baseUrl`.** No API host is published for this deployment.
**Current API version:** rest/v1
**Platform:** `ippanel-rest-v1` — the full wire protocol is documented in [`mediana.md`](./mediana.md).
**Legacy APIs:** None separately documented.

---

## Platform relationship

The Elementor SMS plugin's published _"companies with IPPanel source"_ list names
`yekpayamak.com`. That is a **lead, not proof** — no first-party API reference could be read.

The complete endpoint list, request/response schemas, error tables and quirks are in
[`mediana.md`](./mediana.md) and are **not duplicated here** — this package implements the
protocol once and configures it per provider. The reasoning and the evidence standard are in
[`../provider-relations.md`](../provider-relations.md).

> **This mapping is inferred, not confirmed.** Verify against your own panel's documentation
> before sending production traffic, and please open an issue with a link if it is wrong.

## Setup

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'yekpayamak',
  // Required: this package will not guess where your messages get sent.
  request: { baseUrl: process.env.YEKPAYAMAK_BASE_URL! },
  credentials: { apiKey: process.env.YEKPAYAMAK_API_KEY! },
  sender: process.env.SMS_SENDER!,
});
```

## Credentials

| Key               | Required | Description                                                         |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `apiKey`          | Yes      | Access key from the panel, sent as `Authorization: AccessKey <key>` |
| `request.baseUrl` | Yes      | Your account's API host — see above                                 |

## Capabilities

| Capability                     | Supported      | Notes                                       |
| ------------------------------ | -------------- | ------------------------------------------- |
| Send / bulk                    | Yes            | `POST /messages`                            |
| Pattern send                   | Yes            | `POST /messages/patterns/send`              |
| Pattern create                 | Yes            | `POST /messages/patterns`                   |
| Pattern list / update / delete | No             | not present on this generation              |
| Delivery reports               | Yes            | `GET /messages/{bulk_id}` and `/recipients` |
| Inbox                          | Yes            | `GET /messages/inbox`                       |
| Balance                        | Yes            | `GET /credit`                               |
| Scheduled send                 | No             | no schedule parameter exists                |
| Contacts / webhooks / voice    | Not documented |                                             |

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
import { YekPayamakProvider } from 'iran-sms/providers/yekpayamak';
```

See [`mediana.md`](./mediana.md) for the full native surface.

## Pattern usage

Identified by a string `code`. Values are sent as **`values`**, an object keyed by
variable name. Exactly one recipient per call. Pattern status is `active` | `inactive` | `pending`.

## Limitations

- **No published API host** — `request.baseUrl` is required.
- The platform mapping is **inferred**; confirm it against your panel before production use.
- Anything the platform does not support is unsupported here; see the capability table.

## Important provider-specific behaviour

⚠️ `yekpayamak.com` and `yekpayamak.ir` both returned DNS **SERVFAIL** on repeated attempts
during research, so the published web-service page could not be fetched. Note the domain is `.com`;
the `.ir` variant does not appear to be the live site.

## Official documentation source

- https://yekpayamak.com/webservice/
- Platform reference: [`mediana.md`](./mediana.md)
- Relationship evidence: [`../provider-relations.md`](../provider-relations.md)

**Last verified:** 2026-08-16
