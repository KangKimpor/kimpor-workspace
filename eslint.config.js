import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['.private/**', '**/dist/**', '**/dist-desktop/**', '**/dist-auth/**', '**/target/**', '**/node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**', 'docs/evidence/**', 'apps/web/public/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error' } }
);
