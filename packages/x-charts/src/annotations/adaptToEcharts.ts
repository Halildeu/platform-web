/**
 * adaptToEcharts — pure helper that converts a `ChartMarkup[]` array
 * into ECharts `series.markLine/markArea/markPoint` patches plus a
 * lookup map for click-event resolution.
 *
 * Pure: NO React hooks, NO ECharts instance access (`convertToPixel`
 * et al.), NO module-level side effects. Chart shims invoke this
 * during render and merge the result into their existing
 * `series` array. This keeps Storybook snapshot tests deterministic
 * and the Faz B AI overlays cheap to recompute.
 *
 * Codex review chain: thread 019e0df1 iter-1..iter-3 (AGREE); see
 * `docs/cross-filter.md` for related runtime overlay decisions.
 */
import { sanitizeChartText } from '../security/sanitizeChartText';
import { resolveCssVarColor } from '../utils/resolveCssVarColor';
import type {
  ChartMarkup,
  LineMarkup,
  SegmentMarkup,
  AreaMarkup,
  PointMarkup,
  LabelMarkup,
} from '../types';

/* ------------------------------------------------------------------ */
/*  Chart support matrix                                              */
/* ------------------------------------------------------------------ */

/**
 * V1 chart kinds the markup layer recognises. Hierarchical / network
 * charts (Treemap, Sankey, Sunburst) are listed here so the support
 * matrix can return an explicit `'no-op'` rather than silently
 * dropping markups.
 */
export type MarkupChartKind =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'scatter'
  | 'gauge'
  | 'radar'
  | 'treemap'
  | 'heatmap'
  | 'waterfall'
  | 'funnel'
  | 'sankey'
  | 'sunburst'
  // PR-X12c (Codex thread 019e2254 iter-2): geographic choropleth.
  // No coordinate-axis equivalent for markLine/markArea so all
  // markup types are no-op. Wrapper passes `chartType: 'geo'` so
  // the consumer gets a dev warning instead of silently dropped
  // markups (original PR-X12c draft passed 'bar' which the matrix
  // saw as full-support, generating patches that the GeoMap wrapper
  // then dropped silently).
  | 'geo';

export type MarkupTypeKey = ChartMarkup['type'];

/** Per-(chart, markup-type) support verdict. */
export type MarkupSupport = 'full' | 'partial' | 'no-op';

export type MarkupSupportMatrix = Record<MarkupChartKind, Record<MarkupTypeKey, MarkupSupport>>;

/**
 * Default support matrix — Codex iter-3 absorbed contract
 * (5 full + 1 partial + 7 no-op).
 *
 *   - Cartesian (Bar/Line/Area/Scatter/Heatmap) → full for all variants
 *   - Waterfall → partial (markLine merge with existing connectors;
 *     base series untouched)
 *   - Pie/Gauge/Radar/Funnel → no-op + dev warning (label without a
 *     coordinate system is unreliable; v2 will add native series-label
 *     patches and indicator anchors)
 *   - Treemap/Sankey/Sunburst → no-op + dev warning (hierarchical /
 *     network — no x/y axis semantics)
 *
 * Consumers can override per-chart by passing a custom `supportPolicy`
 * to `adaptToEcharts` if a future variant lights up support.
 */
export const DEFAULT_SUPPORT_MATRIX: MarkupSupportMatrix = {
  bar: { line: 'full', segment: 'full', area: 'full', point: 'full', label: 'full' },
  line: { line: 'full', segment: 'full', area: 'full', point: 'full', label: 'full' },
  area: { line: 'full', segment: 'full', area: 'full', point: 'full', label: 'full' },
  scatter: { line: 'full', segment: 'full', area: 'full', point: 'full', label: 'full' },
  heatmap: { line: 'full', segment: 'full', area: 'full', point: 'full', label: 'full' },
  waterfall: {
    line: 'partial',
    segment: 'full',
    area: 'partial',
    point: 'full',
    label: 'full',
  },
  pie: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  gauge: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  radar: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  funnel: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  treemap: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  sankey: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  sunburst: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
  // PR-X12c (Codex thread 019e2254 iter-2): all markup types no-op
  // on geographic maps. No cartesian axes, so markLine/markArea
  // can't be projected reliably. Dev warning surfaces the limit.
  geo: { line: 'no-op', segment: 'no-op', area: 'no-op', point: 'no-op', label: 'no-op' },
};

/* ------------------------------------------------------------------ */
/*  Adapter input + output                                            */
/* ------------------------------------------------------------------ */

