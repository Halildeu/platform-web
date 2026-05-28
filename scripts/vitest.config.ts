import { defineConfig } from 'vitest/config';

/**
 * Vitest project for build-time scripts that have invariants worth gating
 * but live outside any package or app (`scripts/vite-plugins/*.ts`, helper
 * scripts, etc.). Without this project, `mf-preload-helper-isolation.test.ts`
 * was never run in CI even though it guards the auth ↔ design-system
 * runtime cycle (PR-X8 invariant).
 *
 * Node environment — no DOM. Tests that need DOM stubs (e.g. the helper-
 * contract test for `mf-preload-helper-isolation`) construct them inline
 * via `new Function(...)`.
 */
export default defineConfig({
  test: {
    name: 'scripts',
    root: __dirname,
    include: ['vite-plugins/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
