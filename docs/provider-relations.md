# Provider relationships and white-label platforms

Several of the twenty providers in this package are not independent APIs. They are resellers
running another vendor's panel software, which means their web service _is_ that vendor's web
service, reached through their own host and credentials.

This matters for two reasons:

1. **Implementation.** Duplicating the same adapter fifteen times would be fifteen places
   to fix the same bug. Where a shared platform is established by evidence, this package
   implements it once and configures it per provider.
2. **Honesty.** Where the relationship is _inferred_ rather than established, the package
   says so and refuses to guess an API endpoint. See [Unverified providers](#unverified-providers).

---

## Evidence standard

A provider is treated as running platform **P** only when at least one of the following holds:

- **A** — its own documentation links to, or reproduces, P's API reference.
- **B** — it publishes an official SDK that is P's SDK (same module layout, same endpoints,
  same error taxonomy).
- **C** — its own documentation publishes P's request/response contract verbatim.

A third-party list on its own is treated as a _lead_, never as proof.

---

## Confirmed relationships

### FarazSMS ↔ IranPayamak — one platform, two brands

|                     |                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Relationship**    | Same platform, same API host, different branding                                                                                                                                                                                   |
| **Evidence**        | **C.** The official documentation at `docs.farazsms.com` titles itself _"فراز اس ام اس (ایران پیامک)"_ and its OpenAPI document declares a single server: `https://api.iranpayamak.com`. Both marketing sites serve the same page. |
| **In this package** | One adapter (`farazsms`), with `iranpayamak` as an alias. There is no separate implementation because there is no separate API.                                                                                                    |

> This is **not** an IPPanel relationship. Older FarazSMS integrations (and several
> third-party WordPress plugins still in circulation) target IPPanel-style endpoints, and
> that history is why the two are often conflated. The current, documented FarazSMS API is
> its own `ws/v1` surface with an `Api-Key` header — unrelated to IPPanel's Edge API.

### Mediana → IPPanel `rest/v1`

