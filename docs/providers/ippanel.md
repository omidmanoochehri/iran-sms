# IPPanel

**Provider:** IPPanel (آی‌پی‌پنل)
**Official website:** https://ippanel.com
**Documentation URL:**

- Current (Edge API): https://docs.ippanel.com/ — canonical source is the public Docusaurus repo https://github.com/ippanelcom/Edge-Document (mirrored at https://ippanelcom.github.io/Edge-Document/)
- Legacy REST v2 SDKs: https://github.com/ippanel/go-rest-sdk, https://github.com/ippanel/php-rest-sdk, https://github.com/ippanel/python-rest-sdk

**API base URL:**

- Edge API (current): `https://edge.ippanel.com/v1`
- Legacy REST v2 (SDK "2.0.0"): `https://api2.ippanel.com/api/v1`
- Legacy REST v1: `http://rest.ippanel.com/v1`

**Current API version:** Edge API v1 (`https://edge.ippanel.com/v1`)

**Legacy APIs:**

- `api2.ippanel.com/api/v1` — the generation targeted by the official Go/PHP/Python `*-rest-sdk` repos. Endpoints differ from Edge (`/sms/send/webservice/single`, `/sms/pattern/normal/send`, `/sms/pattern/normal/store`, `/sms/message/all`, `/sms/message/show-recipient/message-id/{id}`, `/inbox`, `/sms/accounting/credit/show`). Implemented in this package under `provider.legacy.*`.
- `rest.ippanel.com/v1` — first-generation REST endpoint referenced by older SDK releases. **Not implemented** (superseded; no current official documentation).

---

## Authentication

Single header on every request:

```
Authorization: <API key or token>
```

Note: **no `Bearer` prefix.** The docs' own curl samples send the raw key.

Two credential kinds are accepted by the same header:

| Kind        | Source                                     | Expiry        | Notes                                                           |
| ----------- | ------------------------------------------ | ------------- | --------------------------------------------------------------- |
| **API key** | User panel → Developers → Access Keys      | Never expires | Cannot call sensitive endpoints (password change, key creation) |
| **Token**   | `POST /api/acl/auth/login` (+ OTP confirm) | 10 hours      | Full access. Length 30–255 chars                                |

Reseller-only login flow: `login` → (`send_sms_otp`) → `confirm_otp` → token. `method` in the login response is `"login"` (done), `"sms"` (OTP by SMS) or `"ga"` (Google Authenticator).

The legacy `api2` API uses a **different** header — `Apikey: <apikey>` (verified in `request.go` of the official Go SDK, which also sets `User-Agent: Ippanel/ApiClient/<ver> Go/<gover>`).

---

## Capabilities

| Capability                                     | Supported | Notes                                                                                                                                                                                |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Single / multi-recipient send                  | Yes       | `sending_type: "webservice"`                                                                                                                                                         |
| Peer-to-peer (different message per recipient) | Yes       | `sending_type: "peer_to_peer"` and `peer_to_peer_file`                                                                                                                               |
| Bulk by file                                   | Yes       | `sending_type: "file"` (CSV/XLSX)                                                                                                                                                    |
| Pattern / template send                        | Yes       | `sending_type: "pattern"`, single recipient only                                                                                                                                     |
| Pattern CRUD                                   | Yes       | create / list / get / update / delete                                                                                                                                                |
| Scheduled send                                 | Yes       | `send_time` — `YYYY-MM-DD HH:MM:SS`, **UTC**                                                                                                                                         |
| Cancel scheduled                               | Yes       | ≥ 5 minutes before send time                                                                                                                                                         |
| Delivery reports                               | Yes       | per-bulk stats and per-recipient status                                                                                                                                              |
| Inbox / received SMS                           | Yes       | `POST /api/report/messages-inbox`                                                                                                                                                    |
| Contacts / phonebooks                          | Yes       | full CRUD incl. custom option fields, import/export                                                                                                                                  |
| Blacklist                                      | Partial   | exposed as read-only flags on a phonebook contact (`is_send_blacklist`, `is_receive_blacklist`) and as `bank: "white"` targeting; **no blacklist add/remove endpoint is documented** |
| Voice OTP                                      | Yes       | `sending_type: "votp"`                                                                                                                                                               |
| Price calculation                              | Yes       | `POST /api/send/calculate-price`                                                                                                                                                     |
| Credit / balance                               | Yes       | `GET /api/payment/credit/mine`                                                                                                                                                       |
| Sender numbers / lines                         | Yes       | list, assign, unassign                                                                                                                                                               |
| Sub-user / reseller management                 | Yes       | create/update/show/list users, packages, tariffs, documents                                                                                                                          |
| Tickets                                        | Yes       | create / list / show / reply                                                                                                                                                         |
| Drafts ("default messages")                    | Yes       | groups + drafts CRUD                                                                                                                                                                 |
| Geo / postal-code / job targeted bulk          | Yes       | province/county/city, postal code, job category                                                                                                                                      |
| Webhooks                                       | Unknown   | Not documented in the Edge API docs                                                                                                                                                  |
| International SMS                              | Unknown   | Not documented; recipients are E.164 but only Iranian examples appear                                                                                                                |

