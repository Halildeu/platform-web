/**
 * BenchmarkRoute — Faz 21.11 PR-A1.6a (route + harness) + PR-A1.6b
 *                  (1M tier + finished hook + Playwright artifact)
 *
 * Internal performance harness for the ScatterChart big-data
 * renderer routing path (PR-A1 / PR-A1.5 land). Lets a developer
 * (or a Playwright workflow) run the same scatter fixture across
 * three backends and produce a CSV + JSON artifact:
 *
 *   - canvas-raw  — original points, ScatterChart `renderer="canvas"`
 *   - canvas-lttb — points downsampled via {@link downsampleLTTB}
 *                   (sorted by x first; semantic caveat surfaced in
 *                   the result), ScatterChart `renderer="canvas"`
 *   - webgl       — original points, ScatterChart `renderer="webgl"`
 *                   (lazy `echarts-gl` import, cold start tracked in
 *                    the first WebGL run's `glImportMs`)
 *
 * Scope (Codex threads `019e0efb` iter-2 + `019e0f36` iter-1, both AGREE):
 *
 *   Tiers (UI-selectable):
 *     - medium  (50K)   1 warmup + 3 measured
 *     - large   (250K)  1 warmup + 3 measured
 *     - million (1M)    2 warmup + 5 measured
 *
 *   Fixtures: uniform / clustered / spike (timeseries deferred).
 *
 *   Backends: canvas-raw / canvas-lttb / webgl. The combination
 *   `million / canvas-raw` is silently dropped from the matrix
 *   builder unless the user opens `?danger=true` in the URL AND
 *   ticks the unsafe checkbox — the result row then ships with
 *   `unsafe: true` and the artifact env carries `dangerMode: true`.
 *
 *   Render-time:
 *     PR-A1.6b promotes `renderMs` to ECharts `setOption →
 *     finished + 2× rAF` via the renderer hook's
 *     `unstable_onRenderSettled` callback. The route-level
 *     `mount → 2× rAF` proxy still ships as the diagnostic
 *     `routeRenderMs`. If the settled callback never fires within
 *     {@link SETTLED_TIMEOUT_MS} the runner falls back to the route
 *     proxy and reports `settledSource: 'route-level'`.
 *
 *   250K canvas-raw soft timeout (5s) marks the row as aborted but
 *   still records it. WebGL fallback (router downgraded to Canvas)
 *   marks the row as `aborted=true / abortReason='webgl-unavailable'`
 *   so the artifact summary skips it.
 *
 *   Default startup config = "smoke preset"
 *   (`uniform / medium / canvas-raw`, 4 runs in seconds).
 *
 * Route is gated behind ALL THREE of:
 *   - `VITE_ENABLE_DESIGN_LAB_BENCHMARK === 'true'`
 *   - `MODE !== 'production'`
 *   - `import.meta.env.PROD !== true` (catches `vite build --mode
 *     staging` where MODE='staging' but PROD=true)
 *
 * Sidebar entry deliberately not registered — deep-link
 * `/admin/design-lab/benchmark` only.
 *
 * PR-A1.6b acceptance (Codex `019e0f36` iter-2 AGREE, 8 items):
 *   1. Schema v2 artifact (`design-lab-scatter-benchmark.v2`).
 *   2. 1M tier surfaces in the UI; danger-only `million / canvas-raw`.
 *   3. `million / webgl` `renderMs` measured via finished + 2× rAF.
 *   4. `routeRenderMs` / `fixtureGenerateMs` / `prepMs` / `glImportMs`
 *      / `glImportStatus` / `webglSupported` / `runner` metadata
 *      present in the artifact.
 *   5. `million / canvas-lttb` reference is part of the matrix.
 *   6. `million / canvas-raw` only via `?danger=true` + checkbox,
 *      tagged `unsafe = true`.
 *   7. Playwright `workflow_dispatch` job uploads the artifact;
 *      no hard KPI assertion.
 *   8. Out of scope (deferred to A1.6c / A2): scheduled run, public
 *      proof panel, cross-filter / anomaly recall, typed-array data
 *      path, self-hosted threshold gate.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScatterChart } from '@mfe/x-charts';
import type { RendererFallbackEvent, EChartsRenderSettledEvent } from '@mfe/x-charts';
import {
  downsampleLTTB,
  generateUniformScatter,
  generateClusteredScatter,
  generateSpikeScatter,
  BENCHMARK_TIERS,
  isEChartsGLRegistered,
  registerEChartsGL,
  type BenchmarkPoint2D,
  type BenchmarkTier,
} from '@mfe/x-charts/benchmark';

/* ------------------------------------------------------------------ */
/*  Constants & schema                                                 */
/* ------------------------------------------------------------------ */

/**
 * Schema bump from `.v1` to `.v2` (PR-A1.6b):
 *   - `renderMs` semantics changed from route-level (`mount → 2× rAF`)
 *     to ECharts `setOption → finished → 2× rAF`. The route-level
 *     measurement still ships as the diagnostic `routeRenderMs` so
 *     v1 readers can compare numbers; the official metric for CI/KPI
 *     consumption is `renderMs` only.
 *   - New tier `million` (1M points) is reachable through the runner.
 *   - Cold `echarts-gl` import is reported separately via
 *     `glImportMs` / `glImportStatus`.
 *   - `unsafe`, `dangerMode` and the runner metadata block surface
 *     the `?danger=true` opt-in for `million / canvas-raw`.
 *
 * v1 producers (PR-A1.6a `BenchmarkRoute` running today) keep their
 * own `schemaVersion: 'design-lab-scatter-benchmark.v1'` artifact so
 * downstream parsers can branch.
 */
