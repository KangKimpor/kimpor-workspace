import {chromium,webkit,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const sharp=require('sharp');
const dir='docs/screenshots/responsive-review';await mkdir(dir,{recursive:true});
const results=[],images=[];
for(const [name,width,height,engine,touch] of [['phone-small',320,640,webkit,true],['iphone15',393,852,webkit,true],['ipad-a16',820,1180,webkit,true],['ipad-a16-landscape',1180,820,webkit,true],['ipad-reference',1280,800,webkit,true],['desktop1080',1980,1080,chromium,false],['desktop1200',1980,1200,chromium,false]]){
 const browser=await engine.launch();const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1,reducedMotion:'reduce'});const page=await context.newPage();
 const nav=()=>page.getByRole('navigation',{name:width<600?'Bottom navigation':'Main navigation',exact:true});
 await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173');
 async function navigate(name){const button=nav().getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(page.getByRole('region',{name:'Page detail',exact:true})).toHaveCount(0);}
 async function shot(screen){
  const notice=page.getByRole('button',{name:'Dismiss notification',exact:true});if(await notice.isVisible())await notice.click();
  await expect(page.getByRole('textbox',{name:'Page title'})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const file=dir+'/'+name+'-'+screen+'.png';await page.screenshot({path:file,fullPage:true});images.push(file);results.push({name,screen,width,height,overflow:false});
 }
 await shot('today');await navigate('Notes');await page.getByRole('button',{name:'New note',exact:true}).click();
 await page.getByRole('textbox',{name:'Page title'}).fill('A little room for ideas');const editor=page.getByRole('textbox',{name:'Document editor',exact:true});await editor.fill('A quiet place to think.\n\nខ្មែរ · 中文 · English\n\nSmall ideas become good days.');
 {const toolbar=page.getByRole('toolbar',{name:'Document formatting',exact:true});await expect(toolbar.locator('button:visible')).toHaveCount(5);await toolbar.getByRole('button',{name:'More formatting'}).click();await expect(page.getByRole('button',{name:'Insert image',exact:true})).toBeVisible();await toolbar.getByRole('button',{name:'Less formatting'}).click();await expect(editor).toContainText('ខ្មែរ');}
 await shot('writing');await navigate('Journal');await shot('journal');
 await page.getByRole('button',{name:'Write today',exact:true}).click();await page.getByRole('textbox',{name:'Page title'}).fill('A small moment');await editor.fill('Today I am grateful for a little quiet.');await navigate('Journal');await page.getByRole('button',{name:'Continue writing',exact:true}).click();await expect(editor).toContainText('Today I am grateful');await shot('journal-entry');
 await navigate('Calendar');if(width<=1366)await page.getByRole('combobox',{name:'Calendar view',exact:true}).selectOption('month');else await page.getByRole('button',{name:'Month',exact:true}).click();await expect(page.locator('.cal-day-add')).toHaveCount(0);await shot('calendar');
 await page.getByRole('button',{name:'New event',exact:true}).first().click();await expect(page.getByRole('dialog',{name:'New event',exact:true})).toBeVisible();await shot('event');
 await browser.close();
}
const thumbs=await Promise.all(images.map(file=>sharp(file).resize({width:320,height:380,fit:'contain',background:'#eeeeee'}).png().toBuffer()));
await sharp({create:{width:1920,height:2660,channels:3,background:'#cccccc'}}).composite(thumbs.map((input,i)=>({input,left:i%6*320,top:Math.floor(i/6)*380}))).png().toFile(dir+'/contact.png');
await writeFile(dir+'/results.json',JSON.stringify({date:new Date().toISOString(),mode:'Managed browser viewport checks, not physical devices',checks:results},null,2));console.log(JSON.stringify({passed:results.length,contact:dir+'/contact.png'}));
