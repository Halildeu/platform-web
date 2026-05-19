/**
 * useChartA11y — Default-on a11y composer for x-charts wrappers.
 *
 * Codex iter-7 (PR-B1): hibrit pattern — core chart wrapper'ları bu hook
 * ile default-on a11y kazanır; sayfa-level wrapper'lar
 * (`ChartDataTable`, `ChartKeyboardNav`) opsiyonel olarak kalmaya devam
 * eder. Hook tek kaynak: `aria-label` + `aria-describedby` + visually
 * hidden data table fallback + keyboard navigation contract +
 * aria-live announcement region.
 *
 * Asıl tasarım kararları (Codex iter-7):
 *
 *   1. Default-on: chart wrapper'ı `useChartA11y(...)` çağırır ve
 *      `containerProps`'u root div'ine spread eder. Tek satırla 5
 *      a11y maddesi sağlanır.
 *   2. ChartKeyboardNav rewrite: `role="application"` kaldırıldı;
 *      `role="region"` + `aria-label` + focusable surface.
 *      `dispatchAction({ type: 'highlight'/'downplay'/'showTip' })`
 *      ECharts canvas içinde gerçek highlight üretir.
 *   3. Home/End/Arrow/Enter/Escape standart desteklenir.
 *   4. Wrapper component'ler obsolete değil — sayfa-level toggle UI
 *      (custom data table konumu, custom announcement bar) için
 *      hala kullanılabilir.
 *
 * @see docs/faz-21-5-b-a11y-audit.md
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ECharts } from '../renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartA11yKind =
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
  // PR-X6 (Codex thread 019e1e30): statistical box-and-whisker chart.
  | 'boxplot'
  // PR-X7 (Codex thread 019e1e30): financial OHLC chart.
  | 'candlestick'
  // PR-X10 (Codex thread 019e1e30): decorative pictogram bar chart.
  | 'pictorialBar'
  // PR-X12a (Codex thread 019e2119 AGREE): parallel coordinates plot.
  | 'parallel'
  // PR-X12b (Codex thread 019e2119 AGREE): network/graph topology.
  | 'graph'
  // PR-X12c (Codex thread 019e2254 AGREE): geographic choropleth map.
  | 'geo'
  // Faz 21.11 P1a — 3D Extension Pack. Each 3D wrapper feeds the
  // shell its own kind so the default aria-label fallback can name
  // the chart correctly ("scatter3d chart with 1024 data points").
  // P1c adds 'globe'.
  | 'scatter3d'
  // Faz 21.11 P1b — Surface3D ECharts `'surface'` series, Lines3D
  // multi-series `'line3D'` (one per path) on shared cartesian3D /
  // grid3D. Codex thread `019e10d7` iter-2.
  | 'surface3d'
  | 'lines3d'
  // Faz 21.11 P1c — Globe wrapper (geo sphere with multi-layer
  // scatter3D / lines3D / bar3D on `coordinateSystem: 'globe'`).
  // Codex thread `019e10f8` iter-1.
  | 'globe'
  // PR-X16a (Codex thread 019e32da AGREE): hierarchical node-link
  // tree (ECharts `tree` series). Org-chart / hierarchy use-case.
  | 'tree'
  // PR-X16c (Codex thread 019e35b3 AGREE): bar/line/scatter series on a
  // lazy `polar` coordinate system. Categorical radial chart.
  | 'polar'
  // PR-X16d (Codex thread 019e3615 AGREE): themeRiver stream-graph on a
  // lazy `singleAxis` coordinate system.
  | 'themeRiver'
  // PR-X16e (Codex thread 019e365b AGREE): custom renderItem series —
  // Gantt timeline / project-schedule chart.
  | 'gantt'
  // Codex thread 019e3f75 AGREE: HR age × gender demographic pyramid —
  // diverging horizontal bar on a symmetric value axis.
  | 'populationPyramid'
  // Codex thread 019e41cd AGREE: dual-axis composite bar + line chart.
  | 'combo'
  // Codex thread 019e425b AGREE: standalone effectScatter wrapper with
  // ripple animation — distinct from `scatter` (no big-data/brush API).
  | 'effectScatter';

export interface ChartA11yDataPoint {
  /** Display label (axis category, slice name, etc.). */
  label: string;
  /** Numeric value. */
  value: number;
}

export interface UseChartA11yOptions {
  /** Chart kind — used for default aria-label fallback. */
  chartType: ChartA11yKind;
  /** Data points (label + value). */
  data: ChartA11yDataPoint[];
  /** Optional chart title (used in aria-label and table caption). */
  title?: string;
  /** Optional chart description (overrides default aria-label if set). */
  description?: string;
  /** Optional value formatter (used in data table cells). */
  valueFormatter?: (value: number) => string;
  /**
   * ECharts instance — when provided, keyboard navigation calls
   * `instance.dispatchAction({ type: 'highlight' / 'downplay' })`
   * to drive ECharts canvas highlight in sync with active index.
   */
  echartsInstance?: ECharts | null;
  /**
   * Custom column header for the data table value column.
   * @default 'Value'
   */
  valueColumnHeader?: string;
  /**
   * Custom column header for the data table label column.
   * @default 'Label'
   */
  labelColumnHeader?: string;
}

