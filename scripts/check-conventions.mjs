import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const violations = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (file.endsWith('.tsx') && !file.endsWith('Pressable.tsx')) {
      if (/<(?:button|motion\.button)\b/.test(await readFile(file, 'utf8'))) violations.push(`${file}: use Pressable for buttons`);
    }
    else if (file.endsWith('.css') && !file.endsWith('tokens.css')) {
      if (/#(?:[a-f\d]{3,8})\b|\b(?:rgba?|hsla?)\(/i.test(await readFile(file, 'utf8'))) violations.push(`${file}: define colors in tokens.css`);
    }
  }
}
for (const directory of ['apps/web/src', 'packages/ui/src']) await walk(directory);
if (violations.length) throw new Error(violations.join('\n'));
console.log('Conventions: Pressable ownership and semantic colors passed.');
