# SMS.ir

**Provider:** SMS.ir (سامانه پیامکی اس‌ام‌اس دات آی‌آر) — operated by شرکت ایده‌پردازان / IPE Company
**Official website:** https://sms.ir
**Documentation URL:** https://sms.ir/rest-api/ (canonical; `http://apidocs.sms.ir/` 301-redirects here)
**Machine-readable source (official):** https://api.sms.ir/swagger/v1/swagger.json — Swagger UI at https://api.sms.ir/swagger/index.html
**API base URL:** `https://api.sms.ir`
**Current API version:** `v1` (all paths are `/v1/…`). The Swagger document titles itself _"sms.ir لیست وب سرویس های سامانه پیامک"_, version `v1`.
**Legacy APIs:** SMS.ir previously ran a "RestfulAPI v1.0" (`ws.sms.ir` / `RestApi/…`) with `Token`-based auth obtained from a `/api/Token` call. That generation is retired and is **not implemented**; the current v1 uses a static `X-API-KEY` header with no token exchange.

---

## Authentication

```
X-API-KEY: <key from panel → Developers → API keys>
```

- Declared in the official Swagger as a global security requirement: `{"ApiKey":{"type":"apiKey","name":"x-api-key","in":"header"}}` — applied to **every** operation.
- Header name is matched case-insensitively by the server; official examples show both `X-API-KEY` and `x-api-key`.
- `Accept: application/json` or `application/xml` selects the response format.
- The `GET|POST /v1/send` "URL send" endpoint additionally accepts `username` + `password` as **query parameters** instead of the header.

### Sandbox

Create a key of type **Sandbox** in the panel and use the identical URLs. Sends are simulated: no real SMS, no cost, **no report is recorded**. Only one Verify template exists in sandbox — `templateId: 123456`, text `کد تایید شما: #CODE#`.

### IP whitelisting

If you firewall outbound traffic, SMS.ir publishes both of its egress IPs and requires **both** be allowed (primary `185.211.56.44`, failover `78.158.166.99`).

---

## Capabilities

| Capability                              | Supported                   | Notes                                                                          |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Bulk send (one text → many mobiles)     | Yes                         | `POST /v1/send/bulk`, max **100** mobiles                                      |
| Like-to-like send (N texts → N mobiles) | Yes                         | `POST /v1/send/likeTolike`, max **100** each, arrays must be equal length      |
| Template / Verify send                  | Yes                         | `POST /v1/send/verify` — the OTP path                                          |
| URL send                                | Yes                         | `GET`/`POST /v1/send` with query params                                        |
| Scheduled send                          | Yes                         | `sendDateTime` — **Unix time, UTC**                                            |
| Cancel scheduled                        | Yes                         | `DELETE /v1/send/scheduled/{packId}`, refunds credit                           |
| Single message report                   | Yes                         | `GET /v1/send/{messageId}`                                                     |
| Pack report                             | Yes                         | `GET /v1/send/pack/{packId}`                                                   |
| Pack list                               | Yes                         | `GET /v1/send/pack`                                                            |
| Live / archive send reports             | Yes                         | `GET /v1/send/live`, `/v1/send/archive`                                        |
| Inbox (received)                        | Yes                         | `GET /v1/receive/latest`, `/live`, `/archive`                                  |
| Credit                                  | Yes                         | `GET /v1/credit`                                                               |
| Lines                                   | Yes                         | `GET /v1/line`                                                                 |
| Send to blacklisted numbers             | Yes, via Verify             | A documented advantage of the service-line (`verify`) method                   |
| Template CRUD                           | **No**                      | Templates are created and approved in the panel only — no API                  |
| Contacts / phonebook                    | **No**                      | Not in the v1 API                                                              |
| Webhooks / callbacks                    | **Not publicly documented** | The docs' "تنظیمات" (settings) section contains only credit and line endpoints |
| Voice                                   | **No**                      |                                                                                |
| International SMS                       | Unknown                     | Not documented                                                                 |

---

## Endpoints

Complete list — the official Swagger document contains exactly these 16 operations.

| Method | Path                          | Purpose                                                            |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| POST   | `/v1/send/bulk`               | One text to up to 100 mobiles                                      |
| POST   | `/v1/send/likeTolike`         | Parallel arrays of texts and mobiles                               |
| POST   | `/v1/send/verify`             | Template (pattern) send                                            |
| DELETE | `/v1/send/scheduled/{packId}` | Cancel a scheduled pack                                            |
| GET    | `/v1/send`                    | URL send (query params)                                            |
| POST   | `/v1/send`                    | URL send (query params)                                            |
| GET    | `/v1/send/{messageId}`        | Single message report                                              |
| GET    | `/v1/send/pack/{packId}`      | All messages in a pack                                             |
| GET    | `/v1/send/pack`               | List packs (`PageNumber`, `PageSize`)                              |
| GET    | `/v1/send/live`               | Today's sends (`PageNumber`, `PageSize`, `mobile`, `sortByNewest`) |
| GET    | `/v1/send/archive`            | Historical sends (+ `fromDate`, `toDate`)                          |
| GET    | `/v1/receive/latest`          | Latest received (`count`, max 100)                                 |
| GET    | `/v1/receive/live`            | Today's received                                                   |
| GET    | `/v1/receive/archive`         | Historical received                                                |
| GET    | `/v1/credit`                  | Current credit                                                     |
| GET    | `/v1/line`                    | Available sender lines                                             |

