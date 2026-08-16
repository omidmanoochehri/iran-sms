# Contributing

## Getting set up

```bash
npm install
npm run check      # lint + format + typecheck + build + test
```

| Command               | Does                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `npm run build`       | ESM + CJS + declarations into `dist/`                            |
| `npm test`            | Builds, then runs the suite (tests import the **built** package) |
| `npm run typecheck`   | Source and tests                                                 |
| `npm run lint`        | ESLint                                                           |
| `npm run format`      | Prettier (`format:check` runs in CI)                             |
| `npm run docs:matrix` | Regenerate `docs/provider-matrix.md` from the catalog            |

Tests run against `dist/esm` deliberately: it verifies what actually ships, including the
exports map and the emitted module graph.

## The one rule

**Nothing goes in that isn't traceable to a first-party source.**

Not a blog post, not a Stack Overflow answer, not a third-party SDK, not another provider's
behaviour, and not a plausible guess. If a provider does not document something, the honest
output is a `false` capability and a line in the research log saying so — not an endpoint that
looks right.

This is a package that spends other people's money and messages their customers. A wrong
endpoint is a bill; a wrong pattern-variable order is a customer receiving somebody else's
name.

## Adding a provider

### 1. Research first

Work down this priority order:

1. Official API documentation
2. Official developer portal
3. Official SDK source (often the most current — several providers' SDKs are more complete
   than their docs)
4. Official help centre / knowledge base
5. Official changelogs

Record **everything**, including what you could not find.

### 2. Write the research log

`docs/providers/<id>.md`, using an existing one as the template. It must cover:

```
Provider · Official website · Documentation URL · API base URL · Current API version
Legacy APIs · Authentication · Capabilities · Endpoints · Request schemas
Response schemas · Errors · Rate limits · Callbacks/webhooks · Pattern implementation
Blacklist behaviour · Bulk · Scheduled · Reports · Credits/account · Contacts/groups
Provider-specific features · Limitations · Official SDKs · Research notes · Last verified
```

Two sections carry the most weight:

- **Research notes** — record discrepancies. Where an official SDK contradicts the official
  docs, say which you followed and why. Real examples already in the tree: IPPanel's SDK uses
  a different auth header from its current docs; MeliPayamak's docs specify JSON while its
  SDK posts form-urlencoded; FarazSMS's OpenAPI attaches a request body to a `GET`.
- **Limitations** — what the provider cannot do, so nobody has to rediscover it.

### 3. Check whether it is a white-label first

Many Iranian gateways resell another vendor's panel. Before writing an adapter, read
[`docs/provider-relations.md`](./docs/provider-relations.md) and apply its evidence standard:

- **A** — its docs link to or reproduce the platform's API reference
- **B** — its official SDK _is_ the platform's SDK
- **C** — its docs publish the platform's request/response contract verbatim

If one holds, add a catalog entry bound to the existing platform adapter — roughly fifteen
lines — and document the evidence. Do not copy an adapter.

If the mapping is only _inferred_, mark the entry `unverified: true` and omit
`defaultBaseUrl`. The package will then require `request.baseUrl` and refuse to guess a host.

### 4. Add the catalog entry

`src/providers/catalog.ts` is the single source of truth for ids, aliases, capabilities,
required credentials and the lazy loader.

**Every capability flag must be defensible from the research log.** A flag means "the API
documents this _and_ this adapter implements it". Partial support is `false` plus a comment
explaining what is available natively — see how `patternManagement` is handled for the
`ippanel-rest-v1` family.

### 5. Implement

```
src/providers/<id>/
  index.ts        the adapter
  constants.ts    base URL, status maps, error tables, documented limits
  errors.ts       envelope handling and error mapping (if non-trivial)
```

Requirements:

- Extend `BaseProvider`. Implement only what the provider documents.
- Every documented operation reachable, via the unified API or `native.*`.
- Map error codes to the typed hierarchy. Keep the provider's code in `error.code` and its
  body in `error.raw`.
- Normalized results always carry `raw`.
- **`idempotent: false` on every send** unless the provider has a real idempotency key.
- Link non-obvious decisions to the documentation in a comment:

  ```ts
  // Edge documents UTC explicitly for send_time.
  return { send_time: toUtcDateTime(scheduleAt) };
  ```

### 6. Test

`test/providers/<id>.test.ts`. Contract tests, not smoke tests — assert the exact request
against the published specification:

```ts
it('produces the documented webservice payload', async () => {
  const mock = mockFetch(ok({ message_outbox_ids: [1] }));
  await provider(mock.fetch).send({ to: '09121234567', message: 'متن پیام' });

  assert.deepEqual(mock.last().body, {
    sending_type: 'webservice',
    from_number: '+983000505',
    message: 'متن پیام',
    params: { recipients: ['+989121234567'] },
  });
});
```

Cover: authentication, normal send, pattern send, request transformation, phone-number
transformation, response parsing, error parsing, invalid credentials, insufficient balance,
invalid pattern, network error, timeout — plus every provider-specific endpoint.

Never call a real API from the suite. `test/helpers.ts` has `mockFetch`, `failingFetch`,
`hangingFetch` and `countingFetch`.

`test/providers/catalog.test.ts` runs over every provider automatically and will fail if a
declared capability has no implementation, so the capability map cannot drift.

#### Response fixtures

Copy the provider's own documented response examples into `test/fixtures/<id>/` and assert
them in `test/providers/fixtures.test.ts`. This is what keeps parsing honest: the shapes come
from the provider, not from what the adapter finds convenient.

```
test/fixtures/<id>/
  send-success.json  pattern-send-success.json  balance.json
  auth-error.json    validation-error.json      pattern-error.json
  delivery-report.json  inbox.json
```

Sanitise before committing — no keys, no real phone numbers. A provider only gets a file for
a case its API actually produces; a missing file is a fact, not an omission.

#### Integration tests

`test/integration/live.test.ts` talks to real APIs and is skipped unless
`SMS_INTEGRATION_TESTS=true`. It is read-only by default; sending needs a _second_ opt-in via
`SMS_INTEGRATION_RECIPIENT`, so a stray environment variable cannot message anyone.

```bash
SMS_INTEGRATION_TESTS=true node --env-file=.env --test "test/integration/*.test.ts"
```

Providers with no credentials in the environment skip rather than fail, so you can run one at
a time.

### 7. Update the generated and hand-written docs

```bash
npm run docs:matrix
```

Then update `docs/API-COVERAGE.md` (with real counts), `docs/SOURCES.md`, `docs/providers.md`
and the README table.

## Code standards

- TypeScript, `strict`. No `any` — narrow from `unknown`.
- **Zero runtime dependencies.** A dependency needs a very good argument.
- Only `fetch`, `AbortController`, `URL`, `FormData`, `Intl` — nothing Node-only, so the
  package keeps working in Workers-style runtimes.
- Comments explain **why**, not what. Prefer a link to the documentation over prose.
- No dead code, no `TODO` stubs, no placeholder methods.

## Corrections to inferred mappings

Seven providers are marked ⚠️ because their platform could not be confirmed. If you have panel
access to one, a link to its real API documentation is a genuinely valuable contribution —
open an issue with the link and the base URL, and the entry will be corrected and promoted.

## Reporting a bug

Include: provider id, package version, Node version, a minimal reproduction, and the redacted
error (`error.kind`, `error.code`, `error.message`). **Never paste an API key.**

## Security

Do not open a public issue for a vulnerability — see [SECURITY.md](./SECURITY.md).
