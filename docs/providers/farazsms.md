# FarazSMS / IranPayamak

**Provider:** FarazSMS (فراز اس ام اس) — also branded **IranPayamak** (ایران پیامک)
**Official website:** https://farazsms.com and https://iranpayamak.com (same platform, see `docs/provider-relations.md`)
**Documentation URL:** https://docs.farazsms.com
**Machine-readable sources (official):**

- OpenAPI 3.0.1: https://docs.farazsms.com/download/openapi.json — `FarazSMS Public APIs v1.0.0`, 55 paths
- Postman collection: https://docs.farazsms.com/download/postman.json
- LLM digests: https://docs.farazsms.com/llms.txt, https://docs.farazsms.com/llms-full.txt
- Apidog rendering: https://api.farazsms.com

**API base URL:** `https://api.iranpayamak.com` (the sole `servers` entry in the official OpenAPI document — note the base URL is the _IranPayamak_ host even for FarazSMS-branded accounts)

**Current API version:** `ws/v1` (paths are prefixed `/ws/v1/…`, with three exceptions listed below)

**Legacy APIs:** Older FarazSMS integrations (and several third-party PHP/WordPress plugins still in circulation) target IPPanel-style endpoints under `sms.farazsms.com` / `rest.ippanel.com`. Those are **not** part of the current official documentation and are **not implemented**. See `docs/provider-relations.md` for the IPPanel↔FarazSMS history.

---

## Authentication

```
Api-Key: <YOUR_KEY>
```

- Header name is **case-sensitive** per the official `llms.txt`.
- The key is generated in the panel; no login or token exchange is required for web-service calls.
- The OpenAPI document also declares a `bearer` scheme, but **no operation references it** — every operation that declares security uses `apikey-header-Api-Key`. The panel-login endpoints (`/ws/v1/auth/*`) exist for building your own panel UI and are not needed for API use.
- Four operations declare `security: []` in the spec (`/ws/v1/sms/calculate-cost`, `/ws/v1/sms/voice/upload-file`, `/ws/v1/sms/postal/get-genders`, `/ws/v1/sms/postal/get-receiver-count`, `/ws/v1/number_bank`). This is almost certainly a spec-authoring omission rather than genuinely public endpoints; this package sends the `Api-Key` header on **every** request.

---

## Capabilities

| Capability                     | Supported | Notes                                                                            |
| ------------------------------ | --------- | -------------------------------------------------------------------------------- |
| Pattern / OTP send             | Yes       | `POST /ws/v1/sms/pattern` — instant, never queued                                |
| Simple / bulk send             | Yes       | `POST /ws/v1/sms/simple` (recipients and/or phonebooks)                          |
| Bulk from Excel                | Yes       | `POST /ws/v1/sms/simple-file`                                                    |
| Personalised bulk (`%vars%`)   | Yes       | `POST /ws/v1/sms/keywords`, `POST /v1/send/keyword-file`                         |
| Peer-to-peer                   | Yes       | `POST /ws/v1/send/peer-to-peer`, `…/peer-to-peer-file`                           |
| Number-bank targeting          | Yes       | `POST /ws/v1/sms/bank`                                                           |
| Postal-code targeting          | Yes       | cost + receiver-count endpoints; the send itself goes through the bank/LBS flows |
| LBS (location-based) campaigns | Yes       | create/list/show/edit/cancel — **unique to this provider**                       |
| Voice message                  | Yes       | upload file → send by `file_id`                                                  |
| Scheduled send                 | Yes       | `schedule` field; ISO-8601 or `YYYY-MM-DD HH:MM:SS`                              |
| Cancel scheduled               | Partial   | only LBS campaigns have a documented cancel endpoint                             |
| Delivery reports               | Yes       | `send_request` + `send_request/{id}/items`                                       |
| Inbox                          | Yes       | `GET /ws/v1/inbox`                                                               |
| Pattern CRUD                   | Partial   | create / list / get / edit — **no delete endpoint documented**                   |
| Phonebook + contacts           | Yes       | full CRUD incl. custom attributes and Excel import                               |
| Balance / profile              | Yes       | `GET /ws/v1/account/balance`, `/ws/v1/account/profile`                           |
| Wallet / orders                | Yes       | charge, pay, cancel, apply discount                                              |
| Sender lines                   | Yes       | `GET /ws/v1/lines/accessible`                                                    |
| Tickets                        | Yes       | create / list / show / reply / close / download attachment                       |
| Sub-account registration       | Yes       | `POST /ws/v1/account/register` (reseller)                                        |
| Webhooks                       | Unknown   | Not present in the OpenAPI document                                              |
| Blacklist management           | No        | Blacklist appears only as a per-recipient _status_ value                         |
| International SMS              | Unknown   | Not documented; recipients are Iranian local format                              |

