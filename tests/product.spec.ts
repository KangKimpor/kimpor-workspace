import { leaveWriting, formatting } from './workspace-actions';
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.setTimeout(90_000);
async function navigate(page: Page, name: string) {
  await leaveWriting(page);
  const navigation = page.getByRole("navigation", {
    name:
      page.viewportSize()!.width < 600
        ? "Bottom navigation"
        : "Main navigation",
    exact: true,
  });
  const button = navigation.getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveCount(0);
}
async function note(page: Page, title = "My note") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Notes", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).fill(title);
  await expect(
    page.getByRole("textbox", { name: "Document editor" }),
  ).toBeVisible();
}
test("a multilingual note persists through navigation and an offline reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await note(page);
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("A thought in English · ខ្មែរ · 中文");
  await navigate(page, "Notes");
  await page
    .locator("main")
    .getByRole("button", { name: /My note/ })
    .first()
    .click();
  await expect(editor).toContainText("ខ្មែរ");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Offline addition");
  await expect(editor).toContainText("Offline addition");
  await navigate(page, "Today");
  await page.reload();
  await navigate(page, "Notes");
  await page
    .locator("main")
    .getByRole("button", { name: /My note/ })
    .first()
    .click();
  await expect(editor).toContainText("Offline addition");
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test("the command palette searches local mixed-language bodies and suppresses IME shortcuts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { searchIndexWrites: number };
    state.searchIndexWrites = 0;
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      if (message?.kind === "index") state.searchIndexWrites++;
      return Reflect.apply(postMessage, this, [message, ...options]);
    };
  });
  await note(page, "Languages");
  await page
    .getByRole("textbox", { name: "Document editor" })
    .fill("សួស្តី 中文 hello");
  await navigate(page, "Today");
  await page.reload();
  await page.locator(".ws-today").waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        isComposing: true,
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, keyCode: 229 }),
    );
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Search query" })).toBeFocused();
  await page.keyboard.type("中文");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /Languages/ }),
  ).toBeVisible();
  const indexWrites = await page.evaluate(() => (window as unknown as { searchIndexWrites: number }).searchIndexWrites);
  await page.getByRole("textbox", { name: "Search query" }).fill("hello");
  await page.getByRole("combobox", { name: "Search item type" }).selectOption("note");
  await expect(page.getByRole("dialog").getByRole("button", { name: /Languages/ })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { searchIndexWrites: number }).searchIndexWrites)).toBe(indexWrites);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("page mentions open after typing and persist through navigation and reload", async ({
  page,
}) => {
  await note(page, "Mention destination 中文");
  await page.getByRole("textbox", { name: "Document editor" }).fill("Destination body");
  await navigate(page, "Notes");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("textbox", { name: "Page title" }).fill("Mention source");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("See this page: ");
  await editor.press("End");
  await editor.press("@");
  const menu = page.getByRole("group", { name: "Mention a page", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("textbox", { name: "Filter block commands" }).fill("destination");
  await menu.getByRole("button", { name: "Mention destination 中文", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(editor.locator("a[data-page-mention]")).toHaveText("↗ Mention destination 中文");
  await navigate(page, "Today");
  await page.reload();
  await navigate(page, "Notes");
  await page.locator(".ws-page-list").getByRole("button", { name: /Mention source/ }).first().click();
  await expect(editor.locator("a[data-page-mention]")).toHaveText("↗ Mention destination 中文");
  await editor.getByRole("link", { name: "↗ Mention destination 中文", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Mention destination 中文");
  await expect(editor).toContainText("Destination body");
  await page.locator(".ws-page-details > summary").click();
  await expect(page.getByRole("heading", { name: "Backlinks", exact: true })).toBeVisible();
});
test("encryption rejects a wrong passphrase and keeps content after reload", async ({
  page,
}) => {
  await note(page, "Private body");
  await page
    .getByRole("textbox", { name: "Document editor" })
    .fill("Secret journal content ខ្មែរ 中文");
  await formatting(page);
  await page
    .getByRole("button", { name: "Protect document", exact: true })
    .click();
  await page
    .getByLabel("New passphrase", { exact: true })
    .fill("test passphrase 2026");
  await page.getByLabel("I saved my recovery key.").check();
  await page
    .getByRole("button", { name: "Enable encryption", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Enable encryption", exact: true })).toHaveCount(0);
  await formatting(page);
  await expect(
    page.getByRole("button", { name: "Lock document", exact: true }),
  ).toBeVisible();
  await navigate(page, "Today");
  await page.reload();
  await navigate(page, "Notes");
  await page.locator(".ws-page-list").getByRole("button", { name: /Private body|Locked entry/ }).first().click();
  await expect(
    page.getByRole("region", { name: "Locked document" }),
  ).toBeVisible();
  await page.getByLabel("Passphrase", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Document editor" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("test passphrase 2026");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Document editor" }),
  ).toContainText("Secret journal content");
});
test("calendar creates a local recurring event and all views are available", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Calendar", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "New event", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Weekly review");
  await page.getByText("More details", { exact: true }).click();
  await page.getByLabel("Custom recurrence RRULE").fill("FREQ=WEEKLY;COUNT=4");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Selected day events", exact: true }).getByRole("button", { name: /Weekly review/ }),
  ).toBeVisible();
  for (const name of ["Day", "Week", "Month", "Agenda"]) {
    const view = page.getByRole("group", { name: "Calendar view", exact: true }).getByRole("button", { name, exact: true });
    await view.click();
    await expect(view).toHaveAttribute("aria-pressed", "true");
  }
});
test("all modules and settings are accessible in both themes without page overflow", async ({
  page,
}) => {
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      localStorage.setItem("velora-theme", value);
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const name of ["Today", "Calendar", "Notes", "Journal", "Projects"]) {
      await page.getByRole("button", { name, exact: true }).first().click();
      await expect(page.locator("main")).toBeVisible();
      await page.waitForTimeout(120);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${name} overflow`,
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations,
        `${theme} ${name}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, description: v.description, nodes: v.nodes.map((n) => n.target) })))}`,
      ).toEqual([]);
    }
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
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Export ZIP" }).waitFor();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCSS("opacity", "1");
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations,
      JSON.stringify(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
    ).toEqual([]);
    await page.keyboard.press("Escape");
  }
});
