/**
 * chartPlaygroundModel — pure helpers for the design-lab chart playground UI.
 *
 * Built per Codex MCP review of `feat/chart-playground-full-editor` (thread
 * `019def27`). The playground used to render only `boolean` props as toggles
 * (4/21 props for BarChart). This module derives a typed `EditorDescriptor`
 * for every prop in `CHART_CATALOG` so the playground can render the right
 * editor (boolean / enum / string / number / read-only complex), keep the
 * generated code in sync with the chart's API defaults, and forward typed
 * values to `ChartPreviewLive`.
 *
 * Design notes:
 *   - `default` field on `ChartProp` is auto-synced from wrapper JSDoc by
 *     `scripts/ci/sync-chart-detail-props.mjs` (Faz 21.8 PR-X6). Do NOT add
 *     a sibling `defaultValue` field — the sync script would clobber it.
 *     Instead, parse `default` here, and use a sidecar override map for
 *     special demo presets (e.g. `gauge-chart.value = 72`).
 *   - "Live editable" is narrower than "shown in editor". Some props are
 *     declared in the API but `ChartPreviewLive` doesn't currently forward
 *     them to the underlying chart component. We expose those as read-only
 *     in the editor with a "code/API only" hint so the user is not given a
 *     no-op control.
 *   - Codegen prints a prop only if its current value DIFFERS from the
 *     typed default (so `<BarChart animate />` is correct when the user
 *     turns animation off, the code becomes `animate={false}`).
 */
import type { CSSProperties } from 'react';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface ChartProp {
  name: string;
  type: string;
  required: boolean;
  default: string;
  description: string;
}

export type EditorKind =
  | 'boolean'
  | 'enum'
  | 'tristate'
  | 'string'
  | 'number'
  | 'preset'
  | 'complex';

export type EditorCategory = 'data' | 'display' | 'theme' | 'access' | 'advanced';

export interface EditorEnumOption {
  value: string;
  label: string;
  /**
   * Optional swatch color (CSS) for theme/accent enums; the editor renders a
   * tiny dot before the option label.
   */
  swatch?: string;
}

export interface EditorDescriptor {
  prop: ChartProp;
  kind: EditorKind;
  category: EditorCategory;
  /** Editable both in the UI AND forwarded to the live preview. */
  liveEditable: boolean;
  /** Default value parsed from the prop catalog (or sidecar override). */
  defaultValue: PlaygroundValue;
  /**
   * Enum options when `kind === 'enum'`. Empty for non-enum kinds. The
   * "auto" sentinel for theme-axis enums is included as the first option.
   */
  options: EditorEnumOption[];
  /**
   * Hint string surfaced to the user when the editor is read-only.
   * `null` when the editor is active.
   */
  readOnlyHint: string | null;
}

export type PlaygroundValue = boolean | string | number | undefined;

export type PlaygroundState = Record<string, PlaygroundValue>;

/* ================================================================== */
/*  Known enum option tables                                           */
/* ================================================================== */

/**
 * Theme-axis prop options. Each table lists the legal values plus a short
 * label. The first entry is the framework `auto` sentinel — explicit other
 * values override the documentElement signals.
 */
const KNOWN_ENUM_OPTIONS: Record<string, EditorEnumOption[]> = {
  // ChartSize is `'sm' | 'md' | 'lg'` in `packages/x-charts/src/types.ts`.
  // Earlier iter-1 mistakenly added 'xl' (Codex review 019def27 RED) which
  // would forward an invalid prop and break the height-map lookup in the
  // chart wrappers — keep this in sync with the x-charts type.
  ChartSize: [
    { value: 'sm', label: 'sm' },
    { value: 'md', label: 'md' },
    { value: 'lg', label: 'lg' },
  ],
  ChartThemePreference: [
    { value: 'auto', label: 'auto (shell axis)' },
    { value: 'light', label: 'light', swatch: '#ffffff' },
    { value: 'default', label: 'default', swatch: '#f8fafc' },
    { value: 'dark', label: 'dark', swatch: '#0f172a' },
    { value: 'high-contrast', label: 'high-contrast', swatch: '#000000' },
    { value: 'print', label: 'print', swatch: '#ffffff' },
  ],
  // `ChartDecalPreference` is `boolean | 'auto'` in
  // `packages/x-charts/src/theme/useChartTheme.ts`. The resolver applies
  // `Boolean(preference)` so the tristate has to encode boolean intent.
  // Editor stores the literal value string; `getDecal()` decodes it back to
  // `boolean | 'auto'` before forwarding to the chart wrapper. Codegen
  // emits `decal` (bare) for `true`, `decal={false}` for `false`, and
  // omits the prop entirely for `auto`.
  ChartDecalPreference: [
    { value: 'auto', label: 'auto (a11y aware)' },
    { value: 'true', label: 'on' },
    { value: 'false', label: 'off' },
  ],
  ChartDensityPreference: [
    { value: 'auto', label: 'auto (shell density)' },
    { value: 'compact', label: 'compact' },
    { value: 'comfortable', label: 'comfortable' },
  ],
  ChartAccentPreference: [
    { value: 'auto', label: 'auto (shell accent)' },
    { value: 'light', label: 'light', swatch: '#e2e8f0' },
    { value: 'emerald', label: 'emerald', swatch: '#10b981' },
    { value: 'ocean', label: 'ocean', swatch: '#0ea5e9' },
    { value: 'violet', label: 'violet', swatch: '#8b5cf6' },
    { value: 'sunset', label: 'sunset', swatch: '#f97316' },
    { value: 'graphite', label: 'graphite', swatch: '#475569' },
    { value: 'dark', label: 'dark', swatch: '#0f172a' },
  ],
  ChartAccessLevel: [
    { value: 'full', label: 'full (interactive)' },
    { value: 'readonly', label: 'readonly' },
    { value: 'disabled', label: 'disabled' },
    { value: 'hidden', label: 'hidden' },
  ],
  // Faz 21.10 PR-FE-Playground-2: SunburstHighlightPolicy is a clean
  // string-literal union from SunburstChart source. SankeyFocusMode
  // (`boolean | 'allEdges' | 'outEdges' | 'inEdges'`) is intentionally
  // NOT exposed here — Codex review 019e0ddf finding #3: wrapper maps all
  // truthy strings to the same `adjacency` runtime path, and the only
  // semantically distinct mode (`false` = disabled) requires tristate
  // handling we are deferring to PR-FE-Playground-3.
  SunburstHighlightPolicy: [
    { value: 'descendant', label: 'descendant (default)' },
    { value: 'ancestor', label: 'ancestor' },
    { value: 'self', label: 'self' },
    { value: 'none', label: 'none' },
  ],
};

const ACCESS_LEVEL_INLINE = '"full" | "readonly" | "disabled" | "hidden"';

/* ================================================================== */
/*  Type detection                                                     */
/* ================================================================== */

const STRING_LITERAL_UNION_RE = /^['"][^'"]+['"](?:\s*\|\s*['"][^'"]+['"])+$/;

