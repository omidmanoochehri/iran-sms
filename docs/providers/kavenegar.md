# Kavenegar

**Provider:** Kavenegar (کاوه‌نگار)
**Official website:** https://kavenegar.com
**Documentation URL:** https://kavenegar.com/rest.html (Persian, canonical and complete)
**Secondary official sources:** https://kavenegar.github.io/kavenegar_en/ (SDK index), https://github.com/kavenegar (official SDKs), https://documenter.getpostman.com/view/3201268/TVYM2v5L (official Postman collection)

**API base URL:** `https://api.kavenegar.com`

**Call format:**

```
https://api.kavenegar.com/v1/{API-KEY}/{Scope}/{MethodName}.{json|xml}
```

Both `GET` and `POST` are accepted for most methods (`sms/sendarray` is POST-only; `line/blocked/remove` and `media/delete` are DELETE).

**Current API version:** `v1`

**Legacy APIs:** None in active documentation. Two methods have been **removed** by the provider and must not be implemented: `sms/countpostalcode` and `sms/sendbypostalcode` (both listed as حذف گردید — "removed" — in the docs' own changelog).

---

## Authentication

The API key is a **path segment**, not a header:

```
https://api.kavenegar.com/v1/613472435563797A3767733D/sms/send.json
```

- No `Authorization` header exists. This has a direct security consequence: the key ends up in URLs, so it can leak into access logs, proxies and browser history. This package therefore **redacts the key segment from every log line, error message and event payload**, replacing it with `{API-KEY}`.
- SSL/TLS is supported and used exclusively by this package.
- Account-level errors: `401` account disabled, `403` invalid API key.
- Some methods (`sms/select`, `sms/selectoutbox`, `sms/latestoutbox`, and international sending) additionally require an **IP allowlist** to be configured in the panel, otherwise they return `407`.
- `utils/getdate` is callable with the literal API key `0` — it is a public server-clock endpoint.

Output format is chosen by the file extension: `.json` or `.xml`.

---

## Capabilities

| Capability                                            | Supported   | Notes                                                                         |
| ----------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Single / multi-recipient send                         | Yes         | comma-separated `receptor`, max 200 per call                                  |
| Array send (different sender+text per recipient)      | Yes         | `sms/sendarray`, POST only                                                    |
| Pattern / template send (Verify Lookup)               | Yes         | highest priority, never filtered, reaches opted-out users                     |
| Template CRUD                                         | Yes         | list / get / add / update / clone / delete — **rare among Iranian providers** |
| Scheduled send                                        | Yes         | `date` as Unix time                                                           |
| Cancel scheduled                                      | Yes         | `sms/cancel`                                                                  |
| Delivery status                                       | Yes         | by message id, by local id, or by recipient                                   |
| Message details                                       | Yes         | `sms/select`                                                                  |
| Outbox listing                                        | Yes         | `sms/selectoutbox`, `sms/latestoutbox`                                        |
| Outbox counting                                       | Yes         | `sms/countoutbox`                                                             |
| Inbox                                                 | Yes         | `sms/receive`, `sms/inboxpaged`, `sms/countinbox`                             |
| Incoming-message webhook                              | Yes         | "Receive via Callback URL" — **configured in the panel, not via API**         |
| Blacklist management                                  | Yes         | list / add / exists / remove — **full CRUD, unique among the providers here** |
| Voice / TTS calls                                     | Yes         | `call/maketts`, and Verify Lookup with `type=call`                            |
| Media (image/video for RCS-style internal messengers) | Yes         | upload / list / get / delete                                                  |
| Account info                                          | Yes         | `account/info`                                                                |
| Account settings                                      | Yes         | `account/config` — read and write                                             |
| Duplicate-send protection                             | Yes         | `localid` — idempotency key                                                   |
| International SMS                                     | Yes         | 148 countries via Verify Lookup; `00` + country code                          |
| Contacts / phonebook                                  | **No**      | Not in the API                                                                |
| Postal-code targeting                                 | **Removed** | Provider deleted these methods                                                |

---

## Endpoints

32 documented, currently-supported methods.

### `sms` scope

| Method           | Path                             | Notes                                                                                                                                              |
| ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send             | `/sms/send.json`                 | `receptor` (≤200, comma-separated), `message`, `sender?`, `date?`, `type?`, `localid?`, `hide?`, `tag?`, `policy?`, `mediaid?`                     |
| SendArray        | `/sms/sendarray.json`            | POST only. `receptor[]`, `sender[]`, `message[]` (equal lengths), `date?`, `type[]?`, `localmessageids[]?`, `hide?`, `tag?`, `policy?`, `mediaid?` |
| Status           | `/sms/status.json`               | `messageid` (≤500, comma-separated)                                                                                                                |
| StatusByLocalId  | `/sms/statuslocalmessageid.json` | `localid`                                                                                                                                          |
| StatusByReceptor | `/sms/statusbyreceptor.json`     | `receptor`, `startdate`, `enddate?`                                                                                                                |
| Select           | `/sms/select.json`               | `messageid` (≤500). Requires IP allowlist                                                                                                          |
| SelectOutbox     | `/sms/selectoutbox.json`         | `startdate`, `enddate?`, `sender?`. Requires IP allowlist                                                                                          |
| LatestOutbox     | `/sms/latestoutbox.json`         | `pagesize?`, `sender?`. Requires IP allowlist                                                                                                      |
| CountOutbox      | `/sms/countoutbox.json`          | `startdate`, `enddate?`, `status?`                                                                                                                 |
| Cancel           | `/sms/cancel.json`               | `messageid` (≤500)                                                                                                                                 |
| Receive          | `/sms/receive.json`              | `linenumber`, `isread` (0/1). Returns ≤100 per call and **marks them read**                                                                        |
| InboxPaged       | `/sms/inboxpaged.json`           | `linenumber`, `isread`, `startdate?`, `enddate?`, `pagenumber?`. ≤200 per page                                                                     |
| CountInbox       | `/sms/countinbox.json`           | `startdate`, `enddate?`, `linenumber?`, `isread?`                                                                                                  |

### `verify` scope

| Method         | Path                          | Notes                                                                                                                                                                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lookup         | `/verify/lookup.json`         | `receptor`, `token`, `token2?`, `token3?`, `token10?`, `token20?`, `template`, `type?` (`sms`\|`call`), `tag?`                                                                                         |
| TemplateList   | `/verify/templatelist.json`   | `page?`, `apiKey?`, `localId?`                                                                                                                                                                         |
| CloneTemplate  | `/verify/clonetemplate.json`  | `sourceTemplateId?` \| `sourceTemplateName?`, `newTemplateName`, `apiKey?`, `localId?`                                                                                                                 |
| AddTemplate    | `/verify/addtemplate.json`    | `name`, `sourceType`, `sendMethod`, `fallBackMethod?`, `primaryLineNumber?`, `secondaryLineNumber?`, `switchTTL?`, `sourceUrl?`, `sourceName?`, `textMessage?`, `voiceMessage?`, `apiKey?`, `localId?` |
| UpdateTemplate | `/verify/updatetemplate.json` | as AddTemplate plus required `templateId`                                                                                                                                                              |
| GetTemplate    | `/verify/gettemplate.json`    | `id`, `apiKey?`, `localId?`                                                                                                                                                                            |
| DeleteTemplate | `/verify/deletetemplate.json` | `id`, `apiKey?`, `localId?`                                                                                                                                                                            |

### `line/blocked` scope

| Method | Path                        | Notes                                                                    |
| ------ | --------------------------- | ------------------------------------------------------------------------ |
| List   | `/line/blocked/list.json`   | `linenumber`, `blockreason?`, `startdate?`, `pagenumber?`. ≤200 per page |
| Add    | `/line/blocked/add.json`    | POST. `linenumber`, `receptor` (≤200, comma-separated)                   |
| Exists | `/line/blocked/exists.json` | `linenumber`, `receptor` (≤200)                                          |
| Remove | `/line/blocked/remove.json` | **DELETE**, query string. `linenumber`, `receptor`. ≤50 per request      |

`blockreason` values: `0` web service · `1` user panel · `2` «لغو ۱۱» opt-out · `3` admin · `10` unknown.
Only numbers blocked via the panel or API can be removed — operator/system blocks (`لغو ۱۱`) are permanent.

### `call` scope

| Method  | Path                 | Notes                                                                                              |
| ------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| MakeTTS | `/call/maketts.json` | `receptor`, `message`, `date?`, `localid?`, `repeat?` _(documented as currently disabled)_, `tag?` |

### `account` scope

| Method | Path                   | Notes                                                                                                                                   |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Info   | `/account/info.json`   | → `remaincredit` (Rial), `expiredate` (Unix), `type` (`master`\|`child`)                                                                |
| Config | `/account/config.json` | GET with no params reads; GET/POST with params writes. `apilogs`, `debugmode`, `defaultsender`, `mincreditalarm` (Rial), `resendfailed` |

### `media` scope

| Method | Path                 | Notes                                    |
| ------ | -------------------- | ---------------------------------------- |
| Upload | `/media/upload.json` | POST `multipart/form-data`, field `File` |
| List   | `/media/list.json`   | `page?` (1), `size?` (50)                |
| Get    | `/media/get.json`    | `id`                                     |
| Delete | `/media/delete.json` | **DELETE**, `id`                         |

Limits: image `image/jpeg`/`image/gif`, ≤10 MB; video `video/mp4`, ≤20 MB and ≤60 s. Media works only on internal-messenger lines. Unused files are auto-deleted after 30 days.

### `utils` scope

| Method  | Path                  | Notes                                                |
| ------- | --------------------- | ---------------------------------------------------- |
| GetDate | `/utils/getdate.json` | Server clock + `unixtime`. Callable with API key `0` |

---

## Response schemas

Every response is:

```json
{ "return": { "status": 200, "message": "تایید شد" }, "entries": … }
```

`entries` is an array for most methods and an object for `account/info`, `account/config`, `verify/addtemplate`, `verify/updatetemplate`, `line/blocked/remove` and `utils/getdate`. Paginated methods add a sibling `metadata` object (`totalcount`, `currentpage`, `totalpages`, `pagesize`).

Send-shaped entry:

```json
{
  "messageid": 8792343,
  "message": "…",
  "status": 5,
  "statustext": "ارسال به مخابرات",
  "sender": "10004346",
  "receptor": "0912…",
  "date": 1356619709,
  "cost": 120
}
```

`cost` is in **Rial**. `date` is **Unix time**.

## Errors

`return.status` mirrors the HTTP status code.

| Code | Meaning                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 200  | Approved                                                                                                                                   |
| 400  | Parameters incomplete                                                                                                                      |
| 401  | Account disabled                                                                                                                           |
| 402  | Operation failed                                                                                                                           |
| 403  | Invalid API key                                                                                                                            |
| 404  | Unknown method                                                                                                                             |
| 405  | Wrong GET/POST verb                                                                                                                        |
| 406  | Required parameters sent empty                                                                                                             |
| 407  | Access to the requested data is not permitted (IP allowlist required for Select / SelectOutbox / LatestOutbox and for international lines) |
| 409  | Server unable to respond; retry later                                                                                                      |
| 411  | Invalid recipient                                                                                                                          |
| 412  | Invalid sender                                                                                                                             |
| 413  | Message empty or too long (max 4000 chars on internal-messenger lines, 1800 on others)                                                     |
| 414  | Request volume exceeded — 200 records per send, 500 per status check                                                                       |
| 415  | Start index greater than the total record count                                                                                            |
| 416  | Source IP does not match the configured settings                                                                                           |
| 417  | Send date invalid, in the past, or wrongly formatted                                                                                       |
| 418  | Insufficient credit                                                                                                                        |
| 419  | `message` / `receptor` / `sender` array lengths differ                                                                                     |
| 420  | Links in message text are restricted for your account                                                                                      |
| 422  | Data not processable due to an unsuitable character                                                                                        |
| 424  | Template not found (wrong name, or not yet approved)                                                                                       |
| 426  | This method requires the advanced service                                                                                                  |
| 427  | This line requires an access level to be created                                                                                           |
| 428  | Sending the code by voice call is not possible (token contains non-digits)                                                                 |
| 429  | IP restricted                                                                                                                              |
| 431  | Invalid code structure (token contains newline, space, underscore or a separator)                                                          |
| 432  | The `%token` parameter was not found in the template text                                                                                  |
| 451  | Too many calls in the time window; IP restricted                                                                                           |
| 501  | Test messages can only be sent to the account owner's number                                                                               |
| 604  | Too many numbers in a blacklist call (max 200)                                                                                             |
| 607  | Invalid tag name                                                                                                                           |

### Message status codes (`status` / `statustext`)

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 1    | Queued                                                               |
| 2    | Scheduled for a future date                                          |
| 4    | Sent to carrier                                                      |
| 5    | Sent to carrier (same as 4)                                          |
| 6    | Failed at the sender line — message not delivered                    |
| 10   | Delivered                                                            |
| 11   | Undelivered (handset off / out of coverage)                          |
| 13   | Cancelled by the user or failed; cost refunded                       |
| 14   | Blocked — recipient opted out of promotional messages; cost refunded |
| 100  | Invalid message id (not in Kavenegar's database, or not yours)       |

### Message display types (`type`, 3000-range lines only)

`0` flash (on-screen, not stored) · `1` normal, stored in handset memory (**default**) · `2` stored on the SIM · `3` stored by a handset/PC application

---

## Rate limits

- `429` — IP restricted; `451` — too many calls within a time window. No published quota figures.
- Hard caps that _are_ documented: 200 recipients per send, 500 message ids per status/select/cancel call, 200 numbers per blacklist add/exists, 50 per blacklist remove, 100 messages per `sms/receive`, 200 per `sms/inboxpaged` page, 200 default `pagesize` (reduced from 500).
- Date-range caps: `countoutbox` max 1 day and `startdate` no older than 3 days; `selectoutbox`/`latestoutbox` max 1 day and `startdate` no older than 4 days; `inboxpaged` max 2 days.

## Callbacks / webhooks

Kavenegar **does** support real-time delivery of incoming messages to a URL you configure — "Receive via Callback URL", set under panel Settings. The docs state that if the callback fails for any reason the message stays `isRead = 0` and can be recovered with `sms/receive`.

There is **no API to register or manage the callback URL**, and **no signature scheme is documented**. This package therefore ships a webhook _parser_ (normalising an inbound payload into the common inbox shape) but deliberately **does not** implement `webhooks.verify()` for Kavenegar — inventing a signature check would be worse than admitting there isn't one. Register the URL in the panel.

## Pattern / template implementation

- Called **الگوی اعتبارسنجی / verification template**, referenced by **name** (`template`), not an id, at send time.
- Placeholders are `%token`, `%token2`, `%token3`, `%token10`, `%token20`. **Only those five numbers are valid** — the docs state the allowed token suffixes are empty, `2`, `3`, `10`, `20`. Voice templates may use `$token` as well as `%token`.
- Values are passed as **separate flat query parameters** `token`, `token2`, … — not an object or array.
- Space rules differ per token: `token`/`token2`/`token3` allow **no spaces at all**; `token10` allows up to 5 spaces; `token20` allows up to 8. All are capped at 100 characters. Violating this yields `431`.
- Consequence for the unified API: named `variables` must be mapped to positional tokens. This package resolves the mapping from the pattern registry when one is configured, and otherwise assigns in declaration order to `token`, `token2`, `token3`, `token10`, `token20`, throwing a clear `SMSPatternError` if more than five variables are supplied.
- `type=call` turns the same template into a voice call. Voice only works when the token is **all digits** (`428` otherwise), and Kavenegar automatically switches to voice when the recipient is an Iranian landline.
- Lookup requires the "advanced service" to be enabled (`426`).
- Templates support a **fallback method** (`fallBackMethod`, with `switchTTL` 1–5 minutes) so an SMS template can automatically fall back to a voice call.
- Template `approvalStatus`: `PendingReview` → `Approved` \| `Rejected`.
- Template names must be English, with no spaces and no underscore.

## Blacklist behavior

Full CRUD (`line/blocked/*`). Status values are `Active` (present in the blacklist) and `AlreadyExists` / `NotExists`. Blocks made by the operator opt-out flow («لغو ۱۱») cannot be removed via the API. Delivery status `14` marks a message rejected because the recipient is blocked; the cost is refunded.

Verify Lookup bypasses filtering entirely, including for users who have opted out of promotional SMS.

## Bulk messaging

`sms/send` with a comma-separated `receptor` (same text, ≤200) and `sms/sendarray` (parallel `receptor`/`sender`/`message` arrays, POST, equal lengths — mismatched lengths give `419`).

## Scheduled messaging

`date` is a **Unix timestamp**. Every date field in the API is Unix time; the docs explain this is deliberate, to avoid timezone parsing errors, and provide `utils/getdate` so you can align to the server clock. Cancel with `sms/cancel`.

## Reports

`sms/status`, `sms/statuslocalmessageid`, `sms/statusbyreceptor`, `sms/select`, `sms/selectoutbox`, `sms/latestoutbox`, `sms/countoutbox`.

## Credits / account APIs

`account/info` (remaining credit in Rial, expiry, master/child) and `account/config` (read/write `apilogs`, `debugmode`, `defaultsender`, `mincreditalarm`, `resendfailed`).

`debugmode` is genuinely useful for integration testing: with it enabled, the account accepts send requests but never delivers them, marking them cancelled instead.

## Contact / group APIs

None.

## Provider-specific features

- **`localid` idempotency.** Supplying a `localid` makes a send idempotent: if that local id already exists in your outbox, Kavenegar does **not** send again and returns the existing record. This is the only true duplicate-protection mechanism among the providers in this package, and it is why Kavenegar is the one provider where this library will retry a send on a network error — but _only_ when the caller supplied a `localid`.
- **Full verification-template CRUD**, including cloning an approved template and per-sub-account template management via `apiKey`/`localId`.
- **Blacklist CRUD** with a reason taxonomy.
- **`debugmode`** account-level dry-run switch.
- **Media attachments** for internal-messenger lines.
- **`policy`** — a named "send flow" defined in the panel that selects lines dynamically.
- **`hide`** — suppress the recipient number from the panel's send list for privacy.
- **Voice fallback** built into templates.

## Limitations

- No contacts/phonebook API.
- Postal-code targeting has been removed by the provider.
- The callback URL cannot be managed via API and has no documented signature.
- `sms/receive` is destructive: retrieved messages are flipped to read.
- Verify Lookup is limited to five token slots with restrictive whitespace rules.
- `Select`, `SelectOutbox` and `LatestOutbox` require IP allowlisting.
- `call/maketts`'s `repeat` parameter is documented as currently disabled.

## Official SDKs

Kavenegar publishes SDKs at https://github.com/kavenegar for C#, Node.js (`kavenegar`), Java, PHP, Python, Go, Ruby, Elixir, Laravel and Yii2, plus CMS modules.

## Research notes

- Everything above was read from **https://kavenegar.com/rest.html**, the provider's own complete Persian REST reference (≈75 KB of text), rather than from the English SDK index page — the latter contains only installation snippets and explicitly defers to the REST document.
- The docs carry a changelog ("آخرین تغییرات") that records real, breaking changes. Captured from it: `CountPostalCode` and `SendByPostalCode` **removed**; `Select`/`SelectOutbox`/`LatestOutbox` now require IP configuration; `SelectOutbox`/`LatestOutbox` range narrowed to 1 day with `startdate` no older than 4 days; default `pagesize` reduced from 500 to 200. Any third-party guide that still lists the postal-code methods is out of date.
- The earlier-generation summaries in circulation (including some search-engine answers) list `token2` through `token20` as a contiguous range. That is **wrong**: the docs state the valid suffixes are only empty, `2`, `3`, `10`, `20`.
- `line/blocked/*` and the `verify/*template*` family are recent additions and are absent from most third-party write-ups; both were taken directly from the official reference.
- The official Node SDK's entry point is `kavenegar.js` at the repository root (not `lib/kavenegar.js`).

**Last verified:** 2026-08-16
