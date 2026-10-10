import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/**/*.test.ts'], coverage: { provider: 'v8', include: ['packages/core/src/clock.ts', 'packages/core/src/merge.ts', 'packages/core/src/quota.ts', 'packages/core/src/auth.ts'], thresholds: { lines: 85, statements: 85, functions: 85, branches: 80 } } } });