export const BENCHMARK_SCHEMA_VERSION = 'design-lab-scatter-benchmark.v2';
const LTTB_TARGET_POINTS = 2000;
const FPS_WINDOW_MS = 3_000;
const CANVAS_RAW_LARGE_SOFT_TIMEOUT_MS = 5_000;
const FRAME_DROP_THRESHOLD_MS = 32; // ~ skipped one 60Hz frame
const SETTLED_TIMEOUT_MS = 10_000;

/**
 * Per-tier run counts. Codex thread `019e0f36` iter-1: 1M needs more
 * warmup + measured iterations to wash out cold start jitter, but
 * smaller tiers stay at the cheap `1 + 3` shape so the smoke preset
 * still finishes in seconds.
 */
export const RUN_COUNTS_BY_TIER: Record<
  'medium' | 'large' | 'million',
  { warmup: number; measured: number }
> = {
  medium: { warmup: 1, measured: 3 },
  large: { warmup: 1, measured: 3 },
  million: { warmup: 2, measured: 5 },
};

export type BenchmarkFixtureName = 'uniform' | 'clustered' | 'spike';
export type BenchmarkTierName = BenchmarkTier; // 'medium' | 'large' | 'million'
export type BenchmarkBackend = 'canvas-raw' | 'canvas-lttb' | 'webgl';
export type BenchmarkAbortReason =
  | 'timeout'
  | 'webgl-unavailable'
  | 'manual-skip'
  | 'settled-timeout';
export type BenchmarkSettledSource = 'finished' | 'route-level';
export type BenchmarkMeasurementMode = 'echarts-finished-2raf' | 'route-level-2raf';

export interface BenchmarkResult {
  runId: string;
  /**
   * Measured-run index (1..N where N depends on the tier — see
   * {@link RUN_COUNTS_BY_TIER}). Warmup runs are NOT recorded.
   */
  runIndex: number;
  fixture: BenchmarkFixtureName;
  tier: BenchmarkTierName;
  backend: BenchmarkBackend;
  sourceCount: number;
  renderedCount: number;
  /**
   * Backend-prep cost: LTTB downsample work etc. Excludes fixture
   * generation (see `fixtureGenerateMs`).
   */
  prepMs: number;
  /**
   * Official render metric. Schema v2: `setOption → finished + 2 rAF`
   * via `unstable_onRenderSettled`. If the settled callback never
   * fires within {@link SETTLED_TIMEOUT_MS} the runner falls back to
   * the route-level proxy and reports `settledSource: 'route-level'`.
   */
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
  /**
   * Cold `echarts-gl` import time, in milliseconds. Populated only on
   * the first WebGL run inside a fresh browser context. Subsequent
   * WebGL runs report `glImportStatus: 'already-registered'`.
   */
  glImportMs?: number;
  glImportStatus?: 'cold' | 'already-registered';
  webglSupported?: boolean;
  rendererReason?: string;
  sampleStrategy?: 'none' | 'lttb-x-sorted';
  lttbCaveat?: 'scatter-sorted-by-x';
  /** Time spent generating the source point cloud (cache miss only). */
  fixtureGenerateMs?: number;
  /** True when the fixture for this case was reused from cache. */
  fixtureCacheHit?: boolean;
  /**
   * Diagnostic alternate timing (mount → 2× rAF). v1 readers can
   * cross-check `renderMs` against this.
   */
  routeRenderMs?: number;
  /** Which measurement source produced `renderMs`. */
  settledSource?: BenchmarkSettledSource;
  /**
   * Marks rows produced under the `?danger=true` opt-in (currently
   * only `million / canvas-raw`).
   */
  unsafe?: boolean;
}

export interface BenchmarkRunnerEnvironment {
  profile: 'browser-interactive' | 'github-hosted-trend' | 'self-hosted-gpu';
  githubRunId?: string;
  sha?: string;
  ref?: string;
  os?: string;
  nodeVersion?: string;
  playwrightVersion?: string;
  chromeVersion?: string;
  headless?: boolean;
  gpuVendor?: string;
  gpuRenderer?: string;
  webglSupported?: boolean;
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
    measurementMode: BenchmarkMeasurementMode;
    runCounts: typeof RUN_COUNTS_BY_TIER;
    notes: string[];
    /**
     * Optional CI runner metadata. Only populated when the route is
     * driven by a Playwright spec that injects the values via
     * `window.__designLabBenchmarkRunner` before clicking Run.
     */
    runner?: BenchmarkRunnerEnvironment;
    /** True when `?danger=true` was active during the run. */
    dangerMode?: boolean;
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
  runIndex: number;
  isWarmup: boolean;
  /** True for `million / canvas-raw` cases unlocked by `?danger=true`. */
  unsafe?: boolean;
}

