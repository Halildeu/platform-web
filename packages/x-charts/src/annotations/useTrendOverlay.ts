/**
 * useTrendOverlay — React `useMemo` wrapper around `computeTrendOverlay`.
 *
 * Pure compute lives in `computeTrendOverlay.ts`; this hook only
 * memoises the call so the chart shim doesn't recompute the
 * regression on every render. Codex thread 019e0df1 iter-3 absorb
 * pattern (compute first, hook wrapper second).
 */
import { useMemo } from 'react';
import { computeTrendOverlay, type ComputeTrendOverlayOptions } from './computeTrendOverlay';
import type { ChartMarkup } from '../types';

export function useTrendOverlay(options: ComputeTrendOverlayOptions): ChartMarkup[] {
  return useMemo(
    () => computeTrendOverlay(options),
    [options.data, options.method, options.idPrefix, options.color, options.hideLabel],
  );
}
