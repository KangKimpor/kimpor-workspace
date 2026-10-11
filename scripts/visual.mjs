import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
const matrix = JSON.parse(await readFile('docs/evidence/screenshot-matrix.json', 'utf8'));
const destination = 'docs/visual-baselines';
if (process.argv.includes('--record')) {
  if (process.env.CI !== 'true') throw new Error('Record approved baselines on the CI runner with the Visual baselines workflow, then review its artifact before committing.');
  await mkdir(destination, { recursive: true });
  for (const capture of matrix.captures) await copyFile(capture.file, path.join(destination, path.basename(capture.file)));
  await writeFile(`${destination}/source.json`, JSON.stringify({ commit: process.env.GITHUB_SHA, platform: process.platform, playwright: '1.64.0', runner: process.env.RUNNER_OS, captures: matrix.captures.length, date: matrix.date, fixture_time: matrix.fixture_time, locale: matrix.locale, time_zone: matrix.time_zone }, null, 2) + '\n');
  console.log(`Recorded ${matrix.captures.length} CI captures for review. This does not approve the baseline.`);
} else {
  try { await access(`${destination}/source.json`); } catch { throw new Error('CI visual baseline not provisioned. Run Visual baselines, inspect its images, commit the approved artifact, and rerun CI. Phase 0 cannot pass until this gate is provisioned.'); }
  const comparisons = [], differences = [];
  await mkdir('docs/screenshots/diffs', { recursive: true });
  for (const capture of matrix.captures) {
    const name = path.basename(capture.file), baseline = path.join(destination, name);
    const expected = await sharp(baseline).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const current = await sharp(capture.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (expected.info.width !== current.info.width || expected.info.height !== current.info.height) { differences.push(`${name}: dimensions changed`); continue; }
    const { width, height } = current.info, output = Buffer.alloc(width * height * 4);
    const changed = pixelmatch(expected.data, current.data, output, width, height, { threshold: .1, includeAA: false });
    const ratio = changed / (width * height), passed = ratio <= .001;
    comparisons.push({ name, width, height, changed, ratio, passed });
    if (!passed) { differences.push(`${name}: ${(ratio * 100).toFixed(3)}% changed`); await sharp(output, { raw: { width, height, channels: 4 } }).png().toFile(`docs/screenshots/diffs/${name}`); }
  }
  await writeFile('docs/evidence/visual-comparison.json', JSON.stringify({ date: new Date().toISOString(), threshold: .1, maxChangedPixelRatio: .001, comparisons }, null, 2) + '\n');
  if (differences.length) throw new Error(`Visual gate failed:\n${differences.join('\n')}`);
  console.log(`${comparisons.length} screenshots match the reviewed CI baseline.`);
}
