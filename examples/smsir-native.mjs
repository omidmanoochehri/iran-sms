/**
 * SMS.ir's native API, including its sandbox.
 *
 *   node --env-file=.env examples/smsir-native.mjs
 *
 * SMS.ir has the cleanest sandbox story of any provider here: create a key of type Sandbox
 * in the panel and use the *same* URLs. Sends are simulated — no message, no cost, no report.
 */
import { SmsIrProvider } from 'iran-sms/providers/smsir';
import { SMSError } from 'iran-sms';
import { optional, report, required } from './_env.mjs';

const smsir = new SmsIrProvider({
  credentials: { apiKey: required('SMSIR_API_KEY') },
  sender: required('SMS_SENDER'),
});

const isSandbox = optional('SMSIR_SANDBOX', 'false') === 'true';

try {
  // --- Credit and lines -----------------------------------------------------------------
  const credit = await smsir.native.getCredit();
  console.log('Credit:', credit.data);

  const lines = await smsir.native.getLines();
  console.log('Lines:', lines.data);

  // --- Today's sends --------------------------------------------------------------------
  // `live` is today; `archive` covers up to the end of yesterday. pageSize maxes out at 100.
  const live = await smsir.native.getLiveReport({ pageNumber: 1, pageSize: 10 });
  console.log(`Sent today: ${live.data?.length ?? 0}`);
  for (const message of (live.data ?? []).slice(0, 3)) {
    console.log(
      `  ${message.messageId} → ${message.mobile} state ${message.deliveryState} cost ${message.cost}`,
    );
  }

  // --- Packs --------------------------------------------------------------------------
  // Every bulk send returns a packId. It is the unit of reporting *and* of cancellation —
  // cancelling a scheduled pack refunds the credit and tells you how much.
  const packs = await smsir.native.getSendPacks(1, 5);
  console.log(`Recent packs: ${packs.data?.length ?? 0}`);
  for (const pack of packs.data ?? []) {
    console.log(`  ${pack.packId} · ${pack.recipientCount} recipients`);
  }

  // --- Inbound --------------------------------------------------------------------------
  const received = await smsir.native.getLatestReceives(5);
  console.log(`Latest inbound: ${received.data?.length ?? 0}`);

  // --- Sandbox send ---------------------------------------------------------------------
  if (isSandbox) {
    // In sandbox there is exactly one template: id 123456, text «کد تایید شما: #CODE#».
    const result = await smsir.native.verifySend({
      mobile: required('SMS_INTEGRATION_RECIPIENT').replace(/^0/, ''),
      templateId: 123456,
      parameters: [{ name: 'CODE', value: '12345' }],
    });
    console.log('Sandbox verify send:', result.data);
  } else {
    console.log('\nSet SMSIR_SANDBOX=true (with a Sandbox API key) to exercise a simulated send.');
  }
} catch (error) {
  if (error instanceof SMSError) report(error);
  else throw error;
}

/**
 * Worth knowing about SMS.ir:
 *
 * - Two error layers. A 200 can carry `status: 102` (insufficient credit). This package
 *   checks both and raises the right typed error either way.
 * - Hard caps of 100 mobiles and 100 texts per call, enforced locally so you get a precise
 *   message instead of status 105/106.
 * - Verify (template) sending is the only method that reaches blacklisted numbers.
 * - Published egress IPs for firewall allowlists: 185.211.56.44 and 78.158.166.99 — allow
 *   both, they fail over between them.
 *
 * All 16 documented operations are on `native` — see docs/providers/smsir.md.
 */
