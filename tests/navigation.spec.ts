import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const { zipSync, strToU8, unzipSync, strFromU8 } = createRequire(new URL("../packages/core/package.json", import.meta.url))("fflate");
test.setTimeout(90_000);

test("sidebar collapse and phone back gestures retain pending edits; phone sheets resize by keyboard", async ({ page }) => {
  const phone = page.viewportSize()!.width < 600;
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: phone ? "Bottom navigation" : "Main navigation", exact: true });
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Page title", exact: true });
  const editor = page.getByRole("textbox", { name: "Document editor", exact: true });
  await title.fill("Navigation saved note");
  await editor.fill("Pending edit · ខ្មែរ · 中文");
  if (phone) {
    const edge = page.locator(".ws-edge-back");
    const pointer = { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: 8, clientY: 240 };
    await edge.dispatchEvent("pointerdown", pointer);
    await edge.dispatchEvent("pointermove", { ...pointer, clientX: 160 });
    await edge.dispatchEvent("pointerup", { ...pointer, clientX: 160 });
  } else {
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation", exact: true })).toHaveCount(0);
    await expect(editor).toContainText("ខ្មែរ · 中文");
    await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
    await expect(nav).toBeVisible();
    await nav.getByRole("button", { name: "Notes", exact: true }).click();
  }
  await expect(title).toHaveCount(0);
  await page.reload();
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await page.locator(".ws-page-list").getByRole("button", { name: /Navigation saved note/ }).click();
  await expect(title).toHaveValue("Navigation saved note");
  await expect(editor).toContainText("Pending edit · ខ្មែរ · 中文");
  if (phone) {
    await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const handle = page.getByRole("button", { name: "Resize sheet", exact: true });
    await handle.focus(); await handle.press("Home");
    const small = (await page.getByRole("dialog").boundingBox())!.height;
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await handle.press("End");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => (await page.getByRole("dialog").boundingBox())!.height).toBeGreaterThan(small + 100);
    await page.getByRole("button", { name: "Close Settings", exact: true }).click();
  }
});

test("a Notion ZIP opens nested pages and downloads its actual embedded file", async ({ page }) => {
  const phone = page.viewportSize()!.width < 600;
  const bytes = Buffer.from("Imported attachment · ខ្មែរ · 中文");
  const zip = zipSync({
    "Parent.md": strToU8("# Parent"),
    "Parent/Child.md": strToU8("# Child\n\n[Read this](imported.txt)"),
    "Parent/imported.txt": bytes,
  });
  await page.goto("/");
  if (phone) await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Import portable files", { exact: true }).setInputFiles({ name: "notion.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
  await expect(page.getByText("File imported.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Settings", exact: true }).click();
  await page.getByRole("tree").getByRole("button", { name: "Expand Parent", exact: true }).click();
  await page.getByRole("tree").getByRole("button", { name: /Child/ }).last().click();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Child");
  const link = page.getByRole("link", { name: /imported.txt/ });
  await expect(link).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(await readFile((await download.path())!)).toEqual(bytes);
});

test("imported timed dates display their stated day without losing the original value", async ({ page }) => {
  const phone = page.viewportSize()!.width < 600;
  const timestamp = "2026-12-10T23:30:00-07:00";
  const date = "2026-10-11T09:00:00Z";
  const databaseId = "imported-date-database";
  const base = {
    userId: "local", parentId: null, favorite: false, tags: [], icon: "", cover: "",
    fullWidth: false, date: null, databaseId: null, properties: {},
    createdAt: date, updatedAt: date, deletedAt: null,
  };
  const archive = {
    format: "veloradesk", version: 1, exportedAt: date, documents: [], versions: [],
    entities: [
      { table: "pages", entity: { ...base, id: databaseId, type: "database", title: "Imported date database", databaseId } },
      { table: "databases", entity: {
        id: databaseId, userId: "local", createdAt: date, updatedAt: date, deletedAt: null,
        properties: [{ id: "title", name: "Title", type: "title" }, { id: "due", name: "Due date", type: "date" }],
        views: [{ id: "table", name: "Table", type: "table" }],
      } },
      { table: "pages", entity: { ...base, id: "imported-date-row", type: "row", title: "Imported timed task", parentId: databaseId, databaseId, properties: { due: timestamp } } },
    ],
  };
  await page.goto("/");
  const settings = async () => {
    if (phone) await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  };
  await settings();
  const zip = zipSync({ "workspace.json": strToU8(JSON.stringify(archive)) });
  await page.getByLabel("Import portable files", { exact: true }).setInputFiles({ name: "dated-workspace.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
  await expect(page.getByText("File imported.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Settings", exact: true }).click();
  await page.getByRole("tree").getByRole("button", { name: "Imported date database", exact: true }).click();
  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-10");
  await settings();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export full ZIP", exact: true }).click(),
  ]);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const exported = JSON.parse(strFromU8(files["workspace.json"]));
  expect(exported.entities.find((entry: { table: string; entity: { id: string } }) => entry.table === "pages" && entry.entity.id === "imported-date-row").entity.properties.due).toBe(timestamp);
});
