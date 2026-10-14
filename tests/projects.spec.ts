import { leaveWriting } from './workspace-actions';
import { test, expect, type Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  await leaveWriting(page);
  const nav = page.getByRole("navigation", { name: page.viewportSize()!.width < 600 ? "Bottom navigation" : "Main navigation", exact: true });
  await nav.getByRole("button", { name, exact: true }).click();
}
test("project creation is one type tap with the intended default view", async ({ page }) => {
  await page.goto("/");
  for (const [label, count] of [["Weekly report", 4], ["Rework list", 0], ["App build", 0], ["Coursework", 0], ["Model tracking", 2]] as const) {
    await navigate(page, "Projects");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByRole("dialog", { name: "New project" }).getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue(label);
    await expect(page.getByRole("tab", { name: "All tasks", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".ws-db-count")).toContainText(`${count} items`);
    await expect(page.getByRole("button", { name: "New task", exact: true }).filter({ visible: true })).toBeVisible();
  }
});
test("quick add focuses the task name and completion moves the task to Done", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.keyboard.press("Control+n");
  const sheet = page.getByRole("dialog", { name: "New task", exact: true });
  const name = sheet.getByRole("textbox", { name: "Task name" });
  await expect(name).toBeFocused();
  await expect(sheet.getByLabel("Date", { exact: true })).toBeHidden();
  await name.fill("Plan the next step");
  await sheet.getByRole("button", { name: "Add task" }).click();
  const row = page.locator(".ws-task-row").filter({ hasText: "Plan the next step" });
  await expect(row.locator("strong")).toHaveText("Plan the next step");
  const sizes = await row.evaluate(element => ({ name: parseFloat(getComputedStyle(element.querySelector("strong")!).fontSize), meta: parseFloat(getComputedStyle(element.querySelector("small")!).fontSize) }));
  expect(sizes.name).toBeGreaterThan(sizes.meta);
  await row.getByRole("checkbox", { name: "Complete Plan the next step" }).click();
  await expect(page.locator(".ws-done-tasks summary")).toBeVisible();
  await page.locator(".ws-done-tasks summary").click();
  await expect(page.locator(".ws-done-tasks strong")).toHaveText("Plan the next step");
  await navigate(page, "Projects");
  await expect(page.getByRole("button", { name: /Inbox/ }).filter({ visible: true }).first()).toBeVisible();
});
