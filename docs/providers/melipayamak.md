# MeliPayamak

**Provider:** MeliPayamak / ملی پیامک (platform also known as _Payamak Panel_)
**Official website:** https://www.melipayamak.com
**Documentation URL:** https://docs.melipayamak.com — split into two projects:

- REST: https://docs.melipayamak.com/webservice-rest
- SOAP: https://docs.melipayamak.com/webservice-soap

**API base URLs:**

- REST: `https://rest.payamak-panel.com`
- SOAP: `http://api.payamak-panel.com/post/<service>.asmx?wsdl`

**Current API version:** REST (unversioned; routes are `/api/SendSMS/<Method>` and `/api/SmartSMS/<Method>`). The docs call this "the current version of the REST web service".

**Legacy APIs:** The SOAP/ASMX web services remain published and documented in parallel — they are **not** deprecated, and several capabilities (contacts, sub-users, voice, branches/bulk, tickets) exist **only** in SOAP. This package exposes REST as the default surface and SOAP under `provider.soap.*`.

---

## Authentication

There is no header-based auth. Credentials travel **in the request body** of nearly every method:

```json
{ "username": "YOUR_USERNAME", "password": "YOUR_API_KEY", … }
```

- `password` is the **API key** configured in the panel's web-service settings, not the login password. The docs warn that some accounts are configured to _require_ the API key — return code `-110` means "you must use the ApiKey rather than the password".
- Exception: `POST /api/SendSMS/GetDeliveries2` takes **only** `recID` and no credentials at all (a public status lookup).
- IP allowlisting is an account-level feature; codes `-108`/`-109`/`-111` all relate to it.
- SOAP methods carry `username`/`password` inside the SOAP body; no `Authorization` header.

---

## Capabilities

| Capability                            | REST    | SOAP    | Notes                                             |
| ------------------------------------- | ------- | ------- | ------------------------------------------------- |
| Single send                           | Yes     | Yes     | `SendSMS` / `SendSimpleSMS2`                      |
| Multi send (parallel arrays)          | Yes     | Yes     | `SendMultipleSMS`, max **100 rows**               |
| OTP send                              | Yes     | —       | `SendOTP` — no text approval needed, fastest path |
| Template ("base/service number") send | Yes     | —       | `BaseServiceNumber` with `bodyId`                 |
| Template scheduled send               | Yes     | —       | `BaseServiceNumberSchedule`                       |
| Scheduled send                        | Yes     | Yes     | `SendSchedule` with repeat `period`               |
| Scheduled status                      | Yes     | Yes     | `GetSchedule` / `GetScheduleStatus`               |
| Cancel scheduled                      | **No**  | Yes     | SOAP `Schedule.RemoveSchedule` only               |
| Recurring ("usance") send             | **No**  | Yes     | SOAP `Schedule.AddUsance`                         |
| Delivery status (single)              | Yes     | Yes     | `GetDeliveries`                                   |
| Delivery status (batch)               | Yes     | Yes     | `GetNewDeliveries` / `GetDeliveries3`             |
| Public status lookup (no credentials) | Yes     | —       | `GetDeliveries2`                                  |
| Inbox / received messages             | Yes     | Yes     | `GetMessages`, `GetInboxCount`                    |
| Inbox by date range                   | **No**  | Yes     | SOAP `receive.GetMessagesByDate`                  |
| Delete received messages              | **No**  | Yes     | SOAP `receive.RemoveMessages2`                    |
| Credit (message units)                | Yes     | Yes     | `GetCredit`                                       |
| Credit (Rial)                         | Yes     | —       | `GetCredit2`                                      |
| Sender numbers                        | Yes     | Yes     | `GetUserNumbers`                                  |
| Price calculation                     | Yes     | Yes     | `GetSmsPrice`, `GetBasePrice`                     |
| Smart SMS (fallback lines)            | Yes     | —       | `/api/SmartSMS/*`                                 |
| Contacts & groups                     | **No**  | Yes     | SOAP `contacts.asmx`                              |
| Voice / TTS                           | **No**  | Yes     | SOAP `Voice.asmx`                                 |
| Branch & bulk campaigns               | **No**  | Yes     | SOAP `Actions.asmx`                               |
| Tickets                               | **No**  | Yes     | SOAP `Tickets.asmx`                               |
| Sub-user / reseller management        | **No**  | Yes     | SOAP `users.asmx`                                 |
| Webhooks                              | Unknown | Unknown | Not documented in either project                  |
| Flash SMS                             | Yes     | Yes     | `isflash`                                         |

