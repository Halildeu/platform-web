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
  BENCHMARK_TIERS: { medium: 100, large: 200 },
}));

describe('BenchmarkRoute', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the disabled banner when the flag is off', async () => {
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
    // No primary UI surfaces should be present.
    expect(screen.queryByTestId('benchmark-route')).toBeNull();
  });

  it('renders the disabled banner when MODE is production even if flag is on', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'true');
    vi.stubEnv('MODE', 'production');
    const mod = await import('../BenchmarkRoute');
    const BenchmarkRoute = mod.default;
    render(
      <MemoryRouter>
        <BenchmarkRoute />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('benchmark-disabled')).toBeTruthy();
  });

  it('renders the main UI when the flag is on in non-production mode', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'true');
    vi.stubEnv('MODE', 'development');
    const mod = await import('../BenchmarkRoute');
    const BenchmarkRoute = mod.default;
    render(
      <MemoryRouter>
        <BenchmarkRoute />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('benchmark-route')).toBeTruthy();
    expect(screen.getByTestId('benchmark-run')).toBeTruthy();
    expect(screen.getByTestId('benchmark-reset')).toBeTruthy();
    expect(screen.getByTestId('benchmark-progress')).toBeTruthy();
    expect(screen.getByTestId('benchmark-results-empty')).toBeTruthy();
    expect(screen.getByTestId('benchmark-export-bar')).toBeTruthy();
  });

  it('exposes resultsToCsv with the correct header schema', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'true');
    vi.stubEnv('MODE', 'development');
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
    expect(lines[0]).toContain('runId');
    expect(lines[0]).toContain('runIndex');
    expect(lines[0]).toContain('fixture');
    expect(lines[0]).toContain('renderMs');
    expect(lines[0]).toContain('lttbCaveat');
    expect(lines[1]).toContain('r1');
    expect(lines[1]).toContain('uniform');
    expect(lines[1]).toContain('canvas-raw');
  });

  it('buildArtifact wraps results with schemaVersion + summary', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'true');
    vi.stubEnv('MODE', 'development');
    const { buildArtifact, BENCHMARK_SCHEMA_VERSION } = await import('../BenchmarkRoute');
    const env = {
      browser: 'chrome',
      userAgent: 'mock',
      viewport: '800x600',
      memoryApi: 'unavailable',
      route: '/admin/design-lab/benchmark',
      warmupRuns: 1,
      measuredRuns: 3,
      notes: [],
    };
    const fakeResults = [
      {
        runId: 'r1',
        runIndex: 1 as 1 | 2 | 3,
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
        runIndex: 2 as 1 | 2 | 3,
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
    expect(artifact.results).toHaveLength(2);
    expect(artifact.summary.medianRenderMsByCase['uniform/medium/canvas-raw']).toBe(5);
    expect(artifact.summary.bestRenderMsByCase['uniform/medium/canvas-raw']).toBe(4);
  });

  it('isBenchmarkRouteEnabled returns false when MODE is production', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'true');
    vi.stubEnv('MODE', 'production');
    const { isBenchmarkRouteEnabled } = await import('../BenchmarkRoute');
    expect(isBenchmarkRouteEnabled()).toBe(false);
  });

  it('isBenchmarkRouteEnabled returns true when flag=true and MODE is development', async () => {
    vi.stubEnv('VITE_ENABLE_DESIGN_LAB_BENCHMARK', 'true');
    vi.stubEnv('MODE', 'development');
    const { isBenchmarkRouteEnabled } = await import('../BenchmarkRoute');
    expect(isBenchmarkRouteEnabled()).toBe(true);
  });
});
