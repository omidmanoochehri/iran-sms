/**
 * MeliPayamak — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/melipayamak.mjs
 *
 * MeliPayamak is the platform vendor for the Payamak Panel family. Note that its template
 * send does NOT substitute variables — you send the fully rendered text and the platform
 * checks it against the approved template.
 */
import { MeliPayamakProvider } from 'iran-sms/providers/melipayamak';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new MeliPayamakProvider({
  credentials: {
    username: required('MELIPAYAMAK_USERNAME'),
    password: required('MELIPAYAMAK_PASSWORD'),
  },
  sender: required('SMS_SENDER'),
});

console.log(`${provider.meta.name} · API ${provider.meta.apiVersion} · platform ${provider.meta.platform}`);

try {
  // Credit in two units
  const credit = await provider.getBalance();
  console.log(`Credit: ${credit.messageCount} messages`);

  const rial = await provider.getBalanceRial();
  console.log(`Credit: ${rial.amount} IRR`);

  // Base tariff
  const base = await provider.native.getBasePrice();
  console.log('Base price:', base.Value);

  // Sender lines
  const senders = await provider.listSenders();
  console.log('Lines:', senders.map((s) => s.number).join(', ') || '(none)');

  // Inbox
  const inbox = await provider.listInbox({ pageSize: 5 });
  console.log(`Inbox: ${inbox.items.length}`);

  // Unread count
  const unread = await provider.native.getInboxCount(false);
  console.log('Unread:', unread.Value);

  // Public status lookup — needs no credentials at all, just a record id
  // await provider.getPublicStatus('1234567890123456');
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send or mutate:
 *
 *   provider.sendOtp({ to, code })                       // no approved text needed
 *   provider.native.baseServiceNumber({ text, to, bodyId })  // rendered template
 *   provider.native.smart.send({ to, text, from, fromSupportOne, fromSupportTwo })
 *
 * See docs/providers/melipayamak.md for the full surface.
 */