---

## Endpoints — REST

All are `POST`, `Content-Type: application/json; charset=utf-8`.

### Sending — `/api/SendSMS/…`

| Method                      | Body                                                       | Returns                                                     |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `SendSMS`                   | `username, password, to, from, text, isflash?`             | `Value` = record id                                         |
| `SendMultipleSMS`           | `username, password, from, to[], text[]`                   | `Result[]` of `{Mobile, ReqID, ReqStatus, Status, Message}` |
| `SendOTP`                   | `username, password, to, from, code`                       | `Value` = record id                                         |
| `SendSchedule`              | `username, password, text, to, from, scheduleDate, period` | `Value` = schedule id                                       |
| `GetSchedule`               | `username, password, scheduleId`                           | `BaseClass` + `Data[]`                                      |
| `BaseServiceNumber`         | `username, password, text, to, bodyId`                     | `Value` = record id (>15 digits)                            |
| `BaseServiceNumberSchedule` | `username, password, text, to, bodyId, scheduleDate`       | `Value` = schedule id                                       |

### Reports — `/api/SendSMS/…`

| Method             | Body                                                | Returns                                                                   |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `GetDeliveries`    | `username, password, recID`                         | `Value` = delivery code                                                   |
| `GetNewDeliveries` | `username, password, recID[]`                       | `Value` = comma-joined codes, in input order                              |
| `GetDeliveries2`   | `recID` **only**                                    | `Value` = delivery code                                                   |
| `GetMessages`      | `username, password, location, from?, index, count` | `MyBase` + `Data[]` of `{MsgID, Body, SendDate, Sender, Receiver, Parts}` |
| `GetInboxCount`    | `username, password, isRead`                        | `Value` = count                                                           |

`count` must be between 1 and 100.

### Account — `/api/SendSMS/…`

| Method           | Body                                                      | Returns                           |
| ---------------- | --------------------------------------------------------- | --------------------------------- |
| `GetCredit`      | `username, password`                                      | `Value` = credit (message units)  |
| `GetCredit2`     | `username, password`                                      | `Value` = credit (Rial)           |
| `GetUserNumbers` | `username, password`                                      | `MyBase` + `Data[]` of `{Number}` |
| `GetSmsPrice`    | `username, password, irancellCount, mciCount, from, text` | `Value` = cost                    |
| `GetBasePrice`   | `username, password`                                      | `Value` = base tariff             |

### Smart SMS — `/api/SmartSMS/…`

Sends over a primary line with up to two documented fallback lines.

| Method           | Body                                                                       | Returns                      |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------- |
| `Send`           | `username, password, to, text, from, fromSupportOne?, fromSupportTwo?`     | `Value` = record id          |
| `SendMultiple`   | `username, password, to[], text[], from, fromSupportOne?, fromSupportTwo?` | `Result[]` of `{Mobile, ID}` |
| `GetDeliveries2` | `username, password, Id`                                                   | `Value` = delivery code      |
| `GetDeliveries`  | `username, password, Ids[]`                                                | `Value` = comma-joined codes |

> Naming collision worth knowing: `GetDeliveries2` exists on **both** controllers with **different** contracts — on `SendSMS` it takes only `recID` and needs no credentials; on `SmartSMS` it takes `username`, `password`, `Id`. Likewise `GetDeliveries` differs (single `recID` vs `Ids[]`). This package keeps them on separate namespaces (`provider.messages.*` vs `provider.smart.*`) so they can never be confused.

## Endpoints — SOAP

WSDL pattern: `http://api.payamak-panel.com/post/{service}.asmx?wsdl`

