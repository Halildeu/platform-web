/**
 * BenchmarkRoute — Faz 21.11 PR-A1.6a
 *
 * Internal performance harness for the ScatterChart big-data renderer
 * routing path (PR-A1 / PR-A1.5 land). Lets a developer (or a
 * Playwright smoke spec) run the same scatter fixture across three
 * backends and produce a CSV + JSON artifact:
 *
 *   - canvas-raw  — original points, ScatterChart `renderer="canvas"`
 *   - canvas-lttb — points downsampled via {@link downsampleLTTB} (sorted
 *                   by x first; semantic caveat surfaced in the result),
 *                   then ScatterChart `renderer="canvas"`
 *   - webgl       — original points, ScatterChart `renderer="webgl"`
 *                   (lazy `echarts-gl` import, cold-start visible in
 *                    the first WebGL run's renderMs)
 *
 * A1.6a scope (Codex thread `019e0efb` iter-2 AGREE):
 *   - Default tiers: medium (50K) + large (250K). 1M is PR-A1.6b.
 *   - Fixtures: uniform / clustered / spike (timeseries deferred).
 *   - 1 warmup run + 3 measured runs per (fixture, tier, backend).
 *   - 250K canvas-raw soft timeout (5s). 1M canvas-raw `?danger=true`
 *     unlock — left as a stub here; not in default matrix.
 *   - Render-time = double-rAF after mount (route-level proxy; ECharts
 *     `finished` callback hook deferred to PR-A1.6b).
 *   - Result schema: see {@link BenchmarkResult}.
 *
 * Route is gated behind `VITE_ENABLE_DESIGN_LAB_BENCHMARK=true` AND
 * `MODE !== 'production'`. Sidebar entry deliberately not registered
 * — deep-link `/admin/design-lab/benchmark` only.
 *
 * Acceptance (A1.6a):
 *   - Flag-on route mounts; flag-off route renders guard banner.
 *   - 50K uniform canvas-raw run produces ≥1 row.
 *   - JSON download contains `schemaVersion: 'design-lab-scatter-benchmark.v1'`.
 *   - No static `import 'echarts-gl'` (bundle-guard invariant intact).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScatterChart } from '@mfe/x-charts';
import {
  downsampleLTTB,
  generateUniformScatter,
  generateClusteredScatter,
  generateSpikeScatter,
  BENCHMARK_TIERS,
  type BenchmarkPoint2D,
  type BenchmarkTier,
} from '@mfe/x-charts/benchmark';

/* ------------------------------------------------------------------ */
/*  Constants & schema                                                 */
/* ------------------------------------------------------------------ */

export const BENCHMARK_SCHEMA_VERSION = 'design-lab-scatter-benchmark.v1';
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
const LTTB_TARGET_POINTS = 2000;
const FPS_WINDOW_MS = 3_000;
const CANVAS_RAW_LARGE_SOFT_TIMEOUT_MS = 5_000;
const FRAME_DROP_THRESHOLD_MS = 32; // ~ skipped one 60Hz frame

export type BenchmarkFixtureName = 'uniform' | 'clustered' | 'spike';
export type BenchmarkTierName = Extract<BenchmarkTier, 'medium' | 'large'>;
export type BenchmarkBackend = 'canvas-raw' | 'canvas-lttb' | 'webgl';
export type BenchmarkAbortReason = 'timeout' | 'webgl-unavailable' | 'manual-skip';

export interface BenchmarkResult {
  runId: string;
  runIndex: 1 | 2 | 3;
  fixture: BenchmarkFixtureName;
  tier: BenchmarkTierName;
  backend: BenchmarkBackend;
  sourceCount: number;
  renderedCount: number;
  prepMs: number;
  renderMs: number;
  fpsAvg: number;
  fpsP95DropPct: number;
  heapBeforeMB: number | null;
  heapAfterMB: number | null;
  memoryAvailable: boolean;
  browser: string;
  viewport: string;
  timestamp: string;
  aborted?: boolean;
  abortReason?: BenchmarkAbortReason;
  gcSuspected?: boolean;
  glImportMs?: number;
  webglSupported?: boolean;
  rendererReason?: string;
  sampleStrategy?: 'none' | 'lttb-x-sorted';
  lttbCaveat?: 'scatter-sorted-by-x';
}

