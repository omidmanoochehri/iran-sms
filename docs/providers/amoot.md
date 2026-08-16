# AmootSMS

**Provider:** AmootSMS / آموت (operated by شرکت داده‌پردازی آموت — Amoot Soft)
**Official website:** https://www.amootsms.com
**Documentation URL:** https://hub.amootsoft.com/Payamak/docs/account-status (the documentation hub; `https://portal.amootsms.com/Documentation` 302-redirects here)
**Additional official sources:**

- Live method index: https://portal.amootsms.com/rest — an ASP.NET MVC reflection listing that enumerates **every** public controller action with its C# signature
- Integration examples: https://www.amootsms.com/WebService

**API base URL:** `https://portal.amootsms.com/rest`
**Current API version:** `1.0` (each documentation page states «نسخه 1.0» / status «فعال»)
**Legacy APIs:** `https://portal.amootsms.com/webservice` still resolves but returns HTTP 500 with a maintenance page; it is not documented and is **not implemented**.

---

## Authentication

A single opaque **Token** issued in the panel.

The documentation lists `Token` with location **`Header`** for almost every method, and the official C# sample sends it as the `Authorization` header value (no scheme prefix):

```
Authorization: <YOUR_TOKEN>
```

The official Node.js / Python / PHP / cURL samples on `amootsms.com/WebService` instead send it as a **form field** named `token`:

```
Content-Type: application/x-www-form-urlencoded
token=<YOUR_TOKEN>&Mobiles=…&SMSMessageText=…&LineNumber=Public&SendDateTime=0
```

Both are accepted by the server. This package sends the token **in the `Authorization` header** (the form documented in the API reference) and additionally mirrors it into the body for the handful of methods whose reference page lists `Token` with location `Body` — `SendBankWithBackupLine` is the one documented that way.

Some legacy methods (`AccountStatus`, `SendSimple`, `SendWithPatternOWN`) also accept `UserName`/`Password` alongside `Token` in their C# signatures; the documentation only describes the token path, so that is what this package implements.

---

## Capabilities

