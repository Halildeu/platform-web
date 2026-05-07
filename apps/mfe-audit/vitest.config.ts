import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      // Subpath alias for the responsive datagrid hooks (PR #236) —
      // without this, `@mfe/design-system/advanced/data-grid` resolves
      // through package.json `exports` which point at `dist/` (not
      // built during test runs); consumer hook imports come back
      // undefined and `useResponsiveColumnDefs is not a function`
      // surfaces in AuditEventFeed render. Mirror of mfe-users
      // vitest.config alias landed in PR #237.
      '@mfe/design-system/advanced/data-grid': path.resolve(
        __dirname,
        '../../packages/design-system/src/advanced/data-grid',
      ),
      '@mfe/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@mfe/shared-http': path.resolve(__dirname, '../../packages/shared-http/src'),
      '@mfe/i18n-dicts': path.resolve(__dirname, '../../packages/i18n-dicts/src'),
    },
  },
  test: {
    name: 'mfe-audit',
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
