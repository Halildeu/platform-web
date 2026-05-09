/**
 * useAnomalyOverlay — React `useMemo` wrapper around
 * `computeAnomalyOverlay`. Pure compute lives in the standalone
 * file; this hook only memoises so chart shims don't recompute IQR
 * fences on every render.
 */
import { useMemo } from 'react';
import { computeAnomalyOverlay, type ComputeAnomalyOverlayOptions } from './computeAnomalyOverlay';
import type { ChartMarkup } from '../types';

export function useAnomalyOverlay(options: ComputeAnomalyOverlayOptions): ChartMarkup[] {
  return useMemo(
    () => computeAnomalyOverlay(options),
    [
      options.data,
      options.method,
      options.k,
      options.idPrefix,
      options.color,
      options.size,
      options.showLabel,
    ],
  );
}
