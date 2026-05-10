// @vitest-environment jsdom
/**
 * BenchmarkRoute unit tests — Faz 21.11 PR-A1.6a
 *
 * Covers the parts of the route that are testable in jsdom without
 * the actual ScatterChart render lifecycle:
 *
 *   1. Feature-flag gate — `VITE_ENABLE_DESIGN_LAB_BENCHMARK` + MODE
 *   2. Main UI mount when flag is on
 *   3. Pure helper exports (`resultsToCsv`, `buildArtifact`,
 *      `BENCHMARK_SCHEMA_VERSION`)
 *
 * The full matrix runner + render lifecycle is covered by the
 * Playwright smoke spec at `tests/playwright/design-lab.benchmark-smoke.spec.ts`,
 * where ScatterChart actually paints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@mfe/x-charts', () => ({
  ScatterChart: ({ data }: { data: ReadonlyArray<unknown> }) => (
    <div data-testid="mock-scatter">scatter ({data.length})</div>
  ),
}));

vi.mock('@mfe/x-charts/benchmark', () => ({
  downsampleLTTB: (d: ReadonlyArray<unknown>) => d.slice(0, 50),
  generateUniformScatter: (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  generateClusteredScatter: (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  generateSpikeScatter: (n: number) => ({
    points: Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
    spikeIndices: [],
  }),
  BENCHMARK_TIERS: { medium: 100, large: 200, million: 1000 },
}));

/**
 * The production gate (`isBenchmarkRouteEnabled`) reads from Vite's
 * compile-time-replaced `import.meta.env.PROD` and can't be stubbed
 * at runtime. We test the gate by passing fake envs to the pure
 * `evaluateBenchmarkGate` helper instead, and exercise the rendered
 * UI by relying on the actual Vitest env (`PROD=true`, MODE='test')
 * to land on the disabled banner — then mocking the gate for the
 * "flag on" UI test.
 */

