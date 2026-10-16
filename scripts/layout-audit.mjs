import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { matrix } from './viewport-profiles.mjs';
import { shardProfiles, validateLayouts } from './visual-matrix.mjs';
const shard = process.env.VISUAL_SHARD;
const profiles = shardProfiles();
const suffix = shard ? `-${shard.split('/')[0]}` : '';
const merging = process.argv.includes('--merge');

await mkdir('.private', { recursive: true });
if (!merging && !process.env.AUTH_BASE_URL) {
  const build = spawnSync(process.execPath, ['scripts/auth-test.mjs','--build-only'], {stdio:'inherit',env:process.env});
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const result = merging ? { status: 0 } : spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'tests/layout-audit.spec.ts', '--reporter=list,json', '--output', `test-results/layout-audit${suffix || '-full'}`], {
  stdio: 'inherit',
  env: { ...process.env, KIMPOR_LAYOUT_AUDIT: 'true', PLAYWRIGHT_JSON_OUTPUT_NAME: `.private/layout-results${suffix}.json` },
});
if (result.error) throw result.error;
const report = merging ? { suites: [] } : JSON.parse(await readFile(`.private/layout-results${suffix}.json`, 'utf8'));
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
if (merging) {
  const count = Number(process.env.VISUAL_SHARDS);
  shardProfiles(`1/${count}`);
  for (let index = 1; index <= count; index++) {
    const partial = JSON.parse(await readFile(`docs/evidence/layout-shard-${index}.json`, 'utf8'));
    if (!partial.passed || partial.commit !== process.env.GITHUB_SHA || partial.shard !== `${index}/${count}`) throw new Error('Stale or failed layout shard');
    validateLayouts(partial.receipts, shardProfiles(partial.shard));
    receipts.push(...partial.receipts);
  }
}
validateLayouts(receipts, merging ? matrix : profiles);
const passed = result.status === 0;
await mkdir('docs/evidence', { recursive: true });
await writeFile(shard ? `docs/evidence/layout-shard-${shard.split('/')[0]}.json` : 'docs/evidence/lime-layout-audit.json', JSON.stringify({ generatedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA,shard,passed,expectedProfiles:profiles.length*2,screenshots:'test-results/layout-audit-*/',receipts },null,2)+'\n');
if (!passed) throw new Error('Layout audit failed');
console.log(`Layout audit passed: ${receipts.length} profiles, ${receipts.length * 18} screens.`);
