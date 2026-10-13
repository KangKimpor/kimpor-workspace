import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${root}/package.json`);
const { chromium, webkit, expect } = require('@playwright/test');
const Y = createRequire(`${root}/apps/web/package.json`)('yjs');
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const timestamp = new Date().toISOString();
const archive = { format: 'veloradesk', version: 1, exportedAt: timestamp, entities: [], documents: [], versions: [] };
let blockCount = 0;
function page(type, index, count, date = null) {
  const id = randomUUID();
  const title = type === 'note' && index === 0 ? 'Long multilingual page' : `${type} ${index} ខ្មែរ 中文`;
  const text = Array.from({length: count}, (_, block) => `Small idea ${index}.${block}. ខ្មែរ 中文 English.`);
  const doc = new Y.Doc();
  const blocks = text.map(value => {
    const paragraph = new Y.XmlElement('paragraph');
    const content = new Y.XmlText();
    content.insert(0, value);
    paragraph.insert(0, [content]);
    return paragraph;
  });
  doc.getXmlFragment('default').insert(0, blocks);
  archive.documents.push({pageId:id, update:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')});
  doc.destroy();
  archive.entities.push({table:'pages',entity:{id,userId:'local',type,title,parentId:null,favorite:false,tags:['synthetic'],icon:'',cover:'',fullWidth:false,date,databaseId:null,properties:{__text:text.join('\n\n'),__order:`${index}/1`},createdAt:timestamp,updatedAt:timestamp,deletedAt:null}});
  blockCount += count;
}
page('note', 0, 5000);
for (let index = 1; index < 2000; index++) page('note', index, 7 + (index <= 642 ? 1 : 0));
for (let index = 0; index < 365; index++) {
  const date = new Date(Date.now() - index * 86400000).toISOString().slice(0,10);
  page('journal', index, 1, date);
}
const calendarId = randomUUID();
archive.entities.push({table:'calendars',entity:{id:calendarId,userId:'local',title:'Synthetic calendar',color:'#2268bf',visible:true,source:'local',createdAt:timestamp,updatedAt:timestamp,deletedAt:null}});
for (let index = 0; index < 5000; index++) {
  const start = new Date(Date.now() + Math.floor(index / 5) * 86400000);
  start.setUTCHours(9 + index % 5, 0, 0, 0);
  const end = new Date(start.getTime() + 1800000);
  archive.entities.push({table:'events',entity:{id:randomUUID(),userId:'local',calendarId,title:`Event ${index} ខ្មែរ 中文`,start:start.toISOString(),end:end.toISOString(),allDay:false,startZone:'UTC',endZone:'UTC',location:'',notes:'Synthetic benchmark only',url:'',busy:true,reminderMinutes:0,recurrence:'',exceptions:[],pageId:null,source:'local',createdAt:timestamp,updatedAt:timestamp,deletedAt:null}});
}
if (blockCount !== 20000) throw new Error(`Expected 20000 blocks; received ${blockCount}`);
// Make the last pages a nested branch so windowing is tested beyond flat lists.
const nested = archive.entities.filter(row => row.table === 'pages' && row.entity.type === 'note').slice(-3);
const lastNote = archive.entities.filter(row => row.table === 'pages' && row.entity.type === 'note').sort((a,b) => a.entity.title.localeCompare(b.entity.title)).at(-1);
nested[1].entity.parentId = nested[0].entity.id;
nested[2].entity.parentId = nested[1].entity.id;
const fixtureDirectory = await mkdtemp(join(tmpdir(), 'kimpor-workspace-benchmark-'));
const fixture = join(fixtureDirectory, 'workspace.json');
await writeFile(fixture, JSON.stringify(archive));
const searchItems = Array.from({length:10000}, (_,index) => ({id:String(index),type:'note',title:`Idea ${index} ខ្មែរ 中文`,text:`A small thought for a quiet day ${index}. កំណត់ហេតុ 中文 English.`,date:'2026-10-11'}));
const workerFile = (await readdir(`${root}/apps/web/dist/assets`)).find(name => /^search\.worker-.*\.js$/.test(name));
if (!workerFile) throw new Error('Production search worker missing.');
const report = { date:timestamp, mode:'Local production browser benchmark; no physical-device or cloud result inferred.', fixture:{pages:2000,journals:365,total_page_entities:2365,events:5000,blocks:blockCount,long_page_blocks:5000,search_items:10000}, results:[] };
const reportPath = process.env.BENCH_REPORT ?? `${root}/docs/evidence/seeded-performance.json`;
const profiles = process.env.BENCH_PROFILES?.split(',') ?? ['chromium', 'phone-webkit'];
if (profiles.some(profile => !['chromium', 'phone-webkit'].includes(profile))) throw new Error('BENCH_PROFILES supports chromium and phone-webkit.');
const percentile = (values, fraction) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*fraction)-1)];
await mkdir(`${root}/docs/evidence`, {recursive:true});
try {
  for (const profile of profiles) {
    console.log(`Benchmark ${profile}: importing full synthetic workspace.`);
    const browser = await (profile === 'chromium' ? chromium : webkit).launch();
    const context = await browser.newContext(profile === 'chromium' ? {viewport:{width:1536,height:864}} : {viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    const result = {profile,browser_version:browser.version(),errors};
    report.results.push(result);
    try {
      await page.goto(baseURL,{waitUntil:'networkidle'});
      if (!await page.getByRole('button',{name:'Settings',exact:true}).first().isVisible()) await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
      await page.getByRole('button',{name:'Settings',exact:true}).first().click();
      await page.getByText('More',{exact:true}).click();
      const started = performance.now();
      await page.getByLabel('Import workspace JSON',{exact:true}).setInputFiles(fixture);
      // Windows WebKit writes this fixture in minutes; the measured performance limits below stay unchanged.
      await expect(page.getByText('Workspace imported',{exact:true})).toBeVisible({timeout:600000});
      result.import_ms = performance.now() - started;
      await page.keyboard.press('Escape');
      if (await page.getByRole('button',{name:'Close sidebar',exact:true}).first().isVisible()) await page.getByRole('button',{name:'Close sidebar',exact:true}).first().click();
      await page.evaluate(async()=> { await navigator.serviceWorker.ready; });
      const reload = performance.now();
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.ws-today').waitFor();
      result.warm_start_ms = performance.now() - reload;
      if (profile === 'phone-webkit') await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
      const tree = page.getByRole('tree');
      await expect.poll(() => tree.getByRole('treeitem').count()).toBeGreaterThan(0);
      result.rendered_tree_rows = await tree.getByRole('treeitem').count();
      expect(result.rendered_tree_rows).toBeLessThan(100);
      await page.locator('.ws-sidebar').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await tree.getByRole('button',{name:`Expand ${nested[0].entity.title}`,exact:true}).click();
      await tree.getByRole('button',{name:`Expand ${nested[1].entity.title}`,exact:true}).click();
      const nestedLeaf = tree.getByRole('treeitem').filter({hasText:nested[2].entity.title});
      await expect(nestedLeaf).toHaveAttribute('aria-level','3');
      result.scrolled_nested_tree = true;
      await page.locator('.ws-sidebar').evaluate(element => { element.scrollTop = 0; });
      if (profile === 'phone-webkit') await page.getByRole('button',{name:'Close sidebar',exact:true}).first().click();
      await page.getByRole('navigation',{name:profile==='chromium'?'Main navigation':'Bottom navigation',exact:true}).getByRole('button',{name:'Notes',exact:true}).click();
      await page.getByRole('combobox',{name:'Sort Notes',exact:true}).selectOption('title');
      await expect.poll(()=>page.locator('.ws-page-list .ws-page-row').count()).toBeGreaterThan(0);
      result.rendered_note_rows = await page.locator('.ws-page-list .ws-page-row').count();
      expect(result.rendered_note_rows).toBeLessThan(100);
      const rowHeight = () => page.locator('.ws-page-list .ws-page-row').first().evaluate(element => element.getBoundingClientRect().height);
      const initialRowHeight = await rowHeight();
      if (profile === 'phone-webkit') await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
      await page.getByRole('button',{name:'Settings',exact:true}).first().click();
      const slider = page.getByRole('slider',{name:'Text size',exact:true});
      const initialSize = Number(await slider.inputValue());
      await slider.focus();
      await slider.press('End');
      await expect(slider).toHaveValue('24');
      await expect.poll(rowHeight).toBeGreaterThan(initialRowHeight);
      await expect.poll(() => page.locator('.ws-page-list .ws-page-row').evaluateAll(rows => {
        const first=rows[0].getBoundingClientRect(), second=rows[1].getBoundingClientRect();
        return Math.abs(second.top-first.bottom);
      })).toBeLessThanOrEqual(1);
      result.resized_text_without_row_overlap = true;
      await slider.press('Home');
      for (let value=15; value<initialSize; value++) await slider.press('ArrowRight');
      await expect(slider).toHaveValue(String(initialSize));
      await page.keyboard.press('Escape');
      if (profile === 'phone-webkit') await page.getByRole('button',{name:'Close sidebar',exact:true}).first().click();
      await page.locator('.ws-main').evaluate(element => element.scrollTo({top:element.scrollHeight,behavior:'instant'}));
      await expect(page.locator('.ws-page-list').getByRole('button',{name:new RegExp(lastNote.entity.title)})).toBeVisible();
      result.scrolled_last_note = true;
      await page.locator('.ws-page-list').getByRole('button',{name:new RegExp(lastNote.entity.title)}).click();
      await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(lastNote.entity.title);
      await expect(page.getByRole('textbox',{name:'Page title',exact:true})).toBeInViewport();
      result.opened_scrolled_note_at_top = true;
      await page.getByRole('navigation',{name:profile==='chromium'?'Main navigation':'Bottom navigation',exact:true}).getByRole('button',{name:'Notes',exact:true}).click();
      await page.getByRole('searchbox',{name:'Search Notes',exact:true}).waitFor();
      await page.getByRole('searchbox',{name:'Search Notes',exact:true}).fill('Long multilingual page');
      const opened = performance.now();
      await page.locator('main').getByRole('button',{name:/Long multilingual page/}).click();
      const editor = page.getByRole('textbox',{name:'Document editor',exact:true});
      await editor.waitFor();
      await expect(editor.locator('p')).toHaveCount(5000);
      result.open_long_page_ms = performance.now() - opened;
      await editor.locator('p').first().click();
      await page.keyboard.press('Home');
      await page.evaluate(()=>{
        const editor=document.querySelector('[aria-label="Document editor"]');
        window.__typingSamples=[];
        editor.addEventListener('keydown',event=>{
          if (event.key.length!==1) return;
          const started=performance.now();
          requestAnimationFrame(()=>window.__typingSamples.push(performance.now()-started));
        },true);
      });
      const profiler = profile==='chromium' && process.env.BENCH_CPU_REPORT ? await context.newCDPSession(page) : null;
      if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
      for (const character of 'abcdefghijklmnopqrst') { await page.keyboard.type(character); await page.waitForTimeout(150); }
      const typing = await page.evaluate(()=>window.__typingSamples);
      if(profiler){const {profile:cpu}=await profiler.send('Profiler.stop');await writeFile(process.env.BENCH_CPU_REPORT,JSON.stringify(cpu));await profiler.detach();}
      if(typing.length!==20)throw new Error(`Expected 20 typing samples; received ${typing.length}`);
      result.typing_keydown_to_next_frame_ms = {samples:typing,median:percentile(typing,.5),p95:percentile(typing,.95),max:Math.max(...typing)};
      await page.getByRole('button',{name:'Page options',exact:true}).click();
      await page.getByRole('button',{name:'Formatting',exact:true}).click();
      await page.getByRole('button',{name:'Reorder blocks',exact:true}).click();
      await expect.poll(()=>page.locator('.rich-block-handle').count()).toBeGreaterThan(0);
      result.visible_drag_handles = await page.locator('.rich-block-handle').count();
      expect(result.visible_drag_handles).toBeLessThan(100);
      const lastText=await editor.locator('p').last().textContent();
      const previousText=await editor.locator('p').nth(4998).textContent();
      await editor.locator('p').last().scrollIntoViewIfNeeded();
      const handle=page.getByRole('button',{name:/^Move block 4999:/});
      await expect(handle).toBeVisible({timeout:15000});
      await expect(handle).toBeInViewport();
      result.drag_scroll_geometry=await page.evaluate(()=>({scrollY:document.querySelector('.ws-main').scrollTop,viewportHeight:innerHeight,viewportTop:window.visualViewport?.offsetTop,first:document.querySelector('[aria-label="Document editor"] p')?.getBoundingClientRect().top,last:[...document.querySelectorAll('[aria-label="Document editor"] p')].at(-1)?.getBoundingClientRect().top,handles:[...document.querySelectorAll('.rich-block-handle button')].map(button=>button.getAttribute('aria-label'))}));
      await handle.focus();
      await page.keyboard.press('Space');
      await expect(handle).toHaveAttribute('aria-pressed','true');
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[id^="DndLiveRegion"]')).toContainText('block-4999');
      await page.keyboard.press('Space');
      await expect(editor.locator('p').last()).toHaveText(previousText);
      await expect(editor.locator('p').nth(4998)).toHaveText(lastText);
      result.offscreen_handles_and_keyboard_reorder=true;
      if (profile === 'phone-webkit') await page.locator('.ws-detail-back').click();
      await page.getByRole('navigation',{name:profile==='chromium'?'Main navigation':'Bottom navigation',exact:true}).getByRole('button',{name:'Today',exact:true}).click();
      await page.locator('.ws-today').waitFor();
      const search = await page.evaluate(async({workerURL,items})=>{
        const worker=new Worker(workerURL,{type:'module'});
        const queries=['quiet','中文','កំណត់ហេតុ','Idea 9843','missingmatch'];
        const samples=[];
        worker.postMessage({kind:'index',items});
        try {
          for(let requestId=0;requestId<queries.length*4+1;requestId++) {
            const started=performance.now();
            const response=new Promise((resolve,reject)=>{
              const timer=setTimeout(()=>reject(new Error('Search timed out')),10000);
              worker.onmessage=event=>{clearTimeout(timer);resolve(event.data)};
              worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message))};
            });
            worker.postMessage({kind:'search',requestId,query:queries[requestId%queries.length]});
            const answer=await response;
            if(answer.requestId!==requestId)throw new Error('Incorrect worker response.');
            samples.push({query:queries[requestId%queries.length],ms:performance.now()-started,results:answer.ids.length});
          }
          return samples;
        } finally { worker.terminate(); }
      },{workerURL:`${baseURL}/assets/${workerFile}`,items:searchItems});
      result.search_worker_initial_ms=search.shift().ms;
      result.search_worker_round_trip_ms={samples:search,median:percentile(search.map(value=>value.ms),.5),p95:percentile(search.map(value=>value.ms),.95),max:Math.max(...search.map(value=>value.ms))};
      result.budgets={warm_start_1500ms:result.warm_start_ms<=1500,typing_max_16ms:result.typing_keydown_to_next_frame_ms.max<=16,search_max_50ms:result.search_worker_round_trip_ms.max<=50};
      console.log(JSON.stringify(result));
    } catch(error) { result.failure=String(error); console.error(error); }
    finally { await context.close(); await browser.close(); await writeFile(reportPath,JSON.stringify(report,null,2)+'\n'); }
  }
} finally { await rm(fixtureDirectory,{recursive:true,force:true}); }
report.status = report.results.some(result=>result.failure||result.errors.length||Object.values(result.budgets??{}).includes(false)) ? 'budget failures' : 'passed';
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(`Seeded benchmark: ${report.status}`);
process.exitCode=report.status==='passed'?0:1;
