# Getting started

## Install

```bash
npm install iran-sms
```

Node 18.17 or newer. No runtime dependencies.

## Send a message

```ts
import { SMS } from 'iran-sms';

const sms = new SMS({
  provider: 'ippanel',
  credentials: { apiKey: process.env.IPPANEL_API_KEY! },
  sender: '+983000505',
});

const result = await sms.send({
  to: '09121234567',
  message: 'سلام!',
});

console.log(result.messageId, result.status);
```

CommonJS works too:

```js
const { SMS } = require('iran-sms');
```

## Send an OTP

Use `patterns`, not `send`. Every Iranian gateway routes template traffic differently — it is
faster, it is not filtered, and on several providers it is the only path that reaches numbers
which have opted out of promotional SMS.

```ts
await sms.patterns.send({
  to: '09121234567',
  pattern: 'my-provider-pattern-code',
  variables: { code: '183942' },
});
```

Once you have more than one provider, stop hard-coding the code — see
[patterns.md](./patterns.md).

## Check what a provider can do

Providers differ. Ask, rather than assuming:

```ts
sms.supports('pattern'); // true
sms.supports('voice'); // depends on the provider
sms.capabilities; // the whole map
```

Calling something a provider does not support raises a typed error naming the capability,
never a `TypeError`:

```ts
import { SMSUnsupportedFeatureError } from 'iran-sms';

try {
  await sms.contacts.list();
} catch (error) {
  if (error instanceof SMSUnsupportedFeatureError) {
    console.log(`${error.provider} cannot do ${error.feature}`);
  }
}
```

## Handle errors

```ts
import { SMSInsufficientCreditError, SMSRecipientError, SMSError } from 'iran-sms';

try {
  await sms.send({ to: '09121234567', message: 'hello' });
} catch (error) {
  if (error instanceof SMSInsufficientCreditError) {
    await alertOps('SMS balance exhausted');
  } else if (error instanceof SMSRecipientError) {
    await markNumberInvalid();
  } else if (error instanceof SMSError) {
    console.error(error.provider, error.code, error.message);
    console.error(error.raw); // the provider's untouched response
  }
}
```

Full hierarchy: [errors.md](./errors.md).

## Reach the provider's own API

The unified API covers what providers have in common. Everything else is still there:

```ts
// Kavenegar's blacklist API, which most providers don't have
await sms.provider.addToBlacklist('10004346', ['09121234567']);

// Or the raw documented method
await sms.provider.native;
```

For full type completion, import the provider directly:

```ts
import { KavenegarProvider } from 'iran-sms/providers/kavenegar';

const kavenegar = new KavenegarProvider({
  credentials: { apiKey: process.env.KAVENEGAR_API_KEY! },
  sender: '10004346',
});

await kavenegar.native.verifyLookup({
  receptor: '09121234567',
  template: 'login',
  token: '123456',
});
```

This also avoids loading the other nineteen adapters.

## Phone numbers

Pass numbers in whatever shape you have them. Each adapter converts to the format its
provider expects — E.164 for IPPanel, national for Kavenegar, bare significant digits for
SMS.ir:

```ts
// All of these reach the same handset.
await sms.send({ to: '09121234567', message: 'x' });
await sms.send({ to: '+989121234567', message: 'x' });
await sms.send({ to: '۰۹۱۲۱۲۳۴۵۶۷', message: 'x' }); // Persian digits
await sms.send({ to: '0912 123 4567', message: 'x' });
```

The utilities are exported if you need them yourself:

```ts
import { parsePhone, formatPhone, detectOperator } from 'iran-sms/phone';

parsePhone('09121234567').operator; // 'mci'
formatPhone('09121234567', 'e164'); // '+989121234567'
detectOperator('09351234567'); // 'irancell'
```

## Next

- [configuration.md](./configuration.md) — every option
- [sending.md](./sending.md) — bulk, peer-to-peer, scheduling
- [patterns.md](./patterns.md) — the pattern registry
- [providers.md](./providers.md) — per-provider notes
- [provider-matrix.md](./provider-matrix.md) — the capability table