export interface ChartA11yContainerProps {
  role: 'region';
  tabIndex: number;
  'aria-label': string;
  'aria-describedby': string;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLDivElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
}

export interface UseChartA11yResult {
  /** Spread these on the chart's root container div. */
  containerProps: ChartA11yContainerProps;
  /** Stable ID for the hidden data table (matches `aria-describedby`). */
  describedById: string;
  /** Stable ID for the live region. */
  liveRegionId: string;
  /** Computed aria-label (reuses description / title / fallback). */
  ariaLabel: string;
  /** Currently active data point index (-1 when none). */
  activeIndex: number;
  /** Programmatically set the active index (e.g. on cross-filter). */
  setActiveIndex: (index: number) => void;
  /** Append a screen-reader announcement to the live region. */
  announce: (message: string) => void;
  /** Latest live-region message — render inside an aria-live element. */
  liveMessage: string;
  /**
   * Render the visually-hidden data table. Place it inside the chart
   * container so `aria-describedby` resolves to a same-document element.
   */
  renderHiddenDataTable: () => HiddenDataTablePayload;
}

export interface HiddenDataTablePayload {
  /** ID matching `aria-describedby`. */
  id: string;
  /** Caption text. */
  caption: string;
  /** Header row labels. */
  headers: [string, string];
  /** Data rows (label + formatted value). */
  rows: Array<{ label: string; value: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CHART_TYPE_ARIA_NOUN: Record<ChartA11yKind, string> = {
  bar: 'Bar chart',
  line: 'Line chart',
  area: 'Area chart',
  pie: 'Pie chart',
  scatter: 'Scatter chart',
  gauge: 'Gauge chart',
  radar: 'Radar chart',
  treemap: 'Treemap chart',
  heatmap: 'Heatmap chart',
  waterfall: 'Waterfall chart',
  funnel: 'Funnel chart',
  sankey: 'Sankey diagram',
  sunburst: 'Sunburst chart',
  // PR-X6 (Codex thread 019e1e30): statistical distribution chart with
  // five-number summary (min, Q1, median, Q3, max).
  boxplot: 'Box plot',
  // PR-X7 (Codex thread 019e1e30): financial OHLC chart.
  candlestick: 'Candlestick chart',
  // PR-X10 (Codex thread 019e1e30): decorative pictogram bar chart.
  pictorialBar: 'Pictogram bar chart',
  // PR-X12a (Codex thread 019e2119 AGREE): multi-dim parallel coordinates plot.
  parallel: 'Parallel coordinates chart',
  // PR-X12b (Codex thread 019e2119 AGREE): network / entity-edge graph.
  graph: 'Network graph',
  // PR-X12c (Codex thread 019e2254 AGREE): geographic choropleth map.
  geo: 'Geographic map',
  // Faz 21.11 P1a — 3D Extension Pack. P1b adds 'Surface 3D chart' +
  // '3D line chart'; P1c adds 'Globe' (geo).
  scatter3d: '3D scatter chart',
  // Faz 21.11 P1b — Surface3D + Lines3D wrappers. Lines3D wrapper
  // emits one `line3D` ECharts series per path on the shared
  // `cartesian3D / grid3D`; the official `lines3D` (globe / geo)
  // family is deferred. Codex thread `019e10d7` iter-2.
  surface3d: '3D surface chart',
  lines3d: '3D line chart',
  // Faz 21.11 P1c — Globe (geo sphere).
  globe: 'Globe chart',
  // PR-X16a (Codex thread 019e32da AGREE): hierarchical node-link tree.
  tree: 'Tree chart',
  // PR-X16c (Codex thread 019e35b3 AGREE): categorical polar / radial chart.
  polar: 'Polar chart',
  // PR-X16d (Codex thread 019e3615 AGREE): themeRiver stream graph.
  themeRiver: 'Stream graph',
  // PR-X16e (Codex thread 019e365b AGREE): custom-render Gantt timeline.
  gantt: 'Gantt chart',
  // Codex thread 019e3f75 AGREE: HR age × gender demographic pyramid.
  populationPyramid: 'Population pyramid chart',
  // Codex thread 019e41cd AGREE: dual-axis composite bar + line chart.
  combo: 'Combination chart',
  // Codex thread 019e425b AGREE: standalone effectScatter wrapper.
  effectScatter: 'Effect scatter chart',
};

const defaultFormatter = (v: number): string =>
  Number.isFinite(v) ? new Intl.NumberFormat().format(v) : String(v);

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useChartA11y(options: UseChartA11yOptions): UseChartA11yResult {
  const {
    chartType,
    data,
    title,
    description,
    valueFormatter,
    echartsInstance,
    valueColumnHeader = 'Value',
    labelColumnHeader = 'Label',
  } = options;

  const tableId = useId();
  const liveId = useId();
  const describedById = `${tableId}-data-table`;
  const liveRegionId = `${liveId}-live`;

  const fmt = valueFormatter ?? defaultFormatter;

  // Compute aria-label reactively. Description wins over title; title
  // beats default fallback.
  const ariaLabel = useMemo<string>(() => {
    if (description && description.trim().length > 0) return description;
    const noun = CHART_TYPE_ARIA_NOUN[chartType];
    if (title && title.trim().length > 0) return `${noun}: ${title}`;
    if (data.length === 0) return `${noun} — no data`;
    return `${noun} with ${data.length} data point${data.length === 1 ? '' : 's'}`;
  }, [chartType, title, description, data.length]);

  const [activeIndex, setActiveIndexState] = useState<number>(-1);
  const lastDispatchedIndex = useRef<number>(-1);

  // Keep ECharts canvas highlight in sync with keyboard-driven active
  // index. Calls dispatchAction defensively — instance may not be ready
  // on first render.
  useEffect(() => {
    if (!echartsInstance) return;
    const prev = lastDispatchedIndex.current;
    if (prev !== -1 && prev !== activeIndex) {
      try {
        echartsInstance.dispatchAction({
          type: 'downplay',
          dataIndex: prev,
        });
      } catch {
        // ECharts instance may have been disposed; ignore.
      }
    }
    if (activeIndex >= 0 && activeIndex < data.length) {
      try {
        echartsInstance.dispatchAction({
          type: 'highlight',
          dataIndex: activeIndex,
        });
        echartsInstance.dispatchAction({
          type: 'showTip',
          dataIndex: activeIndex,
        });
      } catch {
        // Instance disposed or seriesIndex missing.
      }
    }
    lastDispatchedIndex.current = activeIndex;
  }, [activeIndex, echartsInstance, data.length]);

  const setActiveIndex = useCallback((index: number) => {
    setActiveIndexState(Math.max(-1, Math.min(index, Number.MAX_SAFE_INTEGER)));
  }, []);

  // Live region state — last announced message, rendered by consumer.
  const [liveMessage, setLiveMessage] = useState<string>('');

  const announce = useCallback((message: string) => {
    if (typeof message !== 'string') return;
    setLiveMessage(message);
  }, []);

  // Keyboard navigation contract:
  //   ArrowRight / ArrowDown → next data point
  //   ArrowLeft  / ArrowUp   → prev data point
  //   Home                   → first
  //   End                    → last
  //   Enter / Space          → announce active point details
  //   Escape                 → clear active (downplay all)
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (data.length === 0) return;
      let handled = true;
      let next = activeIndex;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = activeIndex < 0 ? 0 : Math.min(activeIndex + 1, data.length - 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = activeIndex < 0 ? data.length - 1 : Math.max(activeIndex - 1, 0);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = data.length - 1;
          break;
        case 'Escape':
          setActiveIndexState(-1);
          announce(`${CHART_TYPE_ARIA_NOUN[chartType]} selection cleared`);
          break;
        case 'Enter':
        case ' ':
          if (activeIndex >= 0 && activeIndex < data.length) {
            const point = data[activeIndex];
            announce(`${point.label}: ${fmt(point.value)}`);
          }
          break;
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
        if (
          next !== activeIndex &&
          event.key !== 'Escape' &&
          event.key !== 'Enter' &&
          event.key !== ' '
        ) {
          setActiveIndexState(next);
          const point = data[next];
          if (point) {
            announce(`${point.label}: ${fmt(point.value)}`);
          }
        }
      }
    },
    [activeIndex, data, fmt, chartType, announce],
  );

