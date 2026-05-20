// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- echarts-wordcloud ships no declarations; this file owns its source-consumer ambient declaration.
/// <reference path="./echarts-wordcloud.d.ts" />

/**
 * Lazy `echarts-wordcloud` registration — Faz 21.11 Campaign 5
 * (Codex thread 019e4351 iter-1 AGREE_WITH_REVISIONS).
 *
 * `echarts-wordcloud@~2.1.0` self-registers a `'wordCloud'` series
 * type on the shared ECharts core when its entry module evaluates
 * (side-effect import). We avoid `echarts.use([...])` because the
 * package does not export a modular component — author chose the
 * side-effect model (same posture as echarts-liquidfill).
 *
 * Static
 *
 *   import 'echarts-wordcloud'; // ← FORBIDDEN
 *
 * would bloat the initial shell bundle. Dynamic import here lets
 * Vite/Rollup code-split it into its own chunk that only downloads
 * when the first WordCloudChart instance triggers
 * {@link registerEChartsWordCloud}.
 *
 * Registration is idempotent and process-wide.
 *
 * @see useRequiredEChartsWordCloud — the lazy load + state machine hook.
 */

let registered = false;
let registrationPromise: Promise<void> | null = null;

/**
 * Lazy-load `echarts-wordcloud` and register its `'wordCloud'` series
 * type on the shared `echarts/core` namespace. Subsequent calls are a
 * no-op.
 *
 * Loaded via dynamic import so the chunk stays out of the initial
 * shell bundle until first use. Safe to call concurrently — repeat
 * callers share the same promise.
 */
export async function registerEChartsWordCloud(): Promise<void> {
  if (registered) return;
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    // Side-effect dynamic import — `echarts-wordcloud` self-registers
    // the `'wordCloud'` series on the global ECharts core when its
    // entry module evaluates. No `echarts.use([...])` call needed.
    await import('echarts-wordcloud');
    registered = true;
  })();

  return registrationPromise;
}

/** Check whether `echarts-wordcloud` has been registered yet. */
export function isEChartsWordCloudRegistered(): boolean {
  return registered;
}

/**
 * @internal — test-only. Resets the module-scope registration flag so
 * a vitest case can exercise the cold-load lifecycle without forking
 * the module registry. Production code MUST NOT call this.
 */
export function __resetEChartsWordCloudRegistrationForTests(): void {
  registered = false;
  registrationPromise = null;
}