---

## Endpoints (Edge API)

All paths are relative to `https://edge.ippanel.com/v1`.

### Authentication

| Method | Path                                     | Purpose                                   |
| ------ | ---------------------------------------- | ----------------------------------------- |
| POST   | `/api/acl/auth/login`                    | Username/password login                   |
| POST   | `/api/acl/auth/send_sms_otp`             | Request SMS OTP for login                 |
| POST   | `/api/acl/auth/confirm_otp`              | Exchange temp token + OTP for final token |
| POST   | `/api/acl/auth/forgot_password`          | Request password-reset OTP                |
| POST   | `/api/acl/auth/change_password_by_token` | Reset password with token + OTP           |
| POST   | `/api/acl/auth/logout`                   | Invalidate token                          |
| POST   | `/api/acl/auth/check_token`              | Validate token, return user info          |

### Send — all use `POST /api/send`, discriminated by `sending_type`

| `sending_type`             | Content-Type | Key fields                                                                                                                                                       |
| -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webservice`               | json         | `from_number`, `message`, `params.recipients[]`, `send_time?`                                                                                                    |
| `peer_to_peer`             | json         | `from_number`, `params[] {recipients[], message}`, `send_time?`                                                                                                  |
| `peer_to_peer_file`        | multipart    | `from_number`, `files[]`, `send_time?`                                                                                                                           |
| `pattern`                  | json         | `from_number`, `code`, `recipients[]` (exactly 1), `params{}`, `phonebook?`                                                                                      |
| `file`                     | multipart    | `from_number`, `message`, `files[]`, `send_time?`, `other_recipients[]?`                                                                                         |
| `keyword`                  | multipart    | `from_number`, `message` with `{ex_*}` placeholders, `files[]`, `send_time?`                                                                                     |
| `keyword_phonebook`        | json         | `from_number`, `message`, `params[] {phonebook_id}`, `send_time?`                                                                                                |
| `phonebook`                | json         | `from_number`, `message`, `params[] {phonebook_id, type: all\|detail, start?, size?, number_ids[]?}`                                                             |
| `postal_code`              | json         | `from_number`, `message`, `params[] {bank, postal_code, gender, age_from, age_to, mci{}, irancell{}, other{}}`, `other_recipients[]?`, `send_time?`              |
| `country`                  | json         | `from_number`, `message`, `params[] {bank, pre, province_id, county_id?, city_id?, gender, age_from, age_to, mci{}, irancell{}, other{}}`, `other_recipients[]?` |
| `geolocation` (Country V2) | json         | `from_number`, `message`, `params[] {province_id?, county_id?, city_id?, pre?, gender?, from_age?, to_age?, operator[] {start,size,id}}`, `other_recipients[]?`  |
| `job`                      | json         | `from_number`, `message`, `params[] {main_category_id, sub_category_id?, operator[] {start,size,id}}`                                                            |
| `votp`                     | json         | `message` (the OTP digits), `params.recipients[]` (exactly 1)                                                                                                    |

Other send-related endpoints:

| Method | Path                                              | Purpose                                                                                                                                                      |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/send/webservice`                            | "URL SMS" — send via query string; accepts `apikey` **or** `username`+`password`, plus `from`/`to`/`message`. Many alias key names are accepted (see below). |
| POST   | `/api/send/cancel`                                | Cancel scheduled bulk (`message_outbox_id`)                                                                                                                  |
| POST   | `/api/send/calculate-price`                       | `{number, message}` → `{mci_price, other_price, parts}`                                                                                                      |
| GET    | `/api/send/banks/provinces`                       | Province list                                                                                                                                                |
| GET    | `/api/send/banks/counties?province_id=`           | County list                                                                                                                                                  |
| GET    | `/api/send/banks/cities?county_id=`               | City list                                                                                                                                                    |
| GET    | `/api/send/banks/genders`                         | Gender list                                                                                                                                                  |
| GET    | `/v2/api/send/banks/provinces`                    | V2 province list                                                                                                                                             |
| GET    | `/v2/api/send/banks/counties?province_id=`        | V2 county list                                                                                                                                               |
| GET    | `/v2/api/send/banks/cities?county_id=`            | V2 city list                                                                                                                                                 |
| GET    | `/v2/api/send/banks/counts`                       | Recipient count for geo filters                                                                                                                              |
| GET    | `/api/send/jobs/categories`                       | Job categories                                                                                                                                               |
| GET    | `/api/send/jobs/sub-categories?main_category_id=` | Job sub-categories                                                                                                                                           |
| GET    | `/api/send/jobs/number-count?main_category_id=`   | Recipient count for job filters                                                                                                                              |

