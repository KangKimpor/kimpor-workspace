import { test, expect } from '@playwright/test';
import { leaveWriting } from './workspace-actions';

test('five modules fit the requested light or dark viewport', async ({ page }) => {
  await page.goto('/');
  const phone = page.viewportSize()!.width < 600;
  const nav = page.getByRole('navigation', { name: phone ? 'Bottom navigation' : 'Main navigation', exact: true });
  for (const name of ['Today', 'Projects', 'Calendar', 'Notes', 'Journal']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect.poll(() => page.locator('.ws-main').evaluate(main => main.scrollWidth <= main.clientWidth + 1)).toBe(true);
    const controls = await nav.locator('button:visible').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
    expect(controls.every(rect => rect.width >= 44 && rect.height >= 44)).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Write', exact: true })).toHaveCount(1);
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  await expect(page.locator('.ws-detail-pane').getByText(/on this device|saved locally|saved on/i)).toHaveCount(0);
});

test('writing uses compact or selection controls and preserves the body', async ({ page }) => {
  await page.goto('/');
  const width = page.viewportSize()!.width;
  const nav = page.getByRole('navigation', { name: width < 600 ? 'Bottom navigation' : 'Main navigation', exact: true });
  await nav.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Page title' }).fill('Matrix note');
  const editor = page.getByRole('textbox', { name: 'Document editor', exact: true });
  await editor.fill('A clear place to write · ខ្មែរ · 中文');
  const toolbar = page.getByRole('toolbar', { name: 'Document formatting', exact: true });
  if (width < 1024) {
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('button:visible')).toHaveCount(5);
    await expect.poll(async () => { const r = (await page.locator('.rich-writing-tools').boundingBox())!; return Math.round(r.y + r.height); }).toBe(page.viewportSize()!.height);
  } else {
    await expect(toolbar).toBeHidden();
    await editor.press('Shift+ArrowLeft');
    await expect(toolbar).toBeVisible();
  }
  await expect(page.locator('.ws-page-details')).toBeHidden();
  await expect(editor).toContainText('ខ្មែរ · 中文');
  await leaveWriting(page);
  await nav.getByRole('button', { name: 'Today', exact: true }).click();
  // Navigation waits for the durable save; a click alone can reload mid-transaction.
  await expect(nav.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveCount(0);
  await page.reload();
  await nav.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.locator('.ws-page-list').getByRole('button', { name: /Matrix note/ }).first().click();
  await expect(editor).toHaveText('A clear place to write · ខ្មែរ · 中文');
});

test('task names lead Today, project rows and search', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T09:00:00Z'));
  await page.goto('/');
  const width = page.viewportSize()!.width;
  const nav = page.getByRole('navigation', { name: width < 600 ? 'Bottom navigation' : 'Main navigation', exact: true });
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  const task = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(task.getByRole('textbox', { name: 'Task name', exact: true })).toBeFocused();
  await task.getByRole('textbox', { name: 'Task name', exact: true }).fill('Prepare fixture report');
  await task.locator('summary').click();
  await task.getByLabel('Date', { exact: true }).fill('2026-10-11');
  await task.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.locator('.ws-task-title').first().locator('strong')).toHaveText('Prepare fixture report');
  await nav.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('.ws-project-overview').getByRole('button', { name: /Inbox/ }).click();
  await page.getByRole('tab', { name: 'All tasks', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Row title', exact: true })).toHaveValue('Prepare fixture report');
  await page.locator('.ws-detail-back').click();
  await page.getByRole('button', { name: 'Search workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search query', exact: true }).fill('Prepare fixture');
  await expect(page.getByRole('dialog', { name: 'Search', exact: true }).getByRole('button', { name: /Prepare fixture report/ })).toBeVisible();
});
