/**
 * useAnomalyOverlay — React `useMemo` wrapper around
 * `computeAnomalyOverlay`. Pure compute lives in the standalone
 * file; this hook only memoises so chart shims don't recompute IQR
 * fences on every render.
 *
 * Faz 21.11 PR-A2b-a11y added a sibling `useAnomalySummary` hook
 * (NEW — same pattern, returns `AnomalySummary[]`) so a11y consumers
 * can subscribe to the SEMANTIC anomaly view alongside the
 * markup. `useAnomalyOverlay`'s return shape is intentionally
 * left byte-identical (Codex iter-1 §1) — every existing consumer
 * keeps working without an opt-in.
 */
import { useMemo } from 'react';
import {
  computeAnomalyOverlay,
  computeAnomalySummary,
  type AnomalySummary,
  type ComputeAnomalyOverlayOptions,
  type ComputeAnomalySummaryOptions,
} from './computeAnomalyOverlay';
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
      // PR-A2b-ui pill knobs — without these in the deps a consumer
      // toggling between marker / pill, swapping `valueFormatter` or
      // tightening the cap would silently keep the previous overlay.
      options.labelVariant,
      options.valueFormatter,
      options.maxPills,
      options.pillBackground,
      options.pillTextColor,
    ],
  );
}

/**
 * useAnomalySummary — React `useMemo` wrapper around
 * `computeAnomalySummary`. Returns the canonical SEMANTIC anomaly
 * view consumed by `ChartAriaLive` (and any other a11y / external
 * surface) for screen-reader announcements.
 *
 * Faz 21.11 PR-A2b-a11y. Pairs cleanly with `useAnomalyOverlay`
 * (visual markup) — both run off the same `collectAnomalyHits`
 * detector internally so a future detector swap stays single-
 * source.
 */
export function useAnomalySummary(options: ComputeAnomalySummaryOptions): AnomalySummary[] {
  return useMemo(
    () => computeAnomalySummary(options),
    [
      options.data,
      options.method,
      options.k,
      options.idPrefix,
      options.valueFormatter,
      options.severityHighFraction,
    ],
  );
}
