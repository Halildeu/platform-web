/**
 * Lazy ECharts feature registration — PR-X16 ECharts Depth campaign.
 *
 * The base register list (`registerECharts()` in `echarts-imports.ts`)
 * eagerly bundles every chart + component a typical dashboard uses. The
 * CONTRACT §8 bundle gate hard-caps `contractTotal` at 350 KB gzip, and
 * the campaign's depth charts (Tree, and later Calendar coordinate,
 * Polar coordinate, ThemeRiver, Custom/Gantt) are niche enough that
 * paying their bytes up-front for every shell user is the wrong trade —
 * adding `tree` to the eager list alone pushed `contractTotal` over the
 * cap (Codex thread 019e32da iter-2, "Option 3 hybrid lazy register").
 *
 * This module is the 2-D analogue of `renderers/gl/registerEChartsGL.ts`:
 * each feature has a loader that dynamic-imports ONLY that feature's
 * ECharts module via the direct `echarts/lib/chart/<name>` series path
 * (or `echarts/lib/component/<name>` for a coordinate-system component)
 * — NEVER the `echarts/charts` / `echarts/components` barrels. A barrel
 * re-exports every install fn, so a dynamic import of it risks
 * code-splitting the WHOLE chart set into the lazy chunk (Codex iter-2
 * must-fix). The
 * direct `echarts/lib/chart/tree.js` module ends with `use(install)`,
 * so importing it self-registers the series type on the shared
 * `echarts/core` namespace (the same singleton `registerECharts()`
 * mutates).
 *
 * Registration is idempotent and process-wide: once one TreeChart has
 * triggered `ensureEChartsFeatureRegistered('tree')`, every later
 * TreeChart sees `tree` already registered.
 *
 * The dynamic `import('echarts/lib/*')` calls are LOCKED to this
 * file by `__tests__/bundle-guard.test.ts` — that leakage guard is what
 * lets the bundle-size CI gate externalise the lazy paths without the
 * external mark masking an accidental static-import regression.
 *
 * @see renderers/gl/registerEChartsGL.ts — the GL-pack sibling.
 * @see renderers/echarts-lazy-feature.d.ts — TS7016 ambient declaration.
 * @see scripts/ci/x-charts-bundle-check.mjs — `ECHARTS_LAZY_FEATURE_EXTERNAL`.
 */

/**
 * Lazy-registrable ECharts features. Each key maps to a chart series OR
 * a coordinate-system component module kept OUT of the eager
 * `registerECharts()` list so the CONTRACT §8 `contractTotal` bundle
 * stays under the 350 KB gzip cap:
 *
 *   - `tree`         — hierarchical node-link series (PR-X16a)
 *   - `graph`        — network / entity-edge series (PR-X16b-prep)
 *   - `parallel`     — parallel-coordinates series + coordinate system
 *                      (PR-X16b-prep)
 *   - `pictorialBar` — pictogram bar series (PR-X16b-prep)
 *   - `candlestick`  — financial OHLC series (PR-X16b-prep)
 *   - `boxplot`      — statistical box-and-whisker series (PR-X16b-prep)
 *   - `calendar`     — calendar coordinate-system component (PR-X16b)
 *   - `polar`        — polar coordinate-system component (PR-X16c)
 *   - `themeRiver`   — stream-graph series + `singleAxis` component
 *                      (PR-X16d)
 *
 * The `graph`/`parallel`/`pictorialBar`/`candlestick`/`boxplot` charts
 * are design-lab-only niche wrappers converted from eager registration
 * to lazy by PR-X16b-prep — freeing the bundle headroom the rest of the
 * PR-X16 depth campaign needs.
 */
export type EChartsFeature =
  | 'tree'
  | 'graph'
  | 'parallel'
  | 'pictorialBar'
  | 'candlestick'
  | 'boxplot'
  | 'calendar'
  | 'polar'
  | 'themeRiver';

/**
 * Per-feature loaders. Each performs a side-effect dynamic import of the
 * direct `echarts/lib/chart/<name>` series module (or
 * `echarts/lib/component/<name>` for a coordinate-system component) —
 * that file ends with `use(install)`, so the feature self-registers on
 * the shared `echarts/core` namespace. The resolved module value is
 * intentionally ignored; the import is purely for its registration side
 * effect.
 *
 * `parallel` needs BOTH its series and the `parallel` coordinate-system
 * component, so its loader awaits a two-module `Promise.all` — the
 * feature flips to `registered` only once both side-effect imports run.
 *
 * Direct path, NOT the `echarts/charts` / `echarts/components` barrels:
 * see the file header.
 */
