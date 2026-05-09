/**
 * Lazy `echarts-gl` registration — Faz 21.11 PR-A1 (Big Data Renderer
 * Router, WebGL Million-Point Path).
 *
 * `echarts-gl@2.0.9` does NOT publish modular sub-paths (no
 * `echarts-gl/charts/scatterGL`, no exports map). The only entry point
 * is `echarts-gl/dist/echarts-gl.js` ≈ 500 KB raw / ~150 KB gzip.
 *
 * To honour the PR-A program's "zero echarts-gl shell impact" claim
 * we therefore MUST dynamic-import the package — Vite/Rollup will then
 * code-split it into its own chunk that only downloads when the first
 * caller invokes {@link registerEChartsGL}. Top-level static
 *
 *   import 'echarts-gl'; // ← FORBIDDEN
 *
 * would bloat the initial shell bundle by ~150 KB gzip — exactly what
 * the consensus and bundle-guard test forbid.
 *
 * The registration is idempotent and process-wide: once one chart has
 * triggered it, subsequent ScatterChart / LineChart instances see the
 * `'scatterGL'` / `'linesGL'` series types already registered on the
 * shared ECharts core namespace.
 *
 * @see chooseRenderer (PR-A0) — emits `backend: 'webgl'` when this
 *      module should be loaded.
 * @see Codex thread `019e0e7a` iter-3 consensus + iter-4 architecture.
 */

let registered = false;
let registrationPromise: Promise<void> | null = null;

/**
 * Lazy-load `echarts-gl` and register its WebGL series types
 * (`scatterGL`, `linesGL`, `bar3D`, `scatter3D`, etc.) on the shared
 * `echarts/core` namespace. Subsequent calls are a no-op.
 *
 * The package is loaded via dynamic import so the `~150 KB gzip` chunk
 * stays out of the initial shell bundle until first use. Network /
 * cold-cache cost is paid once per session, after which the module
 * sits in the browser's module cache.
 *
 * @returns A promise that resolves when registration is complete. Safe
 *   to call concurrently — repeat callers share the same promise.
 */
export async function registerEChartsGL(): Promise<void> {
  if (registered) return;
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    // Side-effect dynamic import — `echarts-gl` package self-registers
    // its series + components on the global ECharts core when its
    // entry module evaluates. We don't need to call `echarts.use([])`
    // ourselves; the package author opted for the side-effect model.
    await import('echarts-gl');
    registered = true;
  })();

  return registrationPromise;
}

/**
 * Synchronous predicate: has {@link registerEChartsGL} already
 * resolved? Useful for chart wrappers that want to guard a render
 * synchronously without re-awaiting the registration promise.
 */
export function isEChartsGLRegistered(): boolean {
  return registered;
}

/**
 * Test-only escape hatch — drop the cached registration so individual
 * unit tests can re-trigger the dynamic import path. Production code
 * should never call this; the registration is correct for the lifetime
 * of the page.
 */
export function resetEChartsGLRegistration(): void {
  registered = false;
  registrationPromise = null;
}
