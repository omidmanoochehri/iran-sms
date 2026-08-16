/**
 * Several providers at once, with routing.
 *
 *   node --env-file=.env examples/multi-provider.mjs
 */
import { SMS } from 'iran-sms';
import { recipient, report, required, show } from './_env.mjs';

const sms = new SMS.Multi({
  providers: {
    ippanel: {
      provider: 'ippanel',
      credentials: { apiKey: required('IPPANEL_API_KEY') },
      sender: required('SMS_SENDER'),
    },
    kavenegar: {
      provider: 'kavenegar',
      credentials: { apiKey: required('KAVENEGAR_API_KEY') },
      sender: required('SMS_SENDER'),
    },
  },

  routing: {
    // OTP goes to Kavenegar: Verify Lookup is never content-filtered and reaches numbers
    // that have opted out of promotional SMS.
    pattern: 'kavenegar',
    default: 'ippanel',
  },
});

console.log('Configured:', sms.names().join(', '));

// 1. Balances, in parallel. Failures are captured per provider rather than rejecting.
console.log('\nBalances');
for (const { name, balance, error } of await sms.getBalances()) {
  if (error) console.log(`  ${name.padEnd(10)} unreachable (${error.kind ?? 'error'})`);
  else
    console.log(`  ${name.padEnd(10)} ${balance.amount ?? balance.messageCount} ${balance.currency ?? ''}`);
}

// 2. Address one provider explicitly. `use()` returns a full SMS instance.
console.log('\nCapabilities');
for (const name of sms.names()) {
  const one = sms.use(name);
  const has = ['pattern', 'voice', 'contacts', 'blacklistWrite', 'idempotentSend'].filter((capability) =>
    one.supports(capability),
  );
  console.log(`  ${name.padEnd(10)} ${has.join(', ') || '(basic only)'}`);
}

// 3. Send through the routed default.
try {
  const result = await sms.send({
    to: recipient(),
    message: 'Routed through the default provider.',
  });
  show('Sent via routing', result);
} catch (error) {
  report(error);
}

// 4. Override the route for one call. An explicit provider also disables failover — you
//    asked for that gateway, so silently using another would be surprising.
try {
  const result = await sms.send({
    to: recipient(),
    message: 'Explicitly via Kavenegar.',
    provider: 'kavenegar',
  });
  show('Sent with an explicit provider', result);
} catch (error) {
  report(error);
}
