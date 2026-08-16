# Response fixtures

Sanitized provider responses, taken from each provider's **own documentation examples** and
from error bodies observed against live endpoints without credentials.

They exist so that response parsing is tested against shapes the providers actually return,
rather than shapes this package finds convenient. `test/providers/fixtures.test.ts` feeds every
one of them through the matching adapter and asserts the normalized result.

## Sanitisation

- No real API keys, tokens or passwords — none of these files contains a credential.
- Phone numbers are the masked or example numbers the providers use in their own docs.
- Account names, ids and balances are illustrative.

## Layout

```
test/fixtures/<provider>/
  send-success.json          a successful send
  pattern-send-success.json  a successful template send
  auth-error.json            rejected credentials
  validation-error.json      a malformed request
  pattern-error.json         unknown or unapproved template
  insufficient-credit.json   balance exhausted
  rate-limit.json            throttled
  balance.json               account balance
  delivery-report.json       delivery status
  inbox.json                 inbound messages
```

Not every provider has every file — a provider only gets a fixture for a case its API
actually produces. Kavenegar has `blocked-exists.json` because it has a blacklist API;
Mizban has fewer files because its Swagger publishes almost no response schemas.

## Adding one

Copy the example from the provider's documentation verbatim, replace anything identifying,
and add an assertion in `fixtures.test.ts`. Do not invent a shape — if the provider does not
document a response, that absence is itself worth recording in the research log.