/**
 * Parse a string-literal union like `'a' | 'b'` (with single or double
 * quotes, any number of arms) into an option array. Returns `null` if the
 * input is not a pure string-literal union.
 */
export function parseStringLiteralUnion(typeStr: string): string[] | null {
  const trimmed = typeStr.trim();
  if (!STRING_LITERAL_UNION_RE.test(trimmed)) return null;
  const parts = trimmed.split('|').map((part) => {
    const m = part.trim().match(/^['"]([^'"]+)['"]$/);
    return m ? m[1] : null;
  });
  return parts.every((v): v is string => typeof v === 'string') ? parts : null;
}

/**
 * Resolve a type string to a list of enum options. Handles:
 *   - inline string-literal unions (`'vertical' | 'horizontal'`)
 *   - known type aliases (`ChartSize`, `ChartThemePreference`, ...)
 *   - the access-level literal union written in three different styles
 *
 * Returns `null` when the type does not look like a closed enum.
 */
export function getEnumOptions(typeStr: string): EditorEnumOption[] | null {
  const direct = KNOWN_ENUM_OPTIONS[typeStr.trim()];
  if (direct) return direct;
  // Access level prop is declared with an inline literal union in the catalog.
  if (typeStr.includes(ACCESS_LEVEL_INLINE) || typeStr.trim() === ACCESS_LEVEL_INLINE) {
    return KNOWN_ENUM_OPTIONS.ChartAccessLevel;
  }
  const literals = parseStringLiteralUnion(typeStr);
  if (!literals || literals.length < 2) return null;
  return literals.map((value) => ({ value, label: value }));
}

/**
 * Tristate kinds (boolean | "auto") need a separate editor / accessor /
 * codegen path. Currently only `ChartDecalPreference` falls into this
 * category. Add new tristate types here when wrappers introduce them.
 */
const TRISTATE_TYPES = new Set(['ChartDecalPreference']);

/**
 * Categorise a prop type into one of the editor kinds. Functions, arrays of
 * non-primitives, and any unknown structured types are tagged `complex` and
 * shown read-only in the playground. `boolean | 'auto'` unions are tagged
 * `tristate` (Codex review 019def27 finding).
 */
export function getEditorKind(prop: ChartProp): EditorKind {
  const t = prop.type.trim();
  if (t === 'boolean') return 'boolean';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (TRISTATE_TYPES.has(t)) return 'tristate';
  if (getEnumOptions(t)) return 'enum';
  return 'complex';
}

/* ================================================================== */
/*  Default value parsing                                              */
/* ================================================================== */

/**
 * Strip trailing notes after an em-dash / en-dash (the catalog often suffixes
 * the auto sentinel with explanation: `'"auto" — follows documentElement…'`).
 */
function stripTrailingNote(raw: string): string {
  const dashIdx = raw.search(/[—–-]\s/);
  if (dashIdx < 0) return raw;
  return raw.slice(0, dashIdx).trim();
}

/**
 * Parse the catalog `default` field into a typed value.
 * Returns `undefined` for missing / opaque defaults; never throws.
 */
