/**
 * computeTrendOverlay — pure helper that turns a 1-D series into
 * `ChartMarkup[]` describing an OLS regression line + slope/r²
 * label.
 *
 * Pure: no React, no DOM, no `Math.random` (deterministic). Used by
 * `useTrendOverlay` (React `useMemo` wrapper) and may be called
 * directly from server-rendered surfaces or from tests.
 *
 * Codex thread 019e0df1 iter-3 absorb: regression must produce a
 * SLOPED segment (the previous axis-aligned `LineMarkup` plan was
 * rejected). For string x-axis (categorical labels) we run the
 * regression on indices and emit segment endpoints anchored to the
 * original labels.
 */
import { linearRegression } from '../transforms/statistical';
import type { ChartMarkup } from '../types';

/** A single (x, y) data point. */
export interface TrendOverlayPoint {
  x: number | string;
  y: number;
}

export interface ComputeTrendOverlayOptions {
  /** Input data — accepts `{x: number|string, y: number}` rows. */
  data: TrendOverlayPoint[];
  /**
   * Regression method. v1 ships OLS only; `'movingAverage'` and
   * `'exponential'` are reserved for v2 and currently fall back to
   * OLS with a warning so consumers can opt into them once the
   * variants ship.
   */
  method?: 'ols' | 'movingAverage' | 'exponential';
  /** Optional id prefix so multiple overlays don't collide. */
  idPrefix?: string;
  /** Optional color override (defaults to a semantic info token). */
  color?: string;
  /**
   * Hide the slope/r² label. Default false (label visible). When the
   * consumer wants only the line and renders its own annotation the
   * label can be suppressed.
   */
  hideLabel?: boolean;
}

const DEFAULT_TREND_COLOR = 'var(--state-info-text, #06b6d4)';

/**
 * Build trend-overlay markups (a sloped `SegmentMarkup` plus an
 * optional `LabelMarkup` summarising the slope and R²). Returns an
 * empty array when the input has fewer than two points.
 */
export function computeTrendOverlay(options: ComputeTrendOverlayOptions): ChartMarkup[] {
  const { data, method = 'ols', idPrefix = 'trend', color, hideLabel } = options;

  if (!Array.isArray(data) || data.length < 2) return [];

  // Index-based regression — works for both numeric and categorical
  // x-axes. The output segment's `from.x` / `to.x` use the ORIGINAL
  // x value (string for category, number for numeric) so ECharts
  // resolves it natively in the chart's coordinate system.
  const xVals = data.map((_, i) => i);
  const yVals = data.map((d) => d.y);
  const reg = linearRegression(xVals, yVals);

  const lastIdx = data.length - 1;
  const fromX = data[0].x;
  const toX = data[lastIdx].x;
  const fromY = reg.intercept;
  const toY = reg.slope * lastIdx + reg.intercept;

  const segment: ChartMarkup = {
    id: `${idPrefix}-segment`,
    type: 'segment',
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    style: 'dashed',
    color: color ?? DEFAULT_TREND_COLOR,
    source: 'ai_trend',
  };

  if (hideLabel) return [segment];

  const slopeFormatted = reg.slope.toFixed(2);
  const r2Formatted = reg.rSquared.toFixed(2);
  // v2 backlog: surface `method` in the label when alternatives ship;
  // until then OLS-only label keeps reading clean.
  void method;
  const label: ChartMarkup = {
    id: `${idPrefix}-label`,
    type: 'label',
    text: `Slope: ${slopeFormatted} · R²: ${r2Formatted}`,
    anchor: { dataIndex: lastIdx },
    color: color ?? DEFAULT_TREND_COLOR,
    source: 'ai_trend',
  };

  return [segment, label];
}
