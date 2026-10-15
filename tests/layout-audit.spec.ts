import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { leaveWriting } from "./workspace-actions";

test("redesign geometry, targets, safe areas and accessibility", async ({ page }, info) => {
  test.setTimeout(120_000);
  const width = page.viewportSize()!.width;
  const records: unknown[] = [];
  await page.clock.setFixedTime(new Date("2026-10-11T09:00:00Z"));
  const theme = info.project.use.colorScheme!;
  await page.addInitScript(value => localStorage.setItem("velora-theme",value),theme);
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Today",exact:true})).toBeVisible();
  await page.addStyleTag({content: `:root { --safe-area-top:${width<600 ? 47:24}px; --safe-area-bottom:${width<600 ? 34:20}px; --safe-area-left:0px; --safe-area-right:0px; }`});
  const nav=page.getByRole("navigation",{name:width<600 ? "Bottom navigation":"Main navigation",exact:true});
  const navigate=async (name:string) => {
    await leaveWriting(page);
    await nav.getByRole("button",{name,exact:true}).click();
    await expect(page.getByRole("textbox",{name:"Page title",exact:true})).toHaveCount(0);
    await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
    if (name === "Calendar") await expect(page.locator('.calendar-module')).toBeVisible();
    await page.locator(".ws-main").evaluate(element=>{element.scrollTop=0;});
  };
  const audit=async (screen:string) => {
    await page.evaluate(()=>document.fonts.ready);
    // Pressable's JS spring and WebKit's compositor settle after the view commit.
    await page.waitForTimeout(350);
    await page.waitForFunction(()=>[...document.querySelectorAll('.pressable')].every(element=>{
      const style=getComputedStyle(element);
      if (element.matches(':disabled') || !element.getClientRects().length) return true;
      return style.opacity === '1' && style.transform === 'none' && element.getAttribute('data-pressed') !== 'true';
    }),undefined,{timeout:10_000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const metrics=await page.evaluate(()=>{
      const clipped=(element:Element) => {
        const r=element.getBoundingClientRect();let left=r.left,right=r.right,top=r.top,bottom=r.bottom;
        for(let parent=element.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent),p=parent.getBoundingClientRect();if(s.overflowX!=="visible"){left=Math.max(left,p.left);right=Math.min(right,p.right);}if(s.overflowY!=="visible"){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}}
        return {left,right,top,bottom};
      };
      const visible=(element:Element) => {
        const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
        const clip=clipped(element);
        return clip.right>clip.left && clip.bottom>clip.top && rect.width>0 && rect.height>0 && rect.top<innerHeight && rect.bottom>0 && rect.left<innerWidth && rect.right>0 && style.visibility!=="hidden" && style.display!=="none" && !element.closest('[inert],[aria-hidden="true"]');
      };
      const rect=(element:Element)=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const controls=[...document.querySelectorAll('button,a[href],input:not([type="file"]),select,textarea,summary')].filter(visible).map(element=>({element,clip:clipped(element),box:rect(element instanceof HTMLInputElement && ["checkbox","radio"].includes(element.type) && element.closest("label") ? element.closest("label")! : element)}));
      const label=(element:Element)=>element.getAttribute("aria-label") || element.textContent?.trim().slice(0,70) || element.tagName;
      const small=controls.filter(({box})=>box.width<43.5 || box.height<43.5).map(({element,box})=>({label:label(element),...box}));
      const overlaps: string[]=[];
      for (let i=0;i<controls.length;i++) for (let j=i+1;j<controls.length;j++) {
        const a=controls[i]!,b=controls[j]!;
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        if (Math.min(a.clip.right,b.clip.right)-Math.max(a.clip.left,b.clip.left)>.5 && Math.min(a.clip.bottom,b.clip.bottom)-Math.max(a.clip.top,b.clip.top)>.5) overlaps.push(JSON.stringify({a:label(a.element),aBox:a.clip,b:label(b.element),bBox:b.clip}));
      }
      const escaping=controls.filter(({element,box})=>{
        const parent=element.parentElement; if (!parent || getComputedStyle(parent).display==="contents" || getComputedStyle(parent).display==="inline") return false;
        const style=getComputedStyle(parent); if (["auto","scroll"].includes(style.overflowX) || ["auto","scroll"].includes(style.overflowY) || style.position==="relative" && element instanceof HTMLButtonElement && getComputedStyle(element).position==="absolute") return false;
        const p=rect(parent);return p.width>0 && p.height>0 && (box.left<p.left-.5 || box.right>p.right+.5 || box.top<p.top-.5 || box.bottom>p.bottom+.5);
      }).map(({element})=>label(element));
      const root=document.querySelector("#root")!;
      const main=document.querySelector(".ws-main") ?? root;
      const rows=[...document.querySelectorAll(".cal-week")].map(rect);
      const dock=document.querySelector(".ws-tabbar");
      const align= (selectors:string[]) => selectors.map(selector=>document.querySelector(selector)).filter((element):element is Element=>!!element && visible(element)).map(rect);
      const titles=[...document.querySelectorAll('.ws-task-title strong,.ws-project-card > strong,.cal-month-event > span')].filter(visible);
      const truncation=titles.filter(element=>{const style=getComputedStyle(element);return (element as HTMLElement).scrollWidth>(element as HTMLElement).clientWidth+.5 && style.textOverflow!=="ellipsis" && style.webkitLineClamp==="none";}).map(label);
      const dashboard=document.querySelector('.ws-task-today');
      const cards=[...document.querySelectorAll('.ws-task-card')].filter(visible).map(rect);
      return {overflow:document.documentElement.scrollWidth>innerWidth+.5 || root.scrollWidth>root.clientWidth+.5 || main.scrollWidth>main.clientWidth+.5,small,overlaps,escaping,truncation,rows,cards,main:rect(main),dashboard:dashboard ? rect(dashboard):null,dock:dock && visible(dock) ? rect(dock):null,month:document.querySelector(".cal-month") ? rect(document.querySelector(".cal-month")!):null,alignment:align(screenSelector()),height:innerHeight};
      function screenSelector() {return document.querySelector('.ws-task-today') ? ['.ws-schedule','.ws-today-hero','.ws-task-grid'] : document.querySelector('.ws-database') ? ['.ws-page-title-row','.ws-database-toolbar','.ws-db-table-scroll'] : ['.cal-heading','.cal-toolbar','.cal-month-layout'];}
    });
    expect(metrics.overflow,`${screen}: page overflow`).toBe(false);
    expect(metrics.small,`${screen}: targets`).toEqual([]);
    expect(metrics.overlaps,`${screen}: overlapping controls`).toEqual([]);
    expect(metrics.escaping,`${screen}: controls outside containers`).toEqual([]);
    expect(metrics.truncation,`${screen}: unintended truncation`).toEqual([]);
    if (metrics.alignment.length>1) for (const box of metrics.alignment) expect(Math.abs(box.left-metrics.alignment[0]!.left),`${screen}: aligned left edges`).toBeLessThanOrEqual(.5);
    if (metrics.rows.length>1) for (const row of metrics.rows) expect(Math.abs(row.height-metrics.rows[0]!.height),"equal month rows").toBeLessThanOrEqual(1);
    if (metrics.dashboard) expect(Math.abs((metrics.dashboard.left-metrics.main.left)-(metrics.main.right-metrics.dashboard.right)),`${screen}: centered dashboard`).toBeLessThanOrEqual(.5);
    for (const card of metrics.cards) for (const peer of metrics.cards.filter(peer=>Math.abs(peer.top-card.top)<1)) expect(Math.abs(card.height-peer.height),`${screen}: equal card heights`).toBeLessThanOrEqual(1);
    if (metrics.month && width>=1280) expect(Math.abs(metrics.month.bottom-(metrics.main.bottom-24)),`${screen}: month fills pane`).toBeLessThanOrEqual(1);
    if (metrics.dock) expect(metrics.dock.bottom).toBeLessThanOrEqual(metrics.height-34+.5);
    const accessibility=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
    expect(accessibility.violations.filter(violation=>violation.impact==="serious" || violation.impact==="critical"),`${screen}: accessibility`).toEqual([]);
    records.push({screen,...metrics});
    await page.screenshot({path:info.outputPath(`${screen}.png`),animations:"disabled"});
  };
  await audit("today-empty");
  await page.keyboard.press("Control+n");
  const capture=page.getByRole("dialog",{name:"New task",exact:true});
  await capture.getByRole("textbox",{name:"Task name"}).fill("Review the next small step");
  await capture.getByRole("button",{name:"Add task",exact:true}).click();
  await expect(page.locator(".ws-task-card")).toHaveCount(1);
  await audit("today-populated");
  await navigate("Calendar");
  for (const allDay of [false,true]) {
    await page.getByRole('button',{name:'New event',exact:true}).filter({visible:true}).first().click();
    const draft=page.getByRole('dialog',{name:'New event',exact:true});
    await draft.getByLabel('Title',{exact:true}).fill(allDay ? 'Planning across two weeks' : 'ខ្មែរ · 中文 · Plan together');
    if (allDay) {
      await draft.getByRole('checkbox',{name:'All day',exact:true}).check();
      await draft.getByLabel('Starts',{exact:true}).fill('2026-10-10');
      await draft.getByLabel('Ends (exclusive)',{exact:true}).fill('2026-10-13');
    } else {
      await draft.getByLabel('Starts',{exact:true}).fill('2026-10-11T16:00');
      await draft.getByLabel('Ends',{exact:true}).fill('2026-10-11T17:00');
    }
    await draft.getByRole('button',{name:'Done',exact:true}).click();
    await expect(draft).toHaveCount(0);
  }
  await audit("calendar-month");
  const selectedDay=page.locator('[role="gridcell"][data-day][tabindex="0"]');
  await selectedDay.focus(); await selectedDay.press('ArrowRight');
  await expect(selectedDay).toHaveAttribute('data-day','2026-10-12');
  await selectedDay.press('PageDown');
  await expect(selectedDay).toHaveAttribute('data-day','2026-11-12');
  await selectedDay.press('t');
  await expect(selectedDay).toHaveAttribute('data-day','2026-10-11');
  const viewMenu=page.getByRole('button',{name:'Calendar view',exact:true});
  await viewMenu.press('ArrowDown');
  await expect(page.getByRole('menuitem',{name:'Day',exact:true})).toBeFocused();
  await page.getByRole('menuitem',{name:'Day',exact:true}).press('End');
  await expect(page.getByRole('menuitem',{name:'Agenda',exact:true})).toBeFocused();
  await page.getByRole('menuitem',{name:'Agenda',exact:true}).press('Escape');
  await expect(viewMenu).toBeFocused();
  for (const name of ["Week","Day","Agenda"]) {
    await page.getByRole("button",{name:"Calendar view",exact:true}).click();
    await page.getByRole("menuitem",{name,exact:true}).click(); await audit(`calendar-${name.toLowerCase()}`);
  }
  await navigate("Projects");
  await audit("projects-overview");
  await page.locator('.ws-project-overview').getByRole("button",{name:/Inbox/}).click();
  await expect(page.getByRole("textbox",{name:"Row title",exact:true})).toBeVisible();
  await audit("project-table");
  await page.getByRole('tab',{name:'By status',exact:true}).click(); await audit('project-board');
  await navigate("Notes");await audit("notes");
  await page.getByRole("button",{name:"New note",exact:true}).click();
  await page.getByRole("textbox",{name:"Page title"}).fill("A little room for ideas");
  await page.getByRole("textbox",{name:"Document editor"}).fill("ខ្មែរ · 中文 · English");
  await expect(page.locator('.ws-detail-pane').getByText(/on this device|saved locally|saved on/i)).toHaveCount(0); await audit("note-detail");
  await navigate("Journal");await audit("journal");
  await page.getByRole("button",{name:"Write",exact:true}).click();
  await page.getByRole("textbox",{name:"Document editor"}).fill("A good moment. ខ្មែរ · 中文");await audit("journal-entry");
  await navigate("Today");
  await page.getByRole('button',{name:'Search workspace',exact:true}).click(); await audit('search');
  await page.getByRole('button',{name:'Close Search',exact:true}).click();
  if (width<600) await page.getByRole("button",{name:"Open sidebar",exact:true}).click();
  await page.getByRole("button",{name:"Trash",exact:true}).click();await audit("trash");
  await page.getByRole("button",{name:"Close Trash",exact:true}).click();
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("button",{name:"Export ZIP"}).waitFor();await audit("settings");
  await page.getByRole('button',{name:'Close Settings',exact:true}).click();
  await page.route('https://auth.example.test/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
  await page.goto(process.env.AUTH_BASE_URL ?? 'http://127.0.0.1:4174');
  await expect(page.getByRole('main',{name:'Sign in',exact:true})).toBeVisible();
  await audit('sign-in');
  await page.getByRole('textbox',{name:'Email',exact:true}).fill('fixture@example.test');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Email code',exact:true})).toBeVisible();
  await audit('email-code');
  expect(records).toHaveLength(18);
  await info.attach("layout-metrics",{body:JSON.stringify({profile:info.project.name,records}),contentType:"application/json"});
});
