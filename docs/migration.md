# Migration

## Switching provider

If you use the pattern registry and the unified API, switching is a configuration change:

```diff
 const sms = new SMS({
-  provider: 'ippanel',
-  credentials: { apiKey: process.env.IPPANEL_API_KEY! },
-  sender: '+983000505',
+  provider: 'kavenegar',
+  credentials: { apiKey: process.env.KAVENEGAR_API_KEY! },
+  sender: '10004346',

   patterns: {
     login: {
       ippanel: 'fg88js0v32',
+      kavenegar: 'login',
     },
   },
 });
```

Nothing else moves — `sms.send()`, `sms.patterns.send()`, `sms.account.getBalance()` are the
same calls.

### Check this before you cut over

1. **Capabilities.** The new provider may not do everything the old one did.

   ```ts
   const before = new SMS({ provider: 'ippanel', credentials: { apiKey: 'x' } });
   const after = new SMS({ provider: 'kavenegar', credentials: { apiKey: 'x' } });

   for (const key of Object.keys(before.capabilities)) {
     if (before.capabilities[key] && !after.capabilities[key]) {
       console.warn(`losing: ${key}`);
     }
   }
   ```

2. **Pattern registry.** Add the new provider's code for every pattern you send. A missing
   entry throws at send time, not at startup — so exercise every pattern in staging.

3. **`raw` consumers.** Anything reading `result.raw` is provider-specific by definition and
   will break. Search for it.

4. **Native calls.** `sms.provider.*` is provider-specific. Search for those too.

5. **Currency.** `IRR`, `IRT` and `credit` are not comparable. If you record cost, convert or
   store the unit.

6. **Sender lines.** Line numbers do not transfer between providers.

7. **Message ids.** Formats differ (numeric, GUID, 16-digit string). If you store them,
   `varchar`, not `bigint`.

### Run both first

```ts
const sms = new SMS.Multi({
  providers: { old: oldConfig, new: newConfig },
  routing: { default: 'old' },
});

// Shadow a slice of traffic.
const target = Math.random() < 0.05 ? 'new' : 'old';
await sms.use(target).send({ to, message });
```

Watch delivery rates for a week before moving `routing.default`.

---

## From a provider's own SDK

### From `kavenegar` (npm)

```diff
-const Kavenegar = require('kavenegar');
-const api = Kavenegar.KavenegarApi({ apikey: 'xxx' });
-api.Send({ message: 'hello', sender: '10004346', receptor: '09121234567' },
-  (response, status) => { /* callbacks */ });
+import { SMS } from 'iran-sms';
+const sms = new SMS({ provider: 'kavenegar', credentials: { apiKey: 'xxx' }, sender: '10004346' });
+const result = await sms.send({ to: '09121234567', message: 'hello' });
```

Differences worth knowing:

- Promises, not `(response, status)` callbacks.
- Failures **throw** typed errors instead of arriving as a status argument.
- Every native method is still there under `sms.provider.native.*` — `verifyLookup`,
  `sendArray`, `selectOutbox`, the blacklist family, media, `utils.getDate`.

### From `melipayamak` (npm)

```diff
-const MelipayamakApi = require('melipayamak');
-const api = new MelipayamakApi(username, password);
-const sms = api.sms();
-const result = await sms.send(to, from, text);
+import { SMS } from 'iran-sms';
+const sms = new SMS({ provider: 'melipayamak', credentials: { username, password }, sender: from });
+const result = await sms.send({ to, message: text });
```

Two things the official SDK does that this package does differently, deliberately:

- Its synchronous `Rest` class only `console.log`s the response and returns `undefined`. Here,
  every method returns its result.
- It posts `application/x-www-form-urlencoded`; the documentation specifies
  `application/json`. This package follows the documentation.

The SOAP surface (contacts, voice, tickets, sub-users, campaign bulk, **cancelling a scheduled
send**) is **not** implemented here — see
[API-COVERAGE.md](./API-COVERAGE.md#soap-surface--not-implemented). If you depend on it, keep
the official SDK alongside this one for those calls.

### From `IPE.SmsIr` (.NET) or a hand-rolled SMS.ir client

```diff
-var response = await smsIr.BulkSendAsync(lineNumber, text, mobiles);
-var packId = response.Data.PackId;
+const result = await sms.send({ to: mobiles, message: text });
+const packId = result.batchId;
```

`status: 1` handling is done for you: a `200` carrying `status: 102` becomes
`SMSInsufficientCreditError` rather than a success you have to inspect.

### From a raw `fetch` integration

The usual wins, in the order people notice them:

1. Errors become typed instead of "check `RetStatus`, then check `Value`, then check whether
   `Value` is an id or a status code".
2. Phone numbers stop being a per-provider concern.
3. Timeouts actually abort the socket.
4. Credentials stop appearing in logs.
5. Sends stop being retried by a generic HTTP wrapper that does not know they are unsafe.

---

## Upgrading this package

Follows semver. `0.x` minors may contain breaking changes; see
[CHANGELOG.md](../CHANGELOG.md).

Two things that are _not_ covered by semver, because they are not ours to version:

- **`raw`** is the provider's response. If the provider changes its response, `raw` changes.
- **`nativeStatus`** is the provider's own status value, passed through unmapped.

The normalized fields — `status`, `messageId`, `batchId`, `cost`, `currency` — are versioned.