const FEATURE_LOADERS: Record<EChartsFeature, () => Promise<unknown>> = {
  tree: () => import('echarts/lib/chart/tree'),
  graph: () => import('echarts/lib/chart/graph'),
  // The `parallel` series renders into the `parallel` coordinate system;
  // both the chart series and its component module must register.
  parallel: () =>
    Promise.all([import('echarts/lib/chart/parallel'), import('echarts/lib/component/parallel')]),
  pictorialBar: () => import('echarts/lib/chart/pictorialBar'),
  candlestick: () => import('echarts/lib/chart/candlestick'),
  boxplot: () => import('echarts/lib/chart/boxplot'),
  // `calendar` is a coordinate-system component — the `heatmap` series
  // that renders into it stays eager (PR-X16b CalendarHeatmap).
  calendar: () => import('echarts/lib/component/calendar'),
  // `polar` is a coordinate-system component — the `bar` / `line` /
  // `scatter` series that render into it stay eager (PR-X16c PolarChart).
  polar: () => import('echarts/lib/component/polar'),
  // `themeRiver` is a stream-graph series that renders into the
  // `singleAxis` coordinate system; both modules must register, so the
  // loader awaits a two-module `Promise.all` (the `parallel` pattern).
  themeRiver: () =>
    Promise.all([
      import('echarts/lib/chart/themeRiver'),
      import('echarts/lib/component/singleAxis'),
    ]),
};

/** Features whose lazy module has finished registering. */
const registered = new Set<EChartsFeature>();
/** In-flight registration promises, keyed by feature, for de-duplication. */
const inFlight = new Map<EChartsFeature, Promise<void>>();

async function load(feature: EChartsFeature): Promise<void> {
  try {
    await FEATURE_LOADERS[feature]();
    registered.add(feature);
  } finally {
    // Drop the in-flight entry on BOTH success and failure: on success
    // `registered` is the source of truth; on failure the next mount
    // should be free to retry the dynamic import.
    inFlight.delete(feature);
  }
}

/**
 * Lazy-load and register an ECharts depth feature. Idempotent and
 * concurrency-safe: a feature already registered resolves immediately,
 * and overlapping callers share a single in-flight import promise.
 *
 * @returns A promise that resolves once the feature's series type is
 *   registered on the shared ECharts core. Rejects if the dynamic
 *   import fails (offline mid-session) — callers should surface a
 *   non-ready state and let the next mount retry.
 */
export function ensureEChartsFeatureRegistered(feature: EChartsFeature): Promise<void> {
  if (registered.has(feature)) return Promise.resolve();
  const existing = inFlight.get(feature);
  if (existing) return existing;

  const promise = load(feature);
  inFlight.set(feature, promise);
  return promise;
}

/**
 * Synchronous predicate: has {@link ensureEChartsFeatureRegistered}
 * already resolved for this feature? Used by `useRequiredEChartsFeature`
 * to return `'ready'` from its `useState` initializer without re-awaiting.
 */
export function isEChartsFeatureRegistered(feature: EChartsFeature): boolean {
  return registered.has(feature);
}

/**
 * Test-only escape hatch — drop cached registration so a unit test can
 * re-trigger the lazy import path. Pass a feature to reset just that
 * one, or omit the argument to clear everything. Production code should
 * never call this; registration is correct for the lifetime of the page.
 */
export function resetEChartsFeatureRegistration(feature?: EChartsFeature): void {
  if (feature) {
    registered.delete(feature);
    inFlight.delete(feature);
  } else {
    registered.clear();
    inFlight.clear();
  }
}

/**
 * Test-only escape hatch — mark a feature registered WITHOUT triggering
 * the dynamic import. Unit tests that mock the ECharts renderer
 * (`__tests__/fixtures/echarts-mock`) never load real ECharts; pre-marking
 * the feature keeps `useRequiredEChartsFeature` synchronously `'ready'`
 * so option-shape assertions stay synchronous. Production code should
 * never call this.
 */
export function markEChartsFeatureRegisteredForTest(feature: EChartsFeature): void {
  registered.add(feature);
  inFlight.delete(feature);
}
