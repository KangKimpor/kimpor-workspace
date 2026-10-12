import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testIgnore: '**/account.spec.ts', timeout: 35_000, fullyParallel: true,
  workers: process.env.CI ? 2 : 4, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: process.env.BASE_URL ? undefined : { command: 'pnpm --filter @veloradesk/web preview --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1536, height: 864 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1180, height: 820 } } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1280, height: 720 } } },
    { name: 'phone-webkit', use: { browserName: 'webkit', viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } }
  ]
});