export interface BenchmarkArtifact {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  runId: string;
  environment: {
    browser: string;
    userAgent: string;
    viewport: string;
    memoryApi: string;
    route: string;
    warmupRuns: number;
    measuredRuns: number;
    notes: string[];
  };
  summary: {
    medianRenderMsByCase: Record<string, number>;
    bestRenderMsByCase: Record<string, number>;
  };
  results: BenchmarkResult[];
}

interface BenchmarkCase {
  id: string;
  fixture: BenchmarkFixtureName;
  tier: BenchmarkTierName;
  backend: BenchmarkBackend;
  runIndex: 1 | 2 | 3;
  isWarmup: boolean;
}

interface ScatterPreparedData {
  points: BenchmarkPoint2D[];
  prepMs: number;
  renderedCount: number;
  sourceCount: number;
  sampleStrategy: 'none' | 'lttb-x-sorted';
  lttbCaveat?: 'scatter-sorted-by-x';
}

/* ------------------------------------------------------------------ */
/*  Feature flag                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fail-closed: the route only mounts when the flag is explicitly
 * "true" AND the Vite mode is not "production". This protects against
 * accidental flag leaks into a production .env.
 */
export function isBenchmarkRouteEnabled(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_ENABLE_DESIGN_LAB_BENCHMARK === 'true' && env.MODE !== 'production';
}

/* ------------------------------------------------------------------ */
/*  Environment / memory snapshots                                     */
/* ------------------------------------------------------------------ */

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'chrome';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua)) return 'safari';
  return 'unknown';
}

function snapshotEnvironment(): BenchmarkArtifact['environment'] {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'node';
  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '0x0';
  const perfMemory = (
    typeof performance !== 'undefined'
      ? (performance as Performance & { memory?: unknown }).memory
      : undefined
  ) as { usedJSHeapSize?: number } | undefined;
  return {
    browser: detectBrowser(ua),
    userAgent: ua,
    viewport,
    memoryApi:
      perfMemory && typeof perfMemory.usedJSHeapSize === 'number'
        ? 'chromium-performance-memory'
        : 'unavailable',
    route: '/admin/design-lab/benchmark',
    warmupRuns: WARMUP_RUNS,
    measuredRuns: MEASURED_RUNS,
    notes: [
      'render-time measured route-level (mount → 2x rAF), ECharts finished hook deferred to PR-A1.6b',
      'memoryApi=chromium-performance-memory is JS heap only; GPU buffers not included',
      'canvas-lttb sample is x-sorted before LTTB; semantic caveat in lttbCaveat field',
    ],
  };
}

function snapshotMemoryMB(): { heapMB: number | null; available: boolean } {
  const perf =
    (typeof performance !== 'undefined'
      ? (performance as Performance & { memory?: { usedJSHeapSize?: number } })
      : null) ?? null;
  const used = perf?.memory?.usedJSHeapSize;
  if (typeof used === 'number') {
    return { heapMB: used / 1024 / 1024, available: true };
  }
  return { heapMB: null, available: false };
}

/* ------------------------------------------------------------------ */
/*  Fixture preparation (fixture × tier → BenchmarkPoint2D[])         */
/* ------------------------------------------------------------------ */

function buildFixturePoints(
  fixture: BenchmarkFixtureName,
  tier: BenchmarkTierName,
): BenchmarkPoint2D[] {
  const n = BENCHMARK_TIERS[tier];
  if (fixture === 'uniform') return generateUniformScatter(n);
  if (fixture === 'clustered') return generateClusteredScatter(n);
  // spike returns { points, spikeIndices } — only the points stream is
  // needed for the render harness; spike recall is a PR-A2 KPI.
  return generateSpikeScatter(n).points;
}

function applyLttbForCanvas(
  points: BenchmarkPoint2D[],
  targetCount: number,
): { downsampled: BenchmarkPoint2D[] } {
  // Sort by x first — `downsampleLTTB` assumes a monotonic series, and
  // raw scatter fixtures are not. The result preserves shape after the
  // x-sort projection, but loses the "scatter cloud" visual identity.
  // We surface this in the result row's `lttbCaveat` field.
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const out = downsampleLTTB(sorted, targetCount);
  return { downsampled: out.map((p) => ({ x: p.x, y: p.y })) };
}

