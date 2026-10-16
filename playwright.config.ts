import { defineConfig } from '@playwright/test';
import { shardProfiles } from './scripts/visual-matrix.mjs';
const legacyIgnore = ['**/layout-audit.spec.ts', '**/account.spec.ts', '**/responsive-matrix.spec.ts'];
const targets = [
  ['desktop1980', 'chromium', 1980, 1080, false],
  ['iphone15', 'webkit', 393, 852, true],
  ['ipad-portrait', 'webkit', 820, 1180, true],
  ['ipad-landscape', 'webkit', 1180, 820, true],
  ['windows1366', 'chromium', 1366, 768, false],
  ['windows1920', 'chromium', 1920, 1080, false],
] as const;
export default defineConfig({
  testDir: './tests', testIgnore: '**/account.spec.ts', timeout: 35_000, fullyParallel: true,
  workers: process.env.CI ? 2 : 4, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: [
    ...process.env.BASE_URL ? [] : [{ command: 'pnpm --filter @veloradesk/web preview --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI }],
    ...process.env.KIMPOR_LAYOUT_AUDIT === 'true' && !process.env.AUTH_BASE_URL ? [{ command:'pnpm --filter @veloradesk/web exec vite preview --outDir dist-auth --host 127.0.0.1 --port 4174',url:'http://127.0.0.1:4174',reuseExistingServer:!process.env.CI }] : [],
  ],
  projects: process.env.KIMPOR_LAYOUT_AUDIT === 'true' ? shardProfiles().flatMap(([name,width,height,dpr,browserName]) => (['light','dark'] as const).map(colorScheme => ({
    name:`layout-${name}-${colorScheme}`, testMatch:'layout-audit.spec.ts',
    use:{ browserName,viewport:{width,height},deviceScaleFactor:dpr,colorScheme,hasTouch:browserName === 'webkit',isMobile:browserName === 'webkit',reducedMotion:'reduce' as const,timezoneId:'Asia/Phnom_Penh',serviceWorkers:'block' as const },
  }))) : [
    { name: 'chromium', testIgnore: legacyIgnore, use: { browserName: 'chromium', viewport: { width: 1536, height: 864 } } },
    { name: 'webkit', testIgnore: legacyIgnore, use: { browserName: 'webkit', viewport: { width: 1180, height: 820 } } },
    { name: 'firefox', testIgnore: legacyIgnore, use: { browserName: 'firefox', viewport: { width: 1280, height: 720 } } },
    { name: 'phone-webkit', testIgnore: legacyIgnore, use: { browserName: 'webkit', viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    ...targets.flatMap(([name, browserName, width, height, touch]) => (['light', 'dark'] as const).map(colorScheme => ({
      name: `${name}-${colorScheme}`, testMatch: 'responsive-matrix.spec.ts',
      use: { browserName, viewport: { width, height }, colorScheme, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' as const },
    }))),
  ]
});
