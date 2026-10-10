import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const version = '8.30.1';
// SHA256 from the upstream release's published checksums; immutable reviewed download.
const checksum = '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb';
let binary = process.env.GITLEAKS_BINARY;
if (!binary) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Install gitleaks 8.30.1 and set GITLEAKS_BINARY to its path on this platform.');
  const directory = path.join(tmpdir(), `veloradesk-gitleaks-${version}`), archive = path.join(directory, 'gitleaks.tgz');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let bytes;
  try { bytes = await readFile(archive); } catch {
    // curl respects HTTPS_PROXY on managed hosts; bare Node fetch may bypass it.
    const response = spawnSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`], { maxBuffer: 30 * 1024 * 1024 });
    if (response.error) throw response.error;
    if (response.status !== 0) throw new Error(`Gitleaks download failed: ${response.stderr.toString()}`);
    bytes = response.stdout;
    if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Gitleaks checksum mismatch');
    await writeFile(archive, bytes);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Cached gitleaks checksum mismatch');
  const extraction = spawnSync('tar', ['-xzf', archive, '-C', directory, 'gitleaks'], { stdio: 'inherit' });
  if (extraction.status !== 0) throw new Error('Gitleaks extraction failed');
  binary = path.join(directory, 'gitleaks');
}
const args = process.argv.includes('--history') ? ['git', '--redact', '--no-banner'] : ['git', '--pre-commit', '--staged', '--redact', '--no-banner'];
const result = spawnSync(binary, args, { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
