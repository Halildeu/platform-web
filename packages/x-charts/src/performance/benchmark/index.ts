/**
 * `@mfe/x-charts/benchmark` subpath barrel — Faz 21.11 PR-A1.6a.
 *
 * Why a subpath:
 *   The benchmark fixtures + seeded RNG are NOT part of the core
 *   chart wrapper bundle — they're only consumed by the design-lab
 *   benchmark route (and downstream apps that want to reproduce
 *   scatter measurements).
 *
 *   Hanging them off `./benchmark` instead of the main barrel keeps
 *   tree-shaking honest: importing `<ScatterChart>` from
 *   `@mfe/x-charts` no longer drags fixtures + RNG into the wrapper
 *   bundle. The CONTRACT §7 size budget stays clean.
 *
 *   Bundle-check observation (PR-F2 gate):
 *     barrel re-export   →  +11.11KB gzip on `wrapperOnly`
 *     subpath re-export  →  ~0KB on `wrapperOnly` (only consumed by
 *                           the lazy benchmark chunk)
 *
 * Tree-shake friendly: pure modules, side-effect-free.
 */

export {
  generateUniformScatter,
  generateClusteredScatter,
  generateSpikeScatter,
  generateTimeSeries,
  generateScatterSuite,
  BENCHMARK_TIERS,
} from './fixtures';
export type { BenchmarkPoint2D, BenchmarkTimePoint, BenchmarkTier } from './fixtures';

export { mulberry32, gaussian, uniform } from './seeded-rng';

// `downsampleLTTB` and `LTTBPoint` already live on the public barrel
// (Performance P6 section) — they predate PR-A1.6a and are used by
// production code, not just the benchmark. Re-exporting them here
// would create a duplicate identifier for consumers that pull from
// both `@mfe/x-charts` and `@mfe/x-charts/benchmark` in the same
// module.
export type { LTTBPoint } from '../lttb';
export { downsampleLTTB } from '../lttb';

// PR-A1.6b — surface the lazy GL registration + idempotent predicate
// so the benchmark route can measure the cold `echarts-gl` chunk
// import directly (Codex thread `019e0f50` iter-3 P1: the prior
// `glImportMs = renderMs` proxy went undetected because the first
// WebGL run was a warmup and got dropped). Production consumers
// continue to ignore these — `ScatterChart` itself also calls
// `registerEChartsGL` internally on first use.
export { registerEChartsGL, isEChartsGLRegistered } from '../../renderers/gl/registerEChartsGL';
