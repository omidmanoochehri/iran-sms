/**
 * YekPayamak — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/yekpayamak.mjs
 *
 * YekPayamak runs the IPPanel rest/v1 platform, so the wire protocol is the one documented
 * in docs/providers/mediana.md. Its API host is not published, so you must
 * supply request.baseUrl from your own panel.
 *
 * Platform evidence: docs/provider-relations.md
 */
import { YekPayamakProvider } from 'iran-sms/providers/yekpayamak';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new YekPayamakProvider({
  credentials: { apiKey: required('YEKPAYAMAK_API_KEY') },
  // This deployment publishes no API host, so the package will not guess one.
  request: { baseUrl: required('YEKPAYAMAK_BASE_URL') },
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
  console.log(`Credit: ${credit.amount} ${credit.currency}`);

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
 * See docs/providers/yekpayamak.md.
 */
