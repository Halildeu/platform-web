/**
 * @internal Temporary helpers for the deprecated enterprise chart shims.
 *
 * These helpers exist because the design-system enterprise chart entries
 * delegate to `@mfe/x-charts` but expose a slightly different prop surface
 * (legacy DS API). The shims live in `packages/design-system/src/enterprise/`
 * and will be removed in Faz 21.7 once consumers migrate to `@mfe/x-charts`
 * directly.
 *
 * Keep this module intentionally narrow: chart-specific data/event adapters
 * live in their respective shim files. Only truly cross-chart helpers
 * (size mapping, format-options-to-formatter) belong here.
 */

import { formatValue, type FormatOptions } from './types';

/**
 * Discrete chart-size variants understood by `@mfe/x-charts` enterprise
 * chart wrappers (matches `ChartSize` from `@mfe/x-charts`).
 *
 * @internal
 */
export type AdapterChartSize = 'sm' | 'md' | 'lg';

/**
 * Map a legacy DS pixel-based size (e.g. `RadarChart.size: number`) to
 * a `@mfe/x-charts` `ChartSize` variant.
 *
 * Defaults to `"md"` when the input is `undefined`.
 *
 * @internal
 */
export function toChartSizeFromPx(value?: number): AdapterChartSize {
  if (value == null) return 'md';
  if (value <= 250) return 'sm';
  if (value <= 350) return 'md';
  return 'lg';
}

/**
 * Wrap a legacy DS `FormatOptions` object into a `valueFormatter` callback
 * compatible with `@mfe/x-charts`. Returns `undefined` when the options
 * object is empty so x-charts falls back to its default formatting.
 *
 * @internal
 */
export function toValueFormatter(opts?: FormatOptions): ((v: number) => string) | undefined {
  if (!opts || Object.keys(opts).length === 0) return undefined;
  return (v: number) => formatValue(v, opts);
}
