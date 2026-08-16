/**
 * Mizban SMS — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/mizbansms.mjs
 *
 * Mizban publishes a 226-path Swagger covering its entire panel backend. Twelve
 * customer-facing methods are typed here; everything else is reachable through native.raw().
 *
 * Note: Mizban has NO template/pattern send — see docs/providers/mizbansms.md.
 */
import { MizbanSmsProvider } from 'iran-sms/providers/mizbansms';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new MizbanSmsProvider({
  credentials: {
    username: required('MIZBANSMS_USERNAME'),
    password: required('MIZBANSMS_PASSWORD'),
  },
  sender: required('SMS_SENDER'),
});

console.log(`${provider.meta.name} · API ${provider.meta.apiVersion} · platform ${provider.meta.platform}`);

try {
  const balance = await provider.getBalance();
  console.log(`Credit: ${balance.amount ?? '?'}`);

  const senders = await provider.listSenders();
  console.log('Lines:', senders.map((s) => s.number).join(', ') || '(none)');

  // How many SMS parts will this text use?
  const counter = await provider.native.smsCounter('سلام، این یک پیام آزمایشی است');
  console.log('Part count:', JSON.stringify(counter.data));

  // Anything in the 226-path surface is reachable, untyped
  // await provider.native.raw('/api/Report/ReportSendSms', { page: 1 }, true);

  console.log('supports("pattern"):', provider.supports('pattern'), '— Mizban publishes no template API');
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send or mutate:
 *
 *   provider.native.sendSMS({ message, from, to, api })
 *   provider.native.sendSMSFuture({ message, sendDate, from, to })
 *   provider.native.smartSendSMS({ message, to })
 *
 * See docs/providers/mizbansms.md for the full surface.
 */
