# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Two things are deliberately **not** covered by semver, because they are not ours to version:

- `result.raw` / `error.raw` — the provider's own response body.
- `nativeStatus` — the provider's own status value, passed through unmapped.

The normalized fields (`status`, `messageId`, `batchId`, `cost`, `currency`) are versioned.

## [Unreleased]

## [0.1.0] — 2026-08-16

Initial release.

### Added

**Twenty providers**, researched individually against first-party sources:

- First-party API implementations: `ippanel` (Edge), `farazsms` / `iranpayamak`, `kavenegar`,
  `smsir`, `amoot`, `mizbansms`
- Shared platform adapters, implemented once and configured per provider:
  - `payamak-panel` — `melipayamak`, `farapayamak`, `shahvarpayam`, plus 7 inferred resellers
  - `ippanel-rest-v1` — `mediana`, `tabansms`, `smsaram`, `yekpayamak`

**Unified API**

- `sms.send()`, `sms.messages.*`, `sms.patterns.*`, `sms.account.*`, `sms.senders.*`,
  `sms.inbox.*`, `sms.contacts.*`, `sms.groups.*`, `sms.blacklist.*`, `sms.webhooks.*`,
  `sms.voice.*`
- Normalized results that always preserve the untouched provider response in `raw`
- Capability detection: `sms.supports(name)` and `sms.capabilities`, checked synchronously
- Provider metadata: `sms.providerInfo`, `SMS.providers()`, `SMS.hasProvider()`

**Provider-native API**

- `sms.provider` / `sms.raw` — every adapter method, awaited through lazy loading
- `provider.native.*` — the full documented surface of each provider
- Per-provider subpath imports (`iran-sms/providers/kavenegar`) that do not load the others

**Pattern registry**

- Logical pattern names mapped to per-provider codes
- `variableOrder` for providers that send values positionally (AmootSMS, Kavenegar)
- `body` for the Payamak Panel family, which requires the fully rendered text
- Local enforcement of documented pattern rules before the request — Kavenegar's per-slot
  whitespace and length limits, SMS.ir's 25-character parameter cap

**Multi-provider**

- `SMS.Multi` with named or ordered providers
- Routing by traffic kind, with a per-call `provider` override
- Failover that defaults to definite refusals only; network errors and timeouts are opt-in
  because they do not prove the first provider refused anything
- Failover is never attempted for request-level errors

**Errors**

- Typed hierarchy: `SMSError` plus authentication, validation, insufficient-credit,
  rate-limit, pattern, recipient, network, timeout, unsupported-feature and configuration
- Provider-native codes and bodies preserved on every error
- Full code tables mapped for IPPanel, Kavenegar, SMS.ir, MeliPayamak and Mediana
- Early validation: unknown provider, missing credentials, missing base URL, missing sender,
  invalid phone number and past schedules all fail before any network call

**HTTP transport**

- `fetch`-based, zero dependencies, socket-aborting timeouts
- Retries for safe reads only; sends retried solely with a provider-supported idempotency key
- Exponential backoff with full jitter, honouring `Retry-After`
- JSON, form-urlencoded and multipart bodies; tolerant response parsing for providers that
  mislabel JSON as `text/html`
- Request/response hooks and a typed event bus

**Security**

- Secret redaction across logs, events and error messages, including secrets embedded in URL
  **paths** (Kavenegar's key is a path segment)
- OTP values masked by default
- HTTPS defaults where a provider's own spec declares plain HTTP

**Phone utilities**

- Parsing of national, significant, international, E.164, `00`-prefixed, Persian-digit and
  separator-laden forms
- Per-provider output formatting
- Operator detection for MCI, Irancell, RighTel, Taliya, Shatel and SamanTel prefixes

**Tooling**

- ESM + CommonJS builds with generated TypeScript declarations
- 469 tests, mostly contract tests asserting exact request payloads
- Generated capability matrix (`npm run docs:matrix`)
- GitHub Actions CI across Node 18, 20, 22 and 24

**Documentation**

- Per-provider research logs with endpoints, error tables, quirks and verification dates
- `provider-relations.md` — white-label analysis with an explicit evidence standard
- `API-COVERAGE.md` — per-provider coverage with every omission and its reason
- `SOURCES.md` — every source with the date it was read
- Guides for getting started, configuration, sending, patterns, errors, failover, routing,
  webhooks and migration

### Known limitations

Stated here rather than left to be discovered:

- **MeliPayamak's SOAP surface is not implemented.** Contacts, voice, tickets, sub-user
  management, campaign bulk and **cancelling a scheduled send** exist only there. A SOAP
  client is a large dependency for a zero-dependency package; the methods and their WSDLs are
  documented so they can be called directly.
- **`mizbansms` has no pattern sending.** It publishes no customer-facing template endpoint —
  all 226 paths were searched. Declared `pattern: false` rather than invented.
- **Seven providers have inferred platform mappings**: `radinpayamak`, `saharsms`, `icosms`,
  `takiran`, `pishgamsms`, `afrasms`, `ganjesms`. Corrections welcome.
- **Eleven providers require an explicit `request.baseUrl`** — those seven, plus `mediana`,
  `tabansms`, `smsaram` and `yekpayamak`, whose API hosts are unpublished or no longer
  resolve. The package refuses to guess a host.
- **No `webhooks.verify()` for any provider.** None documents a signature scheme; a stub
  returning `true` would be worse than none.
- **`afrasms.com` and `ganjesms.com` did not resolve** during research. Confirm those
  providers are still trading before integrating.
- **IPPanel's URL-send endpoint is deliberately unimplemented** — it accepts credentials as
  query parameters, which writes them into every intermediary's access log.

[Unreleased]: https://github.com/cactus-software-group/iran-sms/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cactus-software-group/iran-sms/releases/tag/v0.1.0
