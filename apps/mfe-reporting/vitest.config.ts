import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  root: __dirname,
  resolve: {
    /*
     * Aliases are processed by @rollup/plugin-alias which does
     * first-match prefix substitution. The bare `@mfe/design-system`
     * alias maps to `src/index.ts`; any value-import subpath
     * (`@mfe/design-system/advanced/data-grid` etc.) would otherwise
     * have its prefix substituted to `src/index.ts/advanced/...`
     * which is invalid. Most existing reporting imports of the
     * data-grid subpath are `import type {...}`, type-erased before
     * resolution; PR-A grid-contract migration is the first to add a
     * value-import + side-effect import on the subpath via
     * `CompensationDashboard.tsx`, exposing the missing subpath
     * aliases. ORDER MATTERS — most-specific aliases must come first
     * so `setup` matches before `data-grid` matches before
     * `design-system`.
     */
    alias: {
      '@mfe/auth': path.resolve(__dirname, '../../packages/auth/src/index.ts'),
      '@mfe/x-charts': path.resolve(__dirname, '../../packages/x-charts/src/index.ts'),
      '@mfe/design-system/advanced/data-grid/setup': path.resolve(
        __dirname,
        '../../packages/design-system/src/advanced/data-grid/setup.ts',
      ),
      '@mfe/design-system/advanced/data-grid': path.resolve(
        __dirname,
        '../../packages/design-system/src/advanced/data-grid/index.ts',
      ),
      '@mfe/design-system': path.resolve(__dirname, '../../packages/design-system/src/index.ts'),
    },
  },
  test: {
    root: __dirname,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
