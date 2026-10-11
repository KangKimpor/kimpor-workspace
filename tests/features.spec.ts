import { test, expect, type Page } from "@playwright/test";
test.setTimeout(90_000);
test.use({ actionTimeout: 20_000 });
async function module(page: Page, name: string) {
  const tab = page
    .getByRole("button", { name, exact: true })
    .filter({ visible: true })
    .first();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Page detail", exact: true })).toHaveCount(0);
}
async function settings(page: Page) {
  if (
    !(await page
      .getByRole("button", { name: "Settings", exact: true })
      .first()
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Open sidebar", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
}
test("file bytes survive protection and reload, and equations and columns render", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await module(page, "Notes");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page title" })
    .fill("Attachment proof");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("A protected attachment · 中文 · ខ្មែរ");
  await page.getByLabel("Choose attachment", { exact: true }).setInputFiles({
    name: "proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Private file contents ខ្មែរ 中文"),
  });
  const file = page.getByRole("link", { name: /proof\.txt/ });
  await expect(file).toHaveAttribute("href", /^blob:/);
  await page.getByRole("button", { name: "Add equation", exact: true }).click();
  await page.getByLabel("Equation expression").fill("\\frac{a}{b} + \\sqrt{c}");
  await page
    .getByRole("button", { name: "Insert equation", exact: true })
    .click();
  await expect(page.locator(".rich-equation .katex")).toHaveCount(1);
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.press("/");
  await page.getByLabel("Filter block commands").fill("Columns");
  await page.getByRole("button", { name: /Columns.*Two columns/ }).click();
  await expect(page.locator("[data-columns] [data-column]")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Protect document", exact: true })
    .click();
  await page
    .getByLabel("New passphrase", { exact: true })
    .fill("Attachment passphrase 2026");
  await page.getByLabel("I saved my recovery key.").check();
  await page
    .getByRole("button", { name: "Enable encryption", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lock document", exact: true }),
  ).toBeVisible();
  const disk = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("veloradesk-workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["attachments", "documents"]);
    const all = (name: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [files, docs] = await Promise.all([
      all("attachments"),
      all("documents"),
    ]);
    db.close();
    return {
      documents: docs.length,
      file: new TextDecoder().decode((files[0] as { bytes: Uint8Array }).bytes),
      mime: (files[0] as { mime: string }).mime,
    };
  });
  expect(disk.documents).toBe(0);
  expect(disk.file).not.toContain("Private file contents");
  expect(disk.mime).toBe("application/octet-stream");
  await module(page, "Today");
  await page.reload();
  await page
    .locator("main")
    .getByRole("button", { name: /Attachment proof|Locked entry/ })
    .first()
    .click();
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("Attachment passphrase 2026");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(file).toHaveAttribute("href", /^blob:/);
  expect(
    await file.evaluate(async (element) =>
      (await fetch((element as HTMLAnchorElement).href)).text(),
    ),
  ).toBe("Private file contents ខ្មែរ 中文");
  await expect(page.locator(".rich-equation .katex")).toHaveCount(1);
  await expect(page.locator("[data-columns] [data-column]")).toHaveCount(2);
  expect(errors).toEqual([]);
});
test("database rows persist in all five views and journal entries use the same editor", async ({
  page,
}) => {
  await page.goto("/");
  await module(page, "Workspace");
  await page.getByRole("button", { name: "New database", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).fill("Reading list");
  await page.getByRole("button", { name: "New row", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Document editor" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Page title" })
    .fill("Read a little each day");
  await page
    .getByRole("textbox", { name: "Document editor" })
    .fill("A row can hold a full page.");
  await module(page, "Workspace");
  await page
    .locator("main")
    .getByRole("button", { name: /Reading list/ })
    .first()
    .click();
  for (const name of ["Table", "List", "Board", "Calendar", "Gallery"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(".ws-db-count")).toContainText("1 item");
  }
  await module(page, "Journal");
  await page
    .getByRole("button", { name: "New journal entry", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Page title" }).fill("A good day");
  await page
    .getByRole("textbox", { name: "Document editor" })
    .fill("I made room for one small thing.");
  await module(page, "Today");
  await page.reload();
  await expect(page.getByText("1 entry today", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Continue your journal", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Document editor" }),
  ).toContainText("one small thing");
});
test("app lock excludes the workspace and palette until the correct passphrase is entered", async ({
  page,
}) => {
  await page.goto("/");
  await settings(page);
  await page
    .getByLabel("App passphrase", { exact: true })
    .fill("Device passphrase 2026");
  await page
    .getByRole("button", { name: "Enable app lock", exact: true })
    .click();
  await expect(
    page.getByText("App lock enabled. Keep your passphrase safe.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Today", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("App passphrase", { exact: true })
    .fill("Wrong passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Incorrect app passphrase.");
  await page
    .getByLabel("App passphrase", { exact: true })
    .fill("Device passphrase 2026");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Today", exact: true }).first(),
  ).toBeVisible();
});
