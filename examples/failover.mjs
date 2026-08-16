/**
 * Failover, and the reasoning behind what it will and will not do.
 *
 *   node --env-file=.env examples/failover.mjs
 */
import { SMS, isFailoverEligible, SMSError } from 'iran-sms';
import { recipient, report, required, show } from './_env.mjs';

const sms = new SMS.Multi({
  providers: [
    {
      provider: 'ippanel',
      credentials: { apiKey: required('IPPANEL_API_KEY') },
      sender: required('SMS_SENDER'),
    },
    {
      provider: 'kavenegar',
      credentials: { apiKey: required('KAVENEGAR_API_KEY') },
      sender: required('SMS_SENDER'),
    },
    { provider: 'smsir', credentials: { apiKey: required('SMSIR_API_KEY') }, sender: required('SMS_SENDER') },
  ],

  failover: {
    enabled: true,

    // The default. Both are *definite refusals*: the provider answered, and the answer was
    // no, so nothing was accepted and nothing can be duplicated.
    on: ['rate_limit', 'provider_unavailable'],

    // Adding 'network_error' or 'timeout' trades a small duplicate-delivery risk for higher
    // delivery odds. A timeout is the absence of an answer, not a refusal — the first
    // provider may well have accepted the message. Sometimes that trade is right (an OTP
    // that must arrive beats one that arrives twice); it is a decision, not a default.
    //
    // on: ['rate_limit', 'provider_unavailable', 'network_error', 'timeout'],

    maxAttempts: 2,
  },
});

sms.on('failover', ({ from, to, reason }) => {
  console.warn(`  ⚠ failover ${from} → ${to} (${reason})`);
});

console.log('Order:', sms.names().join(' → '));

try {
  const result = await sms.send({
    to: recipient(),
    message: 'Sent with failover enabled.',

    // Where the provider supports it (Kavenegar's `localid`), this makes the send itself
    // repeat-safe, which removes the duplicate risk entirely.
    idempotencyKey: `example-${Date.now()}`,
  });

  show('Delivered by', result);
} catch (error) {
  report(error);
}

// What failover will never do, and why.
console.log('\nFailover eligibility by error kind');
const kinds = [
  ['network', 'transport failed — could be either; opt in'],
  ['timeout', 'no answer — could be either; opt in'],
  ['rate_limit', 'definite refusal'],
  ['authentication', 'the request is wrong for this account'],
  ['validation', 'the request is malformed'],
  ['pattern', 'the template is unknown or unapproved'],
  ['recipient', 'the number is invalid or blacklisted'],
  ['insufficient_credit', 'moving spend to another account is your decision'],
];

for (const [kind, why] of kinds) {
  const error = Object.assign(new SMSError('x'), { kind });
  const mark = isFailoverEligible(error) ? '✓' : '✗';
  console.log(`  ${mark} ${kind.padEnd(20)} ${why}`);
}
