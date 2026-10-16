import { chromium, webkit, firefox, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const url = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const fixtureTime = '2026-10-11T09:00:00Z';
import { matrix } from './viewport-profiles.mjs';
await mkdir('docs/screenshots', {recursive:true});
const browsers = {};
const selectedScreens=process.env.SHOT_SCREENS?.split(',').filter(Boolean);
const screenNames=['today','calendar','notes','note-detail','journal','workspace','database','settings','search','design','editor','about','palette','sign-in','email-code'];
if(selectedScreens?.some(screen=>!screenNames.includes(screen)))throw new Error('Unknown screenshot screen.');
const report=selectedScreens
  ? JSON.parse(await readFile('docs/evidence/screenshot-matrix.json','utf8')).captures.filter(row=>!selectedScreens.includes(row.screen))
  : [];
try {
  for (const [name,width,height,dpr,engine] of matrix) {
    browsers[engine] ??= await ({chromium,webkit,firefox})[engine].launch();
    for (const theme of ['light','dark']) {
      const context = await browsers[engine].newContext({ viewport:{width,height}, deviceScaleFactor:dpr, hasTouch:engine==='webkit', isMobile:engine==='webkit', colorScheme:theme, reducedMotion:'reduce', locale:'en-US', timezoneId:'UTC' });
      const page=await context.newPage();
      const seedTime = offset => page.clock.setFixedTime(new Date(Date.parse(fixtureTime) + offset));
      const navigate = async route => {
        if(width<600 && await page.locator('.ws-app[data-editing="true"]').count())await page.locator('.ws-detail-back').click();
        const tab = page.getByRole('navigation',{name:width<600?'Bottom navigation':'Main navigation',exact:true}).getByRole('button',{name:route,exact:true});
        await tab.click();
        await expect(tab).toHaveAttribute('aria-current','page');
      };
      await seedTime(-5000);
      await page.addInitScript(value=>localStorage.setItem('velora-theme',value),theme);
      await page.goto(`${url}/`,{waitUntil:'networkidle'});
      await navigate('Notes');
      await seedTime(-4000);
      await page.getByRole('button',{name:'New note',exact:true}).click();
      await page.getByRole('textbox',{name:'Page title'}).fill('A little room for ideas');
      await page.getByRole('textbox',{name:'Document editor'}).fill('A quiet place to think.\n\nខ្មែរ · 中文 · English\n\nSmall ideas become good days.');
      await navigate('Projects');
      await seedTime(-3000);
      await page.getByRole('button',{name:'New project',exact:true}).click();
      await page.getByRole('dialog',{name:'New project',exact:true}).getByRole('button',{name:'Coursework',exact:true}).click();
      await page.getByRole('textbox',{name:'Page title'}).fill('Projects');
      await expect(page.getByRole('textbox',{name:'Page title'})).toHaveValue('Projects');
      await seedTime(-2000);
      await page.getByRole('button',{name:'New task',exact:true}).filter({visible:true}).first().click();
      await page.getByRole('textbox',{name:'Document editor'}).waitFor();
      await page.getByRole('textbox',{name:'Page title'}).fill('Make room for a small idea');
      await page.getByRole('textbox',{name:'Document editor'}).fill('One small step, every day.');
      await navigate('Journal');
      await seedTime(-1000);
      await page.getByRole('button',{name:'Write',exact:true}).click();
      await page.getByRole('textbox',{name:'Page title'}).fill('A moment for myself');
      await page.getByRole('textbox',{name:'Document editor'}).fill('Today I am grateful for a little quiet.\n\nអរគុណ · 谢谢 · Thank you');
      await navigate('Calendar');
      await seedTime(0);
      await page.getByRole('button',{name:'New event',exact:true}).filter({visible:true}).first().click();
      await page.getByLabel('Title',{exact:true}).fill('A little time to plan');
      await page.getByRole('dialog',{name:'New event',exact:true}).locator('select').first().selectOption({label:'Personal'});
      await page.getByRole('button',{name:'Done',exact:true}).click();
      await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:15000});
      const product=[['today','Today'],['calendar','Calendar'],['notes','Notes'],['note-detail','Notes'],['journal','Journal'],['workspace','Projects'],['database','Projects'],['settings','Today'],['search','Today']];
      for (const [screen,route] of [...product,['design','/design'],['editor','/spikes/editor'],['about','/design'],['palette','/design']]) {
        if(selectedScreens&&!selectedScreens.includes(screen))continue;
        console.log(`Capture ${name} ${theme}: ${screen}`);
        if(route.startsWith('/'))await page.goto(`${url}${route}`,{waitUntil:'networkidle'});
        else{
          await navigate(route);
          await expect(page.getByRole('region',{name:'Page detail',exact:true})).toHaveCount(0);
          if(screen==='note-detail'){await page.locator('main').getByRole('button',{name:/A little room for ideas/}).first().click();await page.getByRole('textbox',{name:'Document editor'}).waitFor();await page.getByRole('textbox',{name:'Document editor'}).focus();}
          if(screen==='database'){await page.locator('main .ws-project-card').filter({hasText:'Projects'}).first().click();await expect(page.locator('.ws-database')).toBeVisible();}
          if(screen==='settings'){if(!await page.getByRole('button',{name:'Settings',exact:true}).first().isVisible())await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).first().click();await page.getByRole('button',{name:'Export ZIP'}).waitFor();}
          if(screen==='search')await page.getByRole('button',{name:'Search workspace',exact:true}).click();
        }
        await page.waitForFunction(()=>document.fonts.status==='loaded',undefined,{timeout:10000});
        if(await page.getByRole('button',{name:'Dismiss notification',exact:true}).isVisible())await page.getByRole('button',{name:'Dismiss notification',exact:true}).click({timeout:1000}).catch(()=>{});
        if(screen==='editor') await page.getByRole('textbox',{name:'Multilingual editor study'}).waitFor();
        if(screen==='about') await page.getByRole('button',{name:'Take a closer look'}).click();
        if(screen==='palette') await page.getByRole('button',{name:'Open command palette'}).click();
        // Pressable uses a JavaScript spring, which screenshot animations:'disabled'
        // does not stop. WebKit can retain the old tab text tint in that layer until
        // the spring returns to rest even after aria-current updates.
        await page.waitForFunction(() => [...document.querySelectorAll('.pressable')].every(element => {
          if (element.matches(':disabled') || !element.getClientRects().length) return true;
          const style = getComputedStyle(element);
          return style.opacity === '1' && style.transform === 'none' && element.getAttribute('data-pressed') !== 'true';
        }));
        // Capture the settled compositor paint after every control is at rest.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // Wait for asynchronous account-cache reads and the final WebKit paint.
        if(screen==='today')await expect(page.locator('main').getByText('A little time to plan',{exact:true}).first()).toBeVisible();
        if(screen==='calendar'){await expect(page.locator('.cal-month-grid')).toBeVisible();await expect(page.locator('.cal-month-grid .cal-month-event,.cal-month-grid .cal-more,.cal-month-grid .cal-day-dots i').first()).toBeAttached();}
        await page.waitForTimeout(350);
        const file=`docs/screenshots/${screen}-${name}-${theme}.png`;
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1);
        if(overflow) throw new Error(`Horizontal overflow: ${file}`);
        await page.screenshot({path:file,fullPage:screen==='design'||screen==='editor',animations:'disabled',timeout:30000});
        if(theme==='dark') {
          const unreadable=await page.locator('h1,h2,h3,.brand strong').evaluateAll(elements=>elements.filter(e=>getComputedStyle(e).color==='rgb(0, 0, 0)').map(e=>e.textContent));
          if(unreadable.length) throw new Error(`Dark text lost contrast: ${file}: ${unreadable.join(', ')}`);
        }
        report.push({screen,name,theme,file,width,height,dpr,engine,overflow,capturedAt:new Date().toISOString()});
        if(screen==='settings'||screen==='search'){await page.keyboard.press('Escape');if(await page.getByRole('button',{name:'Close sidebar',exact:true}).first().isVisible())await page.getByRole('button',{name:'Close sidebar',exact:true}).first().click();}
      }
      if (!selectedScreens || selectedScreens.some(screen => screen === 'sign-in' || screen === 'email-code')) {
        const auth = await browsers[engine].newContext({ viewport:{width,height}, deviceScaleFactor:dpr, hasTouch:engine==='webkit', isMobile:engine==='webkit', colorScheme:theme, reducedMotion:'reduce', locale:'en-US', timezoneId:'UTC', serviceWorkers:'block' });
        const entry = await auth.newPage();
        await entry.clock.setFixedTime(new Date(fixtureTime));
        await entry.addInitScript(value=>localStorage.setItem('velora-theme',value),theme);
        await entry.route('https://auth.example.test/**', route => route.fulfill({contentType:'application/json',body:'{}'}));
        await entry.goto(process.env.AUTH_BASE_URL ?? 'http://127.0.0.1:4174');
        await expect(entry.getByRole('main',{name:'Sign in',exact:true})).toBeVisible();
        for(const screen of ['sign-in','email-code']) {
          if(screen==='email-code') {
            await entry.getByRole('textbox',{name:'Email',exact:true}).fill('fixture@example.test');
            await entry.getByRole('button',{name:'Continue',exact:true}).click();
            await entry.getByRole('textbox',{name:'Email code',exact:true}).fill('123');
          }
          if(selectedScreens&&!selectedScreens.includes(screen))continue;
          await entry.evaluate(()=>document.fonts.ready);
          await entry.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const file=`docs/screenshots/${screen}-${name}-${theme}.png`;
          const overflow=await entry.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
          if(overflow)throw new Error(`Horizontal overflow: ${file}`);
          await entry.screenshot({path:file,animations:'disabled'});
          report.push({screen,name,theme,file,width,height,dpr,engine,overflow,capturedAt:new Date().toISOString()});
        }
        await auth.close();
      }
      await context.close();
    }
    console.log(`Rendered ${name}, light and dark.`);
  }
  if(report.length!==screenNames.length*matrix.length*2)throw new Error('Screenshot matrix is incomplete.');
  for(const screen of selectedScreens ?? [...new Set(report.map(row=>row.screen))]) for(const theme of ['light','dark']) {
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
  await writeFile('docs/evidence/screenshot-matrix.json',JSON.stringify({date:new Date().toISOString(),fixture_time:fixtureTime,locale:'en-US',time_zone:'UTC',captures:report},null,2)+'\n');
} finally { for(const browser of Object.values(browsers)) await browser.close(); }
