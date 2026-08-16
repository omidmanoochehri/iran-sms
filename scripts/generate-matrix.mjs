/**
 * Regenerate `docs/provider-matrix.md` from the provider catalog.
 *
 * The matrix is generated rather than hand-maintained so it cannot drift from the
 * capability flags the code actually enforces. Run `npm run docs:matrix` after changing
 * any capability.
 */
import { writeFileSync } from 'node:fs';
import { CATALOG } from '../dist/esm/providers/catalog.js';

const COLUMNS = [
  ['send', 'Send'],
  ['bulk', 'Bulk'],
  ['peerToPeer', 'P2P'],
  ['pattern', 'Pattern'],
  ['patternManagement', 'Pattern CRUD'],
  ['scheduled', 'Schedule'],
  ['cancelScheduled', 'Cancel'],
  ['deliveryReports', 'Reports'],
  ['outbox', 'Outbox'],
  ['inbox', 'Inbox'],
  ['balance', 'Balance'],
  ['senders', 'Lines'],
  ['contacts', 'Contacts'],
  ['blacklistRead', 'BL read'],
  ['blacklistWrite', 'BL write'],
  ['webhookManagement', 'Webhook API'],
  ['webhookDelivery', 'Webhook push'],
  ['voice', 'Voice'],
  ['pricing', 'Pricing'],
  ['international', 'Intl'],
  ['idempotentSend', 'Idempotent'],
];

const yes = (value) => (value ? '✅' : '—');

const header = `# Provider capability matrix

**Generated from \`src/providers/catalog.ts\` — do not edit by hand.**
Run \`npm run docs:matrix\` to regenerate.

Every ✅ is traceable to that provider's research log in [\`providers/\`](./providers/). A dash
means the capability is **not supported or not publicly documented** — this package never
guesses. Where a provider partially supports something, the flag is \`—\` and the research log
explains what is available natively.

Legend: ✅ supported · — not supported / not documented

`;

const rows = [...CATALOG].sort((a, b) => a.id.localeCompare(b.id));

let table = `| Provider | ${COLUMNS.map(([, label]) => label).join(' | ')} |\n`;
table += `|---|${COLUMNS.map(() => '---').join('|')}|\n`;
for (const entry of rows) {
  table += `| [\`${entry.id}\`](./providers/${entry.id}.md) | ${COLUMNS.map(([key]) =>
    yes(entry.capabilities[key]),
  ).join(' | ')} |\n`;
}

let meta = `\n## Platform, transport and verification\n\n`;
meta += `| Provider | Name | Platform | API version | Recipient format | Host published | Platform confirmed |\n`;
meta += `|---|---|---|---|---|---|---|\n`;
for (const entry of rows) {
  meta += `| \`${entry.id}\` | ${entry.name} | \`${entry.platform}\` | ${entry.apiVersion} | \`${entry.phoneFormat}\` | ${
    entry.defaultBaseUrl ? `\`${entry.defaultBaseUrl}\`` : '**must be supplied**'
  } | ${entry.unverified ? '⚠️ inferred' : '✅ yes'} |\n`;
}

let creds = `\n## Credentials\n\n| Provider | Required | Aliases |\n|---|---|---|\n`;
for (const entry of rows) {
  const required = entry.requiredCredentials
    .map((spec) => (spec.oneOf ? spec.oneOf.map((k) => `\`${k}\``).join(' or ') : `\`${spec.key}\``))
    .join(', ');
  creds += `| \`${entry.id}\` | ${required} | ${entry.aliases.map((a) => `\`${a}\``).join(', ') || '—'} |\n`;
}

const footer = `
## Reading this table

- **Pattern** is template/OTP sending. Every provider that documents one has it; the single
  exception is \`mizbansms\`, which publishes no customer-facing template endpoint at all —
  see [\`providers/mizbansms.md\`](./providers/mizbansms.md).
- **Pattern CRUD** means creating/updating/deleting templates *through the API*. Several
  providers allow creation only; the flag is \`—\` for those and the research log says so.
- **Webhook API** means you can register callback URLs programmatically. **Webhook push**
  means the provider can push events to a URL you configured in its panel. Only \`amoot\`
  offers the former.
- **Idempotent** means the provider accepts a caller-supplied key that makes a send safe to
  repeat. Only \`kavenegar\` does (\`localid\`) — and it is therefore the only provider whose
  sends this package will ever retry automatically.
- **Host published** — where this says *must be supplied*, pass \`request.baseUrl\`. The
  package refuses to guess an endpoint; see
  [\`provider-relations.md\`](./provider-relations.md).

**Last generated:** ${new Date().toISOString().slice(0, 10)}
`;

writeFileSync(
  new URL('../docs/provider-matrix.md', import.meta.url),
  header + table + meta + creds + footer,
  'utf8',
);
console.log(`wrote docs/provider-matrix.md (${rows.length} providers)`);
