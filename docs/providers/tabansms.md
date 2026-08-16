# Taban SMS

**Provider:** Taban SMS
**Official website:** https://tabansms.com
**Documentation URL:** https://tabansms.com/webservice/
**API base URL:** **Must be supplied via `request.baseUrl`.** No API host is published for this deployment.
**Current API version:** rest/v1
**Platform:** `ippanel-rest-v1` — the full wire protocol is documented in [`mediana.md`](./mediana.md).
**Legacy APIs:** None separately documented.

---

## Platform relationship

Taban SMS's own web-service page links directly to **https://docs.ippanel.com/** for its
"Webservice API", and to IPPanel's own downloads for C++ and C# samples, the international and VOTP
Postman collections, the pattern guide (`help-patterns.pdf`) and the web-service error list
(`webservice-error.pdf`). This is first-party evidence from the reseller itself.

The complete endpoint list, request/response schemas, error tables and quirks are in
[`mediana.md`](./mediana.md) and are **not duplicated here** — this package implements the
protocol once and configures it per provider. The reasoning and the evidence standard are in
[`../provider-relations.md`](../provider-relations.md).

## Setup

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'tabansms',
  // Required: this package will not guess where your messages get sent.
  request: { baseUrl: process.env.TABANSMS_BASE_URL! },
  credentials: { apiKey: process.env.TABANSMS_API_KEY! },
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
import { TabanSMSProvider } from 'iran-sms/providers/tabansms';
```

See [`mediana.md`](./mediana.md) for the full native surface.

## Pattern usage

Identified by a string `code`. Values are sent as **`values`**, an object keyed by
variable name. Exactly one recipient per call. Pattern status is `active` | `inactive` | `pending`.

## Limitations

- **No published API host** — `request.baseUrl` is required.
- Anything the platform does not support is unsupported here; see the capability table.

## Important provider-specific behaviour

Operated by شرکت مولد ارتباطات پایدار, trading since 1395 (2016). The site advertises voice
calls, LBS/BTS tower sending and a customer-number capture device alongside SMS.

## Official documentation source

- https://tabansms.com/webservice/
- Platform reference: [`mediana.md`](./mediana.md)
- Relationship evidence: [`../provider-relations.md`](../provider-relations.md)

**Last verified:** 2026-08-16
