// The package is `"type": "module"`, so the CommonJS output in dist/cjs needs its own
// package.json marker to stop Node treating those .js files as ESM. The ESM output gets
// a matching marker for symmetry and to make the intent explicit to bundlers.
import { writeFile, mkdir } from 'node:fs/promises';

const targets = [
  ['../dist/cjs/package.json', { type: 'commonjs' }],
  ['../dist/esm/package.json', { type: 'module' }],
];

for (const [rel, contents] of targets) {
  const url = new URL(rel, import.meta.url);
  await mkdir(new URL('.', url), { recursive: true });
  await writeFile(url, `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
  console.log(`wrote ${rel.replace('../', '')}`);
}
