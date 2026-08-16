# IranPayamak

> **IranPayamak and FarazSMS are the same platform.** This page exists because both brands
> are in common use; the full research log is in **[`farazsms.md`](./farazsms.md)**.

**Provider id in this package:** `farazsms`
**Accepted aliases:** `iranpayamak`, `iran-payamak`, `faraz`, `faraz-sms`

```ts
// These two are identical.
new SMS({ provider: 'iranpayamak', credentials: { apiKey: process.env.FARAZSMS_API_KEY! } });
new SMS({ provider: 'farazsms', credentials: { apiKey: process.env.FARAZSMS_API_KEY! } });
```

`sms.providerId` reports `farazsms` in both cases, because that is the canonical id.

---

## Why they are one provider

- The official documentation at **https://docs.farazsms.com** titles itself
  _«وب سرویس پیامک فراز اس ام اس (ایران پیامک)»_ and links both `farazsms.com` and
  `iranpayamak.com` as the product's sites.
- Its **OpenAPI 3.0.1 document** declares exactly one server:
  **`https://api.iranpayamak.com`** — so even a FarazSMS-branded account talks to the
  IranPayamak host.
- Both marketing sites serve the same page.

There is therefore no separate API to implement, and shipping two adapters would mean two
places to fix the same bug. See [`../provider-relations.md`](../provider-relations.md).

## What this is _not_

IranPayamak is sometimes listed as an IPPanel-based panel. Older FarazSMS integrations —
and several third-party WordPress plugins still in circulation — do target IPPanel-style
endpoints, which is why the two get conflated.

The **current, documented** API is neither: it is FarazSMS's own `ws/v1` surface with an
`Api-Key` header. This package implements that, and does not implement the retired
IPPanel-style endpoints.

## Everything else

Base URL, authentication, all 55 endpoints, request and response schemas, error handling,
pattern semantics, LBS campaigns, phonebooks, tickets, limitations and official SDKs:

→ **[`farazsms.md`](./farazsms.md)**

**Last verified:** 2026-08-16
