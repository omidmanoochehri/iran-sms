/**
 * CommonJS usage.
 *
 *   node --env-file=.env examples/commonjs.cjs
 *
 * The package ships both ESM and CommonJS builds. Everything works the same; only the import
 * syntax differs. Top-level `await` is not available in CJS, so this wraps in `main()`.
 */
const { SMS, parsePhone, SMSError, SMSUnsupportedFeatureError } = require('iran-sms');
const { KavenegarProvider } = require('iran-sms/providers/kavenegar');

async function main() {
  // --- Things that need no credentials -------------------------------------------------
  console.log('Providers:', SMS.providers().length);
  console.log('Has kavenegar:', SMS.hasProvider('kavenegar'));
  console.log('Alias resolution:', SMS.describeProvider('sms.ir').id);

  const parsed = parsePhone('+98 912 123 4567');
  console.log('Parsed:', parsed.significant, '·', parsed.operator);

  // Capabilities are available synchronously, without constructing a client.
  const meta = SMS.describeProvider('kavenegar');
  console.log('Kavenegar supports voice:', meta.capabilities.voice);

  if (!process.env.KAVENEGAR_API_KEY) {
    console.log('\nSet KAVENEGAR_API_KEY to exercise the live calls.');
    return;
  }

  // --- Unified client -------------------------------------------------------------------
  const sms = new SMS({
    provider: 'kavenegar',
    credentials: { apiKey: process.env.KAVENEGAR_API_KEY },
    sender: process.env.SMS_SENDER,
  });

  const balance = await sms.account.getBalance();
  console.log(`Credit: ${balance.amount} ${balance.currency}`);

  // Unsupported capabilities raise a typed error, never a TypeError.
  try {
    await sms.contacts.list();
  } catch (error) {
    if (error instanceof SMSUnsupportedFeatureError) {
      console.log(`As expected: ${error.provider} has no "${error.feature}"`);
    }
  }

  // --- Direct provider import ------------------------------------------------------------
  const kavenegar = new KavenegarProvider({
    credentials: { apiKey: process.env.KAVENEGAR_API_KEY },
    sender: process.env.SMS_SENDER,
  });

  const date = await kavenegar.native.getDate();
  console.log('Server time:', date.datetime);
}

main().catch((error) => {
  if (error instanceof SMSError) {
    console.error(`✖ ${error.name} [${error.kind}] ${error.code}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
