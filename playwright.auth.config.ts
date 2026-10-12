import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "account.spec.ts", timeout: 35_000,
  fullyParallel: true, workers: process.env.CI ? 2 : 3,
  outputDir: "test-results/auth", reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure", serviceWorkers: "block" },
  webServer: { command: "pnpm --filter @veloradesk/web exec vite preview --outDir dist-auth --host 127.0.0.1 --port 4174", url: "http://127.0.0.1:4174", reuseExistingServer: false },
  projects: [
    { name: "account-desktop", use: { browserName: "chromium", viewport: { width: 1366, height: 768 } } },
    { name: "account-iphone15", use: { browserName: "webkit", viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true } },
    { name: "account-ipad", use: { browserName: "webkit", viewport: { width: 820, height: 1180 }, hasTouch: true } },
  ],
});
