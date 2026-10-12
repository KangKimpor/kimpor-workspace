import { leaveWriting } from './workspace-actions';
import { test, expect, type Page } from "@playwright/test";
test.setTimeout(90_000);
test.use({ actionTimeout: 20_000 });

async function navigate(page: Page, module: string) {
  await leaveWriting(page);
  const navigation = page.getByRole("navigation", {
    name: page.viewportSize()!.width < 600 ? "Bottom navigation" : "Main navigation",
    exact: true,
  });
  await navigation.getByRole("button", { name: module, exact: true }).click();
}

test("tablet writing stays uncluttered and formatting remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await navigate(page, "Notes");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).fill("A quiet canvas");
  const editor = page.getByRole("textbox", { name: "Document editor", exact: true });
  await editor.fill("A thought worth keeping · ខ្មែរ · 中文");
  const toolbar = page.getByRole("toolbar", { name: "Document formatting", exact: true });
  const panel = page.getByRole("group", { name: "Formatting options", exact: true });
  await expect(toolbar.locator("button:visible")).toHaveCount(5);
  await expect(page.locator(".ws-list-pane")).toBeHidden();
  await expect(page.locator(".rich-block-gutter")).toBeHidden();
  await expect(page.locator(".ws-page-detail .ws-page-emoji")).toBeHidden();
  await toolbar.getByRole("button", { name: "More formatting", exact: true }).click();
  await panel.getByRole("button", { name: "Heading 2", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(editor.locator("h2")).toContainText("A thought worth keeping");
  await toolbar.getByRole("button", { name: "More formatting", exact: true }).click();
  await panel.getByRole("button", { name: "Bold text", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toolbar.getByRole("button", { name: "More formatting", exact: true })).toBeFocused();
  await toolbar.getByRole("button", { name: "More formatting", exact: true }).click();
  await editor.focus();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Back to Notes", exact: true }).click();
  await page.locator("main").getByRole("button", { name: /A quiet canvas/ }).first().click();
  await expect(editor.locator("h2")).toContainText("ខ្មែរ · 中文");
});

test("journal resumes today's entry and shows its saved words in the library", async ({ page }) => {
  await page.goto("/");
  await navigate(page, "Journal");
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).fill("A small moment");
  const editor = page.getByRole("textbox", { name: "Document editor", exact: true });
  await editor.fill("Grateful for a little quiet.");
  await page.getByRole("button", { name: "Page options", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Page options", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await navigate(page, "Journal");
  await expect(page.locator(".ws-journal-entry")).toHaveCount(1);
  await expect(page.locator(".ws-journal-preview")).toContainText("Grateful for a little quiet.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(editor).toContainText("Grateful for a little quiet.");
  await navigate(page, "Journal");
  await expect(page.locator(".ws-journal-entry")).toHaveCount(1);
  await expect(page.locator(".ws-journal-week")).toBeHidden();
  const history = page.locator(".ws-journal-history > summary");
  await history.click();
  await expect(page.locator(".ws-journal-week")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await history.click();
  await expect(page.locator(".ws-journal-week")).toBeHidden();
  await page.getByRole("searchbox", { name: "Search journal", exact: true }).fill("quiet");
  await expect(page.locator(".ws-journal-entry")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search journal", exact: true }).fill("unmatched phrase");
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeVisible();
});

test("month selection shows that day's events without leaving the month", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-12T09:00:00Z"));
  await page.goto("/");
  await navigate(page, "Calendar");
  const heading = page.getByRole("heading", { name: "Calendar", exact: true });
  expect(await heading.evaluate(element => element.getBoundingClientRect().height <= parseFloat(getComputedStyle(element).lineHeight) + 1)).toBe(true);
  await page.getByRole("button", { name: "New event", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New event", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill("A little time to plan");
  await expect(dialog.getByLabel("Custom recurrence RRULE")).toBeHidden();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const selected = page.getByRole("region", { name: "Selected day events", exact: true });
  await expect(selected.getByRole("button", { name: /A little time to plan/ })).toBeVisible();
  await page.getByRole("button", { name: "Open Tuesday, October 13, 2026", exact: true }).click();
  await expect(selected.getByRole("heading", { name: "October 13", exact: true })).toBeVisible();
  await expect(selected.getByRole("button", { name: "New event", exact: true })).toBeVisible();
  await expect(page.locator(".cal-month-grid")).toBeVisible();
  await expect(page.locator(".cal-day-add")).toHaveCount(0);
  const dateTarget = await page.locator(".cal-day-number").first().boundingBox();
  expect(dateTarget!.width).toBeGreaterThanOrEqual(44);
  expect(dateTarget!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Open Monday, October 12, 2026", exact: true }).click();
  await selected.getByRole("button", { name: /A little time to plan/ }).click();
  await expect(page.getByRole("dialog", { name: "Event details", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close event", exact: true }).click();
  await page.getByRole("button", { name: "Calendar settings and accounts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connected accounts", exact: true })).toBeVisible();
  const personal = page.getByRole("checkbox", { name: "Personal", exact: true });
  await personal.click();
  await expect(personal).not.toBeChecked();
  await page.getByRole("button", { name: "Close calendar settings", exact: true }).click();
  await expect(selected.getByRole("button", { name: /A little time to plan/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