/**
 * Optional data context for `LabelMarkup.anchor: { dataIndex }`
 * resolution. The adapter doesn't read pixel coords (no
 * `convertToPixel`); instead it looks up `labels[dataIndex]` /
 * `series[seriesIndex].data[dataIndex]` to produce a data-coordinate
 * anchor that ECharts then resolves via the chart's coordinate system.
 *
 * Chart shims build this from their own props at render time.
 */
export interface MarkupDataContext {
  /** x-axis category labels (Bar/Line/Area). */
  labels?: Array<string | number>;
  /** Series shape — minimal subset adapter needs for value lookup. */
  series?: Array<{ name?: string; data: unknown[] }>;
  /** Heatmap categorical axes. */
  xLabels?: string[];
  yLabels?: string[];
}

export interface AdaptOptions {
  chartType: MarkupChartKind;
  /** Bar / Waterfall orientation. Defaults to vertical. */
  orientation?: 'vertical' | 'horizontal';
  /** Emit human-readable warnings when set; chart shim drives this from `NODE_ENV`. */
  devMode?: boolean;
  /** Override the default support matrix per chart. */
  supportPolicy?: MarkupSupportMatrix;
  /** Data lookup for `dataIndex` anchors. */
  dataContext?: MarkupDataContext;
}

/**
 * Per-series patch — chart shims merge `markLine.data`, `markArea.data`
 * and `markPoint.data` into the ECharts series identified by either
 * `seriesIndex` or `seriesName`. Multi-series charts can carry
 * different markups per series in the same `markups` array.
 */
export interface SeriesPatch {
  seriesIndex?: number;
  seriesName?: string;
  markLine?: { data: unknown[] };
  markArea?: { data: unknown[] };
  markPoint?: { data: unknown[] };
}

export interface AdaptResult {
  /**
   * One entry per `(seriesIndex|seriesName, markupTypes)`. Chart shims
   * merge each patch into the matching ECharts series options.
   */
  seriesPatches: SeriesPatch[];
  /** V1 always empty; reserved for future explicit-pixel labels. */
  graphic: unknown[];
  /** Human-readable strings (one per dropped/no-op markup). */
  warnings: string[];
  /** `markup.id → ChartMarkup` for click-event resolution. */
  markupLookup: Map<string, ChartMarkup>;
}

/* ------------------------------------------------------------------ */
/*  Default semantic colors (DS theme tokens)                         */
/* ------------------------------------------------------------------ */

// These defaults are CSS-var token strings. They — and any
// consumer-supplied markup color — MUST be run through
// `resolveCssVarColor` before they reach an ECharts color field:
// the canvas renderer silently ignores `var(--…)` and would draw a
// dark fallback with no console error. The `mapXToEcharts` helpers
// below resolve `m.color ?? DEFAULT_X_COLOR` in a single call so
// both surfaces are covered centrally — no per-wrapper normalization
// of `markups` is needed.
const DEFAULT_LINE_COLOR = 'var(--action-primary, #3b82f6)';
const DEFAULT_AREA_COLOR = 'var(--state-warning-bg, #fef3c7)';
const DEFAULT_POINT_COLOR = 'var(--accent-primary, #8b5cf6)';
const DEFAULT_LABEL_COLOR = 'var(--text-secondary, #6b7280)';
const DEFAULT_AREA_OPACITY = 0.15;

/* ------------------------------------------------------------------ */
/*  Adapter — type-by-type ECharts mapping                             */
/* ------------------------------------------------------------------ */

function mapLineToEcharts(m: LineMarkup): unknown {
  // ECharts: `markLine.data: [{ name, xAxis|yAxis, label, lineStyle }]`
  // `name` is the click-lookup key; `label.formatter` is the visible
  // text. Codex iter-3 review locked these two roles.
  const axisKey = m.axis === 'y' ? 'yAxis' : 'xAxis';
  return {
    name: m.id,
    [axisKey]: m.value,
    label: {
      show: !!m.label,
      formatter: m.label?.text ? sanitizeChartText(m.label.text) : undefined,
      position: m.label?.position ?? 'end',
    },
    lineStyle: {
      color: resolveCssVarColor(m.color ?? DEFAULT_LINE_COLOR),
      type: m.style ?? 'solid',
      width: m.width ?? 1,
    },
  };
}

function mapSegmentToEcharts(m: SegmentMarkup): unknown {
  // ECharts segment: `markLine.data: [[{ coord:[x,y] }, { coord:[x,y] }]]`
  const fromCoord = [m.from.x, m.from.y];
  const toCoord = [m.to.x, m.to.y];
  return [
    {
      name: m.id,
      coord: fromCoord,
      lineStyle: {
        color: resolveCssVarColor(m.color ?? DEFAULT_LINE_COLOR),
        type: m.style ?? 'solid',
        width: m.width ?? 1,
      },
      label: {
        show: !!m.label,
        formatter: m.label?.text ? sanitizeChartText(m.label.text) : undefined,
        position: m.label?.position ?? 'middle',
      },
    },
    { coord: toCoord },
  ];
}

