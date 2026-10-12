import { expect, type Page } from '@playwright/test';

export async function leaveWriting(page: Page) {
  if (page.viewportSize()!.width < 600 && await page.locator('.ws-app[data-editing="true"]').count()) {
    await page.locator('.ws-detail-back').click();
    await expect(page.locator('.ws-tabbar')).toBeVisible();
  }
}

export async function formatting(page: Page) {
  await expect(page.getByRole('textbox', { name: 'Document editor', exact: true })).toBeEditable();
  const more = page.getByRole('button', { name: 'More formatting', exact: true });
  if (!await more.isVisible()) {
    await page.getByRole('button', { name: 'Page options', exact: true }).click();
    await page.getByRole('dialog', { name: 'Page options', exact: true }).getByRole('button', { name: 'Formatting', exact: true }).click();
  } else await more.click();
  await expect(page.getByRole('group', { name: 'Formatting options', exact: true })).toBeVisible();
}
