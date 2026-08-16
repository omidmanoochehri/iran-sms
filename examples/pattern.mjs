/**
 * OTP via a pattern, using the pattern registry.
 *
 *   node --env-file=.env examples/pattern.mjs
 *
 * The point of this example: the send call at the bottom never mentions a provider or a
 * template code. Switching gateway is a change to `patterns`, not to your code.
 */
import { SMS, SMSPatternError, SMSError } from 'iran-sms';
import { optional, recipient, report, required, show } from './_env.mjs';

const provider = optional('SMS_PROVIDER', 'kavenegar');

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
}[provider]?.();

const sms = new SMS({
  provider,
  credentials,
  sender: required('SMS_SENDER'),

  patterns: {
    // One logical name, one entry per gateway you might use.
    login: {
      ippanel: process.env.IPPANEL_LOGIN_PATTERN ?? 'REPLACE_ME',
      farazsms: process.env.FARAZSMS_LOGIN_PATTERN ?? 'REPLACE_ME',
      smsir: Number(process.env.SMSIR_LOGIN_TEMPLATE ?? 0),
      kavenegar: process.env.KAVENEGAR_LOGIN_TEMPLATE ?? 'REPLACE_ME',

      // The Payamak Panel family does not substitute variables server-side — you send the
      // rendered text, so the approved body has to live here.
      melipayamak: {
        code: Number(process.env.MELIPAYAMAK_LOGIN_BODY_ID ?? 0),
        body: 'کد ورود شما %code% است',
      },

      // AmootSMS sends values positionally, so the order is mandatory. Without it the
      // package refuses to guess rather than risk sending the wrong value.
      amoot: {
        code: Number(process.env.AMOOT_LOGIN_PATTERN_ID ?? 0),
        variableOrder: ['code'],
      },
    },
  },
});

// A real OTP would come from your own generator and be stored hashed with a short TTL.
const code = String(Math.floor(100000 + Math.random() * 900000));

try {
  const result = await sms.patterns.send({
    to: recipient(),
    pattern: 'login',
    variables: { code },
  });

  show('OTP sent', result);
  // Never log the code itself in production — it is a live credential while valid.
  console.log('  (code withheld from this log on purpose)');
} catch (error) {
  if (error instanceof SMSPatternError) {
    console.error('\nPattern problem — usually a missing registry entry or an unapproved template.');
    report(error);
  } else if (error instanceof SMSError) {
    report(error);
  } else {
    throw error;
  }
}
