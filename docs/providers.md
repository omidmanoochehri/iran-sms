# Providers

Twenty providers, four first-party API implementations, three shared platform adapters.

- **Capability table** → [provider-matrix.md](./provider-matrix.md) (generated from code)
- **Who runs whose software** → [provider-relations.md](./provider-relations.md)
- **What is and isn't implemented** → [API-COVERAGE.md](./API-COVERAGE.md)
- **Where every fact came from** → [SOURCES.md](./SOURCES.md)

## The list

| id             | Name                   | Aliases                                             | Platform           | Research log                                                                          |
| -------------- | ---------------------- | --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `ippanel`      | IPPanel                | `ip-panel`, `ippanelcom`                            | `ippanel-edge`     | [ippanel.md](./providers/ippanel.md)                                                  |
| `farazsms`     | FarazSMS / IranPayamak | `iranpayamak`, `faraz`, `faraz-sms`, `iran-payamak` | `farazsms`         | [farazsms.md](./providers/farazsms.md) · [iranpayamak.md](./providers/iranpayamak.md) |
| `kavenegar`    | Kavenegar              | `kave`, `kavehnegar`                                | `kavenegar`        | [kavenegar.md](./providers/kavenegar.md)                                              |
| `smsir`        | SMS.ir                 | `sms-ir`, `sms.ir`, `ippe`, `idehpardazan`          | `smsir`            | [smsir.md](./providers/smsir.md)                                                      |
| `melipayamak`  | MeliPayamak            | `meli`, `meli-payamak`, `payamak-panel`             | `payamak-panel`    | [melipayamak.md](./providers/melipayamak.md)                                          |
| `mediana`      | Mediana SMS            | `medianasms`, `mediana-sms`                         | `ippanel-rest-v1`  | [mediana.md](./providers/mediana.md)                                                  |
| `amoot`        | AmootSMS               | `amootsms`, `amoot-sms`, `amootsoft`                | `amoot`            | [amoot.md](./providers/amoot.md)                                                      |
| `mizbansms`    | Mizban SMS             | `mizban`, `mizban-sms`                              | `mizban`           | [mizbansms.md](./providers/mizbansms.md)                                              |
| `farapayamak`  | FaraPayamak            | `fara-payamak`, `fara`                              | `payamak-panel`    | [farapayamak.md](./providers/farapayamak.md)                                          |
| `shahvarpayam` | ShahvarPayam           | `shahvar`, `shahvar-payam`                          | `payamak-panel`    | [shahvarpayam.md](./providers/shahvarpayam.md)                                        |
| `tabansms`     | Taban SMS              | `taban`, `taban-sms`                                | `ippanel-rest-v1`  | [tabansms.md](./providers/tabansms.md)                                                |
| `smsaram`      | SMS Aram               | `sms-aram`, `aram`                                  | `ippanel-rest-v1`  | [smsaram.md](./providers/smsaram.md)                                                  |
| `yekpayamak`   | YekPayamak             | `yek`, `yek-payamak`                                | `ippanel-rest-v1`  | [yekpayamak.md](./providers/yekpayamak.md)                                            |
| `radinpayamak` | Radin Payamak          | `radin`, `radin-payamak`                            | `payamak-panel` ⚠️ | [radinpayamak.md](./providers/radinpayamak.md)                                        |
| `saharsms`     | Sahar SMS              | `sahar`, `sahar-sms`                                | `payamak-panel` ⚠️ | [saharsms.md](./providers/saharsms.md)                                                |
| `icosms`       | iCO SMS                | `ico`, `ico-sms`                                    | `payamak-panel` ⚠️ | [icosms.md](./providers/icosms.md)                                                    |
| `takiran`      | TakIran                | `tak`, `tak-iran`                                   | `payamak-panel` ⚠️ | [takiran.md](./providers/takiran.md)                                                  |
| `pishgamsms`   | Pishgam SMS            | `pishgam`, `pishgam-sms`, `pishgamrayan`            | `payamak-panel` ⚠️ | [pishgamsms.md](./providers/pishgamsms.md)                                            |
| `afrasms`      | AfraSMS                | `afra`, `afra-sms`                                  | `payamak-panel` ⚠️ | [afrasms.md](./providers/afrasms.md)                                                  |
| `ganjesms`     | GanjeSMS               | `ganje`, `ganj`, `ganje-sms`                        | `payamak-panel` ⚠️ | [ganjesms.md](./providers/ganjesms.md)                                                |

