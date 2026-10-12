import { test, expect, type Page } from "@playwright/test";
const session = {
  access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "11111111-1111-4111-8111-111111111111", email: "fixture@example.test" },
};
async function service(page: Page, rejectCode = false) {
  const sent: unknown[] = [];
  await page.route("https://**", route => route.abort("blockedbyclient"));
  await page.route("https://auth.example.test/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path.endsWith("/otp")) sent.push(route.request().postDataJSON());
    if (path.endsWith("/verify")) {
      body = rejectCode ? { msg: "Invalid code", error_code: "otp_expired" } : session;
      status = rejectCode ? 403 : 200;
    }
    if (path.endsWith("/pull_changes")) body = { changes: [], cursor: "0", hasMore: false };
    if (path.endsWith("/push_changes")) body = { acknowledged: route.request().postDataJSON().changes.map((row: { id: string }) => row.id) };
    if (path.endsWith("/authorize")) return route.fulfill({ contentType: "text/html", body: "<title>Google start</title>" });
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return sent;
}
test("first launch accepts a pasted code and later launches open Today", async ({ page }) => {
  const sent = await service(page);
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("fixture@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const code = page.getByRole("textbox", { name: "Email code" });
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(page.locator(".sign-in-boxes span")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Resend 30s" })).toBeDisabled();
  await code.evaluate(element => {
    const transfer = new DataTransfer(); transfer.setData("text", "123456");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
  });
  await expect(page.getByRole("status", { name: "Signed in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("main", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
});
test("wrong code keeps entry visible and resend waits thirty seconds", async ({ page }) => {
  const sent = await service(page, true);
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("fixture@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Email code" }).fill("000000");
  await expect(page.getByRole("alert")).toHaveText("Wrong code");
  await expect(page.locator(".sign-in-shake")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email code" })).toHaveValue("");
  await page.clock.fastForward(29_000);
  await expect(page.getByRole("button", { name: /Resend \ds/ })).toBeDisabled();
  await page.clock.fastForward(1_000);
  await page.getByRole("button", { name: "Resend", exact: true }).click();
  expect(sent).toHaveLength(2);
});
test("Google starts in the same window with a bound PKCE return", async ({ page, context }) => {
  await service(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/auth\.example\.test\/auth\/v1\/authorize/);
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  expect(new URL(url.searchParams.get("redirect_to")!).searchParams.get("state")).toBeTruthy();
  expect(context.pages()).toHaveLength(1);
});