> Casing quirk: the send route is `/v1/send/likeTolike` — lowercase `l`, capital `T`, lowercase `l` again. The official .NET SDK (`SendRoutes.cs`) spells it exactly this way, while the human docs page writes `likeToLike` in one heading. This package uses the Swagger/SDK spelling.

> Query-parameter casing quirk: Swagger declares `PageNumber` / `PageSize` (capitalised) while the official .NET SDK sends `pageNumber` / `pageSize`. ASP.NET binds these case-insensitively; this package sends the SDK's lower-camelCase spelling.

---

## Request schemas

Bulk:

```json
{ "lineNumber": 30000000000, "messageText": "…", "mobiles": ["9120000000"], "sendDateTime": null }
```

Like-to-like:

```json
{
  "lineNumber": 30000000000,
  "messageTexts": ["t1", "t2"],
  "mobiles": ["9120000000", "9120000001"],
  "sendDateTime": null
}
```

Verify (template):

```json
{ "mobile": "9120000000", "templateId": 100000, "parameters": [{ "name": "CODE", "value": "12345" }] }
```

URL send (query): `username`, `password`, `mobile`, `line`, `text`.

## Response schemas

Uniform envelope on every endpoint:

```json
{ "status": 1, "message": "موفق", "data": … }
```

| Endpoint                                          | `data`                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `send/bulk`, `send/likeTolike`                    | `{packId: string(GUID), messageIds: int[], cost: number}`                                           |
| `send/verify`                                     | `{messageId: int, cost: number}`                                                                    |
| `send` (URL)                                      | `{messageId: int, cost: number}`                                                                    |
| `send/scheduled/{packId}`                         | `{returnedCreditCount: number, smsCount: int}`                                                      |
| `send/{messageId}`                                | `{messageId, mobile, messageText, sendDateTime, lineNumber, cost, deliveryState, deliveryDateTime}` |
| `send/pack/{packId}`, `send/live`, `send/archive` | array of the above                                                                                  |
| `send/pack`                                       | `[{packId, recipientCount, creationDateTime}]`                                                      |
| `receive/*`                                       | `[{receiveReturnId, messageText, number, mobile, receivedDateTime}]`                                |
| `credit`                                          | `number`                                                                                            |
| `line`                                            | `number[]`                                                                                          |

All timestamps are **Unix time in UTC**.

---

## Errors

Two layers, both must be checked.

### HTTP status codes

| Code | Meaning                |
| ---- | ---------------------- |
| 200  | Success                |
| 400  | Logical error          |
| 401  | Authentication failure |
| 429  | Too many requests      |
| 500  | Unexpected error       |

### Application `status` codes (send)

| Code | Meaning                                               |
| ---- | ----------------------------------------------------- |
| 1    | Success                                               |
| 0    | System problem — contact support                      |
| 10   | Invalid API key                                       |
| 11   | API key disabled                                      |
| 12   | API key is restricted to whitelisted IPs              |
| 13   | Account inactive                                      |
| 14   | Account suspended                                     |
| 20   | Request count exceeds the allowed limit               |
| 101  | Invalid line number                                   |
| 102  | Insufficient credit                                   |
| 103  | Request contains empty text(s)                        |
| 104  | Request contains invalid mobile(s)                    |
| 105  | More than the allowed 100 mobiles                     |
| 106  | More than the allowed 100 texts                       |
| 107  | Mobile list is empty                                  |
| 108  | Text list is empty                                    |
| 109  | Invalid send time                                     |
| 110  | Mobile count and text count differ                    |
| 111  | No send found with this id                            |
| 112  | No record found to delete                             |
| 113  | Template not found                                    |
| 114  | Parameter value longer than the allowed 25 characters |
| 115  | Mobile number(s) are on the system blacklist          |
| 116  | Parameter name cannot be empty                        |
| 117  | Message text not approved                             |
| 118  | Message count exceeds the limit                       |
| 119  | Upgrade your plan to use a custom template            |
| 123  | Sender line needs activation                          |

### Delivery states (`deliveryState`)

| Code | Meaning                      |
| ---- | ---------------------------- |
| 1    | Delivered to handset         |
| 2    | Not delivered to handset     |
| 3    | Processing at the carrier    |
| 4    | Not delivered to the carrier |
| 5    | Delivered to the carrier     |
| 6    | Error                        |
| 7    | Blacklisted                  |

