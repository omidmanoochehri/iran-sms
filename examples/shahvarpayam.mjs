/**
 * ShahvarPayam — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/shahvarpayam.mjs
 *
 * ShahvarPayam runs the Payamak Panel platform, so the wire protocol is the one documented
 * in docs/providers/melipayamak.md.
 *
 * Platform evidence: docs/provider-relations.md
 */
import { ShahvarPayamProvider } from 'iran-sms/providers/shahvarpayam';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new ShahvarPayamProvider({
  credentials: {
    username: required('SHAHVARPAYAM_USERNAME'),
    password: required('SHAHVARPAYAM_PASSWORD'),
  },
  sender: required('SMS_SENDER'),
});

console.log(`${provider.meta.name} · platform ${provider.meta.platform}`);
console.log(
  'Capabilities:',
  Object.entries(provider.capabilities)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(', '),
);

try {
  const credit = await provider.getBalance();
  console.log(`Credit: ${credit.messageCount ?? credit.amount} ${credit.currency ?? ''}`);

  const senders = await provider.listSenders();
  console.log('Lines:', senders.map((s) => s.number).join(', ') || '(none)');

  const inbox = await provider.listInbox({ pageSize: 5 });
  console.log(`Inbox: ${inbox.items.length}`);
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Sending works exactly as it does for the platform vendor:
 *
 *   await provider.send({ to: '09121234567', message: 'Hello' });
 *   await provider.sendPattern({ to: '09121234567', pattern: '…', variables: { code: '1234' } });
 *
 * See docs/providers/shahvarpayam.md.
 */
