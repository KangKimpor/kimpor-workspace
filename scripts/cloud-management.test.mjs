import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { managementApi, projectRef, verifyProject, applyReviewedSchema } from './cloud-management.mjs';
const privateFixture = 'sbp_' + 'x'.repeat(40);

test('deployment rejects another project before any network request', () => {
  assert.throws(() => managementApi('private-fixture', 'another-project', () => { throw Error('Network must not run'); }), /another project/);
});

test('API errors omit server response bodies containing private values', async () => {
  const api = managementApi(privateFixture, projectRef, async () => new Response('private-server-response', { status: 403 }));
  await assert.rejects(api('secrets'), error => error.message === 'Supabase GET secrets returned HTTP 403' && !error.message.includes('private'));
});

test('a project API key or masked token is rejected before network access', () => {
  for (const value of ['sb_secret_project', 'sbp_***', 'token label'])
    assert.throws(() => managementApi(value, projectRef, () => { throw Error('Network must not run'); }), /complete personal access token/);
});

test('renamed or unready project refuses deployment', async () => {
  for (const project of [{ ref: projectRef, name: 'unrelated', status: 'ACTIVE_HEALTHY' }, { ref: projectRef, name: 'kimpor-workspace', status: 'PAUSED' }])
    await assert.rejects(verifyProject(async () => project), /identity differs/);
});

test('partial or unrecognized live migration history refuses schema writes', async () => {
  const schema = await readFile(new URL('../supabase/dashboard/schema.sql', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../supabase/dashboard/manifest.json', import.meta.url), 'utf8'));
  for (const migrations of [null, 'supabase_migrations.schema_migrations']) {
    let writes = 0;
    const api = async (_path, _method, body) => {
      if (!body.read_only) writes++;
      return body.query.includes('to_regclass') ? [{ pages: 'pages', migrations }] : [{ version: manifest.migrations[0].version }];
    };
    await assert.rejects(applyReviewedSchema(api, schema, manifest), /migration history|differs/);
    assert.equal(writes, 0);
  }
});

test('changed schema bytes refuse deployment before database access', async () => {
  const manifest = JSON.parse(await readFile(new URL('../supabase/dashboard/manifest.json', import.meta.url), 'utf8'));
  await assert.rejects(applyReviewedSchema(() => { throw Error('Network must not run'); }, 'changed', manifest), /checksum differs/);
});
