# Security policy

## Reporting a vulnerability

Please report security issues **privately**, not as a public GitHub issue.

- Open a [GitHub security advisory](https://github.com/cactus-software-group/iran-sms/security/advisories/new), or
- email **security@cactus.software** with `[iran-sms]` in the subject.

Include the affected version, what an attacker can do, and a reproduction if you have one.
You will get an acknowledgement within 72 hours and an assessment within 7 days. Please give
us 90 days before public disclosure, or less if the issue is already being exploited.

Please **do not** include real API keys in a report. If a key has been exposed, rotate it in
your provider's panel first.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

While the package is pre-1.0, security fixes land on the latest minor.

## How credentials are handled

### They are never persisted or transmitted anywhere but the provider

The package writes no files, reads no environment variables of its own, and contacts no host
other than the configured provider's API. There is no telemetry.

### They are redacted at every exit point

A credential is redacted where it would leave the process, not where it is stored. Everything
that can emit — the debug logger, the event bus, error `endpoint` fields — passes through
`core/redact.ts` first.

**Redacted:**

- Headers: `Authorization`, `Api-Key`, `X-API-KEY`, `Token`, `Access-Token`,
  `Proxy-Authorization`, `Cookie`, `Set-Cookie`
- Body and query keys: `apiKey`, `api_key`, `accessKey`, `password`, `pass`, `secret`,
  `token`, `access_token`, `auth_key`, `key`, `signature`
- **One-time codes** — `otp`, `code`, `verificationCode`. An OTP is a live credential for as
  long as it is valid, so it does not belong in a log.

**Secrets in URLs are redacted too, including in the path.** This is not theoretical:
Kavenegar authenticates with the API key as a path segment
(`/v1/{API-KEY}/sms/send.json`). A query-only redactor would leak that key into every log
line and error message, so `redactUrl()` scrubs known secret literals wherever they appear.

```
[iran-sms:kavenegar] → POST https://api.kavenegar.com/v1/6134************/sms/send.json
```

Short values are masked **completely** — revealing four characters of an eight-character
secret is not a redaction.

### What redaction does not cover

`error.raw` and `result.raw` are the provider's **own response body**, preserved deliberately
so you never lose provider-specific detail. This package guarantees it adds nothing secret to
them; it cannot guarantee a provider never echoes something back. Treat `raw` like any other
upstream payload before writing it to a log aggregator.

## Practices this package follows

- **Zero runtime dependencies.** Nothing is pulled in that could be compromised upstream.
- **HTTPS by default.** Where a provider's own SDK or specification declares plain HTTP
  (Mizban SMS's Swagger, MeliPayamak's SOAP endpoints), this package defaults to `https://`
  and requires an explicit override to downgrade — those requests carry account passwords in
  the body.
- **Timeouts abort the socket**, so a hostile or hung provider cannot pin connections open.
- **No credential-bearing GET endpoints.** IPPanel's URL-send endpoint accepts the API key or
  username/password as query parameters; it is deliberately not implemented, because using it
  writes credentials into every intermediary's access log.
- **Sends are not retried** unless the provider offers real idempotency. Beyond duplicate
  billing, a retried OTP is a second valid code in flight.
- **No `eval`, no dynamic code generation**, no prototype-mutating merges.
- **Listener errors are swallowed** so an observer cannot become an availability problem —
  but they never mask a send failure, which still propagates.

## Practices you should follow

1. **Never hard-code credentials.** Use environment variables or a secret manager.
   [`.env.example`](./.env.example) is a template; `.env` is git-ignored.
2. **Rotate keys** you have pasted into a terminal, a ticket, or a chat.
3. **Restrict by IP** where the provider supports it — Kavenegar, SMS.ir and the Payamak
   Panel family all do.
4. **Use a sandbox key** in non-production. SMS.ir has a first-class sandbox key type;
   Kavenegar has an account-level `debugmode` that accepts sends without delivering them.
5. **Do not log `raw` at info level.** Log `error.code` and `error.kind`.
6. **Secure your webhook endpoints yourself.** No Iranian provider documents a signature
   scheme, which is why this package ships no `webhooks.verify()` — a stub that returned
   `true` would be worse than nothing. See [`docs/webhooks.md`](./docs/webhooks.md) for
   defence in depth.
7. **Validate recipients before sending.** `parsePhone()` throws on nonsense, which is
   cheaper than a failed send.

## Threat notes specific to SMS

- **OTP interception.** SMS is not a secure channel. Keep codes short-lived and single-use,
  and rate-limit issuance per number.
- **Toll fraud.** An exposed key means someone else's messages on your balance. Set a
  minimum-credit alarm (Kavenegar's `account/config.mincreditalarm`) and alert on
  `SMSInsufficientCreditError`.
- **Enumeration.** Delivery reports reveal whether a number is reachable. Do not expose them
  to end users.
