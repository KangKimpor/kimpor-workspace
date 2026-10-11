import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const { zipSync, strToU8 } = createRequire(new URL("../packages/core/package.json", import.meta.url))("fflate");
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
