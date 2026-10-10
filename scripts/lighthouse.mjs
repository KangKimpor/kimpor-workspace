import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'lhci', 'autorun'], {
  env: { ...process.env, CHROME_PATH: chromium.executablePath() }, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