interface ScatterPreparedData {
  /**
   * Identifier of the case this prepared data belongs to. Codex
   * iter-4 P1: the runner advances `cursor` synchronously but the
   * prepare effect is async (it pre-flights the cold echarts-gl
   * chunk). Without a `caseId` stamp the route could mount a new
   * case with stale `points` from the previous case during that
   * gap, and `handleRendered` could file a row tagged with the new
   * case but the previous case's `sourceCount` / `prepMs`.
   */
  caseId: string;
  points: BenchmarkPoint2D[];
  prepMs: number;
  renderedCount: number;
  sourceCount: number;
  sampleStrategy: 'none' | 'lttb-x-sorted';
  lttbCaveat?: 'scatter-sorted-by-x';
  fixtureGenerateMs: number;
  fixtureCacheHit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Feature flag                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fail-closed: the route only mounts when the flag is explicitly
 * "true" AND the Vite environment is NOT a production build.
 *
 * Three independent signals are checked because Vite has multiple
 * "this is prod" knobs that don't always agree:
 *
 *   - `import.meta.env.PROD` is the canonical "production build"
 *     boolean, set by `vite build` regardless of `--mode`.
 *   - `import.meta.env.MODE === 'production'` matches the default
 *     mode, but a custom `vite build --mode staging` keeps PROD=true
 *     while MODE='staging' — so the MODE check alone is not enough.
 *
 * Tests stub `MODE` directly (Vitest `vi.stubEnv`) so the explicit
 * `MODE` branch keeps the guard testable in jsdom even though
 * `import.meta.env.PROD` is normally read-only at build time.
 */
/**
 * Pure gate evaluator — exported so unit tests can pass a stubbed env
 * directly. Vite's `import.meta.env.PROD` (and `MODE`) values are
 * compile-time inlined, so neither `vi.stubEnv` nor mutating
 * `import.meta.env` at runtime can flip them inside this function;
 * accepting `env` as an argument is the only honest way to test the
 * production fail-closed behaviour.
 */
export function evaluateBenchmarkGate(env: Record<string, unknown>): boolean {
  const flagOn = env.VITE_ENABLE_DESIGN_LAB_BENCHMARK === 'true';
  const modeIsProduction = env.MODE === 'production';
  // Vite emits `PROD` as a literal `boolean`. Accept the string form
  // too so future test environments that only marshal strings still
  // hit the right branch.
  const buildIsProduction = env.PROD === true || env.PROD === 'true';
  return flagOn && !modeIsProduction && !buildIsProduction;
}

/**
 * Production-facing gate that reads from `import.meta.env`. The
 * value of `import.meta.env.PROD` is replaced at build time by Vite,
 * so the route is open only when the corresponding `vite build` ran
 * in a non-production mode AND the operator opted in via the env
 * flag. See {@link evaluateBenchmarkGate} for the test seam.
 */
export function isBenchmarkRouteEnabled(): boolean {
  // Cast `import.meta` itself before reading `.env` so the project's
  // missing `ImportMeta.env` typing doesn't surface a TS2339 here
  // (mfe-shell does not pull in `vite/client` types).
  const env = (import.meta as unknown as { env: Record<string, unknown> }).env;
  return evaluateBenchmarkGate(env);
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

function snapshotEnvironment(opts: {
  dangerMode: boolean;
  runner?: BenchmarkRunnerEnvironment;
}): BenchmarkArtifact['environment'] {
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
    measurementMode: 'echarts-finished-2raf',
    runCounts: RUN_COUNTS_BY_TIER,
    notes: [
      "v2 renderMs is ECharts 'finished' + 2x rAF; routeRenderMs is the diagnostic mount → 2x rAF proxy",
      'memoryApi=chromium-performance-memory is JS heap only; GPU buffers not included',
      'canvas-lttb sample is x-sorted before LTTB; semantic caveat in lttbCaveat field',
      'million tier: 2 warmup + 5 measured. canvas-raw at million is danger-only opt-in.',
      'glImportMs reflects the cold echarts-gl chunk import (first WebGL run only).',
    ],
    runner: opts.runner,
    dangerMode: opts.dangerMode || undefined,
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

/**
 * Single-active fixture cache. Codex iter-1 (`019e0f36`): caching
 * the source point cloud across backend variants of the same
 * `fixture/tier` saves ~150-300ms per repeat at 1M, but holding
 * multiple million-point arrays at once is too much heap pressure
 * for the harness. We keep at most ONE entry alive — when the
 * runner moves to a new `fixture-tier` key the previous one is
 * dropped so the GC can reclaim it before the next case's render.
 */
class FixtureCache {
  private current: { key: string; points: BenchmarkPoint2D[] } | null = null;

  /**
   * Get-or-build for `fixture/tier`. Returns whether the lookup hit
   * the cache and how long the generator took (0 on a hit).
   */
  ensure(
    fixture: BenchmarkFixtureName,
    tier: BenchmarkTierName,
  ): { points: BenchmarkPoint2D[]; cacheHit: boolean; generateMs: number } {
    const key = `${fixture}-${tier}`;
    if (this.current && this.current.key === key) {
      return { points: this.current.points, cacheHit: true, generateMs: 0 };
    }
    // Drop the previous entry first so the previous fixture's heap can
    // free before we allocate the next. This matters at the 1M tier
    // where each fixture is ~24-50MB of object overhead.
    this.current = null;
    const t0 = performance.now();
    const points = buildFixturePoints(fixture, tier);
    const generateMs = performance.now() - t0;
    this.current = { key, points };
    return { points, cacheHit: false, generateMs };
  }

  clear(): void {
    this.current = null;
  }
}

function preparePoints(
  caseId: string,
  fixture: BenchmarkFixtureName,
  tier: BenchmarkTierName,
  backend: BenchmarkBackend,
  cache: FixtureCache,
): ScatterPreparedData {
  const cacheLookup = cache.ensure(fixture, tier);
  const source = cacheLookup.points;

  const prepStart = performance.now();
  let rendered = source;
  let sampleStrategy: 'none' | 'lttb-x-sorted' = 'none';
  let lttbCaveat: 'scatter-sorted-by-x' | undefined;
  if (backend === 'canvas-lttb') {
    const { downsampled } = applyLttbForCanvas(source, LTTB_TARGET_POINTS);
    rendered = downsampled;
    sampleStrategy = 'lttb-x-sorted';
    lttbCaveat = 'scatter-sorted-by-x';
  }
  const prepMs = performance.now() - prepStart;
  return {
    caseId,
    points: rendered,
    prepMs,
    renderedCount: rendered.length,
    sourceCount: source.length,
    sampleStrategy,
    lttbCaveat,
    fixtureGenerateMs: cacheLookup.generateMs,
    fixtureCacheHit: cacheLookup.cacheHit,
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
  'fixtureGenerateMs',
  'fixtureCacheHit',
  'renderMs',
  'routeRenderMs',
  'settledSource',
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
  'glImportStatus',
  'webglSupported',
  'rendererReason',
  'sampleStrategy',
  'lttbCaveat',
  'unsafe',
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

interface RenderSlotRenderedInfo {
  /**
   * Official metric. Schema v2: `setOption → finished + 2× rAF` via
   * `unstable_onRenderSettled`. Falls back to `routeRenderMs` when
   * the settled callback times out — see `settledSource`.
   */
  renderMs: number;
  /**
   * Diagnostic alternate timing — mount → 2× rAF. Always populated
   * regardless of which source `renderMs` ended up using, so v1
   * readers can compare against the v2 number side-by-side.
   */
  routeRenderMs: number;
  /**
   * Where `renderMs` came from. `'finished'` is the precision path;
   * `'route-level'` is the timeout fallback.
   */
  settledSource: BenchmarkSettledSource;
  rendererReason?: string;
  /**
   * True when the ScatterChart fired `onRendererFallback` because the
   * requested backend (WebGL) was unavailable and the router routed
   * to Canvas instead. The runner uses this to mark the benchmark
   * row as `aborted` with `abortReason='webgl-unavailable'` and
   * `webglSupported=false`, so the artifact summary doesn't blend a
   * silently-canvas-rendered point cloud into the WebGL median.
   */
  webglUnavailable?: boolean;
}

interface RenderSlotProps {
  data: BenchmarkPoint2D[];
  rendererProp: 'canvas' | 'webgl';
  onRendered: (event: RenderSlotRenderedInfo) => void;
}

/**
 * Mounts a single ScatterChart, measures BOTH:
 *
 *   - the official `setOption → finished + 2× rAF` window (PR-A1.6b
 *     precision via `unstable_onRenderSettled`)
 *   - the diagnostic mount → 2× rAF window (carried over from PR-A1.6a
 *     so v1/v2 readers can cross-check the new metric)
 *
 * The first metric becomes `renderMs` in the artifact. The second
 * stays as `routeRenderMs`. If the settled callback fails to fire
 * within {@link SETTLED_TIMEOUT_MS} the runner falls back to the
 * route-level value and reports `settledSource='route-level'`.
 */
const RenderSlot: React.FC<RenderSlotProps> = ({ data, rendererProp, onRendered }) => {
  const mountStartedAtRef = useRef<number>(performance.now());
  const reportedRef = useRef<boolean>(false);
  const rendererReasonRef = useRef<string | undefined>(undefined);
  const webglUnavailableRef = useRef<boolean>(false);
  const routeRenderMsRef = useRef<number | null>(null);
  // Always-latest closure for `onRendered` so the mount-once effect
  // does not capture a stale prop while still keeping `[]` deps.
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;

  // Reset measurement state on every mount cycle.
  mountStartedAtRef.current = performance.now();
  reportedRef.current = false;
  webglUnavailableRef.current = false;
  routeRenderMsRef.current = null;

  // Diagnostic route-level rAF measurement.
  useEffect(() => {
    let frame1: number | null = null;
    let frame2: number | null = null;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        routeRenderMsRef.current = performance.now() - mountStartedAtRef.current;
      });
    });
    return () => {
      if (frame1 !== null) cancelAnimationFrame(frame1);
      if (frame2 !== null) cancelAnimationFrame(frame2);
    };
  }, []);

  // Fallback timer — if `unstable_onRenderSettled` never fires within
  // SETTLED_TIMEOUT_MS the runner still gets a verdict (route-level).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      const fallbackMs = routeRenderMsRef.current ?? performance.now() - mountStartedAtRef.current;
      onRenderedRef.current({
        renderMs: fallbackMs,
        routeRenderMs: fallbackMs,
        settledSource: 'route-level',
        rendererReason: rendererReasonRef.current,
        webglUnavailable: webglUnavailableRef.current || undefined,
      });
    }, SETTLED_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Settled callback — official PR-A1.6b precision metric.
  const handleSettled = useCallback((event: EChartsRenderSettledEvent) => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onRenderedRef.current({
      renderMs: event.durationMs,
      routeRenderMs: routeRenderMsRef.current ?? event.durationMs,
      settledSource: 'finished',
      rendererReason: rendererReasonRef.current,
      webglUnavailable: webglUnavailableRef.current || undefined,
    });
  }, []);

  const fallbackHandler = useCallback((event: RendererFallbackEvent) => {
    rendererReasonRef.current = `fallback:${event.requested}->${event.actual}:${event.reason}`;
    if (event.requested === 'webgl' && event.actual !== 'webgl') {
      webglUnavailableRef.current = true;
    }
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
        unstable_onRenderSettled={handleSettled}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Runner state machine                                               */
/* ------------------------------------------------------------------ */

/**
 * Build the queue of cases (warmup + measured) the runner walks. The
 * `dangerMode` flag controls whether the unsafe `million / canvas-raw`
 * combination is included — without it, that pair is silently
 * dropped from the matrix even when both `million` and `canvas-raw`
 * are otherwise selected.
 */
function buildCaseQueue(
  fixtures: BenchmarkFixtureName[],
  tiers: BenchmarkTierName[],
  backends: BenchmarkBackend[],
  dangerMode: boolean,
): BenchmarkCase[] {
  const queue: BenchmarkCase[] = [];
  for (const fixture of fixtures) {
    for (const tier of tiers) {
      for (const backend of backends) {
        // Hard guard: 1M canvas-raw is danger-mode only.
        if (tier === 'million' && backend === 'canvas-raw' && !dangerMode) continue;
        const unsafe = tier === 'million' && backend === 'canvas-raw';
        const counts = RUN_COUNTS_BY_TIER[tier];
        // Warmups
        for (let w = 1; w <= counts.warmup; w++) {
          queue.push({
            id: `${fixture}-${tier}-${backend}-w${w}`,
            fixture,
            tier,
            backend,
            runIndex: w,
            isWarmup: true,
            unsafe: unsafe || undefined,
          });
        }
        // Measured runs
        for (let i = 1; i <= counts.measured; i++) {
          queue.push({
            id: `${fixture}-${tier}-${backend}-m${i}`,
            fixture,
            tier,
            backend,
            runIndex: i,
            isWarmup: false,
            unsafe: unsafe || undefined,
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
  /**
   * `?danger=true` opt-in. When false (default) the matrix builder
   * silently drops `million / canvas-raw` even if both are otherwise
   * selected. The runner also writes this into the artifact via
   * `environment.dangerMode`.
   */
  dangerMode: boolean;
  /**
   * Optional CI runner metadata. Forwarded to the artifact's
   * `environment.runner` block. Populated by Playwright specs that
   * inject the GHA / browser context info before clicking Run.
   */
  runnerEnv?: BenchmarkRunnerEnvironment;
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
  handleRendered: (info: RenderSlotRenderedInfo) => void | Promise<void>;
  /**
   * Snapshot of the run config that produced the current `results`.
   * Frozen at `start()` time so the artifact env in the UI doesn't
   * drift if the user toggles the danger checkbox after a run
   * completes — Codex iter-3 P3.
   */
  lastRunSnapshot: RunSnapshot | null;
}

interface RunSnapshot {
  dangerMode: boolean;
  runner?: BenchmarkRunnerEnvironment;
}

interface ColdGlImportObservation {
  /** Cold chunk import duration in milliseconds (0 when already registered). */
  ms: number;
  /** Distinguishes a fresh chunk from a cached one. */
  status: 'cold' | 'already-registered';
}

function useScatterBenchmarkRunner(opts: RunnerHookOptions): RunnerHookState {
  const measureFn = opts.measureFpsFn ?? measureFps;
  const [queue, setQueue] = useState<BenchmarkCase[]>([]);
  const [cursor, setCursor] = useState<number>(-1);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [preparedData, setPreparedData] = useState<ScatterPreparedData | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const runIdRef = useRef<string>('');
  // Single-active fixture cache scoped to one run lifecycle. Cleared
  // on `reset()` and after the final case settles so the 1M heap can
  // free between Run clicks.
  const fixtureCacheRef = useRef<FixtureCache>(new FixtureCache());
  /**
   * Direct cold-import observation populated by the prepare effect on
   * the first WebGL case of a run (warmup or measured — Codex iter-3
   * P1 fix: the previous implementation set the `cold` flag during
   * the first warmup but `!c.isWarmup` filtered the row out, so the
   * artifact never carried the cold timing).
   */
  const coldGlImportRef = useRef<ColdGlImportObservation | null>(null);
  /**
   * Codex iter-4 P2: the cold observation must be reported on
   * exactly ONE artifact row. Without this guard every measured
   * WebGL row would copy the same `cold + ms` pair, contradicting
   * the schema's "subsequent runs report `already-registered`".
   * Set true once any measured WebGL row consumes the cold
   * observation; later WebGL rows then report
   * `glImportStatus='already-registered' / glImportMs=0`.
   */
  const coldGlImportConsumedRef = useRef<boolean>(false);
  /**
   * Snapshot of the run config taken inside `start()`. The artifact
   * UI can reuse this to render `environment.dangerMode` /
   * `environment.runner` from the configuration that produced the
   * results, not from whatever the user has set in the live UI
   * after the run finished — Codex iter-3 P3.
   */
  const runSnapshotRef = useRef<RunSnapshot | null>(null);

  const start = useCallback(() => {
    const newQueue = buildCaseQueue(opts.fixtures, opts.tiers, opts.backends, opts.dangerMode);
    // Codex iter-4 P3: refuse to enter `running` state with an
    // empty queue. Without this guard, picking only `million +
    // canvas-raw` while danger-mode is off (the matrix builder
    // drops that pair silently) would leave the runner stuck in
    // `isRunning=true` with nothing to do.
    if (newQueue.length === 0) {
      runIdRef.current = '';
      runSnapshotRef.current = null;
      setQueue([]);
      setCursor(-1);
      setResults([]);
      setPreparedData(null);
      setIsRunning(false);
      return;
    }
    runIdRef.current = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fixtureCacheRef.current.clear();
    coldGlImportRef.current = null;
    coldGlImportConsumedRef.current = false;
    runSnapshotRef.current = { dangerMode: opts.dangerMode, runner: opts.runnerEnv };
    setQueue(newQueue);
    setCursor(0);
    setResults([]);
    setPreparedData(null);
    setIsRunning(true);
  }, [opts.fixtures, opts.tiers, opts.backends, opts.dangerMode, opts.runnerEnv]);

  const reset = useCallback(() => {
    fixtureCacheRef.current.clear();
    coldGlImportRef.current = null;
    coldGlImportConsumedRef.current = false;
    runSnapshotRef.current = null;
    setQueue([]);
    setCursor(-1);
    setResults([]);
    setPreparedData(null);
    setIsRunning(false);
  }, []);

  // When cursor changes, prepare data for the next case. Async so we
  // can pre-flight the cold `echarts-gl` chunk import on the first
  // WebGL case (warmup or measured) and surface the actual chunk
  // duration in the artifact via `coldGlImportRef` rather than the
  // earlier proxy that conflated it with `renderMs`.
  //
  // Codex iter-4 P1: clear `preparedData` to `null` BEFORE the
  // async preflight so the route doesn't keep mounting the
  // previous case's points while the GL chunk loads. The
  // `caseId` stamp on the next prepared payload guards the
  // post-await write so a race between two cursor advances can't
  // file the wrong case's data.
  useEffect(() => {
    if (!isRunning || cursor < 0 || cursor >= queue.length) return;
    let cancelled = false;
    const c = queue[cursor];
    setPreparedData(null);
    void (async () => {
      if (c.backend === 'webgl' && coldGlImportRef.current === null) {
        if (isEChartsGLRegistered()) {
          coldGlImportRef.current = { ms: 0, status: 'already-registered' };
        } else {
          const t0 = performance.now();
          try {
            await registerEChartsGL();
            coldGlImportRef.current = {
              ms: performance.now() - t0,
              status: 'cold',
            };
          } catch {
            // Registration failure surfaces later as the WebGL
            // fallback path (`webglUnavailable`); leave the cold
            // observation `null` so the runner reports neither
            // status — the artifact row already documents the
            // failure mode.
            coldGlImportRef.current = null;
          }
        }
      }
      if (cancelled) return;
      const prepared = preparePoints(c.id, c.fixture, c.tier, c.backend, fixtureCacheRef.current);
      if (cancelled) return;
      setPreparedData(prepared);
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor, queue, isRunning]);

  // RenderSlot's onRendered fires `handleRendered`. Captures four
  // failure / abort signals that the artifact summary (`computeSummary`)
  // skips so they never blend into a median:
  //   - timeout            → tier-specific render budget exceeded
  //   - webgl-unavailable  → router downgraded WebGL → Canvas
  //   - settled-timeout    → `unstable_onRenderSettled` never fired
  //   - manual-skip        → reserved for the future `?danger=true` paths
  const handleRendered = useCallback(
    async (info: RenderSlotRenderedInfo) => {
      if (!isRunning || cursor < 0 || cursor >= queue.length || !preparedData) return;
      const c = queue[cursor];
      // Codex iter-4 P1: refuse to file a result row when the
      // prepared payload was generated for a different case (the
      // race window between async GL preflight and a cursor
      // advance). The route's mount guard normally prevents
      // RenderSlot from booting against stale data, but defending
      // here keeps the artifact strictly correct.
      if (preparedData.caseId !== c.id) return;
      const heapBefore = snapshotMemoryMB();
      const fps = await measureFn(FPS_WINDOW_MS);
      const heapAfter = snapshotMemoryMB();

      // Soft timeout: large+canvas-raw still uses the original 5s
      // budget. The 1M case is danger-only and large enough to need
      // its own ceiling — but we keep it as `unsafe`-tagged data
      // rather than auto-aborting because that's the whole point of
      // the opt-in.
      const isOverBudget =
        c.tier === 'large' &&
        c.backend === 'canvas-raw' &&
        info.renderMs > CANVAS_RAW_LARGE_SOFT_TIMEOUT_MS;

      // WebGL fallback: requested='webgl' but router downgraded.
      const isWebglUnavailable = c.backend === 'webgl' && info.webglUnavailable === true;

      // `unstable_onRenderSettled` never fired and the runner had to
      // accept the route-level proxy.
      const isSettledTimeout = info.settledSource === 'route-level';

      // Codex iter-3 P1: settled-timeout rows MUST be excluded from the
      // artifact summary, otherwise route-level fallback measurements
      // leak into the official `echarts-finished-2raf` median. We bundle
      // it into `aborted` here so `computeSummary` (which gates on
      // `r.aborted`) drops the row.
      const aborted = isOverBudget || isWebglUnavailable || isSettledTimeout;
      const abortReason: BenchmarkAbortReason | undefined = isOverBudget
        ? 'timeout'
        : isWebglUnavailable
          ? 'webgl-unavailable'
          : isSettledTimeout
            ? 'settled-timeout'
            : undefined;
      const webglSupported = c.backend === 'webgl' ? !isWebglUnavailable : undefined;

      // Cold echarts-gl import accounting (PR-A1.6b acceptance #4 +
      // Codex iter-3 P1 + iter-4 P2). The prepare effect measured
      // the actual chunk import time on the first WebGL case
      // (warmup or measured) and stored it on `coldGlImportRef`.
      // We "consume" that observation on EXACTLY ONE result row so
      // the artifact matches the schema's "subsequent runs report
      // already-registered" contract. Warmup cases skip the
      // result-write below entirely, so the cold observation lands
      // on the first WebGL row that actually ships.
      let glImportStatus: 'cold' | 'already-registered' | undefined;
      let glImportMs: number | undefined;
      if (c.backend === 'webgl' && webglSupported !== false && !c.isWarmup) {
        if (!coldGlImportConsumedRef.current && coldGlImportRef.current) {
          glImportStatus = coldGlImportRef.current.status;
          glImportMs = coldGlImportRef.current.ms;
          coldGlImportConsumedRef.current = true;
        } else {
          glImportStatus = 'already-registered';
          glImportMs = 0;
        }
      }

      if (!c.isWarmup) {
        const snap = runSnapshotRef.current ?? {
          dangerMode: opts.dangerMode,
          runner: opts.runnerEnv,
        };
        const env = snapshotEnvironment(snap);
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
          aborted: aborted || undefined,
          abortReason,
          gcSuspected: fps.gcSuspected || undefined,
          rendererReason: info.rendererReason,
          webglSupported,
          sampleStrategy: preparedData.sampleStrategy,
          lttbCaveat: preparedData.lttbCaveat,
          fixtureGenerateMs: Number(preparedData.fixtureGenerateMs.toFixed(2)),
          fixtureCacheHit: preparedData.fixtureCacheHit,
          routeRenderMs: Number(info.routeRenderMs.toFixed(2)),
          settledSource: info.settledSource,
          glImportStatus,
          glImportMs: glImportMs !== undefined ? Number(glImportMs.toFixed(2)) : undefined,
          unsafe: c.unsafe,
        };
        setResults((prev) => [...prev, result]);
      }

      // Advance cursor. On the final case mark `cursor=queue.length`
      // explicitly so `progress.done` reads `total/total` and the
      // route's `currentCase` becomes `null` — without this the UI
      // appears stuck at the last measured run and exporters that
      // gate on `!isRunning` need an extra tick to settle. Also drop
      // the fixture cache so 1M heap can free between Run clicks.
      const next = cursor + 1;
      if (next >= queue.length) {
        setIsRunning(false);
        setCursor(queue.length);
        setPreparedData(null);
        fixtureCacheRef.current.clear();
      } else {
        setCursor(next);
      }
    },
    [isRunning, cursor, queue, preparedData, measureFn, opts.dangerMode, opts.runnerEnv],
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
      // Surface the run snapshot so the artifact useMemo upstream can
      // build `environment` from the configuration that produced the
      // results, not from whatever the user has clicked on since.
      lastRunSnapshot: runSnapshotRef.current,
    }),
    [results, isRunning, cursor, queue, preparedData, start, reset, handleRendered],
  );
}

/* ------------------------------------------------------------------ */
/*  UI sub-components                                                  */
/* ------------------------------------------------------------------ */

const ALL_FIXTURES: BenchmarkFixtureName[] = ['uniform', 'clustered', 'spike'];
const ALL_TIERS: BenchmarkTierName[] = ['medium', 'large', 'million'];
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
  /**
   * `?danger=true` was passed in the URL — show the unsafe opt-in
   * checkbox below the config grid.
   */
  dangerCapability: boolean;
  /** Whether the unsafe opt-in checkbox is currently checked. */
  dangerEnabled: boolean;
  onChangeDangerEnabled: (next: boolean) => void;
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
  dangerCapability,
  dangerEnabled,
  onChangeDangerEnabled,
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
      {dangerCapability && (
        <fieldset
          data-testid="benchmark-danger-fieldset"
          style={{
            border: '1px solid var(--color-state-warning-border, #f59e0b)',
            background: 'var(--color-state-warning-bg, #fef3c7)',
            padding: '8px 12px',
          }}
        >
          <legend>Unsafe opt-in</legend>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={dangerEnabled}
              onChange={(e) => onChangeDangerEnabled(e.target.checked)}
              disabled={isRunning}
              data-testid="benchmark-danger-checkbox"
            />{' '}
            Include 1M canvas-raw (will block tab; for forensic comparison only)
          </label>
        </fieldset>
      )}
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
        <caption style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600 }}>
          Scatter benchmark results — Chromium-measured. One row per measured run (warmup excluded).
          Aborted rows are skipped from the artifact summary medians.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left' }}>
              fixture
            </th>
            <th scope="col" style={{ textAlign: 'left' }}>
              tier
            </th>
            <th scope="col" style={{ textAlign: 'left' }}>
              backend
            </th>
            <th scope="col">run</th>
            <th scope="col">renderMs</th>
            <th scope="col">prepMs</th>
            <th scope="col">fpsAvg</th>
            <th scope="col">p95Drop%</th>
            <th scope="col">sourceCount</th>
            <th scope="col">renderedCount</th>
            <th scope="col">heapΔ MB</th>
            <th scope="col">aborted</th>
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
  isRunning: boolean;
}

const BenchmarkExportBar: React.FC<ExportBarProps> = ({ results, artifact, isRunning }) => {
  const filenameStub = useMemo(() => `benchmark-${Date.now()}`, []);
  // Disable exports while a run is in flight so neither the CSV row
  // count nor the JSON artifact summary captures a partial matrix.
  const exportLocked = isRunning || results.length === 0;
  return (
    <div style={{ display: 'flex', gap: 8, padding: 16 }} data-testid="benchmark-export-bar">
      <button
        type="button"
        disabled={exportLocked}
        onClick={() => downloadBlob(`${filenameStub}.csv`, resultsToCsv(results), 'text/csv')}
        data-testid="benchmark-export-csv"
      >
        Download CSV ({results.length} rows)
      </button>
      <button
        type="button"
        disabled={exportLocked || !artifact}
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

  // `?danger=true` URL capability gate. Two-stage opt-in: capability
  // unlocks the checkbox, the user still has to tick it, then `start`
  // forwards `dangerEnabled` to the runner. Without both, `million /
  // canvas-raw` is silently dropped from the matrix.
  const dangerCapability = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('danger') === 'true';
  }, []);
  const [dangerEnabled, setDangerEnabled] = useState(false);
  const dangerMode = dangerCapability && dangerEnabled;

  // CI-injected runner metadata. Playwright workflow seeds
  // `window.__designLabBenchmarkRunner` before clicking Run; the
  // runner forwards it onto the artifact's `environment.runner`
  // block. Read-once into state so a hot reload doesn't drift the
  // value mid-run.
  const [runnerEnv] = useState<BenchmarkRunnerEnvironment | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { __designLabBenchmarkRunner?: BenchmarkRunnerEnvironment })
      .__designLabBenchmarkRunner;
  });

  const runner = useScatterBenchmarkRunner({
    fixtures,
    tiers,
    backends,
    dangerMode,
    runnerEnv,
  });

  // Codex iter-3 P3: build the artifact `environment` from the run
  // snapshot the runner froze inside `start()`, NOT from the live
  // dangerMode/runnerEnv state. Otherwise toggling the unsafe
  // checkbox AFTER a run completes would silently rewrite history
  // in the displayed artifact.
  const env = useMemo(() => {
    const snap = runner.lastRunSnapshot ?? { dangerMode, runner: runnerEnv };
    return snapshotEnvironment(snap);
  }, [runner.lastRunSnapshot, dangerMode, runnerEnv]);
  const artifact = useMemo<BenchmarkArtifact | null>(() => {
    if (runner.results.length === 0) return null;
    return buildArtifact(runner.results[0].runId, env, runner.results);
  }, [runner.results, env]);

  // Test hook: expose the latest artifact on `window` so Playwright
  // specs can read it without scraping the DOM. Only populated on the
  // benchmark route and only when results exist; outside this route
  // the global stays undefined.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (
      window as unknown as { __designLabBenchmarkArtifact?: BenchmarkArtifact | null }
    ).__designLabBenchmarkArtifact = artifact;
    return () => {
      (
        window as unknown as { __designLabBenchmarkArtifact?: BenchmarkArtifact | null }
      ).__designLabBenchmarkArtifact = null;
    };
  }, [artifact]);

  const currentCase = runner.currentCase;
  const renderSlotKey = currentCase
    ? `${currentCase.id}-${runner.preparedData?.renderedCount ?? 0}`
    : 'idle';

  return (
    <main data-testid="benchmark-route" style={{ padding: 24 }}>
      <header>
        <h1>x-charts ScatterChart Benchmark Harness (PR-A1.6b)</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Internal harness — Chromium-measured. JS heap only. Schema v2: <code>renderMs</code> =
          ECharts <code>finished</code> + 2× rAF (precision metric); <code>routeRenderMs</code> =
          mount → 2× rAF (diagnostic). Cold <code>echarts-gl</code> import surfaces as the first
          WebGL run's <code>glImportMs</code>.
        </p>
        <p
          style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontStyle: 'italic' }}
          data-testid="benchmark-default-preset-note"
        >
          Default = smoke preset (uniform / medium / canvas-raw, 4 runs in seconds). The full matrix
          expands across 3 fixtures × 3 tiers × 3 backends. 1M tier defaults to{' '}
          <code>2 warmup + 5 measured</code>. <code>million / canvas-raw</code> is danger-only — add{' '}
          <code>?danger=true</code> to the URL and tick the unsafe checkbox to include it.
        </p>
        {dangerCapability && (
          <p
            data-testid="benchmark-danger-banner"
            style={{
              padding: '8px 12px',
              border: '1px solid var(--color-state-warning-border, #f59e0b)',
              background: 'var(--color-state-warning-bg, #fef3c7)',
              color: 'var(--color-state-warning-text, #92400e)',
              fontSize: 13,
            }}
          >
            <strong>Danger capability active.</strong> The unsafe-opt-in checkbox is visible. The
            artifact will record <code>environment.dangerMode = true</code> and any rows from the
            unlocked combination will be tagged <code>unsafe = true</code>.
          </p>
        )}
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
        dangerCapability={dangerCapability}
        dangerEnabled={dangerEnabled}
        onChangeDangerEnabled={setDangerEnabled}
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
        {currentCase &&
          runner.preparedData &&
          // Codex iter-4 P1 mount guard: only render once the
          // prepared payload matches the current case. Without this
          // the route would mount the previous case's points with
          // the new case's renderer prop during the async
          // preflight window.
          runner.preparedData.caseId === currentCase.id && (
            <RenderSlot
              key={renderSlotKey}
              data={runner.preparedData.points}
              rendererProp={currentCase.backend === 'webgl' ? 'webgl' : 'canvas'}
              onRendered={runner.handleRendered}
            />
          )}
      </section>

      <BenchmarkResultsTable results={runner.results} />
      <BenchmarkExportBar
        results={runner.results}
        artifact={artifact}
        isRunning={runner.isRunning}
      />
    </main>
  );
};

export default BenchmarkRoute;