  const onFocus = useCallback(
    (_event: React.FocusEvent<HTMLDivElement>) => {
      if (activeIndex < 0 && data.length > 0) {
        setActiveIndexState(0);
        const point = data[0];
        if (point) announce(`${point.label}: ${fmt(point.value)}`);
      }
    },
    [activeIndex, data, fmt, announce],
  );

  const onBlur = useCallback((_event: React.FocusEvent<HTMLDivElement>) => {
    // Reset highlight on blur so the chart doesn't appear stuck.
    setActiveIndexState(-1);
  }, []);

  const renderHiddenDataTable = useCallback((): HiddenDataTablePayload => {
    const captionTitle = title && title.trim().length > 0 ? title : ariaLabel;
    return {
      id: describedById,
      caption: `Data table for ${captionTitle}`,
      headers: [labelColumnHeader, valueColumnHeader],
      rows: data.map((d) => ({ label: d.label, value: fmt(d.value) })),
    };
  }, [data, fmt, title, ariaLabel, describedById, labelColumnHeader, valueColumnHeader]);

  const containerProps: ChartA11yContainerProps = useMemo(
    () => ({
      role: 'region',
      tabIndex: 0,
      'aria-label': ariaLabel,
      'aria-describedby': describedById,
      onKeyDown,
      onFocus,
      onBlur,
    }),
    [ariaLabel, describedById, onKeyDown, onFocus, onBlur],
  );

  return {
    containerProps,
    describedById,
    liveRegionId,
    ariaLabel,
    activeIndex,
    setActiveIndex,
    announce,
    liveMessage,
    renderHiddenDataTable,
  };
}