The official .NET SDK maps HTTP codes to typed exceptions: 401 → Unauthorized, 403 → AccessDenied, 400 → Logical, 429 → TooManyRequest, 500 → Unexpected. This package mirrors that mapping onto its own error hierarchy and additionally maps the application `status` codes (10–14 → auth, 20 → rate limit, 102 → insufficient credit, 113/114/116/117/119 → pattern, 104/105/107/115 → recipient, others → validation).

---

## Rate limits

Enforced but not quantified: HTTP `429` and application status `20` both mean "too many requests". No published quota. Hard per-request caps that _are_ documented: **100 mobiles** and **100 texts** per bulk/like-to-like call, `pageSize` max **100**, `receive/latest` `count` max **100**, Verify parameter values max **25 characters**.

## Callbacks / webhooks

**Not publicly documented.** No webhook endpoint exists in the Swagger document, and the docs' settings section covers only credit and lines. Delivery status and inbound messages are retrieved by polling. Not implemented — see `docs/API-COVERAGE.md`.

## Pattern / template implementation

- Called **قالب / template**, used through the **Verify** endpoint (the "service line" send).
- Identified by a **numeric** `templateId`.
- Placeholders in the template text are written `#NAME#` (e.g. `کد تایید شما: #CODE#`).
- At send time, values go in `parameters`: an **array of `{name, value}` objects** — _not_ an object map. `name` is the placeholder without the `#` delimiters.
- Parameter values are limited to **25 characters** (status `114`).
- Templates are authored and approved in the panel; **there is no template CRUD API**.
- Verify send takes **exactly one** `mobile` (a string).
- Verify is the only method that can reach numbers on the system blacklist.

## Blacklist behavior

Bulk sends to blacklisted numbers fail with status `115`; the per-message `deliveryState` `7` also means blacklisted. The Verify (service-line) method is explicitly documented as being able to deliver to blacklisted numbers. No blacklist management API.

## Bulk messaging

`send/bulk` (same text, ≤100 mobiles) and `send/likeTolike` (equal-length text/mobile arrays, ≤100 each). Both return a `packId` GUID that groups the messages for reporting and cancellation.

## Scheduled messaging

`sendDateTime` is a **Unix timestamp in seconds, UTC**. Passing `null` sends immediately. Cancel with `DELETE /v1/send/scheduled/{packId}`; the response reports how much credit was refunded.

## Reports

`send/{messageId}`, `send/pack/{packId}`, `send/pack`, `send/live` (today), `send/archive` (up to end of yesterday, with `fromDate`/`toDate`). Inbox mirrors this with `receive/latest`, `receive/live`, `receive/archive`.

## Credits / account APIs

`GET /v1/credit` → a bare decimal in `data`. `GET /v1/line` → an array of line numbers. No profile/account-info endpoint.

## Contact / group APIs

None in the v1 API.

## Provider-specific features

- **Sandbox API keys** — a first-class simulated environment sharing the production URLs, with a fixed test template.
- **Pack model** — every bulk send yields a GUID `packId` that is the unit of reporting _and_ of scheduled-send cancellation, with credit refunded on cancel.
- **Published egress IPs** for customer-side firewall allowlisting.
- **Verify can reach blacklisted numbers**, which the bulk methods cannot.

## Limitations

- No template management API — templates must be created in the panel.
- No contacts/phonebook, no voice, no webhooks.
- Hard 100-recipient cap per bulk request; larger campaigns must be chunked by the caller.
- `send/archive` only covers up to the end of the previous day.

## Official SDKs

| Language             | Package / repo                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| .NET                 | `IPE.SmsIr` on NuGet — https://github.com/IPeCompany/SmsPanelV2.DotNet |
| ASP.NET Core samples | https://github.com/IPeCompany/SmsPanelV2.DotNetCore.Samples            |

SMS.ir also links a Postman collection and a set of CMS plugins from the docs page. There is no official Node.js SDK (`sms-ir-node` on GitHub is community-maintained).

## Research notes

- The endpoint list, request bodies and response shapes above come from the provider's **live Swagger document** (`api.sms.ir/swagger/v1/swagger.json`), cross-checked against the official .NET SDK route builders and the human-readable docs page. All three agree.
- The two status-code tables (send status and delivery state) and the HTTP status table were read from https://sms.ir/rest-api/ ; the SDK's README points at `app.sms.ir/developer/help/statusCode` for the same data, but that page is a client-rendered SPA with no server-side content.
- `apidocs.sms.ir` — the URL printed in the official .NET SDK README — now permanently redirects to `sms.ir/rest-api/`.
- Swagger declares `data` for `/v1/line` and `/v1/receive/*` as a bare `array` without item schemas on some operations; the item shapes above were taken from the docs page examples and the SDK result models (`ReceivedMessageResult`, `MessageReportResult`, `PackResult`).
- Mobile numbers appear in official examples **without** a leading zero or country code (`9120000000`). The docs also show `919xxxx904` in the sandbox example. This package normalises to the bare 10-digit national significant number for SMS.ir.

**Last verified:** 2026-08-16
