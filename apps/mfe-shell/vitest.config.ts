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
   * Test environment defaults: both flags ON so test files exercising
   * the on-demand / runtime-register code paths get the live branch.
   * Tests that need the opposite branch can shadow via `vi.stubGlobal`.
   */
  define: {
    __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__: JSON.stringify(true),
    __MFE_SUGGESTIONS_ON_DEMAND__: JSON.stringify(true),
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
