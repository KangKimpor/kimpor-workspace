import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { matrix } from './viewport-profiles.mjs';

await mkdir('.private', { recursive: true });
if (!process.env.AUTH_BASE_URL) {
  const build = spawnSync(process.execPath, ['scripts/auth-test.mjs','--build-only'], {stdio:'inherit',env:process.env});
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'tests/layout-audit.spec.ts', '--reporter=list,json'], {
  stdio: 'inherit',
  env: { ...process.env, KIMPOR_LAYOUT_AUDIT: 'true', PLAYWRIGHT_JSON_OUTPUT_NAME: '.private/layout-results.json' },
});
if (result.error) throw result.error;
const report = JSON.parse(await readFile('.private/layout-results.json', 'utf8'));
const receipts = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests) {
    const last = test.results.at(-1);
    const attachment = last?.attachments.find(item => item.name === 'layout-metrics');
    if (last?.status === 'passed' && attachment?.body) {
      const { profile, records } = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      receipts.push({ profile, screens: records.map(metrics => ({
        screen:metrics.screen, overflow:metrics.overflow,
        smallTargets:metrics.small.length, overlaps:metrics.overlaps.length, escaping:metrics.escaping.length, truncation:metrics.truncation.length,
        leftEdges:metrics.alignment.map(box=>box.left), monthRowHeights:metrics.rows.map(row=>row.height),
        monthBottom:metrics.month?.bottom ?? null, paneBottom:metrics.main.bottom,
        cardHeights:metrics.cards.map(card=>card.height), dockBottom:metrics.dock?.bottom ?? null, viewportHeight:metrics.height,
      })) });
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);
const passed = result.status === 0 && receipts.length === matrix.length * 2 && receipts.every(item => item.screens.length === 18);
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/lime-layout-audit.json', JSON.stringify({ generatedAt:new Date().toISOString(),passed,expectedProfiles:matrix.length*2,screenshots:'test-results/layout-audit-*/',receipts },null,2)+'\n');
if (!passed) throw new Error(`Layout audit incomplete: ${receipts.length}/${matrix.length * 2} profiles passed`);
console.log(`Layout audit passed: ${receipts.length} profiles, ${receipts.length * 18} screens.`);