function preparePoints(
  fixture: BenchmarkFixtureName,
  tier: BenchmarkTierName,
  backend: BenchmarkBackend,
): ScatterPreparedData {
  const t0 = performance.now();
  const source = buildFixturePoints(fixture, tier);
  let rendered = source;
  let sampleStrategy: 'none' | 'lttb-x-sorted' = 'none';
  let lttbCaveat: 'scatter-sorted-by-x' | undefined;
  if (backend === 'canvas-lttb') {
    const { downsampled } = applyLttbForCanvas(source, LTTB_TARGET_POINTS);
    rendered = downsampled;
    sampleStrategy = 'lttb-x-sorted';
    lttbCaveat = 'scatter-sorted-by-x';
  }
  const prepMs = performance.now() - t0;
  return {
    points: rendered,
    prepMs,
    renderedCount: rendered.length,
    sourceCount: source.length,
    sampleStrategy,
    lttbCaveat,
  };
}

/* ------------------------------------------------------------------ */
/*  FPS measurement (idle window after render)                         */
/* ------------------------------------------------------------------ */

interface FpsResult {
  fpsAvg: number;
  fpsP95DropPct: number;
  gcSuspected: boolean;
}

function measureFps(durationMs: number): Promise<FpsResult> {
  return new Promise((resolve) => {
    const frames: number[] = [];
    let lastT = performance.now();
    const start = lastT;
    const tick = (now: number) => {
      const dt = now - lastT;
      frames.push(dt);
      lastT = now;
      if (now - start < durationMs) {
        requestAnimationFrame(tick);
        return;
      }
      const totalDt = frames.reduce((s, x) => s + x, 0);
      const fpsAvg = frames.length === 0 ? 0 : 1000 / (totalDt / frames.length);
      const droppedFrames = frames.filter((f) => f > FRAME_DROP_THRESHOLD_MS).length;
      const fpsP95DropPct = frames.length === 0 ? 0 : (droppedFrames / frames.length) * 100;
      // gcSuspected if any frame > 200ms (a generational GC pause)
      const gcSuspected = frames.some((f) => f > 200);
      resolve({ fpsAvg, fpsP95DropPct, gcSuspected });
    };
    requestAnimationFrame(tick);
  });
}

/* ------------------------------------------------------------------ */
/*  Summary aggregation                                                */
/* ------------------------------------------------------------------ */

