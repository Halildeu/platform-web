/**
 * ChartDetail -- Design Lab individual chart documentation page
 *
 * 6 tabs: Overview | Playground | API | Examples | Themes | Quality
 * Self-contained with hardcoded chart catalog (13 charts).
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileCode2,
  BookOpen,
  ShieldCheck,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Cpu,
  Lock,
  RotateCcw,
  Database,
} from 'lucide-react';
import ChartPreviewLive from '../widgets/ChartPreviewLive';
import {
  applyPreset,
  buildDescriptors,
  decodePlaygroundState,
  deriveDefaults,
  encodePlaygroundState,
  generatePlaygroundCode,
  getChartPresets,
  getFaq,
  getFeatureBadge,
  getPerformanceGuidance,
  getSampleData,
  CATEGORY_DEFAULT_OPEN,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type ChartPlaygroundPreset,
  type EditorCategory,
  type EditorDescriptor,
  type PlaygroundState,
  type PlaygroundValue,
  type SampleDataDef,
} from '../widgets/chartPlaygroundModel';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChartProp {
  name: string;
  type: string;
  required: boolean;
  default: string;
  description: string;
}

interface ChartMeta {
  id: string;
  name: string;
  description: string;
  importPath: string;
  tier: 'core' | 'enterprise' | 'interaction' | 'ai' | 'perf';
  props: ChartProp[];
  sampleCode: string;
  features: string[];
  a11y: string[];
  themes: string[];
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Tab definitions — REMOVED                                          */
/*                                                                     */
/*  Single-page layout (Codex thread `019def27` AGREE — Variant       */
/*  A-lite). The previous 6-tab pill bar is replaced by sequential     */
/*  anchored sections rendered inline by the `ChartDetail` component.  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Chart catalog (13 charts)                                          */
/* ------------------------------------------------------------------ */