### Reports

| Method | Path                                              | Purpose                                                     |
| ------ | ------------------------------------------------- | ----------------------------------------------------------- |
| POST   | `/api/report/new_list`                            | Outbox list; body `{page, limit, filters{}}`                |
| GET    | `/api/report/by_bulk?messages_outbox_id=`         | Single bulk detail                                          |
| GET    | `/api/report/bulk_stats?bulk_id=`                 | Per-operator sent/delivered/failed/pending/blacklist counts |
| GET    | `/api/report/recipients?bulk_id=&page=&per_page=` | Per-recipient delivery status                               |
| POST   | `/api/report/messages-inbox`                      | Inbox; body `{page, per_page, filters{from_id}}`            |

### Patterns

| Method | Path                                  | Purpose                                                                                              |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| POST   | `/api/patterns/normal`                | Create pattern                                                                                       |
| GET    | `/api/patterns`                       | List patterns (`filter[code]`, `filter[title]`, `filter[is_share]`, `filter[state]`, `filter[type]`) |
| GET    | `/api/patterns/{pattern_code}`        | Get pattern by code                                                                                  |
| PUT    | `/api/patterns/normal/{pattern_code}` | Update pattern                                                                                       |
| DELETE | `/api/patterns/normal/{pattern_code}` | Delete pattern                                                                                       |

### Numbers (lines)

| Method | Path                                  | Purpose                      |
| ------ | ------------------------------------- | ---------------------------- |
| GET    | `/api/number/numbers?page=&per_page=` | List lines                   |
| POST   | `/api/numbers/assign`                 | Assign line to a sub-user    |
| POST   | `/api/numbers/unassign`               | Reclaim line from a sub-user |

Note the inconsistent path segment: **list** uses `/api/number/numbers` (singular `number`), **assign/unassign** use `/api/numbers/...` (plural). This is verbatim from the docs.

### Payment

| Method | Path                       | Purpose                                          |
| ------ | -------------------------- | ------------------------------------------------ |
| GET    | `/api/payment/credit/mine` | Current credit, yesterday's credit, gift balance |

### Phonebooks

| Method | Path                                               | Purpose                                |
| ------ | -------------------------------------------------- | -------------------------------------- |
| GET    | `/api/phonebooks/list-new`                         | List phonebooks                        |
| POST   | `/api/phonebooks`                                  | Create phonebook                       |
| PUT    | `/api/phonebooks/{phonebook_id}`                   | Update phonebook                       |
| POST   | `/api/phonebooks/delete-list`                      | Delete phonebooks (`listPhonebooks[]`) |
| GET    | `/api/phonebooks/{phonebook_id}/export`            | Export members                         |
| POST   | `/api/phonebooks/{phonebook_id}/import`            | Import members (multipart, XLSX)       |
| GET    | `/api/phonebooks/{phonebook_id}/import/get-sample` | Import template                        |

### Phonebook contacts

| Method | Path                                                | Purpose                                    |
| ------ | --------------------------------------------------- | ------------------------------------------ |
| GET    | `/api/phonebooks/numbers/contact-list`              | List contacts                              |
| GET    | `/api/phonebooks/numbers/contact-list/{contact_id}` | Get contact (incl. blacklist flags + tags) |
| POST   | `/api/phonebooks/numbers/add-list-new`              | Bulk add contacts                          |
| PUT    | `/api/phonebooks/numbers/update-new/{contact_id}`   | Update contact                             |
| POST   | `/api/phonebooks/numbers/delete-list`               | Delete contacts (`listNumbers[]`)          |
| GET    | `/api/phonebooks/numbers/contact-list/export`       | Export contacts                            |

