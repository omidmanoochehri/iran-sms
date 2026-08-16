# Research sources

Every implementation decision in this package traces to one of the sources below. They are
ordered by the priority used during research: official API documentation first, then official
developer portals, then official SDK source, then official help centres. Third-party material
appears only where it is labelled as such, and was never used as the basis for an
implementation.

All URLs were fetched and read during research. "Last checked" is the date the content below
was read, not the date the provider last changed it.

---

## Machine-readable specifications (strongest sources)

| Provider   | Document                               | URL                                                    | Purpose                                                             | Last checked |
| ---------- | -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- | ------------ |
| FarazSMS   | OpenAPI 3.0.1, 55 paths                | https://docs.farazsms.com/download/openapi.json        | Complete endpoint list, request/response schemas, enums, examples   | 2026-08-16   |
| SMS.ir     | Swagger 2/OpenAPI                      | https://api.sms.ir/swagger/v1/swagger.json             | Complete endpoint list and body schemas                             | 2026-08-16   |
| Mizban SMS | OpenAPI, 226 paths                     | https://services.mizbansms.com/swagger/v1/swagger.json | Complete endpoint list, request schemas, auth schemes               | 2026-08-16   |
| IPPanel    | Docusaurus markdown sources, 104 files | https://github.com/ippanelcom/Edge-Document            | Complete Edge API reference — the rendered site is client-side only | 2026-08-16   |

---

## Official API documentation

| Provider      | Title                          | URL                                                   | Purpose                                                                        | Last checked |
| ------------- | ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| IPPanel       | IPPanel Edge API Documentation | https://docs.ippanel.com/                             | Base URL, auth model, endpoint index                                           | 2026-08-16   |
| IPPanel       | Edge API — rendered mirror     | https://ippanelcom.github.io/Edge-Document/           | Same content, canonical host                                                   | 2026-08-16   |
| Kavenegar     | راهنمای وب سرویس REST          | https://kavenegar.com/rest.html                       | Complete REST reference, both status-code tables, changelog                    | 2026-08-16   |
| Kavenegar     | RESTful API / SDK index        | https://kavenegar.github.io/kavenegar_en/             | SDK list; defers to the REST document                                          | 2026-08-16   |
| SMS.ir        | REST API                       | https://sms.ir/rest-api/                              | Status-code tables, HTTP semantics, sandbox, IP allowlist                      | 2026-08-16   |
| MeliPayamak   | مستندات وب‌سرویس REST          | https://docs.melipayamak.com/webservice-rest          | 22 method pages: parameters, responses, per-method error tables                | 2026-08-16   |
| MeliPayamak   | وب سرویس SOAP                  | https://docs.melipayamak.com/webservice-soap          | SOAP conventions, WSDL model                                                   | 2026-08-16   |
| FarazSMS      | مستندات وب سرویس               | https://docs.farazsms.com/                            | Endpoint index (63 services), auth, base URL                                   | 2026-08-16   |
| FarazSMS      | llms.txt / llms-full.txt       | https://docs.farazsms.com/llms.txt                    | Provider's own integration summary: header casing, number format, default line | 2026-08-16   |
| AmootSMS      | مستندات فنی                    | https://hub.amootsoft.com/Payamak/docs/account-status | 32 method reference pages                                                      | 2026-08-16   |
| AmootSMS      | REST action index              | https://portal.amootsms.com/rest                      | The platform's own list of all 50 public method signatures                     | 2026-08-16   |
| AmootSMS      | وب سرویس پیامکی                | https://www.amootsms.com/WebService                   | Request format, content type, code samples                                     | 2026-08-16   |
| Mizban SMS    | Swagger UI                     | https://services.mizbansms.com/swagger/index.html     | Rendered API explorer                                                          | 2026-08-16   |
| Taban SMS     | وب سرویس پیامک                 | https://tabansms.com/webservice/                      | **Platform evidence** — links to docs.ippanel.com                              | 2026-08-16   |
| FaraPayamak   | وب سرویس پیامک                 | https://farapayamak.ir/content/webservice/            | **Platform evidence** — method families, SOAP/REST split                       | 2026-08-16   |
| FaraPayamak   | API                            | https://farapayamak.ir/content/API/                   | Services overview                                                              | 2026-08-16   |
| ShahvarPayam  | وب سرویس پنل اس ام اس          | https://shahvarpayam.ir/api/                          | **Platform evidence** — publishes the Payamak Panel client signature           | 2026-08-16   |
| Radin Payamak | مستندات و راهنما               | https://radinpayamak.ir/web-service-documentation/    | Feature list; API reference is behind a panel login                            | 2026-08-16   |
| Pishgam Rayan | sms-web-service                | https://www.pishgamrayan.com/fa/sms-web               | Product description; states REST + SMPP access                                 | 2026-08-16   |
| Pishgam Rayan | مستندات ابر پیشگام             | https://clouddocs.pishgamrayan.com/fa                 | Cloud-infrastructure docs only — **no SMS API**                                | 2026-08-16   |
| iCO SMS       | راهنمای سامانه                 | https://icosms.ir/sms-system-guide/                   | General guide; no API reference                                                | 2026-08-16   |

