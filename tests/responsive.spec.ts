import { test, expect } from '@playwright/test';

test('layout uses its container width inside a wider desktop window', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1180 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  for (const [width, sidebar] of [[393, 0], [820, 72], [1180, 240]] as const) {
    await page.locator('#root').evaluate((root, value) => { (root as HTMLElement).style.width = `${value}px`; }, width);
    if (!sidebar) {
      await expect(page.getByRole('navigation', { name: 'Bottom navigation', exact: true })).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Sidebar', exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
      await expect.poll(async () => (await page.locator('.ws-sidebar').boundingBox())!.width).toBe(sidebar);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    }
    await expect.poll(() => page.locator('.ws-main').evaluate(main => main.scrollWidth <= main.clientWidth + 1)).toBe(true);
  }
});

test('phone and tablet toolbar follows the keyboard viewport and keeps the caret visible', async ({ page }) => {
  test.setTimeout(60_000);
  for (const [width, height, keyboardTop] of [[393, 852, 480], [820, 1180, 730]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: width < 600 ? 'Bottom navigation' : 'Main navigation', exact: true });
    await nav.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByRole('textbox', { name: 'Page title' }).fill('Keyboard fixture');
    const editor = page.getByRole('textbox', { name: 'Document editor', exact: true });
    await editor.fill(Array.from({ length: 40 }, (_, index) => `Thought ${index + 1}.`).join('\n\n'));
    await page.evaluate(top => {
      Object.defineProperties(window.visualViewport!, { height: { configurable: true, value: top }, offsetTop: { configurable: true, value: 0 } });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    }, keyboardTop);
    await editor.press('Control+End');
    const toolbar = page.getByRole('toolbar', { name: 'Document formatting', exact: true });
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('button:visible')).toHaveCount(5);
    await expect.poll(async () => { const r = (await page.locator('.rich-writing-tools').boundingBox())!; return Math.round(r.y + r.height); }).toBe(keyboardTop);
    await expect.poll(() => page.evaluate(() => {
      const selection = getSelection();
      if (!selection?.rangeCount) return false;
      const range = selection.getRangeAt(0).cloneRange();
      const rect = range.getBoundingClientRect();
      const tools = document.querySelector('.rich-writing-tools')!.getBoundingClientRect();
      return rect.bottom <= tools.top + 1 && rect.top >= 56;
    })).toBe(true);
    await expect(page.locator('.ws-page-details')).toBeHidden();
    if (width < 600) await expect(page.locator('.ws-tabbar')).toBeHidden();
    await expect.poll(async () => (await page.locator('.ws-main').boundingBox())!.height).toBe(height);
    await page.locator('.ws-detail-back').click();
    await page.locator('.ws-page-list').getByRole('button', { name: /Keyboard fixture/ }).first().click();
    await expect(editor).toContainText('Thought 40.');
    await page.evaluate(() => { delete (window.visualViewport as unknown as { height?: number }).height; delete (window.visualViewport as unknown as { offsetTop?: number }).offsetTop; window.visualViewport!.dispatchEvent(new Event('resize')); });
  }
});
