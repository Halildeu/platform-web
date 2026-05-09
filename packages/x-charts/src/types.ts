/* Shared chart types — canonical definitions for x-charts */

export type ChartSize = 'sm' | 'md' | 'lg';

export type ChartDataPoint = {
  label: string;
  value: number;
  color?: string;
};

export type ChartSeries = {
  name: string;
  data: number[];
  color?: string;
};

export type ChartClickEvent = {
  datum: Record<string, unknown>;
  seriesId?: string;
  xKey?: string;
  yKey?: string;
  value?: number;
  label?: string;
};

export type ChartLocaleText = {
  noData?: string;
  total?: string;
};

/* ------------------------------------------------------------------ */
/*  ChartMarkup — runtime visual overlays                              */
/*                                                                     */
/*  Highcharts annotation parity (Faz A + B sprint, Codex thread       */
/*  019e0df1). Distinct from spec-level `ChartAnnotation`              */
/*  (`spec/ChartSpec.ts`, declarative chart authoring) and             */
/*  collaboration-level `Annotation`                                   */
/*  (`collaboration/chart-annotations.ts`, multi-user comments).       */
/*                                                                     */
/*  ChartMarkup is the runtime overlay layer: trend lines, threshold   */
/*  bands, anomaly markers, KPI labels — anything the chart RENDERS    */
/*  on top of the data series (vs. data itself or user comments).     */
/* ------------------------------------------------------------------ */

/**
 * Common shape shared by every markup variant. `id` is required so the
 * adapter can build a lookup map and the cross-shim click handler can
 * resolve the markup back from the ECharts entry name on click.
 */
export interface BaseMarkup {
  /** Stable id used as ECharts entry `name` for click-event lookup. */
  id: string;
  /** Optional explicit aria-label override (defaults to `${type}: ${value}` or `${text}`). */
  ariaLabel?: string;
  /** Origin tag for testing / dev tooling. */
  source?: 'manual' | 'ai_trend' | 'ai_anomaly' | 'threshold';
  /**
   * Optional series scoping for multi-series charts. When provided the
   * adapter routes the markup into a per-series patch (so different
   * series can carry different markups in the same chart). Falls back
   * to the first series when omitted.
   */
  target?: { seriesIndex?: number; seriesName?: string };
}

/** Axis-aligned threshold line (e.g. budget = 1000). */
export interface LineMarkup extends BaseMarkup {
  type: 'line';
  axis: 'x' | 'y';
  /** Numeric for value axes; string for category axes (e.g. `'Q3'`). */
  value: number | string;
  label?: { text: string; position?: 'start' | 'middle' | 'end' };
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
}

/**
 * Sloped line segment defined by two data coordinates. Used by
 * `computeTrendOverlay` for OLS regression lines (axis-aligned
 * `LineMarkup` cannot express slope; ECharts `markLine.data` accepts
 * a 2-element array `[{coord:[x,y]},{coord:[x,y]}]` for segments).
 */
export interface SegmentMarkup extends BaseMarkup {
  type: 'segment';
  from: { x: number | string; y: number | string };
  to: { x: number | string; y: number | string };
  label?: { text: string; position?: 'start' | 'middle' | 'end' };
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
}

/** Highlighted band (e.g. "warning zone" between Q2 and Q3). */
export interface AreaMarkup extends BaseMarkup {
  type: 'area';
  axis: 'x' | 'y';
  from: number | string;
  to: number | string;
  label?: { text: string };
  color?: string;
  /** 0–1, default 0.15 (DS theme aware). */
  opacity?: number;
}

/** Single emphasized data point with optional label (e.g. anomaly). */
export interface PointMarkup extends BaseMarkup {
  type: 'point';
  /** Heatmap may use string for either axis (categorical y supported). */
  x: number | string;
  y: number | string;
  label?: { text: string };
  symbol?: 'circle' | 'rect' | 'triangle' | 'diamond' | 'arrow';
  color?: string;
  /** Pixel size (default 8). */
  size?: number;
}

/**
 * Free-floating text label. Implemented via `markPoint` with a
 * transparent symbol + visible label so the adapter stays pure (no
 * `convertToPixel` instance call); see `adaptToEcharts.ts` for the
 * exact mapping and the dead-zone test in the contract suite.
 *
 * Anchor variants:
 *   - `{ x, y }` — explicit data coordinate (any axis type)
 *   - `{ dataIndex, seriesIndex? }` — resolved against `dataContext`
 *     in the adapter (no runtime ECharts call)
 */
export interface LabelMarkup extends BaseMarkup {
  type: 'label';
  text: string;
  anchor: { x: number | string; y: number | string } | { dataIndex: number; seriesIndex?: number };
  color?: string;
  background?: string;
}

/**
 * Discriminated union of every supported markup variant. Adapter
 * dispatches on `type` and consumers can narrow with TypeScript's
 * automatic discriminator-tag inference.
 */
export type ChartMarkup = LineMarkup | SegmentMarkup | AreaMarkup | PointMarkup | LabelMarkup;

/**
 * Event delivered to `onMarkupClick`. Distinct from
 * `ChartClickEvent` (data-point click) so cross-filter wrapper and
 * markup interaction never collide. Chart shims early-return on
 * markup clicks so `onDataPointClick` does NOT fire for the same
 * event (see ECharts `params.componentType === 'markLine' | …`).
 */
export interface ChartMarkupClickEvent {
  /** The original markup whose visual was clicked. */
  markup: ChartMarkup;
  /** Chart kind that emitted the event. */
  chartType: string;
  /** Optional series index resolved from the markup target / params. */
  seriesIndex?: number;
  /** Optional data index when the markup is anchored to a data point. */
  dataIndex?: number;
  /** Raw ECharts params for power users; treat as opaque. */
  nativeParams: unknown;
}