| Service    | Methods (verified from the official Node SDK)                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send`     | `GetCredit`, `GetDelivery2`, `GetDeliveries3`, `GetMultiDelivery2`, `SendSimpleSMS`, `SendSimpleSMS2`, `SendSms`, `SendWithDomain`, `getMessages`, `GetSmsPrice`, `GetInboxCount`                                                                                                                                |
| `receive`  | `GetMessageStr`, `GetMessagesByDate`, `GetMessagesReceptions`, `GetUsersMessagesByDate`, `RemoveMessages2`                                                                                                                                                                                                       |
| `Voice`    | `SendSMSWithSpeechText`, `SendSMSWithSpeechTextBySchduleDate` _(sic — the API really does misspell "Schdule")_, `GetSendSMSWithSpeechTextStatus`                                                                                                                                                                 |
| `Schedule` | `AddSchedule`, `AddMultipleSchedule`, `GetScheduleStatus`, `RemoveSchedule`, `AddUsance`                                                                                                                                                                                                                         |
| `contacts` | `AddGroup`, `GetGroups`, `AddContact`, `ChangeContact`, `RemoveContact`, `GetContacts`, `CheckMobileExistInContact`, `GetContactEvents`                                                                                                                                                                          |
| `Actions`  | `GetBranchs`, `AddBranch`, `RemoveBranch`, `AddNumber`, `AddBulk`, `AddBulk2`, `GetBulkCount`, `GetBulkStatus`, `GetBulkReceptions`, `RemoveBulk`, `UpdateBulkDelivery`, `GetTodaySent`, `GetTotalSent`, `SendMultipleSMS`, `SendMultipleSMS2`                                                                   |
| `Tickets`  | `AddTicket`, `ResponseTicket`, `GetReceivedTickets`, `GetReceivedTicketsCount`, `GetSentTickets`, `GetSentTicketsCount`                                                                                                                                                                                          |
| `users`    | `AddUser`, `AddUserComplete`, `AddUserWithLocation`, `RemoveUser`, `AuthenticateUser`, `AddPayment`, `ChangeUserCredit`, `ForgotPassword`, `GetUserBasePrice`, `GetUserCredit`, `GetUserDetails`, `GetUserNumbers`, `GetUserTransactions`, `GetUsers`, `GetProvinces`, `GetCities`, `GetExpireDate`, `HasFilter` |

`GetDelivery2` is used for a single id and `GetDeliveries3` for an array; `SendSimpleSMS2` for one recipient and `SendSimpleSMS` for an array (the SDK switches on `Array.isArray`).

---

## Response schemas

Three distinct envelope shapes coexist:

**A — scalar result** (most methods)

```json
{ "Value": "1234567890123456", "RetStatus": 1, "StrRetStatus": "Ok" }
```

**B — wrapped list** (`GetMessages`, `GetUserNumbers`, `GetSchedule`)

```json
{ "MyBase": { "Value": "Ok", "RetStatus": 1, "StrRetStatus": "Ok" }, "Data": [ … ] }
```

`GetSchedule` uses the key `BaseClass` instead of `MyBase` for the same purpose.

**C — per-recipient result** (`SendMultipleSMS`, `SmartSMS/SendMultiple`)

```json
{
  "ReqStatus": "1",
  "Message": "The SMS was sent successfully",
  "Result": [{ "Mobile": "09121234567", "ReqStatus": 1, "Status": 1, "ReqID": 1234567890123456 }]
}
```

> `RetStatus = 1` means the _request_ was processed. The business outcome is in `Value`, which doubles as both a success payload (a record id) **and** an error code (a small negative or small positive integer). A `Value` of `"-1"` with `RetStatus: 35 / "InvalidData"` is the documented generic failure shape. This package classifies on `Value` when `Value` is a small integer and on `RetStatus` otherwise.

---

## Errors

### Common API/security codes (shared by all methods)

| Code | Meaning                                               |
| ---- | ----------------------------------------------------- |
| -112 | Web-service access disabled for this account          |
| -111 | Requesting IP is not allowed                          |
| -110 | You must use the ApiKey instead of the password       |
| -109 | An allowed IP must be configured before using the API |
| -108 | IP blocked after failed API attempts                  |
| -100 | Internal error or invalid parameter                   |

### Send codes (`SendSMS`, `SendOTP`, `SmartSMS/Send`)

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | Username or password incorrect                            |
| 1    | Success                                                   |
| 2    | Insufficient credit                                       |
| 3    | Daily send limit reached                                  |
| 4    | Send-volume limit not respected                           |
| 5    | Invalid sender number                                     |
| 6    | Sending from this line not allowed, or system updating    |
| 7    | Text contains a filtered word                             |
| 9    | Sending from public lines is not possible via web service |
| 10   | User not active                                           |
| 11   | Send failed                                               |
| 12   | User documents incomplete                                 |
| 14   | Text contains a link                                      |
| 15   | Text does not end with «لغو 11»                           |
| 16   | No recipient number found                                 |
| 17   | Message text empty                                        |
| 18   | Invalid mobile number                                     |
| 19   | Daily API send cap reached                                |

### Scheduled-send codes (`SendSchedule`)

`-2` invalid repeat period (0–4 allowed) · `-1` chosen time is in the past · `0` bad credentials · `4` too many recipients · `5` invalid sender · `6` line not allowed · `9` public line not allowed · `15` missing «لغو 11» · `-100` internal error

### Template-send codes (`BaseServiceNumber`)

`-10` links are not allowed in template variables · `-6` internal error · `-5` supplied text does not match the template's variables · `-4` `bodyId` invalid or not yet approved · `-3` sender line not defined in the system · `-2` only one mobile per call · `-1` service web-service access disabled · `0` bad credentials · `2` insufficient credit · `6` system updating · `7` filtered word · `10` user inactive · `11` send failed · `12` documents incomplete · `18` invalid mobile · `19` daily cap reached
`BaseServiceNumberSchedule` adds: `-9` chosen time is in the past · `-8` **send time outside the permitted 07:00–22:00 window**

### Delivery status codes (`GetDeliveries*`)

| Code | Meaning                                                                             |
| ---- | ----------------------------------------------------------------------------------- |
| 0    | Sent to carrier                                                                     |
| 1    | Delivered to handset                                                                |
| 2    | Not delivered to handset                                                            |
| 3    | Carrier error                                                                       |
| 5    | Unknown error                                                                       |
| 8    | Received by carrier                                                                 |
| 16   | Not received by carrier                                                             |
| 35   | Number is blacklisted                                                               |
| 100  | Unknown status                                                                      |
| 200  | Sent                                                                                |
| 300  | Filtered                                                                            |
| 400  | In send queue                                                                       |
| 500  | Rejected by the operator                                                            |
| -2   | Requested id count exceeds account limit (or record not found, on `GetDeliveries2`) |
| -3   | Bad credentials                                                                     |
| -10  | Error retrieving the delivery report                                                |

---

## Rate limits

Not published as a request/second figure, but three account-level caps are documented as error codes: daily send limit (`3`), send-volume limit (`4`) and daily API cap (`19`). Batch status lookups are limited per account (`-2`). `GetMessages` `count` is capped at 100 and `SendMultipleSMS` at 100 rows.

## Callbacks / webhooks

**Not publicly documented** in either the REST or the SOAP project. Inbound messages are retrieved by polling `GetMessages` / `GetInboxCount`. Not implemented.

## Pattern / template implementation

- Called **متن خدماتی / base service number** ("service text"), identified by a **numeric `bodyId`**.
- Unlike every other provider here, the template is **not** filled by named variables. You send the **fully rendered `text`**, and the platform checks it against the approved template's fixed and variable parts — error `-5` means "the supplied text does not match the default text's variables".
- Consequence for the unified API: this package renders the pattern text locally from the registered template body and the supplied `variables`, then submits it as `text` alongside `bodyId`. Callers who prefer to render themselves can pass `text` directly through the native API.
- Templates are created and approved in the panel; **no template CRUD API exists** in REST or SOAP.
- Exactly **one** recipient per call (error `-2`).
- Links are forbidden inside variable values (`-10`).
- The `SendOTP` method is a separate, simpler path: it needs no approved text at all — just `to`, `from` and `code`.

## Blacklist behavior

Surfaced only as delivery status `35`. No blacklist management API.

## Bulk messaging

REST: `SendMultipleSMS` (parallel `to[]`/`text[]`, ≤100 rows). SOAP: `Actions.AddBulk`/`AddBulk2` for true campaign bulk against a "branch" (a stored number list), with `GetBulkCount`, `GetBulkStatus`, `GetBulkReceptions`, `RemoveBulk` and `UpdateBulkDelivery`.

## Scheduled messaging

`scheduleDate` format `yyyy-MM-dd HH:mm:ss`. **No timezone is stated** in the docs; the platform is Iran-local, and the `-8` error on template scheduling ("outside 07:00–22:00") only makes sense in Iran local time, so this package treats naive datetimes as **Asia/Tehran** and converts `Date` inputs accordingly, documenting the assumption.
`period` (0–4) selects a repeat pattern; values are constrained to 0–4 by error `-2` but their individual meanings are not documented. Passed through verbatim.
Cancellation is SOAP-only (`Schedule.RemoveSchedule`).

## Reports

`GetDeliveries` (one), `GetNewDeliveries` (many, order-preserving), `GetDeliveries2` (public, no credentials), `GetMessages` (inbox page), `GetInboxCount`. SOAP adds date-ranged inbox queries and per-message reception detail.

## Credits / account APIs

`GetCredit` (message units), `GetCredit2` (Rial), `GetBasePrice`, `GetSmsPrice`, `GetUserNumbers`. SOAP `users.asmx` additionally exposes the full reseller surface: create/remove users, credit transfer, transactions, expiry date, provinces/cities and a `HasFilter` text pre-check.

## Contact / group APIs

SOAP only (`contacts.asmx`): groups, contacts, contact events, and a `CheckMobileExistInContact` existence probe.

## Provider-specific features

- **Smart SMS** — a distinct controller that accepts up to two fallback sender lines and retries across them automatically.
- **Public delivery lookup** — `GetDeliveries2` works with no credentials at all, given only a record id.
- **`HasFilter`** (SOAP) — pre-check a message body against the operator word filter before spending credit.
- **Usance / recurring schedules** (SOAP) — start date, repeat-after-N-days, end date.
- **Voice + SMS combo** (SOAP) — `SendSMSWithSpeechText` sends an SMS and a spoken message together.
- **Branches** — server-side stored recipient lists that campaigns are addressed to.

## Limitations

- Scheduled sends can only be cancelled through SOAP.
- Contacts, voice, tickets, sub-users and campaign bulk are SOAP-only; the REST project does not cover them.
- Template sending requires the caller to reproduce the approved text exactly; there is no variable-substitution API.
- Template scheduled sends are restricted to a 07:00–22:00 window.
- No webhooks.
- The SOAP endpoints are published over **plain HTTP** (`http://api.payamak-panel.com/...`) in the official SDK. This package defaults the SOAP base to `https://` and lets callers opt back down explicitly, because sending credentials in a cleartext SOAP body is not acceptable by default.

