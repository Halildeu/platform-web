import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@mfe/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@mfe/i18n-dicts': path.resolve(__dirname, '../../packages/i18n-dicts/src'),
      '@mfe/shared-http': path.resolve(__dirname, '../../packages/shared-http/src'),
      '@platform/capabilities': path.resolve(__dirname, '../../packages/platform-capabilities/src'),
    },
  },
  /**
   * Mirror the build-time `define` constants from vite.config.ts so the
   * shell source compiles cleanly under vitest.  Without these, any test
   * that imports a module referencing `__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__`
   * or `__MFE_SUGGESTIONS_ON_DEMAND__` throws ReferenceError at module load.
   *
   * Test environment defaults — all set ON so tests exercising the
   * on-demand / endpoint-admin-enabled / observer-exposed code paths
   * compile against the live branch.  Note: these defines are
   * **compile-time replacements** by Vite, NOT runtime globals — tests
   * cannot toggle the opposite branch via `vi.stubGlobal` (Vite already
   * inlined the literal).  Tests that need the inverse branch must
   * either (a) override here per-suite via separate vitest configs, or
   * (b) import the module under test directly and avoid the branched
   * code path entirely.
   */
  define: {
    __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__: JSON.stringify(true),
    __MFE_SUGGESTIONS_ON_DEMAND__: JSON.stringify(true),
    __MFE_ETHIC_ON_DEMAND__: JSON.stringify(true),
    __PERF_OBSERVER_EXPOSE__: JSON.stringify(false),
  },
  test: {
    name: 'mfe-shell',
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['../../vitest.setup.ts'],
  },
});
