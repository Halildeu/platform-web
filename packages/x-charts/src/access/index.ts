/**
 * Internal access-control surface for `@mfe/x-charts`.
 *
 * Codex iter-4 plan AGREE: these helpers are NOT re-exported from the
 * package root barrel (`packages/x-charts/src/index.ts`). The public
 * API is the `access` + `accessReason` props on each chart wrapper;
 * direct consumers do not need to invoke `ChartAccessGate` or
 * `guardChartCallback` themselves.
 */
export { ChartAccessGate } from './ChartAccessGate';
export type { ChartAccessGateProps } from './ChartAccessGate';
export { chartAccessClassName } from './chartAccessClassName';
export { guardChartCallback } from './guardChartCallback';
