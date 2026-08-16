/**
 * IPPanel's native Edge API — the broadest surface in this package.
 *
 *   node --env-file=.env examples/ippanel-native.mjs
 */
import { IPPanelProvider } from 'iran-sms/providers/ippanel';
import { SMSError } from 'iran-sms';
import { report, required } from './_env.mjs';

const ippanel = new IPPanelProvider({
  credentials: { apiKey: required('IPPANEL_API_KEY') },
  sender: required('SMS_SENDER'),
});

try {
  // --- Who am I ------------------------------------------------------------------------
  const me = await ippanel.native.auth.checkToken();
  console.log(`Account: ${me.user_name} (id ${me.user_id})`);
  console.log(`  reseller: ${me.is_reseller} · send blocked: ${me.send_block}`);

  // --- Credit --------------------------------------------------------------------------
  const balance = await ippanel.getBalance();
  console.log(`Credit: ${balance.amount} ${balance.currency}`);

  // --- Tariffs -------------------------------------------------------------------------
  // Per-operator pricing, split by Persian vs English message body.
  const tariff = await ippanel.native.tariff();
  console.log(`Tariff rows: ${tariff.length}`);

  // --- Lines ---------------------------------------------------------------------------
  const senders = await ippanel.listSenders();
  console.log(`Lines: ${senders.map((s) => s.number).join(', ') || '(none)'}`);

  // --- Price a message before sending it -----------------------------------------------
  const price = await ippanel.native.calculatePrice({
    number: required('SMS_SENDER'),
    message: 'تست',
  });
  console.log(`Price: MCI ${price.mci_price} · other ${price.other_price} · parts ${price.parts}`);

  // --- Demographic targeting reference data ---------------------------------------------
  // IPPanel can send to every number in a province, county, city, postal code or job
  // category. These endpoints let you size a campaign before paying for it.
  const provinces = await ippanel.native.provincesV2();
  console.log(`Provinces: ${provinces.length}`);

  const tehran = provinces.find((p) => p.name === 'تهران');
  if (tehran) {
    const counts = await ippanel.native.recipientCounts({ province_id: tehran.id, pre: '912' });
    console.log(`Tehran, prefix 912 → MCI ${counts.mci_count}, Irancell ${counts.irancell_count}`);
  }

  const categories = await ippanel.native.jobCategories();
  console.log(
    `Job categories: ${categories
      .map((c) => c.name)
      .slice(0, 3)
      .join(', ')}…`,
  );

  // --- Patterns -------------------------------------------------------------------------
  const patterns = await ippanel.listPatterns({ pageSize: 5 });
  console.log(`Patterns: ${patterns.total ?? patterns.items.length}`);
  for (const pattern of patterns.items) {
    console.log(`  ${pattern.code} [${pattern.status}] vars: ${pattern.variables.join(', ') || '—'}`);
  }

  // --- Phonebooks -----------------------------------------------------------------------
  const phonebooks = await ippanel.listContactGroups({ pageSize: 5 });
  console.log(`Phonebooks: ${phonebooks.total ?? phonebooks.items.length}`);

  // --- Drafts ("default messages") ------------------------------------------------------
  const draftGroups = await ippanel.native.listDraftGroups();
  console.log(`Draft groups: ${draftGroups.length}`);

  // --- Support tickets ------------------------------------------------------------------
  const tickets = await ippanel.native.listTickets({ per_page: 3 });
  console.log(`Tickets: ${Array.isArray(tickets) ? tickets.length : 0}`);
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send, cost money, or mutate:
 *
 *   ippanel.native.send({ sending_type: 'file', … })          // any of the 14 send types
 *   ippanel.native.sendByPostalCode({ … })                    // demographic campaign
 *   ippanel.native.sendByGeolocation({ … })
 *   ippanel.native.sendByJob({ … })
 *   ippanel.sendVoice({ to, message: '45852' })               // voice OTP
 *   ippanel.native.createUser({ … })                          // reseller sub-account
 *   ippanel.native.assignNumber({ … })
 *   ippanel.native.createTicket({ subject, category_id, description })
 *
 * 88 of the 89 documented operations are reachable — see docs/API-COVERAGE.md.
 */