function mapAreaToEcharts(m: AreaMarkup): [unknown, unknown] {
  // ECharts: `markArea.data: [[{ name, xAxis|yAxis }, { xAxis|yAxis }]]`
  const axisKey = m.axis === 'y' ? 'yAxis' : 'xAxis';
  return [
    {
      name: m.id,
      [axisKey]: m.from,
      itemStyle: {
        color: resolveCssVarColor(m.color ?? DEFAULT_AREA_COLOR),
        opacity: m.opacity ?? DEFAULT_AREA_OPACITY,
      },
      label: {
        show: !!m.label,
        formatter: m.label?.text ? sanitizeChartText(m.label.text) : undefined,
      },
    },
    { [axisKey]: m.to },
  ];
}

function mapPointToEcharts(m: PointMarkup): unknown {
  return {
    name: m.id,
    coord: [m.x, m.y],
    symbol: m.symbol ?? 'circle',
    symbolSize: m.size ?? 8,
    itemStyle: { color: resolveCssVarColor(m.color ?? DEFAULT_POINT_COLOR) },
    label: {
      show: !!m.label,
      formatter: m.label?.text ? sanitizeChartText(m.label.text) : undefined,
    },
  };
}

/**
 * Resolve `LabelMarkup.anchor` → ECharts `coord: [x, y]`. Pure: looks
 * up `dataContext.labels[dataIndex]` for the x value and
 * `dataContext.series[seriesIndex].data[dataIndex]` for the y value.
 * Returns `null` when the lookup fails (warning surfaced by caller).
 */
function resolveLabelAnchor(
  m: LabelMarkup,
  ctx: MarkupDataContext | undefined,
): [number | string, number | string] | null {
  if ('x' in m.anchor && 'y' in m.anchor) {
    return [m.anchor.x, m.anchor.y];
  }
  // Heatmap-friendly categorical shorthand — closes the v2 backlog
  // item from Codex thread `019e0e20` iter-2. Bypasses `dataContext`
  // entirely (consumers who already know the cell labels can write
  // `anchor: { xLabel, yLabel }` and skip the normalized-array
  // gymnastics required for `{ dataIndex }` on Heatmap).
  if ('xLabel' in m.anchor && 'yLabel' in m.anchor) {
    return [m.anchor.xLabel, m.anchor.yLabel];
  }
  if (!ctx) return null;
  const { dataIndex, seriesIndex = 0 } = m.anchor;

  // Heatmap path — `dataContext.series[0].data[dataIndex]` carries
  // a `{ x, y, value }` cell tuple (HeatmapChart populates this from
  // its `normalized.normalized.map(([xi, yi, v]) => ({x: xCats[xi],
  // y: yCats[yi], value: v}))` so the resolver picks up the
  // categorical labels directly). Cartesian charts (Bar/Line/Area)
  // hit the fall-through path below.
  const seriesEntry = ctx.series?.[seriesIndex];
  const heatmapItem = seriesEntry?.data?.[dataIndex];
  if (heatmapItem && typeof heatmapItem === 'object' && 'x' in heatmapItem && 'y' in heatmapItem) {
    const cell = heatmapItem as { x: unknown; y: unknown };
    if (
      (typeof cell.x === 'string' || typeof cell.x === 'number') &&
      (typeof cell.y === 'string' || typeof cell.y === 'number')
    ) {
      return [cell.x, cell.y];
    }
  }

  // Cartesian fallback — labels[i] for x, series[seriesIndex].data[i] for y.
  const x = ctx.labels?.[dataIndex];
  const yRaw = seriesEntry?.data?.[dataIndex];
  if (x === undefined || yRaw === undefined) return null;
  // y can be {value, ...} object or raw number; normalise.
  const y =
    typeof yRaw === 'number'
      ? yRaw
      : typeof yRaw === 'object' && yRaw !== null && 'value' in yRaw
        ? (yRaw as { value: number }).value
        : null;
  return y === null ? null : [x, y];
}

