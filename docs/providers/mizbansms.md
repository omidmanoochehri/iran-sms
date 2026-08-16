# Mizban SMS

**Provider:** Mizban SMS / میزبان اس ام اس
**Official website:** https://mizbansms.ir
**Documentation URL:** https://services.mizbansms.com/swagger/index.html
**Machine-readable source (official):** https://services.mizbansms.com/swagger/v1/swagger.json — **226 paths**

**API base URL:** `https://services.mizbansms.com`
**Current API version:** `v1` (the Swagger document is titled `My Title v1.0.0` — the platform has not customised it)
**Legacy APIs:** None. Note that `mizbansms.com` (the `.com`) serves a default web-server page with an expired certificate; the live site is `mizbansms.ir` and the API is on `services.mizbansms.com`.

---

## Authentication

Two separate schemes coexist, and which one applies depends on the endpoint family:

| Family            | Auth                                                                              | Notes                                                          |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/api/Customer/*` | `username` + `password` + `usertype` **in the JSON body**                         | The customer-facing send/report surface                        |
| Everything else   | `Authorization` header (declared in Swagger as an `apiKey` named `Authorization`) | Panel/admin surface, token from `/api/Authentication/loginOtp` |

This package configures `username`/`password` as the required credentials because those are
what the sending API needs. Supply `credentials.token` as well if you want to reach the panel
endpoints through `provider.native.raw(...)`.

`usertype` is not enumerated anywhere in the Swagger document; this package defaults it to
`1` and lets you override it with `credentials.usertype`.

---

## Capabilities

| Capability                  | Supported  | Notes                                                                 |
| --------------------------- | ---------- | --------------------------------------------------------------------- |
| Send                        | Yes        | `POST /api/Customer/SendSMS`                                          |
| Bulk                        | Yes        | `to` is an array                                                      |
| Peer-to-peer                | Yes        | `POST /api/Customer/SendSMS2` — parallel `messages[]`/`to[]`          |
| Scheduled                   | Yes        | `POST /api/Customer/SendSMSFuture`                                    |
| Smart send (fallback lines) | Yes        | `POST /api/Customer/SmartSendSMS`                                     |
| Delivery reports            | Yes        | `GetDeliveryCode`, `GetArrayDeliveryCode`                             |
| Inbox                       | Yes        | `RecieveMessageArray` _(provider's spelling)_                         |
| Balance                     | Yes        | `Credites` _(provider's spelling)_                                    |
| Sender lines                | Yes        | `SMSNumbers`                                                          |
| Message part counter        | Yes        | `SmsCounter?message=`                                                 |
| OTP flow                    | Yes        | `GetOtpUser` / `VerifyOtpUser` — a **login** OTP, not a template send |
| **Pattern / template send** | **No**     | See below                                                             |
| Outbox listing              | **No**     | `/api/Report/ReportSendSms` exists but has no published schema        |
| Contacts                    | Panel-only | `/api/Feature/Contact*` require the panel bearer token                |
| Webhooks                    | **No**     |                                                                       |
| Voice                       | **No**     |                                                                       |

### Why pattern support is `false`

This is the one provider in this package that does **not** get pattern/template sending, and
it is worth being explicit about why rather than shipping something that looks like it.

Searching all 226 paths, the only pattern-adjacent endpoints are:

- `POST /api/SMSNumber/AddMessagePatternConfigs` — body `{userType, messagePatternTypeId, message, expireDay, active}`, behind the **panel bearer token**. This configures a _line's_ message-pattern policy; it is not a send.
- `POST /api/SMSNumber/MessagePatternConfigs` / `MessagePatternConfigType` — reads of the same.
- `POST /api/Message/AddCodeGenerate` / `CodeGenerates` — generate codes against a _timer send_, again panel-side.
- `POST /api/Message/SendMessage` — a rich panel-side composer (`messageType`, `sendSMSType`, geo/postal/age/gender targeting, `dynamicInfos[]`). It is not a variable-substitution template API and it needs the bearer token.

None of these is a customer-facing "send template X with variables Y" call. Claiming
`pattern: true` would mean inventing an endpoint, so the capability is declared `false`, and
`sms.supports('pattern')` returns the honest answer. `provider.native.raw(...)` remains
available if your account has panel access and you know what those endpoints do.

---

## Endpoints mapped onto the unified API

| Method | Path                                 | Body                                                       |
| ------ | ------------------------------------ | ---------------------------------------------------------- |
| POST   | `/api/Customer/SendSMS`              | `{usertype, username, password, message, from, to[], api}` |
| POST   | `/api/Customer/SendSMS2`             | `{…, messages[], from, to[], api}`                         |
| POST   | `/api/Customer/SendSMS3`             | `{…, messages[], from, to[]}`                              |
| POST   | `/api/Customer/SendSMSFuture`        | `{…, message, message2[], sendDate, from, to[], api}`      |
| POST   | `/api/Customer/SmartSendSMS`         | `{usertype, username, password, message, to[]}`            |
| POST   | `/api/Customer/Credites`             | `{username, password, usertype}`                           |
| POST   | `/api/Customer/SMSNumbers`           | `{username, password, usertype}`                           |
| POST   | `/api/Customer/GetDeliveryCode`      | `{userType, username, password, deliveryCode}`             |
| POST   | `/api/Customer/GetArrayDeliveryCode` | `{userType, username, password, deliveryCodes[]}`          |
| POST   | `/api/Customer/RecieveMessageArray`  | `{username, password, usertype, count}`                    |
| POST   | `/api/Customer/SmsCounter?message=`  | query only                                                 |
| GET    | `/api/Customer/SendSMS`              | query-string variant of the send                           |

> Casing quirk worth knowing: the send endpoints spell the field `usertype`, while the
> delivery-code endpoints spell it `userType`. Both are sent exactly as documented.

The remaining ~210 paths cover charging and payment callbacks, packages, scoring/gamification,
news, tickets, domains, SMS-number sales, jobs banks, surveys, appointment and warranty
messages, and full user administration. They are reachable through
`provider.native.raw(path, body)`.

## Response schemas

The Swagger document declares almost no response schemas, so this package does not invent a
normalized status mapping for delivery codes — the provider's own value is returned as
`nativeStatus` and `status` is `'unknown'`.

## Errors

No error taxonomy is published. This package maps the HTTP status and preserves the body in
`error.raw`.

## Rate limits

Not documented.

## Callbacks / webhooks

Not documented.

## Scheduled messaging

`sendDate` on `SendSMSFuture`. **No timezone is documented**; the platform is Iran-local, so
this package formats `Date` values as `YYYY-MM-DD HH:mm:ss` in **Asia/Tehran**.

## Provider-specific features

- **`SmsCounter`** — ask the server how many SMS parts a given text will use, before sending.
- **`SmartSendSMS`** — send without naming a line and let the platform choose.
- A very large panel-administration surface (scoring, gifts, packages, tickets, payment
  gateway callbacks for Mellat/Zarinpal/Shaygan/Orash) exposed on the same API.

## Limitations

- No template/pattern send (see above).
- No normalized delivery-status vocabulary.
- Contacts and reporting sit behind the panel bearer token.
- The Swagger `servers` entry is `http://services.mizbansms.com`. This package defaults to
  **https** because the customer methods carry the account password in the body; override
  with `request.baseUrl` if your deployment genuinely requires plain HTTP.

## Official SDKs

None published.

## Research notes

- The full endpoint inventory came from the provider's own live Swagger document, linked
  directly from `mizbansms.ir` as _"وب سرویس کد یکبارمصرف"_.
- `mizbansms.com` resolves but serves an unconfigured web server with an expired TLS
  certificate; it is not the production site.
- The Swagger `info.title` is the ASP.NET default (`My Title`), which is a good indication
  that the document is generated rather than hand-curated — hence the missing response
  schemas.

**Last verified:** 2026-08-16
