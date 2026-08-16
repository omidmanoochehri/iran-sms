/**
 * Send one message.
 *
 *   node --env-file=.env examples/basic-send.mjs
 *
 * Set SMS_PROVIDER to try a different gateway — nothing else in this file changes.
 */
import { SMS, SMSError } from 'iran-sms';
import { optional, recipient, report, required, show } from './_env.mjs';

const provider = optional('SMS_PROVIDER', 'ippanel');

// Each provider wants a differently-shaped credentials object.
const credentials = {
  ippanel: () => ({ apiKey: required('IPPANEL_API_KEY') }),
  kavenegar: () => ({ apiKey: required('KAVENEGAR_API_KEY') }),
  smsir: () => ({ apiKey: required('SMSIR_API_KEY') }),
  farazsms: () => ({ apiKey: required('FARAZSMS_API_KEY') }),
  amoot: () => ({ token: required('AMOOT_TOKEN') }),
  melipayamak: () => ({
    username: required('MELIPAYAMAK_USERNAME'),
    password: required('MELIPAYAMAK_PASSWORD'),
  }),
}[provider];

if (!credentials) {
  console.error(`This example covers: ${Object.keys(credentials ?? {}).join(', ')}`);
  console.error(`For "${provider}", see docs/providers/${provider}.md for its credential shape.`);
  process.exit(1);
}

const sms = new SMS({
  provider,
  credentials: credentials(),
  sender: required('SMS_SENDER'),
  debug: process.env.DEBUG === 'true',
});

console.log(`Using ${sms.providerInfo.name} (${sms.providerInfo.apiVersion})`);

try {
  const result = await sms.send({
    to: recipient(),
    message: 'سلام! این یک پیام آزمایشی از iran-sms است.',
  });

  show('Sent', result);

  // Delivery is asynchronous — the status right after sending is usually "queued".
  if (result.messageId && sms.supports('deliveryReports')) {
    const status = await sms.messages.getStatus(result.messageId);
    console.log(`\n  delivery   ${status.status} (native: ${status.nativeStatus})`);
  }
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}
