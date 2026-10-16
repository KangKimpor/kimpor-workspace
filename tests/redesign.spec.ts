import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { unzipSync, strFromU8 } = createRequire(new URL("../packages/core/package.json", import.meta.url))("fflate");
import { leaveWriting } from "./workspace-actions";

test("Trash supports cancel, restore, delete forever and emptying after reload", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: page.viewportSize()!.width < 600 ? "Bottom navigation" : "Main navigation", exact: true });
  const create = async (title: string) => {
    if (await page.locator(".ws-sidebar.open").count()) await page.getByRole("button", { name: "Close sidebar", exact: true }).first().click();
    await leaveWriting(page);
    const notes = nav.getByRole("button", { name: "Notes", exact: true });
    if (await notes.getAttribute("aria-current") !== "page") await notes.click();
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByRole("textbox", { name: "Page title" }).fill(title);
    await page.getByRole("textbox", { name: "Document editor" }).fill(`Body for ${title}`);
    await page.getByRole("button", { name: "Page options", exact: true }).click();
    await expect(page.getByText("Save as template", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await expect(page.getByRole("region", { name: "Page detail", exact: true })).toHaveCount(0);
  };
  const trash = async () => {
    if (page.viewportSize()!.width < 600 && !await page.getByRole("button", { name: "Trash", exact: true }).isVisible()) await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Templates", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    return page.getByRole("dialog", { name: "Trash", exact: true });
  };
  await create("Purge proof");
  let sheet = await trash();
  await sheet.getByRole("button", { name: "Delete forever", exact: true }).click();
  await expect(page.getByRole("alertdialog").getByRole("button", { name:"Cancel", exact:true })).toBeFocused();
  await page.getByRole("alertdialog").getByRole("button", { name:"Cancel", exact:true }).click();
  await expect(sheet.getByText("Purge proof", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(sheet.getByText("Trash is empty")).toBeVisible();
  await sheet.getByRole("button", { name: "Close Trash", exact: true }).click();
  await create("Second purge proof");
  sheet = await trash();
  await sheet.getByRole("button", { name: "Delete forever", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", {name:"Delete forever",exact:true}).click();
  await expect(sheet.getByText("Trash is empty")).toBeVisible();
  await sheet.getByRole("button", { name: "Close Trash", exact: true }).click();
  await create("Empty proof");
  sheet = await trash();
  await sheet.getByRole("button", { name: "Empty Trash", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name:"Delete forever",exact:true }).click();
  await expect(sheet.getByText("Trash is empty")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  sheet = await trash();
  await expect(sheet.getByText("Trash is empty")).toBeVisible();
  await expect(page.getByText("Saved on this device", { exact: true })).toHaveCount(0);
});

test("project task search, status editing and keyboard view tabs preserve rows", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: page.viewportSize()!.width < 600 ? "Bottom navigation" : "Main navigation", exact: true });
  await nav.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("dialog", { name: "New project" }).getByRole("button", { name: "Model tracking", exact: true }).click();
  const all = page.getByRole("tab", { name: "All tasks", exact: true });
  await expect(all).toHaveAttribute("aria-selected", "true");
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("Recalibrate");
  await expect(page.getByRole("textbox", { name: "Row title" })).toHaveCount(1);
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await page.getByRole("menuitem", {name:"Done",exact:true}).click();
  await all.focus(); await all.press("End");
  await expect(page.getByRole("tab", { name: "Gallery", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Gallery", exact: true }).press("Home");
  await all.click();
  await expect(page.getByRole("button", { name: "Status", exact: true })).toContainText("Done");
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("");
  await expect(page.getByRole("textbox", { name: "Row title" })).toHaveCount(2);
});

test("an app update is visible outside Settings and flushes the editor before activation", async ({ page }) => {
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    const worker = Object.assign(new EventTarget(), { postMessage: (message: unknown) => messages.push(message) });
    const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null });
    const serviceWorker = Object.assign(new EventTarget(), { getRegistration: async () => registration, register: async () => registration });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    Object.assign(window, { updateMessages: messages });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reload to update the app", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: page.viewportSize()!.width < 600 ? "Bottom navigation" : "Main navigation", exact: true });
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).fill("Update persistence proof");
  await page.getByRole("textbox", { name: "Document editor" }).fill("Flush this before updating. ខ្មែរ 中文");
  await page.getByRole("button", { name: "Reload to update the app", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { updateMessages: unknown[] }).updateMessages)).toEqual([{ type: "SKIP_WAITING" }]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Reload to update the app", exact: true })).toBeVisible();
  await leaveWriting(page);
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await page.locator(".ws-list-pane").getByRole("button", { name: /Update persistence proof/ }).click();
  await expect(page.getByRole("textbox", { name: "Document editor" })).toContainText("Flush this before updating. ខ្មែរ 中文");
});

test("light task controls keep compact pills and hide imported Notion metadata without deleting it", async ({ page }) => {
  await page.goto("/");
  const phone = page.viewportSize()!.width < 600;
  const nav = page.getByRole("navigation", { name: phone ? "Bottom navigation" : "Main navigation", exact: true });
  if (phone) {
    const today = nav.getByRole("button", {name:"Today",exact:true});
    await expect(today.locator("svg")).toHaveCSS("color", await today.evaluate(element => getComputedStyle(element).color));
  }
  await nav.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("dialog", { name: "New project" }).getByRole("button", { name: "Model tracking", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Task controls" })).toBeVisible();
  const pill = page.getByRole("button", { name: "Status", exact: true }).first();
  const metrics = await pill.evaluate(element => ({ target:element.getBoundingClientRect().height, inset:getComputedStyle(element,"::before").top }));
  expect(metrics.target).toBeGreaterThanOrEqual(44);
  expect(metrics.inset).toBe("9px");
  const rowTitle = page.getByRole("textbox", {name:"Row title",exact:true}).first();
  await rowTitle.fill("Swimming pool light replacement delivery");
  await expect(rowTitle).toHaveJSProperty("tagName", "TEXTAREA");
  await rowTitle.press("Enter");
  await expect(rowTitle).toHaveValue("Swimming pool light replacement delivery");
  if (phone) {
    const fits = await rowTitle.evaluate(element => element.getBoundingClientRect().right <= element.closest(".ws-db-table-scroll")!.getBoundingClientRect().right);
    expect(fits).toBe(true);
  }
  if (phone) {
    await page.getByRole("button", { name: "Back to Projects", exact: true }).click();
    await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Import portable files", { exact: true }).setInputFiles({ name:"Imported tasks.csv", mimeType:"text/csv", buffer:Buffer.from("Title,Notion Source\nKeep task,https://notion.example.test/source\n") });
  await expect(page.getByText("File imported.", { exact:true })).toBeVisible();
  await page.getByRole("button", { name:"Close Settings", exact:true }).click();
  if (phone) await page.getByRole("complementary", {name:"Sidebar", exact:true}).getByRole("button", { name:"Close sidebar", exact:true }).click();
  await nav.getByRole("button", { name:"Projects", exact:true }).click();
  await page.locator("main .ws-project-card").filter({hasText:"Imported tasks"}).click();
  await expect(page.getByRole("columnheader", {name:/Notion Source/})).toHaveCount(0);
  await expect(page.getByRole("textbox", {name:"Row title"})).toHaveValue("Keep task");
  if (phone) {
    await page.getByRole("button", { name: "Back to Projects", exact: true }).click();
    await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  }
  await page.getByRole("button", { name:"Settings", exact:true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"),page.getByRole("button", { name:"Export ZIP", exact:true }).click()]);
  const archive = unzipSync(await readFile((await download.path())!));
  expect(strFromU8(archive["workspace.json"]!)).toContain("https://notion.example.test/source");
});
