import { chromium, webkit, firefox } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const url = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const matrix = [
  ['phone-small',320,640,2,'webkit'], ['iphone15-portrait',393,852,3,'webkit'],
  ['iphone15-landscape',852,393,3,'webkit'], ['ipad-portrait',820,1180,2,'webkit'],
  ['ipad-landscape',1180,820,2,'webkit'], ['ipad-split-narrow',375,820,2,'webkit'],
  ['ipad-split-half',580,820,2,'webkit'], ['window-min',800,600,1.25,'chromium'],
  ['laptop',1536,864,1.25,'chromium'], ['desktop',1920,1080,1,'chromium'],
  ['desktop-firefox',1920,1080,1,'firefox'], ['wide',2560,1440,1,'chromium']
];
await mkdir('docs/screenshots', {recursive:true});
const browsers = {};
const report=[];
try {
  for (const [name,width,height,dpr,engine] of matrix) {
    browsers[engine] ??= await ({chromium,webkit,firefox})[engine].launch();
    for (const theme of ['light','dark']) {
      const context = await browsers[engine].newContext({ viewport:{width,height}, deviceScaleFactor:dpr, hasTouch:engine==='webkit', isMobile:engine==='webkit', colorScheme:theme, reducedMotion:'reduce' });
      const page=await context.newPage();
      await page.addInitScript(value=>localStorage.setItem('velora-theme',value),theme);
      for (const [screen,route] of [['design','/design'],['editor','/spikes/editor'],['about','/design'],['palette','/design']]) {
        await page.goto(`${url}${route}`,{waitUntil:'networkidle'});
        await page.evaluate(()=>document.fonts.ready);
        if(screen==='editor') await page.getByRole('textbox',{name:'Multilingual editor study'}).waitFor();
        if(screen==='about') await page.getByRole('button',{name:'Take a closer look'}).click();
        if(screen==='palette') await page.getByRole('button',{name:'Open command palette'}).click();
        const file=`docs/screenshots/${screen}-${name}-${theme}.png`;
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1);
        if(overflow) throw new Error(`Horizontal overflow: ${file}`);
        await page.screenshot({path:file,fullPage:screen==='design'||screen==='editor',animations:'disabled'});
        if(theme==='dark') {
          const unreadable=await page.locator('h1,h2,h3,.brand strong').evaluateAll(elements=>elements.filter(e=>getComputedStyle(e).color==='rgb(0, 0, 0)').map(e=>e.textContent));
          if(unreadable.length) throw new Error(`Dark text lost contrast: ${file}: ${unreadable.join(', ')}`);
        }
        report.push({screen,name,theme,file,width,height,dpr,engine,overflow});
      }
      await context.close();
    }
    console.log(`Rendered ${name}, light and dark.`);
  }
  for(const screen of ['design','editor','about','palette']) for(const theme of ['light','dark']) {
    const captures=report.filter(row=>row.screen===screen&&row.theme===theme);
    const width=400,height=1100;
    const tiles=[];
    for(let i=0;i<captures.length;i++) {
      const row=captures[i];
      const resized=await sharp(row.file).resize({width:width-16,height:height-40,fit:'inside'}).png().toBuffer();
      const label=Buffer.from(`<svg width="400" height="32"><rect width="400" height="32" fill="#E7EDF5"/><text x="8" y="22" font-family="sans-serif" font-size="14" fill="#23232A">${row.name} · ${row.engine} · ${theme}</text></svg>`);
      const tile=await sharp({create:{width,height,channels:4,background:theme==='dark'?'#111113':'#f5f5f7'}}).composite([{input:label,left:0,top:0},{input:resized,left:8,top:36}]).png().toBuffer();
      tiles.push({input:tile,left:(i%4)*width,top:Math.floor(i/4)*height});
    }
    await sharp({create:{width:width*4,height:height*Math.ceil(tiles.length/4),channels:4,background:'#dcdce2'}}).composite(tiles).png().toFile(`docs/screenshots/contact-${screen}-${theme}.png`);
  }
  await writeFile('docs/evidence/screenshot-matrix.json',JSON.stringify({date:new Date().toISOString(),captures:report},null,2)+'\n');
} finally { for(const browser of Object.values(browsers)) await browser.close(); }
