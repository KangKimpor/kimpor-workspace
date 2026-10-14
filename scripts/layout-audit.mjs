import { chromium, webkit, firefox, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { matrix } from './viewport-profiles.mjs';

const url = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const report = [], browsers = {};
await mkdir('docs/screenshots/lime-layout', { recursive: true });
try {
  for (const [name, width, height, dpr, engine] of matrix) {
    browsers[engine] ??= await ({ chromium, webkit, firefox })[engine].launch();
    for (const theme of ['light', 'dark']) {
      const context = await browsers[engine].newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: engine === 'webkit', isMobile: engine === 'webkit', colorScheme: theme, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'Asia/Bangkok', serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.setFixedTime(new Date('2026-10-14T09:00:00+07:00'));
      await page.addInitScript(value => localStorage.setItem('velora-theme', value), theme);
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
      const nav = page.getByRole('navigation', { name: width < 600 ? 'Bottom navigation' : 'Main navigation', exact: true });
      const navigate = async module => {
        if (width < 600 && await page.locator('.ws-app[data-editing="true"]').count()) await page.locator('.ws-detail-back').click();
        await nav.getByRole('button', { name: module, exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveCount(0);
        await page.locator('.ws-main').evaluate(main => { main.scrollTop = 0; });
      };
      // Synthetic fixtures exercise populated rows without accessing a live account.
      await page.keyboard.press('Control+n');
      const task = page.getByRole('dialog', { name: 'New task', exact: true });
      await task.getByRole('textbox', { name: 'Task name' }).fill('Review the next small step');
      await task.getByRole('button', { name: 'Add task', exact: true }).click();
      await expect(page.locator('.ws-task-title strong')).toHaveText('Review the next small step');
      await expect(task).toHaveCount(0);
      await navigate('Calendar');
      await page.getByRole('button', { name: 'New event', exact: true }).filter({ visible: true }).first().click();
      await page.getByLabel('Title', { exact: true }).fill('A little time to plan');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const audit = async screen => {
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await page.evaluate(() => {
          const root = document.querySelector('#root'), main = document.querySelector('.ws-main');
          const visible = element => { const r = element.getBoundingClientRect(), s = getComputedStyle(element); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !element.closest('[inert],[aria-hidden="true"]'); };
          const controls = [...document.querySelectorAll('button,input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,summary')].filter(visible);
          const small = controls.filter(element => { const r = element.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(element => ({ label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
          const bounds = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } : null; };
          return { documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, rootOverflow: root.scrollWidth > root.clientWidth + 1, mainOverflow: main.scrollWidth > main.clientWidth + 1, small, month: bounds('.cal-month'), toolbarTitle: bounds('.cal-toolbar h2'), toolbarActions: bounds('.cal-toolbar > .cal-actions'), schedule: bounds('.ws-schedule'), agendaText: bounds('.ws-agenda-row > span:not(.ws-event-dot)'), agenda: bounds('.ws-agenda-row'), projectListVisible: !!document.querySelector('.project-detail .ws-list-pane') && visible(document.querySelector('.project-detail .ws-list-pane')), tableScroll: !!document.querySelector('.ws-db-table-scroll') && getComputedStyle(document.querySelector('.ws-db-table-scroll')).overflowX };
        });
        expect(metrics.documentOverflow, `${name} ${theme} ${screen}: document overflow`).toBe(false);
        expect(metrics.rootOverflow, `${name} ${theme} ${screen}: root overflow`).toBe(false);
        expect(metrics.mainOverflow, `${name} ${theme} ${screen}: pane overflow`).toBe(false);
        expect(metrics.small, `${name} ${theme} ${screen}: touch targets`).toEqual([]);
        if (screen === 'calendar-month') {
          expect(Math.abs(metrics.toolbarTitle.y + metrics.toolbarTitle.height / 2 - metrics.toolbarActions.y - metrics.toolbarActions.height / 2), `${name}: toolbar alignment`).toBeLessThanOrEqual(1);
          if (width >= 1280) expect(metrics.month.height, `${name}: month fills viewport`).toBeGreaterThanOrEqual(height - 280);
        }
        if (screen === 'today') expect(metrics.agendaText.x - metrics.agenda.x, `${name}: agenda gutter`).toBeLessThanOrEqual(24);
        if (screen === 'project-table') {
          expect(metrics.projectListVisible, `${name}: project pane`).toBe(false);
          expect(['auto', 'scroll']).toContain(metrics.tableScroll);
        }
        expect(errors, `${name} ${theme}: browser errors`).toEqual([]);
        const file = `docs/screenshots/lime-layout/${screen}-${name}-${theme}.png`;
        await page.screenshot({ path: file, animations: 'disabled' });
        report.push({ name, theme, engine, width, height, dpr, screen, file, ...metrics });
      };
      await navigate('Today');
      await expect(page.locator('.ws-agenda-row strong')).toHaveText('A little time to plan');
      await audit('today');
      await navigate('Calendar');
      for (const view of ['Month', 'Week', 'Day', 'Agenda']) {
        await page.getByRole('group', { name: 'Calendar view', exact: true }).getByRole('button', { name: view, exact: true }).click();
        await audit(`calendar-${view.toLowerCase()}`);
      }
      await navigate('Projects');
      await page.locator('.ws-list-pane').getByRole('button', { name: /Inbox/ }).click();
      await expect(page.getByRole('textbox', { name: 'Row title' })).toHaveValue('Review the next small step');
      await audit('project-table');
      await navigate('Notes'); await audit('notes');
      await page.getByRole('button', { name: 'New note', exact: true }).click();
      await page.getByRole('textbox', { name: 'Page title' }).fill('A little room for ideas');
      await page.getByRole('textbox', { name: 'Document editor' }).fill('A quiet place to think. ខ្មែរ · 中文 · English');
      await audit('note-detail');
      await navigate('Journal'); await audit('journal');
      await page.getByRole('button', { name: 'Write', exact: true }).click();
      await page.getByRole('textbox', { name: 'Document editor' }).fill('A good moment. ខ្មែរ · 中文 · English');
      await audit('journal-entry');
      await navigate('Today');
      await page.getByRole('button', { name: 'Search workspace', exact: true }).click(); await audit('search');
      await page.getByRole('button', { name: 'Close Search', exact: true }).click();
      if (width < 600) await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
      await page.getByRole('button', { name: 'Trash', exact: true }).click(); await audit('trash');
      await page.getByRole('button', { name: 'Close Trash', exact: true }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Export ZIP' }).waitFor();
      await audit('settings');
      await context.close();
      console.log(`Layout passed: ${name} ${theme}`);
    }
  }
  expect(report.length).toBe(matrix.length * 2 * 13);
  await writeFile('docs/evidence/lime-layout-audit.json', JSON.stringify({ generatedAt: new Date().toISOString(), captures: report }, null, 2) + '\n');
} finally { await Promise.all(Object.values(browsers).map(browser => browser.close())); }
