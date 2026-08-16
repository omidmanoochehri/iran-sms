# Provider capability matrix

**Generated from `src/providers/catalog.ts` — do not edit by hand.**
Run `npm run docs:matrix` to regenerate.

Every ✅ is traceable to that provider's research log in [`providers/`](./providers/). A dash
means the capability is **not supported or not publicly documented** — this package never
guesses. Where a provider partially supports something, the flag is `—` and the research log
explains what is available natively.

Legend: ✅ supported · — not supported / not documented

| Provider | Send | Bulk | P2P | Pattern | Pattern CRUD | Schedule | Cancel | Reports | Outbox | Inbox | Balance | Lines | Contacts | BL read | BL write | Webhook API | Webhook push | Voice | Pricing | Intl | Idempotent |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [`afrasms`](./providers/afrasms.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`amoot`](./providers/amoot.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | — | — |
| [`farapayamak`](./providers/farapayamak.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`farazsms`](./providers/farazsms.md) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ | — | — | — |
| [`ganjesms`](./providers/ganjesms.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`icosms`](./providers/icosms.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`ippanel`](./providers/ippanel.md) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ | — | — |
| [`kavenegar`](./providers/kavenegar.md) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ |
| [`mediana`](./providers/mediana.md) | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — |
| [`melipayamak`](./providers/melipayamak.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`mizbansms`](./providers/mizbansms.md) | ✅ | ✅ | ✅ | — | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | — | — | — |
| [`pishgamsms`](./providers/pishgamsms.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`radinpayamak`](./providers/radinpayamak.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`saharsms`](./providers/saharsms.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`shahvarpayam`](./providers/shahvarpayam.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`smsaram`](./providers/smsaram.md) | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — |
| [`smsir`](./providers/smsir.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — | — | — | — | — |
| [`tabansms`](./providers/tabansms.md) | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — |
| [`takiran`](./providers/takiran.md) | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | — |
| [`yekpayamak`](./providers/yekpayamak.md) | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — |

## Platform, transport and verification

| Provider | Name | Platform | API version | Recipient format | Host published | Platform confirmed |
|---|---|---|---|---|---|---|
| `afrasms` | AfraSMS | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `amoot` | AmootSMS | `amoot` | 1.0 | `national` | `https://portal.amootsms.com/rest` | ✅ yes |
| `farapayamak` | FaraPayamak | `payamak-panel` | rest | `national` | `https://rest.payamak-panel.com` | ✅ yes |
| `farazsms` | FarazSMS / IranPayamak | `farazsms` | ws-v1 | `national` | `https://api.iranpayamak.com` | ✅ yes |
| `ganjesms` | GanjeSMS | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `icosms` | iCO SMS | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `ippanel` | IPPanel | `ippanel-edge` | edge-v1 | `e164` | `https://edge.ippanel.com/v1` | ✅ yes |
| `kavenegar` | Kavenegar | `kavenegar` | v1 | `national` | `https://api.kavenegar.com` | ✅ yes |
| `mediana` | Mediana SMS | `ippanel-rest-v1` | rest-v1 | `e164` | **must be supplied** | ✅ yes |
| `melipayamak` | MeliPayamak | `payamak-panel` | rest | `national` | `https://rest.payamak-panel.com` | ✅ yes |
| `mizbansms` | Mizban SMS | `mizban` | v1 | `national` | `https://services.mizbansms.com` | ✅ yes |
| `pishgamsms` | Pishgam SMS (Pishgam Rayan) | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `radinpayamak` | Radin Payamak | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `saharsms` | Sahar SMS | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `shahvarpayam` | ShahvarPayam | `payamak-panel` | rest | `national` | `https://rest.payamak-panel.com` | ✅ yes |
| `smsaram` | SMS Aram | `ippanel-rest-v1` | rest-v1 | `e164` | **must be supplied** | ✅ yes |
| `smsir` | SMS.ir | `smsir` | v1 | `significant` | `https://api.sms.ir` | ✅ yes |
| `tabansms` | Taban SMS | `ippanel-rest-v1` | rest-v1 | `e164` | **must be supplied** | ✅ yes |
| `takiran` | TakIran | `payamak-panel` | rest | `national` | **must be supplied** | ⚠️ inferred |
| `yekpayamak` | YekPayamak | `ippanel-rest-v1` | rest-v1 | `e164` | **must be supplied** | ✅ yes |

## Credentials

| Provider | Required | Aliases |
|---|---|---|
| `afrasms` | `username`, `password` | `afra`, `afra-sms` |
| `amoot` | `token` or `apiKey` | `amootsms`, `amoot-sms`, `amootsoft` |
| `farapayamak` | `username`, `password` | `fara-payamak`, `fara` |
| `farazsms` | `apiKey` | `iranpayamak`, `faraz`, `faraz-sms`, `iran-payamak` |
| `ganjesms` | `username`, `password` | `ganje`, `ganj`, `ganje-sms` |
| `icosms` | `username`, `password` | `ico`, `ico-sms`, `icosms.ir` |
| `ippanel` | `apiKey` or `token` | `ip-panel`, `ippanelcom` |
| `kavenegar` | `apiKey` | `kave`, `kavehnegar` |
| `mediana` | `apiKey` | `medianasms`, `mediana-sms` |
| `melipayamak` | `username`, `password` | `meli`, `meli-payamak`, `payamak-panel`, `payamakpanel` |
| `mizbansms` | `username`, `password` | `mizban`, `mizban-sms` |
| `pishgamsms` | `username`, `password` | `pishgam`, `pishgam-sms`, `pishgamrayan` |
| `radinpayamak` | `username`, `password` | `radin`, `radin-payamak` |
| `saharsms` | `username`, `password` | `sahar`, `sahar-sms` |
| `shahvarpayam` | `username`, `password` | `shahvar`, `shahvar-payam` |
| `smsaram` | `apiKey` | `sms-aram`, `aram` |
| `smsir` | `apiKey` | `sms-ir`, `sms.ir`, `ippe`, `idehpardazan` |
| `tabansms` | `apiKey` | `taban`, `taban-sms` |
| `takiran` | `username`, `password` | `tak`, `tak-iran` |
| `yekpayamak` | `apiKey` | `yek`, `yek-payamak` |

## Reading this table

- **Pattern** is template/OTP sending. Every provider that documents one has it; the single
  exception is `mizbansms`, which publishes no customer-facing template endpoint at all —
  see [`providers/mizbansms.md`](./providers/mizbansms.md).
- **Pattern CRUD** means creating/updating/deleting templates *through the API*. Several
  providers allow creation only; the flag is `—` for those and the research log says so.
- **Webhook API** means you can register callback URLs programmatically. **Webhook push**
  means the provider can push events to a URL you configured in its panel. Only `amoot`
  offers the former.
- **Idempotent** means the provider accepts a caller-supplied key that makes a send safe to
  repeat. Only `kavenegar` does (`localid`) — and it is therefore the only provider whose
  sends this package will ever retry automatically.
- **Host published** — where this says *must be supplied*, pass `request.baseUrl`. The
  package refuses to guess an endpoint; see
  [`provider-relations.md`](./provider-relations.md).

**Last generated:** 2026-08-16
