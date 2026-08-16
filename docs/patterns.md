# Patterns and templates

Pattern sending is how OTP and transactional traffic actually gets delivered in Iran. It is
faster than ordinary sending, it is not subject to content filtering, and on several
providers it is the only route that reaches numbers which have opted out of promotional SMS.

Every provider calls it something different and passes variables differently. This is the
part of the abstraction that earns its keep.

## The same concept, seven wire formats

| Provider    | Called                | Identifier                  | Variables on the wire                                              |
| ----------- | --------------------- | --------------------------- | ------------------------------------------------------------------ |
| IPPanel     | pattern               | string `code`               | `params`: object keyed by name                                     |
| FarazSMS    | pattern               | string `code`               | `attributes`: object keyed by name                                 |
| Mediana     | pattern               | string `pattern_code`       | `values`: object keyed by name                                     |
| SMS.ir      | template / Verify     | **numeric** `templateId`    | `parameters`: **array** of `{name, value}`                         |
| Kavenegar   | verification template | template **name**           | five flat slots: `token`, `token2`, `token3`, `token10`, `token20` |
| MeliPayamak | base service number   | **numeric** `bodyId`        | **none** — you send the fully rendered text                        |
| AmootSMS    | pattern               | **numeric** `PatternCodeID` | `PatternValues`: comma-separated, **positional**                   |

## The unified call

```ts
await sms.patterns.send({
  to: '09121234567',
  pattern: 'login',
  variables: { code: '123456', name: 'Omid' },
});
```

## The pattern registry

Map one logical name to each provider's code once, then never think about it again:

```ts
const sms = new SMS({
  provider: process.env.SMS_PROVIDER!,
  credentials: {/* … */},

  patterns: {
    login: {
      ippanel: 'fg88js0v32',
      farazsms: 'abCD1289',
      smsir: 187543,
      kavenegar: 'login',
      mediana: 'zx99qq',
      melipayamak: { code: 94651, body: 'کد ورود شما %code% است' },
      amoot: { code: 4021, variableOrder: ['name', 'code'] },
    },

    'order-shipped': {
      ippanel: 'op22ka91',
      smsir: 187544,
    },
  },
});
```

Now switching provider is a config change:

```ts
await sms.patterns.send({ to: user.mobile, pattern: 'login', variables: { code } });
```

A raw provider code still works and bypasses the registry entirely:

```ts
await sms.patterns.send({ to: '09121234567', pattern: 'fg88js0v32', variables: { code } });
```

A logical name with no entry for the active provider raises a clear error:

```
SMSPatternError: Pattern "login" has no code configured for provider "kavenegar".
It is configured for: ippanel, smsir.
```

## Two providers need more than a code

### AmootSMS — `variableOrder` is required

AmootSMS sends values as a comma-separated `PatternValues` string. Variable names never reach
the wire, so order is the only thing that binds a value to a placeholder.

Object key order is an implementation detail of _your_ code. Relying on it would mean that
reordering a literal — or building the object from a `Map`, or a JSON parse — could silently
send a customer the wrong values, with no error anywhere. So this package refuses to guess:

```ts
patterns: {
  login: { amoot: { code: 4021, variableOrder: ['name', 'code'] } },
}
```

Without it, more than one variable raises:

```
SMSPatternError: Provider "amoot" sends pattern variables positionally, but pattern "login"
has 2 variables and no `variableOrder` configured. Add one to the pattern registry, e.g.
patterns: { "login": { "amoot": { code: "…", variableOrder: ["name", "code"] } } }
```

A single variable is unambiguous and needs no order.

### MeliPayamak family — `body` is required

The Payamak Panel platform does **not** substitute variables server-side. You send the fully
rendered text alongside the numeric `bodyId`, and the platform checks it against the approved
template (error `-5` if it does not match).

Register the approved text and this package renders it for you:

```ts
patterns: {
  login: { melipayamak: { code: 94651, body: 'کد ورود شما %code% است' } },
}
```

`%name%`, `{name}`, `{{name}}` and `#name#` placeholders are all supported.

Or render it yourself:

```ts
await sms.patterns.send({
  to: '09121234567',
  pattern: 'login',
  providerOptions: { text: 'کد ورود شما 123456 است' },
});
```

Without either, the error tells you exactly what to add rather than sending something the
platform will reject.

## Kavenegar's token slots

Kavenegar has exactly **five** slots — `token`, `token2`, `token3`, `token10`, `token20` — and
they are not interchangeable:

| Slot                        | Max spaces | Max length |
| --------------------------- | ---------: | ---------: |
| `token`, `token2`, `token3` |          0 |        100 |
| `token10`                   |          5 |        100 |
| `token20`                   |          8 |        100 |

Variables are assigned in `variableOrder` if configured, otherwise in declaration order. The
rules are enforced **before** the request, so you get:

```
SMSPatternError: Kavenegar token "token" allows 0 space(s) but the value contains 1.
Use token10 (5 spaces) or token20 (8 spaces) for values with spaces.
```

rather than a bare `431` from the API. Newlines and underscores are rejected for the same
reason, and more than five variables is a hard error.

> Third-party guides often describe `token2` … `token20` as a contiguous range. The official
> documentation is explicit that only those five suffixes exist.

## Managing patterns through the API

```ts
if (sms.supports('patternManagement')) {
  const page = await sms.patterns.list();
  const pattern = await sms.patterns.get('fg88js0v32');
  await sms.patterns.create({ body: 'کد شما %code%', variables: ['code'], description: '…' });
  await sms.patterns.update('fg88js0v32', { body: 'کد جدید %code%' });
  await sms.patterns.delete('fg88js0v32');
}
```

Only **IPPanel**, **FarazSMS** and **Kavenegar** offer full CRUD. Mediana and its family can
create only; `sms.patterns.create()` works for them even though `supports('patternManagement')`
is `false`. Everyone else creates patterns in the panel.

Newly created patterns are `pending` until the operator approves them. Sending with an
unapproved pattern raises `SMSPatternError`.

## Provider notes

- **Almost every provider allows exactly one recipient per pattern send.** Sending to a list
  raises `SMSValidationError` before the request. Loop, and expect one billing event each.
- **SMS.ir** caps parameter _values_ at 25 characters and requires a numeric `templateId`.
- **Mediana** enforces an 08:00–23:00 sending window platform-wide (error `10019`).
- **AmootSMS** additionally offers `sendQuickOtp`, where the **provider generates the code**
  and returns it:

  ```ts
  const { code } = await amoot.sendQuickOtp({ to: '09121234567', patternCodeId: 42, codeLength: 6 });
  ```

- **MeliPayamak** also has `SendOTP`, which needs no approved template at all — just the
  code. Reach it with `provider.sendOtp({ to, code })`.

## Security

OTP values are treated as live credentials while they are valid. They are masked in debug
output and in event payloads:

```
body: { code: '****', mobile: '09121234567' }
```
