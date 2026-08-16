# API coverage audit

For each provider: how many operations its official documentation describes, how many this
package can reach, and — where something is missing — exactly what and why.

"Reachable" means callable through this package without dropping to raw HTTP: either through
the unified API or through `provider.native.*`.

Counts are of **documented operations**, not URL paths. IPPanel's fourteen `sending_type`
variants all POST to `/api/send`, but they are fourteen different operations with fourteen
different request bodies, so they count as fourteen.

---

## Summary

| Provider                                                                                                            | Documented | Reachable |   Coverage | Notes                                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------: | --------: | ---------: | ---------------------------------------- |
| `ippanel`                                                                                                           |         89 |        88 | **98.9 %** | 1 deliberate omission                    |
| `farazsms` (= `iranpayamak`)                                                                                        |         55 |        55 |  **100 %** |                                          |
| `kavenegar`                                                                                                         |         32 |        32 |  **100 %** |                                          |
| `smsir`                                                                                                             |         16 |        16 |  **100 %** |                                          |
| `melipayamak` (REST)                                                                                                |         21 |        21 |  **100 %** | SOAP surface not implemented — see below |
| `mediana`                                                                                                           |          7 |         7 |  **100 %** |                                          |
| `amoot`                                                                                                             |         50 |        50 |  **100 %** |                                          |
| `mizbansms`                                                                                                         |        226 |       226 |  **100 %** | 12 typed, all 226 via `native.raw()`     |
| `farapayamak`, `shahvarpayam`, `radinpayamak`, `saharsms`, `icosms`, `takiran`, `pishgamsms`, `afrasms`, `ganjesms` |         21 |        21 |  **100 %** | via the shared `payamak-panel` adapter   |
| `tabansms`, `smsaram`, `yekpayamak`                                                                                 |          7 |         7 |  **100 %** | via the shared `ippanel-rest-v1` adapter |

---

## IPPanel

**Source:** https://docs.ippanel.com/ (104 markdown files in `ippanelcom/Edge-Document`)

```
Official operations found: 89
Reachable:                 88
Not implemented:            1

Coverage: 98.9 %
```

| Area                                                              | Documented | Reachable |
| ----------------------------------------------------------------- | ---------: | --------: |
| Authentication                                                    |          7 |         7 |
| Send (`sending_type` variants)                                    |         14 |        14 |
| Send — URL variant (`GET /api/send/webservice`)                   |          1 |         0 |
| Send — cancel, calculate-price                                    |          2 |         2 |
| Reference data (provinces/counties/cities/genders, v1 + v2, jobs) |         11 |        11 |
| Reports                                                           |          5 |         5 |
| Patterns                                                          |          5 |         5 |
| Numbers                                                           |          3 |         3 |
| Payment                                                           |          1 |         1 |
| Phonebooks                                                        |          7 |         7 |
| Phonebook contacts                                                |          6 |         6 |
| Phonebook custom fields                                           |          4 |         4 |
| Drafts                                                            |          8 |         8 |
| Users (reseller)                                                  |         10 |        10 |
| Packages                                                          |          1 |         1 |
| Tickets                                                           |          4 |         4 |

**Not implemented**

| Operation                             | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/send/webservice` (URL send) | **Deliberate.** A GET endpoint that accepts the API key _or_ username+password as query parameters, with ~15 accepted aliases per parameter. It exists so other vendors' URL APIs can be swapped in without code changes; `POST /api/send` does the same job without putting credentials in a URL. Implementing it would mean shipping a path that leaks credentials into access logs. Use `provider.call('GET', '/api/send/webservice', { query })` if you genuinely need it. |

---

## FarazSMS / IranPayamak

**Source:** https://docs.farazsms.com/download/openapi.json (OpenAPI 3.0.1, 55 paths)

```
Official operations found: 55
Reachable:                 55

Coverage: 100 %
```

Includes the LBS campaign family (5), voice (3), phonebook (10), tickets (6), orders (3),
number-bank and postal reference data (6), account and wallet (6), panel auth (5), the Excel
import template, and the send family (13).

**Caveats rather than gaps**

- `GET /ws/v1/patterns` and `GET /ws/v1/patterns/{code}` are declared in the spec with a
  request _body_. GET requests do not have bodies; the fields listed are list filters, so
  this package sends them as query parameters. Recorded in `providers/farazsms.md`.
- Five operations declare `security: []` in the spec. This package sends the `Api-Key`
  header on all of them anyway — almost certainly a spec-authoring omission.

---

## Kavenegar

**Source:** https://kavenegar.com/rest.html

```
Official operations found: 32
Reachable:                 32

Coverage: 100 %
```

| Scope          | Operations |
| -------------- | ---------: |
| `sms`          |         13 |
| `verify`       |          7 |
| `line/blocked` |          4 |
| `call`         |          1 |
| `account`      |          2 |
| `media`        |          4 |
| `utils`        |          1 |

**Removed by the provider — deliberately not implemented**

| Operation              | Reason                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `sms/countpostalcode`  | Listed as حذف گردید ("removed") in the provider's own changelog |
| `sms/sendbypostalcode` | Listed as حذف گردید ("removed") in the provider's own changelog |

Third-party guides still describe these. Implementing a method the vendor has withdrawn
would produce a 404 at best.

---

## SMS.ir

**Source:** https://api.sms.ir/swagger/v1/swagger.json

```
Official operations found: 16
Reachable:                 16

Coverage: 100 %
```

Every operation in the live Swagger document is implemented, including both the `GET` and
`POST` forms of the URL send.

---

## MeliPayamak (and the Payamak Panel family)

**Source:** https://docs.melipayamak.com/webservice-rest (22 method pages)

```
Official REST operations found: 21
Reachable:                      21

