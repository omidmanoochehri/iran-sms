/**
 * AmootSMS — reads only, nothing is sent.
 *
 *   node --env-file=.env examples/amoot.mjs
 *
 * AmootSMS is the only provider here with an API for managing webhooks, and the only one
 * that will generate an OTP code for you and return it.
 */
import { AmootProvider } from 'iran-sms/providers/amoot';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const provider = new AmootProvider({
  credentials: { token: required('AMOOT_TOKEN') },
  sender: required('SMS_SENDER'),
});

console.log(`${provider.meta.name} · API ${provider.meta.apiVersion} · platform ${provider.meta.platform}`);

try {
  // One call returns credit, all six tariffs and the line list
  const status = await provider.native.accountStatus();
  console.log(`Credit: ${status.RemaindCredit} IRR`);
  console.log(`Tariffs — service: ${status.ServiceSMS_PersianPrice} · ads: ${status.AdsSMS_PersianPrice}`);
  console.log('Lines:', JSON.stringify(status.ListLineNumbers));

  // Webhooks, managed over the API — unique to this provider
  const hooks = await provider.listWebhooks();
  console.log(`Webhooks: ${hooks.length}`);
  for (const hook of hooks) console.log(`  [${hook.kind}] ${hook.url} active=${hook.active}`);

  // Contacts, grouped by label
  const groups = await provider.listContactGroups();
  console.log(`Contact labels: ${groups.items.length}`);

  // Patterns (undocumented response shape — raw passthrough)
  const patterns = await provider.native.patternCodeList();
  console.log('Patterns:', JSON.stringify(patterns.Data ?? patterns).slice(0, 120));

  // LBS filter vocabularies
  const brands = await provider.native.lbsGetDeviceBrands();
  console.log('LBS device brands:', JSON.stringify(brands.Data ?? []).slice(0, 100));
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send or mutate:
 *
 *   provider.sendQuickOtp({ to, patternCodeId, codeLength })   // provider generates the code
 *   provider.native.sendWithBackupLine({ … })                  // re-routes for blacklisted numbers
 *   provider.createWebhook({ url, kind: 'delivery' })
 *   provider.native.lbsRequestCreate({ … })                    // polygon campaign
 *   provider.native.btsRequestCreate({ … })                    // cell-tower campaign
 *
 * See docs/providers/amoot.md for the full surface.
 */
