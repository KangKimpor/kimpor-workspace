import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { managementApi, projectRef, verifyProject } from './cloud-management.mjs';

// Creates only temporary, confirmed QA users; no email is sent. Passwords and
// bearer/service credentials remain in memory and never enter the report/logs.
const report = { date: new Date().toISOString(), source_commit: process.env.GITHUB_SHA ?? null, project_ref: projectRef, mode: 'Real Auth, PostgREST, Edge and private Storage; temporary synthetic users, no physical device or email-delivery claim', checks: [], cleanup: false, status: 'running' };
const users = [], files = [];
const api = managementApi(process.env.SUPABASE_ACCESS_TOKEN, process.env.SUPABASE_PROJECT_REF ?? projectRef);
const base = `https://${projectRef}.supabase.co`;
let service, anon;
const headers = token => ({ apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const raw = (route, token, options = {}) => fetch(base + route, { ...options, headers: { ...headers(token), ...options.headers }, signal: AbortSignal.timeout(90000) });
async function json(route, token, body) {
  const response = await raw(route, token, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`${route.split('?')[0]} returned HTTP ${response.status}`);
  return response.json();
}
async function check(name, fn) { await fn(); report.checks.push({ name, status: 'passed' }); console.log(name + ': passed'); }
async function account() {
  const email = `kimpor-qa-${randomUUID()}@example.invalid`, password = randomBytes(32).toString('base64url');
  const user = await json('/auth/v1/admin/users', service, { email, password, email_confirm: true });
  if (!user.id) throw new Error('Temporary Auth user creation failed');
  users.push(user.id);
  const session = await json('/auth/v1/token?grant_type=password', anon, { email, password });
  if (session.user?.id !== user.id || !session.access_token) throw new Error('Temporary password grant failed');
  return { id: user.id, token: session.access_token };
}
async function main() {
  await verifyProject(api);
  const keys = await api('api-keys?reveal=true');
  service = keys.find(row => row.name === 'service_role')?.api_key;
  anon = keys.find(row => row.name === 'anon')?.api_key;
  if (!service || !anon) throw new Error('Private test credentials are unavailable');
  const [a, b] = [await account(), await account()];
  await check('Auth grants for two isolated temporary owners', async () => {
    assert.notEqual(a.id, b.id);
    assert.equal((await json('/auth/v1/user', a.token)).id, a.id);
    assert.equal((await json('/auth/v1/user', b.token)).id, b.id);
  });
  const page = randomUUID(), clock = { wall: Date.now(), counter: 0, node: 'live-qa' };
  const change = { id: randomUUID(), userId: a.id, kind: 'entity', table: 'pages', entityId: page, schemaVersion: 1, fields: { title: { value: 'Temporary Khmer ខ្មែរ Chinese 中文 fixture', clock }, userId: { value: a.id, clock } } };
  const push = (owner, changes) => json('/rest/v1/rpc/push_changes', owner.token, { changes });
  const pull = owner => json('/rest/v1/rpc/pull_changes', owner.token, { after_cursor: '0', batch_limit: 200 });
  await check('Live push/pull, idempotency and owner row isolation', async () => {
    assert.deepEqual((await push(a, [change])).acknowledged, [change.id]);
    assert.deepEqual((await push(a, [change])).acknowledged, [change.id]);
    assert.equal((await pull(a)).changes.filter(row => row.id === change.id).length, 1);
    assert.equal((await pull(b)).changes.length, 0);
    assert.equal((await json(`/rest/v1/pages?id=eq.${page}&select=id`, a.token)).length, 1);
    assert.equal((await json(`/rest/v1/pages?id=eq.${page}&select=id`, b.token)).length, 0);
  });
  await check('Forbidden direct writes, foreign pushes and credential reads', async () => {
    for (const response of [
      await raw('/rest/v1/pages', a.token, { method: 'POST', body: JSON.stringify({ id: randomUUID(), user_id: a.id }) }),
      await raw('/rest/v1/rpc/push_changes', b.token, { method: 'POST', body: JSON.stringify({ changes: [{ ...change, id: randomUUID() }] }) }),
      await raw('/rest/v1/connected_accounts?select=*', a.token),
    ]) assert.equal(response.status, 403);
  });
  const cipher = randomBytes(64), file = randomUUID();
  const upload = async owner => {
    const form = new FormData();
    form.set('id', file); form.set('pageId', page); form.set('changeId', `attachment:${file}`);
    form.set('file', new Blob([cipher], { type: 'application/octet-stream' }), 'fixture.enc');
    return fetch(`${base}/functions/v1/attachments`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${owner.token}`, Origin: 'https://kangkimpor.github.io' }, body: form, signal: AbortSignal.timeout(90000) });
  };
  await check('Real private Storage upload, exact bytes and cross-owner denial', async () => {
    const first = await upload(a);
    assert.equal(first.status, 200);
    files.push(`${a.id}/${file}`);
    assert.equal((await upload(a)).status, 200);
    const owned = await raw(`/functions/v1/attachments?id=${file}`, a.token);
    assert.equal(owned.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await owned.arrayBuffer())).digest('hex'), createHash('sha256').update(cipher).digest('hex'));
    assert.equal((await raw(`/functions/v1/attachments?id=${file}`, b.token)).status, 404);
    assert.equal((await upload(b)).status, 404);
    assert.ok([400,403,404].includes((await raw(`/storage/v1/object/authenticated/attachments/${a.id}/${file}`, b.token)).status));
  });
  await check('Allowed and rejected cross-origin Edge requests', async () => {
    const good = await raw('/functions/v1/attachments', a.token, { method: 'OPTIONS', headers: { Origin: 'https://kangkimpor.github.io' } });
    assert.equal(good.status, 204); assert.equal(good.headers.get('access-control-allow-origin'), 'https://kangkimpor.github.io');
    assert.equal((await raw('/functions/v1/attachments', a.token, { method: 'OPTIONS', headers: { Origin: 'https://example.invalid' } })).status, 403);
  });
  await check('Protection purges plaintext and rejects a stale plain update', async () => {
    const doc = { id: randomUUID(), userId: a.id, kind: 'document', entityId: page, schemaVersion: 1, update: 'AAA=' };
    await push(a, [doc]);
    await push(a, [{ ...change, id: randomUUID(), fields: { 'properties.__locked': { value: true, clock: { ...clock, wall: clock.wall + 1 } } } }]);
    await push(a, [{ ...doc, id: randomUUID() }]);
    assert.equal((await json(`/rest/v1/page_doc_updates?page_id=eq.${page}&select=id`, a.token)).length, 0);
    assert.equal((await pull(a)).changes.some(row => row.kind === 'document'), false);
  });
  await check('Live owner quota measurement', async () => {
    const usage = await json('/rest/v1/rpc/storage_usage', a.token, {});
    assert.ok(Number.isFinite(usage.databaseBytes) && Number.isFinite(usage.storageBytes));
    assert.ok(usage.databaseBytes < usage.databaseLimit && usage.storageBytes < usage.storageLimit);
    report.usage = { database_bytes: usage.databaseBytes, storage_bytes: usage.storageBytes };
  });
  report.status = 'passed';
}
try { await main(); } catch (error) { report.status = 'failed'; report.error = error.message; console.error(error.message); process.exitCode = 1; }
finally {
  let cleaned = true;
  if (service && anon) {
    if (files.length) {
      const response = await raw('/storage/v1/object/attachments', service, { method: 'DELETE', body: JSON.stringify({ prefixes: files }) }).catch(() => null);
      if (!response?.ok) cleaned = false;
    }
    for (const id of users) {
      const response = await raw(`/auth/v1/admin/users/${id}`, service, { method: 'DELETE' }).catch(() => null);
      if (!response?.ok) cleaned = false;
    }
  }
  report.cleanup = cleaned;
  report.temporary_users_created = users.length;
  if (!cleaned) { report.status = 'failed'; process.exitCode = 1; }
  await mkdir('docs/evidence', { recursive: true });
  await writeFile('docs/evidence/cloud-live.json', JSON.stringify(report, null, 2) + '\n');
}
