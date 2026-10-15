import { readFile, writeFile } from 'node:fs/promises';
const css = await readFile('packages/ui/src/tokens.css', 'utf8');
const values = block => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})(?:;|\s)/gi)].map(match => [match[1], match[2]]));
const light = values(css.split(":root[data-theme='dark']")[0]);
const dark = { ...light, ...values(css.split(":root[data-theme='dark']")[1].split('}')[0]) };
function luminance(hex) { const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return channels.reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0); }
function contrast(a, b) { const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y); return (high + .05) / (low + .05); }
const evidence = [];
function check(theme, foreground, background, minimum) { const tokens = theme === 'dark' ? dark : light, ratio = contrast(tokens[foreground], tokens[background]); evidence.push({ theme, foreground, background, ratio: +ratio.toFixed(3), minimum }); if (ratio < minimum) throw new Error(`${theme} ${foreground}/${background}: ${ratio.toFixed(3)} < ${minimum}`); }
for (const theme of ['light', 'dark']) {
  for (const foreground of ['text', 'secondary', 'tertiary']) for (const background of ['bg', 'surface', 'surface-raised', 'sidebar', 'field', 'surface-inset']) check(theme, foreground, background, 4.5);
  check(theme, 'on-ink', 'ink', 4.5);
  check(theme, 'on-now', 'now-fill', 4.5);
  check(theme, 'danger', 'danger-tint', 4.5);
  for (const color of ['blue','green','purple','orange','red']) check(theme, 'on-cal', `cal-${color}`, 4.5);
  check(theme, 'on-accent', 'accent-fill', 4.5);
  check(theme, 'on-schedule', 'schedule', 4.5);
  check(theme, 'schedule-secondary', 'schedule', 4.5);
  check(theme, 'accent', 'accent-tint', 4.5);
  check(theme, 'success', 'success-tint', 4.5);
  for (const background of ['bg', 'surface', 'field']) check(theme, 'accent', background, 3);
}
check('light', 'white', 'brand-top', 4.3); check('light', 'white', 'brand-bottom', 4.3);
await writeFile('docs/evidence/contrast.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(`${evidence.length} semantic color pairs meet text, focus and brand contrast thresholds.`);