export function parseDefault(prop: ChartProp, kind: EditorKind): PlaygroundValue {
  if (kind === 'complex') return undefined;
  const raw = (prop.default ?? '').trim();
  if (!raw || raw === '—' || raw.toLowerCase() === 'undefined') return undefined;
  const cleaned = stripTrailingNote(raw);

  if (kind === 'boolean') {
    return cleaned === 'true';
  }
  if (kind === 'number') {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  // string + enum: extract first quoted token if present, else first word.
  const quoted = cleaned.match(/['"]([^'"]+)['"]/);
  if (quoted) return quoted[1];
  return cleaned.split(/\s+/)[0] || undefined;
}

/* ================================================================== */
/*  Categorization                                                     */
/* ================================================================== */

const DATA_PROPS = new Set([
  'data',
  'series',
  'indicators',
  'nodes',
  'links',
  'labels',
  'value',
  'min',
  'max',
  'thresholds',
  'xLabels',
  'yLabels',
  'children',
  'chart',
  'pointer',
  'innerLabel',
]);
const DISPLAY_PROPS = new Set([
  'orientation',
  'size',
  'showValues',
  'showGrid',
  'showLegend',
  'showLabels',
  'showDots',
  'showArea',
  'showPercentage',
  'showConversion',
  'showTitle',
  'donut',
  'gradient',
  'curved',
  'animate',
  'stacked',
  'xLabel',
  'yLabel',
]);
const THEME_PROPS = new Set(['theme', 'decal', 'density', 'accent', 'colors']);
const ACCESS_PROPS = new Set(['access', 'accessReason']);

export function getCategory(prop: ChartProp): EditorCategory {
  if (DATA_PROPS.has(prop.name)) return 'data';
  if (DISPLAY_PROPS.has(prop.name)) return 'display';
  if (THEME_PROPS.has(prop.name)) return 'theme';
  if (ACCESS_PROPS.has(prop.name)) return 'access';
  return 'advanced';
}

export const CATEGORY_ORDER: EditorCategory[] = ['display', 'theme', 'access', 'data', 'advanced'];

export const CATEGORY_LABEL: Record<EditorCategory, string> = {
  display: 'Display',
  theme: 'Theme',
  access: 'Access',
  data: 'Data',
  advanced: 'Advanced',
};

export const CATEGORY_DEFAULT_OPEN: Record<EditorCategory, boolean> = {
  display: true,
  theme: true,
  access: false,
  data: false,
  advanced: false,
};

/* ================================================================== */
/*  Live-editable matrix                                               */
/* ================================================================== */

/**
 * Per-chart map of which prop names are forwarded to the underlying chart
 * component by `ChartPreviewLive`. Props NOT in this set are still rendered
 * in the editor but as read-only with a "live preview ignores this" hint —
 * so users aren't given a no-op control. Keep this in sync with
 * `ChartPreviewLive.tsx`.
 */
// Faz 21.10 PR-FE-Playground-2: primitive expansion — every chart now
// exposes the full common axis (title/description/className + theme/decal/
// density/accent/access/accessReason) plus chart-specific primitives that
// `ChartPreviewLive` forwards. Complex props (data, series, callbacks,
// colors, thresholds) remain read-only here and are addressed in a
// follow-up PR via the preset infrastructure. Coverage uplift: system-wide
// ~%48 → ~%80, every chart picks up an additional 3-11 primitive props.
export const LIVE_PROP_SUPPORT: Record<string, ReadonlySet<string>> = {
  'bar-chart': new Set([
    'showValues',
    'showGrid',
    'showLegend',
    'animate',
    'orientation',
    'size',
    'title',
    'description',
    'className',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'line-chart': new Set([
    'showDots',
    'showGrid',
    'showLegend',
    'showArea',
    'curved',
    'animate',
    'size',
    'title',
    'description',
    'className',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'area-chart': new Set([
    'stacked',
    'showDots',
    'showGrid',
    'showLegend',
    'gradient',
    'curved',
    'animate',
    'size',
    'title',
    'description',
    'className',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'pie-chart': new Set([
    'donut',
    'showLabels',
    'showLegend',
    'showPercentage',
    'animate',
    'size',
    'title',
    'description',
    'className',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'scatter-chart': new Set([
    'size',
    'title',
    'description',
    'className',
    'xLabel',
    'yLabel',
    'showGrid',
    'showLegend',
    'bubble',
    'noDataText',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
    // PR-A2b-ui note: `showAnomalyPills` is intentionally NOT
    // listed here. It isn't a real `ScatterChart` public prop —
    // counting it under LIVE_PROP_SUPPORT would inflate the
    // playground coverage stats AND drift the count contract this
    // file's unit tests pin (Codex thread `019e0fcb` iter-3 H#1).
    // The demo defaults to ON inside `ScatterAnomalyDemoChart`;
    // a future PR can ship a real playground-only descriptor knob
    // if an explicit on/off control is wanted.
    //
    // PR-A2c-wire: `enableBrush` IS a real public prop on
    // `ScatterChart` (Faz 21.11 toolbox brush opt-in). Listed so
    // the playground can toggle the toolbox/brush UI live and
    // wire the status pill demo. `onBrushSelection` is NOT
    // exposed as a playground knob in this PR — the design-lab
    // demo uses its own internal handler (`ScatterAnomalyDemoChart`
    // owns the status pill state). Wiring it through the
    // `getCallbackPreset` infra would need a
    // `COMPLEX_PROP_PRESETS['scatter-chart.onBrushSelection']`
    // entry + route forwarding; that's a separate PR-A2c-adopt
    // follow-up.
    'enableBrush',
  ]),
  'gauge-chart': new Set([
    'size',
    'title',
    'description',
    'className',
    'value',
    'min',
    'max',
    'startAngle',
    'endAngle',
    'showProgress',
    'splitNumber',
    'showAxisLabel',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'radar-chart': new Set([
    'title',
    'description',
    'className',
    'shape',
    'showArea',
    'showLabels',
    'showLegend',
    'splitNumber',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'treemap-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'showLegend',
    'showBreadcrumb',
    'leafDepth',
    'visibleMin',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'heatmap-chart': new Set([
    'title',
    'description',
    'className',
    'min',
    'max',
    'showValues',
    'showLegend',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'waterfall-chart': new Set([
    'title',
    'description',
    'className',
    'showValues',
    'showConnector',
    'orientation',
    'showLegend',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'funnel-chart': new Set([
    'title',
    'description',
    'className',
    'sort',
    'gap',
    'showLabels',
    'labelPosition',
    'showConversion',
    'orientation',
    'funnelAlign',
    'showLegend',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'sankey-chart': new Set([
    'title',
    'description',
    'className',
    'orient',
    'nodeWidth',
    'nodeGap',
    'draggable',
    'lineStyle',
    'showLegend',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'sunburst-chart': new Set([
    'title',
    'description',
    'className',
    'sort',
    'highlightPolicy',
    'showLegend',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
};

export function isLiveEditable(chartId: string, propName: string): boolean {
  const allowList = LIVE_PROP_SUPPORT[chartId];
  if (allowList?.has(propName)) return true;
  // Faz 21.10 PR-FE-Playground-3: complex props with a registered preset
  // dropdown count as live-editable too (they are forwarded to the preview
  // via the preset resolver helpers below).
  if (COMPLEX_PROP_PRESETS[`${chartId}.${propName}`]) return true;
  return false;
}

/* ================================================================== */
/*  PR-FE-Playground-3: complex prop preset infrastructure             */
/* ================================================================== */

/**
 * A preset entry surfaced as a dropdown option for a complex prop. The
 * editor stores the `presetId` in `PlaygroundState`; resolvers below decode
 * it back into the actual function/array/object that gets forwarded to the
 * underlying chart wrapper.
 */
export interface ComplexPreset {
  presetId: string;
  label: string;
}

/**
 * Per `chartId.propName` preset metadata. When a complex prop has an entry
 * here, `buildDescriptor` upgrades its kind from `complex` (read-only) to
 * `preset` (live editable). Keep in sync with the resolver helpers + with
 * the preview wiring in `ChartPreviewLive.tsx`.
 *
 * Coverage uplift achieved (PR-FE-Playground-3 scope): 34 preset entries
 * across 13 charts (callbacks + valueFormatter + colors + gauge thresholds)
 * lift system-wide coverage from PR-A's %79.5 baseline to **245/266 ≈ %92.1**
 * after PR-A2c-wire added `enableBrush` (live primitive) + the
 * `onBrushSelection` callback to the catalog.
 * Sample data presets (data/series/indicators/nodes/links/labels) are
 * intentionally deferred to PR-FE-Playground-4 — they would push coverage
 * to ~%98 but require chart-specific resolver wiring that is out of scope
 * for this PR.
 */
export const COMPLEX_PROP_PRESETS: Record<string, ComplexPreset[]> = {
  // valueFormatter — uniform across all 13 charts (the resolver below is
  // chart-agnostic, so the preset list is shared via a helper constant).
  ...Object.fromEntries(
    [
      'bar-chart',
      'line-chart',
      'area-chart',
      'pie-chart',
      'scatter-chart',
      'gauge-chart',
      'radar-chart',
      'treemap-chart',
      'heatmap-chart',
      'waterfall-chart',
      'funnel-chart',
      'sankey-chart',
      'sunburst-chart',
    ].map((cid) => [
      `${cid}.valueFormatter`,
      [
        { presetId: 'raw', label: 'raw (default)' },
        { presetId: 'integer', label: 'integer' },
        { presetId: 'decimal', label: 'decimal (2)' },
        { presetId: 'percentage', label: 'percentage' },
        { presetId: 'currency-tl', label: 'TL currency (₺)' },
        { presetId: 'compact', label: 'compact (1.2K)' },
      ] as ComplexPreset[],
    ]),
  ),
  // Click callbacks — uniform across charts that expose them.
  ...Object.fromEntries(
    [
      'bar-chart',
      'line-chart',
      'area-chart',
      'pie-chart',
      'scatter-chart',
      'gauge-chart',
      'radar-chart',
      'treemap-chart',
      'heatmap-chart',
      'waterfall-chart',
      'funnel-chart',
      'sankey-chart',
      'sunburst-chart',
    ].map((cid) => [
      `${cid}.onDataPointClick`,
      [
        { presetId: 'noop', label: 'no-op (default)' },
        { presetId: 'console-log', label: 'console.log' },
        { presetId: 'alert', label: 'browser alert' },
      ] as ComplexPreset[],
    ]),
  ),
  // Chart-specific node click callbacks (treemap, sankey, sunburst).
  'treemap-chart.onNodeClick': [
    { presetId: 'noop', label: 'no-op (default)' },
    { presetId: 'console-log', label: 'console.log' },
  ],
  'sankey-chart.onNodeClick': [
    { presetId: 'noop', label: 'no-op (default)' },
    { presetId: 'console-log', label: 'console.log' },
  ],
  'sunburst-chart.onNodeClick': [
    { presetId: 'noop', label: 'no-op (default)' },
    { presetId: 'console-log', label: 'console.log' },
  ],
  'heatmap-chart.onCellClick': [
    { presetId: 'noop', label: 'no-op (default)' },
    { presetId: 'console-log', label: 'console.log' },
  ],
  // PR-FE-Playground-3 (this PR) ships preset infra for: valueFormatter,
  // callbacks (onDataPointClick / onNodeClick / onCellClick), colors, and
  // gauge thresholds. Sample data presets (data, series, indicators, nodes,
  // links, labels, xLabels, yLabels) are DELIBERATELY scoped to a future
  // PR-FE-Playground-4 — they require chart-specific sample data resolver
  // wiring in ChartPreviewLive that bloats this PR. Keeping that scope
  // separate keeps the diff reviewable and the preset infra well-tested
  // before layering data variation on top.
  'gauge-chart.thresholds': [
    { presetId: 'traffic-light', label: 'Traffic light (default)' },
    { presetId: 'two-tier', label: 'Two-tier (red/green)' },
    { presetId: 'monochrome', label: 'Monochrome' },
  ],
  // Color array / object presets.
  'bar-chart.colors': [
    { presetId: 'default', label: 'Auto palette (default)' },
    { presetId: 'rainbow', label: 'Rainbow' },
    { presetId: 'monochrome', label: 'Monochrome slate' },
  ],
  'scatter-chart.colors': [
    { presetId: 'default', label: 'Auto (default)' },
    { presetId: 'rainbow', label: 'Rainbow' },
  ],
  'heatmap-chart.colors': [
    { presetId: 'default', label: 'Wrapper default (auto)' },
    { presetId: 'cool-warm', label: 'Cool→Warm' },
    { presetId: 'green-red', label: 'Green→Red' },
  ],
  // waterfall-chart.colors is `{ increase?, decrease?, total? }` object —
  // requires its own object resolver, deferred to PR-FE-Playground-4.
};

/**
 * Resolve a `valueFormatter` preset id into an actual `(v: number) => string`
 * function. Returns `undefined` for unknown / `'raw'` / fall-through values
 * so the wrapper falls back to its own default formatter.
 */
export function getValueFormatterPreset(
  presetId: string | undefined,
): ((value: number) => string) | undefined {
  switch (presetId) {
    case 'integer':
      return (v) => Math.round(v).toString();
    case 'decimal':
      return (v) => v.toFixed(2);
    case 'percentage':
      return (v) => `${(v * 100).toFixed(1)}%`;
    case 'currency-tl':
      return (v) => `₺${v.toLocaleString('tr-TR')}`;
    case 'compact':
      return (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v));
    case 'raw':
    case undefined:
    default:
      return undefined;
  }
}

/**
 * Resolve a click-callback preset id into a side-effect handler. Generic
 * over the event payload — every chart wrapper provides its own typed
 * `ChartClickEvent` / equivalent shape; we only need to log/alert it.
 */
export function getCallbackPreset<E>(
  presetId: string | undefined,
): ((event: E) => void) | undefined {
  switch (presetId) {
    case 'console-log':
      return (event) => {
        console.log('[design-lab playground] chart click', event);
      };
    case 'alert':
      return (event) => {
        try {
          alert(JSON.stringify(event, null, 2));
        } catch {
          alert(String(event));
        }
      };
    case 'noop':
    case undefined:
    default:
      return undefined;
  }
}

/**
 * Resolve a colors-preset id into a string[] palette. Chart wrappers
 * accept various color shapes (`string[]`, `[string, string]`, object);
 * the caller adapts the returned array as needed.
 */
export function getColorsPreset(presetId: string | undefined): string[] | undefined {
  switch (presetId) {
    case 'rainbow':
      return ['#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#7c3aed', '#ec4899'];
    case 'monochrome':
      return ['#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b'];
    case 'monochrome-blue':
    case 'monochrome blue':
      return ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'];
    case 'cool-warm':
      return ['#3b82f6', '#ef4444'];
    case 'green-red':
      return ['#22c55e', '#ef4444'];
    case 'monochrome-grey':
    case 'monochrome grey':
      return ['#9ca3af', '#374151', '#6b7280'];
    case 'default':
    case undefined:
    default:
      return undefined;
  }
}

/**
 * Resolve a `thresholds` preset id (Gauge) into a `[{value,color}]` array.
 */
export function getThresholdsPreset(
  presetId: string | undefined,
): { value: number; color: string }[] | undefined {
  switch (presetId) {
    case 'two-tier':
      return [
        { value: 50, color: '#ef4444' },
        { value: 100, color: '#22c55e' },
      ];
    case 'monochrome':
      return [
        { value: 33, color: '#94a3b8' },
        { value: 66, color: '#475569' },
        { value: 100, color: '#1e293b' },
      ];
    case 'traffic-light':
    case undefined:
    default:
      return [
        { value: 30, color: '#ef4444' },
        { value: 70, color: '#f59e0b' },
        { value: 100, color: '#22c55e' },
      ];
  }
}

/* ================================================================== */
/*  Sidecar default overrides                                          */
/* ================================================================== */

/**
 * Demo-preset overrides for required props that don't have a useful API
 * default (e.g. `GaugeChart.value` is required; the catalog default is `—`).
 * Keys are `"{chartId}.{propName}"`.
 */
export const PLAYGROUND_DEFAULT_OVERRIDES: Record<string, PlaygroundValue> = {
  'gauge-chart.value': 72,
  'gauge-chart.min': 0,
  'gauge-chart.max': 100,
  'scatter-chart.xLabel': 'X',
  'scatter-chart.yLabel': 'Y',
};

/* ================================================================== */
/*  Descriptor builder                                                 */
/* ================================================================== */

export function buildDescriptor(chartId: string, prop: ChartProp): EditorDescriptor {
  let kind = getEditorKind(prop);
  const category = getCategory(prop);
  const overrideKey = `${chartId}.${prop.name}`;
  const overrideDefault = PLAYGROUND_DEFAULT_OVERRIDES[overrideKey];

  // Faz 21.10 PR-FE-Playground-3: complex props with a registered preset
  // dropdown become live-editable via the preset selector. The first preset
  // serves as the playground default value.
  const presets = COMPLEX_PROP_PRESETS[overrideKey];
  if (kind === 'complex' && presets && presets.length > 0) {
    kind = 'preset';
  }

  const live =
    (kind !== 'complex' && isLiveEditable(chartId, prop.name)) ||
    (kind === 'preset' && presets !== undefined);

  let defaultValue: PlaygroundValue;
  if (kind === 'preset' && presets) {
    defaultValue = overrideDefault !== undefined ? overrideDefault : presets[0].presetId;
  } else {
    defaultValue = overrideDefault !== undefined ? overrideDefault : parseDefault(prop, kind);
  }

  let options: EditorEnumOption[] = [];
  if (kind === 'enum' || kind === 'tristate') {
    options = getEnumOptions(prop.type) ?? [];
  } else if (kind === 'preset' && presets) {
    options = presets.map((p) => ({ value: p.presetId, label: p.label }));
  }

  let readOnlyHint: string | null = null;
  if (kind === 'complex') {
    readOnlyHint = prop.required
      ? 'Sample data provided in preview'
      : 'Code/API only — not a playground control';
  } else if (!live) {
    readOnlyHint = 'Live preview does not forward this prop yet';
  }

  return {
    prop,
    kind,
    category,
    liveEditable: live,
    defaultValue,
    options,
    readOnlyHint,
  };
}

export function buildDescriptors(chartId: string, props: readonly ChartProp[]): EditorDescriptor[] {
  return props.map((p) => buildDescriptor(chartId, p));
}

export function deriveDefaults(descriptors: readonly EditorDescriptor[]): PlaygroundState {
  const out: PlaygroundState = {};
  for (const d of descriptors) {
    if (d.defaultValue !== undefined) {
      out[d.prop.name] = d.defaultValue;
    }
  }
  return out;
}

/* ================================================================== */
/*  Code generation                                                    */
/* ================================================================== */

/**
 * Generate a JSX prop fragment for a single prop given its current value
 * and its descriptor. Returns `null` when the prop should be omitted
 * (value matches the typed default, or is undefined, or the prop is
 * complex / read-only).
 *
 * Rules:
 *   - Complex / read-only props: never serialised (preview supplies them).
 *   - Boolean: bare `propName` when `value === true && default !== true`;
 *     `propName={false}` when `value === false && default === true`;
 *     omit otherwise.
 *   - Number: `propName={N}` when value !== default; omit otherwise.
 *   - String / enum: `propName="value"` when value !== default; omit otherwise.
 */
export function serialisePropToCode(d: EditorDescriptor, value: PlaygroundValue): string | null {
  if (d.kind === 'complex') return null;
  // Faz 21.10 PR-FE-Playground-3: preset prop'lar live preview'a forward
  // edilir ama generated code'da emit edilmez — preset'i resolve eden
  // helper kullanıcının kendi koduna girmesi gerek (kişisel formatter,
  // sample data, callback, vb.). Inline emit serileştirme mantığı için
  // gereksiz karmaşa olur; bunun yerine kullanıcı playground sample'ını
  // örnek alıp kendi resolver'ını yazar.
  if (d.kind === 'preset') return null;
  if (value === undefined) return null;
  const def = d.defaultValue;

  if (d.kind === 'boolean') {
    if (typeof value !== 'boolean') return null;
    if (value === def) return null;
    if (value === true) return d.prop.name;
    return `${d.prop.name}={false}`;
  }
  if (d.kind === 'number') {
    if (typeof value !== 'number') return null;
    if (value === def) return null;
    return `${d.prop.name}={${value}}`;
  }
  if (d.kind === 'tristate') {
    // State stores the literal value string ('auto' | 'true' | 'false') so
    // the <select> can round-trip. Codegen emits the API-correct shape for
    // the underlying `boolean | 'auto'` prop:
    //   'auto'  → omit (resolves to documentElement signal)
    //   'true'  → bare prop  (e.g. `decal`)
    //   'false' → explicit   (e.g. `decal={false}`)
    if (typeof value !== 'string') return null;
    if (value === def) return null;
    if (value === 'auto') return null;
    if (value === 'true') return d.prop.name;
    if (value === 'false') return `${d.prop.name}={false}`;
    return null;
  }
  // string / enum
  if (typeof value !== 'string') return null;
  if (value === def) return null;
  if (value === '') return null;
  // Escape embedded double quotes defensively (string props, e.g. title).
  const escaped = value.replace(/"/g, '\\"');
  return `${d.prop.name}="${escaped}"`;
}

export function generatePlaygroundCode(
  chartName: string,
  descriptors: readonly EditorDescriptor[],
  state: PlaygroundState,
  chartId?: string,
): string {
  const sample = chartId ? getSampleData(chartId) : null;
  // Build a preamble of `const X = ...;` definitions for every required
  // sample-data piece. The snippet then references those locals from the
  // chart prop list, so a copy/paste actually compiles.
  const preambleLines: string[] = [];
  const dataPropLines: string[] = [];
  if (sample) {
    for (const entry of sample.scaffold) {
      preambleLines.push(`const ${entry.varName} = ${entry.jsLiteral};`);
      dataPropLines.push(`  ${entry.propName}={${entry.varName}}`);
    }
    if (sample.auxiliaryProps) {
      for (const aux of sample.auxiliaryProps) {
        preambleLines.push(`const ${aux.varName} = ${aux.jsLiteral};`);
        dataPropLines.push(`  ${aux.propName}={${aux.varName}}`);
      }
    }
  } else {
    // Legacy fallback for charts without an explicit scaffold.
    dataPropLines.push(`  data={sampleData}`);
  }

  // Skip prop names that the scaffold already provides — otherwise we
  // would emit a duplicate `data={...} data={...}` line if the user later
  // makes the data prop editable.
  const skipNames = new Set<string>();
  if (sample) {
    for (const entry of sample.scaffold) skipNames.add(entry.propName);
    for (const aux of sample.auxiliaryProps ?? []) skipNames.add(aux.propName);
  }

  const propLines: string[] = [];
  for (const d of descriptors) {
    if (skipNames.has(d.prop.name)) continue;
    const fragment = serialisePropToCode(d, state[d.prop.name]);
    if (fragment) propLines.push(`  ${fragment}`);
  }

  const allPropLines = [...dataPropLines, ...propLines];
  const body = allPropLines.length > 0 ? `\n${allPropLines.join('\n')}` : '';
  const preamble = preambleLines.length > 0 ? `${preambleLines.join('\n\n')}\n\n` : '';
  return `${preamble}<${chartName}${body}\n/>`;
}

/* ================================================================== */
/*  Typed accessors for ChartPreviewLive                               */
/* ================================================================== */

/**
 * Read a boolean toggle from the playground state. Accepts the legacy
 * `'true'/'false'` string encoding for backwards-compat with stored state.
 */
export function getBool(
  state: PlaygroundState | undefined,
  key: string,
  fallback: boolean,
): boolean {
  if (!state || !(key in state)) return fallback;
  const v = state[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return fallback;
}

/**
 * Read an enum / string toggle. `fallback` is returned when the key is
 * missing or the stored value is empty.
 */
export function getEnum<T extends string>(
  state: PlaygroundState | undefined,
  key: string,
  fallback: T,
): T {
  if (!state || !(key in state)) return fallback;
  const v = state[key];
  if (typeof v === 'string' && v.length > 0) return v as T;
  if (typeof v === 'number') return String(v) as T;
  return fallback;
}

/** Read a number toggle (`undefined`/non-numeric → fallback). */
export function getNum(state: PlaygroundState | undefined, key: string, fallback: number): number {
  if (!state || !(key in state)) return fallback;
  const v = state[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * Read an OPTIONAL number toggle — returns `undefined` (not a fallback) when
 * the user has not set the toggle. Lets the wrapper apply its own default
 * (e.g. HeatmapChart's `minProp ?? dataMin` auto-scale) instead of forcing
 * an explicit value into the preview that the generated code does not emit.
 * Codex review thread `019e0ddf` REVISE finding #1 (heatmap min/max parity).
 */
export function getOptNum(state: PlaygroundState | undefined, key: string): number | undefined {
  if (!state || !(key in state)) return undefined;
  const v = state[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Read a string toggle. Empty string falls back.
 */
export function getStr(state: PlaygroundState | undefined, key: string, fallback: string): string {
  if (!state || !(key in state)) return fallback;
  const v = state[key];
  if (typeof v === 'string' && v.length > 0) return v;
  return fallback;
}

/**
 * Read a string toggle returning `undefined` for empty/missing values.
 * Useful when the underlying chart prop is optional and prefers absence
 * over an empty string (e.g. `description`, `className`, `accessReason`).
 */
export function getOptStr(state: PlaygroundState | undefined, key: string): string | undefined {
  if (!state || !(key in state)) return undefined;
  const v = state[key];
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

/**
 * Read a tristate (`boolean | 'auto'`) toggle for `decal` / future
 * tristate props. The state stores the literal value string emitted by
 * `<select>` (`'auto' | 'true' | 'false'`); this accessor decodes it back
 * to the runtime contract `boolean | 'auto'` expected by the chart wrapper.
 */
export function getDecal(
  state: PlaygroundState | undefined,
  key: string,
  fallback: boolean | 'auto' = 'auto',
): boolean | 'auto' {
  if (!state || !(key in state)) return fallback;
  const v = state[key];
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'auto') return 'auto';
  }
  return fallback;
}

/* ================================================================== */
/*  Sample data scaffolds                                              */
/* ================================================================== */

export interface SampleDataScaffoldEntry {
  /** The chart prop name (e.g. `data`, `series`, `nodes`, `value`). */
  propName: string;
  /**
   * JS literal source for this prop's sample value. Embedded into the
   * generated snippet's preamble (`const ${varName} = ${jsLiteral};`) and
   * surfaced read-only in the playground "Sample Data" panel.
   */
  jsLiteral: string;
  /** Local variable name used in the snippet (e.g. `sampleData`). */
  varName: string;
  /** Short caption shown above the literal in the panel. */
  caption: string;
}

export interface SampleDataDef {
  scaffold: SampleDataScaffoldEntry[];
  /** Optional auxiliary props passed alongside the scaffold (e.g. `labels`). */
  auxiliaryProps?: { propName: string; varName: string; jsLiteral: string }[];
}

/**
 * Sample data definitions per chart id. Mirrors the mock data wired into
 * `ChartPreviewLive` so the user-facing snippet can compile end-to-end.
 *
 * Codex thread `019def27` follow-up: the previous snippet always wrote
 * `data={sampleData}` regardless of the chart's actual required prop
 * (Gauge takes `value`, Sankey takes `nodes + links`, etc.). Centralising
 * the scaffold here lets the codegen produce correct "compile-ready"
 * snippets for each chart.
 */
const SAMPLE_DATA: Record<string, SampleDataDef> = {
  'bar-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'BarChart data',
        jsLiteral: `[
  { label: 'Ocak', value: 320 },
  { label: 'Şubat', value: 332 },
  { label: 'Mart', value: 301 },
  { label: 'Nisan', value: 334 },
  { label: 'Mayıs', value: 390 },
  { label: 'Haziran', value: 330 },
]`,
      },
    ],
  },
  'line-chart': {
    scaffold: [
      {
        propName: 'series',
        varName: 'series',
        caption: 'LineChart series',
        jsLiteral: `[
  { name: 'Seri A', data: [320, 332, 301, 334, 390, 330] },
  { name: 'Seri B', data: [220, 182, 191, 234, 290, 330] },
]`,
      },
    ],
    auxiliaryProps: [
      {
        propName: 'labels',
        varName: 'labels',
        jsLiteral: `['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran']`,
      },
    ],
  },
  'area-chart': {
    scaffold: [
      {
        propName: 'series',
        varName: 'series',
        caption: 'AreaChart series',
        jsLiteral: `[
  { name: 'Gelir', data: [320, 332, 301, 334, 390, 330] },
  { name: 'Gider', data: [220, 182, 191, 234, 290, 330] },
]`,
      },
    ],
    auxiliaryProps: [
      {
        propName: 'labels',
        varName: 'labels',
        jsLiteral: `['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran']`,
      },
    ],
  },
  'pie-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'PieChart slices',
        jsLiteral: `[
  { label: 'Ocak', value: 320 },
  { label: 'Şubat', value: 332 },
  { label: 'Mart', value: 301 },
  { label: 'Nisan', value: 334 },
  { label: 'Mayıs', value: 390 },
]`,
      },
    ],
  },
  'scatter-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'ScatterChart points',
        jsLiteral: `[
  { x: 320, y: 220, label: 'Ocak' },
  { x: 332, y: 182, label: 'Şubat' },
  { x: 301, y: 191, label: 'Mart' },
  { x: 334, y: 234, label: 'Nisan' },
  { x: 390, y: 290, label: 'Mayıs' },
  { x: 330, y: 330, label: 'Haziran' },
]`,
      },
    ],
  },
  'gauge-chart': {
    scaffold: [
      {
        propName: 'thresholds',
        varName: 'thresholds',
        caption: 'GaugeChart colour thresholds',
        jsLiteral: `[
  { value: 30, color: '#ef4444' },
  { value: 70, color: '#f59e0b' },
  { value: 100, color: '#22c55e' },
]`,
      },
    ],
  },
};

/**
 * Returns the sample-data scaffold for a chart id, or `null` when the chart
 * hasn't been wired with a scaffold yet (the snippet then falls back to the
 * legacy `data={sampleData}` reference and the panel hides).
 */
export function getSampleData(chartId: string): SampleDataDef | null {
  return SAMPLE_DATA[chartId] ?? null;
}

/* ================================================================== */
/*  Playground presets — competitor-parity live example gallery        */
/* ================================================================== */

/**
 * A named, user-facing playground variation. Codex thread `019def27`
 * follow-up: replaces the previous static-code-only Examples tab with
 * live preview cards (MUI X / Recharts parity). Each preset patches the
 * default playground state — the live preview and generated code derive
 * from the patched state via the same `ChartPreviewLive` /
 * `generatePlaygroundCode` machinery the playground itself uses, so
 * presets cannot drift away from runtime behaviour.
 */
export interface ChartPlaygroundPreset {
  /** Stable id (used as React key + a11y label). */
  id: string;
  /** Card title shown in the gallery. */
  label: string;
  /** Optional category chip (e.g. `starter`, `theme`, `orientation`). */
  tag?: string;
  /** One-line explanation of what the preset demonstrates. */
  description: string;
  /**
   * State patch applied on top of `deriveDefaults(descriptors)`. Empty
   * patch (`{}`) is the canonical "Basic" preset.
   */
  statePatch: PlaygroundState;
}

/**
 * Per-chart preset definitions. Only charts wired in `LIVE_PROP_SUPPORT`
 * appear here — for the remaining 7 canonical charts and the composite
 * widgets the gallery falls back to a single "Basic" preset.
 *
 * Keep entries small and focused — one prop change per preset where
 * possible — so the user can mentally diff the preset against "Basic".
 */
const CHART_PRESETS: Record<string, ChartPlaygroundPreset[]> = {
  'bar-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default configuration — vertical bars with grid + animation.',
      statePatch: {},
    },
    {
      id: 'horizontal',
      label: 'Horizontal',
      tag: 'orientation',
      description: 'Switch to horizontal layout for long category labels.',
      statePatch: { orientation: 'horizontal' },
    },
    {
      id: 'with-values',
      label: 'With Values',
      tag: 'labels',
      description: 'Show numeric value labels above each bar.',
      statePatch: { showValues: true },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Display the legend strip below the chart.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override (overrides shell axis).',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'compact',
      label: 'Compact Density',
      tag: 'density',
      description: 'Compact density override — smaller fonts and spacing.',
      statePatch: { density: 'compact' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click / brush / zoom no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'line-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Multi-series line chart with dots and grid.',
      statePatch: {},
    },
    {
      id: 'curved',
      label: 'Curved',
      tag: 'curve',
      description: 'Smooth bezier interpolation between points.',
      statePatch: { curved: true },
    },
    {
      id: 'area',
      label: 'Area Fill',
      tag: 'area',
      description: 'Filled area beneath the line.',
      statePatch: { showArea: true },
    },
    {
      id: 'no-dots',
      label: 'Without Dots',
      tag: 'dots',
      description: 'Hide point markers — pure line traces.',
      statePatch: { showDots: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
  'area-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Stacked areas with gradient fill and curved interpolation.',
      statePatch: {},
    },
    {
      id: 'unstacked',
      label: 'Unstacked',
      tag: 'layout',
      description: 'Each series on its own baseline (overlapping).',
      statePatch: { stacked: false },
    },
    {
      id: 'no-gradient',
      label: 'Solid Fill',
      tag: 'fill',
      description: 'Solid colour fill instead of gradient.',
      statePatch: { gradient: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
  'pie-chart': [
    {
      id: 'basic',
      label: 'Donut (default)',
      tag: 'starter',
      description: 'Donut chart with percentage labels.',
      statePatch: {},
    },
    {
      id: 'pie',
      label: 'Solid Pie',
      tag: 'shape',
      description: 'Solid disc instead of donut.',
      statePatch: { donut: false },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Show legend below the chart.',
      statePatch: { showLegend: true, donut: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
  'scatter-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default scatter plot with 6 sample points.',
      statePatch: {},
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
  'gauge-chart': [
    {
      id: 'basic',
      label: 'Default (72)',
      tag: 'starter',
      description: 'Default value sitting in the warning threshold.',
      statePatch: {},
    },
    {
      id: 'low',
      label: 'Low (15)',
      tag: 'state',
      description: 'Value below the first threshold — red zone.',
      statePatch: { value: 15 },
    },
    {
      id: 'mid',
      label: 'Mid (50)',
      tag: 'state',
      description: 'Value in the middle threshold — orange zone.',
      statePatch: { value: 50 },
    },
    {
      id: 'high',
      label: 'High (95)',
      tag: 'state',
      description: 'Value above the last threshold — green zone.',
      statePatch: { value: 95 },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
};

/**
 * Look up the preset gallery for a chart id. Returns an empty array when
 * no presets are wired (the consumer should fall back to a single
 * "Basic" placeholder card or the legacy static examples).
 */
export function getChartPresets(chartId: string): ChartPlaygroundPreset[] {
  return CHART_PRESETS[chartId] ?? [];
}

/**
 * Apply a preset's `statePatch` on top of derived defaults. This is the
 * canonical entry point for "what state would the playground be in if I
 * picked this preset?". Returned object is a fresh shallow merge so
 * callers may freely mutate.
 */
export function applyPreset(
  defaults: PlaygroundState,
  preset: ChartPlaygroundPreset,
): PlaygroundState {
  return { ...defaults, ...preset.statePatch };
}

/* ================================================================== */
/*  Feature badges — competitor "New" / "Beta" parity                  */
/* ================================================================== */

export type FeatureBadgeTone = 'new' | 'beta' | 'stable';

export interface FeatureBadgeMeta {
  /** Short label shown in the chip strip. */
  label: FeatureBadgeTone;
  /** Optional tooltip / hover description. */
  tooltip?: string;
}

/**
 * Per-feature badge metadata. Used by the chart-detail feature chip
 * strip to flag capabilities whose API isn't yet stable (e.g. Range
 * bar variant in MUI X uses a similar "New" badge).
 *
 * `cross-filter` was previously `beta` — promoted to `stable` after
 * the cross-filter rollout sweep wired all 13 charts through the
 * `ChartClickEvent` adapter (PR #338) and surfaced the BETA badge on
 * every chart in the catalog (PR #339). The 13/13 testai live smoke
 * + 38 new tests + per-key debounce regression net make the API
 * surface stable enough to drop the BETA chip; consumers that want
 * the API tracking note can read it from the cross-filter wrapper
 * JSDoc.
 *
 * Keeping the table as `Record<>` so future BETA features can join
 * with a one-line entry.
 */
const FEATURE_BADGES: Record<string, FeatureBadgeMeta> = {
  // No BETA features at this time — `cross-filter` promoted to
  // stable after the 13-chart rollout sweep.
};

/** Lookup the badge for a feature flag. Returns `null` when no badge applies. */
export function getFeatureBadge(feature: string): FeatureBadgeMeta | null {
  return FEATURE_BADGES[feature] ?? null;
}

/* ================================================================== */
/*  Performance guidance + FAQ — competitor parity content             */
/* ================================================================== */

export interface PerformanceGuidanceItem {
  /** Short scenario label (e.g. "Large series (>2k points)"). */
  label: string;
  /** One-paragraph guidance. */
  body: string;
  /**
   * Optional reference link (e.g. to an LTTB / progressive-render util).
   * Plain string for now; the renderer wraps it in a chip.
   */
  reference?: string;
}

/**
 * Plain-language performance guidance. MUI X documents recommended data
 * sizes + reduced-motion + SVG-batch trade-offs; we capture the same
 * developer-facing playbook here so the page answers "ne zaman sorun
 * yaşarım?" rather than just listing internal Quality gates.
 *
 * Keep entries terse — link to the actual perf utilities for depth.
 */
const PERFORMANCE_GUIDANCE: PerformanceGuidanceItem[] = [
  {
    label: 'Large series (>2,000 points)',
    body:
      'Enable LTTB downsampling for time series; enable progressive render for ' +
      'point-cloud charts. The default ECharts pipeline is fine up to ~2,000 ' +
      'points; beyond that the initial paint and pan/zoom interaction visibly ' +
      'degrade.',
    reference: 'lttb / progressive-render utilities',
  },
  {
    label: 'Animation cost',
    body:
      'On dashboards with many small charts, set `animate={false}` on subsequent ' +
      'data updates — the user already saw the on-mount animation. The wrapper ' +
      'also respects `prefers-reduced-motion` automatically; no extra wiring ' +
      'needed.',
  },
  {
    label: 'Large dashboards',
    body:
      'Use the `lazy-chart` HOC to defer mounting off-screen charts until the ' +
      'IntersectionObserver fires, and the `lru-cache` utility to memoise ' +
      'chart options when the same series is re-rendered across views.',
    reference: 'lazy-chart / lru-cache utilities',
  },
  {
    label: 'Bundle weight',
    body:
      'The `code-split` utility loads chart wrappers on-demand. Combined with ' +
      'tree-shake-gated exports (every wrapper passes `tree-shaking-verify` in ' +
      'CI), only the chart types you actually import end up in the user bundle.',
  },
  {
    label: 'Accessibility / reduced motion',
    body:
      'Wrappers honour `prefers-reduced-motion` for animations and emit decal ' +
      'patterns automatically in high-contrast / print themes (visual ' +
      'differentiation beyond colour). Set `decal={true}` to force-on for ' +
      'colour-blind users on the default theme.',
  },
];

export function getPerformanceGuidance(): PerformanceGuidanceItem[] {
  return PERFORMANCE_GUIDANCE;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * Frequently-asked questions about chart wrappers in general (not chart-
 * specific). Ant Design's FAQ section is a useful precedent: short, direct
 * answers to the surface-area questions developers hit when ramping up.
 */
const FAQ_GENERAL: FaqEntry[] = [
  {
    question: 'What does `theme="auto"` mean?',
    answer:
      'The wrapper reads documentElement signals (`data-appearance`, ' +
      '`data-theme`, plus `prefers-color-scheme`) and resolves to the matching ' +
      'theme. An explicit `theme="dark" | "light" | "high-contrast" | "print"` ' +
      'overrides the shell-axis signal for that one chart.',
  },
  {
    question: 'When does `decal` turn on?',
    answer:
      '`decal="auto"` (default) enables decal patterns automatically for the ' +
      '`high-contrast` and `print` themes (visual differentiation beyond ' +
      'colour). Force-on with `decal={true}` for colour-blind-friendly default ' +
      'themes; force-off with `decal={false}`.',
  },
  {
    question: 'What’s the difference between `colors` and `accent`?',
    answer:
      '`colors={[...]}` is an explicit per-series palette override — the wrapper ' +
      'uses your array literally, no theme axis. `accent="emerald" | "ocean" | ...` ' +
      'picks one of the design-system’s accent palettes (light / dark mode ' +
      'aware). For one-off branded charts use `colors`; for theme-coherent ' +
      'overrides use `accent`.',
  },
  {
    question: 'What’s the difference between `access="readonly"` and `disabled`?',
    answer:
      '`readonly` is visible and rendered identically, but click / brush / zoom ' +
      'event callbacks no-op (the chart shows data without inviting interaction). ' +
      '`disabled` adds a dim overlay + `inert` attribute; the chart looks dimmed ' +
      'and screen readers skip it. Use `hidden` to remove the chart from the ' +
      'tree entirely.',
  },
  {
    question: 'What should I do for large datasets?',
    answer:
      'See the Performance section above. Short answer: LTTB or progressive ' +
      'render past ~2,000 points; lazy-chart for off-screen dashboards; lru-cache ' +
      'for repeated renders.',
  },
  {
    question: 'How do I edit `valueFormatter`, callbacks, or `colors` in the Playground?',
    answer:
      'These complex props are now driven by *preset dropdowns* (Faz 21.10 ' +
      'PR-FE-Playground-3). Pick a `valueFormatter` preset (raw / integer / ' +
      'decimal / percentage / TL currency / compact), a callback handler ' +
      '(no-op / console.log / browser alert), a `colors` palette, or a Gauge ' +
      '`thresholds` preset; the live preview re-renders immediately. Sample ' +
      'data props (`data` / `series` / `nodes` / `links` / `indicators` / ' +
      '`labels`) remain provided by `ChartPreviewLive` for now — sample-data ' +
      'preset infrastructure ships in a follow-up PR.',
  },
];

export function getFaq(): FaqEntry[] {
  return FAQ_GENERAL;
}

/* ================================================================== */
/*  Theme axis surface alignment                                       */
/* ================================================================== */

/**
 * Compute a CSS surface tint for the preview container so that an explicit
 * `theme` override is reflected in the chart's surrounding background, not
 * just the chart internals. Returns `undefined` for `auto` (let shell axis
 * decide).
 */
export function getPreviewSurfaceStyle(theme: string | undefined): CSSProperties | undefined {
  switch (theme) {
    case 'dark':
      return { background: '#0f172a', color: '#f1f5f9' };
    case 'high-contrast':
      return { background: '#000000', color: '#ffffff' };
    case 'print':
      return { background: '#ffffff', color: '#000000' };
    case 'light':
      return { background: '#ffffff', color: '#0f172a' };
    case 'default':
      return { background: '#f8fafc', color: '#0f172a' };
    default:
      return undefined;
  }
}

/* ================================================================== */
/*  URL persistence (Faz 21.10 PR-FE-Playground-1)                     */
/* ================================================================== */

/**
 * UTF-8 safe Base64 encode. `btoa` only accepts latin1 so non-Latin
 * characters (e.g. a Turkish title `İş gücü`, an emoji 🚀) would throw
 * `InvalidCharacterError` and crash the URL sync effect. Codex review
 * thread `019e0d02` REVISE — encode bytes via `TextEncoder` before btoa.
 */
export function encodeBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  // Avoid `String.fromCharCode(...bytes)` which blows the call stack on
  // long strings; chunked accumulation is safe for any size.
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Reverse of `encodeBase64Utf8` — atob → byte array → UTF-8 decode. */
export function decodeBase64Utf8(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Encode the diff between current playground state and catalog defaults
 * into a URL-safe Base64 string. Returns `null` when the diff is empty
 * (caller can omit the URL parameter entirely so the URL stays clean).
 */
export function encodePlaygroundState(
  state: PlaygroundState,
  defaults: PlaygroundState,
): string | null {
  const diff: Record<string, PlaygroundValue> = {};
  for (const k of Object.keys(state)) {
    if (state[k] !== defaults[k]) diff[k] = state[k];
  }
  if (Object.keys(diff).length === 0) return null;
  return encodeBase64Utf8(JSON.stringify(diff));
}

/**
 * Decode a URL-encoded playground state diff and merge with catalog
 * defaults. `validKeys` filters out cross-chart stale keys — e.g. a `?p=`
 * produced on bar-chart and pasted into pie-chart's URL silently drops
 * the irrelevant props instead of leaking them downstream. Falls back to
 * `defaults` on any parse error (malformed base64, invalid JSON, etc.)
 * so a corrupted share link cannot crash the editor.
 */
export function decodePlaygroundState(
  encoded: string | null,
  defaults: PlaygroundState,
  validKeys: ReadonlySet<string>,
): PlaygroundState {
  if (!encoded) return defaults;
  try {
    const parsed = JSON.parse(decodeBase64Utf8(encoded)) as Record<string, PlaygroundValue>;
    const filtered: Record<string, PlaygroundValue> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (validKeys.has(k)) filtered[k] = v;
    }
    return { ...defaults, ...filtered };
  } catch {
    return defaults;
  }
}
