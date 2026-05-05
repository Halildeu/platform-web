import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@mfe/design-system/lib/auth': path.resolve(
        __dirname,
        '../../packages/design-system/src/lib/auth',
      ),
      // Subpath alias for the responsive datagrid hooks (PR #236) —
      // without this, `@mfe/design-system/advanced/data-grid` resolves
      // through package.json `exports` which point at `dist/` (not
      // built during test runs); consumer hook imports come back
      // undefined and `useResponsiveColumnDefs is not a function`
      // surfaces in UsersGrid render.
      '@mfe/design-system/advanced/data-grid': path.resolve(
        __dirname,
        '../../packages/design-system/src/advanced/data-grid',
      ),
      '@mfe/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@mfe/shared-http': path.resolve(__dirname, '../../packages/shared-http/src'),
      '@mfe/i18n-dicts': path.resolve(__dirname, '../../packages/i18n-dicts/src'),
      // iter-34: drawer + UserActions tests import usePermissions from
      // @mfe/auth via the SUT; vitest's import-analysis runs before vi.mock,
      // so the alias must resolve to the package source even when the test
      // fully stubs the symbol.
      '@mfe/auth': path.resolve(__dirname, '../../packages/auth/src'),
      'mfe_shell/i18n': path.resolve(__dirname, '../mfe-shell/src/app/i18n/index.ts'),
      // Faz 21.8 PR-X4c: Codex iter-2 PR-X2 compatibility note —
      // resolve x-charts root + subpath via tsconfig-style alias for
      // tests under legacy `moduleResolution: 'node'`.
      '@mfe/x-charts/client': path.resolve(
        __dirname,
        '../../packages/x-charts/src/client/index.ts',
      ),
      '@mfe/x-charts/ssr': path.resolve(__dirname, '../../packages/x-charts/src/ssr/index.ts'),
      '@mfe/x-charts': path.resolve(__dirname, '../../packages/x-charts/src/index.ts'),
    },
  },
  test: {
    name: 'mfe-users',
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
