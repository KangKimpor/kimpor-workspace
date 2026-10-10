import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('theme persists, command palette supports keyboard and modal focus returns', async ({ page }) => {
  await page.goto('/design');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Search commands').fill('Editor');
  await page.getByRole('button', { name: 'Editor study', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Multilingual editor study' })).toBeVisible();
  await page.getByRole('button', { name: 'Open command palette' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open command palette' })).toBeFocused();
});

test('all visible buttons and fields respond to pointerdown within 100ms', async ({ page }) => {
  await page.goto('/design');
  for (const route of ['/design', '/spikes/editor']) {
    await page.goto(route);
    if (route.includes('editor')) await expect(page.getByRole('textbox', { name: 'Multilingual editor study' })).toBeVisible();
    const controls = page.locator('button:not(:disabled), input');
    for (const target of await controls.all()) {
      if (!(await target.isVisible())) continue;
      await target.scrollIntoViewIfNeeded();
      const result = await target.evaluate(async element => {
        const sample = () => { const css = getComputedStyle(element); return [css.opacity, css.transform, css.filter, css.borderColor, css.backgroundColor].join('|'); };
        const initial = sample();
        element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
        const start = performance.now(); let changed = false;
        while (performance.now() - start < 100) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); if (sample() !== initial) { changed = true; break; } }
        element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
        return { changed, label: element.getAttribute('aria-label') ?? element.textContent };
      });
      expect(result.changed, result.label ?? 'unlabeled control').toBe(true);
    }
  }
});

test('gallery, editor and dialog have no serious accessibility violations in both themes', async ({ page }) => {
  test.setTimeout(90_000);
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('velora-theme', value), theme);
    for (const route of ['/design', '/spikes/editor']) {
      await page.goto(route);
      if (route.includes('editor')) await expect(page.getByRole('textbox', { name: 'Multilingual editor study' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    await page.goto('/design');
    await page.getByRole('button', { name: 'Take a closer look' }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  }
});

test('multilingual text persists and composition does not open the slash menu', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/spikes/editor');
  const editor = page.getByRole('textbox', { name: 'Multilingual editor study' });
  await expect(editor).toBeVisible();
  await editor.fill('My thought ខ្មែរ 中文');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await editor.dispatchEvent('keydown', { key: '/', keyCode: 229, isComposing: true, bubbles: true });
  await expect(page.locator('.slash-menu')).toHaveCount(0);
  await editor.press('End'); await editor.press('/');
  await expect(page.locator('.slash-menu')).toBeVisible();
  await page.locator('.slash-menu').getByRole('button', { name: 'Heading', exact: true }).click();
  await expect(editor.locator('h2')).toContainText('My thought');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toContainText('My thought ខ្មែរ 中文');
  expect(errors).toEqual([]);
});

test('cached PWA shell and already visited editor survive offline reload', async ({ page, context }) => {
  await page.goto('/spikes/editor');
  const editor = page.getByRole('textbox', { name: 'Multilingual editor study' });
  await expect(editor).toBeVisible(); await editor.fill('Before going offline');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await expect(editor).toContainText('Before going offline');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload(); await expect(editor).toContainText('Before going offline');
  await editor.fill('Offline idea ខ្មែរ 中文');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.reload(); await expect(editor).toContainText('Offline idea ខ្មែរ 中文');
});

test('reduced motion, touch targets, narrow layouts and 200% text', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design');
  for (const width of [320, 393, 580, 800, 1536, 2560]) {
    await page.setViewportSize({ width, height: 864 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addStyleTag({ content: ':root { --text-caption:24px; --text-footnote:26px; --text-body:30px; --text-input:32px; --text-headline:34px; --text-title3:40px; --text-title2:44px; --text-title:56px; --text-large:68px; --text-hero:88px; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const undersized = await page.locator('button:not(:disabled)').evaluateAll(elements => elements.filter(e => { const r=e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 43 || r.height < 43); }).map(e => e.getAttribute('aria-label') ?? e.textContent));
  expect(undersized).toEqual([]);
});

test('saved dark appearance keeps heading contrast in portrait and landscape layouts', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('velora-theme', 'dark'));
  for (const viewport of [{ width: 852, height: 393 }, { width: 820, height: 1180 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/design');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Full-page capture caused WebKit to lose inherited colors during layout.
    await page.screenshot({ fullPage: true });
    const colors = await page.locator('h1,h2,h3,.brand strong').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
    expect([...new Set(colors)]).toEqual(['rgb(243, 243, 245)']);
  }
});

test('two local tabs exchange Yjs changes and keyboard handles reorder sample rows', async ({ page, context }) => {
  await page.goto('/spikes/editor');
  const editor = page.getByRole('textbox', { name: 'Multilingual editor study' });
  await expect(editor).toBeVisible();
  await editor.fill('From the first tab ខ្មែរ');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/spikes/editor');
  const other = second.getByRole('textbox', { name: 'Multilingual editor study' });
  await expect(other).toContainText('From the first tab ខ្មែរ');
  await other.fill('From the second tab 中文');
  await expect(editor).toContainText('From the second tab 中文');
  await second.close();
  const handle = page.getByRole('button', { name: 'Reorder An English thought' });
  await handle.scrollIntoViewIfNeeded(); await handle.focus(); await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^="DndLiveRegion"]')).toContainText('គំនិតជាភាសាខ្មែរ');
  await page.keyboard.press('Space');
  await expect(page.locator('.reorder-row > span').first()).toHaveText('គំនិតជាភាសាខ្មែរ');
});