## Official SDKs

| Language | Package / repo                                                                 |
| -------- | ------------------------------------------------------------------------------ |
| Node.js  | `melipayamak` — https://github.com/Melipayamak/melipayamak-node                |
| Others   | The docs render examples for PHP, C#, Python, Java and Go on every method page |

## Research notes

- REST endpoint list, parameters, response shapes and **all** status-code tables were read from the official docs project at `docs.melipayamak.com/webservice-rest` (22 method pages fetched and parsed individually; the site is a Next.js app that server-renders its content).
- The SOAP method inventory was taken from the **official Node SDK** (`Melipayamak/melipayamak-node`), which is the only place that enumerates the ASMX operations compactly. WSDL base: `http://api.payamak-panel.com/post/{send|receive|Voice|Schedule|contacts|Actions|Tickets|users}.asmx?wsdl`.
- **Discrepancy — content type:** the docs specify `Content-Type: application/json; charset=utf-8` for REST, but the official Node SDK posts `application/x-www-form-urlencoded`. Both are accepted by the ASP.NET Web API model binder. This package follows the **documentation** and sends JSON.
- **Discrepancy — parameter casing:** the docs name the delivery parameter `recID`; the official Node SDK sends `recId`. ASP.NET binds case-insensitively. This package sends the documented `recID`.
- **Discrepancy — SOAP method spelling:** `SendSMSWithSpeechTextBySchduleDate` is missing an "e" in "Schedule". It is spelled that way in the official SDK and must be sent that way; this package preserves the typo in the wire call and exposes a correctly-spelled JavaScript method name.
- The official SDK's synchronous `Rest` class only `console.log`s its responses and returns `undefined` — it is not usable as a library. The async variants are the real ones. This is noted because it means the SDK cannot be treated as a behavioural reference for response handling; the docs were used instead.

**Last verified:** 2026-08-16