function mapLabelToEcharts(m: LabelMarkup, ctx: MarkupDataContext | undefined): unknown | null {
  const coord = resolveLabelAnchor(m, ctx);
  if (!coord) return null;
  // markPoint with transparent symbol = floating label without a marker
  // graphic. `symbol: 'circle'` + `symbolSize: 1` + opacity 0 keeps the
  // hit target clickable for `onMarkupClick` (Codex iter-3 advisory).
  return {
    name: m.id,
    coord,
    symbol: 'circle',
    symbolSize: 1,
    itemStyle: { opacity: 0 },
    label: {
      show: true,
      formatter: sanitizeChartText(m.text) ?? '',
      color: resolveCssVarColor(m.color ?? DEFAULT_LABEL_COLOR),
      // `background` is a public color surface too — resolve it
      // before it becomes the canvas `backgroundColor` field.
      // `undefined` passes through untouched (resolver overload).
      backgroundColor: resolveCssVarColor(m.background),
      padding: [2, 4],
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Routing — per-series patch builder                                 */
/* ------------------------------------------------------------------ */

interface PerSeriesAccumulator {
  markLine: unknown[];
  markArea: unknown[];
  markPoint: unknown[];
}

function emptyAccumulator(): PerSeriesAccumulator {
  return { markLine: [], markArea: [], markPoint: [] };
}

function patchKeyFor(m: ChartMarkup): string {
  // Use index when present, otherwise fall back to seriesName, finally
  // a "default" sentinel for charts without per-series targeting.
  if (m.target?.seriesIndex !== undefined) return `idx:${m.target.seriesIndex}`;
  if (m.target?.seriesName !== undefined) return `name:${m.target.seriesName}`;
  return 'default';
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Convert a flat `ChartMarkup[]` into per-series ECharts patches +
 * a click-lookup map. Pure: no React, no ECharts instance.
 *
 * @example
 *   const result = adaptToEcharts([
 *     { id: 'budget', type: 'line', axis: 'y', value: 1000 },
 *   ], { chartType: 'bar', devMode: true });
 *   // result.seriesPatches[0].markLine.data[0] = { name: 'budget', yAxis: 1000, ... }
 */
export function adaptToEcharts(markups: ChartMarkup[], options: AdaptOptions): AdaptResult {
  const policy = options.supportPolicy ?? DEFAULT_SUPPORT_MATRIX;
  const chartPolicy = policy[options.chartType];
  const warnings: string[] = [];
  const markupLookup = new Map<string, ChartMarkup>();
  const accByKey = new Map<string, PerSeriesAccumulator>();
  const targetByKey = new Map<string, { seriesIndex?: number; seriesName?: string }>();

  for (const m of markups) {
    markupLookup.set(m.id, m);

    const support = chartPolicy[m.type];
    if (support === 'no-op') {
      warnings.push(
        `[ChartMarkup] ${options.chartType}: ${m.type} markup is not supported on this chart kind (id=${m.id}).`,
      );
      continue;
    }

    const key = patchKeyFor(m);
    if (!accByKey.has(key)) {
      accByKey.set(key, emptyAccumulator());
      targetByKey.set(key, {
        seriesIndex: m.target?.seriesIndex,
        seriesName: m.target?.seriesName,
      });
    }
    const acc = accByKey.get(key)!;

    switch (m.type) {
      case 'line':
        acc.markLine.push(mapLineToEcharts(m));
        break;
      case 'segment':
        acc.markLine.push(mapSegmentToEcharts(m));
        break;
      case 'area':
        acc.markArea.push(mapAreaToEcharts(m));
        break;
      case 'point':
        acc.markPoint.push(mapPointToEcharts(m));
        break;
      case 'label': {
        const entry = mapLabelToEcharts(m, options.dataContext);
        if (entry === null) {
          warnings.push(
            `[ChartMarkup] ${options.chartType}: label markup "${m.id}" anchor could not be resolved (dataContext missing or dataIndex out of range).`,
          );
        } else {
          acc.markPoint.push(entry);
        }
        break;
      }
    }
  }

  const seriesPatches: SeriesPatch[] = [];
  for (const [key, acc] of accByKey) {
    const hasAny = acc.markLine.length > 0 || acc.markArea.length > 0 || acc.markPoint.length > 0;
    // Skip empty patches — labels that failed `dataContext` lookup
    // pre-allocate an accumulator but never push anything; we don't
    // want to surface a phantom seriesPatch for them.
    if (!hasAny) continue;
    const target = targetByKey.get(key) ?? {};
    const patch: SeriesPatch = { ...target };
    if (acc.markLine.length > 0) patch.markLine = { data: acc.markLine };
    if (acc.markArea.length > 0) patch.markArea = { data: acc.markArea };
    if (acc.markPoint.length > 0) patch.markPoint = { data: acc.markPoint };
    seriesPatches.push(patch);
  }

  return {
    seriesPatches,
    graphic: [], // V1 unused; reserved for future explicit-pixel labels.
    warnings,
    markupLookup,
  };
}
