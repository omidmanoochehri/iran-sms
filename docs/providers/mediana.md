# Mediana SMS

**Provider:** Mediana / مدیانا (medianasms)
**Official website:** https://mediana.ir and https://medianasms.com
**Documentation URL:** https://docs.mediana.ir/ (Docusaurus; intermittently unavailable during research — see Research notes)
**Official SDK repositories:** https://github.com/medianasms — `go-rest-sdk`, `python-rest-sdk`; also `github.com/mediana-ir/medianasms-csharp` and `medianasms-java`

**API base URL:** **Must be supplied.** The official Go SDK hard-codes `http://rest.medianasms.com/v1`, but that host no longer resolves. Provide your account's endpoint via `request.baseUrl`.

**Current API version:** `rest/v1` — the IPPanel `rest.*/v1` generation. See `docs/provider-relations.md`.
**Legacy APIs:** None separately documented.

---

## Authentication

```
Authorization: AccessKey <access key>
```

Verified in `request.go` of the official Go SDK, which also sets
`User-Agent: MedianaSMS/ApiClient/<version> Go/<goversion>`.

---

## Capabilities

| Capability                     | Supported          | Notes                                           |
| ------------------------------ | ------------------ | ----------------------------------------------- |
| Send (1..N recipients)         | Yes                | `POST /messages`                                |
| Bulk                           | Yes                | same endpoint, multiple recipients              |
| Pattern send                   | Yes                | `POST /messages/patterns/send`                  |
| Pattern create                 | Yes                | `POST /messages/patterns`                       |
| Pattern list / update / delete | **No**             | Not present in the SDK or docs                  |
| Delivery reports               | Yes                | `GET /messages/{bulk_id}` and `/recipients`     |
| Inbox                          | Yes                | `GET /messages/inbox`                           |
| Balance                        | Yes                | `GET /credit`                                   |
| Scheduled send                 | **Not documented** | No schedule parameter exists on this generation |
| Contacts / phonebook           | **Not documented** |                                                 |
| Webhooks                       | **Not documented** |                                                 |
| Voice                          | **Not documented** |                                                 |

---

## Endpoints

| Method | Path                                          | Purpose                                                                                       |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/messages`                                   | Send. Body `{originator, recipients[], message}` → `{bulk_id}`                                |
| GET    | `/messages/{bulk_id}`                         | Message detail → `{message: {...}}`                                                           |
| GET    | `/messages/{bulk_id}/recipients?page=&limit=` | Per-recipient statuses → `{recipients: [{recipient, status}]}`                                |
| GET    | `/messages/inbox?page=&limit=`                | Inbox → `{messages: [{number, message, sender, time, type}]}`                                 |
| POST   | `/messages/patterns`                          | Create pattern. Body `{pattern, is_shared}` → `{pattern: {code, status, message, is_shared}}` |
| POST   | `/messages/patterns/send`                     | Pattern send. Body `{pattern_code, originator, recipient, values{}}` → `{bulk_id}`            |
| GET    | `/credit`                                     | Balance → `{credit}`                                                                          |

## Response schema

```json
{
  "status": "…",
  "code": "200",
  "data": { … },
  "meta": { "total": 0, "limit": 10, "page": 1, "pages": 1, "prev": null, "next": null }
}
```

`code` is a **string**, and it carries the business error.

## Errors

Verified from `errors.go` of the official Go SDK — this generation publishes a complete
numeric taxonomy, which IPPanel's own SDK does not:

| Code  | Meaning                                                                  |
| ----- | ------------------------------------------------------------------------ |
| 10001 | Invalid credentials                                                      |
| 10002 | Message body is empty                                                    |
| 10003 | User is limited                                                          |
| 10004 | The line is not assigned to you                                          |
| 10005 | Recipients list is empty                                                 |
| 10006 | Insufficient credit                                                      |
| 10007 | The line is not suitable for bulk sending                                |
| 10008 | The line is temporarily deactivated                                      |
| 10009 | Maximum recipient count exceeded                                         |
| 10010 | Gateway is offline                                                       |
| 10011 | No pricing is defined for this user                                      |
| 10012 | Ticket is invalid                                                        |
| 10013 | Access denied                                                            |
| 10014 | Pattern is invalid                                                       |
| 10015 | Pattern parameters are invalid                                           |
| 10016 | Pattern is inactive                                                      |
| 10017 | Pattern recipient is invalid                                             |
| 10019 | Sending is only permitted between 08:00 and 23:00                        |
| 10021 | One or more user documents are not approved                              |
| 10022 | Internal error                                                           |
| 10023 | The provided number is not valid                                         |
| 10024 | Gateway is disabled                                                      |
| 422   | Input validation failed — `data.error` is a `{field: [{code, err}]}` map |
| 1401  | Unauthorized                                                             |
| 1402  | API key is not valid                                                     |
| 1403  | API key has been revoked                                                 |

`10019` is worth noting: this platform enforces an **08:00–23:00 sending window**.

## Rate limits

Not documented. The official SDK sets a 30-second HTTP timeout.

## Callbacks / webhooks

Not documented. Not implemented.

## Pattern / template implementation

- Identified by a string `code`.
- Values are sent as **`values`**, an object keyed by variable name — the same named-map
  shape as IPPanel Edge, and unlike Kavenegar's positional tokens.
- Exactly one `recipient` per call.
- `PatternStatus` is `active` | `inactive` | `pending`.
- Creation takes only `{pattern, is_shared}`; variables are inferred from the text.

## Blacklist behavior

Not exposed.

## Bulk messaging

`POST /messages` with multiple `recipients`. One `bulk_id` per call.

## Scheduled messaging

Not supported on this generation. This package raises `SMSValidationError` if `scheduleAt`
is supplied, rather than silently dropping it and sending immediately.

## Reports

`GET /messages/{bulk_id}` for the bulk, `/recipients` for per-recipient status. Message
status values are **not enumerated** by the SDK (`// TODO: Add other message status codes`),
so this package maps only the values the SDK defines and passes everything else through as
`nativeStatus`.

## Credits / account APIs

`GET /credit` → `{credit: number}`.

## Contact / group APIs

Not documented.

## Provider-specific features

None beyond the platform's own.

## Limitations

- **No published API host.** `rest.medianasms.com` no longer resolves; `request.baseUrl` is
  required.
- No scheduled send, no contacts, no webhooks, no voice.
- Pattern management is create-only.
- Delivery status vocabulary is undocumented.

## Official SDKs

| Language | Repo                                            |
| -------- | ----------------------------------------------- |
| Go       | https://github.com/medianasms/go-rest-sdk       |
| Python   | https://github.com/medianasms/python-rest-sdk   |
| C#       | https://github.com/mediana-ir/medianasms-csharp |
| Java     | https://github.com/mediana-ir/medianasms-java   |

No official Node.js SDK.

## Research notes

- `docs.mediana.ir` is a Docusaurus site that was returning **HTTP 502** for its own asset
  bundle during research, and `app.mediana.ir` returned **403**, so the rendered
  documentation could not be read. The API contract above therefore comes from the
  **official Go SDK source**, which is a first-party artefact and is complete for the
  endpoints it covers.
- The SDK's `medianasms.go` header comment points at `http://docs.medianasms.com` — that
  host does not resolve either. The live documentation is at `docs.mediana.ir`.
- File layout is identical to `ippanel/go-rest-sdk`, which is the basis for the platform
  mapping recorded in `docs/provider-relations.md`.
- The SDK targets `http://` (not HTTPS). This package defaults to whatever `request.baseUrl`
  you supply and does not downgrade; use `https://` unless your deployment cannot.

**Last verified:** 2026-08-16