### Phonebook custom fields ("options")

| Method | Path                                  | Purpose                                         |
| ------ | ------------------------------------- | ----------------------------------------------- |
| GET    | `/api/phonebooks/options/list-new`    | List options                                    |
| POST   | `/api/phonebooks/options`             | Create option (`type`: `int`\|`string`\|`date`) |
| PUT    | `/api/phonebooks/options/{option_id}` | Update option                                   |
| POST   | `/api/phonebooks/options/delete-list` | Delete options (`listOptions[]`)                |

### Drafts (a.k.a. "default messages")

| Method | Path                                   | Purpose                                      |
| ------ | -------------------------------------- | -------------------------------------------- |
| POST   | `/api/user/draft/group`                | Create draft group (max 20)                  |
| GET    | `/api/user/draft/group/list`           | List draft groups                            |
| PUT    | `/api/user/draft/group`                | Update draft group                           |
| POST   | `/api/user/draft/group/delete`         | Delete draft group                           |
| POST   | `/api/user/draft`                      | Create draft (max 200; message ≤ 1400 chars) |
| GET    | `/api/user/draft/list?draft_group_id=` | List drafts                                  |
| PUT    | `/api/user/draft`                      | Update draft                                 |
| POST   | `/api/user/draft/delete`               | Delete drafts (`draft_ids[]`)                |

### Users (reseller)

| Method | Path                              | Purpose                          |
| ------ | --------------------------------- | -------------------------------- |
| POST   | `/api/user/check_exist`           | Username availability            |
| POST   | `/api/user/create`                | Register sub-user                |
| POST   | `/api/user/update`                | Update user                      |
| GET    | `/api/user/show?user_id=`         | User detail                      |
| GET    | `/api/user/list`                  | List sub-users (many filters)    |
| GET    | `/api/user/parents_tree?user_id=` | Reseller hierarchy               |
| GET    | `/api/user/get_tariff`            | Per-operator tariff table        |
| GET    | `/api/user/documents`             | List required/uploaded documents |
| POST   | `/api/user/documents/upload`      | Upload document (multipart)      |
| POST   | `/api/user/documents/remove`      | Remove document                  |

> ⚠️ Documentation discrepancy: `user/documents/upload` and `user/documents/remove` are labelled `GET` in the heading of their doc pages, but the accompanying curl examples send a JSON/multipart body with no `-X GET`, i.e. **POST**. This package implements them as POST and records the discrepancy here.

### Packages (reseller ACL roles)

| Method | Path                    | Purpose           |
| ------ | ----------------------- | ----------------- |
| GET    | `/api/acl/package/list` | List ACL packages |

### Tickets

| Method | Path                          | Purpose                                    |
| ------ | ----------------------------- | ------------------------------------------ |
| POST   | `/api/ticket`                 | Create ticket (multipart, optional file)   |
| GET    | `/api/ticket`                 | List tickets                               |
| GET    | `/api/ticket/show?ticket_id=` | Ticket detail + interactions               |
| POST   | `/api/ticket/interaction`     | Reply to ticket (multipart, optional file) |

---

## Request schemas

Send (webservice):

```json
{
  "sending_type": "webservice",
  "from_number": "+983000505",
  "message": "متن پیام",
  "params": { "recipients": ["+989120000000", "+989350000000"] },
  "send_time": "2025-03-12 21:20:02"
}
```

Send (pattern):

```json
{
  "sending_type": "pattern",
  "from_number": "+983000505",
  "code": "xxxxxxxxxxxxxxx",
  "recipients": ["+989120000000"],
  "params": { "code": "123456" }
}
```

Create pattern:

```json
{
  "title": "test pattern",
  "description": "…",
  "is_share": false,
  "message": "پترن تستی %var% . کد شما %code%",
  "website": "https://yoursite.com",
  "variable": [
    { "name": "var", "type": "string" },
    { "name": "code", "type": "integer" }
  ]
}
```

## Response schemas

Every Edge response is an envelope:

```json
{ "data": <object|array|null>, "meta": { "status": true, "message": "…", "message_parameters": [], "message_code": "200-1" } }
```

