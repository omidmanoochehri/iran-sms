/**
 * Mediana SMS — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/mediana.mjs
 *
 * Mediana runs the IPPanel rest/v1 generation. Its official SDK's hard-coded host no longer
 * resolves, so you must supply your account's endpoint via request.baseUrl.
 *
 * Note the platform-wide 08:00–23:00 sending window (error 10019).
 */
import { MedianaProvider } from 'iran-sms/providers/mediana';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new MedianaProvider({
  credentials: { apiKey: required('MEDIANA_API_KEY') },
  // No published API host — supply your account's endpoint.
  request: { baseUrl: required('MEDIANA_BASE_URL') },
  sender: required('SMS_SENDER'),
});

console.log(`${provider.meta.name} · API ${provider.meta.apiVersion} · platform ${provider.meta.platform}`);

try {
  const balance = await provider.getBalance();
  console.log(`Credit: ${balance.amount} ${balance.currency}`);

  const inbox = await provider.listInbox({ pageSize: 5 });
  console.log(`Inbox: ${inbox.items.length} (total ${inbox.total ?? '?'})`);
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send or mutate:
 *
 *   provider.native.send({ originator, recipients, message })
 *   provider.native.sendPattern({ pattern_code, originator, recipient, values })
 *   provider.native.createPattern('کد شما %code%', false)
 *
 * See docs/providers/mediana.md for the full surface.
 */