function caseKey(r: { fixture: string; tier: string; backend: string }): string {
  return `${r.fixture}/${r.tier}/${r.backend}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeSummary(results: BenchmarkResult[]): BenchmarkArtifact['summary'] {
  const groups = new Map<string, number[]>();
  for (const r of results) {
    if (r.aborted) continue;
    const key = caseKey(r);
    const arr = groups.get(key) ?? [];
    arr.push(r.renderMs);
    groups.set(key, arr);
  }
  const medianRenderMsByCase: Record<string, number> = {};
  const bestRenderMsByCase: Record<string, number> = {};
  for (const [key, arr] of groups) {
    medianRenderMsByCase[key] = Number(median(arr).toFixed(2));
    bestRenderMsByCase[key] = Number(Math.min(...arr).toFixed(2));
  }
  return { medianRenderMsByCase, bestRenderMsByCase };
}

/* ------------------------------------------------------------------ */
/*  Export helpers                                                     */
/* ------------------------------------------------------------------ */

const RESULT_COLUMNS: ReadonlyArray<keyof BenchmarkResult> = [
  'runId',
  'runIndex',
  'fixture',
  'tier',
  'backend',
  'sourceCount',
  'renderedCount',
  'prepMs',
  'renderMs',
  'fpsAvg',
  'fpsP95DropPct',
  'heapBeforeMB',
  'heapAfterMB',
  'memoryAvailable',
  'browser',
  'viewport',
  'timestamp',
  'aborted',
  'abortReason',
  'gcSuspected',
  'glImportMs',
  'webglSupported',
  'rendererReason',
  'sampleStrategy',
  'lttbCaveat',
];

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function resultsToCsv(results: BenchmarkResult[]): string {
  const header = RESULT_COLUMNS.join(',');
  const rows = results.map((r) =>
    RESULT_COLUMNS.map((k) => csvEscape((r as unknown as Record<string, unknown>)[k])).join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildArtifact(
  runId: string,
  environment: BenchmarkArtifact['environment'],
  results: BenchmarkResult[],
): BenchmarkArtifact {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    runId,
    environment,
    summary: computeSummary(results),
    results,
  };
}

function downloadBlob(filename: string, content: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Render slot — single chart instance, controlled by runner          */
/* ------------------------------------------------------------------ */

interface RenderSlotProps {
  data: BenchmarkPoint2D[];
  rendererProp: 'canvas' | 'webgl';
  onRendered: (event: { renderMs: number; rendererReason?: string }) => void;
}

/**
 * Mounts a single ScatterChart, measures route-level renderMs (mount
 * → DOM commit → 2x rAF settle), then invokes onRendered. Re-renders
 * are forced via the `runKey` prop on the parent.
 */
const RenderSlot: React.FC<RenderSlotProps> = ({ data, rendererProp, onRendered }) => {
  const startedAtRef = useRef<number>(performance.now());
  const reportedRef = useRef<boolean>(false);
  const rendererReasonRef = useRef<string | undefined>(undefined);

  // Reset start mark every mount cycle.
  startedAtRef.current = performance.now();
  reportedRef.current = false;

  useEffect(() => {
    let frame1: number | null = null;
    let frame2: number | null = null;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        const renderMs = performance.now() - startedAtRef.current;
        onRendered({ renderMs, rendererReason: rendererReasonRef.current });
      });
    });
    return () => {
      if (frame1 !== null) cancelAnimationFrame(frame1);
      if (frame2 !== null) cancelAnimationFrame(frame2);
    };
    // Mount-once measurement: onRendered is intentionally not a dep
    // — the parent re-mounts the slot via `key={runKey}` for each new
    // case, so a fresh closure already lands on every cycle.
  }, []);

  const fallbackHandler = useCallback((event: { from: string; to: string; reason: string }) => {
    rendererReasonRef.current = `fallback:${event.from}->${event.to}:${event.reason}`;
  }, []);

  // BenchmarkPoint2D matches the ScatterDataPoint contract (`{x, y}`)
  // so we pass the array straight through — no extra mapping cost in
  // the measured render window.
  return (
    <div
      data-testid="benchmark-render-slot"
      style={{ width: 600, height: 400, border: '1px solid var(--color-border-subtle)' }}
    >
      <ScatterChart
        data={data}
        renderer={rendererProp}
        onRendererFallback={fallbackHandler}
        animate={false}
        size="lg"
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Runner state machine                                               */
/* ------------------------------------------------------------------ */

function buildCaseQueue(
  fixtures: BenchmarkFixtureName[],
  tiers: BenchmarkTierName[],
  backends: BenchmarkBackend[],
): BenchmarkCase[] {
  const queue: BenchmarkCase[] = [];
  for (const fixture of fixtures) {
    for (const tier of tiers) {
      for (const backend of backends) {
        // 1 warmup
        queue.push({
          id: `${fixture}-${tier}-${backend}-warmup`,
          fixture,
          tier,
          backend,
          runIndex: 1,
          isWarmup: true,
        });
        // 3 measured
        for (let i = 1; i <= MEASURED_RUNS; i++) {
          queue.push({
            id: `${fixture}-${tier}-${backend}-m${i}`,
            fixture,
            tier,
            backend,
            runIndex: i as 1 | 2 | 3,
            isWarmup: false,
          });
        }
      }
    }
  }
  return queue;
}

interface RunnerHookOptions {
  fixtures: BenchmarkFixtureName[];
  tiers: BenchmarkTierName[];
  backends: BenchmarkBackend[];
  measureFpsFn?: (durationMs: number) => Promise<FpsResult>;
}

interface RunnerHookState {
  results: BenchmarkResult[];
  isRunning: boolean;
  progress: { done: number; total: number };
  currentCase: BenchmarkCase | null;
  preparedData: ScatterPreparedData | null;
  start: () => void;
  reset: () => void;
  /**
   * Bound to {@link RenderSlot} `onRendered`. The runner uses this to
   * advance its internal cursor — exposed on the return shape so the
   * route component can forward it without an out-of-band channel.
   */
  handleRendered: (info: { renderMs: number; rendererReason?: string }) => void;
}

function useScatterBenchmarkRunner(opts: RunnerHookOptions): RunnerHookState {
  const measureFn = opts.measureFpsFn ?? measureFps;
  const [queue, setQueue] = useState<BenchmarkCase[]>([]);
  const [cursor, setCursor] = useState<number>(-1);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [preparedData, setPreparedData] = useState<ScatterPreparedData | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const runIdRef = useRef<string>('');

  const start = useCallback(() => {
    const newQueue = buildCaseQueue(opts.fixtures, opts.tiers, opts.backends);
    runIdRef.current = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setQueue(newQueue);
    setCursor(0);
    setResults([]);
    setPreparedData(null);
    setIsRunning(true);
  }, [opts.fixtures, opts.tiers, opts.backends]);

  const reset = useCallback(() => {
    setQueue([]);
    setCursor(-1);
    setResults([]);
    setPreparedData(null);
    setIsRunning(false);
  }, []);

  // When cursor changes, prepare data for the next case
  useEffect(() => {
    if (!isRunning || cursor < 0 || cursor >= queue.length) return;
    const c = queue[cursor];
    const prepared = preparePoints(c.fixture, c.tier, c.backend);
    setPreparedData(prepared);
  }, [cursor, queue, isRunning]);

  // RenderSlot's onRendered fires `handleRendered` via context below
  const handleRendered = useCallback(
    async (info: { renderMs: number; rendererReason?: string }) => {
      if (!isRunning || cursor < 0 || cursor >= queue.length || !preparedData) return;
      const c = queue[cursor];
      const heapBefore = snapshotMemoryMB();
      const fps = await measureFn(FPS_WINDOW_MS);
      const heapAfter = snapshotMemoryMB();

      // Soft timeout: 250K canvas-raw. Mark aborted but still record.
      const isOverBudget =
        c.tier === 'large' &&
        c.backend === 'canvas-raw' &&
        info.renderMs > CANVAS_RAW_LARGE_SOFT_TIMEOUT_MS;

      if (!c.isWarmup) {
        const env = snapshotEnvironment();
        const result: BenchmarkResult = {
          runId: runIdRef.current,
          runIndex: c.runIndex,
          fixture: c.fixture,
          tier: c.tier,
          backend: c.backend,
          sourceCount: preparedData.sourceCount,
          renderedCount: preparedData.renderedCount,
          prepMs: Number(preparedData.prepMs.toFixed(2)),
          renderMs: Number(info.renderMs.toFixed(2)),
          fpsAvg: Number(fps.fpsAvg.toFixed(2)),
          fpsP95DropPct: Number(fps.fpsP95DropPct.toFixed(2)),
          heapBeforeMB: heapBefore.heapMB === null ? null : Number(heapBefore.heapMB.toFixed(2)),
          heapAfterMB: heapAfter.heapMB === null ? null : Number(heapAfter.heapMB.toFixed(2)),
          memoryAvailable: heapBefore.available,
          browser: env.browser,
          viewport: env.viewport,
          timestamp: new Date().toISOString(),
          aborted: isOverBudget || undefined,
          abortReason: isOverBudget ? 'timeout' : undefined,
          gcSuspected: fps.gcSuspected || undefined,
          rendererReason: info.rendererReason,
          sampleStrategy: preparedData.sampleStrategy,
          lttbCaveat: preparedData.lttbCaveat,
        };
        setResults((prev) => [...prev, result]);
      }

      // Advance cursor
      const next = cursor + 1;
      if (next >= queue.length) {
        setIsRunning(false);
        setPreparedData(null);
      } else {
        setCursor(next);
      }
    },
    [isRunning, cursor, queue, preparedData, measureFn],
  );

  // Expose hook value with handleRendered as part of the contract so
  // the route component does not need an out-of-band channel.
  return useMemo<RunnerHookState>(
    () => ({
      results,
      isRunning,
      progress: { done: cursor < 0 ? 0 : Math.min(cursor, queue.length), total: queue.length },
      currentCase: cursor < 0 || cursor >= queue.length ? null : queue[cursor],
      preparedData,
      start,
      reset,
      handleRendered,
    }),
    [results, isRunning, cursor, queue, preparedData, start, reset, handleRendered],
  );
}

/* ------------------------------------------------------------------ */
/*  UI sub-components                                                  */
/* ------------------------------------------------------------------ */

const ALL_FIXTURES: BenchmarkFixtureName[] = ['uniform', 'clustered', 'spike'];
const ALL_TIERS: BenchmarkTierName[] = ['medium', 'large'];
const ALL_BACKENDS: BenchmarkBackend[] = ['canvas-raw', 'canvas-lttb', 'webgl'];

interface ConfigPanelProps {
  fixtures: BenchmarkFixtureName[];
  tiers: BenchmarkTierName[];
  backends: BenchmarkBackend[];
  onChangeFixtures: (next: BenchmarkFixtureName[]) => void;
  onChangeTiers: (next: BenchmarkTierName[]) => void;
  onChangeBackends: (next: BenchmarkBackend[]) => void;
  isRunning: boolean;
  onStart: () => void;
  onReset: () => void;
}

function toggleSet<T>(set: T[], item: T): T[] {
  return set.includes(item) ? set.filter((x) => x !== item) : [...set, item];
}

const BenchmarkConfigPanel: React.FC<ConfigPanelProps> = ({
  fixtures,
  tiers,
  backends,
  onChangeFixtures,
  onChangeTiers,
  onChangeBackends,
  isRunning,
  onStart,
  onReset,
}) => {
  return (
    <section
      aria-label="benchmark-config"
      style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 16 }}
    >
      <fieldset>
        <legend>Fixtures</legend>
        {ALL_FIXTURES.map((f) => (
          <label key={f} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={fixtures.includes(f)}
              onChange={() => onChangeFixtures(toggleSet(fixtures, f))}
              disabled={isRunning}
            />{' '}
            {f}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Tiers</legend>
        {ALL_TIERS.map((t) => (
          <label key={t} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tiers.includes(t)}
              onChange={() => onChangeTiers(toggleSet(tiers, t))}
              disabled={isRunning}
            />{' '}
            {t} ({BENCHMARK_TIERS[t].toLocaleString()} pts)
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Backends</legend>
        {ALL_BACKENDS.map((b) => (
          <label key={b} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={backends.includes(b)}
              onChange={() => onChangeBackends(toggleSet(backends, b))}
              disabled={isRunning}
            />{' '}
            {b}
          </label>
        ))}
      </fieldset>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-end' }}>
        <button
          type="button"
          onClick={onStart}
          disabled={
            isRunning || fixtures.length === 0 || tiers.length === 0 || backends.length === 0
          }
          data-testid="benchmark-run"
        >
          {isRunning ? 'Running…' : 'Run benchmark'}
        </button>
        <button type="button" onClick={onReset} disabled={isRunning} data-testid="benchmark-reset">
          Reset
        </button>
      </div>
    </section>
  );
};

interface ResultsTableProps {
  results: BenchmarkResult[];
}

const BenchmarkResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  if (results.length === 0) {
    return (
      <p data-testid="benchmark-results-empty" style={{ padding: 16 }}>
        No measured results yet — pick a matrix and click "Run benchmark".
      </p>
    );
  }
  return (
    <div data-testid="benchmark-results-table" style={{ overflowX: 'auto', padding: 16 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 1200 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>fixture</th>
            <th style={{ textAlign: 'left' }}>tier</th>
            <th style={{ textAlign: 'left' }}>backend</th>
            <th>run</th>
            <th>renderMs</th>
            <th>prepMs</th>
            <th>fpsAvg</th>
            <th>p95Drop%</th>
            <th>sourceCount</th>
            <th>renderedCount</th>
            <th>heapΔ MB</th>
            <th>aborted</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const heapDelta =
              r.heapBeforeMB !== null && r.heapAfterMB !== null
                ? (r.heapAfterMB - r.heapBeforeMB).toFixed(2)
                : '—';
            return (
              <tr key={`${r.runId}-${r.fixture}-${r.tier}-${r.backend}-${r.runIndex}`}>
                <td>{r.fixture}</td>
                <td>{r.tier}</td>
                <td>{r.backend}</td>
                <td>{r.runIndex}</td>
                <td style={{ textAlign: 'right' }}>{r.renderMs.toFixed(1)}</td>
                <td style={{ textAlign: 'right' }}>{r.prepMs.toFixed(1)}</td>
                <td style={{ textAlign: 'right' }}>{r.fpsAvg.toFixed(1)}</td>
                <td style={{ textAlign: 'right' }}>{r.fpsP95DropPct.toFixed(1)}</td>
                <td style={{ textAlign: 'right' }}>{r.sourceCount.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.renderedCount.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{heapDelta}</td>
                <td>{r.aborted ? r.abortReason : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

interface ExportBarProps {
  results: BenchmarkResult[];
  artifact: BenchmarkArtifact | null;
}

const BenchmarkExportBar: React.FC<ExportBarProps> = ({ results, artifact }) => {
  const filenameStub = useMemo(() => `benchmark-${Date.now()}`, []);
  return (
    <div style={{ display: 'flex', gap: 8, padding: 16 }} data-testid="benchmark-export-bar">
      <button
        type="button"
        disabled={results.length === 0}
        onClick={() => downloadBlob(`${filenameStub}.csv`, resultsToCsv(results), 'text/csv')}
        data-testid="benchmark-export-csv"
      >
        Download CSV ({results.length} rows)
      </button>
      <button
        type="button"
        disabled={!artifact}
        onClick={() => {
          if (!artifact) return;
          downloadBlob(
            `${filenameStub}.json`,
            JSON.stringify(artifact, null, 2),
            'application/json',
          );
        }}
        data-testid="benchmark-export-json"
      >
        Download JSON artifact
      </button>
      <button
        type="button"
        disabled={results.length === 0}
        onClick={() => {
          console.table(results);
        }}
        data-testid="benchmark-console-log"
      >
        console.table
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main route component                                               */
/* ------------------------------------------------------------------ */

const BenchmarkRoute: React.FC = () => {
  if (!isBenchmarkRouteEnabled()) {
    return (
      <main data-testid="benchmark-disabled" style={{ padding: 24, fontFamily: 'monospace' }}>
        <h1>Benchmark route disabled</h1>
        <p>
          Set <code>VITE_ENABLE_DESIGN_LAB_BENCHMARK=true</code> in a non-production Vite
          environment to enable the scatter performance harness.
        </p>
      </main>
    );
  }

  const [fixtures, setFixtures] = useState<BenchmarkFixtureName[]>(['uniform']);
  const [tiers, setTiers] = useState<BenchmarkTierName[]>(['medium']);
  const [backends, setBackends] = useState<BenchmarkBackend[]>(['canvas-raw']);

  const runner = useScatterBenchmarkRunner({ fixtures, tiers, backends });

  const env = useMemo(() => snapshotEnvironment(), []);
  const artifact = useMemo<BenchmarkArtifact | null>(() => {
    if (runner.results.length === 0) return null;
    return buildArtifact(runner.results[0].runId, env, runner.results);
  }, [runner.results, env]);

  const currentCase = runner.currentCase;
  const renderSlotKey = currentCase
    ? `${currentCase.id}-${runner.preparedData?.renderedCount ?? 0}`
    : 'idle';

  return (
    <main data-testid="benchmark-route" style={{ padding: 24 }}>
      <header>
        <h1>x-charts ScatterChart Benchmark Harness (PR-A1.6a)</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Internal harness — Chromium-measured. JS heap only. Render-time is route-level (mount → 2×
          rAF). PR-A1.6b will add the 1M tier + Playwright artifact + the ECharts{' '}
          <code>finished</code> hook for sub-frame precision.
        </p>
      </header>

      <BenchmarkConfigPanel
        fixtures={fixtures}
        tiers={tiers}
        backends={backends}
        onChangeFixtures={setFixtures}
        onChangeTiers={setTiers}
        onChangeBackends={setBackends}
        isRunning={runner.isRunning}
        onStart={runner.start}
        onReset={runner.reset}
      />

      <section
        aria-label="benchmark-progress"
        style={{ padding: 16 }}
        data-testid="benchmark-progress"
      >
        <strong>Progress:</strong> {runner.progress.done}/{runner.progress.total}{' '}
        {currentCase ? (
          <span>
            — current: {currentCase.fixture}/{currentCase.tier}/{currentCase.backend} (
            {currentCase.isWarmup ? 'warmup' : `m${currentCase.runIndex}`})
          </span>
        ) : (
          <span>— idle</span>
        )}
      </section>

      <section
        aria-label="benchmark-render-host"
        style={{ padding: 16 }}
        data-testid="benchmark-render-host"
      >
        {currentCase && runner.preparedData && (
          <RenderSlot
            key={renderSlotKey}
            data={runner.preparedData.points}
            rendererProp={currentCase.backend === 'webgl' ? 'webgl' : 'canvas'}
            onRendered={runner.handleRendered}
          />
        )}
      </section>

      <BenchmarkResultsTable results={runner.results} />
      <BenchmarkExportBar results={runner.results} artifact={artifact} />
    </main>
  );
};

export default BenchmarkRoute;
