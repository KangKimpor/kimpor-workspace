import { spawnSync } from 'node:child_process';
const fixture = { ...process.env, VITE_SUPABASE_URL: 'https://auth.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key', VITE_SUPABASE_ANON_KEY: '' };
for (const args of [
  ['--filter', '@veloradesk/web', 'exec', 'vite', 'build', '--mode', 'auth-test', '--outDir', 'dist-auth'],
  ...(process.argv.includes('--build-only') ? [] : [['exec', 'playwright', 'test', '--config', 'playwright.auth.config.ts']]),
]) {
  const result = spawnSync('pnpm', args, { env: fixture, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
