import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
await mkdir('brand/exports/concepts', { recursive: true });
const cell = 224, height = 248, tiles = [];
const sizes = [1024, 180, 64, 32, 16];
for (const [row, name] of ['A', 'B', 'C'].entries()) {
  const source = await readFile(`brand/svg/concept-${name}.svg`, 'utf8');
  const inner = source.replace(/<svg[^>]*>|<\/svg>|<title>.*?<\/title>/g, '').replace('stroke-width="3"', 'stroke-width="6"');
  for (const [column, size] of sizes.entries()) for (const [themeIndex, theme] of ['light', 'dark', 'icon'].entries()) {
    const color = theme === 'light' ? '#2268BF' : theme === 'dark' ? '#5A9CED' : 'white';
    const background = theme === 'light' ? '#F5F5F7' : theme === 'dark' ? '#1C1C1E' : '#E7EDF5';
    const defs = '<defs><linearGradient id="blue" x2="0" y2="1"><stop stop-color="#3C7BC8"/><stop offset="1" stop-color="#1E4A85"/></linearGradient></defs>';
    const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${defs}${theme === 'icon' ? '<rect width="100" height="100" rx="22" fill="url(#blue)"/>' : ''}<g color="${color}" ${theme === 'icon' ? 'transform="translate(10 10) scale(.8)"' : ''}>${inner}</g></svg>`;
    const full = await sharp(Buffer.from(mark)).png().toBuffer();
    await writeFile(`brand/exports/concepts/${name}-${size}-${theme}.png`, full);
    const displaySize = Math.min(size, 200);
    const rendered = await sharp(full).resize(displaySize, displaySize).png().toBuffer();
    const label = Buffer.from(`<svg width="224" height="30"><text x="12" y="21" font-family="sans-serif" font-size="14" fill="${theme === 'dark' ? 'white' : '#23232A'}">${name} · ${size}px · ${theme}</text></svg>`);
    const tile = await sharp({ create: { width: cell, height, channels: 4, background } }).composite([{ input: rendered, left: Math.floor((cell-displaySize)/2), top: 8 }, { input: label, left: 0, top: height-30 }]).png().toBuffer();
    tiles.push({ input: tile, left: (column*3+themeIndex)*cell, top: row*height });
  }
}
await sharp({ create: { width: cell*15, height: height*3, channels: 4, background: '#F5F5F7' } }).composite(tiles).png().toFile('brand/exports/monogram-review.png');
const large = [];
for(const [i,name] of ['A','B','C'].entries()) large.push({input:await sharp(`brand/exports/concepts/${name}-1024-icon.png`).resize(300,300).png().toBuffer(),left:40+i*340,top:40});
await sharp({create:{width:1060,height:400,channels:4,background:'#E7EDF5'}}).composite(large).png().toFile('brand/exports/monogram-directions.png');
console.log('A: opening K + tail. B: opening K. C: terminal loop + tail. All derived from isolated source strokes.');
