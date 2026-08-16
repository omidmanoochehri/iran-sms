# Errors

Every error this package throws is an `SMSError`. Provider-native failure codes are mapped
onto a small hierarchy so you can branch on the _kind_ of failure without knowing which
gateway produced it — while `code` and `raw` always keep the original detail.

## The hierarchy

```
SMSError                      (kind: 'provider')
├── SMSAuthenticationError    ('authentication')      credentials rejected, IP restricted
├── SMSValidationError        ('validation')          malformed request, bad parameters
├── SMSInsufficientCreditError('insufficient_credit') balance too low
├── SMSRateLimitError         ('rate_limit')          throttled
├── SMSPatternError           ('pattern')             template unknown / unapproved / bad vars
├── SMSRecipientError         ('recipient')           invalid or blacklisted number
├── SMSNetworkError           ('network')             DNS, TCP, TLS, socket reset
├── SMSTimeoutError           ('timeout')             exceeded the configured timeout
├── SMSUnsupportedFeatureError('unsupported_feature') provider cannot do this
└── SMSConfigurationError     ('configuration')       your config is wrong (thrown early)
```

`SMSProviderError` is an alias of `SMSError`, kept because the name is idiomatic.

## Every error carries

```ts
try {
  await sms.send({ to: '09121234567', message: 'hello' });
} catch (error) {
  if (error instanceof SMSError) {
    error.kind; // 'insufficient_credit' — stable across providers
    error.provider; // 'mediana'
    error.code; // '10006' — the provider's own code, untouched
    error.status; // 400 — HTTP status, when there was one
    error.message; // human-readable, with the documented meaning
    error.endpoint; // '/messages' — secrets already redacted
    error.raw; // the provider's untouched response body
    error.retryable; // is retrying this exact request safe?
    error.cause; // the underlying error, when wrapped
  }
}
```

`toJSON()` gives a log-safe view of all of it.

## Branch on kind, not on provider

```ts
switch (error.kind) {
  case 'insufficient_credit':
    await alertOps();
    break;
  case 'recipient':
    await markInvalid(user);
    break;
  case 'rate_limit':
    await backOff();
    break;
  case 'pattern':
    await alertDev('template broken');
    break;
  case 'authentication':
    await pageOncall();
    break;
  case 'network':
  case 'timeout':
    /* see below before retrying */ break;
}
```

## Validation detail

Providers that report per-field errors surface them:

```ts
catch (error) {
  if (error instanceof SMSValidationError && error.fields) {
    // { message: ['تکمیل گزینه پیام الزامی است'] }
  }
}
```

Supported by IPPanel (`meta.errors`) and the `ippanel-rest-v1` family (`data.error`).

## Retries and duplicates

**A failed send is never retried automatically unless the provider can prove it is safe.**

A timeout is the absence of an answer, not a "no". The provider may have accepted the message
and simply failed to tell you. Retrying then sends it twice: the account is billed twice and
the recipient sees it twice.

So:

| Request                                                                        | Retried?                     |
| ------------------------------------------------------------------------------ | ---------------------------- |
| Reads — balance, reports, inbox, listings                                      | Yes, up to `request.retries` |
| Sends, in general                                                              | **No**                       |
| Sends with a caller-supplied `idempotencyKey`, on a provider that supports one | Yes                          |

Today that last row means **Kavenegar**, whose `localid` makes a send genuinely repeat-safe:
if the id already exists in the outbox, Kavenegar does not send again and returns the existing
record.

```ts
await sms.send({
  to: '09121234567',
  message: 'Your order shipped',
  idempotencyKey: `order-shipped-${orderId}`, // now safe to retry
});
```

On providers without idempotency the key is ignored, and `sms.supports('idempotentSend')`
tells you which is which.

If you want to retry a send yourself after a timeout, check the outbox first.

## Failover eligibility

`Multi` uses the same reasoning. `isFailoverEligible(error)` is `false` for anything wrong
with the _request_, because another provider will reject it too:

| Kind                                                                                                                  | Failover eligible |
| --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `network`, `timeout`, `rate_limit`, `provider` (5xx)                                                                  | ✅                |
| `authentication`, `validation`, `pattern`, `recipient`, `insufficient_credit`, `unsupported_feature`, `configuration` | ❌                |

See [failover.md](./failover.md).

## Errors raised before any request

These are thrown by `new SMS(...)` or before the HTTP call, so they never cost a message:

| Condition                                     | Error                   | `code`                   |
| --------------------------------------------- | ----------------------- | ------------------------ |
| Unknown provider id                           | `SMSConfigurationError` | `unknown_provider`       |
| Missing credentials                           | `SMSConfigurationError` | `missing_credentials`    |
| Provider needs an explicit base URL           | `SMSConfigurationError` | `base_url_required`      |
| No sender line configured                     | `SMSConfigurationError` | `missing_sender`         |
| Invalid phone number                          | `SMSValidationError`    | `invalid_phone`          |
| `scheduleAt` in the past                      | `SMSValidationError`    | `schedule_in_past`       |
| Too many recipients for the provider          | `SMSValidationError`    | provider's own code      |
| Pattern not in the registry                   | `SMSPatternError`       | `pattern_not_registered` |
| Positional pattern with no `variableOrder`    | `SMSPatternError`       | `pattern_order_required` |
| Kavenegar token breaks the space/length rules | `SMSPatternError`       | `431`                    |
| SMS.ir parameter over 25 characters           | `SMSPatternError`       | `114`                    |

## Provider code tables

The documented meaning of each code is in the provider's research log, and the mapped message
includes it:

```
SMSInsufficientCreditError: Insufficient credit (Kavenegar 418: Insufficient credit)
```

| Provider    | Table                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| IPPanel     | [`providers/ippanel.md`](./providers/ippanel.md#errors)                                         |
| Kavenegar   | [`providers/kavenegar.md`](./providers/kavenegar.md#errors) — 30 return codes + 10 status codes |
| SMS.ir      | [`providers/smsir.md`](./providers/smsir.md#errors) — 30 status codes + 7 delivery states       |
| MeliPayamak | [`providers/melipayamak.md`](./providers/melipayamak.md#errors) — per-method tables             |
| Mediana     | [`providers/mediana.md`](./providers/mediana.md#errors) — `10001`–`10024`                       |
| FarazSMS    | [`providers/farazsms.md`](./providers/farazsms.md#errors)                                       |
| AmootSMS    | [`providers/amoot.md`](./providers/amoot.md#errors) — partial; see below                        |

## When a provider publishes no error table

AmootSMS and Mizban SMS do not publish exhaustive status lists. Rather than guess, this
package treats anything that is not success as an error, puts the provider's raw value in
`error.code`, and says so:

```
SMSError: AmootSMS SendSimple: Some_New_Status — Undocumented status returned by AmootSMS
```

The four AmootSMS statuses that _are_ known (`Success`, `Token_Invalid`, `LineNumber_Empty`,
`ServerError`) get proper subclasses and explanations.

## Errors never leak credentials

`error.endpoint` is redacted, including secrets embedded in the URL **path** — which matters
for Kavenegar, whose API key is a path segment:

```
endpoint: 'https://api.kavenegar.com/v1/6134************/sms/send.json'
```

`error.raw` is the provider's own response body. This package guarantees it adds nothing
secret; it cannot guarantee a provider never echoes something back. Treat `raw` as you would
any upstream payload before logging it.

## Non-`SMSError` throws

Only for programmer errors that indicate a broken environment — for example constructing an
`HttpClient` where `fetch` does not exist raises a `TypeError`. Anything reachable through
normal use is an `SMSError`.
