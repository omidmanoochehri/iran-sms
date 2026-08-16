# Webhooks and callbacks

Short version: **one** of the twenty providers lets you manage callback URLs through its API,
a couple more can push events to a URL you configure in their panel, and **none** documents a
signature scheme.

## What each provider actually offers

| Provider      | Register URL via API | Push delivery receipts | Push inbound messages         | Signature         |
| ------------- | -------------------- | ---------------------- | ----------------------------- | ----------------- |
| `amoot`       | ✅                   | ✅                     | ✅                            | ❌ not documented |
| `kavenegar`   | ❌ panel only        | ❌                     | ✅ "Receive via Callback URL" | ❌ not documented |
| everyone else | ❌                   | —                      | —                             | —                 |

Everything else in this package is polled.

## AmootSMS — the one with an API

Two independent relay types, each supporting multiple URLs that can be enabled and disabled
individually.

```ts
const sms = new SMS({ provider: 'amoot', credentials: { token: process.env.AMOOT_TOKEN! } });

// Delivery receipts
const dlr = await sms.webhooks.create({ url: 'https://example.com/hooks/dlr', kind: 'delivery' });

// Inbound messages
const inbound = await sms.webhooks.create({ url: 'https://example.com/hooks/in', kind: 'inbound' });

// Everything registered, both kinds
for (const hook of await sms.webhooks.list()) {
  console.log(hook.kind, hook.url, hook.active);
}

// Turn one off without deleting it
await sms.webhooks.setActive(dlr.id, false, 'delivery');
```

**The payload schema is not published.** AmootSMS documents how to register a URL but not what
it will POST to it. Log the first few requests you receive and build against that; do not
assume it matches any shape in this package.

## Kavenegar — panel-configured

Kavenegar can push received messages to a URL in real time. The URL is set under panel
Settings; there is **no API** to manage it.

Its documentation notes a useful property: if the callback fails for any reason, the message
keeps `isRead = 0`, so you can recover it by polling.

```ts
// Recover anything the callback missed.
const missed = await sms.inbox.list({
  providerOptions: { linenumber: '3000202030', isread: 0 },
});
```

By default this uses `sms/inboxpaged`, which is **non-destructive**. The older `sms/receive`
endpoint marks everything it returns as read — easy to lose data with — so it is opt-in:

```ts
await sms.inbox.list({ providerOptions: { linenumber: '…', destructive: true } });
```

## Why there is no `webhooks.verify()`

You will not find signature verification in this package, for any provider, because **not one
of them documents a signature or shared secret**.

Shipping a `verify()` that returned `true` would be worse than shipping nothing: it would look
like a security control while providing none. So the method does not exist, and this page says
why.

### Securing a callback endpoint anyway

Since the provider will not authenticate itself, do it at your edge:

1. **A secret in the URL path.** The simplest thing that works, and every provider supports it
   because it is just a URL.

   ```ts
   // https://example.com/hooks/sms/8f3a…  — treat the path segment as a bearer token
   app.post('/hooks/sms/:secret', (req, res) => {
     if (!timingSafeEqual(req.params.secret, process.env.SMS_HOOK_SECRET)) {
       return res.sendStatus(404); // 404, not 403 — do not confirm the path exists
     }
     // …
   });
   ```

2. **IP allowlisting**, where the provider publishes its egress addresses. SMS.ir does:
   `185.211.56.44` and `78.158.166.99` (both — they fail over between them).

3. **Treat the payload as untrusted.** Do not act on a delivery receipt alone; use it to
   _prompt_ a read of the authoritative status:

   ```ts
   app.post('/hooks/sms/:secret', async (req, res) => {
     res.sendStatus(200); // acknowledge fast
     const id = extractMessageId(req.body); // hint only
     const status = await sms.messages.getStatus(id); // the source of truth
     await recordDelivery(status);
   });
   ```

4. **Make it idempotent.** Providers retry. Key on the message id.

## Polling instead

For the eighteen providers with no push at all:

```ts
let lastSeen = await loadCursor();

setInterval(async () => {
  const page = await sms.inbox.list({ pageSize: 100 });
  for (const message of page.items) {
    if (message.messageId && message.messageId <= lastSeen) continue;
    await handleInbound(message);
    lastSeen = message.messageId ?? lastSeen;
  }
  await saveCursor(lastSeen);
}, 30_000);
```

Two providers support proper incremental polling rather than re-reading a window:

- **IPPanel** — `providerOptions.filters.from_id` returns only messages after that id.
- **SMS.ir** — `receive/latest` returns the newest N.

Inbox pagination and date-range support vary; the per-provider notes are in
[`providers/`](./providers/).

## If this changes

Provider APIs move. If a provider you use starts documenting webhooks or a signature scheme,
open an issue with a link — this page and the capability matrix will be updated, and
`webhooks.verify()` will be added for that provider only.
