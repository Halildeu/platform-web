import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'mfe_shell/i18n',
        replacement: path.resolve(__dirname, '../mfe-shell/src/app/i18n/index.ts'),
      },
      // Subpath alias must be ordered BEFORE the root '@mfe/auth' alias,
      // otherwise Vite matches the prefix and never resolves the subpath.
      {
        find: '@mfe/auth/ui',
        replacement: path.resolve(__dirname, '../../packages/auth/src/ui.ts'),
      },
      {
        find: '@mfe/auth',
        replacement: path.resolve(__dirname, '../../packages/auth/src/index.ts'),
      },
      // Subpath alias for the responsive datagrid hooks (PR #236) —
      // without this, `@mfe/design-system/advanced/data-grid` resolves
      // through package.json `exports` which point at `dist/` (not
      // built during tests). Must be ordered BEFORE the root
      // `@mfe/design-system` alias for the same prefix-shadowing
      // reason as the `@mfe/auth/ui` alias above.
      {
        find: '@mfe/design-system/advanced/data-grid',
        replacement: path.resolve(__dirname, '../../packages/design-system/src/advanced/data-grid'),
      },
      {
        find: '@mfe/design-system',
        replacement: path.resolve(__dirname, '../../packages/design-system/src'),
      },
      {
        find: '@mfe/shared-http',
        replacement: path.resolve(__dirname, '../../packages/shared-http/src'),
      },
      {
        find: '@mfe/i18n-dicts',
        replacement: path.resolve(__dirname, '../../packages/i18n-dicts/src'),
      },
    ],
  },
  test: {
    name: 'mfe-access',
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