|                     |                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Evidence**        | **B.** `github.com/medianasms/go-rest-sdk` has the same file layout as `github.com/ippanel/go-rest-sdk` (`credit.go`, `errors.go`, `message.go`, `request.go`, plus a client file) and the same envelope `{status, code, data, meta{total,limit,page,pages,prev,next}}`. |
| **Differences**     | Auth header is `Authorization: AccessKey <key>` (IPPanel's legacy SDK uses `Apikey`), and Mediana's SDK publishes a full numeric error taxonomy (`10001`–`10024`, `422`, `1401`–`1403`) that IPPanel's own SDK does not.                                                 |
| **In this package** | `src/platforms/ippanel-rest-v1/` implements the generation; `mediana` binds to it.                                                                                                                                                                                       |

### Taban SMS → IPPanel

|                     |                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evidence**        | **A.** `tabansms.com/webservice/` links directly to `https://docs.ippanel.com/` for its "Webservice API", plus to IPPanel's own sample-code downloads (`ippanel.com/files/upload/...`) for C++, C#, VB.NET, the international and VOTP Postman collections, the pattern guide and the web-service error list. |
| **In this package** | Bound to `ippanel-rest-v1`.                                                                                                                                                                                                                                                                                   |

### FaraPayamak → Payamak Panel (MeliPayamak)

|                     |                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evidence**        | **C.** `farapayamak.ir/content/webservice/` documents the same method families as MeliPayamak — REST, SOAP, service-SMS REST for OTP, timed sends, phonebook, ticket management, user management — and the same "Smart web service" fallback-line product, described in the same terms. |
| **Corroboration**   | The Elementor SMS plugin's published _"companies with Payamak Panel source"_ list names `farapayamak.ir`.                                                                                                                                                                               |
| **In this package** | Bound to `payamak-panel`.                                                                                                                                                                                                                                                               |

### ShahvarPayam → Payamak Panel

|                     |                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evidence**        | **C.** `shahvarpayam.ir/api/` publishes the Payamak Panel client signature verbatim: `RestClient restClient = new RestClient(username, password); restClient.Send(to, from, text, isFlash)`.                                      |
| **Note**            | That page is a purchased WordPress theme with placeholder copy — its sample code still refers to _یک پیامک_ and _ملی پیامک_. The signature is nonetheless the Payamak Panel contract, which is what determines the wire protocol. |
| **In this package** | Bound to `payamak-panel`.                                                                                                                                                                                                         |

### The shared Payamak Panel host

`https://rest.payamak-panel.com` is a **shared** endpoint, not MeliPayamak-exclusive.
Probing `POST /api/SendSMS/GetCredit` with deliberately invalid credentials returns:

```json
{ "Value": "", "RetStatus": 0, "StrRetStatus": "UserNameAndPasswordFailed" }
```

Resellers authenticate against the same host with their own username/password. That is why
`melipayamak`, `farapayamak` and `shahvarpayam` all default to it.

---

## Leads that are _not_ proof

The Elementor SMS plugin publishes two lists of Iranian gateways by panel source:

- **IPPanel source** — includes `tabansms.com`, `medianasms.com`, `farazsms.com`,
  `smsaram.ir`, `yekpayamak.com`, and ~45 others.
- **Payamak Panel source** — includes `melipayamak.com`, `farapayamak.ir`, and 5 others.

This is a well-informed source (a plugin vendor has to get this right to ship working
integrations), and it is what pointed at most of the relationships above. But it is a third
party, and it is demonstrably imprecise in at least one case: it lists `farazsms.com` under
IPPanel, whereas FarazSMS's _current_ documented API is its own `ws/v1` surface. So it is
used here only to direct research, never as the basis for an implementation.

---

## Unverified providers

For these, no first-party API documentation could be read during research, so the platform
mapping is a **reasonable inference, not a confirmed fact**:

| Provider       | Inferred platform | What blocked confirmation                                                                                                               |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `radinpayamak` | payamak-panel     | API documentation is behind a panel login (`radinpayamak.ir/login/`)                                                                    |
| `saharsms`     | payamak-panel     | `saharsms.com/info/webservice` returns 404; no public API reference                                                                     |
| `icosms`       | payamak-panel     | Only a general help page is published; no API reference                                                                                 |
| `takiran`      | payamak-panel     | No API reference on `takiran.ir`; the `.com` domain is a parking page                                                                   |
| `pishgamsms`   | payamak-panel     | Pishgam Rayan's public `clouddocs` site covers its cloud-infrastructure products only; the SMS API is behind `gateway.pishgamrayan.com` |
| `afrasms`      | payamak-panel     | `afrasms.com` did not resolve (NXDOMAIN from the system resolver on repeated attempts)                                                  |
| `ganjesms`     | payamak-panel     | `ganjesms.com` did not resolve (NXDOMAIN on repeated attempts)                                                                          |

### What the package does about it

These providers **work**, but they will not start without you telling them where to connect:

```ts
new SMS({
  provider: 'takiran',
  request: { baseUrl: 'https://…' }, // required — from your panel
  credentials: { username: '…', password: '…' },
});
```

Omitting `request.baseUrl` throws `SMSConfigurationError` with code `base_url_required`
before any network call. That is deliberate. Defaulting a host here would mean this package
had picked, on your behalf and with no evidence, where a real customer's messages get sent.

If your provider turns out to run a different platform, either point it at the right adapter
yourself:

```ts
import { ProviderRegistry } from 'iran-sms';
import { KavenegarProvider } from 'iran-sms/providers/kavenegar';

ProviderRegistry.register('my-reseller', KavenegarProvider);
```

…or open an issue with a link to their API documentation and the mapping will be corrected.

---

## Summary

| Provider                     | Platform        | Confirmed?                       |
| ---------------------------- | --------------- | -------------------------------- |
| `ippanel`                    | ippanel-edge    | first-party                      |
| `farazsms` (= `iranpayamak`) | farazsms        | first-party                      |
| `kavenegar`                  | kavenegar       | first-party                      |
| `smsir`                      | smsir           | first-party                      |
| `melipayamak`                | payamak-panel   | first-party (platform vendor)    |
| `amoot`                      | amoot           | first-party                      |
| `mizbansms`                  | mizban          | first-party                      |
| `mediana`                    | ippanel-rest-v1 | ✅ evidence B                    |
| `tabansms`                   | ippanel-rest-v1 | ✅ evidence A                    |
| `farapayamak`                | payamak-panel   | ✅ evidence C                    |
| `shahvarpayam`               | payamak-panel   | ✅ evidence C                    |
| `smsaram`                    | ippanel-rest-v1 | ⚠️ lead only — base URL required |
| `yekpayamak`                 | ippanel-rest-v1 | ⚠️ lead only — base URL required |
| `radinpayamak`               | payamak-panel   | ⚠️ inferred — base URL required  |
| `saharsms`                   | payamak-panel   | ⚠️ inferred — base URL required  |
| `icosms`                     | payamak-panel   | ⚠️ inferred — base URL required  |
| `takiran`                    | payamak-panel   | ⚠️ inferred — base URL required  |
| `pishgamsms`                 | payamak-panel   | ⚠️ inferred — base URL required  |
| `afrasms`                    | payamak-panel   | ⚠️ inferred — base URL required  |
| `ganjesms`                   | payamak-panel   | ⚠️ inferred — base URL required  |

**Last verified:** 2026-08-16