describe('BenchmarkRoute', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('../BenchmarkRoute');
  });

  it('renders the disabled banner under the default Vitest env (PROD=true)', async () => {
    const mod = await import('../BenchmarkRoute');
    const BenchmarkRoute = mod.default;
    render(
      <MemoryRouter>
        <BenchmarkRoute />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('benchmark-disabled')).toBeTruthy();
    // No primary UI surfaces should be present.
    expect(screen.queryByTestId('benchmark-route')).toBeNull();
  });

  it('renders the disabled banner when the flag is off via stubEnv', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'false');
    vi.stubEnv('MODE', 'development');
    const mod = await import('../BenchmarkRoute');
    const BenchmarkRoute = mod.default;
    render(
      <MemoryRouter>
        <BenchmarkRoute />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('benchmark-disabled')).toBeTruthy();
  });

  // The "harness UI mounts" check lives in the Playwright smoke at
  // `tests/playwright/design-lab.benchmark-smoke.spec.ts`. Vite's
  // build-time `import.meta.env.PROD` replacement makes it impossible
  // to flip the gate inside Vitest at runtime, so the gate is unit-
  // tested via the pure {@link evaluateBenchmarkGate} surface below.

  it('exposes resultsToCsv with the schema-v2 header columns', async () => {
    const { resultsToCsv } = await import('../BenchmarkRoute');
    const csv = resultsToCsv([
      {
        runId: 'r1',
        runIndex: 1,
        fixture: 'uniform',
        tier: 'medium',
        backend: 'canvas-raw',
        sourceCount: 100,
        renderedCount: 100,
        prepMs: 1.5,
        renderMs: 5.0,
        routeRenderMs: 6.2,
        settledSource: 'finished',
        fixtureGenerateMs: 0.4,
        fixtureCacheHit: false,
        fpsAvg: 60,
        fpsP95DropPct: 0,
        heapBeforeMB: null,
        heapAfterMB: null,
        memoryAvailable: false,
        browser: 'chrome',
        viewport: '800x600',
        timestamp: '2026-05-10T00:00:00Z',
      },
    ]);
    const lines = csv.split('\n');
    // v1 columns kept for parity
    expect(lines[0]).toContain('runId');
    expect(lines[0]).toContain('runIndex');
    expect(lines[0]).toContain('fixture');
    expect(lines[0]).toContain('renderMs');
    expect(lines[0]).toContain('lttbCaveat');
    // v2 additions (PR-A1.6b)
    expect(lines[0]).toContain('routeRenderMs');
    expect(lines[0]).toContain('settledSource');
    expect(lines[0]).toContain('fixtureGenerateMs');
    expect(lines[0]).toContain('fixtureCacheHit');
    expect(lines[0]).toContain('glImportStatus');
    expect(lines[0]).toContain('unsafe');
    // body row
    expect(lines[1]).toContain('r1');
    expect(lines[1]).toContain('uniform');
    expect(lines[1]).toContain('canvas-raw');
    expect(lines[1]).toContain('finished');
  });

  it('buildArtifact wraps results with schema-v2 header + summary', async () => {
    const { buildArtifact, BENCHMARK_SCHEMA_VERSION, RUN_COUNTS_BY_TIER } =
      await import('../BenchmarkRoute');
    expect(BENCHMARK_SCHEMA_VERSION).toBe('design-lab-scatter-benchmark.v2');
    const env = {
      browser: 'chrome',
      userAgent: 'mock',
      viewport: '800x600',
      memoryApi: 'unavailable',
      route: '/admin/design-lab/benchmark',
      measurementMode: 'echarts-finished-2raf' as const,
      runCounts: RUN_COUNTS_BY_TIER,
      notes: [],
    };
    const fakeResults = [
      {
        runId: 'r1',
        runIndex: 1,
        fixture: 'uniform' as const,
        tier: 'medium' as const,
        backend: 'canvas-raw' as const,
        sourceCount: 100,
        renderedCount: 100,
        prepMs: 1,
        renderMs: 4,
        fpsAvg: 60,
        fpsP95DropPct: 0,
        heapBeforeMB: null,
        heapAfterMB: null,
        memoryAvailable: false,
        browser: 'chrome',
        viewport: '800x600',
        timestamp: '2026-05-10T00:00:00Z',
      },
      {
        runId: 'r1',
        runIndex: 2,
        fixture: 'uniform' as const,
        tier: 'medium' as const,
        backend: 'canvas-raw' as const,
        sourceCount: 100,
        renderedCount: 100,
        prepMs: 1,
        renderMs: 6,
        fpsAvg: 60,
        fpsP95DropPct: 0,
        heapBeforeMB: null,
        heapAfterMB: null,
        memoryAvailable: false,
        browser: 'chrome',
        viewport: '800x600',
        timestamp: '2026-05-10T00:00:00Z',
      },
    ];
    const artifact = buildArtifact('r1', env, fakeResults);
    expect(artifact.schemaVersion).toBe(BENCHMARK_SCHEMA_VERSION);
    expect(artifact.environment.measurementMode).toBe('echarts-finished-2raf');
    expect(artifact.environment.runCounts.million.measured).toBe(5);
    expect(artifact.results).toHaveLength(2);
    expect(artifact.summary.medianRenderMsByCase['uniform/medium/canvas-raw']).toBe(5);
    expect(artifact.summary.bestRenderMsByCase['uniform/medium/canvas-raw']).toBe(4);
  });

  it('evaluateBenchmarkGate is closed when MODE is production', async () => {
    const { evaluateBenchmarkGate } = await import('../BenchmarkRoute');
    expect(
      evaluateBenchmarkGate({
        VITE_ENABLE_DESIGN_LAB_BENCHMARK: 'true',
        MODE: 'production',
        PROD: true,
        DEV: false,
      }),
    ).toBe(false);
  });

  it('evaluateBenchmarkGate is closed when PROD=true even with non-production MODE', async () => {
    const { evaluateBenchmarkGate } = await import('../BenchmarkRoute');
    // Mirrors `vite build --mode staging` — MODE='staging' but PROD=true.
    expect(
      evaluateBenchmarkGate({
        VITE_ENABLE_DESIGN_LAB_BENCHMARK: 'true',
        MODE: 'staging',
        PROD: true,
        DEV: false,
      }),
    ).toBe(false);
  });

  it('evaluateBenchmarkGate is closed when the flag is missing', async () => {
    const { evaluateBenchmarkGate } = await import('../BenchmarkRoute');
    expect(
      evaluateBenchmarkGate({
        MODE: 'development',
        PROD: false,
        DEV: true,
      }),
    ).toBe(false);
  });

  it('evaluateBenchmarkGate is OPEN only when flag=true and PROD/MODE both non-production', async () => {
    const { evaluateBenchmarkGate } = await import('../BenchmarkRoute');
    expect(
      evaluateBenchmarkGate({
        VITE_ENABLE_DESIGN_LAB_BENCHMARK: 'true',
        MODE: 'development',
        PROD: false,
        DEV: true,
      }),
    ).toBe(true);
  });
});
