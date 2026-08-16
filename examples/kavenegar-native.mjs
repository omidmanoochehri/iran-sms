/**
 * Kavenegar's native API — the parts no unified abstraction covers.
 *
 *   node --env-file=.env examples/kavenegar-native.mjs
 *
 * Importing the provider directly gives full type completion and does not load the other
 * nineteen adapters.
 */
import { KavenegarProvider } from 'iran-sms/providers/kavenegar';
import { SMSError } from 'iran-sms';
import { optional, report, required } from './_env.mjs';

const kavenegar = new KavenegarProvider({
  credentials: { apiKey: required('KAVENEGAR_API_KEY') },
  sender: required('SMS_SENDER'),
});

try {
  // --- Server clock -------------------------------------------------------------------
  // Every date field in this API is Unix time. `utils/getdate` is callable with the API key
  // "0", so it is a free way to align scheduled sends with the provider's clock.
  const date = await kavenegar.native.getDate();
  console.log('Server time:', date.datetime, `(unix ${date.unixtime})`);

  // --- Account ------------------------------------------------------------------------
  const info = await kavenegar.native.accountInfo();
  console.log(`Credit: ${info.remaincredit} IRR · account type: ${info.type}`);

  // --- Account configuration ----------------------------------------------------------
  // Read the current settings. `debugmode` is genuinely useful: with it enabled the account
  // accepts sends and marks them cancelled instead of delivering, which makes integration
  // testing free.
  const config = await kavenegar.native.accountConfig();
  console.log('Config:', {
    defaultsender: config.defaultsender,
    debugmode: config.debugmode,
    resendfailed: config.resendfailed,
  });

  // --- Verification templates ---------------------------------------------------------
  // Kavenegar is one of only three providers here with full template CRUD over the API.
  const templates = await kavenegar.native.templateList();
  console.log(`Templates: ${templates.length}`);
  for (const template of templates.slice(0, 5)) {
    console.log(`  ${template.name} — ${template.approvalStatus}`);
  }

  // --- Blacklist ----------------------------------------------------------------------
  // Full CRUD, which is rare. Note that numbers blocked by the operator opt-out flow
  // («لغو ۱۱») cannot be removed — only ones you or the panel added.
  const line = optional('KAVENEGAR_LINE', required('SMS_SENDER'));
  const blocked = await kavenegar.native.blockedList({ linenumber: line, pagenumber: 1 });
  console.log(`Blocked on ${line}: ${blocked.length}`);

  // --- Outbox -------------------------------------------------------------------------
  // `latestoutbox` needs no date range. `selectoutbox` does, and rejects windows wider than
  // a day or start dates older than four days.
  const recent = await kavenegar.native.latestOutbox(10);
  console.log(`Recent sends: ${recent.length}`);
  for (const message of recent.slice(0, 3)) {
    console.log(`  ${message.messageid} → ${message.receptor} [${message.statustext}] ${message.cost} IRR`);
  }

  // --- Counting -----------------------------------------------------------------------
  const startdate = date.unixtime - 24 * 60 * 60;
  const counts = await kavenegar.native.countOutbox(startdate);
  console.log('Last 24h:', counts);
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Not exercised here because they send or mutate:
 *
 *   kavenegar.native.verifyLookup({ receptor, template, token })   // OTP
 *   kavenegar.native.sendArray({ receptor, sender, message })      // JSON arrays
 *   kavenegar.native.makeTTS({ receptor, message })                // text-to-speech call
 *   kavenegar.native.addTemplate({ name, sourceType, sendMethod, textMessage })
 *   kavenegar.native.blockedAdd(linenumber, receptor)
 *   kavenegar.native.blockedRemove(linenumber, receptor)           // HTTP DELETE
 *   kavenegar.native.mediaUpload(blob)                             // multipart
 *
 * All 32 documented operations are on `native` — see docs/providers/kavenegar.md.
 */
