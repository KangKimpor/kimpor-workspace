import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "account.spec.ts", timeout: 35_000,
  fullyParallel: true, workers: process.env.CI ? 2 : 3,
  outputDir: "test-results/auth", reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure", serviceWorkers: "block" },
  webServer: { command: "pnpm --filter @veloradesk/web exec vite preview --outDir dist-auth --host 127.0.0.1 --port 4174", url: "http://127.0.0.1:4174", reuseExistingServer: !process.env.CI },
  projects: ([
    ["desktop", "chromium", 1366, 768, false],
    ["iphone15", "webkit", 393, 852, true],
    ["ipad", "webkit", 820, 1180, true],
  ] as const).flatMap(([name, browserName, width, height, touch]) => (["light", "dark"] as const).map(colorScheme => ({
    name: `account-${name}-${colorScheme}`, use: { browserName, viewport: { width, height }, colorScheme, isMobile: touch, hasTouch: touch },
  }))),
});
