# Sending

## One message

```ts
const result = await sms.send({ to: '09121234567', message: 'Hello' });
```

## Many recipients, one text

```ts
await sms.messages.sendBulk({
  to: ['09121234567', '09351234567', '09131234567'],
  message: 'Hello everyone',
});
```

Per-call recipient caps are enforced **locally**, so you get a precise error instead of a
provider status code:

| Provider                               |      Cap | Error if exceeded               |
| -------------------------------------- | -------: | ------------------------------- |
| Kavenegar                              |      200 | `SMSValidationError` code `414` |
| SMS.ir                                 |      100 | `SMSValidationError` code `105` |
| MeliPayamak family (`SendMultipleSMS`) | 100 rows | `SMSValidationError`            |

Chunk larger lists yourself — the package will not silently split a send, because that would
turn one call into several billing events without telling you.

## A different text per recipient

```ts
await sms.messages.sendPeerToPeer([
  { to: ['09121234567', '09351234567'], message: 'Group A message' },
  { to: '09131234567', message: 'Group B message' },
]);
```

Maps onto each provider's own mechanism — IPPanel `peer_to_peer`, Kavenegar `sms/sendarray`,
SMS.ir `likeTolike`, Payamak Panel `SendMultipleSMS`, AmootSMS `SendPeerToPeer`.

## Scheduling

```ts
await sms.messages.schedule({
  to: '09121234567',
  message: 'Reminder',
  scheduleAt: new Date('2027-03-12T21:20:02Z'),
});
```

A past `scheduleAt` throws `SMSValidationError` before any request is made.

### Timezones — read this

The providers disagree, and several simply do not say. What this package does, and why:

| Provider                    | Wire format           | Timezone        | Basis                                                             |
| --------------------------- | --------------------- | --------------- | ----------------------------------------------------------------- |
| IPPanel                     | `YYYY-MM-DD HH:mm:ss` | **UTC**         | Explicitly documented                                             |
| Kavenegar                   | Unix seconds          | n/a             | Unambiguous; `utils/getdate` exposes the server clock             |
| SMS.ir                      | Unix seconds          | n/a             | Documented as UTC                                                 |
| FarazSMS                    | ISO-8601 with `Z`     | UTC             | Examples show both ISO and naive; ISO is unambiguous              |
| MeliPayamak family          | `yyyy-MM-dd HH:mm:ss` | **Asia/Tehran** | Undocumented — see below                                          |
| AmootSMS                    | `yyyy-MM-dd HH:mm:ss` | **Asia/Tehran** | Undocumented — see below                                          |
| Mizban SMS                  | `yyyy-MM-dd HH:mm:ss` | **Asia/Tehran** | Undocumented                                                      |
| Mediana / `ippanel-rest-v1` | —                     | —               | **No scheduling** — `scheduleAt` throws rather than being dropped |

Where a provider documents no timezone, this package interprets naive datetimes as
**Asia/Tehran**. These are Iran-local platforms, and MeliPayamak's own "07:00–22:00 window"
error on template scheduling only makes sense in local time. Conversion uses `Intl` with the
real `Asia/Tehran` zone rather than a hard-coded +03:30, so historical dates and any future
DST change stay correct.

If you would rather be explicit, pass a string and it is forwarded verbatim:

```ts
await sms.messages.schedule({
  to: '09121234567',
  message: 'x',
  scheduleAt: '2027-03-12 21:20:02', // sent exactly as written
});
```

### Cancelling

```ts
if (sms.supports('cancelScheduled')) {
  await sms.messages.cancelScheduled(result.batchId!);
}
```

Only IPPanel, Kavenegar and SMS.ir expose this over REST. On the MeliPayamak family it exists
only over SOAP, which this package does not implement — see
[API-COVERAGE.md](./API-COVERAGE.md#soap-surface--not-implemented).

## Voice

```ts
if (sms.supports('voice')) {
  await sms.voice.send({ to: '09121234567', message: 'Your code is 1 2 3 4' });
}
```

The semantics differ enough to be worth knowing:

- **Kavenegar** — `call/maketts` reads the text aloud. Verify Lookup with `type: 'call'` also
  works, but only when the token is all digits.
- **IPPanel** — `votp`, where `message` is the digit string to read out. One recipient.
- **FarazSMS** — plays a **pre-uploaded audio file**. Upload with
  `provider.native.uploadVoiceFile(...)` first and pass the returned `file_id` as `message`;
  passing text raises a clear error rather than sending nonsense.

## The result

```ts
{
  success: true,
  provider: 'ippanel',
  messageId: '1123544244',   // null when the provider only returns a batch id
  batchId: '1123544244',
  recipients: ['+989121234567'],   // as actually sent
  status: 'queued',
  cost: null,
  currency: 'IRR',
  raw: { /* the provider's untouched response */ }
}
```

`messageId` is only set when it identifies **one** message. A bulk send to five recipients
that returns a single batch identifier leaves `messageId` as `null` and puts the identifier in
`batchId` — because using a batch id where a message id is expected produces confusing report
lookups later.

`cost` is in `currency`, and the providers genuinely differ: Kavenegar and IPPanel report
Rial (`IRR`), FarazSMS reports Toman (`IRT`), SMS.ir and the Payamak Panel family report
message credits (`credit`). Never sum across providers without converting.

`status` is normalized to: `queued`, `scheduled`, `sent`, `delivered`, `undelivered`,
`failed`, `blocked`, `cancelled`, `unknown`. The provider's own value is preserved in `raw`,
and in `parts[].nativeStatus` where per-recipient detail exists.

## Delivery reports

```ts
const status = await sms.messages.getStatus(result.messageId!);
// { status: 'delivered', nativeStatus: 10, deliveredAt: Date, raw: {...} }
```

`nativeStatus` is the provider's own code, unmapped. Two providers —
AmootSMS and Mizban SMS — publish no delivery-code table at all; for those, `status` is
`'unknown'` and `nativeStatus` carries whatever the API returned. Inventing a mapping would
mean telling you a message was delivered on no evidence.

## Escape hatch

`providerOptions` is merged into the request after mapping, for anything the unified shape
does not cover:

```ts
await sms.send({
  to: '09121234567',
  message: 'x',
  providerOptions: { hide: 1, tag: 'signup-flow' }, // Kavenegar-specific
});
```
