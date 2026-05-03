/**
 * buildResponsiveDataZoom — pure ECharts dataZoom option builder
 *
 * Adds an `inside` (drag/scroll) dataZoom slider to the category axis when
 * the label count exceeds the threshold and the breakpoint is mobile or
 * tablet. Returns `null` when no dataZoom should be rendered so wrappers
 * can spread it conditionally:
 *
 * ```ts
 * const dz = buildResponsiveDataZoom({ breakpoint, labelCount });
 * return {
 *   ...(dz ? { dataZoom: dz } : {}),
 *   ...
 * };
 * ```
 *
 * Codex REVISE 019defa5:
 *   - Don't enable on every chart unconditionally.
 *   - Threshold-driven (default 30 categories) so we don't slap a slider on
 *     a 6-bar chart.
 *   - `inside` only — slider type at the bottom would steal more vertical
 *     space than it saves on mobile.
 *   - Only x-axis (or whichever axis is the category axis) gets it.
 */

import type { Breakpoint } from '../useResponsiveChart';

/* ------------------------------------------------------------------ */
/*  Public params                                                      */
/* ------------------------------------------------------------------ */

export interface BuildResponsiveDataZoomParams {
  /** Active breakpoint. */
  breakpoint: Breakpoint;
  /** Total label count on the category axis. */
  labelCount: number;
  /**
   * Index of the axis dataZoom should target. Vertical bar charts: 0 (xAxis).
   * Horizontal bar charts: 0 (yAxis is the category axis but ECharts still
   * indexes it 0). Pass the wrapper-resolved value.
   * @default 0
   */
  axisIndex?: number;
  /**
   * Whether this is a horizontal-orientation chart so dataZoom targets the
   * y-axis (category) instead of the x-axis.
   * @default false
   */
  horizontal?: boolean;
  /**
   * Threshold — only enable dataZoom above this many labels.
   * @default 30
   */
  threshold?: number;
}

/* ------------------------------------------------------------------ */
/*  Output shape                                                       */
/* ------------------------------------------------------------------ */

export interface ResponsiveDataZoomOption {
  type: 'inside';
  xAxisIndex?: number;
  yAxisIndex?: number;
  start: number;
  end: number;
  zoomLock: false;
  moveOnMouseMove: true;
  preventDefaultMouseMove: false;
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildResponsiveDataZoom(
  params: BuildResponsiveDataZoomParams,
): ResponsiveDataZoomOption[] | null {
  const { breakpoint, labelCount, axisIndex = 0, horizontal = false, threshold = 30 } = params;

  // Desktop: don't enable by default — large containers can render 100+
  // labels with `axisLabel.interval: 'auto'` safely.
  if (breakpoint === 'desktop') return null;

  // Below threshold: slider is just clutter.
  if (labelCount <= threshold) return null;

  // Initial window — show the first 30 labels (or 50% of the dataset,
  // whichever is smaller) so users immediately see something readable.
  const initialFraction = Math.min(threshold / labelCount, 0.5);
  const start = 0;
  const end = Math.round(initialFraction * 100);

  const zoom: ResponsiveDataZoomOption = {
    type: 'inside',
    start,
    end,
    zoomLock: false,
    moveOnMouseMove: true,
    preventDefaultMouseMove: false,
    ...(horizontal ? { yAxisIndex: axisIndex } : { xAxisIndex: axisIndex }),
  };

  return [zoom];
}
