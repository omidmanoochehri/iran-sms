/**
 * Tiny environment helper shared by the examples.
 *
 * Credentials always come from the environment — never from source. Copy `.env.example` to
 * `.env`, fill in the providers you use, and run the examples with `node --env-file=.env`
 * (Node 20+) or export the variables yourself.
 */

/** Read a required variable, failing with an actionable message rather than a cryptic 401. */
export function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`\nMissing ${name}.\n`);
    console.error('  cp .env.example .env    # then fill it in');
    console.error(`  node --env-file=.env ${process.argv[1]}\n`);
    process.exit(1);
  }
  return value;
}

export function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

/** A number you own. Examples refuse to send to a stranger by accident. */
export function recipient() {
  return required('SMS_INTEGRATION_RECIPIENT');
}

/** Print a normalized result without dumping the whole raw payload. */
export function show(label, result) {
  console.log(`\n${label}`);
  console.log(`  provider   ${result.provider}`);
  console.log(`  messageId  ${result.messageId ?? '—'}`);
  console.log(`  batchId    ${result.batchId ?? '—'}`);
  console.log(`  status     ${result.status}`);
  console.log(`  recipients ${result.recipients.join(', ')}`);
  if (result.cost !== null) console.log(`  cost       ${result.cost} ${result.currency ?? ''}`);
}

/** Report an error the way you would in production: kind and code, never the raw body. */
export function report(error) {
  if (error?.kind) {
    console.error(`\n✖ ${error.name} [${error.kind}]`);
    console.error(`  provider ${error.provider ?? '—'}`);
    console.error(`  code     ${error.code ?? '—'}`);
    console.error(`  message  ${error.message}`);
    if (error.retryable) console.error('  (the provider indicated this may be retryable)');
  } else {
    console.error('\n✖ Unexpected error:', error);
  }
  process.exitCode = 1;
}
