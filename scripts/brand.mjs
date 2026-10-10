import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import sharp from 'sharp';

// Public masters contain isolated signature strokes only. Private source is never read here.
const master = (await readFile('brand/svg/concept-A.svg', 'utf8')).replace('monogram A', 'monogram');
const bold = master.replace('stroke-width="3"', 'stroke-width="6"');
const innerOf = svg => svg.replace(/<svg[^>]*>|<\/svg>|<title>.*?<\/title>/g, '');
const inner = innerOf(bold);
const gradient = '<defs><linearGradient id="blue" x2="0" y2="1"><stop stop-color="#3C7BC8"/><stop offset="1" stop-color="#1E4A85"/></linearGradient></defs>';
// Original smooth-corner construction, with tangent joins and generous icon clear space.
const shape = 'M50 0C78 0 84 0 92 8C100 16 100 22 100 50C100 78 100 84 92 92C84 100 78 100 50 100C22 100 16 100 8 92C0 84 0 78 0 50C0 22 0 16 8 8C16 0 22 0 50 0Z';
const icon = rounded => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${gradient}<path fill="url(#blue)" d="${rounded ? shape : 'M0 0h100v100H0z'}"/><g color="white" transform="translate(10 10) scale(.8)">${inner}</g></svg>`;
const fullBleed = icon(false), rounded = icon(true);
for (const directory of ['apps/web/public', 'apps/desktop/src-tauri/icons', 'brand/exports', 'packages/ui/src']) await mkdir(directory, { recursive: true });
await writeFile('brand/svg/mark.svg', master);
await writeFile('brand/svg/mark-bold.svg', bold);
await writeFile('brand/svg/mark-mono.svg', master);
await writeFile('brand/svg/lockup.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><g color="#2268BF">${innerOf(master)}</g><text x="112" y="63" font-family="Inter, system-ui, sans-serif" font-size="40" font-weight="600" letter-spacing="-1" fill="#2268BF">VeloraDesk</text></svg>`);
await writeFile('brand/svg/icon.svg', rounded);
await writeFile('brand/svg/icon-fullbleed.svg', fullBleed);
const paths = [...bold.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
await writeFile('packages/ui/src/BrandMark.tsx', `// Generated from brand/svg/mark-bold.svg by pnpm brand:build.\nconst strokes = ${JSON.stringify(paths, null, 2)};\nexport function BrandMark({ size = 24 }: { size?: number }) {\n  return <svg viewBox="0 0 100 100" width={size} height={size} fill="none" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">{strokes.map((d, index) => <path key={index} d={d}/>)}</g></svg>;\n}\n`);
await writeFile('apps/web/public/favicon.svg', bold.replace('</svg>', '<style>svg{color:#2268BF}@media(prefers-color-scheme:dark){svg{color:#5A9CED}}</style></svg>'));
async function png(svg, size, file) { await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file); }
for (const [name, size] of [['apple-touch-icon', 180], ['icon-maskable', 512]]) await png(fullBleed, size, `apps/web/public/${name}.png`);
for (const size of [192, 512]) await png(rounded, size, `apps/web/public/icon-${size}.png`);
const blueBold = bold.replaceAll('currentColor', '#2268BF');
await png(blueBold, 32, 'apps/web/public/favicon-32.png');
await png(rounded, 1024, 'brand/exports/icon-1024.png');
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) await png(rounded, size, `apps/desktop/src-tauri/icons/${size}x${size}.png`);
async function ico(svg, sizes, file) {
  const images = [];
  for (const size of sizes) images.push(await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer());
  const header = Buffer.alloc(6 + images.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => { const at = 6 + index * 16; const size = sizes[index]; header[at] = size === 256 ? 0 : size; header[at + 1] = header[at]; header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(image.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += image.length; });
  await writeFile(file, Buffer.concat([header, ...images]));
}
await ico(rounded, [16, 24, 32, 48, 64, 128, 256], 'apps/desktop/src-tauri/icons/icon.ico');
await ico(blueBold, [16, 32, 48], 'apps/web/public/favicon.ico');
for (const [name, width, height] of [['og', 1200, 630], ['github-social', 1280, 640]]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#E7EDF5"/><svg x="64" y="110" width="220" height="220" viewBox="0 0 100 100" color="#2268BF">${inner}</svg><text x="340" y="275" font-family="sans-serif" font-size="64" font-weight="600" fill="#23232A">VeloraDesk</text><text x="345" y="340" font-family="sans-serif" font-size="28" fill="#62626C">A quieter place for everything.</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`brand/exports/${name}.png`);
}
await sharp('brand/exports/og.png').toFile('apps/web/public/og.png');
// NSIS requires uncompressed BMP. Write 24-bit bottom-up RGB data as padded BGR rows.
async function bmp(svg, width, height, file) {
  const rgb = await sharp(Buffer.from(svg)).flatten({ background: '#E7EDF5' }).removeAlpha().raw().toBuffer();
  const stride = Math.ceil(width * 3 / 4) * 4, data = Buffer.alloc(54 + stride * height);
  data.write('BM'); data.writeUInt32LE(data.length, 2); data.writeUInt32LE(54, 10); data.writeUInt32LE(40, 14);
  data.writeInt32LE(width, 18); data.writeInt32LE(height, 22); data.writeUInt16LE(1, 26); data.writeUInt16LE(24, 28); data.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const source = (y * width + x) * 3, target = 54 + (height - 1 - y) * stride + x * 3; data[target] = rgb[source + 2]; data[target + 1] = rgb[source + 1]; data[target + 2] = rgb[source]; }
  await writeFile(file, data);
}
await bmp(`<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg"><rect width="150" height="57" fill="#E7EDF5"/><svg x="8" y="10" width="36" height="36" viewBox="0 0 100 100" color="#2268BF">${inner}</svg><text x="50" y="34" font-family="sans-serif" font-weight="600" font-size="13" fill="#23232A">VeloraDesk</text></svg>`, 150, 57, 'apps/desktop/src-tauri/icons/installer-header.bmp');
await bmp(`<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg"><rect width="164" height="314" fill="#E7EDF5"/><svg x="30" y="52" width="104" height="104" viewBox="0 0 100 100" color="#2268BF">${inner}</svg><text x="82" y="204" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="22" fill="#23232A">VeloraDesk</text><text x="82" y="236" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#62626C">A quieter place</text><text x="82" y="254" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#62626C">for everything.</text></svg>`, 164, 314, 'apps/desktop/src-tauri/icons/installer-sidebar.bmp');
await rm('brand/exports/temporary-mark-review.png', { force: true });
await import('./brand-review.mjs');
console.log('Signature-derived A exported: vector masters, PWA, Apple touch, favicons, Windows, NSIS and social images.');
