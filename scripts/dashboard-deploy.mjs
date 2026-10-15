import { build } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A dashboard-only deployment path when no CLI credential is connected. It
// flattens local imports while preserving pinned Deno npm dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const directory = path.join(root, 'supabase/dashboard');
await mkdir(directory, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const migrations = [];
let sql = `-- Apply only to the new, dedicated Kimpor Workspace project.\n-- All twelve migrations run atomically; an existing workspace aborts this script.\nBEGIN;\nDO $$ BEGIN\n  IF to_regclass('public.pages') IS NOT NULL THEN\n    RAISE EXCEPTION 'Workspace already exists; use the incremental CLI migration path';\n  END IF;\nEND $$;\nCREATE SCHEMA IF NOT EXISTS supabase_migrations;\nCREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);\n`;
for (const name of (await readdir(path.join(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
  const content = (await readFile(path.join(root, 'supabase/migrations', name), 'utf8')).replace(/\r\n/g, '\n');
  const [, version, title] = /^(\d+)_(.+)\.sql$/.exec(name);
  migrations.push({ file: name, version, sha256: digest(content) });
  sql += `\n-- ${name}\n${content}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${title}') ON CONFLICT(version) DO NOTHING;\n`;
}
if (migrations.length !== 12) throw new Error('Review the deployment script before changing its migration count.');
sql += `COMMIT;\nSELECT count(*) AS applied_migrations FROM supabase_migrations.schema_migrations WHERE version IN (${migrations.map(row => `'${row.version}'`).join(',')});\nSELECT relname AS table_name, relrowsecurity AS rls_enabled FROM pg_class WHERE oid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') ORDER BY relname;\n`;
await writeFile(path.join(directory, 'schema.sql'), sql);

const imports = JSON.parse(await readFile(path.join(root, 'supabase/functions/deno.json'), 'utf8')).imports;
const functions = [];
for (const item of (await readdir(path.join(root, 'supabase/functions'), { withFileTypes: true })).filter(item => item.isDirectory() && !item.name.startsWith('_')).sort((a,b) => a.name.localeCompare(b.name))) {
  const entry = path.join(root, 'supabase/functions', item.name, 'index.ts');
  await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'silent',
    plugins: [{ name: 'pinned-deno-imports', enforce: 'pre', resolveId(id) { return imports[id] ? { id: imports[id], external: true } : null; } }],
    build: {
      target: 'esnext', minify: false, sourcemap: false,
      outDir: path.join(directory, 'functions', item.name), emptyOutDir: true,
      lib: { entry, formats: ['es'], fileName: () => 'index.js' },
      rolldownOptions: { external: id => /^(npm|node):/.test(id) },
    },
  });
  const file = path.join(directory, 'functions', item.name, 'index.js');
  const content = await readFile(file);
  functions.push({ name: item.name, entry: `functions/${item.name}/index.js`, source_sha256: digest((await readFile(entry, 'utf8')).replace(/\r\n/g, '\n')), bundle_sha256: digest(content), bytes: content.length, verify_jwt: false });
}
if (functions.length !== 8) throw new Error('Expected eight reviewed Edge Functions.');
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ mode: 'Fresh project only; generated from the canonical migrations and Edge source. No credentials are embedded.', schema_sha256: digest(sql), migrations, functions }, null, 2) + '\n');
console.log(`Prepared ${migrations.length} atomic migrations and ${functions.length} standalone Edge Functions.`);