⚠️ = platform mapping inferred, not confirmed. These require `request.baseUrl`.

Research logs are named after the provider **id**, so error messages and documentation links
agree. `sms-ir.md` and `pishgam-sms.md` are pointers to the id-named files.

## The six first-party APIs

Genuinely distinct, individually researched, individually implemented.

### `ippanel` — IPPanel Edge

The broadest surface in the package: 89 documented operations including demographic targeting
by province/county/city, postal code and job category, voice OTP, drafts, a reseller suite and
a ticket system. E.164 recipients. UTC scheduling.

### `farazsms` — FarazSMS / IranPayamak

The only provider that publishes a **complete OpenAPI document**. Unique feature: LBS
campaigns that target people physically inside a lat/long radius during a time window,
filtered by dwell event, gender, age and device OS. National-format recipients.

### `kavenegar` — Kavenegar

The only provider with real **idempotency** (`localid`), full **blacklist CRUD**, full
**template CRUD**, and an account-level **debug mode** that accepts sends without delivering
them. Also the only one that authenticates via a URL path segment, which this package redacts
everywhere. International sending to 148 countries via Verify Lookup.

### `smsir` — SMS.ir

The cleanest contract: a live Swagger document, a proper **sandbox** key type sharing the
production URLs, a pack model where a bulk send yields one id used for both reporting and
cancellation (with credit refunded), and published egress IPs for firewall allowlisting.

### `amoot` and `mizbansms`

- **AmootSMS** — 50 methods. The only provider with an **API for managing webhooks**, a
  server-generated OTP flow, LBS polygon and BTS cell-tower campaigns, and automatic
  re-routing over a backup line when a recipient has opted out.
- **Mizban SMS** — a 226-path Swagger covering an entire panel backend. Twelve customer-facing
  methods are typed; the rest are reachable through `native.raw()`. The one provider with no
  template send at all.

## The three shared platforms

Implementing these once rather than fifteen times is the single biggest structural decision
in the package. The evidence for each mapping is in
[provider-relations.md](./provider-relations.md).

| Platform          | Providers                                                    | Operations |
| ----------------- | ------------------------------------------------------------ | ---------: |
| `payamak-panel`   | `melipayamak`, `farapayamak`, `shahvarpayam`, and 7 inferred |         21 |
| `ippanel-rest-v1` | `mediana`, `tabansms`, `smsaram`, `yekpayamak`               |          7 |
| `ippanel-edge`    | `ippanel`                                                    |         89 |

## Choosing one

Rough guidance, not endorsement — check current pricing and your own delivery rates.

| If you need                                 | Consider                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| OTP that must not be filtered               | `kavenegar` (Verify Lookup) or `smsir` (Verify) — both reach blacklisted numbers |
| Retry-safe sends                            | `kavenegar` — the only one with an idempotency key                               |
| Template management from code               | `ippanel`, `farazsms`, `kavenegar`                                               |
| Webhooks you can configure programmatically | `amoot`                                                                          |
| Demographic / geographic targeting          | `ippanel` (postal, province, job) or `farazsms` (LBS radius)                     |
| A sandbox before going live                 | `smsir`, or `kavenegar`'s `debugmode`                                            |
| Contacts and phonebooks over the API        | `ippanel`, `farazsms`, `amoot`                                                   |
| Voice                                       | `kavenegar` (TTS), `ippanel` (VOTP), `farazsms` (audio file)                     |

## Adding one that isn't here

If your provider runs a platform this package already implements:

```ts
import { ProviderRegistry } from 'iran-sms';
import { PayamakPanelProvider } from 'iran-sms/providers/melipayamak';

class MyResellerProvider extends PayamakPanelProvider {
  constructor(config) {
    super('melipayamak', config); // reuse the platform's catalog entry
  }
}

ProviderRegistry.register('my-reseller', MyResellerProvider);
```

If it has its own API, extend `BaseProvider` — see
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-provider) for the research standard a new
adapter has to meet.
