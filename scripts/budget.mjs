import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
const base = 'apps/web/dist';
const manifest = JSON.parse(await readFile(`${base}/.vite/manifest.json`, 'utf8'));
function graphSize(key, seen = new Set()) {
  if (seen.has(key)) return [];
  seen.add(key);
  const chunk = manifest[key];
  return [chunk.file, ...(chunk.imports ?? []).flatMap(next => graphSize(next, seen))];
}
async function size(files) {
  let total = 0;
  for (const file of new Set(files.filter(name => name.endsWith('.js')))) total += gzipSync(await readFile(`${base}/${file}`)).length;
  return total;
}
const initiallyLoaded = new Set(Object.entries(manifest).filter(([, chunk]) => chunk.isEntry).flatMap(([key]) => graphSize(key)));
for (const [key, chunk] of Object.entries(manifest)) {
  if (!chunk.isEntry && !chunk.isDynamicEntry) continue;
  const files = graphSize(key).filter(file => chunk.isEntry || !initiallyLoaded.has(file));
  const bytes = await size(files);
  console.log(`${key}: ${(bytes / 1024).toFixed(1)} KiB gzip (${chunk.isEntry ? 'initial dependency graph' : 'additional lazy-load dependency graph'})`);
  if (bytes > 250 * 1024) throw new Error(`${key} exceeds the 250 KiB JS budget`);
}
for (const file of await readdir(`${base}/assets`)) {
  if ((await stat(path.join(base, 'assets', file))).size > 2 * 1024 * 1024) throw new Error(`${file} exceeds the service-worker cache limit`);
}
