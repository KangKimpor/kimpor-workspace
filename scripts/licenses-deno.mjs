import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const lock = JSON.parse(await readFile('supabase/functions/deno.lock', 'utf8'));
// web-push is used unmodified on the server. MPL's file-level source terms do not
// require relicensing the separate app; retain its LICENSE and upstream source link.
const accepted = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'MPL-2.0']);
const inventory = [];
for (const identity of Object.keys(lock.npm ?? {})) {
  const at = identity.lastIndexOf('@'), name = identity.slice(0, at), version = identity.slice(at + 1);
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const metadata = JSON.parse(execFileSync('curl', ['--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '30', url], { encoding: 'utf8' }));
  if (metadata.name !== name || metadata.version !== version) throw new Error('Registry identity mismatch');
  inventory.push({ name, version, license: metadata.license, source: url, integrity: lock.npm[identity].integrity });
}
await writeFile('docs/evidence/deno-licenses.json', JSON.stringify({ date: new Date().toISOString(), inventory }, null, 2) + '\n');
const rejected = inventory.filter(item => !accepted.has(item.license));
if (rejected.length) throw new Error(`Backend license review required: ${rejected.map(item => `${item.name}: ${item.license}`).join(', ')}`);
console.log(`${inventory.length} pinned backend npm packages use reviewed open-source license groups.`);
