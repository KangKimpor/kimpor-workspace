import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Connects only to the installed CI app's loopback WebView2 debugger. No browser
// is launched, and no test hook or debug endpoint ships in the product.
const endpoint = process.env.KIMPOR_CDP_URL ?? 'http://127.0.0.1:9222';
let browser;
let lastConnectionError;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 }); break; }
    catch (error) { lastConnectionError = error.message; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  if (!browser) throw new Error('Installed WebView2 inspector connection failed: ' + lastConnectionError?.slice(0,700));
  let page;
  for (let attempt = 0; attempt < 30; attempt++) {
    page = browser.contexts().flatMap(context => context.pages()).find(item => /tauri\.localhost/.test(item.url()));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!page) throw new Error('Installed workspace WebView was not found');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(nav.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 30000 });
  await expect(page.getByText("Agenda", { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Page title' }).fill('Windows verification note');
  const editor = page.getByRole('textbox', { name: 'Document editor' });
  await expect(editor).toBeVisible();
  await editor.fill('Saved in the installed app · ខ្មែរ · 中文');
  await nav.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveCount(0);
  await page.reload();
  await nav.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.locator('main').getByRole('button', { name: /Windows verification note/ }).first().click();
  await expect(editor).toContainText('ខ្មែរ · 中文');
  assertNoErrors(errors);
  await mkdir('docs/evidence', { recursive: true });
  await page.screenshot({ path: 'docs/evidence/windows-ui.png' });
  await writeFile('docs/evidence/windows-ui.json', JSON.stringify({ date: new Date().toISOString(), source_commit: process.env.GITHUB_SHA ?? null, mode: 'Installed Windows CI app through loopback CDP; not physical-device or IME evidence', rendered: true, multilingual_note_reload: true, page_errors: errors }, null, 2) + '\n');
  console.log('Installed workspace rendered and multilingual note persisted through reload.');
  // Exit disconnects our inspector without sending Browser.close to WebView2;
  // the PowerShell harness still checks the app's own normal close/uninstall.
  process.exit(0);
} catch (error) { console.error(error.message); process.exit(1); }
function assertNoErrors(errors) { if (errors.length) throw new Error('Installed workspace had JavaScript errors'); }