---

## Endpoints

All relative to `https://api.iranpayamak.com`.

### Send

| Method | Path                                      | Purpose                                                                 |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/ws/v1/sms/pattern`                      | Pattern / OTP send                                                      |
| POST   | `/ws/v1/sms/simple`                       | Fixed text to recipients and/or phonebooks                              |
| POST   | `/ws/v1/sms/simple-file`                  | Fixed text, recipients from Excel/CSV (multipart)                       |
| POST   | `/ws/v1/sms/keywords`                     | Personalised bulk with `%var%` placeholders                             |
| POST   | `/v1/send/keyword-file`                   | Same, data from Excel/CSV (multipart) — **note: `/v1/`, not `/ws/v1/`** |
| POST   | `/ws/v1/send/peer-to-peer`                | Distinct text per peer group (multipart)                                |
| POST   | `/ws/v1/send/peer-to-peer-file`           | Same, from Excel/CSV (multipart)                                        |
| POST   | `/ws/v1/sms/bank`                         | Send to number bank slices                                              |
| POST   | `/ws/v1/sms/sample`                       | Send a sample to the account owner only                                 |
| POST   | `/ws/v1/sms/calculate-cost`               | Cost estimate for a postal-code campaign                                |
| POST   | `/ws/v1/sms/voice/upload-file`            | Upload voice file → `file_id`                                           |
| POST   | `/ws/v1/sms/voice/send`                   | Send voice message by `file_id`                                         |
| GET    | `/ws/v1/sms/voice/download-file?file_id=` | Re-download an uploaded voice file                                      |

### LBS (location-based campaigns)

| Method | Path                        |
| ------ | --------------------------- |
| POST   | `/ws/v1/lbs`                |
| GET    | `/ws/v1/lbs`                |
| GET    | `/ws/v1/lbs/{lbsId}`        |
| PUT    | `/ws/v1/lbs/{lbsId}`        |
| PATCH  | `/ws/v1/lbs/{lbsId}/cancel` |

### Patterns

| Method | Path                     |
| ------ | ------------------------ |
| POST   | `/ws/v1/patterns`        |
| GET    | `/ws/v1/patterns`        |
| GET    | `/ws/v1/patterns/{code}` |
| PUT    | `/ws/v1/patterns/{code}` |

### Reports & inbox

| Method | Path                                          |
| ------ | --------------------------------------------- |
| GET    | `/ws/v1/send_request`                         |
| GET    | `/ws/v1/send_request/{send_request_id}`       |
| GET    | `/ws/v1/send_request/{send_request_id}/items` |
| GET    | `/ws/v1/inbox`                                |

### Phonebook

| Method     | Path                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| POST / GET | `/ws/v1/phone_book`                                                         |
| PUT        | `/ws/v1/phone_book/{id}`                                                    |
| POST / GET | `/ws/v1/phone_book_attribute`                                               |
| POST / GET | `/ws/v1/phone_book_data`                                                    |
| POST       | `/ws/v1/phone_book_data/bulk-upsert` (max 500 per request)                  |
| POST       | `/ws/v1/phone_book_data/excel-upsert` (no limit)                            |
| DELETE     | `/ws/v1/phone_book_data/{id}`                                               |
| GET        | `/example/phone-book/{phone_book}/data.xlsx` — **note: no `/ws/v1` prefix** |

### Account, wallet, orders, lines

| Method | Path                           |
| ------ | ------------------------------ |
| GET    | `/ws/v1/account/balance`       |
| GET    | `/ws/v1/account/profile`       |
| POST   | `/ws/v1/account/register`      |
| POST   | `/ws/v1/account/update`        |
| POST   | `/ws/v1/account/wallet/charge` |
| GET    | `/ws/v1/lines/accessible`      |
| POST   | `/ws/v1/orders/pay`            |
| POST   | `/ws/v1/orders/cancel`         |
| POST   | `/ws/v1/orders/apply-discount` |

### Tickets

| Method     | Path                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| POST / GET | `/ws/v1/ticket`                                                        |
| GET        | `/ws/v1/ticket/{id}`                                                   |
| POST       | `/ws/v1/ticket/replay` _(sic — the API really does spell it "replay")_ |
| POST       | `/ws/v1/ticket/closed`                                                 |
| GET        | `/ws/v1/ticket/file/download`                                          |

### Reference data

| Method | Path                                            |
| ------ | ----------------------------------------------- |
| GET    | `/provinces` — **no `/ws/v1` prefix**           |
| GET    | `/cities?province_id=` — **no `/ws/v1` prefix** |
| GET    | `/ws/v1/number_bank?province_id=&city_id=`      |
| GET    | `/ws/v1/sms/postal/get-available-lines`         |
| GET    | `/ws/v1/sms/postal/get-genders`                 |
| GET    | `/ws/v1/sms/postal/get-receiver-count`          |

### Panel auth (not needed for API use)

`POST /ws/v1/auth/login`, `POST /ws/v1/auth/logout`, `POST /ws/v1/auth/register`, `GET /ws/v1/auth/show_register_form`, `POST /ws/v1/auth/verify-2fa`

---

## Request schemas

Pattern send:

```json
{
  "code": "SJ3FgPrE0C",
  "attributes": { "var1": "1", "var2": "2" },
  "recipient": "09120000000",
  "line_number": "50002178584000",
  "number_format": "english",
  "schedule": null
}
```

Simple send:

```json
{
  "text": "test message",
  "recipients": ["09120000000"],
  "selectedPhoneBooks": [{ "id": 1, "offset": 0, "limit": 10 }],
  "line_number": "98123123",
  "number_format": "english",
  "schedule": "2026-03-20T10:00:00Z"
}
```

Keyword (personalised) send — variables are `%name%` in `text` and flat keys per recipient:

```json
{
  "text": "test %var1% text",
  "line_number": "50002178584000",
  "recipients": [
    { "mobile": "09120000000", "var1": "value1" },
    { "mobile": "09130000000", "var1": "value2" }
  ],
  "number_format": "english"
}
```

Create pattern:

```json
{
  "text": "test text %var%, %var2%",
  "description": "…",
  "share": 1,
  "website": "example.com",
  "category": 1,
  "vars": [{ "var": "var", "length": 12, "type": "int" }]
}
```

`category`: `1` = OTP, `2` = club, `3` = order, `255` = other. `vars[].type`: `int` | `str` | `date`.

## Response schemas

Uniform envelope:

```json
{ "status": "success" | "error", "data": <any>, "message": <any> }
```

> ⚠️ Real inconsistency in the official spec: successful responses declare the third key as **`messages`** (plural) while error responses declare **`message`** (singular). `llms.txt` documents it as `message`. This package reads **both** keys and normalises to one.

Send endpoints return `data` = the numeric **send-request id** (`/ws/v1/send/peer-to-peer*` return an **array** of ids, one per peer). Paginated endpoints return `data` = `{currentPage, totalPages, totalItems, itemsPerPage, items[]}`.

Balance:

```json
{
  "status": "success",
  "message": null,
  "data": {
    "balanceAmount": 5000,
    "balanceCount": 25,
    "details": [{ "count": 25, "rate": 200, "amount": 5000 }]
  }
}
```

## Errors

`status: "error"` with an HTTP status code. Documented explicitly: `401` → `{"status":"error","data":null,"message":"Unauthorized"}`. The official `llms.txt` states plainly: _"Check `status`, not just the HTTP code."_ — so this package treats `status !== "success"` as an error even on HTTP 2xx.

No numeric provider error-code table is published.

### Delivery status values (`send_request/{id}/items?status=`)

`not-started` · `in-queue` · `sent` · `send-failure` · `delivered` · `delivery-failure` · `delivery-undetermined` · `system-error` · `blacklist` _(the spec's description string is truncated at `bla`; the value is inferred from context and is treated as a pass-through string rather than a validated enum)_

### Send-request status values (`send_request?status=`)

`init` · `pending-approval` · `insufficient-balance` · `cancelled` · `rejected` · `in-queue` · `sent`

### Ticket status values

`pending` · `referred` · `closed` · `asked` · `answered`

## Rate limits

Not documented.

## Callbacks / webhooks

**Not publicly documented.** The OpenAPI document contains no webhook, callback or delivery-push endpoint. Two-way messaging is done by polling `GET /ws/v1/inbox`.

## Pattern / template implementation

- Called **pattern**; identified by a string `code` (pattern UID) obtained from the panel or `GET /ws/v1/patterns`.
- Placeholders are `%name%` in the pattern text.
- At send time, values go in **`attributes`**, an object keyed by variable name: `{"code": "1234"}`.
- Variables are declared at creation in **`vars`** (`{var, length, type}`) but read back in `GET /ws/v1/patterns/{code}` as **`attributes`** (`{name, length, type}`) — the two shapes are not symmetric.
- Patterns require approval; status is one of `pending` | `rejected` | `active`.
- Pattern send takes **exactly one** `recipient` (singular field, a string).
- `schedule` on pattern send is annotated _"Maybe it must be null for patterns"_ in the official spec — genuinely uncertain, so this package passes it through only when the caller sets it explicitly and documents the caveat.

## Blacklist behavior

No management API. Blacklist appears only as a per-recipient delivery status in `send_request/{id}/items`.

## Bulk messaging

`simple` (recipients + phonebook slices), `simple-file`, `keywords`, `keyword-file`, `peer-to-peer`, `peer-to-peer-file`, `bank`. Phonebook slices are `{id, offset, limit}`, number-bank slices are `{bank_id, offset, limit}`.

## Scheduled messaging

`schedule` (or `numberFormat`-style camelCase `schedule` on the multipart endpoints). Both ISO-8601 with `Z` (`2026-03-20T10:00:00Z`) and `YYYY-MM-DD HH:MM:SS` appear in official examples. **No timezone is documented.** This package serialises `Date` objects to ISO-8601 UTC, which matches the majority of the official examples, and lets callers pass a raw string to override.

## Reports

`send_request` (list, filter by `status`/`line_id`/`search`), `send_request/{id}` (detail), `send_request/{id}/items` (per-recipient delivery). All paginated with `page`/`limit`.

## Credits / account APIs

`GET /ws/v1/account/balance` → `balanceAmount` (Toman), `balanceCount` (message count), and a `details[]` breakdown per rate.
`GET /ws/v1/account/profile` → `displayName`, `mobile`, `verified`, `blocked`, `plan{id,title,expiryDate}`, `permissions` (hex bitmask string).

## Contact / group APIs

Phonebooks with typed custom attributes (`date` | `number` | `string`). Contacts carry `prefix` (`man` | `woman` | `co` | `org`), `mobile`, `name` and `attributes[] {attribute_id, value}`. Bulk upsert caps at 500 per request; Excel upsert is unlimited.

## Provider-specific features

- **LBS campaigns** — target people physically inside a lat/long radius during a time window, filtered by dwell event (`ورود` enter / `حضور` present / `خروج` exit), gender, age range and device OS. No other provider in this package offers this.
- **Number banks** — purchasable/segmented number lists, browsable by province and city.
- **Voice messages** — upload an audio file once, then send it to recipients or whole phonebooks.
- **Wallet & order lifecycle** — charge, apply discount, pay (wallet / gateway / split), cancel.
- **Sample send** — send to the account owner only, to preview a campaign for free.

## Limitations

- No pattern **delete** endpoint.
- No documented webhooks; two-way messaging requires polling.
- `schedule` semantics on pattern send are ambiguous in the official spec.
- LBS, number-bank and postal-code products must be enabled on the account.
- Three endpoints break the `/ws/v1` prefix convention (`/v1/send/keyword-file`, `/provinces`, `/cities`, `/example/phone-book/{id}/data.xlsx`).

## Official SDKs

| Language | Package                                     |
| -------- | ------------------------------------------- |
| Node.js  | `npm install farazsms`                      |
| Python   | `pip install farazsms`                      |
| PHP      | `composer require farazsms/php`             |
| Laravel  | `composer require farazsms/laravel`         |
| Symfony  | `composer require farazsms/symfony-bundle`  |
| .NET     | `dotnet add package FarazSMS`               |
| Go       | `go get github.com/ghaffari273/farazsms-go` |

## Research notes

- Everything above is derived from the provider's **own OpenAPI 3.0.1 document** (`docs.farazsms.com/download/openapi.json`, 205 KB, 55 paths), cross-checked against `llms.txt`/`llms-full.txt` from the same host. This is the strongest source available for any provider in this package.
- The spec is authored in Apidog; a few artefacts leak through: `GET /ws/v1/patterns` and `GET /ws/v1/patterns/{code}` carry a `requestBody` (GET requests do not have bodies). The body attached to `GET /ws/v1/patterns` contains `search`, `staus` _(sic)_, `share`, `sort_by`, `sort_type` — these are the **list filters** and are sent as **query parameters** by this package. Documented as a discrepancy rather than followed literally.
- `number_format` is declared `enum(en|fa)` on some operations and `enum(english|persian)` on others, while every official example sends `"english"`. This package accepts a friendly `'en' | 'fa' | 'english' | 'persian'` input and emits the long form (`english`/`persian`) that the examples use.
- Default sender line documented in `llms.txt`: `90008361`.
- Recipient format is the **Iranian local format** `09120000000` — explicitly _not_ `+98`. This differs from IPPanel (E.164) and is handled by a provider-specific formatter.
- FarazSMS and IranPayamak serve byte-identical marketing sites and share one API host. Relationship analysed in `docs/provider-relations.md`.

**Last verified:** 2026-08-16
