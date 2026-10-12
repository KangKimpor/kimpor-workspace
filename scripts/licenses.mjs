import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const json = execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['licenses', 'list', '--json'], { shell: process.platform === 'win32', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const report = JSON.parse(json);
const accepted = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'OFL-1.1', 'MPL-2.0', 'Python-2.0', 'CC-BY-4.0', 'Apache-2.0 OR MIT', 'MIT OR Apache-2.0']);
// Upstream 1.0.1 calls its BSD-3-Clause text simply "BSD" in package metadata.
let reviewedBsd = false;
if (report.BSD?.every(entry => entry.name === 'parse-cache-control' && entry.versions.every(version => version === '1.0.1'))) {
  const license = await readFile(`${report.BSD[0].paths[0]}/LICENSE`, 'utf8');
  reviewedBsd = license.includes('Walmart and other contributors') && license.includes('The names of any contributors may not be used to endorse') && license.includes('Redistribution and use in source and binary forms');
}
const failures = Object.keys(report).filter(license => !accepted.has(license) && !['(MIT OR CC0-1.0)', '(MIT OR Apache-2.0)', '(Apache-2.0 AND MIT)', '(MIT AND Zlib)'].includes(license) && !(license === 'BSD' && reviewedBsd) && !(license === 'LGPL-3.0-or-later' && report[license].every(entry => entry.name.startsWith('@img/sharp-libvips-'))) && !(license === 'Apache-2.0 AND LGPL-3.0-or-later' && report[license].every(entry => entry.name === '@img/sharp-win32-x64' && entry.versions.every(version => version === '0.35.5'))));
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/dependency-licenses.json', json);
console.log(`License groups: ${Object.keys(report).join(', ')}`);
if (failures.length) throw new Error(`Review these dependency licenses before shipping: ${failures.join(', ')}`);
