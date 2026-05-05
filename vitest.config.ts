import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — workspace orchestrator.
 *
 * Migrated to Vitest 4 `test.projects` (PR-2A, see Codex thread
 * 019df7a1-6e9f-74c1-bc14-e9ab972ba5b1). Replaces the previous root
 * include/exclude monolith plus the stale `vitest.workspace.ts`
 * (Vitest 3 `defineWorkspace` shape, no longer exported by Vitest 4).
 *
 * Each project owns its own runner config: `setupFiles`, `include`,
 * `exclude`, `alias`, and `environment`. The L1 boundary contract
 * (docs/architecture/frontend/adr-test-environment-strategy.md) lives
 * in package-level configs, not at the root — so package-specific
 * jsdom stubs (canvas, ResizeObserver, etc.) stay encapsulated where
 * they belong instead of bleeding into a workspace-wide setup.
 *
 * Allowlist is explicit (no globs) to keep workspace gate scope
 * deterministic. Adding a new project means adding a line here; this
 * is a feature, not a bug — visibility of every project that gates
 * a PR is the whole point.
 *
 * NOT included:
 *   - apps/mfe-reporting and apps/mfe-ethic — explicitly out of the
 *     gate per their package configs and prior root exclude policy.
 *   - apps/mfe-suggestions and apps/mfe-schema-explorer — no vitest
 *     config; tests run via their package scripts only.
 *   - packages/i18n-dicts — pure data, no tests in scope.
 *   - packages/design-system browser/visual/cssom — runs under the
 *     dedicated browser config (`packages/design-system/vitest.browser.config.ts`)
 *     gated separately by `web-test-gate.yml` cssom-canary job.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/auth/vitest.config.ts',
      'packages/blocks/vitest.config.ts',
      'packages/create-app/vitest.config.ts',
      'packages/design-system/vitest.config.ts',
      'packages/shared-http/vitest.config.ts',
      'packages/x-charts/vitest.config.ts',
      'packages/x-data-grid/vitest.config.ts',
      'packages/x-editor/vitest.config.ts',
      'packages/x-form-builder/vitest.config.ts',
      'packages/x-kanban/vitest.config.ts',
      'packages/x-scheduler/vitest.config.ts',
      'apps/mfe-shell/vitest.config.ts',
      'apps/mfe-audit/vitest.config.ts',
      'apps/mfe-access/vitest.config.ts',
      'apps/mfe-users/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      // Per-project thresholds live in each project's config.
    },
  },
});
