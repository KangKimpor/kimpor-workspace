import { createHash, randomBytes, createECDH } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const projectRef = 'nlcpjdokfvawlpzyfytx';
export const siteUrl = 'https://kangkimpor.github.io/kimpor-workspace/';
const root = fileURLToPath(new URL('../', import.meta.url));
const reportPath = path.join(root, 'docs/evidence/cloud-deployment.json');

// The experimental HTTPS query endpoint avoids a DB password and IPv6-only
// connection. Errors deliberately omit response bodies, queries and credentials.
export function managementApi(token, ref = projectRef, request = fetch) {
  if (ref !== projectRef) throw new Error('Refusing deployment to another project');
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');
  if (!token.startsWith('sbp_') || token.length < 40) throw new Error('SUPABASE_ACCESS_TOKEN is not a complete personal access token');
  return async (suffix = '', method = 'GET', body) => {
    if (suffix.includes('..') || suffix.includes('://') || suffix.startsWith('/'))
      throw new Error('Invalid project API path');
    const response = await request(`https://api.supabase.com/v1/projects/${ref}${suffix ? '/' + suffix : ''}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Supabase ${method} ${suffix || 'project'} returned HTTP ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
}

export async function verifyProject(api) {
  const project = await api();
  if ((project.ref ?? project.id) !== projectRef || project.name !== 'kimpor-workspace' || project.status !== 'ACTIVE_HEALTHY')
    throw new Error('The dedicated Kimpor project is not ready or its identity differs');
  return { ref: projectRef, name: project.name, region: project.region, status: project.status };
}

export const query = (api, sql, parameters, readOnly = false) =>
  api('database/query', 'POST', { query: sql, read_only: readOnly, ...(parameters ? { parameters } : {}) });

export async function applyReviewedSchema(api, schema, manifest) {
  if (manifest.migrations.length !== 10 || createHash('sha256').update(schema).digest('hex') !== manifest.schema_sha256)
    throw new Error('Reviewed schema count or checksum differs');
  const state = await query(api, "select to_regclass('public.pages')::text as pages, to_regclass('supabase_migrations.schema_migrations')::text as migrations", undefined, true);
  if (!Array.isArray(state) || state.length !== 1) throw new Error('Could not verify live schema state');
  let applied = false;
  if (state[0].pages === null) {
    await query(api, schema);
    applied = true;
  } else {
    if (!state[0].migrations) throw new Error('Existing workspace has no verified migration history; refusing changes');
    const versions = await query(api, 'select version from supabase_migrations.schema_migrations order by version', undefined, true);
    if (!Array.isArray(versions) || versions.length !== manifest.migrations.length || versions.some((row, i) => row.version !== manifest.migrations[i].version))
      throw new Error('Existing workspace differs from the reviewed schema; use incremental CLI migrations');
  }
  const versions = await query(api, 'select version from supabase_migrations.schema_migrations order by version', undefined, true);
  if (!Array.isArray(versions) || versions.length !== 10 || versions.some((row, i) => row.version !== manifest.migrations[i].version))
    throw new Error('Live migration stamps do not match');
  const tables = await query(api, "select relname as name, relrowsecurity as rls from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' order by relname", undefined, true);
  if (!Array.isArray(tables) || tables.length < 18 || tables.some(row => row.rls !== true))
    throw new Error('Live workspace tables are missing or RLS is disabled');
  return { applied, migrations: versions.map(row => row.version), tables };
}

export async function configureAuth(api) {
  const previous = await api('config/auth');
  if (!previous.smtp_host) throw new Error('Verified custom SMTP is required before code-only account configuration.');
  const desired = {
    site_url: siteUrl,
    uri_allow_list: `${siteUrl}**,kimpor-workspace://auth/callback**,veloradesk://auth/callback**`,
    mailer_autoconfirm: false,
    external_anonymous_users_enabled: false,
    external_email_enabled: true,
    mailer_otp_length: 6,
    mailer_otp_exp: 600,
  };
  Object.assign(desired, {
    mailer_subjects_confirmation: 'Kimpor Workspace code',
    mailer_subjects_magic_link: 'Kimpor Workspace code',
    mailer_templates_confirmation_content: '{{ .Token }}',
    mailer_templates_magic_link_content: '{{ .Token }}',
  });
  await api('config/auth', 'PATCH', desired);
  const actual = await api('config/auth');
  if (Object.entries(desired).some(([key, value]) => actual[key] !== value)) throw new Error('Saved Auth configuration differs');
  const codeTemplates = ['mailer_templates_confirmation_content', 'mailer_templates_magic_link_content'].every(key => actual[key] === '{{ .Token }}');
  return { site_url: actual.site_url, redirects: actual.uri_allow_list.split(','), email_codes: 6, code_expiry_seconds: 600, email_confirmation: true, anonymous_signin: false, google_enabled: actual.external_google_enabled === true, custom_smtp: Boolean(actual.smtp_host), email_mode: codeTemplates ? 'code' : 'link', default_sender_restricted_to_team: !actual.smtp_host, delivery_tested: false };
}

export async function configureServer(api) {
  const names = new Set((await api('secrets')).map(row => row.name));
  const available = await query(api, "select to_regclass('vault.decrypted_secrets')::text as vault", undefined, true);
  if (!available[0]?.vault) await query(api, 'create schema if not exists vault; create extension if not exists supabase_vault with schema vault;');
  // Vault decryption needs the administrative role. The API's read-only role
  // intentionally cannot decrypt; do not grant it additional permissions.
  const vault = new Map((await query(api, "select name,decrypted_secret from vault.decrypted_secrets where name in ('kimpor_credential_encryption_key','kimpor_oauth_state_secret','velora_maintenance_secret','kimpor_vapid_private_key','kimpor_vapid_public_key')")).map(row => [row.name, row.decrypted_secret]));
  const secrets = [];
  const keep = async (name, vaultName, make) => {
    if (names.has(name)) {
      if (!vault.has(vaultName)) throw new Error(`Existing ${name} needs its private Vault backup; refusing rotation`);
      return vault.get(vaultName);
    }
    const value = vault.get(vaultName) ?? make();
    if (!vault.has(vaultName)) await query(api, 'select vault.create_secret($1,$2)', [value, vaultName]);
    secrets.push({ name, value });
    return value;
  };
  await keep('CREDENTIAL_ENCRYPTION_KEY', 'kimpor_credential_encryption_key', () => randomBytes(32).toString('base64'));
  await keep('OAUTH_STATE_SECRET', 'kimpor_oauth_state_secret', () => randomBytes(32).toString('base64url'));
  await keep('MAINTENANCE_SECRET', 'velora_maintenance_secret', () => randomBytes(32).toString('base64url'));
  const pair = createECDH('prime256v1');
  pair.generateKeys();
  const privateKey = await keep('VAPID_PRIVATE_KEY', 'kimpor_vapid_private_key', () => pair.getPrivateKey().toString('base64url'));
  pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  const publicKey = await keep('VAPID_PUBLIC_KEY', 'kimpor_vapid_public_key', () => pair.getPublicKey().toString('base64url'));
  if (publicKey !== pair.getPublicKey().toString('base64url')) throw new Error('Saved VAPID pair differs');
  secrets.push({ name: 'ALLOWED_ORIGINS', value: 'https://kangkimpor.github.io,http://tauri.localhost,https://tauri.localhost,tauri://localhost' }, { name: 'VAPID_SUBJECT', value: siteUrl });
  await api('secrets', 'POST', secrets);
  const saved = new Set((await api('secrets')).map(row => row.name));
  if (secrets.some(row => !saved.has(row.name))) throw new Error('Server secret names were not saved');
  await query(api, 'create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;');
  await query(api, "select vault.create_secret($1,'velora_maintenance_url') where not exists(select 1 from vault.secrets where name='velora_maintenance_url')", [`https://${projectRef}.supabase.co/functions/v1/maintenance`]);
  const command = `select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='velora_maintenance_url' limit 1),headers:=jsonb_build_object('Content-Type','application/json','x-maintenance-secret',(select decrypted_secret from vault.decrypted_secrets where name='velora_maintenance_secret' limit 1)),body:='{"action":"scheduled"}'::jsonb)`;
  await query(api, "select cron.schedule('velora-maintenance','*/15 * * * *',$1)", [command]);
  const jobs = await query(api, "select jobname,schedule,active from cron.job where jobname='velora-maintenance'", undefined, true);
  if (jobs.length !== 1 || jobs[0].active !== true) throw new Error('Maintenance schedule is not active');
  return { secret_names: [...saved].filter(name => !name.startsWith('SUPABASE_')).sort(), private_backup: 'Supabase Vault; never exported to Actions artifacts', maintenance_schedule: jobs[0], vapid_public_key: publicKey };
}

export async function verifyFunctions(api, manifest) {
  const functions = await api('functions');
  const verified = manifest.functions.map(expected => {
    const actual = functions.find(row => row.slug === expected.name);
    if (!actual || actual.status !== 'ACTIVE' || actual.verify_jwt !== false) throw new Error(`Function ${expected.name} is not deployed with the reviewed Auth boundary`);
    return { name: actual.slug, status: actual.status, version: actual.version, verify_jwt: actual.verify_jwt };
  });
  return verified;
}

async function main() {
  const api = managementApi(process.env.SUPABASE_ACCESS_TOKEN, process.env.SUPABASE_PROJECT_REF ?? projectRef);
  const identity = await verifyProject(api);
  const manifest = JSON.parse(await readFile(path.join(root, 'supabase/dashboard/manifest.json'), 'utf8'));
  let report;
  if (process.argv.includes('--verify')) {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.functions = await verifyFunctions(api, manifest);
    const values = await query(api, "select decrypted_secret from vault.decrypted_secrets where name='velora_maintenance_secret' limit 1");
    const secret = values[0]?.decrypted_secret;
    if (!secret) throw new Error('Maintenance private configuration is missing');
    for (const name of ['keepalive', 'maintenance']) {
      const response = await fetch(`https://${projectRef}.supabase.co/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-maintenance-secret': secret }, body: '{}', signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`${name} live check returned HTTP ${response.status}`);
      const result = await response.json();
      if (result.ok !== true) throw new Error(`${name} live check did not succeed`);
      report[name] = { ok: true, ...(name === 'maintenance' ? { push_configured: result.pushConfigured, compacted: result.compacted, sent: result.sent } : {}) };
    }
  } else {
    const schema = await readFile(path.join(root, 'supabase/dashboard/schema.sql'), 'utf8');
    const migration = await applyReviewedSchema(api, schema, manifest);
    const auth = await configureAuth(api);
    const server = await configureServer(api);
    report = { project: identity, schema: migration, auth, server, functions: [], method: 'Supabase Management HTTPS query endpoint (experimental) and pinned official CLI; no DB password required' };
  }
  report.date = new Date().toISOString();
  report.source_commit = process.env.GITHUB_SHA ?? null;
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(process.argv.includes('--verify') ? 'Eight deployed functions, live keepalive and maintenance verified.' : 'Reviewed schema, Auth settings, server secrets and maintenance schedule saved.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
