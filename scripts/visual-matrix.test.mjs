import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrix } from './viewport-profiles.mjs';
import { shardProfiles, screenNames, validateCaptures, validateLayouts } from './visual-matrix.mjs';
const captures = matrix.flatMap(([name,width,height,dpr,engine]) => ['light','dark'].flatMap(theme => screenNames.map(screen => ({screen,name,theme,width,height,dpr,engine,file:`docs/screenshots/${screen}-${name}-${theme}.png`,overflow:false}))));
const layouts = matrix.flatMap(([name]) => ['light','dark'].map(theme => ({profile:`layout-${name}-${theme}`,screens:Array.from({length:18},(_,screen)=>({screen:String(screen)}))})));
test('shards partition every profile without duplicates and retain all 510 captures and 612 audits', () => {
  for (const total of [2,3,4]) {
    const profiles = Array.from({length:total},(_,index)=>shardProfiles(`${index+1}/${total}`)).flat();
    assert.equal(profiles.length,17); assert.equal(new Set(profiles.map(row=>row[0])).size,17);
  }
  assert.equal(captures.length,510); validateCaptures(captures); validateLayouts(layouts);
  for (const shard of ['0/3','4/3','1/0','1/18','invalid']) assert.throws(()=>shardProfiles(shard));
});
test('visual gates reject missing, duplicate, wrong-sized, overflowed and unexpected evidence', () => {
  for (const rows of [captures.slice(1), [...captures,captures[0]], [{...captures[0],width:1},...captures.slice(1)], [{...captures[0],overflow:true},...captures.slice(1)], [{...captures[0],file:'other.png'},...captures.slice(1)]]) assert.throws(()=>validateCaptures(rows));
  for (const rows of [layouts.slice(1), [...layouts,layouts[0]], [{...layouts[0],screens:[]},...layouts.slice(1)], [{...layouts[0],screens:Array(18).fill({screen:'same'})},...layouts.slice(1)]]) assert.throws(()=>validateLayouts(rows));
});

test('aggregators require complete exact-SHA shards and fail closed on missing, duplicate, failed and stale receipts', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(),'kimpor-matrix-'));
  const env = {...process.env,VISUAL_SHARD:'',VISUAL_SHARDS:'3',GITHUB_SHA:'fixture-sha'};
  const run = script => spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url)),'--merge'],{cwd:directory,env,encoding:'utf8'});
  try {
    await mkdir(join(directory,'docs/evidence'),{recursive:true});
    await mkdir(join(directory,'docs/screenshots'),{recursive:true});
    const parts = Array.from({length:3},(_,index)=>({commit:'fixture-sha',shard:`${index+1}/3`,passed:true,receipts:layouts.filter(row=>shardProfiles(`${index+1}/3`).some(([name])=>['light','dark'].some(theme => row.profile === `layout-${name}-${theme}`)))}));
    const save = async () => { for (let index=0;index<3;index++) await writeFile(join(directory,`docs/evidence/layout-shard-${index+1}.json`),JSON.stringify(parts[index])); };
    await save();
    const complete = run('./layout-audit.mjs'); assert.equal(complete.status,0,complete.stderr); assert.match(complete.stdout,/612 screens/);
    const first = structuredClone(parts[0]);
    for (const patch of [{commit:'stale-sha'},{passed:false},{receipts:[]},{receipts:[...first.receipts,first.receipts[0]]}]) {
      parts[0]={...first,...patch}; await save(); assert.notEqual(run('./layout-audit.mjs').status,0);
    }
    await rm(join(directory,'docs/evidence/layout-shard-3.json')); assert.notEqual(run('./layout-audit.mjs').status,0);
    await writeFile(join(directory,'docs/screenshots/shard-1.json'),JSON.stringify({commit:'stale-sha',shard:'1/3',captures:[]}));
    assert.match(run('./shots.mjs').stderr,/Stale or incorrect screenshot shard/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