const CHART_CATALOG: Record<string, ChartMeta> = {
  'bar-chart': {
    id: 'bar-chart',
    name: 'BarChart',
    description:
      'Vertical or horizontal bar chart for categorical comparison. Supports grouped series, value labels, and click interaction.',
    importPath: "import { BarChart } from '@mfe/x-charts';",
    tier: 'core',
    props: [
      {
        name: 'data',
        type: 'ChartDataPoint[]',
        required: true,
        default: '—',
        description: 'Data points to render as bars.',
      },
      {
        name: 'orientation',
        type: "'vertical' | 'horizontal'",
        required: false,
        default: '"vertical"',
        description: 'Bar orientation.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'showValues',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show value labels on bars.',
      },
      {
        name: 'showGrid',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show grid lines.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate bars on mount.',
      },
      {
        name: 'colors',
        type: 'string[]',
        required: false,
        default: 'undefined',
        description: 'Override default chart colors.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'series',
        type: '{ field: string; name: string; color?: string }[]',
        required: false,
        default: 'undefined',
        description: 'Multi-series: grouped bars by field.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a data point (bar) is clicked.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description:
          'Visual overlay markups — threshold lines, highlight bands, anomaly\nmarkers, KPI labels. Renders on top of the bars without affecting\nthe data series. See `ChartMarkup` type docs for variant details.',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals (data-appearance / data-theme / media)',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override (visual differentiation beyond color).',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto" — follows documentElement `data-density` (mfe-shell theme axis)',
        description: 'Density override (compact vs comfortable).',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto" — follows documentElement `data-accent` (mfe-shell theme axis)',
        description: 'Accent palette override (light/emerald/ocean/violet/sunset/graphite/dark).',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y-other — anomaly summary list. When the chart\nis rendered with anomaly markups (PR-A2b-ui via\n`useAnomalyOverlay({ labelVariant: 'pill' })`), passing the\nmatching `AnomalySummary[]` (from `useAnomalySummary()` /\n`computeAnomalySummary()`) here lets `ChartA11yShell` fire a\npolite, debounced screen-reader announcement summarising the\noutliers. Default `undefined` = no anomaly announcement\n(backwards compat).\n\nPair with `useAnomalySummary({ data, k, idPrefix })` —\nshares the same detector internals as `useAnomalyOverlay` so\nthe visual markup and the SR summary stay aligned.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.\nDefault: small EN/TR formatter ("3 outliers detected, ...").',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<BarChart
  data={[
    { label: "Jan", value: 120 },
    { label: "Feb", value: 200 },
    { label: "Mar", value: 150 },
    { label: "Apr", value: 280 },
  ]}
  showValues
  showGrid
  title="Monthly Revenue"
/>`,
    features: [
      'cross-filter',
      'a11y-keyboard',
      'responsive',
      'theme-aware',
      'animation',
      'tooltip',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback', 'aria-live', 'reduced-motion'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'line-chart': {
    id: 'line-chart',
    name: 'LineChart',
    description:
      'Time-series and trend visualization with optional area fill, dots, and curved interpolation. Multi-series capable.',
    importPath: "import { LineChart } from '@mfe/x-charts';",
    tier: 'core',
    props: [
      {
        name: 'series',
        type: 'ChartSeries[]',
        required: true,
        default: '—',
        description: 'Series to render as lines.',
      },
      {
        name: 'labels',
        type: 'string[]',
        required: true,
        default: '—',
        description: 'X-axis labels.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'showDots',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show dot markers at data points.',
      },
      {
        name: 'showGrid',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show grid lines.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'showArea',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Fill area under the lines.',
      },
      {
        name: 'curved',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Use bezier curves instead of straight lines.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate line drawing on mount.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a data point (marker) is clicked.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description:
          'Visual overlay markups — threshold lines, highlight bands, anomaly\nmarkers, KPI labels. Codex thread 019e0df1 iter-3 absorb.',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto" — follows documentElement `data-density`',
        description: 'Density override (compact vs comfortable).',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y-other — anomaly summary list. When the chart\nis rendered with anomaly markups (PR-A2b-ui via\n`useAnomalyOverlay({ labelVariant: 'pill' })`), passing the\nmatching `AnomalySummary[]` (from `useAnomalySummary()` /\n`computeAnomalySummary()`) here lets `ChartA11yShell` fire a\npolite, debounced screen-reader announcement summarising the\noutliers. Default `undefined` = no anomaly announcement\n(backwards compat).\n\nPair with `useAnomalySummary({ data, k, idPrefix })` —\nshares the same detector internals as `useAnomalyOverlay` so\nthe visual markup and the SR summary stay aligned.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.\nDefault: small EN/TR formatter ("3 outliers detected, ...").',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<LineChart
  series={[
    { name: "Revenue", data: [30, 40, 35, 50, 49, 60] },
    { name: "Expenses", data: [20, 25, 30, 28, 35, 32] },
  ]}
  labels={["Jan", "Feb", "Mar", "Apr", "May", "Jun"]}
  showDots
  showArea
  curved
/>`,
    features: [
      'multi-series',
      'area-fill',
      'cross-filter',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback', 'aria-live', 'reduced-motion'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'pie-chart': {
    id: 'pie-chart',
    name: 'PieChart',
    description:
      'Proportional data visualization with optional donut mode, percentage labels, and inner content slot.',
    importPath: "import { PieChart } from '@mfe/x-charts';",
    tier: 'core',
    props: [
      {
        name: 'data',
        type: 'ChartDataPoint[]',
        required: true,
        default: '—',
        description: 'Data points to render as slices.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'donut',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Donut mode (ring instead of filled).',
      },
      {
        name: 'showLabels',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show labels beside slices.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'showPercentage',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show percentage on slices.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter.',
      },
      {
        name: 'innerLabel',
        type: 'React.ReactNode',
        required: false,
        default: 'undefined',
        description: 'Center content for donut mode.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate slices on mount.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a data point (slice) is clicked.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description:
          'Visual overlay markups (Codex thread 019e0df1) — NO-OP on Pie.\nProp accepted for API consistency; dev warning surfaces when\nmarkups are supplied (label/threshold semantics need v2 native\nseries-label patches).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Pie).',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y-other-batch2 — anomaly summary list. When\nsupplied, the wrapper forwards the consumer-provided summary to\n`ChartA11yShell` so screen readers receive a polite, debounced\noutlier announcement. PieChart's `ChartMarkup` overlay is\ncurrently a NO-OP, so the SR announcement is the consumer's\nprimary anomaly channel — pair it with whichever detector\n(e.g. `useAnomalySummary` from `@mfe/x-charts`) you trust at\nthe dashboard layer; no built-in recipe is implied for slice\ndistributions.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<PieChart
  data={[
    { label: "Desktop", value: 60 },
    { label: "Mobile", value: 30 },
    { label: "Tablet", value: 10 },
  ]}
  donut
  showPercentage
  showLegend
/>`,
    features: [
      'donut-mode',
      'inner-label',
      'cross-filter',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback', 'aria-live', 'reduced-motion'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'area-chart': {
    id: 'area-chart',
    name: 'AreaChart',
    description:
      'Stacked or overlapping area chart for volume and cumulative trend display. Built on the LineChart engine with gradient fill.',
    importPath: "import { AreaChart } from '@mfe/x-charts';",
    tier: 'core',
    props: [
      {
        name: 'series',
        type: 'ChartSeries[]',
        required: true,
        default: '—',
        description: 'Series to render as filled areas.',
      },
      {
        name: 'labels',
        type: 'string[]',
        required: true,
        default: '—',
        description: 'X-axis labels.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'stacked',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Stack areas on top of each other.',
      },
      {
        name: 'showDots',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show dot markers at data points.',
      },
      {
        name: 'showGrid',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show grid lines.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'gradient',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Use gradient fills instead of flat color.',
      },
      {
        name: 'curved',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Use bezier curves instead of straight lines.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          'Callback fired when a data point is clicked. The emitted\n`ChartClickEvent` exposes a `datum` shape compatible with the\ncross-filter wrapper: `{ seriesName, label, value, dataIndex,\nseriesIndex }`. AreaChart is a series-based chart (no raw row\nsupplied per data point), so the datum is constructed from the\nseries + label axis rather than spreading any backing object.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups (Codex thread 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override (compact vs comfortable).',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y-other — anomaly summary list. When the chart\nis rendered with anomaly markups (PR-A2b-ui via\n`useAnomalyOverlay({ labelVariant: 'pill' })`), passing the\nmatching `AnomalySummary[]` (from `useAnomalySummary()` /\n`computeAnomalySummary()`) here lets `ChartA11yShell` fire a\npolite, debounced screen-reader announcement summarising the\noutliers. Default `undefined` = no anomaly announcement\n(backwards compat).\n\nPair with `useAnomalySummary({ data, k, idPrefix })` —\nshares the same detector internals as `useAnomalyOverlay` so\nthe visual markup and the SR summary stay aligned.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.\nDefault: small EN/TR formatter ("3 outliers detected, ...").',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<AreaChart
  series={[
    { name: "Organic", data: [40, 50, 45, 70, 65, 80] },
    { name: "Paid", data: [20, 30, 25, 35, 40, 50] },
  ]}
  labels={["Jan", "Feb", "Mar", "Apr", "May", "Jun"]}
  stacked
  gradient
/>`,
    features: [
      'cross-filter',
      'stacked',
      'gradient-fill',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback', 'aria-live', 'reduced-motion'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'scatter-chart': {
    id: 'scatter-chart',
    name: 'ScatterChart',
    description:
      'Two-dimensional data point distribution chart for correlation analysis and clustering visualization.',
    importPath: "import { ScatterChart } from '@mfe/x-charts';",
    tier: 'core',
    props: [
      {
        name: 'data',
        type: 'ScatterDataPoint[]',
        required: true,
        default: '—',
        description: 'Data points for the scatter plot.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'showGrid',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show grid lines.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'colors',
        type: 'string[]',
        required: false,
        default: 'undefined',
        description: 'Override default chart colors.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter for axis labels.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'xLabel',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'X-axis label.',
      },
      {
        name: 'yLabel',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Y-axis label.',
      },
      {
        name: 'bubble',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Enable bubble mode — sizes markers by the `size` field.',
      },
      {
        name: 'noDataText',
        type: 'string',
        required: false,
        default: '"Veri yok"',
        description: 'Text shown when data is empty.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          'Callback fired when a data point is clicked. The emitted\n`ChartClickEvent` exposes a datum compatible with the cross-filter\nwrapper: `{ x, y, size, label, dataIndex }`. `value` mirrors `y`\n(the primary measure) and `label` falls back to `Point N (x, y)`\nwhen no explicit label is set.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups (Codex thread 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'renderer',
        type: 'RendererMode',
        required: false,
        default: '"auto"',
        description:
          "Renderer mode — Faz 21.11 PR-A1.5 (Big Data Renderer Router).\n`'auto'` (default) routes by point count: <50K Canvas raw,\n50K..100K Canvas (LTTB sampling lands in PR-A2), ≥100K WebGL\n(lazy `echarts-gl`). Force a\nspecific backend with `'canvas' | 'svg' | 'webgl'`. WebGL falls\nback to Canvas when unsupported and fires `onRendererFallback`.",
      },
      {
        name: 'onRendererFallback',
        type: '(event: RendererFallbackEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Callback fired when the requested renderer was downgraded (e.g.\n`renderer='webgl'` but the browser does not support WebGL, so the\nrouter routed to Canvas). Lets dashboards surface a banner without\npolling the router decision themselves.",
      },
      {
        name: 'crossFilterRequired',
        type: 'boolean',
        required: false,
        default: 'false',
        description:
          'Hard cross-filter requirement — when true the router will NEVER\nupgrade to WebGL above the cross-filter ceiling (default 500K).\nUse for trading dashboards where losing click → drilldown is\nunacceptable.',
      },
      {
        name: 'enableBrush',
        type: 'boolean',
        required: false,
        default: 'false',
        description:
          'Faz 21.11 PR-A2c-wire — opt-in ECharts toolbox brush feature.\nWhen `true` the chart renders a toolbox button + enables top-level\n`option.brush` so the user can drag a rectangle (or click clear)\nover the scatter. Selections fire `onBrushSelection` with a\nnormalised `BrushSelection` (PR-A2c). Also flips the renderer\nrouter into the cross-filter-required path so big-data datasets\nnever silently route to WebGL above the cross-filter ceiling\n(where brush parity becomes unreliable).\n\nDefault `false` — backwards compat. ECharts toolbox/brush bundle\nis paid only when a shim opts in; no shim that omits this flag\ntriggers the brush UI.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y — anomaly summary list. When the chart\nis rendered with anomaly markups (PR-A2b-ui via\n`useAnomalyOverlay({ labelVariant: 'pill' })`), passing the\nmatching `AnomalySummary[]` (from `useAnomalySummary()` /\n`computeAnomalySummary()`) here lets `ChartA11yShell` fire a\npolite, debounced screen-reader announcement summarising the\noutliers. Default `undefined` = no anomaly announcement\n(backwards compat).\n\nPair with `useAnomalySummary({ data, k, idPrefix })` —\nshares the same detector internals as `useAnomalyOverlay` so\nthe visual markup and the SR summary stay aligned.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.\nDefault: small EN/TR formatter ("3 outliers detected, ...").',
      },
      {
        name: 'onBrushSelection',
        type: '(selection: BrushSelection | null) => void',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2c-wire — fires when the user drags a rectangle on\nthe chart (or clears one). Receives a normalised `BrushSelection`\nwith `from`/`to` in data-space coordinates and source-row\n`indices` (resolved via `originalIndex` when the chart was drawn\nfrom PR-A2a downsampled data). `null` means the user cleared the\nbrush. Pair with `brushToAgGridFilterModel` +\n`mergeBrushFilterModel` (both from `@mfe/x-charts`) to wire into\nan AG Grid SSRM datasource without losing existing column\nfilters.\n\nRenderer-agnostic — works the same in canvas / lttb / webgl\nrouter branches because the helper normalises ECharts'\n`brushselected` payload upstream of the renderer pipeline.",
      },
      {
        name: 'unstable_onRenderSettled',
        type: "EChartsRendererOptions['unstable_onRenderSettled']",
        required: false,
        default: 'undefined',
        description: 'unstable_onRenderSettled.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<ScatterChart
  data={[
    { x: 10, y: 20, label: "A" },
    { x: 30, y: 50, label: "B" },
    { x: 50, y: 30, label: "C" },
    { x: 70, y: 80, label: "D" },
  ]}
  title="Correlation Plot"
/>`,
    features: [
      'cross-filter',
      'bubble-size',
      'tooltip',
      'responsive',
      'zoom',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback', 'aria-live'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'gauge-chart': {
    id: 'gauge-chart',
    name: 'GaugeChart',
    description:
      'Radial gauge for KPI display with configurable min/max range and threshold coloring.',
    importPath: "import { GaugeChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'value',
        type: 'number',
        required: true,
        default: '—',
        description: 'Current gauge value.',
      },
      {
        name: 'min',
        type: 'number',
        required: false,
        default: '0',
        description: 'Minimum scale value.',
      },
      {
        name: 'max',
        type: 'number',
        required: false,
        default: '100',
        description: 'Maximum scale value.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Title displayed above the gauge.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'thresholds',
        type: 'GaugeThreshold[]',
        required: false,
        default: 'undefined',
        description: 'Threshold zones for colored arc segments.',
      },
      {
        name: 'startAngle',
        type: 'number',
        required: false,
        default: '225',
        description: 'Start angle in degrees.',
      },
      {
        name: 'endAngle',
        type: 'number',
        required: false,
        default: '-45',
        description: 'End angle in degrees.',
      },
      {
        name: 'showProgress',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show a progress arc from min to current value.',
      },
      {
        name: 'pointer',
        type: '{ length?: string; width?: number; color?: string; }',
        required: false,
        default: 'undefined',
        description: 'Pointer configuration.',
      },
      {
        name: 'splitNumber',
        type: 'number',
        required: false,
        default: '10',
        description: 'Number of segments on the axis.',
      },
      {
        name: 'showAxisLabel',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show numeric axis labels.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom formatter for the center value display.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount and value changes.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Callback fired when the gauge dial is clicked. Emits a\n`ChartClickEvent` with `datum: { label, name, value, min, max }`\n— `target` is intentionally NOT included (it isn't a\n`GaugeChartProps` field; Codex iter-2 thread 019e0c25 blocker).",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — NO-OP on Gauge (Codex 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Gauge).',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<GaugeChart
  value={73}
  min={0}
  max={100}
  title="CPU Usage"
/>`,
    features: [
      'cross-filter',
      'threshold-colors',
      'animation',
      'responsive',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['aria-live', 'reduced-motion'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'radar-chart': {
    id: 'radar-chart',
    name: 'RadarChart',
    description:
      'Multi-axis radar (spider) chart for multi-dimensional data comparison across categories.',
    importPath: "import { RadarChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'indicators',
        type: 'RadarIndicator[]',
        required: true,
        default: '—',
        description: 'Axis indicators defining the radar shape.',
      },
      {
        name: 'series',
        type: 'RadarSeriesItem[]',
        required: true,
        default: '—',
        description: 'Data series to plot on the radar.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'shape',
        type: "'polygon' | 'circle'",
        required: false,
        default: '"polygon"',
        description: 'Radar shape.',
      },
      {
        name: 'showArea',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Fill the area under each series line.',
      },
      {
        name: 'showLabels',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show axis name labels.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'splitNumber',
        type: 'number',
        required: false,
        default: '5',
        description: 'Number of concentric split rings.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter for tooltip.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Callback fired when the radar polygon is clicked. Emits a canonical\n`ChartClickEvent`. v1 polygon-level fields stay stable across\nversions; v2 enrichment is purely ADDITIVE.\n\nv1 fields (always present):\n- `datum.seriesName`, `datum.label` (= seriesName), `datum.values`,\n  `datum.indicators`\n- top-level `event.label` = seriesName\n- top-level `event.value` = `values[0]` when numeric\n\nv2 indicator-level enrichment (additive, fires only when click\ncoordinates resolve to a specific axis outside the 5% center\ndead-zone):\n- `datum.indicator` (axis name)\n- `datum.indicatorIndex` (0-based axis position)\n- `datum.indicatorValue` (numeric value at that axis for the\n  clicked series)\n\nCross-filter consumers wanting series-level filter:\n  `<CrossFilterChart emitFields={['seriesName']}>` — v1 contract.\nCross-filter consumers wanting per-axis drill:\n  `<CrossFilterChart emitFields={['indicator']}>` — v2 opt-in.\nThe two surfaces never overwrite each other.",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — NO-OP on Radar (Codex 019e0df1; v2 backlog).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Radar).',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<RadarChart
  data={[
    { axis: "Speed", value: 80 },
    { axis: "Reliability", value: 90 },
    { axis: "Cost", value: 60 },
    { axis: "Flexibility", value: 70 },
    { axis: "Scalability", value: 85 },
  ]}
  title="Service Comparison"
/>`,
    features: [
      'cross-filter',
      'multi-axis',
      'overlay',
      'tooltip',
      'responsive',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['data-table-fallback', 'aria-live'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'treemap-chart': {
    id: 'treemap-chart',
    name: 'TreemapChart',
    description:
      'Hierarchical data visualization using nested rectangles proportional to value. Supports drill-down navigation.',
    importPath: "import { TreemapChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'TreemapNode[]',
        required: true,
        default: '—',
        description: 'Hierarchical tree data.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'showBreadcrumb',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show breadcrumb navigation on drill-down.',
      },
      {
        name: 'leafDepth',
        type: 'number',
        required: false,
        default: '1',
        description: 'Maximum visible depth (1 = only root children).',
      },
      {
        name: 'roam',
        type: "boolean | 'move' | 'scale'",
        required: false,
        default: 'false',
        description: 'Pan/zoom mode.',
      },
      {
        name: 'colorSaturation',
        type: '[number, number]',
        required: false,
        default: '[0.35, 0.5]',
        description: 'Saturation range for color mapping.',
      },
      {
        name: 'visibleMin',
        type: 'number',
        required: false,
        default: '300',
        description: 'Minimum area (px^2) to render a label.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom formatter for displayed values.',
      },
      {
        name: 'onNodeClick',
        type: '(params: { name: string; value: number; data: unknown }) => void',
        required: false,
        default: 'undefined',
        description:
          'Legacy callback fired when a node is clicked. Receives a tight\n`{ name, value, data }` shape and remains the canonical surface\nfor non-cross-filter consumers. Coexists with the new\n`onDataPointClick` (canonical `ChartClickEvent`); when both are\nsupplied, `onDataPointClick` fires FIRST and `onNodeClick` fires\nsecond so cross-filter forwarding never blocks the legacy\nhandler. Codex iter-2 thread 019e0c25 absorb.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Canonical cross-filter callback. Emits a `ChartClickEvent` with\n`datum: { name, label: name, value, treePathInfo, path, depth,\ndata }`. `depth` is derived from `treePathInfo.length - 1` and\ndefaults to `0` when ECharts doesn't surface the breadcrumb.",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — NO-OP on Treemap (Codex 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Treemap).',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<TreemapChart
  data={[
    { name: "Engineering", value: 40,
      children: [
        { name: "Frontend", value: 20 },
        { name: "Backend", value: 20 },
      ] },
    { name: "Design", value: 25 },
    { name: "Marketing", value: 35 },
  ]}
  title="Budget Allocation"
/>`,
    features: [
      'cross-filter',
      'drill-down',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'heatmap-chart': {
    id: 'heatmap-chart',
    name: 'HeatmapChart',
    description:
      'Two-dimensional color-intensity matrix for displaying density, correlation, or time-based patterns.',
    importPath: "import { HeatmapChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'HeatmapTupleData[] | HeatmapObjectData[]',
        required: true,
        default: '—',
        description: 'Heatmap data in tuple [x, y, value] or object format.',
      },
      {
        name: 'xLabels',
        type: 'string[]',
        required: false,
        default: 'undefined',
        description: 'X-axis category labels.',
      },
      {
        name: 'yLabels',
        type: 'string[]',
        required: false,
        default: 'undefined',
        description: 'Y-axis category labels.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'min',
        type: 'number',
        required: false,
        default: 'undefined',
        description: 'Minimum data value for color scale. Auto-detected if not provided.',
      },
      {
        name: 'max',
        type: 'number',
        required: false,
        default: 'undefined',
        description: 'Maximum data value for color scale. Auto-detected if not provided.',
      },
      {
        name: 'colors',
        type: '[string, string]',
        required: false,
        default: "['#f5f5f5', '#3b82f6']",
        description: 'Color gradient endpoints [low, high].',
      },
      {
        name: 'showValues',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show value text on each cell.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom formatter for cell value display.',
      },
      {
        name: 'cellSize',
        type: "number | 'auto'",
        required: false,
        default: '"auto"',
        description: 'Cell size override; "auto" fits to container.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show visual map legend.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'onCellClick',
        type: '(params: { x: number; y: number; value: number }) => void',
        required: false,
        default: 'undefined',
        description:
          'Legacy callback fired when a cell is clicked. Receives a tight\n`{ x, y, value }` shape (numeric category indices). Coexists with\nthe new `onDataPointClick`; when both are supplied,\n`onDataPointClick` fires FIRST and `onCellClick` fires second so\ncross-filter forwarding never blocks the legacy handler. Codex\niter-2 thread 019e0c25 absorb.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Canonical cross-filter callback. Emits a `ChartClickEvent` with\n`datum: { x, y, xLabel, yLabel, value, label: '${xLabel}/${yLabel}' }`\n— `x`/`y` are numeric category indices; `xLabel`/`yLabel` are the\nresolved category strings (which the cross-filter wrapper would\ntypically emit as filter values).",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups (Codex thread 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y-other — anomaly summary list. When the chart\nis rendered with anomaly markups (PR-A2b-ui via\n`useAnomalyOverlay({ labelVariant: 'pill' })`), passing the\nmatching `AnomalySummary[]` (from `useAnomalySummary()` /\n`computeAnomalySummary()`) here lets `ChartA11yShell` fire a\npolite, debounced screen-reader announcement summarising the\noutliers. Default `undefined` = no anomaly announcement\n(backwards compat).\n\nPair with `useAnomalySummary({ data, k, idPrefix })` —\nshares the same detector internals as `useAnomalyOverlay` so\nthe visual markup and the SR summary stay aligned.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.\nDefault: small EN/TR formatter ("3 outliers detected, ...").',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<HeatmapChart
  data={[
    { x: "Mon", y: "9am", value: 10 },
    { x: "Mon", y: "12pm", value: 30 },
    { x: "Tue", y: "9am", value: 20 },
    { x: "Tue", y: "12pm", value: 45 },
  ]}
  title="Activity Heatmap"
/>`,
    features: [
      'cross-filter',
      'color-scale',
      'tooltip',
      'responsive',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['data-table-fallback', 'aria-live'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'waterfall-chart': {
    id: 'waterfall-chart',
    name: 'WaterfallChart',
    description:
      'Sequential incremental chart showing how values build up or break down from an initial to a final value.',
    importPath: "import { WaterfallChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'WaterfallDataPoint[]',
        required: true,
        default: '—',
        description: 'Data points to render as waterfall bars.',
      },
      {
        name: 'size',
        type: "'sm' | 'md' | 'lg'",
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'colors',
        type: '{ increase?: string; decrease?: string; total?: string; }',
        required: false,
        default: 'undefined',
        description: 'Colors per waterfall segment type.',
      },
      {
        name: 'showConnector',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Draw dashed connector lines between adjacent bars.',
      },
      {
        name: 'showValues',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show value labels on bars.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter for labels and tooltip.',
      },
      {
        name: 'orientation',
        type: "'vertical' | 'horizontal'",
        required: false,
        default: '"vertical"',
        description: 'Bar orientation.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate bars on mount.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Callback fired when a visible bar is clicked. Emits a canonical\n`ChartClickEvent` with `datum: { label, value: displayedValue,\nrawValue, type }` — `displayedValue` is what ECharts renders\n(cumulative for 'total' bars, signed delta for inc/dec); `rawValue`\nis the original `WaterfallDataPoint.value` from props; `type` is\nthe resolved `WaterfallItemType`. Hidden base-stack series clicks\nare filtered out (they aren't user-meaningful).",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description:
          "Visual overlay markups (Codex thread 019e0df1). Partial support:\nline + area patches MERGE with the existing connector markLine on\nthe visible value series; base series (`__waterfall_base__`) is\nuntouched. Use `target.seriesName: 'Waterfall'` for explicit\nrouting if needed.",
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          'Faz 21.11 PR-A2b-a11y-other-batch2 — anomaly summary list. When\nthe chart is rendered with anomaly markers (pair with\n`useAnomalySummary({ data })` at the consumer layer), forwards\nthe summary to `ChartA11yShell` for a polite, debounced\nscreen-reader announcement summarising the unusual steps.\n`anomalySummary.x` is typically the step label (e.g. "Q1\nexpense"); `formattedY` the raw step value.',
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.\nDefault: small EN/TR formatter ("3 outliers detected, ...").',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<WaterfallChart
  data={[
    { label: "Starting", value: 100, type: "total" },
    { label: "Sales", value: 40 },
    { label: "Refunds", value: -15 },
    { label: "Costs", value: -25 },
    { label: "Net", value: 100, type: "total" },
  ]}
  title="Revenue Breakdown"
/>`,
    features: [
      'cross-filter',
      'total-markers',
      'color-coding',
      'tooltip',
      'responsive',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['data-table-fallback', 'aria-live'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'funnel-chart': {
    id: 'funnel-chart',
    name: 'FunnelChart',
    description:
      'Stage-by-stage conversion funnel chart for pipeline and process flow visualization.',
    importPath: "import { FunnelChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'FunnelDataPoint[]',
        required: true,
        default: '—',
        description: 'Data points to render as funnel stages.',
      },
      {
        name: 'size',
        type: "'sm' | 'md' | 'lg'",
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'sort',
        type: "'descending' | 'ascending' | 'none'",
        required: false,
        default: '"descending"',
        description: 'Sort order for funnel stages.',
      },
      {
        name: 'gap',
        type: 'number',
        required: false,
        default: '2',
        description: 'Pixel gap between funnel stages.',
      },
      {
        name: 'showLabels',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Show labels on stages.',
      },
      {
        name: 'labelPosition',
        type: "'inside' | 'outside' | 'left' | 'right'",
        required: false,
        default: '"inside"',
        description: 'Label placement.',
      },
      {
        name: 'showConversion',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show conversion percentage between consecutive stages.',
      },
      {
        name: 'orientation',
        type: "'vertical' | 'horizontal'",
        required: false,
        default: '"vertical"',
        description: 'Funnel layout direction.',
      },
      {
        name: 'funnelAlign',
        type: "'left' | 'center' | 'right'",
        required: false,
        default: '"center"',
        description: 'Horizontal alignment of the funnel shape.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter for labels and tooltip.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Callback fired when a stage is clicked. Emits a canonical\n`ChartClickEvent` with `datum: { label, value, percent,\nconversionPercent? }` — `percent` is ECharts' default total-vs-max\nratio; `conversionPercent` is the stage-vs-previous ratio and is\nonly included when `showConversion` is true (otherwise omitted to\navoid emitting a misleading filter field).",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — NO-OP on Funnel (Codex 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Funnel).',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y-other-batch2 — anomaly summary list. When\nsupplied, the wrapper forwards the consumer-provided summary to\n`ChartA11yShell` so screen readers receive a polite, debounced\noutlier announcement summarising unusual stages (e.g. a stage\nwith an unexpectedly large drop). FunnelChart's `ChartMarkup`\noverlay is currently a NO-OP, so the SR announcement is the\nconsumer's primary anomaly channel — pair it with whichever\ndetector you trust at the dashboard layer; no built-in recipe\nis implied for funnel-stage distributions.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<FunnelChart
  data={[
    { label: "Visitors", value: 5000 },
    { label: "Leads", value: 2500 },
    { label: "Qualified", value: 1200 },
    { label: "Proposals", value: 600 },
    { label: "Closed", value: 200 },
  ]}
  title="Sales Funnel"
/>`,
    features: [
      'cross-filter',
      'conversion-rates',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['data-table-fallback', 'aria-live'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'sankey-chart': {
    id: 'sankey-chart',
    name: 'SankeyChart',
    description:
      'Flow diagram showing weighted connections between nodes. Ideal for budget flows, user journeys, and energy diagrams.',
    importPath: "import { SankeyChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'nodes',
        type: 'SankeyNode[]',
        required: true,
        default: '—',
        description: 'Node definitions.',
      },
      {
        name: 'links',
        type: 'SankeyLink[]',
        required: true,
        default: '—',
        description: 'Link definitions connecting source to target with a value.',
      },
      {
        name: 'size',
        type: "'sm' | 'md' | 'lg'",
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'orient',
        type: "'horizontal' | 'vertical'",
        required: false,
        default: '"horizontal"',
        description: 'Layout orientation.',
      },
      {
        name: 'nodeWidth',
        type: 'number',
        required: false,
        default: '20',
        description: 'Width of each node in pixels.',
      },
      {
        name: 'nodeGap',
        type: 'number',
        required: false,
        default: '8',
        description: 'Vertical gap between nodes in the same column.',
      },
      {
        name: 'draggable',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Allow interactive node dragging.',
      },
      {
        name: 'focusNodeAdjacency',
        type: 'SankeyFocusMode',
        required: false,
        default: '"allEdges"',
        description: 'Emphasis focus behaviour on hover.',
      },
      {
        name: 'lineStyle',
        type: "'gradient' | 'source' | 'target'",
        required: false,
        default: '"gradient"',
        description: 'Link line coloring strategy.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter for tooltip.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'onNodeClick',
        type: '(params: { name: string; data: unknown }) => void',
        required: false,
        default: 'undefined',
        description:
          'Legacy callback fired when a NODE is clicked (not edges). Coexists\nwith the new `onDataPointClick`; when both are supplied,\n`onDataPointClick` fires FIRST and `onNodeClick` fires second so\ncross-filter forwarding never blocks the legacy handler. Edges\nnever trigger this callback. Codex iter-2 thread 019e0c25 absorb.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Canonical cross-filter callback. Emits a `ChartClickEvent` for\nBOTH node clicks and edge clicks. Datum shape varies:\n- node: `{ dataType: 'node', name, label: name, value: flowThrough }`\n- edge: `{ dataType: 'edge', source, target, value, label: 'source → target' }`\n`value` for nodes is ECharts' computed flow-through; for edges it\nis the link `value` (volume of flow). The cross-filter wrapper\ncan pick `name` (node) or `source`/`target` (edge) as canonical\nfilter fields.",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — NO-OP on Sankey (Codex 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Sankey).',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<SankeyChart
  data={{
    nodes: [
      { id: "budget" }, { id: "engineering" },
      { id: "marketing" }, { id: "sales" },
    ],
    links: [
      { source: "budget", target: "engineering", value: 40 },
      { source: "budget", target: "marketing", value: 35 },
      { source: "budget", target: "sales", value: 25 },
    ],
  }}
  title="Budget Flow"
/>`,
    features: [
      'cross-filter',
      'node-dragging',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['data-table-fallback', 'aria-live'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },
  'sunburst-chart': {
    id: 'sunburst-chart',
    name: 'SunburstChart',
    description:
      'Multi-level radial treemap for hierarchical data with drill-down ring navigation.',
    importPath: "import { SunburstChart } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'SunburstNode[]',
        required: true,
        default: '—',
        description: 'Hierarchical data tree (top-level children form the inner ring).',
      },
      {
        name: 'size',
        type: "'sm' | 'md' | 'lg'",
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'levels',
        type: 'SunburstLevelConfig[]',
        required: false,
        default: 'undefined',
        description: 'Per-level ring configuration. Auto-generated from data depth when omitted.',
      },
      {
        name: 'sort',
        type: "'desc' | 'asc' | null",
        required: false,
        default: '"desc"',
        description: 'Sort order for sibling nodes.',
      },
      {
        name: 'radius',
        type: '[string, string]',
        required: false,
        default: '["0%", "90%"]',
        description: 'Sunburst inner/outer radius range.',
      },
      {
        name: 'highlightPolicy',
        type: 'SunburstHighlightPolicy',
        required: false,
        default: '"descendant"',
        description: 'Which nodes to highlight on hover.',
      },
      {
        name: 'showLegend',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show legend below the chart.',
      },
      {
        name: 'valueFormatter',
        type: '(v: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter for labels and tooltip.',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'onNodeClick',
        type: '(params: { name: string; value: number; data: unknown }) => void',
        required: false,
        default: 'undefined',
        description:
          'Legacy callback fired when a node is clicked. Receives a tight\n`{ name, value, data }` shape. Coexists with the new\n`onDataPointClick`; when both are supplied, `onDataPointClick`\nfires FIRST and `onNodeClick` fires second so cross-filter\nforwarding never blocks the legacy handler. Codex iter-2 thread\n019e0c25 absorb.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description:
          "Canonical cross-filter callback. Emits a `ChartClickEvent` with\n`datum: { name, label: name, value, treePathInfo, path, depth,\ndata }`. `depth = treePathInfo.length - 1` (root counted), 0\nfallback when ECharts doesn't surface the breadcrumb.",
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — NO-OP on Sunburst (Codex 019e0df1).',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Sunburst).',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<SunburstChart
  data={[
    { name: "Tech", value: 50,
      children: [
        { name: "Frontend", value: 25 },
        { name: "Backend", value: 25 },
      ] },
    { name: "Business", value: 30,
      children: [
        { name: "Sales", value: 15 },
        { name: "Marketing", value: 15 },
      ] },
    { name: "Ops", value: 20 },
  ]}
  title="Organization"
/>`,
    features: [
      'cross-filter',
      'drill-down',
      'tooltip',
      'responsive',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },

  /* ---- 3D Extension Pack (Faz 21.11 P1 — lazy `echarts-gl`) ---- */

  'scatter-3d-chart': {
    id: 'scatter-3d-chart',
    name: 'Scatter3D',
    description:
      '3D point cloud visualization rendered via lazy-loaded `echarts-gl`. Requires WebGL — unsupported environments surface a graceful "WebGL unavailable" state instead of falling back to canvas (Faz 21.11 P1a).',
    importPath: "import { Scatter3D } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'Scatter3DDataPoint[]',
        required: true,
        default: '—',
        description: '3D point cloud data.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter (used in tooltip + a11y data table).',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a data point is clicked.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description:
          'Visual overlay markups. Accepted for API parity with the 2D\nwrappers but currently a NO-OP on Scatter3D — surfacing fake\n3D markups would be worse than none. A 3D markup adapter is\ntracked as a follow-up PR.',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Scatter3D).',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto" — follows documentElement signals',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto" — enabled for high-contrast and print themes',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description:
          "Faz 21.11 PR-A2b-a11y — anomaly summary list. The wrapper forwards\nthe consumer-provided summary to `ChartA11yShell` so screen\nreaders receive a polite, debounced outlier announcement. No\nbuilt-in 3D detector ships with this PR; consumers should pair\nwith their own Mahalanobis-style detector or wait for the\nbatch3 contract evolution (Codex thread `019e10a5`) which adds\n`kind?: '3d'` discriminator to `AnomalySummary`.",
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description:
          'Optional override of the anomaly announcement template.\nForwarded to `ChartAriaLive.formatAnomalyAnnouncement`.',
      },
      {
        name: 'viewControl',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description:
          'Native ECharts `viewControl` override (camera position, auto-rotate,\netc.). Accepted as a passthrough — wrapper does not pre-process it.',
      },
      {
        name: 'grid3D',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description:
          'Native ECharts `grid3D` override (axis ticks, label colours,\nenvironment lighting). Passthrough — wrapper merges it into the\ndefault grid3D base shape.',
      },
      {
        name: 'light',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description:
          'Native ECharts `light` override (main / ambient / direction).\nPassthrough — wrapper merges it into the default light base shape.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<Scatter3D
  data={[
    { x: 0, y: 0, z: 0, value: 1 },
    { x: 1, y: 1, z: 2, value: 5 },
    { x: 2, y: 2, z: 4, value: 9 },
  ]}
  title="3D Point Cloud"
/>`,
    features: [
      'webgl-required',
      '3d-rendering',
      'lazy-load',
      'tooltip',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },

  'surface-3d-chart': {
    id: 'surface-3d-chart',
    name: 'Surface3D',
    description:
      '3D surface plot for row-major rectangular grids. Emits ECharts `surface` series via lazy `echarts-gl`. Requires `dataShape: [rows, columns]` to honour the grid topology (Faz 21.11 P1b).',
    importPath: "import { Surface3D } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'Surface3DDataPoint[]',
        required: true,
        default: '—',
        description: 'Row-major rectangular Surface3D data (`rows * columns === data.length`).',
      },
      {
        name: 'dataShape',
        type: 'readonly [rows: number, columns: number]',
        required: true,
        default: '—',
        description:
          'Required topology — `[rows, columns]`. Codex thread `019e10d7`\niter-2: silent `Math.sqrt(data.length)` inference is unsafe (a\n100×400 grid would read as 200×200). The helper enforces\n`rows * columns === data.length`.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter (used in tooltip + a11y data table).',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'shading',
        type: 'Surface3DShading',
        required: false,
        default: '"lambert"',
        description: 'Surface shading mode.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a data point is clicked.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — accepted but NO-OP on Surface3D.',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Surface3D).',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto"',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto"',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description: 'Anomaly summary forward (consumer-provided; no built-in 3D detector).',
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description: 'Optional override of the anomaly announcement template.',
      },
      {
        name: 'viewControl',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description: 'Native ECharts `viewControl` passthrough (camera / auto-rotate).',
      },
      {
        name: 'grid3D',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description: 'Native ECharts `grid3D` passthrough.',
      },
      {
        name: 'light',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description: 'Native ECharts `light` passthrough.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<Surface3D
  data={[
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 1, z: 2 },
    { x: 1, y: 0, z: 3 },
    { x: 1, y: 1, z: 4 },
  ]}
  dataShape={[2, 2]}
  title="3D Surface"
/>`,
    features: [
      'webgl-required',
      '3d-rendering',
      'lazy-load',
      'tooltip',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },

  'lines-3d-chart': {
    id: 'lines-3d-chart',
    name: 'Lines3D',
    description:
      '3D multi-path xyz lines rendered as one ECharts `line3D` (singular) series per path on shared cartesian3D / grid3D. The official `lines3D` (geo / globe) family is deferred (Faz 21.11 P1b, Codex thread `019e10d7`).',
    importPath: "import { Lines3D } from '@mfe/x-charts';",
    tier: 'enterprise',
    props: [
      {
        name: 'data',
        type: 'Lines3DPath[]',
        required: true,
        default: '—',
        description: 'Multi-path xyz data — each entry becomes one `line3D` series.',
      },
      {
        name: 'size',
        type: 'ChartSize',
        required: false,
        default: '"md"',
        description: 'Visual size variant.',
      },
      {
        name: 'valueFormatter',
        type: '(value: number) => string',
        required: false,
        default: 'undefined',
        description: 'Custom value formatter (used in tooltip + a11y data table).',
      },
      {
        name: 'animate',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Animate on mount.',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Chart title.',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Accessible description.',
      },
      {
        name: 'className',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Additional class name.',
      },
      {
        name: 'lineWidth',
        type: 'number',
        required: false,
        default: '2',
        description: 'Line width in pixels.',
      },
      {
        name: 'onDataPointClick',
        type: '(event: ChartClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a data point is clicked.',
      },
      {
        name: 'markups',
        type: 'ChartMarkup[]',
        required: false,
        default: 'undefined',
        description: 'Visual overlay markups — accepted but NO-OP on Lines3D.',
      },
      {
        name: 'onMarkupClick',
        type: '(event: ChartMarkupClickEvent) => void',
        required: false,
        default: 'undefined',
        description: 'Callback fired when a markup overlay is clicked (no-op on Lines3D).',
      },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto"',
        description: 'Theme override.',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto"',
        description: 'Decal pattern override.',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: 'Density override.',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: 'Accent palette override.',
      },
      {
        name: 'anomalySummary',
        type: 'AnomalySummary[]',
        required: false,
        default: 'undefined',
        description: 'Anomaly summary forward (consumer-provided; no built-in 3D detector).',
      },
      {
        name: 'formatAnomalyAnnouncement',
        type: 'AnomalyAnnouncementFormatter',
        required: false,
        default: 'undefined',
        description: 'Optional override of the anomaly announcement template.',
      },
      {
        name: 'viewControl',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description: 'Native ECharts `viewControl` passthrough (camera / auto-rotate).',
      },
      {
        name: 'grid3D',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description: 'Native ECharts `grid3D` passthrough.',
      },
      {
        name: 'light',
        type: 'Record<string, unknown>',
        required: false,
        default: 'undefined',
        description: 'Native ECharts `light` passthrough.',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description:
          'Access level controlling interactivity. "full" = interactive; "readonly" = blocks event callbacks; "disabled" = adds dim overlay + inert; "hidden" = renders nothing (Faz 21.4 PR-E2).',
      },
      {
        name: 'accessReason',
        type: 'string',
        required: false,
        default: 'undefined',
        description:
          'Optional human-readable reason explaining the access state. Surfaced in tooltips / aria-describedby for non-full states.',
      },
    ],
    sampleCode: `<Lines3D
  data={[
    { coords: [[0, 0, 0], [1, 1, 1], [2, 2, 4]], label: "Alpha" },
    { coords: [[0, 0, 0], [1, 0, 2], [2, 0, 1]], label: "Beta", color: "#22c55e" },
  ]}
  title="3D Path Set"
/>`,
    features: [
      'webgl-required',
      '3d-rendering',
      'lazy-load',
      'multi-series',
      'tooltip',
      'animation',
      'access-control',
      'decal',
      'density-aware',
      'accent-aware',
      'axe-gated',
      'contrast-gated-static',
      'bundle-gated',
      'tree-shake-gated',
      'ssr-subpath',
    ],
    a11y: ['keyboard-nav', 'data-table-fallback'],
    themes: ['auto', 'light', 'default', 'dark', 'high-contrast', 'print'],
  },

  /* ---- Interaction & Composition (Faz 21.4-B) ---- */

  'kpi-card': {
    id: 'kpi-card',
    name: 'KPICard',
    description:
      'Single-value KPI display with optional trend indicator and inline sparkline. Composable with any x-charts mini chart.',
    importPath: "import { KPICard } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'title',
        type: 'string',
        required: true,
        default: '—',
        description: 'KPI title (e.g. "Revenue")',
      },
      {
        name: 'value',
        type: 'string | number',
        required: true,
        default: '—',
        description: 'Primary KPI value',
      },
      {
        name: 'trend',
        type: '{ direction: "up" | "down"; value: string; positive: boolean }',
        required: false,
        default: 'undefined',
        description: 'Trend indicator with direction + delta',
      },
      {
        name: 'chart',
        type: 'ReactNode',
        required: false,
        default: 'undefined',
        description: 'Inline sparkline (slot)',
      },
    ],
    sampleCode: `<KPICard
  title="Revenue"
  value="$128,500"
  trend={{ direction: "up", value: "+12.5%", positive: true }}
  chart={<SparklineChart data={[10, 12, 8, 15, 13, 17, 20]} type="area" width="auto" />}
/>`,
    features: ['composable', 'sparkline-slot', 'trend-indicator', 'theme-aware'],
    a11y: ['aria-label', 'screen-reader-friendly'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'sparkline-chart': {
    id: 'sparkline-chart',
    name: 'SparklineChart',
    description:
      'Compact inline mini chart (line / area / bar) for table cells, KPI cards, and dense dashboards. No axes, no tooltip — pure data shape.',
    importPath: "import { SparklineChart } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'data',
        type: 'number[]',
        required: true,
        default: '[]',
        description: 'Numeric data series',
      },
      {
        name: 'type',
        type: '"line" | "area" | "bar"',
        required: false,
        default: '"line"',
        description: 'Visual variant',
      },
      {
        name: 'color',
        type: 'string',
        required: false,
        default: 'theme',
        description: 'Stroke / fill color override',
      },
    ],
    sampleCode: `<SparklineChart
  data={[10, 12, 8, 15, 13, 17, 20]}
  type="area"
  width="auto"
/>`,
    features: ['inline', 'no-axes', 'theme-aware', 'lightweight'],
    a11y: ['aria-hidden-by-default', 'expose-via-parent-aria-label'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'chart-dashboard': {
    id: 'chart-dashboard',
    name: 'ChartDashboard',
    description:
      'Multi-chart grid layout with responsive breakpoints. Composes KPI cards, sparklines, and full-size charts into a single dashboard surface.',
    importPath: "import { ChartDashboard } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'children',
        type: 'ReactNode',
        required: true,
        default: '—',
        description: 'Charts and KPI cards composed inside the grid',
      },
      {
        name: 'columns',
        type: 'number | { sm?: number; md?: number; lg?: number }',
        required: false,
        default: '{ sm: 1, md: 2, lg: 3 }',
        description: 'Grid column count per breakpoint',
      },
      {
        name: 'gap',
        type: 'number | string',
        required: false,
        default: '16',
        description: 'Gap between dashboard cells (px or CSS value)',
      },
    ],
    sampleCode: `<ChartDashboard columns={{ sm: 1, md: 2, lg: 3 }} gap={16}>
  <KPICard title="Revenue" value="$128K" />
  <KPICard title="Users" value="12,847" />
  <BarChart data={[{ label: "A", value: 100 }]} />
</ChartDashboard>`,
    features: ['responsive-grid', 'composition', 'breakpoint-aware'],
    a11y: ['landmark-region', 'logical-order'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'chart-container': {
    id: 'chart-container',
    name: 'ChartContainer',
    description:
      'Standardized wrapper for any x-charts component — title, description, loading/error/empty states, height slot, action buttons.',
    importPath: "import { ChartContainer } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'children',
        type: 'ReactNode',
        required: true,
        default: '—',
        description: 'Chart content rendered inside the container',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Card title displayed in the header',
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Secondary description below the title',
      },
      {
        name: 'loading',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show a loading spinner instead of children',
      },
      {
        name: 'error',
        type: 'string',
        required: false,
        default: 'undefined',
        description: 'Error message — replaces children with an error state',
      },
      {
        name: 'empty',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Show the empty-data placeholder',
      },
      {
        name: 'height',
        type: 'number | string',
        required: false,
        default: '300',
        description: 'Chart area height',
      },
      {
        name: 'actions',
        type: 'ReactNode',
        required: false,
        default: 'undefined',
        description: 'Action buttons rendered in the header row',
      },
    ],
    sampleCode: `<ChartContainer
  title="Q3 Sales"
  description="Container ile sarılmış BarChart"
  height={260}
>
  <BarChart data={[{ label: "Jan", value: 320 }]} />
</ChartContainer>`,
    features: ['states-layer', 'header-slot', 'actions-slot', 'composition'],
    a11y: ['landmark-region', 'live-region-error'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'chart-toolbar': {
    id: 'chart-toolbar',
    name: 'ChartToolbar',
    description:
      'Toolbar surface for chart-level actions: zoom in/out/reset, brush mode, undo/redo from cross-filter store, drill-up, export PNG/SVG. Driven by useChartInteractions state.',
    importPath: "import { ChartToolbar, useChartInteractions } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'interactions',
        type: 'ChartInteractionState',
        required: true,
        default: '—',
        description: 'State object returned by useChartInteractions',
      },
      {
        name: 'onExportPNG',
        type: '() => void',
        required: false,
        default: 'undefined',
        description: 'Callback for the export-PNG button',
      },
      {
        name: 'onExportSVG',
        type: '() => void',
        required: false,
        default: 'undefined',
        description: 'Callback for the export-SVG button',
      },
      {
        name: 'onUndo',
        type: '() => void',
        required: false,
        default: 'undefined',
        description: 'Undo callback (typically from cross-filter store)',
      },
      {
        name: 'onRedo',
        type: '() => void',
        required: false,
        default: 'undefined',
        description: 'Redo callback (typically from cross-filter store)',
      },
      {
        name: 'onDrillUp',
        type: '() => void',
        required: false,
        default: 'undefined',
        description: 'Drill-up callback (rendered when drillDepth > 0)',
      },
    ],
    sampleCode: `const [interactions] = useChartInteractions({ enableZoom: true, enableBrush: true });

<ChartToolbar
  interactions={interactions}
  onExportPNG={() => exportPNG()}
/>`,
    features: ['zoom-controls', 'brush-toggle', 'export-actions', 'undo-redo', 'drill-up'],
    a11y: ['button-aria-labels', 'keyboard-focusable'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'cross-filter': {
    id: 'cross-filter',
    name: 'CrossFilterProvider',
    description:
      'Chart-to-chart and chart-to-grid filter coordination bus. Wrap a tree with the provider; child charts/grids subscribe via useChartCrossFilter / useGridCrossFilter and emit filters on user interaction.',
    importPath: "import { CrossFilterProvider, useChartCrossFilter } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'children',
        type: 'ReactNode',
        required: true,
        default: '—',
        description: 'Subtree that will share the cross-filter store',
      },
      {
        name: 'initialFilters',
        type: 'CrossFilterEntry[]',
        required: false,
        default: '[]',
        description: 'Optional filters seeded into the store on mount',
      },
    ],
    sampleCode: `<CrossFilterProvider>
  <FilteredBar chartId="region" emitField="region" />
  <FilteredBar chartId="category" emitField="category" />
</CrossFilterProvider>`,
    features: [
      'linked-charts',
      'imperative-store-access',
      'event-bridge',
      'undo-redo',
      'bookmarks',
    ],
    a11y: ['filter-state-announced', 'reset-keyboard-focusable'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  /* ---- Faz 21.4 PR-B: drill-down + chart-to-grid cross-filter ---- */

  'cross-filter-grid': {
    id: 'cross-filter-grid',
    name: 'useGridCrossFilter',
    description:
      'Bridge a chart wrapper to a grid filter model. Chart click -> store -> grid.setFilterModel via the cross-filter event bridge. The mock grid panel renders the filter model so the bridge effect is observable.',
    importPath: "import { useGridCrossFilter } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'gridId',
        type: 'string',
        required: true,
        default: '—',
        description: 'Unique grid identifier in the cross-filter store',
      },
      {
        name: 'gridApi',
        type: 'GridApi | null',
        required: true,
        default: '—',
        description: 'AG Grid (or mock) API ref; null until the grid is ready',
      },
      {
        name: 'syncStoreToGrid',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Push store filter changes to the grid via setFilterModel',
      },
    ],
    sampleCode: `<CrossFilterProvider>
  <ChartSide />   {/* uses useChartCrossFilter to emit filters */}
  <GridSide />    {/* uses useGridCrossFilter to consume them */}
</CrossFilterProvider>

function GridSide() {
  // gridApi is the AG Grid instance ref; mock or real.
  useGridCrossFilter({ gridId: 'orders-grid', gridApi });
  return <AgGridReact /* … */ />;
}`,
    features: ['chart-to-grid', 'event-bridge', 'set-filter-model', 'reset'],
    a11y: ['filter-state-announced', 'reset-keyboard-focusable'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'drill-down': {
    id: 'drill-down',
    name: 'useDrillDown',
    description:
      'Hierarchical drill state machine. Define N levels; clicking a chart bar drills into the next level, breadcrumb navigates back. Drill state lives in the cross-filter store; useDrillDown must be called inside a CrossFilterProvider tree.',
    importPath: "import { useDrillDown, DrillDownBreadcrumb } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'levels',
        type: 'DrillDownLevelSpec[]',
        required: true,
        default: '—',
        description: 'Array of { field, label?, chartType? } level descriptors',
      },
      {
        name: 'rootLabel',
        type: 'string',
        required: false,
        default: '"All"',
        description: 'Display label for the root breadcrumb item',
      },
    ],
    sampleCode: `<CrossFilterProvider>
  {/* useDrillDown reads/writes the drill state through the
      cross-filter store, so a CrossFilterProvider ancestor is required. */}
  <MyDrillChart />
</CrossFilterProvider>

function MyDrillChart() {
  const drill = useDrillDown({
    levels: [
      { field: 'region', label: 'Region' },
      { field: 'city', label: 'City' },
      { field: 'store', label: 'Store' },
    ],
  });

  return (
    <>
      <DrillDownBreadcrumb
        items={drill.breadcrumbs}
        onNavigate={drill.drillTo}
      />
      <BarChart
        data={chartData}
        onDataPointClick={(e) => drill.drillDown(e.label, e.label)}
      />
    </>
  );
}`,
    features: ['drill-down', 'breadcrumb', 'reset'],
    a11y: ['breadcrumb-aria-current', 'level-state-announced'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'drill-down-history': {
    id: 'drill-down-history',
    name: 'useDrillDown (with undo)',
    description:
      'Same hook as drill-down with an explicit Undo button (drillUp wiring), a Reset action, and a depth + drill-count indicator. A real redo would require persisting the full {field,value,label} trail; that is intentionally out of scope here so the UI does not promise behaviour it cannot deliver.',
    importPath: "import { useDrillDown, DrillDownBreadcrumb } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'levels',
        type: 'DrillDownLevelSpec[]',
        required: true,
        default: '—',
        description: 'Array of { field, label?, chartType? } level descriptors',
      },
    ],
    sampleCode: `const drill = useDrillDown({ levels });
const [drillCount, setDrillCount] = useState(0);

const onClick = (label) => {
  drill.drillDown(label, label);
  setDrillCount((c) => c + 1);
};

const undo = () => {
  drill.drillUp();
  // drillCount is monotonic — counts drills fired, not depth.
};

return (
  <>
    <DrillDownBreadcrumb items={drill.breadcrumbs} onNavigate={drill.drillTo} />
    <button onClick={undo} disabled={drill.currentDepth === 0}>Undo</button>
    <button onClick={drill.drillToRoot}>Reset</button>
    <span>depth {drill.currentDepth} · drills fired {drillCount}</span>
  </>
);`,
    features: ['drill-down', 'undo', 'breadcrumb', 'reset'],
    a11y: ['breadcrumb-aria-current', 'undo-redo-keyboard-focusable'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  /* ---- Faz 21.4 PR-C: 5 feature demos ---- */

  'feature-brush': {
    id: 'feature-brush',
    name: 'useChartInteractions (brush)',
    description:
      'Click + drag on the chart container to capture a brush range. The hook tracks isBrushing, brushRange (data-space indices), and exposes clearBrush. Demo wires the handlers onto a plain div so the brush mechanics are observable without a real chart instance.',
    importPath: "import { useChartInteractions } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'enableBrush',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Turn brush handlers on',
      },
      {
        name: 'onBrushEnd',
        type: '(range) => void',
        required: false,
        default: '—',
        description: 'Fired on mouseup with the captured range',
      },
    ],
    sampleCode: `const [state, handlers] = useChartInteractions({ enableBrush: true });
return (
  <div {...handlers}>
    {state.isBrushing && <BrushOverlay range={state.brushRange} />}
  </div>
);`,
    features: ['brush', 'mouse-handlers', 'range-state', 'clear'],
    a11y: ['range-state-announced'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'feature-zoom-pan': {
    id: 'feature-zoom-pan',
    name: 'useChartInteractions (zoom + pan)',
    description:
      'Wheel-to-zoom and click-drag-pan handlers from a single hook. zoomLevel + panOffset live in the same state block. Pan is gated behind zoom > 1 so the chart only pans when zoomed in.',
    importPath: "import { useChartInteractions } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'enableZoom',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Wheel handler updates zoomLevel',
      },
      {
        name: 'enablePan',
        type: 'boolean',
        required: false,
        default: 'false',
        description: 'Mouse-drag handler updates panOffset (active when zoomLevel > 1)',
      },
      {
        name: 'zoomStep',
        type: 'number',
        required: false,
        default: '0.1',
        description: 'Multiplier per wheel tick',
      },
    ],
    sampleCode: `const [state, handlers] = useChartInteractions({
  enableZoom: true,
  enablePan: true,
});
return <div {...handlers}>zoom: {state.zoomLevel}× · pan: ({state.panOffset.x}, {state.panOffset.y})</div>;`,
    features: ['zoom', 'pan', 'wheel-handler', 'reset'],
    a11y: ['zoom-state-announced'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'feature-realtime': {
    id: 'feature-realtime',
    name: 'useRealTimeData',
    description:
      'Buffered streaming hook with two modes (discriminated union, Faz 21.8 PR-X1): manual (callers push points via addPoint) and auto-tick (caller passes tickIntervalMs + onTick, the hook owns the setInterval). Buffer caps at maxPoints (FIFO eviction). Pause/resume gate the buffer and suspend the auto-tick interval.',
    importPath: "import { useRealTimeData } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'maxPoints',
        type: 'number',
        required: false,
        default: '500',
        description: 'Buffer capacity (oldest evicted)',
      },
      {
        name: 'onNewPoint',
        type: '(point) => void',
        required: false,
        default: '—',
        description: 'Fired for every accepted point',
      },
      {
        name: 'tickIntervalMs',
        type: 'number',
        required: false,
        default: '—',
        description:
          'Auto-tick mode: positive finite ms. Required together with onTick (discriminated union).',
      },
      {
        name: 'onTick',
        type: '() => T | undefined',
        required: false,
        default: '—',
        description:
          'Auto-tick producer. Hook calls this every tickIntervalMs ms and pushes the returned point (or skips if undefined).',
      },
    ],
    sampleCode: `type Tick = { t: number; v: number };

function MyStreamingChart() {
  // Auto-tick: hook owns the setInterval, no useEffect needed.
  const stream = useRealTimeData<Tick>({
    maxPoints: 50,
    tickIntervalMs: 250,
    onTick: () => ({ t: Date.now(), v: Math.random() }),
  });

  return <span>points: {stream.data.length}</span>;
}`,
    features: ['stream-buffer', 'auto-tick', 'pause-resume', 'fifo-eviction'],
    a11y: ['point-count-announced'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'feature-theme-switch': {
    id: 'feature-theme-switch',
    name: 'BarChart theme prop',
    description:
      'Every chart wrapper accepts a theme prop ("auto" | "light" | "default" | "dark" | "high-contrast" | "print"). Switching the prop re-resolves the ECharts theme + palette and re-renders without remounting the chart.',
    importPath: "import { BarChart } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [
      {
        name: 'theme',
        type: '"auto" | "light" | "default" | "dark" | "high-contrast" | "print"',
        required: false,
        default: '"auto"',
        description: 'Override the resolved chart theme',
      },
    ],
    sampleCode: `<BarChart data={data} theme={theme} animate={false} />`,
    features: ['theme-prop', 'palette-swap', 'no-remount'],
    a11y: ['high-contrast', 'print', 'decal-fallback'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  'feature-export': {
    id: 'feature-export',
    name: 'useChartExport',
    description:
      'Imperative export hook: PNG and SVG go through instance.getDataURL; CSV goes through a Blob ➜ URL.createObjectURL anchor download. Demo uses a deterministic mock instance (the public BarChart wrapper does not expose its ECharts ref).',
    importPath: "import { useChartExport } from '@mfe/x-charts';",
    tier: 'interaction',
    props: [],
    sampleCode: `const exporter = useChartExport();
const onExport = () => exporter.exportChart(instance, 'png', { filename: 'chart' });`,
    features: ['png', 'svg', 'csv', 'data-url', 'blob'],
    a11y: ['download-button-focusable'],
    themes: ['light', 'dark', 'high-contrast', 'print'],
  },

  /* ---- AI helpers (Faz 21.4-B3) ---- */

  'detect-anomalies': {
    id: 'detect-anomalies',
    name: 'detectAnomalies',
    description:
      'IQR-based outlier detection. Returns indices, values, z-scores, and direction (high/low) for each anomaly in a numeric series.',
    importPath: "import { detectAnomalies } from '@mfe/x-charts';",
    tier: 'ai',
    props: [
      {
        name: 'data',
        type: 'number[]',
        required: true,
        default: '—',
        description: 'Numeric values to scan for outliers',
      },
      {
        name: 'sensitivity',
        type: 'number',
        required: false,
        default: '1.5',
        description: 'IQR multiplier — lower = more sensitive',
      },
    ],
    sampleCode: `const anomalies = detectAnomalies([10, 12, 8, 95, 13]);
// → [{ index: 3, value: 95, zScore: 12.5, direction: 'high' }]`,
    features: ['iqr-method', 'direction-flag', 'pure-function'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  'identify-trends': {
    id: 'identify-trends',
    name: 'identifyTrends',
    description:
      'Linear-regression trend detection. Returns direction (up/down/flat), slope, R², and a human-readable summary, or null if the series is too short.',
    importPath: "import { identifyTrends } from '@mfe/x-charts';",
    tier: 'ai',
    props: [
      {
        name: 'data',
        type: 'number[]',
        required: true,
        default: '—',
        description: 'Numeric values to analyse for a monotonic trend',
      },
      {
        name: 'flatThreshold',
        type: 'number',
        required: false,
        default: '0.01',
        description: 'Slope magnitude below which the trend is reported as flat',
      },
    ],
    sampleCode: `const trend = identifyTrends([10, 14, 18, 22, 26]);
// → { direction: 'up', slope: 4, rSquared: 1, summary: '...' }`,
    features: ['linear-regression', 'r-squared', 'flat-threshold', 'pure-function'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  'suggest-chart': {
    id: 'suggest-chart',
    name: 'suggestChartType',
    description:
      'Heuristic chart-type recommender. Analyses tabular data shape (row/column counts, dtypes, cardinality) and returns ranked suggestions with confidence scores and reasoning.',
    importPath: "import { suggestChartType } from '@mfe/x-charts';",
    tier: 'ai',
    props: [
      {
        name: 'data',
        type: 'Record<string, unknown>[]',
        required: true,
        default: '—',
        description: 'Tabular sample to analyse',
      },
      {
        name: 'maxSuggestions',
        type: 'number',
        required: false,
        default: '5',
        description: 'Cap on returned suggestions',
      },
    ],
    sampleCode: `const suggestions = suggestChartType([
  { month: 'Jan', revenue: 320 },
  { month: 'Feb', revenue: 332 },
]);
// → [{ type: 'bar', confidence: 0.9, reason: '...' }, ...]`,
    features: ['shape-analysis', 'confidence-score', 'ranked-output', 'pure-function'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  'chart-description': {
    id: 'chart-description',
    name: 'generateChartDescription',
    description:
      'Generates a Turkish, screen-reader-friendly description for any chart from its type, data point count, value range, and optional categories. Drop the result into aria-describedby.',
    importPath: "import { generateChartDescription } from '@mfe/x-charts';",
    tier: 'ai',
    props: [
      {
        name: 'input',
        type: 'DescriptionInput',
        required: true,
        default: '—',
        description: 'chartType, title, dataPointCount, seriesCount, min/max, categories',
      },
    ],
    sampleCode: `generateChartDescription({
  chartType: 'bar',
  title: 'Aylık Gelir',
  dataPointCount: 6,
  minValue: 301,
  maxValue: 390,
});
// → 'Aylık Gelir adlı çubuk grafik. 6 veri noktası, 301 ile 390 arasında.'`,
    features: ['tr-locale', 'aria-describedby-friendly', 'pure-function'],
    a11y: ['screen-reader-narration', 'wcag-aa-compliant'],
    themes: ['n/a'],
  },

  'nl-to-chart': {
    id: 'nl-to-chart',
    name: 'nlToChartSpec',
    description:
      'Converts a natural-language query into a validated ChartSpec via a user-supplied LLM fetchFn. Returns spec, isValid, errors, prompt, rawResponse for full traceability.',
    importPath: "import { nlToChartSpec } from '@mfe/x-charts';",
    tier: 'ai',
    props: [
      {
        name: 'options.query',
        type: 'string',
        required: true,
        default: '—',
        description: 'Natural-language instruction',
      },
      {
        name: 'options.fetchFn',
        type: '(prompt: string) => Promise<string>',
        required: true,
        default: '—',
        description: 'LLM call adapter — caller wires this to OpenAI / Anthropic / etc.',
      },
      {
        name: 'options.columns',
        type: '{ field, type }[]',
        required: false,
        default: 'undefined',
        description: 'Optional schema hints for grounding',
      },
      {
        name: 'options.preferredType',
        type: 'ChartType',
        required: false,
        default: 'undefined',
        description: 'Bias the LLM toward a specific chart type',
      },
    ],
    sampleCode: `const result = await nlToChartSpec({
  query: 'Show quarterly sales as a bar chart',
  fetchFn: async (prompt) => callOpenAI(prompt),
});
// → { spec: { type: 'bar', ... }, isValid: true, errors: [], ... }`,
    features: ['llm-agnostic', 'validation', 'traceable-prompt', 'async'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  /* ---- Performance utilities (Faz 21.4-B4) ---- */

  lttb: {
    id: 'lttb',
    name: 'downsampleLTTB',
    description:
      'Largest-Triangle-Three-Buckets downsampling. Reduces a numeric (x, y) series to a target threshold while preserving visual shape — ideal for 100k+ point charts.',
    importPath: "import { downsampleLTTB } from '@mfe/x-charts';",
    tier: 'perf',
    props: [
      {
        name: 'data',
        type: 'LTTBPoint[]',
        required: true,
        default: '—',
        description: 'Series of { x, y } points',
      },
      {
        name: 'threshold',
        type: 'number',
        required: true,
        default: '—',
        description: 'Target output size; <2 or >=data.length returns the input clone',
      },
    ],
    sampleCode: `const reduced = downsampleLTTB(points, 1000);
// 100,000 → 1,000 points, ~99% bandwidth saved`,
    features: ['shape-preserving', 'pure-function', 'allocation-bounded'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  'progressive-render': {
    id: 'progressive-render',
    name: 'useProgressiveRender',
    description:
      'Hook that streams a large dataset to the chart in batches, keeping the main thread responsive. Below an immediateThreshold, returns the data synchronously.',
    importPath: "import { useProgressiveRender } from '@mfe/x-charts';",
    tier: 'perf',
    props: [
      {
        name: 'options.data',
        type: 'T[]',
        required: true,
        default: '—',
        description: 'Source array',
      },
      {
        name: 'options.batchSize',
        type: 'number',
        required: false,
        default: '5000',
        description: 'Points per RAF tick',
      },
      {
        name: 'options.immediateThreshold',
        type: 'number',
        required: false,
        default: '10000',
        description: 'Below this size, render synchronously',
      },
      {
        name: 'options.enabled',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'Disable to fall back to immediate render',
      },
    ],
    sampleCode: `const { data, isProgressing, progress } = useProgressiveRender({
  data: bigSeries,
  batchSize: 5000,
});`,
    features: ['raf-scheduled', 'progress-state', 'cancellable', 'pure-hook'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  'lazy-chart': {
    id: 'lazy-chart',
    name: 'useLazyChart',
    description:
      'IntersectionObserver-based lazy mount. Returns a containerRef and a shouldRender flag that flips to true when the container scrolls into view.',
    importPath: "import { useLazyChart } from '@mfe/x-charts';",
    tier: 'perf',
    props: [
      {
        name: 'options.rootMargin',
        type: 'string',
        required: false,
        default: '"200px"',
        description: 'IntersectionObserver pre-fetch margin',
      },
      {
        name: 'options.enabled',
        type: 'boolean',
        required: false,
        default: 'true',
        description: 'When false, shouldRender is true immediately',
      },
    ],
    sampleCode: `const { containerRef, shouldRender } = useLazyChart({ rootMargin: '200px' });
return <div ref={containerRef}>{shouldRender ? <BarChart ... /> : null}</div>;`,
    features: ['intersection-observer', 'pre-fetch-margin', 'pure-hook'],
    a11y: ['inherits-host-aria'],
    themes: ['n/a'],
  },

  'lru-cache': {
    id: 'lru-cache',
    name: 'LRUCache',
    description:
      'Bounded least-recently-used cache. Useful for memoising query results, downsampled series, or compiled ECharts options. Eviction is deterministic (insertion-order).',
    importPath: "import { LRUCache } from '@mfe/x-charts';",
    tier: 'perf',
    props: [
      {
        name: 'maxSize',
        type: 'number',
        required: false,
        default: '50',
        description: 'Maximum entries — must be >= 1',
      },
    ],
    sampleCode: `const cache = new LRUCache<string, ChartSpec>(50);
cache.set(key, spec);
const cached = cache.get(key); // promotes to most-recently-used`,
    features: ['size-bounded', 'eviction-deterministic', 'generic-types'],
    a11y: ['no-ui-surface'],
    themes: ['n/a'],
  },

  'code-split': {
    id: 'code-split',
    name: 'lazyChartImport',
    description:
      'Returns a React.lazy wrapper for a known chart type. Throws on unknown types so configuration errors surface at registration time, not at render time.',
    importPath: "import { lazyChartImport } from '@mfe/x-charts';",
    tier: 'perf',
    props: [
      {
        name: 'chartType',
        type: 'string',
        required: true,
        default: '—',
        description: 'Registered chart type (bar / line / pie / ...)',
      },
    ],
    sampleCode: `const LazyBar = lazyChartImport('bar');
return <Suspense fallback={<Skeleton />}><LazyBar data={...} /></Suspense>;`,
    features: ['react-lazy', 'unknown-type-throws', 'tree-shake-friendly'],
    a11y: ['inherits-host-aria'],
    themes: ['n/a'],
  },
};

/* ------------------------------------------------------------------ */
/*  Playground default prop values per chart                           */
/*                                                                     */
/*  Faz 21.8 follow-up (Codex thread 019def27): the per-chart switch  */
/*  was replaced by `chartPlaygroundModel.deriveDefaults`, which      */
/*  derives typed defaults from the catalog + sidecar overrides.       */
/* ------------------------------------------------------------------ */

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

const ChartDetail: React.FC = () => {
  const { chartId } = useParams<{ chartId: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const chart = useMemo(() => (chartId ? CHART_CATALOG[chartId] : undefined), [chartId]);

  // Metric chips for the hero header (Codex thread `019def27` simplification:
  // overview metric cards collapsed into the title strip).
  const metricChips = useMemo(() => {
    if (!chart) return null;
    const editableCount = buildDescriptors(chart.id, chart.props).filter(
      (d) => d.kind !== 'complex',
    ).length;
    return [
      { label: `${chart.props.length} props`, tone: 'neutral' as const },
      { label: `${editableCount} editable`, tone: 'neutral' as const },
      { label: `${chart.themes.length} themes`, tone: 'neutral' as const },
      { label: `${chart.features.length} capabilities`, tone: 'neutral' as const },
    ];
  }, [chart]);

  const handleCopyImport = useCallback(async () => {
    if (!chart?.importPath) return;
    try {
      await navigator.clipboard.writeText(chart.importPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }, [chart?.importPath]);

  /* ---- Not found ---- */
  if (!chart) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-border-subtle bg-surface-default text-center">
        <BarChart3 className="h-8 w-8 text-text-tertiary" />
        <p className="mt-3 text-sm font-medium text-text-primary">Chart not found</p>
        <p className="mt-1 text-xs text-text-secondary">
          No chart registered with id &quot;{chartId}&quot;
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/design-lab/charts')}
          className="mt-4 rounded-lg bg-action-primary px-4 py-2 text-xs font-medium text-text-inverse transition hover:opacity-90"
        >
          Back to Charts
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* -- Breadcrumb -- */}
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary">
        <button
          type="button"
          onClick={() => navigate('/admin/design-lab')}
          className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-muted hover:text-text-primary"
        >
          Design Lab
        </button>
        <ChevronRight className="h-3 w-3 opacity-40" />
        <button
          type="button"
          onClick={() => navigate('/admin/design-lab/charts')}
          className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-muted hover:text-text-primary"
        >
          Charts
        </button>
        <ChevronRight className="h-3 w-3 opacity-40" />
        <span className="rounded-md bg-surface-muted px-2 py-0.5 font-medium text-text-primary">
          {chart.name}
        </span>
      </nav>

      {/* -- Hero header -- */}
      <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-linear-to-br from-surface-default via-surface-default to-surface-canvas p-4 sm:p-6 lg:p-8">
        {/* Decorative dots */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="relative min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {chart.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {chart.description}
          </p>

          {/*
            Badges — Faz 21.9 PR2 (Codex thread `019defa5`):
            on mobile (< 640px) the strip becomes a horizontal scroll lane
            so 7-12 chips don't wrap into 4-5 rows that push the rest of
            the page below the fold. From `sm` upward we restore wrap so
            tablet/desktop users see every badge at a glance. Each chip
            adds `shrink-0 whitespace-nowrap` so it never collapses or
            wraps mid-text inside the scroll lane.
          */}
          <div
            className="mt-4 -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0"
            data-testid="chart-detail-badges"
          >
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-state-success-bg px-3 py-1 text-xs font-semibold text-state-success-text">
              <span className="h-1.5 w-1.5 rounded-full bg-state-success-text" />
              stable
            </span>
            <span
              className={[
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
                chart.tier === 'enterprise'
                  ? 'bg-action-primary/10 text-action-primary'
                  : 'bg-state-info-bg text-state-info-text',
              ].join(' ')}
            >
              {chart.tier}
            </span>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-border-subtle bg-surface-canvas px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              ECharts 5.6
            </span>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-border-subtle bg-surface-canvas px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              @mfe/x-charts
            </span>
            {/*
              Metric chips (Codex thread `019def27` simplification):
              the previous Overview tab's 4 "metric cards" (Props / Themes /
              Engine / Features) collapse into a single chip strip on the
              hero header so the developer sees component shape at a glance
              without an extra tab click.
            */}
            {metricChips?.map((chip) => (
              <span
                key={chip.label}
                className="shrink-0 whitespace-nowrap rounded-full border border-border-subtle bg-surface-canvas px-2.5 py-0.5 text-xs font-medium tabular-nums text-text-secondary"
              >
                {chip.label}
              </span>
            ))}
            {/*
              Beta / new feature badges (Codex thread `019def27` PR3):
              MUI X uses "New" pills to advertise recently-added capabilities
              (Range bar variant, Data Grid integration). We surface our own
              betas directly next to the metric chips so developers see at a
              glance which features are still stabilising before they wire
              them into production code.
            */}
            {chart.features
              .map((f) => ({ feature: f, badge: getFeatureBadge(f) }))
              .filter(
                (entry): entry is { feature: string; badge: NonNullable<typeof entry.badge> } =>
                  entry.badge !== null,
              )
              .map(({ feature, badge }) => (
                <span
                  key={`badge-${feature}`}
                  className={[
                    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    badge.label === 'beta'
                      ? 'border-state-warning-text/30 bg-state-warning-bg text-state-warning-text'
                      : badge.label === 'new'
                        ? 'border-state-info-text/30 bg-state-info-bg text-state-info-text'
                        : 'border-border-subtle bg-surface-canvas text-text-secondary',
                  ].join(' ')}
                  title={badge.tooltip ?? undefined}
                >
                  <span>{feature}</span>
                  <span className="rounded bg-white/40 px-1 py-0 font-semibold uppercase tracking-wider">
                    {badge.label}
                  </span>
                </span>
              ))}
          </div>
        </div>

        {/* Import statement */}
        <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-canvas/80 px-4 py-2.5 backdrop-blur-xs">
          <div className="mr-2 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            import
          </div>
          <code className="flex-1 overflow-x-auto font-mono text-xs text-text-primary">
            {chart.importPath}
          </code>
          <button
            type="button"
            onClick={handleCopyImport}
            className="shrink-0 rounded-lg p-1.5 text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
            aria-label="Copy import"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-state-success-text" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/*
        Single-page layout (Codex thread `019def27` AGREE — Variant A-lite):
        the previous 6-tab system (Overview / Playground / API / Examples /
        Themes / Quality) is replaced with sequential anchored sections.
        This matches MUI / MUI X / Ant Design / Mantine component-doc
        conventions: live demo first, reference second, audit last.

          - Overview tab is gone — its preview lives inside Playground via
            ChartPreviewLive; its metric cards collapsed into the hero
            chip strip above.
          - Themes tab is gone — the inline `theme/decal/density/accent`
            switchers in PlaygroundTab cover the on-demand override case.
          - Examples + Quality stay as collapsible sections (audit-style)
            so the page doesn't get noisy by default.
      */}

      {/*
        User follow-up after PR #186:
          > "api ve play grounda açılır kapanır olsa iyi olurdu"

        Every section is now a CollapsibleDetailSection. Defaults:
          - Playground: open  (primary developer surface)
          - API:        open  (props reference)
          - Examples:   closed (preset deep-dive)
          - Quality:    closed (audit gates)
      */}

      {/* PLAYGROUND — primary developer surface, open by default */}
      <CollapsibleDetailSection id="playground" title="Playground" defaultOpen>
        <PlaygroundTab chart={chart} />
      </CollapsibleDetailSection>

      {/* EXAMPLES — preset code snippets (PR2 will make these live) */}
      <CollapsibleDetailSection id="examples" title="Examples" defaultOpen={false}>
        <ExamplesTab chart={chart} />
      </CollapsibleDetailSection>

      {/* API — full props reference, open by default */}
      <CollapsibleDetailSection id="api" title="API" defaultOpen>
        <ApiTab chart={chart} />
      </CollapsibleDetailSection>

      {/* PERFORMANCE — large-data guidance (Codex thread `019def27` PR3) */}
      <CollapsibleDetailSection id="performance" title="Performance" defaultOpen={false}>
        <PerformanceSection />
      </CollapsibleDetailSection>

      {/* FAQ — competitor-parity Q&A (Ant Design pattern) */}
      <CollapsibleDetailSection id="faq" title="FAQ" defaultOpen={false}>
        <FaqSection />
      </CollapsibleDetailSection>

      {/* QUALITY — audit gates, collapsed by default */}
      <CollapsibleDetailSection id="quality" title="Quality" defaultOpen={false}>
        <QualityTab chart={chart} />
      </CollapsibleDetailSection>
    </div>
  );
};

/* ================================================================== */
/*  PerformanceSection — large-data guidance                           */
/*                                                                     */
/*  Codex thread `019def27` PR3: MUI X documents recommended data      */
/*  sizes + reduced-motion + SVG-batch trade-offs. Our previous Quality */
/*  section listed CI gates ("axe-gated", "tree-shake-gated") but      */
/*  never answered "ne zaman sorun yaşarım?" in user-facing language.   */
/*  Plain-language playbook lives in `chartPlaygroundModel`             */
/*  `getPerformanceGuidance()`.                                         */
/* ================================================================== */

function PerformanceSection() {
  const guidance = useMemo(() => getPerformanceGuidance(), []);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-tertiary">
        Wrappers are wired to handle the common scale-up paths automatically — the notes below cover
        the breakpoints where you should reach for the performance utilities (LTTB, progressive
        render, lazy-chart, lru-cache, code-split).
      </p>
      <ul className="flex flex-col gap-2">
        {guidance.map((item) => (
          <li
            key={item.label}
            className="rounded-xl border border-border-subtle bg-surface-canvas p-4"
          >
            <p className="text-sm font-semibold text-text-primary">{item.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.body}</p>
            {item.reference && (
              <span className="mt-2 inline-block rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-text-tertiary">
                {item.reference}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================================================================== */
/*  FaqSection — competitor-parity Q&A                                 */
/*                                                                     */
/*  Codex thread `019def27` PR3: Ant Design Charts ships a per-component */
/*  FAQ that disambiguates the most common ramp-up questions. We mirror */
/*  that pattern globally (the answers cover wrapper conventions, not  */
/*  chart-specific behaviour) so every chart's detail page benefits     */
/*  from the same Q&A list. Source: `chartPlaygroundModel.getFaq()`.    */
/* ================================================================== */

function FaqSection() {
  const entries = useMemo(() => getFaq(), []);
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li
          key={entry.question}
          className="rounded-xl border border-border-subtle bg-surface-canvas p-4"
        >
          <p className="text-sm font-semibold text-text-primary">{entry.question}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{entry.answer}</p>
        </li>
      ))}
    </ul>
  );
}

/* ================================================================== */
/*  DetailSection — REMOVED                                            */
/*                                                                     */
/*  Every chart-detail section is now collapsible (user follow-up      */
/*  after PR #186 — `api ve playgrounda açılır kapanır olsa iyi        */
/*  olurdu`). The always-visible variant is no longer used; if a       */
/*  future section needs an always-open layout, prefer adding a        */
/*  `collapsible={false}` flag to `CollapsibleDetailSection` rather    */
/*  than reintroducing two near-identical wrappers.                    */
/* ================================================================== */

/* ================================================================== */
/*  CollapsibleDetailSection — Examples / Quality accordion            */
/* ================================================================== */

function CollapsibleDetailSection({
  id,
  title,
  defaultOpen = false,
  countBadge,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  countBadge?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-2xl border border-border-subtle bg-surface-default"
      data-testid={`detail-section-${id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition hover:bg-surface-muted"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-secondary" />
        )}
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
        {typeof countBadge === 'number' && countBadge > 0 && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary">
            {countBadge}
          </span>
        )}
        <div className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          {open ? 'collapse' : 'expand'}
        </span>
      </button>
      {open && <div className="border-t border-border-subtle p-5">{children}</div>}
    </section>
  );
}

export default ChartDetail;

/* ================================================================== */
/*  OverviewTab — REMOVED                                              */
/*                                                                     */
/*  Codex thread `019def27` AGREE — Variant A-lite simplification:     */
/*  the Overview tab's preview moved into PlaygroundTab via            */
/*  ChartPreviewLive; its 4 metric cards (Props / Themes / Engine /    */
/*  Features) collapsed into the hero header chip strip; its           */
/*  Capabilities chip list is rendered inline by ChartDetail itself    */
/*  (header description neighbour). Component removed entirely.        */
/* ================================================================== */

/* ================================================================== */
/*  PlaygroundTab                                                      */
/* ================================================================== */

function PlaygroundTab({ chart }: { chart: ChartMeta }) {
  // Build typed editor descriptors for every prop in the catalog and derive
  // the initial playground state from their typed defaults. The descriptor
  // array also drives codegen so the generated snippet stays in sync with
  // the real API defaults.
  const descriptors = useMemo<EditorDescriptor[]>(
    () => buildDescriptors(chart.id, chart.props),
    [chart.id, chart.props],
  );
  const defaults = useMemo<PlaygroundState>(() => deriveDefaults(descriptors), [descriptors]);

  // URL persistence (Faz 21.10 PR-FE-Playground-1, Codex iter-1 absorb):
  //   - On first mount, hydrate from `?p=<base64 JSON of non-default props>`
  //     via UTF-8 safe `decodePlaygroundState` (Codex 019e0d02 REVISE: raw
  //     `atob`+JSON would have crashed on Turkish title `İş gücü`).
  //   - `validKeys` filters out cross-chart stale keys so a `?p=` shared
  //     from bar-chart and pasted into pie-chart silently drops irrelevant
  //     props instead of leaking them downstream.
  //   - On chart navigation, drop hydrated state in favour of the new
  //     chart's defaults — `lastChartId` ref distinguishes "first render"
  //     from "chart changed" so the URL hydration is not clobbered.
  //   - State → URL sync writes the diff via `encodePlaygroundState` in
  //     `replace` mode (no history pollution); empty diff → `?p=` deleted.
  const [searchParams, setSearchParams] = useSearchParams();
  const validKeys = useMemo<ReadonlySet<string>>(
    () => new Set(descriptors.map((d) => d.prop.name)),
    [descriptors],
  );
  const [pgState, setPgState] = useState<PlaygroundState>(() =>
    decodePlaygroundState(searchParams.get('p'), defaults, validKeys),
  );
  const lastChartId = useRef(chart.id);
  useEffect(() => {
    if (lastChartId.current === chart.id) return;
    lastChartId.current = chart.id;
    setPgState(defaults);
  }, [chart.id, defaults]);
  useEffect(() => {
    const encoded = encodePlaygroundState(pgState, defaults);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (encoded === null) {
          next.delete('p');
        } else {
          next.set('p', encoded);
        }
        return next;
      },
      { replace: true },
    );
  }, [pgState, defaults, setSearchParams]);

  // Group descriptors by category for the categorised editor layout. We
  // preserve the catalog order within each category.
  const grouped = useMemo(() => {
    const buckets: Record<EditorCategory, EditorDescriptor[]> = {
      data: [],
      display: [],
      theme: [],
      access: [],
      advanced: [],
    };
    for (const d of descriptors) {
      buckets[d.category].push(d);
    }
    return buckets;
  }, [descriptors]);

  const setValue = useCallback((propName: string, value: PlaygroundValue) => {
    setPgState((prev) => ({ ...prev, [propName]: value }));
  }, []);

  const handleToggle = useCallback((propName: string) => {
    setPgState((prev) => ({ ...prev, [propName]: !prev[propName] }));
  }, []);

  const generatedCode = useMemo(
    () => generatePlaygroundCode(chart.name, descriptors, pgState, chart.id),
    [chart.id, chart.name, descriptors, pgState],
  );

  const sampleData = useMemo<SampleDataDef | null>(() => getSampleData(chart.id), [chart.id]);

  // Reset returns the editor to the catalog-derived defaults — the same
  // shape the user landed on. Keyed by reference equality so it doesn't
  // trigger unnecessary re-renders.
  const handleReset = useCallback(() => {
    setPgState(defaults);
  }, [defaults]);

  // Diff vs. defaults so the Reset button can disable when the editor is
  // already in the default state. Cheap shallow compare over the small
  // playground object is fine here.
  const isDirty = useMemo(() => {
    const stateKeys = Object.keys(pgState);
    const defaultKeys = Object.keys(defaults);
    if (stateKeys.length !== defaultKeys.length) return true;
    for (const k of stateKeys) {
      if (pgState[k] !== defaults[k]) return true;
    }
    return false;
  }, [pgState, defaults]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Controls panel */}
        <div
          className="rounded-2xl border border-border-subtle bg-surface-default p-5 lg:col-span-1"
          data-testid="props-editor-panel"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
              Props Editor
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary">
                {descriptors.filter((d) => d.kind !== 'complex').length} / {descriptors.length}
              </span>
              <button
                type="button"
                onClick={handleReset}
                disabled={!isDirty}
                className={[
                  'inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-canvas px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition',
                  isDirty
                    ? 'text-text-primary hover:bg-surface-muted'
                    : 'cursor-not-allowed text-text-tertiary opacity-50',
                ].join(' ')}
                data-testid="playground-reset"
                aria-label="Reset playground to defaults"
                title="Reset to defaults"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {CATEGORY_ORDER.map((cat) => {
              const items = grouped[cat];
              if (items.length === 0) return null;
              return (
                <PlaygroundCategoryGroup
                  key={cat}
                  category={cat}
                  items={items}
                  state={pgState}
                  onToggle={handleToggle}
                  onChange={setValue}
                />
              );
            })}
          </div>
        </div>

        {/* Live preview area */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {/*
            Faz 21.9 PR2 (Codex thread `019defa5`):
              - mobile p-3 (12px) instead of p-8 (32px) — leaves the chart
                more horizontal room on small viewports
              - min-h responsive — 240 mobile / 320 tablet / 360 desktop;
                ChartPreviewLive itself clamps its render height the same
                way so the chart canvas + preview surround are in lockstep
              - `min-w-0` on the container so the chart never forces the
                outer grid into horizontal overflow at narrow widths
          */}
          <div className="flex-1 rounded-2xl border border-border-subtle bg-surface-canvas p-3 sm:p-6 lg:p-8">
            <div className="flex min-h-[240px] items-center justify-center sm:min-h-[320px] lg:min-h-[360px]">
              {/*
                Codex 019defa5 PARTIAL fix: do NOT pass `height={360}`.
                That value used to be a fixed render height; with PR2 it
                became a *floor* on top of `responsiveHeight(clampedSize)`
                — and a 360 floor cancelled the mobile/tablet shrink the
                whole responsive overhaul was supposed to deliver. Letting
                the prop default keeps `floor=0` so the chart-size-derived
                height (220 / 320 / 420) wins on every breakpoint.
              */}
              <ChartPreviewLive chartId={chart.id} chartName={chart.name} toggles={pgState} />
            </div>
          </div>

          {/* Generated code */}
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-default">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                Generated Code
              </span>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-text-primary">
              <code>{generatedCode}</code>
            </pre>
          </div>

          {/* Sample Data — preview-feeding mock data definitions */}
          {sampleData && (
            <div
              className="overflow-hidden rounded-xl border border-border-subtle bg-surface-default"
              data-testid="playground-sample-data"
            >
              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
                <Database className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                  Sample Data
                </span>
                <span className="text-[10px] text-text-tertiary">
                  · live preview uses these literals
                </span>
              </div>
              <div className="flex flex-col divide-y divide-border-subtle">
                {sampleData.scaffold.map((entry) => (
                  <div key={entry.propName} className="px-4 py-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text-primary">
                        {entry.varName}
                      </span>
                      <span className="text-[10px] text-text-tertiary">
                        {entry.caption} → <code className="font-mono">{entry.propName}</code>
                      </span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre rounded bg-surface-muted p-3 text-[11px] leading-relaxed text-text-primary">
                      <code>{entry.jsLiteral}</code>
                    </pre>
                  </div>
                ))}
                {sampleData.auxiliaryProps?.map((aux) => (
                  <div key={aux.propName} className="px-4 py-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text-primary">{aux.varName}</span>
                      <span className="text-[10px] text-text-tertiary">
                        → <code className="font-mono">{aux.propName}</code>
                      </span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre rounded bg-surface-muted p-3 text-[11px] leading-relaxed text-text-primary">
                      <code>{aux.jsLiteral}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  PlaygroundCategoryGroup                                            */
/* ================================================================== */

function PlaygroundCategoryGroup({
  category,
  items,
  state,
  onToggle,
  onChange,
}: {
  category: EditorCategory;
  items: EditorDescriptor[];
  state: PlaygroundState;
  onToggle: (propName: string) => void;
  onChange: (propName: string, value: PlaygroundValue) => void;
}) {
  const [open, setOpen] = useState(CATEGORY_DEFAULT_OPEN[category]);
  return (
    <section className="rounded-lg border border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 transition hover:bg-surface-muted"
        aria-expanded={open}
        data-testid={`playground-category-${category}`}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">
            {CATEGORY_LABEL[category]}
          </span>
        </div>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary">
          {items.length}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-border-subtle px-2 py-2">
          {items.map((d) => (
            <PlaygroundPropEditor
              key={d.prop.name}
              descriptor={d}
              value={state[d.prop.name]}
              onToggle={onToggle}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/*  PlaygroundPropEditor                                               */
/* ================================================================== */

function PlaygroundPropEditor({
  descriptor,
  value,
  onToggle,
  onChange,
}: {
  descriptor: EditorDescriptor;
  value: PlaygroundValue;
  onToggle: (propName: string) => void;
  onChange: (propName: string, value: PlaygroundValue) => void;
}) {
  const { prop, kind, liveEditable, options, readOnlyHint } = descriptor;
  const hint = !liveEditable ? readOnlyHint : null;
  const disabled = !liveEditable;

  return (
    <label
      className={[
        'flex flex-col gap-1.5 rounded-md px-2 py-2 transition',
        disabled ? 'opacity-60' : 'hover:bg-surface-muted',
      ].join(' ')}
      data-testid={`playground-prop-${prop.name}`}
      data-prop-kind={kind}
      data-live-editable={liveEditable ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-text-primary">{prop.name}</span>
            {prop.required && (
              <span className="rounded-full bg-state-info-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-state-info-text">
                req
              </span>
            )}
            {!liveEditable && (
              <Lock className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />
            )}
          </div>
          <p className="text-xs text-text-tertiary">{prop.description}</p>
          {hint && <p className="mt-0.5 text-[10px] italic text-text-tertiary">{hint}</p>}
        </div>
        {kind === 'boolean' && (
          <button
            type="button"
            role="switch"
            aria-checked={!!value}
            disabled={disabled}
            onClick={() => onToggle(prop.name)}
            className={[
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
              value ? 'bg-action-primary' : 'bg-surface-muted border border-border-subtle',
              disabled ? 'cursor-not-allowed' : '',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform',
                value ? 'translate-x-4' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        )}
      </div>

      {(kind === 'enum' || kind === 'tristate' || kind === 'preset') && (
        <select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(prop.name, e.target.value)}
          className="rounded-md border border-border-subtle bg-surface-canvas px-2 py-1 text-xs text-text-primary disabled:cursor-not-allowed"
          data-testid={`playground-prop-input-${prop.name}`}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {kind === 'string' && (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(prop.name, e.target.value)}
          placeholder={prop.required ? 'required' : 'optional'}
          className="rounded-md border border-border-subtle bg-surface-canvas px-2 py-1 text-xs text-text-primary disabled:cursor-not-allowed"
          data-testid={`playground-prop-input-${prop.name}`}
        />
      )}

      {kind === 'number' && (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            if (next === '') {
              onChange(prop.name, undefined);
              return;
            }
            const n = Number(next);
            if (Number.isFinite(n)) onChange(prop.name, n);
          }}
          className="w-32 rounded-md border border-border-subtle bg-surface-canvas px-2 py-1 text-xs text-text-primary disabled:cursor-not-allowed"
          data-testid={`playground-prop-input-${prop.name}`}
        />
      )}

      {kind === 'complex' && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-muted px-2 py-1 font-mono text-[10px] leading-relaxed text-text-tertiary">
          <code>{prop.type}</code>
        </pre>
      )}
    </label>
  );
}

/* ================================================================== */
/*  ApiTab                                                             */
/* ================================================================== */

function ApiTab({ chart }: { chart: ChartMeta }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-default">
        <div className="flex items-center gap-3 border-b border-border-subtle bg-linear-to-r from-state-info-bg to-transparent px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-state-info-bg">
            <FileCode2 className="h-4 w-4 text-state-info-text" />
          </div>
          <span className="text-sm font-semibold text-text-primary">Props API</span>
          <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary">
            {chart.props.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Prop
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Type
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Default
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {chart.props.map((p) => (
                <tr key={p.name} className="transition hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-action-primary">
                      {p.name}
                    </span>
                    {p.required && (
                      <span className="ml-1.5 text-[9px] font-semibold text-state-danger-text">
                        *
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-tertiary">{p.type}</td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary">
                    {p.default === 'undefined' ? (
                      <span className="text-text-tertiary">--</span>
                    ) : (
                      <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px]">
                        {p.default}
                      </code>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ExamplesTab — live preset gallery (PR2 Codex thread `019def27`)    */
/*                                                                     */
/*  The previous implementation rendered hand-written code snippets    */
/*  with no live preview. Two problems:                                */
/*                                                                     */
/*    1. The snippets drifted from the wrappers (the old `Dark Theme`  */
/*       example used a `<ThemeProvider theme=...>` API that does not  */
/*       exist).                                                       */
/*    2. Rakipler (MUI X / Recharts / Ant Design) named-scenario       */
/*       galleries with live preview gösteriyor; bizdeki static-code   */
/*       only sayfa "bu chart ile neler yapabilirim?" sorusuna hızlı   */
/*       cevap vermiyor.                                               */
/*                                                                     */
/*  New model: every preset is `{ statePatch }` on top of the catalog  */
/*  defaults. The same `ChartPreviewLive` + `generatePlaygroundCode`   */
/*  machinery that drives the Playground also drives the gallery, so   */
/*  presets cannot drift from runtime behaviour.                       */
/* ================================================================== */

function ExamplesTab({ chart }: { chart: ChartMeta }) {
  const presets = useMemo(() => getChartPresets(chart.id), [chart.id]);

  // Pre-compute descriptors + defaults once per chart for codegen reuse.
  const descriptors = useMemo<EditorDescriptor[]>(
    () => buildDescriptors(chart.id, chart.props),
    [chart.id, chart.props],
  );
  const defaults = useMemo<PlaygroundState>(() => deriveDefaults(descriptors), [descriptors]);

  if (presets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-surface-canvas px-5 py-8 text-center text-xs text-text-tertiary">
        Live preset gallery is not wired for this chart yet — see Playground for an interactive
        surface and API for the props reference.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {presets.map((preset) => (
        <PresetCard
          key={preset.id}
          chart={chart}
          preset={preset}
          descriptors={descriptors}
          defaults={defaults}
        />
      ))}
    </div>
  );
}

/* ================================================================== */
/*  PresetCard — one live example tile in the Examples gallery        */
/* ================================================================== */

function PresetCard({
  chart,
  preset,
  descriptors,
  defaults,
}: {
  chart: ChartMeta;
  preset: ChartPlaygroundPreset;
  descriptors: readonly EditorDescriptor[];
  defaults: PlaygroundState;
}) {
  // Final state for THIS preset = catalog defaults + statePatch.
  const presetState = useMemo<PlaygroundState>(
    () => applyPreset(defaults, preset),
    [defaults, preset],
  );

  // Generated code derives from the patched state via the same
  // serializer the Playground uses; the snippet stays in lock-step
  // with the live preview shown alongside.
  const generatedCode = useMemo(
    () => generatePlaygroundCode(chart.name, descriptors, presetState, chart.id),
    [chart.id, chart.name, descriptors, presetState],
  );

  return (
    <article
      className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-default transition-all hover:shadow-sm"
      data-testid={`preset-card-${preset.id}`}
    >
      {/* Title strip */}
      <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <BookOpen className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">{preset.label}</span>
        {preset.tag && (
          <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
            {preset.tag}
          </span>
        )}
      </header>

      {/* Description */}
      <p className="border-b border-border-subtle bg-surface-canvas/50 px-4 py-2 text-xs text-text-secondary">
        {preset.description}
      </p>

      {/* Live preview — same renderer as Playground */}
      <div className="flex min-h-[220px] items-center justify-center bg-surface-canvas p-4">
        <ChartPreviewLive
          chartId={chart.id}
          chartName={chart.name}
          toggles={presetState}
          height={200}
        />
      </div>

      {/* Generated code, compile-ready */}
      <pre className="overflow-x-auto border-t border-border-subtle p-4 text-[11px] leading-relaxed text-text-primary">
        <code>{generatedCode}</code>
      </pre>
    </article>
  );
}

/* ================================================================== */
/*  ThemesTab — REMOVED                                                */
/*                                                                     */
/*  Codex thread `019def27` AGREE: a dedicated themes tab repeated    */
/*  what the inline `theme/decal/density/accent` switchers in the      */
/*  Theme category of PlaygroundTab already cover (and uses real      */
/*  ECharts theme resolution; the static THEME_CONFIG previews were   */
/*  hand-painted bars). The 4-theme yan-yana comparison is queued for */
/*  PR3 polish as a collapsed Theme Matrix section if real demand     */
/*  surfaces.                                                          */
/* ================================================================== */

/* ================================================================== */
/*  QualityTab                                                         */
/* ================================================================== */

const A11Y_CHECKS = [
  {
    id: 'keyboard',
    label: 'Keyboard Navigation',
    description: 'All data points reachable via Tab/Arrow keys',
  },
  {
    id: 'table',
    label: 'Data Table Fallback',
    description: 'Screen readers get a hidden <table> summary of chart data',
  },
  {
    id: 'aria',
    label: 'aria-live Announcements',
    description: 'Value changes announced to assistive technology',
  },
  {
    id: 'motion',
    label: 'Reduced Motion',
    description: 'Respects prefers-reduced-motion media query',
  },
  {
    id: 'contrast',
    label: 'Color Contrast',
    description: 'Minimum 4.5:1 contrast ratio for labels and values',
  },
  {
    id: 'focus',
    label: 'Focus Indicators',
    description: 'Visible focus ring on interactive chart elements',
  },
];

const PERF_GATES = [
  { label: 'Bundle Size', threshold: '< 45 KB gzipped', status: 'pass' as const },
  {
    label: 'Memory Leak Test',
    threshold: 'No detached DOM after unmount',
    status: 'pass' as const,
  },
  {
    label: 'LTTB Downsampling',
    threshold: 'Auto-downsample > 2000 points',
    status: 'pass' as const,
  },
  { label: 'Render @ 10k points', threshold: '< 200ms initial paint', status: 'pass' as const },
  { label: 'Re-render Budget', threshold: '< 16ms (60 fps)', status: 'pass' as const },
];

function QualityTab({ chart }: { chart: ChartMeta }) {
  return (
    <div className="flex flex-col gap-6">
      {/* A11y checklist */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-default">
        <div className="flex items-center gap-3 border-b border-border-subtle bg-linear-to-r from-state-success-bg to-transparent px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-state-success-bg">
            <ShieldCheck className="h-4 w-4 text-state-success-text" />
          </div>
          <span className="text-sm font-semibold text-text-primary">Accessibility Checklist</span>
          <span className="ml-auto rounded-full bg-state-success-bg px-2 py-0.5 text-[10px] font-semibold text-state-success-text">
            {chart.a11y.length}/{A11Y_CHECKS.length} supported
          </span>
        </div>
        <div className="divide-y divide-border-subtle">
          {A11Y_CHECKS.map((check) => {
            const supported =
              chart.a11y.includes(check.id) ||
              chart.a11y.some((a) => a.replace('-', '').includes(check.id.replace('-', '')));
            return (
              <div
                key={check.id}
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted/50"
              >
                <span
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    supported
                      ? 'bg-state-success-bg text-state-success-text'
                      : 'bg-surface-muted text-text-tertiary',
                  ].join(' ')}
                >
                  {supported ? <Check className="h-3 w-3" /> : '--'}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-text-primary">{check.label}</span>
                  <p className="text-xs text-text-tertiary">{check.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Performance gates */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-default">
        <div className="flex items-center gap-3 border-b border-border-subtle bg-linear-to-r from-state-info-bg to-transparent px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-state-info-bg">
            <Cpu className="h-4 w-4 text-state-info-text" />
          </div>
          <span className="text-sm font-semibold text-text-primary">Performance Gates</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {PERF_GATES.map((gate) => (
            <div
              key={gate.label}
              className="flex items-center justify-between px-5 py-3 transition hover:bg-surface-muted/50"
            >
              <div>
                <span className="text-sm font-medium text-text-primary">{gate.label}</span>
                <p className="text-xs text-text-tertiary">{gate.threshold}</p>
              </div>
              <span className="rounded-full bg-state-success-bg px-2.5 py-0.5 text-[10px] font-semibold uppercase text-state-success-text">
                {gate.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Shared helper components                                           */
/*                                                                     */
/*  `MetadataCard` was removed in the single-page refactor (Codex     */
/*  thread `019def27`); the 4 metric cards collapsed into hero chips.  */
/* ================================================================== */

/* Previously: ChartPreviewPlaceholder — SVG mock with chart.id-specific
 * variants. Replaced by ChartPreviewLive (../widgets/ChartPreviewLive) which
 * renders real @mfe/x-charts components with mock data. The placeholder
 * function is removed because every callsite now uses ChartPreviewLive and
 * the SVG-only preview was misleading users who expected interactive demos. */
