/**
 * useMarkupAdapter — React hook wrapper around `adaptToEcharts`.
 *
 * Memoises the per-render adapter call and surfaces dev warnings via
 * `console.warn` (suppressed in production). Chart shims call this
 * during render and merge `seriesPatches` into their ECharts options.
 *
 * Pure compute lives in `adaptToEcharts.ts`; this is the React-side
 * ergonomics shim only. Codex iter-3 absorbed split (compute first,
 * hook second).
 */
import { useEffect, useMemo, useRef } from 'react';
import { adaptToEcharts, type AdaptOptions, type AdaptResult } from './adaptToEcharts';
import type { ChartMarkup } from '../types';

export interface UseMarkupAdapterOptions extends Omit<AdaptOptions, 'devMode'> {
  /**
   * Force the dev-warning surface on/off. Defaults to
   * `process.env.NODE_ENV !== 'production'`. Test suites may want
   * to flip this explicitly.
   */
  devMode?: boolean;
}

const DEFAULT_DEV_MODE = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Adapt a `ChartMarkup[]` array into ECharts patches inside a chart
 * shim's render. Re-runs the adapter only when the inputs change
 * (referential `markups`, primitive option fields, dataContext shape).
 */
export function useMarkupAdapter(
  markups: ChartMarkup[] | undefined,
  options: UseMarkupAdapterOptions,
): AdaptResult {
  const devMode = options.devMode ?? DEFAULT_DEV_MODE;
  const result = useMemo(
    () =>
      adaptToEcharts(markups ?? [], {
        chartType: options.chartType,
        orientation: options.orientation,
        devMode,
        supportPolicy: options.supportPolicy,
        dataContext: options.dataContext,
      }),
    [
      markups,
      options.chartType,
      options.orientation,
      devMode,
      options.supportPolicy,
      options.dataContext,
    ],
  );

  // Dev warnings are surfaced via console.warn so the consumer sees
  // them in the browser devtools (unsupported chart kind, unresolved
  // anchor, etc.). We dedupe within a single render by emitting once
  // per `(warnings.join)` signature so React StrictMode double-render
  // doesn't double-log.
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!devMode) return;
    if (result.warnings.length === 0) return;
    const signature = result.warnings.join('||');
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    for (const w of result.warnings) {
       
      console.warn(w);
    }
  }, [devMode, result.warnings]);

  return result;
}