Paginated responses add `current_page`, `from`, `last_page`, `path`, `per_page`, `to`, `total` to `meta`.

Send responses return `{"data": {"message_outbox_ids": [1123594208]}}`. Note it is an **array**, one id per generated bulk — even the single-recipient webservice and pattern sends return an array of length 1.

---

## Errors

Errors keep HTTP semantics _and_ the envelope. `meta.status` is `false`, `meta.message` carries a Persian message, `meta.message_code` a `"<http>-<n>"` string, and `meta.errors` a field→messages map for validation failures.

| HTTP | `message_code` | Meaning                                                                            |
| ---- | -------------- | ---------------------------------------------------------------------------------- |
| 401  | `400-1`        | Invalid or expired token / API key                                                 |
| 409  | `400-1`        | Conflict (e.g. username already registered)                                        |
| 400  | `400-1`        | Business error, message in `meta.message` (e.g. `number already assigned to user`) |
| 422  | `400-2`        | Validation error; per-field messages in `meta.errors`                              |
| 422  | `422-1`        | Login validation error (`errors` at top level, not under `meta`)                   |
| 422  | `400-31`       | `invalid state` (outbox report filter)                                             |
| 404  | `404-1`        | Resource not found (e.g. pattern)                                                  |

> Quirk: the login endpoint returns `errors` as a **top-level** key alongside `meta` rather than inside `meta`. Every other endpoint nests it under `meta.errors`. Handled explicitly in the adapter.

### Message state IDs (`state_id`, outbox report)

`0` creating · `1` created/monitoring queue · `2` sending · `3` rejected by monitoring · `4` invalid recipients · `5` send queue · `6` sent · `7` cancelled · `8` insufficient credit · `9` system error

### Per-recipient delivery status (`message_status`, bulk recipients)

`0` sent to operator · `1` operator received · `2` delivered · `3` not delivered · `4` blacklisted

### Legacy (api2) envelope and error codes

Verified from `request.go` / `errors.go` of the official Go SDK — the legacy envelope is **different from Edge**:

```json
{ "status": "…", "code": 200, "data": {…}, "meta": {"total":0,"limit":0,"page":0,"pages":0,"prev":null,"next":null}, "error_message": "" }
```

Legacy `code` values treated as errors: `403` forbidden, `404` not found, `422` unprocessable entity, `500` internal server error. On error the payload carries `data.error`, which is **either a string or a `{field: [messages]}` map** — the SDK tries the map shape first, then the string shape.

---

## Rate limits

Not documented. The official Go SDK sets a 30-second HTTP client timeout (`httpClientTimeout = 30 * time.Second`), which this package adopts as the IPPanel default.

## Callbacks / webhooks

**Not publicly documented** in the Edge API documentation. No webhook registration, delivery-callback or incoming-message-callback endpoint exists in the docs repo. Not implemented — see `docs/API-COVERAGE.md`.

## Pattern / template implementation

- Patterns are named **pattern** and identified by a `pattern_code` string.
- Variables are delimited by `%` by default (`delimiter` field, configurable at creation) and referenced by **name**: `کد شما %code%`.
- At send time, `params` is an **object keyed by variable name** (no `%`): `{"code": "123456"}`.
- Variable types are `string` or `integer`; the API assigns a `len` per variable.
- New patterns start at `pattern_status: "pending"` and must be approved (`active`) before use; rejected patterns become `inactive` with a `reject_text`/`admin_comment`.
- **Pattern send accepts exactly one recipient.**

## Blacklist behavior

No blacklist management API is documented. Blacklist state surfaces in three read-only places:

1. `GET /api/phonebooks/numbers/contact-list/{id}` → `is_send_blacklist`, `is_receive_blacklist`
2. `GET /api/report/bulk_stats` → `operators_blacklist` counts
3. `GET /api/report/recipients` → `message_status: "4"` (blacklisted)
   Geo/postal-code targeting accepts `bank: "white"` to exclude blacklisted numbers.

## Bulk messaging

Five distinct bulk modes: `peer_to_peer`, `peer_to_peer_file`, `file`, `phonebook`, plus the demographic modes (`postal_code`, `country`/`geolocation`, `job`). The response returns one `message_outbox_id` per generated bulk.

## Scheduled messaging

