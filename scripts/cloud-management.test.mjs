import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { managementApi, projectRef, verifyProject, applyReviewedSchema, configureAuth, configureDomain } from './cloud-management.mjs';
const privateFixture = 'sbp_' + 'x'.repeat(40);

test('domain-only setup preserves redirects and changes only domain settings', async () => {
  let settings = { site_url: 'https://kangkimpor.github.io/kimpor-workspace/', uri_allow_list: 'https://kangkimpor.github.io/kimpor-workspace/**,http://localhost:5173/**' };
  await configureDomain(async (route, method, body) => {
    assert.ok(['config/auth', 'secrets'].includes(route));
    if (route === 'config/auth' && method === 'PATCH') {
      assert.deepEqual(Object.keys(body).sort(), ['site_url', 'uri_allow_list']);
      settings = { ...settings, ...body };
    }
    if (route === 'secrets') {
      assert.deepEqual(body.map(row => row.name), ['ALLOWED_ORIGINS', 'VAPID_SUBJECT']);
      const allowedOrigins = body[0].value.split(',').map(value => new URL(value.trim()).origin);
      assert.ok(allowedOrigins.includes('https://ws.kimporkang.com'));
    }
    return settings;
  });
  assert.equal(settings.site_url, 'https://ws.kimporkang.com/');
  assert.equal(settings.uri_allow_list, 'https://kangkimpor.github.io/kimpor-workspace/**,http://localhost:5173/**,https://ws.kimporkang.com/**');
});

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

test('code-only configuration refuses the restricted default sender before writes', async () => {
  let writes = 0;
  await assert.rejects(configureAuth(async (_path, method) => {
    if (method === 'PATCH') writes++;
    return { smtp_host: '' };
  }), /custom SMTP is required/);
  assert.equal(writes, 0);
});

test('custom sender receives token-only templates without changing Google identities', async () => {
  let settings = { smtp_host: 'smtp.fixture.test', external_google_enabled: true,
    mailer_templates_magic_link_content: '{{ .ConfirmationURL }}', mailer_templates_confirmation_content: '{{ .ConfirmationURL }}' };
  const report = await configureAuth(async (_path, method, body) => {
    if (method === 'PATCH') {
      assert.equal('external_google_enabled' in body, false);
      settings = { ...settings, ...body };
    }
    return settings;
  });
  assert.equal(settings.smtp_max_frequency, 30);
  assert.equal(settings.site_url, 'https://ws.kimporkang.com/');
  assert.ok(settings.uri_allow_list.split(',').includes('https://ws.kimporkang.com/**'));
  assert.ok(settings.uri_allow_list.split(',').includes('https://kangkimpor.github.io/kimpor-workspace/**'));
  assert.equal(settings.mailer_templates_confirmation_content, '{{ .Token }}');
  assert.equal(settings.mailer_templates_magic_link_content, '{{ .Token }}');
  assert.equal(report.email_mode, 'code');
  assert.equal(report.google_enabled, true);
  assert.equal(report.default_sender_restricted_to_team, false);
  assert.equal(report.delivery_tested, false);
});
