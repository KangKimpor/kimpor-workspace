import { spawnSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
let cargo = process.env.VELORADESK_CARGO ?? 'cargo';
if (!process.env.VELORADESK_CARGO) { const installed = path.join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo'); try { await access(installed); cargo = installed; } catch { /* Use PATH on CI. */ } }
const result = spawnSync(cargo, ['metadata', '--locked', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', '--filter-platform', 'x86_64-pc-windows-msvc', '--format-version', '1'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr);
const metadata = JSON.parse(result.stdout), needed = new Set(metadata.resolve.nodes.map(node => node.id));
const packages = metadata.packages.filter(pkg => needed.has(pkg.id)).map(pkg => ({ name: pkg.name, version: pkg.version, license: pkg.license }));
const allowed = new Set(['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', 'CC0-1.0', 'Unicode-3.0', '0BSD', 'Unlicense', 'MPL-2.0']);
const unreviewed = packages.filter(pkg => !pkg.license || pkg.license.split(/[\s()/]+/).filter(term => term && term !== 'OR' && term !== 'AND').some(term => !allowed.has(term)));
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/cargo-windows-licenses.json', JSON.stringify({ target: 'x86_64-pc-windows-msvc', lockfile: true, packages }, null, 2) + '\n');
if (unreviewed.length) throw new Error(`Review native dependency licenses: ${unreviewed.map(pkg => `${pkg.name}: ${pkg.license}`).join(', ')}`);
console.log(`${packages.length} Windows-resolved crate license expressions are reviewed; native compilation is a separate gate.`);