Coverage (REST): 100 %
```

`SendSMS`, `SendMultipleSMS`, `SendOTP`, `SendSchedule`, `GetSchedule`, `BaseServiceNumber`,
`BaseServiceNumberSchedule`, `GetDeliveries`, `GetNewDeliveries`, `GetDeliveries2`,
`GetMessages`, `GetInboxCount`, `GetCredit`, `GetCredit2`, `GetUserNumbers`, `GetSmsPrice`,
`GetBasePrice`, plus the four `SmartSMS` methods.

### SOAP surface — not implemented

MeliPayamak also publishes eight SOAP services. Their method inventory is documented in
`providers/melipayamak.md`, and several capabilities exist **only** there:

| Service    | Methods | Capabilities available only via SOAP                      |
| ---------- | ------: | --------------------------------------------------------- |
| `send`     |      11 | `SendWithDomain`, multi-delivery                          |
| `receive`  |       5 | date-ranged inbox, delete received messages               |
| `Voice`    |       3 | SMS + spoken message                                      |
| `Schedule` |       5 | **cancel a scheduled send**, recurring "usance" schedules |
| `contacts` |       8 | contacts and groups                                       |
| `Actions`  |      15 | branches, campaign bulk                                   |
| `Tickets`  |       6 | support tickets                                           |
| `users`    |      18 | sub-user management, credit transfer, `HasFilter`         |

**Reason not implemented:** a SOAP client is a substantial dependency (XML parsing, WSDL
handling, envelope construction) for a package that otherwise has **zero runtime
dependencies** and is meant to run in Workers as well as Node. Adding it for one provider's
secondary transport is a poor trade. The methods, their WSDL URLs and their parameters are
documented so that anyone who needs them can call them with a SOAP library directly.

This is the single largest gap in the package, and it is listed here rather than glossed over.

---

## Mediana (and the IPPanel `rest/v1` family)

**Source:** the official Go SDK, `github.com/medianasms/go-rest-sdk`

```
Official operations found: 7
Reachable:                 7

Coverage: 100 %
```

`POST /messages`, `GET /messages/{bulk_id}`, `GET /messages/{bulk_id}/recipients`,
`GET /messages/inbox`, `POST /messages/patterns`, `POST /messages/patterns/send`,
`GET /credit`.

This generation is small. Absences (scheduling, contacts, webhooks, voice) are absences in
the API, not in this package.

---

## AmootSMS

**Sources:** https://hub.amootsoft.com/Payamak/docs/ (32 pages) and
https://portal.amootsms.com/rest (the platform's own action index, 50 signatures)

```
Official operations found: 50
Reachable:                 50

Coverage: 100 %
```

18 of the 50 have **no documentation page** and were implemented from their published C#
signatures alone: `GetDelivery`, `GetDeliveries`, `GetDeliveriesByCampaignID`,
`CalculateMessagePrice`, `GetBankTree`, `SendWithBackupLine`, `ContactListUpdates`,
`ContactSearch`, `ContactAutoSendCreate`, `ContactAutoSendEdit`, `PatternCodeList`,
`PatternCodeCreate`, `Statistics`, `SignUp`, `IsBlackList_ByCancelation`,
`LBSGetDeviceTypes`, `LBSGetDeviceBrands`, `LBSGetProvinces`.

Because their **response** shapes are unpublished, they are exposed on the native surface
only and are not mapped onto normalized result types — the raw body is returned. Two
capabilities are declared `false` for exactly this reason (`patternManagement`), rather than
mapping guessed field names.

---

## Mizban SMS

**Source:** https://services.mizbansms.com/swagger/v1/swagger.json

```
Official operations found: 226
Typed methods:              12
Reachable:                 226 (via `native.raw()`)

Coverage: 100 % reachable, 5 % typed
```

The Swagger document exposes the entire panel backend — payments and gateway callbacks,
packages, scoring and gifts, news, tickets, domains, SMS-number sales, job banks, surveys,
appointment and warranty messages, and full user administration — most of it behind the panel
bearer token rather than the customer credentials.

The 12 customer-facing `/api/Customer/*` operations are typed and mapped. The rest are
reachable through `provider.native.raw(path, body)` but are not individually typed, because
the document declares almost **no response schemas**; typing them would mean inventing field
names.

**Not implemented as a capability:** pattern/template sending. Mizban publishes no
customer-facing template endpoint — see `providers/mizbansms.md` for the full search of all
226 paths.

---

## Providers reached through a shared platform adapter

These run another vendor's panel software (see `provider-relations.md`). Coverage is the
platform's coverage:

| Provider                                                                                                            | Platform          | Operations |
| ------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------: |
| `farapayamak`, `shahvarpayam`, `radinpayamak`, `saharsms`, `icosms`, `takiran`, `pishgamsms`, `afrasms`, `ganjesms` | `payamak-panel`   |         21 |
| `tabansms`, `smsaram`, `yekpayamak`                                                                                 | `ippanel-rest-v1` |          7 |

For the seven marked ⚠️ in `provider-matrix.md`, the platform mapping is **inferred**. Coverage
is therefore "100 % of the platform this package believes they run" — which is not the same
as "100 % of what that provider actually offers". If a reseller has bolted extra endpoints
onto the platform, this package does not know about them.

---

## What "not implemented" never means here

It never means a method was stubbed, faked, or silently degraded. There are no
`throw new Error('TODO')` placeholders in this package. Anything a provider cannot do raises
`SMSUnsupportedFeatureError` with the capability name, and anything this package has chosen
not to implement is listed above with its reason.

**Last audited:** 2026-08-16