`send_time` string, format `YYYY-MM-DD HH:MM:SS`, **timezone UTC** (explicitly stated in the docs). Supported by `webservice`, `peer_to_peer`, `peer_to_peer_file`, `file`, `keyword`, `keyword_phonebook`, `postal_code` and `country`. **Not** documented for `pattern` or `votp`.
Cancellation via `POST /api/send/cancel` requires ≥ 5 minutes of lead time.

## Reports

`new_list` (outbox), `by_bulk` (one bulk), `bulk_stats` (aggregate per operator), `recipients` (per-recipient), `messages-inbox` (inbox). Inbox supports incremental polling via `filters.from_id`.

## Credits / account APIs

`GET /api/payment/credit/mine` returns `credit` (float, Rial), `yesterday_credit`, `gift`, `gift_expires_at`, `updated_at`.
`POST /api/acl/auth/check_token` returns `user_name`, `user_id`, `is_reseller`, `send_block`, `document_block`, `name`.
`GET /api/user/get_tariff` returns per-operator Persian/English pricing for MCI and other networks.

## Contact / group APIs

Full CRUD over phonebooks, contacts and custom option fields, plus XLSX import/export and an import template endpoint. Contacts carry `pre`, `name`, `email`, `number` (E.164), free-form `options` keyed by option id, and `tags`.

## Provider-specific features

- **Demographic targeting**: send to every number in a province/county/city, filtered by prefix, gender, birth-year range and per-operator slice (`start`/`size`); same for postal code and job category. Includes count-estimation endpoints so you can size a campaign before paying for it.
- **VOTP** — voice one-time password (the message body is the digits to read out).
- **Keyword sending** — `{ex_<optionId>}` placeholders resolved from an uploaded file or from phonebook custom fields.
- **Drafts** — stored default messages, in groups.
- **Reseller suite** — sub-user CRUD, ACL packages, line assignment, parent tree, tariffs, KYC documents.
- **Ticketing** — full support-ticket API.
- **URL SMS** — a GET endpoint that accepts an unusually large set of alias parameter names (`api_key`/`apikey`/`x-api-key`/`token`/…, `from`/`sender`/`originator`/…, `to`/`recipient`/`destination`/…, `message`/`msg`/`text`/…) for drop-in replacement of other vendors' URL APIs.

## Limitations

- Pattern send is limited to one recipient per call.
- No documented webhook/callback mechanism.
- Blacklist is read-only through the API.
- `is_share` patterns and the reseller endpoints require a reseller contract.
- The demographic "number bank" send types require the corresponding product to be enabled on the account.
- International sending is not documented.

## Official SDKs

| Language | Repo                                       | API generation                     |
| -------- | ------------------------------------------ | ---------------------------------- |
| Go       | https://github.com/ippanel/go-rest-sdk     | `api2.ippanel.com/api/v1` (legacy) |
| PHP      | https://github.com/ippanel/php-rest-sdk    | legacy                             |
| Python   | https://github.com/ippanel/python-rest-sdk | legacy                             |

No official Node.js SDK exists.

## Research notes

- `docs.ippanel.com` is a CNAME for the Docusaurus site built from `ippanelcom/Edge-Document`; the rendered HTML is client-side, so the authoritative text was read from the repo's markdown sources (104 files) rather than the rendered page.
- The official SDKs still target the **older** `api2` API and have not been updated for Edge. The Go SDK's own header comment still points at `http://docs.ippanel.com`. This is a real discrepancy between "official SDK" and "official documentation"; this package implements Edge as the default and exposes the legacy surface under `provider.legacy.*`.
- Legacy endpoint names verified from `message.go` / `credit.go` of the Go SDK: `POST /sms/send/webservice/single`, `POST /sms/pattern/normal/send`, `POST /sms/pattern/normal/store`, `GET /sms/message/all?message_id=`, `GET /sms/message/show-recipient/message-id/{id}?page=&per_page=`, `GET /inbox?page=&per_page=`, `GET /sms/accounting/credit/show`. Legacy pattern send uses `{code, sender, recipient, variable{}}` — note `variable`, singular, versus Edge's `params`. Legacy plain send wraps metadata in `description: {summary, count_recipient}`.
- Legacy auth header is `Apikey`, not `Authorization` — a genuine incompatibility between the two generations, so the two clients cannot share a transport configuration.
- The relationship between IPPanel, FarazSMS and IranPayamak is analysed in `docs/provider-relations.md`.

**Last verified:** 2026-08-16