| Capability                               | Supported | Notes                                                                                                                                                                                     |
| ---------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple send (1..N recipients)            | Yes       | `SendSimple`                                                                                                                                                                              |
| Send with backup line                    | Yes       | `SendWithBackupLine` — falls back to an advertising line for blacklisted numbers                                                                                                          |
| Pattern send (shared line)               | Yes       | `SendWithPattern`                                                                                                                                                                         |
| Pattern send (own dedicated line)        | Yes       | `SendWithPatternOWN`                                                                                                                                                                      |
| Quick OTP (server-generated code)        | Yes       | `SendQuickOTP` — **provider generates the code for you**                                                                                                                                  |
| OTP with your own text                   | Yes       | `SendOTP`                                                                                                                                                                                 |
| Number-bank send                         | Yes       | `SendBank`, `SendBankWithBackupLine`, `GetBankTree`                                                                                                                                       |
| Peer-to-peer                             | Yes       | `SendPeerToPeer`                                                                                                                                                                          |
| Scheduled send                           | Yes       | `SendDateTime` on every send method                                                                                                                                                       |
| Price calculation                        | Yes       | `CalculateMessagePrice`, `CalculatePatternMessagePrice`                                                                                                                                   |
| Delivery reports                         | Yes       | `GetDelivery`, `GetDeliveries`, `GetDeliveriesByCampaignID`                                                                                                                               |
| Sent-message retrieval                   | Yes       | `GetMessage`, `GetMessages`                                                                                                                                                               |
| Inbox                                    | Yes       | `RecieveNewMessages`, `RecieveMessages` _(provider's spelling)_                                                                                                                           |
| **Webhooks — registration API**          | **Yes**   | `RelayMessageDelivery*` (delivery receipts) and `RelayRecieveMessage*` (inbound). Register, list and enable/disable URLs **via API** — the only provider in this package that offers this |
| Contacts                                 | Yes       | full CRUD + search + label management + 6 custom text and 3 custom date fields                                                                                                            |
| Contact auto-send (birthday/anniversary) | Yes       | `ContactAutoSendCreate`, `ContactAutoSendEdit`                                                                                                                                            |
| Pattern CRUD                             | Partial   | `PatternCodeList`, `PatternCodeCreate` exist; no update/delete                                                                                                                            |
| Blacklist check                          | Yes       | `IsBlackList_ByCancelation`                                                                                                                                                               |
| LBS (location-based) campaigns           | Yes       | polygon areas + demographic filters                                                                                                                                                       |
| BTS (cell-tower) campaigns               | Yes       | create → check-ready → send                                                                                                                                                               |
| Statistics                               | Yes       | `Statistics`                                                                                                                                                                              |
| Account info / credit / lines / tariffs  | Yes       | `AccountStatus` returns all of it in one call                                                                                                                                             |
| Sub-account signup                       | Yes       | `SignUp`                                                                                                                                                                                  |
| Voice                                    | Partial   | `AccountStatus` returns an `Avanak_SecondPrice` tariff, indicating a voice product, but no voice send method is exposed on this API                                                       |
| International SMS                        | Unknown   | Not documented                                                                                                                                                                            |

---

## Endpoints

`https://portal.amootsms.com/rest/{Method}`. The reflection index at `/rest` lists **50** public methods; the documentation hub covers **32** of them in detail. Both sets are implemented — undocumented-but-listed methods are exposed only on the native provider interface and are flagged in `docs/API-COVERAGE.md`.

### Account

| Method          | Verb | Parameters                                             |
| --------------- | ---- | ------------------------------------------------------ |
| `AccountStatus` | GET  | `Token`                                                |
| `SignUp`        | POST | `Token`, `Mobile`, `Password`, `FirstName`, `LastName` |
| `Statistics`    | POST | `Token`, `FromDate`, `ToDate`                          |

`AccountStatus` returns `AccountName`, `RemaindCredit`, `BaseSMS_PersianPrice`, `BaseSMS_EnglishPrice`, `ServiceSMS_PersianPrice`, `ServiceSMS_EnglishPrice`, `AdsSMS_PersianPrice`, `AdsSMS_EnglishPrice`, `Avanak_SecondPrice`, `ListLineNumbers[]`.

### Sending

| Method                         | Verb | Parameters                                                                                                                       |
| ------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SendSimple`                   | POST | `Token`, `SendDateTime`, `SMSMessageText`, `LineNumber`, `Mobiles`                                                               |
| `SendWithBackupLine`           | POST | `Token`, `SendDateTime`, `SMSMessageText`, `LineNumber`, `BackupLineNumber`, `Mobiles`                                           |
| `SendWithPattern`              | POST | `Token`, `Mobile`, `PatternCodeID`, `PatternValues`                                                                              |
| `SendWithPatternOWN`           | POST | `Token`, `UserName`, `Password`, `SendDateTime`, `PatternCodeID`, `PatternValues`, `LineNumber`, `Mobile`                        |
| `SendQuickOTP`                 | POST | `Token`, `Mobile`, `CodeLength` (4–8), `OptionalCode?`, `PatternCodeID`                                                          |
| `SendOTP`                      | POST | `Token`, `SendDateTime`, `SMSMessageText`, `LineNumber`, `Mobile`, `CodeLength`                                                  |
| `SendBank`                     | POST | `Token`, `SendDateTime`, `SMSMessageText`, `LineNumber`, `BankID`, `OrderType` (`Sequential`=0 / `Random`=1), `FromRow`, `Count` |
| `SendBankWithBackupLine`       | POST | as `SendBank` plus `BackupLineNumber`                                                                                            |
| `SendPeerToPeer`               | POST | `Token`, `SendDateTime`, `LineNumber`, `Input[]` of `{Number, MessageText}`                                                      |
| `GetBankTree`                  | POST | `Token`, `ParentID`                                                                                                              |
| `CalculateMessagePrice`        | POST | `Token`, `SMSMessageText`, `LineNumber`, `Mobiles`                                                                               |
| `CalculatePatternMessagePrice` | POST | `Token`, `Mobile`, `PatternCodeID`, `PatternValues`                                                                              |

> Signature discrepancy on `SendBank`: the reflection index declares `bool Random`, while the documentation page declares `string OrderType` with values `Sequential = 0, Random = 1`. The documentation is newer and more specific; this package sends `OrderType` and accepts a boolean `random` in its own signature for convenience.

### Reports & inbox

| Method                      | Verb | Parameters                                            |
| --------------------------- | ---- | ----------------------------------------------------- |
| `GetDelivery`               | POST | `Token`, `MessageID`                                  |
| `GetDeliveries`             | POST | `Token`, `ListMessageID` (comma-separated)            |
| `GetDeliveriesByCampaignID` | POST | `Token`, `CampaignID`                                 |
| `GetMessage`                | POST | `Token`, `MessageID`                                  |
| `GetMessages`               | POST | `Token`, `FromDateTime`, `ToDateTime`                 |
| `RecieveNewMessages`        | POST | `Token`, `Count`                                      |
| `RecieveMessages`           | POST | `Token`, `FromDateTime`, `ToDateTime?`, `LineNumber?` |

### Webhooks

| Method                          | Verb | Parameters                                                 |
| ------------------------------- | ---- | ---------------------------------------------------------- |
| `RelayMessageDeliveryCreate`    | POST | `Token`, `URLAddress` → `{Status, RelayMessageDeliveryID}` |
| `RelayMessageDeliveryList`      | POST | `Token` → id, address, active flag, registration time      |
| `RelayMessageDeliverySetActive` | POST | `Token`, `RelayMessageDeliveryID`, `Active` → `"Success"`  |
| `RelayRecieveMessageCreate`     | POST | `Token`, `URLAddress` → `{Status, RelayRecieveMessageID}`  |
| `RelayRecieveMessageList`       | POST | `Token`                                                    |
| `RelayRecieveMessageSetActive`  | POST | `Token`, `RelayRecieveMessageID`, `Active` → `"Success"`   |

> Documentation gap: the `RelayRecieveMessageCreate` reference page omits `URLAddress` from its parameter table, but the C# signature in the reflection index is `RelayRecieveMessageCreate(string Token, string URLAddress)` and the sibling delivery method documents it. This package sends `URLAddress` and records the omission here.

### Contacts

| Method                                          | Verb | Notes                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContactCreate`                                 | POST | `ContactGroupID` (documented as **disabled — pass 0**, use `Labels` instead), `Active`, `Mobile`, `FName`, `LName`, `GenderType` (`true`=male, `false`=female), `CompanyTitle`, `JobTitle`, `Email`, `CityName`, `AddressText`, `BornDate`, `AnniversaryDate`, `CustomText1..6`, `CustomDate1..3`, `Labels[]` |
| `ContactEdit`                                   | POST | as create plus `ContactID`                                                                                                                                                                                                                                                                                    |
| `ContactDelete`                                 | POST | `ContactID`                                                                                                                                                                                                                                                                                                   |
| `ContactGet`                                    | POST | `ContactID`                                                                                                                                                                                                                                                                                                   |
| `ContactList`                                   | POST | `ContactGroupID` — `0` = no filter, `-1` = contacts with no label                                                                                                                                                                                                                                             |
| `ContactListUpdates`                            | POST | `ContactGroupID`                                                                                                                                                                                                                                                                                              |
| `ContactGroupList`                              | POST | `Token`                                                                                                                                                                                                                                                                                                       |
| `ContactSearch`                                 | POST | any of `Mobile`, `Labels`, `FName`, `LName`, `CompanyTitle`, `JobTitle`, `Email`, `CityName`, `AddressText`, `BornDate`, `AnniversaryDate`, `CustomText1..6`, `CustomDate1..3`                                                                                                                                |
| `ContactChangeLabel`                            | POST | `FromLabel`, `ToLabel` — bulk rename                                                                                                                                                                                                                                                                          |
| `ContactAutoSendCreate` / `ContactAutoSendEdit` | POST | `Enabled`, `Type`, `DaysRemainTo`, `StartTime`, `Title`, `SMSMessageText`, `LineNumber`, `BackupLineNumber`, `Labels`                                                                                                                                                                                         |

### Patterns

| Method              | Verb | Parameters                                                              |
| ------------------- | ---- | ----------------------------------------------------------------------- |
| `PatternCodeList`   | POST | `Token`                                                                 |
| `PatternCodeCreate` | POST | `Token`, `MessageText`, `NumberPatterns`, `IsOTP`, `RequestDescription` |

Both appear in the reflection index but have no page in the documentation hub.

### Blacklist

| Method                      | Verb | Parameters                      |
| --------------------------- | ---- | ------------------------------- |
| `IsBlackList_ByCancelation` | POST | `Token`, `Mobile`, `LineNumber` |

### LBS / BTS smart campaigns

| Method                                                         | Verb | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LBSAreaCreate`                                                | POST | `Title`, `Coordinates` — JSON `decimal[][][]` polygon ring                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `LBSRequestCreate`                                             | POST | `LBSAreaID`, `Type` (`Welcome`\|`Simple`), `Title`, `SMSMessageText`, `StartDateTime`, `EndDateTime`, `OperatorType` (`TCI`\|`Irancell`\|`RighTel`), `Gender` (`All`\|`Male`\|`Female`), `Age_Start`/`Age_End` (10–99), `PeriodType` (`Minute`\|`Hour`), `PeriodValue` (1–60), `MaxSendCount`, `MaxDailySendCount`, `SendCount`, `StartTime`/`EndTime` (`HH:mm`), plus `DeviceType`, `DeviceBrand`, `ResidenceProvinces`, `NumberPrefixes`, `ResidenceState`, `EmploymentStatus`, `PassengerState` |
| `BTSRequestCreate`                                             | POST | same demographic filters, no message                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `BTSRequestCheckReady`                                         | POST | `BTSRequestID`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `BTSRequestSend`                                               | POST | `BTSRequestID`, `SMSMessageText`, `SendDateTime`, `SendCount`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `LBSGetDeviceTypes` / `LBSGetDeviceBrands` / `LBSGetProvinces` | POST | `Token` — filter vocabularies                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## Request / response format

Requests are `application/x-www-form-urlencoded` POSTs (GET also works for parameterless methods). Array parameters (`Mobiles`, `PatternValues`, `Labels`, `ListMessageID`) are **comma-separated strings**, not repeated keys or JSON.

Responses are JSON with a **string** `Status` field:

```json
{
  "MessageText": "…",
  "SMSPagesCount": 1,
  "CampaignID": 12345678,
  "Price": 1234,
  "Status": "Success",
  "Data": [{ "Mobile": 9120000000, "MessageID": 1234568, "Status": "Success" }]
}
```

`SendQuickOTP` returns `Data` as a single **object** (not an array) and includes the generated `Code`.
`SendPeerToPeer` returns `Data` as `{CampaignsCreated, TotalCampaignNumbersCreated, FailedCount, Campaigns[]}`.
`CalculatePatternMessagePrice` breaks the pattern entirely and returns `{"Status": 1, "ReturnValue": 1500}` — a **numeric** `Status`.
`RelayMessageDeliverySetActive` and `RelayRecieveMessageSetActive` return a bare JSON string `"Success"`.

> This inconsistency is real and load-bearing: `Status` is a string on most methods, an integer on `CalculatePatternMessagePrice`, and the whole body on the two `SetActive` methods. This package normalises all three shapes.

## Errors

Errors are returned with **HTTP 200** and a non-`Success` `Status` string. There is no published exhaustive table; the following values were observed directly against the live API and in the documentation examples:

| `Status`           | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `Success`          | Operation succeeded                                                          |
| `Token_Invalid`    | Missing or wrong token                                                       |
| `LineNumber_Empty` | `LineNumber` not supplied                                                    |
| `ServerError`      | Server-side failure; an `ErrorMessage` field carries the .NET exception text |

Because the list is not published, this package treats **any** `Status !== "Success"` as an error, maps the four known values onto the standard error hierarchy, and passes every other value through as an `SMSProviderError` with `code` set to the raw string and the untouched body in `raw`. It does **not** guess at the meaning of unknown status strings.

> Note on `ServerError`: the response body includes the raw .NET exception message (observed: a `System.Web.Mvc` parameter-binding error naming the controller class). That text can leak implementation detail; this package surfaces it in `error.raw` but does not put it in the user-facing `message`.

## Rate limits

Not documented.

## Callbacks / webhooks

**Fully API-managed** — this is AmootSMS's standout feature. Two independent relay types:

- **Delivery receipts** — `RelayMessageDeliveryCreate` / `List` / `SetActive`
- **Inbound messages** — `RelayRecieveMessageCreate` / `List` / `SetActive`

Multiple URLs can be registered per type and individually enabled or disabled.

**No signature or shared-secret scheme is documented**, and the payload schema delivered to the registered URL is not published. This package therefore implements `webhooks.create()`, `webhooks.list()` and `webhooks.setActive()` for AmootSMS, but **not** `webhooks.verify()` — see `docs/webhooks.md`.

## Pattern / template implementation

- Called **الگو / pattern**, identified by a **numeric `PatternCodeID`**.
- Values are supplied as `PatternValues`: a **comma-separated string, in the same order the variables appear in the pattern**. There are no variable names on the wire.
- Consequence for the unified API: named `variables` must be flattened to positional order. This package requires an explicit `variableOrder` in the pattern registry entry for AmootSMS and throws a clear `SMSPatternError` if named variables are supplied without one — silently guessing at the order would send wrong values into a customer's SMS.
- `SendWithPattern` uses a shared line; `SendWithPatternOWN` sends the same pattern from your dedicated line.
- `SendQuickOTP` is a distinct flow: you register a pattern containing a `code` variable, and the **provider generates the one-time code itself** (`CodeLength` 4–8, or supply `OptionalCode`). The generated code comes back in `Data.Code`.
- Patterns can be created via `PatternCodeCreate` (`MessageText`, `NumberPatterns`, `IsOTP`, `RequestDescription`) and listed via `PatternCodeList`, but there is no update or delete method.
- Patterns require operator approval before use.

## Blacklist behavior

`IsBlackList_ByCancelation(Token, Mobile, LineNumber)` checks whether a number has opted out of a given line. The `*WithBackupLine` send methods are built around this: if the recipient is blacklisted on the primary line, the message is re-routed over the advertising line `98`.

## Bulk messaging

`SendSimple` with a comma-separated `Mobiles` list; `SendPeerToPeer` for per-recipient text; `SendBank` / `SendBankWithBackupLine` for number-bank slices (`FromRow` + `Count`, sequential or random).

## Scheduled messaging

`SendDateTime` on every send method. The official C# example formats it as `yyyy-MM-dd HH:mm:ss`; the Node/Python/PHP examples pass the literal string `"0"` to mean "send now". **No timezone is documented.** This package sends `"0"` when no schedule is given, formats `Date` inputs as `yyyy-MM-dd HH:mm:ss` in **Asia/Tehran** (the provider is Iran-local and the LBS methods use local `HH:mm` windows), and documents the assumption.

## Reports

`GetDelivery` (one), `GetDeliveries` (comma-separated ids), `GetDeliveriesByCampaignID` (whole campaign), `GetMessage`, `GetMessages` (date range), `Statistics` (date range).

## Credits / account APIs

`AccountStatus` — one call returns remaining credit, all six per-type tariffs (base/service/ads × Persian/English), the voice per-second price, and the list of available line numbers.

## Contact / group APIs

Rich contact model: gender, company, job title, city, address, birth date, anniversary date, six custom text fields, three custom date fields and free-form labels. Grouping is by **label**, not group id — `ContactGroupID` is explicitly documented as disabled on `ContactCreate` (pass `0`). `ContactAutoSend*` schedules automatic messages a set number of days before a contact's birthday or anniversary.

## Provider-specific features

- **API-managed webhooks** for both delivery receipts and inbound messages — unique in this package.
- **Server-generated OTP** (`SendQuickOTP`) — the provider creates and returns the code.
- **Backup-line guarantee** — automatic re-route over line `98` when the recipient has opted out of the primary line.
- **LBS polygon campaigns** with a full demographic filter vocabulary (device type, device brand, residence province, employment status, passenger state) and daily/total send caps with time-of-day windows.
- **BTS cell-tower campaigns** with a two-phase prepare-then-send flow.
- **Contact auto-send** for birthdays and anniversaries.
- **`GetBankTree`** — browse the number-bank hierarchy.

## Limitations

- No published error-code table; `Status` strings are discovered empirically.
- No pattern update/delete.
- Pattern values are positional only — no named binding on the wire.
- Webhook payload schema and signature scheme are undocumented.
- 18 of the 50 live methods have no documentation page (`GetDelivery`, `GetDeliveries`, `GetDeliveriesByCampaignID`, `CalculateMessagePrice`, `GetBankTree`, `SendWithBackupLine`, `ContactListUpdates`, `ContactSearch`, `ContactAutoSendCreate`, `ContactAutoSendEdit`, `PatternCodeList`, `PatternCodeCreate`, `Statistics`, `SignUp`, `IsBlackList_ByCancelation`, `LBSGetDeviceTypes`, `LBSGetDeviceBrands`, `LBSGetProvinces`) — implemented from their published C# signatures, and marked as such.
- The provider's own spelling `Recieve` (not `Receive`) must be used on the wire.

## Official SDKs

None. The provider publishes copy-paste examples for C#, Node.js, Python, PHP, cURL and Java on the documentation pages, but no packaged SDK.

## Research notes

- The `/rest` path on the portal is an **ASP.NET MVC action index** that prints the full C# signature of every public action on `Amoot.AmootSMS.Mvc.Controllers.RestController`. That is where the complete 50-method inventory came from — it is more complete than the documentation hub, which covers 32.
- Response shapes and status strings were confirmed by calling the live endpoints without credentials and reading the real error bodies (`Token_Invalid`, `LineNumber_Empty`, `ServerError`). No credentials were used and no messages were sent.
- The documentation hub moved from `portal.amootsms.com/Documentation` to `hub.amootsoft.com/Payamak/docs/*`; older links redirect. `portal.amootsms.com/documentation/api/rest/{method}` links published on the marketing site also resolve there.
- The docs footer shows the platform version as `2.12.1`, dated تیر ۱۴۰۵ (June–July 2026) — the documentation is current.
- `send-with-backup-line` returns **404** on the hub even though it is linked from the navigation and present in the reflection index; its signature is documented above from the index.

**Last verified:** 2026-08-16
