// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- echarts-liquidfill ships no declarations; this file owns its source-consumer ambient declaration.
/// <reference path="./echarts-liquidfill.d.ts" />

/**
 * Lazy `echarts-liquidfill` registration — Faz 21.11 Campaign 4
 * (Codex thread 019e4301 iter-1 AGREE_WITH_REVISIONS).
 *
 * `echarts-liquidfill@~3.1.0` self-registers a `'liquidFill'` series
 * type on the shared ECharts core when its entry module evaluates
 * (side-effect import). We avoid `echarts.use([...])` because the
 * package does not export a modular component the way ECharts core
 * series do — author chose the side-effect model.
 *
 * Static
 *
 *   import 'echarts-liquidfill'; // ← FORBIDDEN
 *
 * would bloat the initial shell bundle. Dynamic import here lets
 * Vite/Rollup code-split it into its own chunk that only downloads
 * when the first LiquidFillChart instance triggers
 * {@link registerEChartsLiquidFill}.
 *
 * The registration is idempotent and process-wide: once one chart has
 * triggered it, subsequent LiquidFillChart instances see the
 * `'liquidFill'` series type already registered on the shared ECharts
 * core namespace.
 *
 * @see useRequiredEChartsLiquidFill — the lazy load + state machine
 *      hook (mirrors useRequiredEChartsGL).
 */

let registered = false;
let registrationPromise: Promise<void> | null = null;

/**
 * Lazy-load `echarts-liquidfill` and register its `'liquidFill'`
 * series type on the shared `echarts/core` namespace. Subsequent calls
 * are a no-op.
 *
 * The package is loaded via dynamic import so the chunk stays out of
 * the initial shell bundle until first use. Network / cold-cache cost
 * is paid once per session, after which the module sits in the
 * browser's module cache.
 *
 * @returns A promise that resolves when registration is complete. Safe
 *   to call concurrently — repeat callers share the same promise.
 */
export async function registerEChartsLiquidFill(): Promise<void> {
  if (registered) return;
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    // Side-effect dynamic import — `echarts-liquidfill` self-registers
    // the `'liquidFill'` series on the global ECharts core when its
    // entry module evaluates. No `echarts.use([...])` call needed.
    await import('echarts-liquidfill');
    registered = true;
  })();

  return registrationPromise;
}

/** Check whether `echarts-liquidfill` has been registered yet. */
export function isEChartsLiquidFillRegistered(): boolean {
  return registered;
}

/**
 * @internal — test-only. Resets the module-scope registration flag so
 * a vitest case can exercise the cold-load lifecycle without forking
 * the module registry. Production code MUST NOT call this.
 */
export function __resetEChartsLiquidFillRegistrationForTests(): void {
  registered = false;
  registrationPromise = null;
}
