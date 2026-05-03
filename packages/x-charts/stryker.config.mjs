/**
 * Stryker mutation testing baseline for `@mfe/x-charts`.
 *
 * Faz 21.9 PR3f (Codex thread `019defa5`). Codex review:
 *   - "İlk PR'da `x-charts-quality-gates.yml` hard gate'e ekleme."
 *   - "Mutate scope'u dar tut: src/cross-filter, src/responsive, src/chartSize."
 *
 * This config follows that recommendation: scope is the pure-function
 * surface (no React, no ECharts) so the first run produces a meaningful
 * baseline without timing out on canvas rendering, and the break
 * threshold is intentionally low (advisory) until we have a real
 * baseline to raise it to.
 *
 * To run locally:
 *   pnpm --filter @mfe/x-charts test:mutation
 *
 * The CI integration is `workflow_dispatch` only for now — see the
 * accompanying README note. After 2-3 successful runs we tighten the
 * `break` threshold and graduate it to a nightly schedule.
 *
 * @see packages/design-system/stryker.config.mjs (template / contract reference)
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // ── Plugin Resolution (pnpm monorepo) ──
  plugins: ['@stryker-mutator/vitest-runner'],

  // ── Test Runner ──
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },

  // ── Mutation Targets ──
  // Pure-function surface only. Chart wrappers are excluded because their
  // tests render ECharts canvases that timeout under mutation analysis;
  // they're covered separately via option-shape tests + visual regression.
  mutate: [
    // Responsive helpers — pure, well-tested (37 unit cases)
    'src/responsive/buildResponsiveAxisLabel.ts',
    'src/responsive/buildResponsiveLegend.ts',
    'src/responsive/buildResponsiveGrid.ts',
    'src/responsive/buildResponsiveDataZoom.ts',
    'src/responsive/useResponsiveLegend.ts',
    'src/responsive/useResponsiveChartType.ts',
    'src/responsive/useAutoGranularity.ts',
    // Shared chart-size contract (PR3a)
    'src/chartSize.ts',
    // Cross-filter store + helpers — pure, 6 contract tests
    'src/cross-filter/createCrossFilterStore.ts',
    'src/cross-filter/eventBridge.ts',
    'src/cross-filter/selectors.ts',
    'src/cross-filter/useQueryCancellation.ts',
    // useResponsiveChart hook (breakpoint resolver) — small, pure
    'src/useResponsiveChart.ts',
    // Excluded by glob:
    '!src/**/__tests__/**',
    '!src/**/*.stories.*',
    '!src/**/*.visual.*',
    '!src/**/*.browser.*',
    '!src/**/index.ts',
    '!src/**/types.ts',
  ],

  // ── Mutation Operators ──
  // Focus on meaningful logic mutations, skip cosmetic ones.
  mutator: {
    excludedMutations: [
      'StringLiteral', // CSS class / event name changes = noise
      'ObjectLiteral', // Default props = noise
    ],
  },

  // ── Performance ──
  concurrency: 4,
  timeoutMS: 30000,
  incremental: true, // Only re-test changed files
  incrementalFile: '.stryker-cache/incremental.json',

  // ── Reporting ──
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },

  // ── Thresholds (advisory until first baseline) ──
  // Codex PR3 review: don't make this a hard CI gate on the first run.
  // We'll raise `break` after 2-3 advisory runs surface a real baseline.
  thresholds: {
    high: 80, // Green: 80%+ mutations killed
    low: 30, // Yellow: 30-80%
    break: 10, // CI fails below 10% — extremely lenient for a fresh suite
  },

  // ── Coverage Analysis ──
  coverageAnalysis: 'perTest', // Map each test to the mutants it can kill

  // ── Ignore Patterns ──
  ignorePatterns: [
    'dist',
    'node_modules',
    '.stryker-cache',
    'reports',
    '**/*.stories.*',
    '**/*.visual.*',
    '**/*.browser.*',
  ],
};