---

## Official SDK source code

Read where it was the most complete or most current description of the contract.

| Provider    | Repository                                      | What it established                                                                                                                                | Last checked |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| IPPanel     | https://github.com/ippanel/go-rest-sdk          | Legacy `api2` generation: base URL, `Apikey` header, endpoint paths, envelope, error codes 403/404/422/500                                         | 2026-08-16   |
| Mediana     | https://github.com/medianasms/go-rest-sdk       | **Primary source** for Mediana: base URL, `Authorization: AccessKey`, all 7 endpoints, the complete `10001`–`10024` / `1401`–`1403` error taxonomy | 2026-08-16   |
| MeliPayamak | https://github.com/Melipayamak/melipayamak-node | **Primary source** for the SOAP inventory: 8 services, WSDL URL pattern, ~60 method names and parameters                                           | 2026-08-16   |
| SMS.ir      | https://github.com/IPeCompany/SmsPanelV2.DotNet | Route builders, HTTP→exception mapping, result models, per-call limits                                                                             | 2026-08-16   |

---

## Corroborating third-party material

Used only to **direct** research. No implementation rests on these.

| Source                                               | URL                                                          | Use                                                              | Last checked |
| ---------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------ |
| Kerasno docs — "companies with IPPanel source"       | https://docs.kerasno.com/elementorsms-ippanel-gateways/      | Lead that pointed at Taban SMS, SMS Aram, YekPayamak and Mediana | 2026-08-16   |
| Kerasno docs — "companies with Payamak Panel source" | https://docs.kerasno.com/elementorsms-payamakpanel-gateways/ | Lead that pointed at FaraPayamak                                 | 2026-08-16   |

Both lists are demonstrably imprecise in at least one respect — they file `farazsms.com`
under IPPanel, whereas FarazSMS's current documented API is its own `ws/v1` surface. Treated
accordingly.

---

## Live-endpoint observations

Where documentation was silent, a small number of facts were established by calling the live
API **without credentials** and reading the error response. No account was used and no
message was sent.

| Provider      | Observation                                                                                                                                                                                                              | What it established                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Payamak Panel | `POST rest.payamak-panel.com/api/SendSMS/GetCredit` with invalid credentials returns `{"Value":"","RetStatus":0,"StrRetStatus":"UserNameAndPasswordFailed"}`                                                             | The host is shared across resellers; the authentication-failure envelope shape |
| AmootSMS      | `GET portal.amootsms.com/rest/AccountStatus` returns `{"Status":"Token_Invalid",…}`; `…/SendSimple` returns `{"Status":"LineNumber_Empty",…}`; `…/SendWithPattern` returns `{"Status":"ServerError","ErrorMessage":"…"}` | The four known `Status` strings, and that errors arrive with HTTP 200          |

---

## Domains that could not be reached

Recorded so the gaps in `provider-relations.md` are auditable.

| Domain                                         | Result                                                                             | Attempts                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| `afrasms.com`, `www.afrasms.com`, `afrasms.ir` | NXDOMAIN                                                                           | System resolver, repeated             |
| `ganjesms.com`, `ganjesms.ir`                  | NXDOMAIN                                                                           | System resolver, repeated             |
| `yekpayamak.com`, `yekpayamak.ir`              | SERVFAIL                                                                           | System resolver, repeated             |
| `rest.medianasms.com`, `docs.medianasms.com`   | NXDOMAIN                                                                           | Hosts named in Mediana's official SDK |
| `docs.mediana.ir`                              | HTTP 502 on its asset bundle; `app.mediana.ir` HTTP 403                            | Repeated                              |
| `saharsms.com/info/webservice`                 | HTTP 404                                                                           | —                                     |
| `takiran.com`                                  | Domain-for-sale parking page (the live site is `takiran.ir`)                       | —                                     |
| `mizbansms.com`                                | Default web-server page, expired TLS certificate (the live site is `mizbansms.ir`) | —                                     |
| `smsaram.ir`                                   | PHP fatal error — missing SourceGuardian loader                                    | —                                     |

Public DoH resolvers (Cloudflare, Google) were unreachable from the research environment, so
these are system-resolver results only. A domain listed here may resolve fine from elsewhere.

---

## How to re-verify

```bash
# Machine-readable specs — diff these against the versions this package was built from.
curl -s https://docs.farazsms.com/download/openapi.json | jq '.paths | keys | length'
curl -s https://api.sms.ir/swagger/v1/swagger.json     | jq '.paths | keys | length'
curl -s https://services.mizbansms.com/swagger/v1/swagger.json | jq '.paths | keys | length'

# IPPanel Edge documentation sources
gh api repos/ippanelcom/Edge-Document/git/trees/main?recursive=1 \
  | jq -r '.tree[].path' | grep '^docs/.*\.md$' | wc -l
```

If any count differs from `docs/API-COVERAGE.md`, the provider has changed its API and the
research log needs revisiting.

**Last checked:** 2026-08-16
