import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('backup CLI round-trips without plaintext artifacts and rejects altered bytes and wrong keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'velora-backup-test-'));
  try {
    const fixture = JSON.stringify({ format: 'veloradesk', version: 1, entities: [], private: 'Private fixture 中文 ខ្មែរ' });
    const preload = join(directory, 'fetch-fixture.mjs');
    await writeFile(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(fixture)}, { status: 200 });`);
    const key = randomBytes(32).toString('hex');
    const environment = { ...process.env, BACKUP_ENCRYPTION_KEY: key, BACKUP_SECRET: 'fixture-only', BACKUP_SOURCE_URL: 'https://fixture.supabase.co/functions/v1/backup' };
    const encrypted = join(directory, 'workspace.enc'), restored = join(directory, 'workspace.json');
    const run = (args, env = environment) => spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    const created = run(['--import', preload, 'scripts/cloud-backup.mjs', 'backup', encrypted]);
    assert.equal(created.status, 0, created.stderr);
    const bytes = await readFile(encrypted);
    assert.ok(!bytes.includes(Buffer.from('Private fixture')));
    await assert.rejects(access(restored));
    const recovered = run(['scripts/cloud-backup.mjs', 'decrypt', restored, encrypted]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(await readFile(restored, 'utf8'), fixture);
    const rejected = join(directory, 'rejected.json');
    const wrong = run(['scripts/cloud-backup.mjs', 'decrypt', rejected, encrypted], { ...environment, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
    assert.notEqual(wrong.status, 0);
    await assert.rejects(access(rejected));
    bytes[bytes.length - 1] ^= 1;
    await writeFile(encrypted, bytes);
    assert.notEqual(run(['scripts/cloud-backup.mjs', 'decrypt', rejected, encrypted]).status, 0);
    await assert.rejects(access(rejected));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
