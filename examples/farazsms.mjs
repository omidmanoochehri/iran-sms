/**
 * FarazSMS / IranPayamak — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/farazsms.mjs
 *
 * FarazSMS is the only provider here that publishes a complete OpenAPI document, and the only
 * one with LBS campaigns — sending to people physically inside a lat/long radius during a
 * time window, filtered by dwell event, gender, age and device OS.
 */
import { FarazSMSProvider } from 'iran-sms/providers/farazsms';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new FarazSMSProvider({
  credentials: { apiKey: required('FARAZSMS_API_KEY') },
  sender: required('SMS_SENDER'),
});

console.log(`${provider.meta.name} · API ${provider.meta.apiVersion} · platform ${provider.meta.platform}`);

try {
  // Account
  const balance = await provider.getBalance();
  console.log(`Balance: ${balance.amount} IRT (${balance.messageCount} messages)`);

  const profile = await provider.native.profile();
  console.log('Profile:', profile.data?.displayName, '· verified:', profile.data?.verified);

  // Sender lines
  const lines = await provider.native.lines();
  console.log('Lines:', JSON.stringify(lines.data).slice(0, 120));

  // Patterns
  const patterns = await provider.listPatterns({ pageSize: 5 });
  console.log(`Patterns: ${patterns.total ?? patterns.items.length}`);

  // Phonebooks
  const phonebooks = await provider.native.phonebook.list({ limit: 5 });
  console.log('Phonebooks:', phonebooks.data?.totalItems ?? 0);

  // Location-based campaigns — unique to this provider
  const campaigns = await provider.native.lbs.list();
  console.log('LBS campaigns:', Array.isArray(campaigns.data) ? campaigns.data.length : 0);

  // Reference data for targeted sends (note: no /ws/v1 prefix on these)
  const provinces = await provider.native.reference.provinces(true);
  console.log('Provinces with number banks:', provinces.data?.totalItems ?? 0);
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send or mutate:
 *
 *   provider.native.sendPattern({ code, recipient, attributes, line_number, number_format })
 *   provider.native.sendToNumberBank({ text, recipients, line_number })
 *   provider.native.uploadVoiceFile(form) then provider.native.sendVoice({ file_id, recipients })
 *   provider.native.lbs.create({ text, latitude, longitude, radius, … })
 *
 * See docs/providers/farazsms.md for the full surface.
 */
