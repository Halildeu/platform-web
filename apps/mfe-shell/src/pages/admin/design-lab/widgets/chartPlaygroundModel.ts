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
import type { ChartMarkup, AnomalySummary, AnomalyAnnouncementFormatter } from '@mfe/x-charts';

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
  // PR-X16a (Codex 019e32da): TreeChart layout/orient. `TreeLayout` and
  // `TreeOrient` are exported type aliases in `packages/x-charts/src/
  // TreeChart.tsx`; the prop catalog stores the alias name (not the
  // resolved literal union), so they need an explicit table here — same
  // pattern as `SunburstHighlightPolicy` above.
  TreeLayout: [
    { value: 'orthogonal', label: 'orthogonal (default)' },
    { value: 'radial', label: 'radial' },
  ],
  TreeOrient: [
    { value: 'LR', label: 'LR (left → right)' },
    { value: 'RL', label: 'RL (right → left)' },
    { value: 'TB', label: 'TB (top → bottom)' },
    { value: 'BT', label: 'BT (bottom → top)' },
  ],
  // PR-X16b (Codex 019e33a9): CalendarHeatmap layout aliases.
  // `CalendarHeatmapOrient` / `CalendarWeekStart` are exported type
  // aliases in `packages/x-charts/src/CalendarHeatmap.tsx`; the prop
  // catalog stores the alias name (not the resolved literal union), so
  // they need explicit tables here — same pattern as `TreeLayout` /
  // `TreeOrient` above.
  CalendarHeatmapOrient: [
    { value: 'horizontal', label: 'horizontal (default)' },
    { value: 'vertical', label: 'vertical' },
  ],
  CalendarWeekStart: [
    { value: 'monday', label: 'monday (default)' },
    { value: 'sunday', label: 'sunday' },
  ],
  // PR-X16c (Codex 019e35b3): PolarChart series render type.
  // `PolarSeriesType` is an exported type alias in `packages/x-charts/
  // src/PolarChart.tsx`; the prop catalog stores the alias name (not the
  // resolved literal union), so it needs an explicit table here — same
  // pattern as `TreeLayout` / `CalendarHeatmapOrient` above.
  PolarSeriesType: [
    { value: 'bar', label: 'bar (default — nightingale rose)' },
    { value: 'line', label: 'line (open radial line)' },
    { value: 'scatter', label: 'scatter (one point per category)' },
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
    'stacked',
    'showBackground',
    'barGap',
    'barCategoryGap',
    'valueAxisMin',
    'valueAxisMax',
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
    'step',
    'connectNulls',
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
    'step',
    'connectNulls',
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
    'roseType',
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
    // wire the status pill demo. The companion `onBrushSelection`
    // callback is preset-driven (not a primitive): PR-X16 §4f.2
    // added `COMPLEX_PROP_PRESETS['scatter-chart.onBrushSelection']`,
    // so the playground forwards a noop / console-log / alert
    // handler that the `ScatterAnomalyDemoChart` status-pill
    // handler chains.
    'enableBrush',
    'large',
    'largeThreshold',
    'crossFilterRequired',
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
  // PR-X16a (Codex 019e32da AGREE): hierarchical node-link tree.
  // `layout`/`orient` drive orthogonal vs radial; `initialTreeDepth`
  // collapses deep levels; `expandAndCollapse`/`roam` interaction.
  'tree-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'layout',
    'orient',
    'initialTreeDepth',
    'expandAndCollapse',
    'roam',
    'symbolSize',
    'showLabels',
    'animate',
    // `valueFormatter` + `onDataPointClick` are function props — they are
    // preset-driven (COMPLEX_PROP_PRESETS), NOT LIVE_PROP_SUPPORT
    // primitives, mirroring treemap-chart. `valueColumnHeader` IS a real
    // string primitive and stays here.
    'valueColumnHeader',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // PR-X16b (Codex 019e33a9 AGREE): GitHub-contributions-style daily
  // calendar heatmap. `orient`/`startOfWeek` drive the grid layout;
  // `showValues`/`showVisualMap` toggle cell labels + legend; `min`/`max`
  // pin the color scale. `range`/`cellSize`/`colors` are complex/union
  // shapes (code-only); `valueFormatter`/`onDataPointClick` are function
  // props — preset-driven via COMPLEX_PROP_PRESETS, not primitives here.
  'calendar-heatmap': new Set([
    'title',
    'description',
    'className',
    'orient',
    'startOfWeek',
    'showValues',
    'showVisualMap',
    'min',
    'max',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // PR-X16c (Codex 019e35b3 AGREE): categorical radial chart —
  // bar/line/scatter series on a polar coordinate system. `seriesType`
  // picks the series render kind; `startAngle` rotates the first
  // category; `showAngleAxisLabel`/`showRadiusAxisLabel` toggle the two
  // axis label sets; `min`/`max` pin the radius scale. `data` is a
  // complex shape (code-only); `valueFormatter`/`onDataPointClick` are
  // function props — preset-driven via COMPLEX_PROP_PRESETS, not
  // primitives here.
  'polar-chart': new Set([
    'title',
    'description',
    'className',
    'seriesType',
    'startAngle',
    'showAngleAxisLabel',
    'showRadiusAxisLabel',
    'min',
    'max',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // PR-X16d (Codex 019e3615 AGREE): stream graph — a `themeRiver` series
  // on a lazy `singleAxis` time coordinate system. `showLabel` toggles
  // the category-name label on each flow band — the only chart-specific
  // editable primitive (ThemeRiverChart has no enum / axis-label / scale
  // props). `data` is a complex shape (code-only);
  // `valueFormatter`/`onDataPointClick` are function props — preset-
  // driven via COMPLEX_PROP_PRESETS, not primitives here.
  'theme-river-chart': new Set([
    'title',
    'description',
    'className',
    'showLabel',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // PR-X16e (Codex 019e365b AGREE): project-schedule timeline — a
  // `custom` series painting task bars on a time x-axis / category lane
  // y-axis. GanttChart has NO chart-specific editable primitive (no
  // enum / axis-label / scale / showLabel props) — only the 11-prop
  // common axis. `data` is a complex shape (code-only);
  // `valueFormatter`/`onDataPointClick` are function props — preset-
  // driven via COMPLEX_PROP_PRESETS, not primitives here.
  'gantt-chart': new Set([
    'title',
    'description',
    'className',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // PopulationPyramid (Codex 019e3f75 AGREE): HR age × gender demographic
  // pyramid — diverging horizontal bar. `leftLabel`/`rightLabel` name the
  // two series; `showValues`/`showGrid`/`showLegend` toggle the bar
  // labels / value-axis grid / legend; `maxValue` pins the symmetric
  // axis. `data` is a complex shape (code-only); `valueFormatter` /
  // `onDataPointClick` / `colors` / `markups` / `onMarkupClick` + the
  // anomaly pair are function/array props — preset-driven via
  // COMPLEX_PROP_PRESETS, not primitives here.
  'population-pyramid': new Set([
    'title',
    'description',
    'className',
    'leftLabel',
    'rightLabel',
    'showValues',
    'showGrid',
    'showLegend',
    'maxValue',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // ComboChart (Codex 019e41cd AGREE): dual-axis composite bar+line.
  // 11 common-axis + showValues/showGrid/showLegend/showDots +
  // primaryAxisLabel/secondaryAxisLabel. `labels`/`series` are complex
  // shapes (code-only); valueFormatter / secondaryValueFormatter /
  // colors / onDataPointClick / markups / onMarkupClick + the anomaly
  // pair are function/array props — preset-driven or code-only, not here.
  'combo-chart': new Set([
    'title',
    'description',
    'className',
    'primaryAxisLabel',
    'secondaryAxisLabel',
    'showValues',
    'showGrid',
    'showLegend',
    'showDots',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // EffectScatterChart (Codex 019e425b AGREE): standalone effectScatter +
  // ripple. 11 common-axis + showGrid/xLabel/yLabel/showEffectOn = 15
  // primitives. `data` complex shape (code-only); `effect`/`symbolSize`
  // nested/function — catalog only, not live; `valueFormatter`/`colors`/
  // `onDataPointClick`/`markups`/`onMarkupClick` + anomaly pair are
  // preset-driven via COMPLEX_PROP_PRESETS, not primitives here.
  'effect-scatter-chart': new Set([
    'title',
    'description',
    'className',
    'xLabel',
    'yLabel',
    'showGrid',
    'showEffectOn',
    'animate',
    'size',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // Bar3DChart (Codex 019e42c3 AGREE): standalone cartesian3D bar3D.
  // 11 common-axis + xLabel/yLabel/zLabel/showValues/shading/barSize = 17
  // primitives. `data` + `xCategories`/`yCategories` complex shapes
  // (code-only); `viewControl`/`grid3D`/`light` object passthrough —
  // catalog only, not live; `valueFormatter`/`colors`/`onDataPointClick`
  // + anomaly pair preset-driven via COMPLEX_PROP_PRESETS. NO markups
  // (Codex iter-1 REVISE — 2D markup adapter is cartesian-2d-only).
  'bar-3d-chart': new Set([
    'title',
    'description',
    'className',
    'xLabel',
    'yLabel',
    'zLabel',
    'showValues',
    'shading',
    'barSize',
    'animate',
    'size',
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
  // Faz 21.11 P1a-P1d 3D Extension Pack — live-editable knobs for the
  // four 3D wrappers. Only TOP-LEVEL primitive props are live-editable;
  // data arrays + viewControl/grid3D/light objects stay outside the
  // editor (preset-driven). echarts-gl boots lazily on first 3D mount.
  // Verified against Scatter3D.tsx, Surface3D.tsx, Lines3D.tsx,
  // Globe.tsx interface declarations.
  'scatter-3d-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'surface-3d-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'lines-3d-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'lineWidth',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'globe-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  // PR-X campaign live playground (Codex thread 019e22b6 iter-3 follow-up):
  // wire LIVE_PROP_SUPPORT for the 6 new wrappers so design-lab Playground
  // tab can edit chart props live + Examples tab shows preset gallery.
  'box-plot-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'orientation',
    'showGrid',
    'showLegend',
    'showOutliers',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'candlestick-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'showGrid',
    'showLegend',
    // Codex 019e22ea iter-1 absorb: bullish/bearish colour overrides
    // are real public props on the wrapper and should be live-editable.
    'bullishColor',
    'bearishColor',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'pictorial-bar-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'orientation',
    'symbol',
    'symbolRepeat',
    // Codex 019e22ea iter-1 absorb: wrapper defaults to `showGrid=true`;
    // editor should allow toggling it (matches BarChart pattern).
    'showGrid',
    'showLegend',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'parallel-coordinates-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'lineOpacity',
    'lineWidth',
    'groupBy',
    'showLegend',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'graph-chart': new Set([
    'title',
    'description',
    'className',
    'size',
    'layout',
    'directed',
    'roam',
    'forceRepulsion',
    'forceGravity',
    'forceEdgeLength',
    'defaultSymbolSize',
    // Codex 019e22ea iter-1 absorb: default symbol shape ('circle'
    // /'rect'/'roundRect'/'diamond' etc.) is a real public prop.
    'symbol',
    'showLegend',
    'animate',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
  ]),
  'geo-map': new Set([
    'title',
    'description',
    'className',
    'size',
    // Codex 019e22ea iter-3 absorb: `mapName` is intentionally NOT
    // live-editable. Editing it from the playground would let an admin
    // type `'TR'` (the canonical consumer slot) and have the
    // design-lab's 3-polygon synthetic fixture register under that
    // global ECharts map name — polluting the registry that the HR
    // adoption PR (and any consumer route) would later try to load
    // real TR provinces into. Preview always uses an internal
    // namespaced alias. Generated Code / sampleCode keep teaching
    // `mapName="TR"` as the consumer pattern.
    // Codex 019e22ea iter-1 absorb: alternative GeoJSON property key
    // (e.g. 'iso' or 'code') for region matching. Live-editable so
    // users can flip between name-based and code-based routing.
    'nameProperty',
    'showLabels',
    'roam',
    'selectedMode',
    // PR-X13a (Codex 019e2254 plan-time AGREE): bubble overlay toggle.
    // Not a real wrapper prop — the playground inner reads this flag
    // and conditionally builds an `overlays` prop with a demo bubble
    // layer (İstanbul HQ + Ankara HQ + İzmir Ofis). Lets the design-
    // lab user flip the layered overlay on/off live without an
    // overlay JSON editor.
    'showBubbleOverlay',
    // PR-X13b (Codex 019e2254): effectScatter overlay toggle. Adds an
    // animated pulse layer (Bursa Hub, Adana Site) on top of the
    // choropleth so the design-lab user can preview the highlighted-
    // point use case. Same toggle pattern as bubble — flag in,
    // synthetic data baked into ChartPreviewLive.
    'showEffectScatterOverlay',
    // PR-X13c (Codex 019e25d4 iter-2 AGREE): flow overlay toggle.
    // Adds a logistics-style origin-destination overlay (İstanbul →
    // Ankara, İstanbul → İzmir, Ankara → İzmir) drawn via ECharts
    // `lines` series with curved edges + animated trail.
    'showFlowOverlay',
    // PR-X13d (Codex 019e25ee iter-3 AGREE): heatmap density overlay
    // toggle. Adds a smoothed event-density blob over the choropleth
    // base via ECharts `heatmap` series + dedicated visualMap.
    'showHeatmapOverlay',
    // PR-X13e (Codex 019e2614 plan-time AGREE): marker overlay
    // toggle. Adds declarative SVG/icon markers (3 demo branches:
    // İstanbul HQ diamond, Ankara default pin, İzmir custom star
    // SVG path). Closes the PR-X13 campaign — 5 layer types total.
    'showMarkerOverlay',
    'animate',
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
 * PR-X16 §4f.2 (Codex thread `019e3af0` AGREE) — shared preset option
 * lists for the markup-overlay wave. `markups` exposes a curated set of
 * demo overlays; `onMarkupClick` / `onBrushSelection` reuse the standard
 * side-effect callback presets (same shape as `onDataPointClick`).
 */
const MARKUP_PRESET_OPTIONS: ComplexPreset[] = [
  { presetId: 'none', label: 'Yok (varsayılan)' },
  { presetId: 'threshold-line', label: 'Eşik çizgisi' },
  { presetId: 'highlight-band', label: 'Vurgu bandı' },
  { presetId: 'kpi-label', label: 'KPI etiketi' },
];

const CALLBACK_PRESET_OPTIONS: ComplexPreset[] = [
  { presetId: 'noop', label: 'no-op (default)' },
  { presetId: 'console-log', label: 'console.log' },
  { presetId: 'alert', label: 'browser alert' },
];

/**
 * PR-X16 §4f.3 (Codex thread `019e3af0` AGREE) — anomaly a11y preset
 * option lists. `anomalySummary` exposes demo `AnomalySummary[]` data
 * (none / one / multi outlier); `formatAnomalyAnnouncement` exposes
 * announcement-formatter presets (default = wrapper's built-in EN/TR
 * formatter, plus a terse + a verbose override).
 */
const ANOMALY_SUMMARY_PRESET_OPTIONS: ComplexPreset[] = [
  { presetId: 'none', label: 'Yok (varsayılan)' },
  { presetId: 'one-outlier', label: 'Tek aykırı değer' },
  { presetId: 'multi-outlier', label: 'Çoklu aykırı değer' },
];

const ANOMALY_ANNOUNCEMENT_PRESET_OPTIONS: ComplexPreset[] = [
  { presetId: 'default', label: 'Varsayılan (EN/TR)' },
  { presetId: 'terse', label: 'Kısa' },
  { presetId: 'verbose', label: 'Ayrıntılı' },
];

/**
 * The 19 enrolled charts that carry the `anomalySummary` +
 * `formatAnomalyAnnouncement` a11y pair in CHART_CATALOG — every
 * count-lock-enrolled chart except Gauge (whose catalog entry has no
 * anomaly pair). Verified against the AST by Codex thread `019e3af0`;
 * `population-pyramid` added by Codex thread `019e3f75`; `combo-chart`
 * added by Codex thread `019e41cd`; `effect-scatter-chart` added by Codex
 * thread `019e425b`; `bar-3d-chart` added by Codex thread `019e42c3` (the
 * 21st enrolled chart).
 */
const ANOMALY_PRESET_CHART_IDS = [
  'bar-chart',
  'line-chart',
  'area-chart',
  'pie-chart',
  'scatter-chart',
  'radar-chart',
  'treemap-chart',
  'tree-chart',
  'calendar-heatmap',
  'polar-chart',
  'theme-river-chart',
  'gantt-chart',
  'heatmap-chart',
  'waterfall-chart',
  'funnel-chart',
  'sankey-chart',
  'sunburst-chart',
  // PR#2 (Codex 019e3f75): PopulationPyramid HR demographic pyramid.
  'population-pyramid',
  // ComboChart (Codex 019e41cd AGREE): dual-axis composite bar+line.
  'combo-chart',
  // EffectScatterChart (Codex 019e425b AGREE): standalone effectScatter.
  'effect-scatter-chart',
  // Bar3DChart (Codex 019e42c3 AGREE): standalone cartesian3D bar3D.
  'bar-3d-chart',
] as const;

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
      // PR-X16a (Codex 019e32da): TreeChart node value formatting.
      'tree-chart',
      // PR-X16b (Codex 019e33a9): CalendarHeatmap day-value formatting.
      'calendar-heatmap',
      // PR-X16c (Codex 019e35b3): PolarChart category-value formatting.
      'polar-chart',
      // PR-X16d (Codex 019e3615): ThemeRiverChart band-value formatting.
      'theme-river-chart',
      // PR-X16e (Codex 019e365b): GanttChart task-duration formatting.
      'gantt-chart',
      // PR#2 (Codex 019e3f75): PopulationPyramid age-band measure formatting.
      'population-pyramid',
      // ComboChart (Codex 019e41cd): dual-axis primary-series value formatting.
      'combo-chart',
      // EffectScatterChart (Codex 019e425b): outlier value formatting.
      'effect-scatter-chart',
      // Bar3DChart (Codex 019e42c3): bar height (z) value formatting.
      'bar-3d-chart',
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
      // PR-X16a (Codex 019e32da): TreeChart node-click cross-filter.
      'tree-chart',
      // PR-X16b (Codex 019e33a9): CalendarHeatmap day-cell cross-filter.
      'calendar-heatmap',
      // PR-X16c (Codex 019e35b3): PolarChart category-click cross-filter.
      'polar-chart',
      // PR-X16d (Codex 019e3615): ThemeRiverChart band-click cross-filter.
      'theme-river-chart',
      // PR-X16e (Codex 019e365b): GanttChart task-bar-click cross-filter.
      'gantt-chart',
      // PR#2 (Codex 019e3f75): PopulationPyramid age-band-click cross-filter.
      'population-pyramid',
      // ComboChart (Codex 019e41cd): bar/line point-click cross-filter.
      'combo-chart',
      // EffectScatterChart (Codex 019e425b): point-click cross-filter
      // (departman outlier markers).
      'effect-scatter-chart',
      // Bar3DChart (Codex 019e42c3): 3D bar-click cross-filter
      // (category × category pivot drill-down).
      'bar-3d-chart',
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
  // PR-X16b (Codex 019e33a9): CalendarHeatmap low→high gradient. The
  // `colors` prop is `[string, string]` — same shape as heatmap-chart, so
  // the gradient presets mirror it. Routing it as a preset (not a
  // LIVE_PROP_SUPPORT primitive) keeps the curated count-lock coverage
  // above the %90 floor.
  'calendar-heatmap.colors': [
    { presetId: 'default', label: 'Wrapper default (GitHub blue)' },
    { presetId: 'cool-warm', label: 'Cool→Warm' },
    { presetId: 'green-red', label: 'Green→Red' },
  ],
  // PR#2 (Codex 019e3f75): PopulationPyramid `colors` is `[leftColor,
  // rightColor]` — same `[string, string]` shape as calendar-heatmap. The
  // resolver is chart-agnostic; the wrapper reads palette[0] / palette[1].
  'population-pyramid.colors': [
    { presetId: 'default', label: 'Auto palette (default)' },
    { presetId: 'rainbow', label: 'Rainbow' },
    { presetId: 'monochrome', label: 'Monochrome slate' },
  ],
  // ComboChart (Codex 019e41cd AGREE): `colors` is a `string[]` series
  // palette — per-series bar/line color. The resolver is chart-agnostic;
  // the wrapper cycles palette[i % len] across the series.
  'combo-chart.colors': [
    { presetId: 'default', label: 'Auto palette (default)' },
    { presetId: 'rainbow', label: 'Rainbow' },
    { presetId: 'monochrome', label: 'Monochrome slate' },
  ],
  // EffectScatterChart (Codex 019e425b AGREE): `colors` is a `string[]`
  // palette — first entry drives the series itemStyle (single-series).
  // Same chart-agnostic resolver as scatter / combo.
  'effect-scatter-chart.colors': [
    { presetId: 'default', label: 'Auto palette (default)' },
    { presetId: 'rainbow', label: 'Rainbow' },
    { presetId: 'monochrome', label: 'Monochrome slate' },
  ],
  // Bar3DChart (Codex 019e42c3 AGREE): `colors` is a `string[]` palette
  // that drives the visualMap inRange.color stops (z-height gradient
  // across 3D bars). Same chart-agnostic resolver as the other wrappers.
  'bar-3d-chart.colors': [
    { presetId: 'default', label: 'Auto palette (default)' },
    { presetId: 'rainbow', label: 'Rainbow' },
    { presetId: 'monochrome', label: 'Monochrome slate' },
  ],
  // waterfall-chart.colors is `{ increase?, decrease?, total? }` object —
  // requires its own object resolver, deferred to PR-FE-Playground-4.

  // ---- PR-X16 §4f.2 — markup overlay preset wave -------------------
  // `markups` + `onMarkupClick` for the nine genuine-markup charts:
  // bar / line / area / scatter / heatmap / waterfall / population-pyramid
  // / combo-chart / effect-scatter-chart. These are every chart whose
  // wrapper calls `useMarkupAdapter` AND fires `onMarkupClick`
  // (verified in x-charts source — Codex thread `019e3af0`; PopulationPyramid
  // via `019e3f75`; ComboChart via `019e41cd`; EffectScatterChart via
  // `019e425b`). The NO-OP markup charts — pie, gauge, radar, treemap,
  // funnel, sankey, sunburst — are deliberately NOT enrolled: their
  // wrappers accept `markups` for API consistency but render nothing,
  // so a playground control there would be a dead no-op (would inflate
  // the numerator dishonestly).
  ...Object.fromEntries(
    [
      'bar-chart',
      'line-chart',
      'area-chart',
      'scatter-chart',
      'heatmap-chart',
      'waterfall-chart',
      // PR#2 (Codex 019e3f75): PopulationPyramid is a genuine-markup
      // chart — its wrapper calls `useMarkupAdapter` + fires `onMarkupClick`.
      'population-pyramid',
      // ComboChart (Codex 019e41cd AGREE): genuine-markup chart — its
      // wrapper calls `useMarkupAdapter` + fires `onMarkupClick`.
      'combo-chart',
      // EffectScatterChart (Codex 019e425b AGREE): genuine-markup chart —
      // its wrapper calls `useMarkupAdapter` (scatter mode) + fires
      // `onMarkupClick` with wrapper-identity chartType 'effectScatter'.
      'effect-scatter-chart',
    ].map((cid) => [`${cid}.markups`, MARKUP_PRESET_OPTIONS] as [string, ComplexPreset[]]),
  ),
  ...Object.fromEntries(
    [
      'bar-chart',
      'line-chart',
      'area-chart',
      'scatter-chart',
      'heatmap-chart',
      'waterfall-chart',
      // PR#2 (Codex 019e3f75): PopulationPyramid markup-overlay click.
      'population-pyramid',
      // ComboChart (Codex 019e41cd AGREE): markup-overlay click.
      'combo-chart',
      // EffectScatterChart (Codex 019e425b AGREE): markup-overlay click.
      'effect-scatter-chart',
    ].map((cid) => [`${cid}.onMarkupClick`, CALLBACK_PRESET_OPTIONS] as [string, ComplexPreset[]]),
  ),
  // Scatter brush selection — the catalog `onBrushSelection` callback.
  // ChartPreviewLive already renders the brush UI via the `enableBrush`
  // primitive; this preset makes the callback itself live-selectable so
  // the playground tester can see console-log / alert side effects fire.
  'scatter-chart.onBrushSelection': CALLBACK_PRESET_OPTIONS,

  // ---- PR-X16 §4f.3 — anomaly a11y preset wave --------------------
  // `anomalySummary` + `formatAnomalyAnnouncement` for the 21 enrolled
  // charts that carry the anomaly a11y pair in CHART_CATALOG (every
  // enrolled chart except Gauge — verified via AST, Codex 019e3af0;
  // population-pyramid added by Codex thread 019e3f75; combo-chart added
  // by Codex thread 019e41cd; effect-scatter-chart added by Codex thread
  // 019e425b; bar-3d-chart added by Codex thread 019e42c3).
  // `anomalySummary` feeds `ChartA11yShell`'s polite SR announcement;
  // `formatAnomalyAnnouncement` overrides the announcement template.
  ...Object.fromEntries(
    ANOMALY_PRESET_CHART_IDS.flatMap((cid) => [
      [`${cid}.anomalySummary`, ANOMALY_SUMMARY_PRESET_OPTIONS] as [string, ComplexPreset[]],
      [`${cid}.formatAnomalyAnnouncement`, ANOMALY_ANNOUNCEMENT_PRESET_OPTIONS] as [
        string,
        ComplexPreset[],
      ],
    ]),
  ),
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
/*  PR-X16 §4f.2: markup overlay preset resolver                       */
/* ================================================================== */

/**
 * Chart-aware markup anchor table. Each genuine-markup chart maps the
 * three `markups` preset ids to one concrete `ChartMarkup` whose anchor
 * lands inside that chart's `ChartPreviewLive` sample-data range:
 *
 *   - bar / line / area / waterfall — numeric value (y) axis, category x
 *   - scatter — numeric x / y
 *   - heatmap — categorical x / y; `LineMarkup.value` + `AreaMarkup.from`
 *     / `to` take category strings (the `number | string` contract), and
 *     `kpi-label` uses the heatmap-friendly `{ xLabel, yLabel }` anchor.
 *   - population-pyramid — numeric value (x) axis, category y; the
 *     horizontal diverging bar is the axis-mirror of bar/line/area, so
 *     threshold / band live on `axis: 'x'` and `kpi-label` anchors
 *     `{ x: <number>, y: <ageBand> }` (Codex thread `019e3f75`).
 *
 * Verified NO-OP-free against `adaptToEcharts` `DEFAULT_SUPPORT_MATRIX`
 * (line / area / label full for all seven) — Codex threads `019e3af0`
 * + `019e3f75`.
 */
const MARKUP_PRESET_ANCHORS: Record<
  string,
  Record<'threshold-line' | 'highlight-band' | 'kpi-label', ChartMarkup>
> = {
  'bar-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 350,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Hedef 350', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 340,
      to: 380,
      opacity: 0.18,
      label: { text: 'Üst bant' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Zirve',
      anchor: { x: 'Mayıs', y: 390 },
      background: '#0ea5e9',
    },
  },
  'line-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 300,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Eşik 300', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 250,
      to: 320,
      opacity: 0.18,
      label: { text: 'Bant' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Zirve',
      anchor: { x: 'Mayıs', y: 390 },
      background: '#0ea5e9',
    },
  },
  'area-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 300,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Eşik 300', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 250,
      to: 320,
      opacity: 0.18,
      label: { text: 'Bant' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Zirve',
      anchor: { x: 'Mayıs', y: 390 },
      background: '#0ea5e9',
    },
  },
  'scatter-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 280,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Eşik 280', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 220,
      to: 300,
      opacity: 0.18,
      label: { text: 'Bant' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'İlgi alanı',
      anchor: { x: 355, y: 255 },
      background: '#0ea5e9',
    },
  },
  'heatmap-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'x',
      value: 'Çar',
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Çarşamba' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'x',
      from: 'Sal',
      to: 'Per',
      opacity: 0.18,
      label: { text: 'Hafta ortası' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Yoğun',
      anchor: { xLabel: 'Per', yLabel: 'Sabah' },
      background: '#0ea5e9',
    },
  },
  'waterfall-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 1250,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Hedef 1250', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 1200,
      to: 1400,
      opacity: 0.18,
      label: { text: 'Bant' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Zirve',
      anchor: { x: 'Hizmet', y: 1500 },
      background: '#0ea5e9',
    },
  },
  // PR#2 (Codex 019e3f75): PopulationPyramid — horizontal diverging bar.
  // The value axis is `x` (numeric, symmetric); the category axis is `y`
  // (age bands). Anchors land inside the ChartPreviewLive sample-data
  // range (left/right peak ≈ 480/520).
  'population-pyramid': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'x',
      value: 400,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Eşik 400', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'x',
      from: 300,
      to: 500,
      opacity: 0.18,
      label: { text: 'Yoğun kohort' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Zirve kohort',
      anchor: { x: 480, y: '25-34' },
      background: '#0ea5e9',
    },
  },
  // ComboChart (Codex 019e41cd AGREE): dual-axis composite — standard
  // cartesian category-x / value-y layout. A y-axis markup anchors to
  // the PRIMARY y-axis (the bar series range, ~90-160 in the sample
  // data); the category axis is `x` (months).
  'combo-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 130,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Hedef 130', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 120,
      to: 145,
      opacity: 0.18,
      label: { text: 'Hedef bant' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Zirve ay',
      anchor: { x: 'Haz', y: 160 },
      background: '#0ea5e9',
    },
  },
  // EffectScatterChart (Codex 019e425b AGREE): standalone effectScatter
  // on cartesian2d. Both x and y are VALUE axes — sample dataset is
  // departman ortalama maaş (x ~ 34000-47000) vs maaş aralığı (y ~
  // 7000-25000). y-axis threshold anchors to the maaş aralığı dimension
  // (20000 = high-spread alert); kpi label points at the Satış outlier.
  'effect-scatter-chart': {
    'threshold-line': {
      id: 'preset-threshold',
      type: 'line',
      source: 'manual',
      axis: 'y',
      value: 20000,
      style: 'dashed',
      color: '#ef4444',
      label: { text: 'Yüksek aralık ≥20K', position: 'end' },
    },
    'highlight-band': {
      id: 'preset-band',
      type: 'area',
      source: 'manual',
      axis: 'y',
      from: 18000,
      to: 25000,
      opacity: 0.18,
      label: { text: 'Outlier bandı' },
    },
    'kpi-label': {
      id: 'preset-label',
      type: 'label',
      source: 'manual',
      text: 'Satış outlier',
      anchor: { x: 47000, y: 25000 },
      background: '#0ea5e9',
    },
  },
};

/**
 * Resolve a `markups` preset id into a one-element `ChartMarkup[]` demo
 * overlay for the given chart. Returns `undefined` for `none` / unknown
 * chart / unknown preset id so the wrapper renders no overlay (the
 * playground default is `none`).
 */
export function getMarkupsPreset(
  presetId: string | undefined,
  chartId: string,
): ChartMarkup[] | undefined {
  if (!presetId || presetId === 'none') return undefined;
  const anchors = MARKUP_PRESET_ANCHORS[chartId];
  if (!anchors) return undefined;
  switch (presetId) {
    case 'threshold-line':
      return [anchors['threshold-line']];
    case 'highlight-band':
      return [anchors['highlight-band']];
    case 'kpi-label':
      return [anchors['kpi-label']];
    default:
      return undefined;
  }
}

/* ================================================================== */
/*  PR-X16 §4f.3: anomaly a11y preset resolvers                        */
/* ================================================================== */

/**
 * Domain bucket for a chart's demo `AnomalySummary`. The default
 * `formatAnomalyAnnouncement` (`ChartAriaLive`) branches on the
 * `AnomalySummary.kind` discriminator, so the demo summary must carry
 * the right kind + metadata for the SR announcement to read correctly:
 *   - `flat`         — cartesian / categorical (12 charts)
 *   - `radar`        — radar-chart (series + indicator metadata)
 *   - `hierarchical` — tree / treemap / sunburst (ancestor path)
 *   - `sankey`       — sankey-chart (edge source/target/flow)
 */
type AnomalyChartKind = 'flat' | 'radar' | 'hierarchical' | 'sankey';

const ANOMALY_PRESET_CHART_ID_SET: ReadonlySet<string> = new Set(ANOMALY_PRESET_CHART_IDS);

const CHART_ANOMALY_KIND: Record<string, AnomalyChartKind> = {
  'radar-chart': 'radar',
  'tree-chart': 'hierarchical',
  'treemap-chart': 'hierarchical',
  'sunburst-chart': 'hierarchical',
  'sankey-chart': 'sankey',
};

interface DemoOutlier {
  x: number | string;
  y: number;
  direction: 'above' | 'below';
  severity: number;
  severityBucket: 'high' | 'medium';
}

/** Three demo outliers — `one-outlier` uses the first, `multi-outlier` all. */
const DEMO_OUTLIERS: readonly DemoOutlier[] = [
  { x: 'Mayıs', y: 390, direction: 'above', severity: 140, severityBucket: 'high' },
  { x: 'Şubat', y: 110, direction: 'below', severity: 92, severityBucket: 'medium' },
  { x: 'Kasım', y: 421, direction: 'above', severity: 77, severityBucket: 'medium' },
];

/** Build one kind-aware demo `AnomalySummary` from a base outlier. */
function buildAnomalySummary(
  base: DemoOutlier,
  index: number,
  kind: AnomalyChartKind,
): AnomalySummary {
  const formattedY = base.y.toFixed(2);
  const common = {
    id: `preset-anomaly-${index}`,
    x: base.x,
    y: base.y,
    formattedY,
    direction: base.direction,
    severity: base.severity,
    severityBucket: base.severityBucket,
  };
  if (kind === 'radar') {
    return {
      ...common,
      kind: 'radar',
      seriesName: 'Seri A',
      indicatorIndex: index,
      indicatorName: ['Gecikme', 'Hata oranı', 'Kapsama'][index] ?? 'Gösterge',
      axisUnit: 'ms',
      ariaLabel: `Radar göstergesi anomalisi: ${base.x}`,
    };
  }
  if (kind === 'hierarchical') {
    return {
      ...common,
      kind: 'hierarchical',
      path: ['Bölge', 'Ekip', String(base.x)],
      depth: 2,
      ariaLabel: `Hiyerarşi anomalisi: ${base.x}`,
    };
  }
  if (kind === 'sankey') {
    return {
      ...common,
      kind: 'sankey-edge',
      edgeId: `e-${index}`,
      source: 'Kaynak',
      target: String(base.x),
      flowValue: base.y,
      ariaLabel: `Akış anomalisi: ${base.x}`,
    };
  }
  return {
    ...common,
    ariaLabel: `${base.direction === 'above' ? 'Beklenenin üzerinde' : 'Beklenenin altında'} aykırı değer: x=${base.x}, y=${formattedY}`,
  };
}

/**
 * Resolve an `anomalySummary` preset id into a demo `AnomalySummary[]`
 * for the given chart, or `undefined` for `none` / unknown preset /
 * non-enrolled chart (Gauge has no anomaly catalog pair).
 */
export function getAnomalySummaryPreset(
  presetId: string | undefined,
  chartId: string,
): AnomalySummary[] | undefined {
  if (!presetId || presetId === 'none') return undefined;
  if (!ANOMALY_PRESET_CHART_ID_SET.has(chartId)) return undefined;
  let count: number;
  if (presetId === 'one-outlier') count = 1;
  else if (presetId === 'multi-outlier') count = 3;
  else return undefined;
  const kind = CHART_ANOMALY_KIND[chartId] ?? 'flat';
  return DEMO_OUTLIERS.slice(0, count).map((o, i) => buildAnomalySummary(o, i, kind));
}

/**
 * Resolve a `formatAnomalyAnnouncement` preset id into a custom
 * `AnomalyAnnouncementFormatter`. `default` (and unknown) returns
 * `undefined` so the wrapper keeps its built-in EN/TR formatter.
 */
export function getAnomalyAnnouncementPreset(
  presetId: string | undefined,
): AnomalyAnnouncementFormatter | undefined {
  switch (presetId) {
    case 'terse':
      return (anomalies) => {
        if (!Array.isArray(anomalies) || anomalies.length === 0) return '';
        return anomalies.length === 1 ? '1 anomali' : `${anomalies.length} anomali`;
      };
    case 'verbose':
      return (anomalies, locale) => {
        if (!Array.isArray(anomalies) || anomalies.length === 0) return '';
        const isTr = typeof locale === 'string' && locale.toLowerCase().startsWith('tr');
        const total = anomalies.length;
        const above = anomalies.filter((a) => a.direction === 'above').length;
        const below = total - above;
        const top = [...anomalies].sort((a, b) => b.severity - a.severity)[0];
        if (isTr) {
          return `${total} anomali tespit edildi — ${above} üstte, ${below} altta. En yüksek önem: x=${top.x}, y=${top.formattedY} (${top.severityBucket}).`;
        }
        return `${total} anomalies detected — ${above} above, ${below} below. Highest severity: x=${top.x}, y=${top.formattedY} (${top.severityBucket}).`;
      };
    case 'default':
    case undefined:
    default:
      return undefined;
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

/**
 * Per-`{chartId}.{propName}` editor-kind overrides. A few props have a
 * TypeScript type the generic `getEditorKind` heuristic cannot classify
 * into a useful control:
 *
 *   - `tree-chart.roam` is `boolean | 'scale' | 'move'` — a mixed
 *     boolean / string-literal union. `getEnumOptions` rejects it (not a
 *     pure string-literal union), so it falls through to `complex`
 *     (read-only) even though it IS a live-forwarded prop. The playground
 *     exposes it as a plain on/off `boolean` toggle; the `'scale'` /
 *     `'move'` partial-roam granularity stays a code/API-only refinement
 *     (cf. the deliberately-deferred `SankeyFocusMode`).
 *
 * Keep this list minimal — prefer a real enum table in
 * `KNOWN_ENUM_OPTIONS` whenever the prop is a pure string-literal union.
 */
export const PROP_EDITOR_KIND_OVERRIDES: Record<string, EditorKind> = {
  'tree-chart.roam': 'boolean',
};

/* ================================================================== */
/*  Descriptor builder                                                 */
/* ================================================================== */

export function buildDescriptor(chartId: string, prop: ChartProp): EditorDescriptor {
  let kind = getEditorKind(prop);
  const category = getCategory(prop);
  const overrideKey = `${chartId}.${prop.name}`;
  const overrideDefault = PLAYGROUND_DEFAULT_OVERRIDES[overrideKey];

  // Per-prop editor-kind override — for props whose TS type the generic
  // `getEditorKind` heuristic cannot map to a useful control (see
  // `PROP_EDITOR_KIND_OVERRIDES`). Applied before the preset upgrade so
  // an overridden prop is treated as its real kind, not `complex`.
  const kindOverride = PROP_EDITOR_KIND_OVERRIDES[overrideKey];
  if (kindOverride) kind = kindOverride;

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
  // PR-X campaign sample-data scaffolds (Codex thread 019e22b6 iter-2
  // absorb): generated code for the 6 new wrappers needs sampleData
  // variables so the snippet is compile-ready. Each scaffold matches
  // the actual wrapper data shape (BoxPlotDataPoint uses `category +
  // quartiles`, not the simplified label/min/q1/... shape from the
  // earlier draft).
  'box-plot-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'BoxPlot distribution data',
        jsLiteral: `[
  { category: 'Q1', quartiles: [10, 22, 30, 38, 50] },
  { category: 'Q2', quartiles: [12, 25, 34, 42, 55] },
  { category: 'Q3', quartiles: [14, 28, 36, 44, 58] },
]`,
      },
    ],
  },
  'candlestick-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'Candlestick OHLC time-series',
        jsLiteral: `[
  { label: '2026-05-10', open: 100, close: 110, low: 95, high: 115 },
  { label: '2026-05-11', open: 110, close: 105, low: 102, high: 112 },
  { label: '2026-05-12', open: 105, close: 118, low: 104, high: 120 },
]`,
      },
    ],
  },
  'pictorial-bar-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'PictorialBar department headcount',
        jsLiteral: `[
  { label: 'Eng', value: 12 },
  { label: 'Sales', value: 8 },
  { label: 'HR', value: 5 },
]`,
      },
    ],
  },
  'parallel-coordinates-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'ParallelCoordinates compensation rows',
        jsLiteral: `[
  { dept: 'Eng', salary: 80000, tenure: 5 },
  { dept: 'Sales', salary: 60000, tenure: 3 },
  { dept: 'HR', salary: 55000, tenure: 8 },
]`,
      },
      {
        propName: 'axes',
        varName: 'sampleAxes',
        caption: 'ParallelCoordinates axis definitions',
        jsLiteral: `[
  { field: 'dept', name: 'Department', type: 'category' },
  { field: 'salary', name: 'Salary', type: 'value' },
  { field: 'tenure', name: 'Tenure (yr)', type: 'value' },
]`,
      },
    ],
  },
  'graph-chart': {
    scaffold: [
      {
        propName: 'nodes',
        varName: 'sampleNodes',
        caption: 'GraphChart nodes',
        jsLiteral: `[
  { id: 'a', name: 'Doc A', value: 5, category: 0 },
  { id: 'b', name: 'Doc B', value: 3, category: 0 },
  { id: 'c', name: 'Orphan', value: 1, category: 1 },
]`,
      },
      {
        propName: 'edges',
        varName: 'sampleEdges',
        caption: 'GraphChart edges',
        jsLiteral: `[
  { source: 'a', target: 'b', value: 2 },
  { source: 'b', target: 'c', value: 1 },
]`,
      },
    ],
  },
  'geo-map': {
    scaffold: [
      {
        propName: 'mapName',
        varName: 'sampleMapName',
        caption: 'GeoMap registered map name',
        jsLiteral: `'TR'`,
      },
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'GeoMap region values',
        jsLiteral: `[
  { name: 'İstanbul', value: 5000 },
  { name: 'Ankara', value: 3000 },
  { name: 'İzmir', value: 2200 },
]`,
      },
    ],
  },
  // PR-X16a (Codex 019e32da): TreeChart org-hierarchy scaffold so the
  // generated snippet compiles end-to-end (`const sampleData = [...]`).
  'tree-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'TreeChart hierarchy (org chart)',
        jsLiteral: `[
  {
    name: 'Genel Müdür',
    children: [
      {
        name: 'İK Direktörü',
        children: [
          { name: 'İşe Alım', value: 8 },
          { name: 'İK Operasyon', value: 12 },
        ],
      },
      {
        name: 'Mühendislik Direktörü',
        children: [
          { name: 'Frontend', value: 20 },
          { name: 'Backend', value: 25 },
        ],
      },
    ],
  },
]`,
      },
    ],
  },
  // PR-X16b (Codex 019e33a9): CalendarHeatmap daily-value scaffold so the
  // generated snippet compiles end-to-end (`const sampleData = [...]`).
  'calendar-heatmap': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'CalendarHeatmap daily values (YYYY-MM-DD)',
        jsLiteral: `[
  { date: '2026-01-06', value: 5 },
  { date: '2026-01-14', value: 12 },
  { date: '2026-02-03', value: 8 },
  { date: '2026-02-21', value: 17 },
  { date: '2026-03-09', value: 3 },
  { date: '2026-03-27', value: 20 },
  { date: '2026-04-15', value: 11 },
]`,
      },
    ],
  },
  // PR-X16c (Codex 019e35b3): PolarChart per-category scaffold so the
  // generated snippet compiles end-to-end (`const sampleData = [...]`).
  'polar-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'PolarChart per-category values ({ name, value })',
        jsLiteral: `[
  { name: 'Pzt', value: 42 },
  { name: 'Sal', value: 38 },
  { name: 'Çar', value: 55 },
  { name: 'Per', value: 61 },
  { name: 'Cum', value: 73 },
  { name: 'Cmt', value: 48 },
  { name: 'Paz', value: 30 },
]`,
      },
    ],
  },
  // PR-X16d (Codex 019e3615): ThemeRiverChart per-(date, category)
  // scaffold so the generated snippet compiles end-to-end
  // (`const sampleData = [...]`). 5-month × 3-channel traffic series.
  'theme-river-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'ThemeRiverChart observations ({ date, value, category })',
        jsLiteral: `[
  { date: '2026-01-01', category: 'Web', value: 120 },
  { date: '2026-01-01', category: 'Mobile', value: 80 },
  { date: '2026-01-01', category: 'API', value: 45 },
  { date: '2026-02-01', category: 'Web', value: 132 },
  { date: '2026-02-01', category: 'Mobile', value: 96 },
  { date: '2026-02-01', category: 'API', value: 58 },
  { date: '2026-03-01', category: 'Web', value: 118 },
  { date: '2026-03-01', category: 'Mobile', value: 110 },
  { date: '2026-03-01', category: 'API', value: 67 },
  { date: '2026-04-01', category: 'Web', value: 145 },
  { date: '2026-04-01', category: 'Mobile', value: 124 },
  { date: '2026-04-01', category: 'API', value: 73 },
  { date: '2026-05-01', category: 'Web', value: 138 },
  { date: '2026-05-01', category: 'Mobile', value: 141 },
  { date: '2026-05-01', category: 'API', value: 88 },
]`,
      },
    ],
  },
  // PR-X16e (Codex 019e365b): GanttChart task scaffold so the generated
  // snippet compiles end-to-end (`const sampleData = [...]`). 6-task ×
  // 3-lane (Planning / Development / Testing) project schedule.
  'gantt-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'GanttChart tasks ({ id, name, category, start, end })',
        jsLiteral: `[
  { id: 't1', name: 'Discovery', category: 'Planning', start: '2026-01-05', end: '2026-01-19' },
  { id: 't2', name: 'Design', category: 'Planning', start: '2026-01-19', end: '2026-02-09' },
  { id: 't3', name: 'Frontend', category: 'Development', start: '2026-02-09', end: '2026-03-16' },
  { id: 't4', name: 'Backend', category: 'Development', start: '2026-02-16', end: '2026-03-23' },
  { id: 't5', name: 'Integration Test', category: 'Testing', start: '2026-03-23', end: '2026-04-06' },
  { id: 't6', name: 'Launch', category: 'Testing', start: '2026-04-06', end: '2026-04-13' },
]`,
      },
    ],
  },
  // PR#2 (Codex 019e3f75): PopulationPyramid age-band scaffold so the
  // generated snippet compiles end-to-end (`const sampleData = [...]`).
  // 6 age bands × 2 unsigned gendered measures.
  'population-pyramid': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'PopulationPyramid age-band rows ({ ageBand, left, right })',
        jsLiteral: `[
  { ageBand: '18-24', left: 240, right: 210 },
  { ageBand: '25-34', left: 480, right: 520 },
  { ageBand: '35-44', left: 390, right: 410 },
  { ageBand: '45-54', left: 230, right: 250 },
  { ageBand: '55-64', left: 120, right: 110 },
  { ageBand: '65+', left: 60, right: 80 },
]`,
      },
    ],
  },
  // ComboChart (Codex 019e41cd AGREE): dual-axis composite — `labels`
  // (category x-axis) + `series` (mixed bar/line) scaffolds so the
  // generated snippet compiles end-to-end.
  'combo-chart': {
    scaffold: [
      {
        propName: 'labels',
        varName: 'sampleLabels',
        caption: 'ComboChart x-axis category labels (string[])',
        jsLiteral: `['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz']`,
      },
      {
        propName: 'series',
        varName: 'sampleSeries',
        caption: 'ComboChart mixed bar/line series ({ name, type, axis, data })',
        jsLiteral: `[
  // iter-2 §10: primary-bar + secondary-bar + primary-line — closes
  // the "bars-on-two-axes overlap" risk via the Design Lab preview.
  { name: 'Gelir', type: 'bar', axis: 'primary', data: [120, 132, 101, 134, 90, 160] },
  { name: 'Çalışan', type: 'bar', axis: 'secondary', data: [80, 85, 78, 92, 75, 98] },
  { name: 'Hedef', type: 'line', axis: 'primary', data: [110, 125, 100, 130, 95, 150] },
]`,
      },
    ],
  },
  // EffectScatterChart (Codex 019e425b AGREE): standalone effectScatter —
  // `data` scaffold (departman maaş outlier'ları) for the generated
  // snippet. Mirrors the Design Lab preview sample so the playground +
  // generated code stay 1:1.
  'effect-scatter-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'EffectScatterChart departman maaş outlier points (EffectScatterDataPoint[])',
        jsLiteral: `[
  { x: 42000, y: 18000, size: 28, name: 'Mühendislik' },
  { x: 38000, y: 9000, size: 18, name: 'Pazarlama' },
  { x: 45000, y: 22000, size: 32, name: 'Finans' },
  { x: 34000, y: 7000, size: 15, name: 'İK' },
  { x: 39000, y: 12000, size: 22, name: 'Operasyon' },
  { x: 47000, y: 25000, size: 36, name: 'Satış' },
]`,
      },
    ],
  },
  // Bar3DChart (Codex 019e42c3 AGREE): cartesian3D bar3D — `data`
  // scaffold (departman × kıdem × ortalama maaş pivot) for the generated
  // snippet. Mirrors BAR_3D_FIXTURE in ChartPreviewLive so playground +
  // generated code stay 1:1.
  'bar-3d-chart': {
    scaffold: [
      {
        propName: 'data',
        varName: 'sampleData',
        caption: 'Bar3DChart departman × kıdem × ortalama maaş pivot (Bar3DDataPoint[])',
        jsLiteral: `[
  { x: 'Mühendislik', y: 'Junior', z: 50000 },
  { x: 'Mühendislik', y: 'Mid', z: 80000 },
  { x: 'Mühendislik', y: 'Senior', z: 110000 },
  { x: 'Satış', y: 'Junior', z: 45000 },
  { x: 'Satış', y: 'Mid', z: 70000 },
  { x: 'Satış', y: 'Senior', z: 95000 },
  { x: 'Pazarlama', y: 'Junior', z: 48000 },
  { x: 'Pazarlama', y: 'Mid', z: 75000 },
  { x: 'Pazarlama', y: 'Senior', z: 100000 },
  { x: 'İK', y: 'Junior', z: 42000 },
  { x: 'İK', y: 'Mid', z: 68000 },
  { x: 'İK', y: 'Senior', z: 90000 },
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
  // ─────────────────────────────────────────────────────────────────
  // Faz 21.11 batch3 sequential — radar/treemap/sankey/sunburst preset
  // galleries. Mirror the bar/line/area pattern (basic + 4-6 variants).
  // ─────────────────────────────────────────────────────────────────
  'radar-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Polygon shape with multi-series overlay.',
      statePatch: {},
    },
    {
      id: 'circle-shape',
      label: 'Circle Shape',
      tag: 'shape',
      description: 'Circular envelope instead of polygon spokes.',
      statePatch: { shape: 'circle' },
    },
    {
      id: 'with-area',
      label: 'Area Fill',
      tag: 'fill',
      description: 'Translucent area under each series line.',
      statePatch: { showArea: true },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Display series legend below the radar.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'compact',
      label: 'Compact Density',
      tag: 'density',
      description: 'Smaller axis labels + tighter spacing.',
      statePatch: { density: 'compact' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'treemap-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Hierarchical area allocation with breadcrumb.',
      statePatch: {},
    },
    {
      id: 'no-breadcrumb',
      label: 'No Breadcrumb',
      tag: 'navigation',
      description: 'Hide drill-down breadcrumb strip.',
      statePatch: { showBreadcrumb: false },
    },
    {
      id: 'deeper',
      label: 'Two-Level Drill',
      tag: 'depth',
      description: 'Show two layers of children at once (leafDepth=2).',
      statePatch: { leafDepth: 2 },
    },
    {
      id: 'with-roam',
      label: 'Pan + Zoom',
      tag: 'interaction',
      description: 'Enable mouse pan + scroll-zoom on the canvas.',
      statePatch: { roam: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click + drill no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // PR-X16a (Codex 019e32da): hierarchical node-link tree presets.
  'tree-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Orthogonal left-to-right org hierarchy.',
      statePatch: {},
    },
    {
      id: 'radial',
      label: 'Radial Layout',
      tag: 'layout',
      description: 'Root at centre, descendants on concentric rings.',
      statePatch: { layout: 'radial' },
    },
    {
      id: 'expanded',
      label: 'Fully Expanded',
      tag: 'depth',
      description: 'Expand every level on first render (initialTreeDepth=4).',
      statePatch: { initialTreeDepth: 4 },
    },
    {
      id: 'collapsed',
      label: 'Collapsed Branches',
      tag: 'depth',
      description: 'Show only the root + its direct children (initialTreeDepth=1).',
      statePatch: { initialTreeDepth: 1 },
    },
    {
      id: 'with-roam',
      label: 'Pan + Zoom',
      tag: 'interaction',
      description: 'Enable mouse pan + scroll-zoom on the canvas.',
      statePatch: { roam: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // PR-X16b (Codex 019e33a9): CalendarHeatmap preset gallery.
  'calendar-heatmap': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Horizontal calendar grid with the visual-map legend.',
      statePatch: {},
    },
    {
      id: 'with-values',
      label: 'With Values',
      tag: 'labels',
      description: 'Show the numeric value inside each day cell.',
      statePatch: { showValues: true },
    },
    {
      id: 'vertical',
      label: 'Vertical Layout',
      tag: 'orientation',
      description: 'Stack the months vertically instead of left-to-right.',
      statePatch: { orient: 'vertical' },
    },
    {
      id: 'sunday-start',
      label: 'Sunday Start',
      tag: 'layout',
      description: 'Begin each week on Sunday instead of Monday.',
      statePatch: { startOfWeek: 'sunday' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // PR-X16c (Codex 019e35b3): PolarChart preset gallery.
  'polar-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Polar-bar (nightingale rose) with both axis labels.',
      statePatch: {},
    },
    {
      id: 'line-series',
      label: 'Line Series',
      tag: 'series',
      description: 'Render an open radial line instead of polar bars.',
      statePatch: { seriesType: 'line' },
    },
    {
      id: 'scatter-series',
      label: 'Scatter Series',
      tag: 'series',
      description: 'One point per category on the polar grid.',
      statePatch: { seriesType: 'scatter' },
    },
    {
      id: 'rotated',
      label: 'Rotated Start',
      tag: 'layout',
      description: 'Start the first category at 0° instead of the top.',
      statePatch: { startAngle: 0 },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // PR-X16d (Codex 019e3615): ThemeRiverChart preset gallery.
  'theme-river-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Stream graph with the category label on each band.',
      statePatch: {},
    },
    {
      id: 'no-labels',
      label: 'No Band Labels',
      tag: 'layout',
      description: 'Hide the category-name label on each flow band.',
      statePatch: { showLabel: false },
    },
    {
      id: 'compact',
      label: 'Compact Size',
      tag: 'layout',
      description: 'Small size variant for dense dashboard cells.',
      statePatch: { size: 'sm' },
    },
    {
      id: 'static',
      label: 'No Animation',
      tag: 'motion',
      description: 'Render statically — skip the mount animation.',
      statePatch: { animate: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // PR-X16e (Codex 019e365b): GanttChart preset gallery.
  'gantt-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Project-schedule timeline with one task bar per row.',
      statePatch: {},
    },
    {
      id: 'compact',
      label: 'Compact Size',
      tag: 'layout',
      description: 'Small size variant for dense dashboard cells.',
      statePatch: { size: 'sm' },
    },
    {
      id: 'static',
      label: 'No Animation',
      tag: 'motion',
      description: 'Render statically — skip the mount animation.',
      statePatch: { animate: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'sankey-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Horizontal flow diagram with gradient links.',
      statePatch: {},
    },
    {
      id: 'vertical',
      label: 'Vertical',
      tag: 'orientation',
      description: 'Vertical flow layout (top-to-bottom).',
      statePatch: { orient: 'vertical' },
    },
    {
      id: 'source-color',
      label: 'Source-Coloured Links',
      tag: 'color',
      description: 'Colour each link by its source node instead of gradient.',
      statePatch: { lineStyle: 'source' },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Display node legend below the chart.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click + drag no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'sunburst-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Radial hierarchical layout with descendant highlight.',
      statePatch: {},
    },
    {
      id: 'ascending',
      label: 'Ascending Sort',
      tag: 'sort',
      description: 'Sort segments smallest-first instead of descending.',
      statePatch: { sort: 'asc' },
    },
    {
      id: 'ancestor-highlight',
      label: 'Ancestor Highlight',
      tag: 'highlight',
      description: 'Hover lights up the ancestor chain instead of descendants.',
      statePatch: { highlightPolicy: 'ancestor' },
    },
    {
      id: 'self-highlight',
      label: 'Self Highlight',
      tag: 'highlight',
      description: 'Hover lights up only the focused segment.',
      statePatch: { highlightPolicy: 'self' },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Display segment legend below the chart.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // ─────────────────────────────────────────────────────────────────
  // Faz 21.11 P1a-P1d — 3D Extension Pack preset galleries.
  // ─────────────────────────────────────────────────────────────────
  'scatter-3d-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default xyz scatter with auto camera distance.',
      statePatch: {},
    },
    {
      id: 'no-animation',
      label: 'No Animation',
      tag: 'motion',
      description: 'Skip mount animation for snapshot tests + reduced-motion.',
      statePatch: { animate: false },
    },
    {
      id: 'large',
      label: 'Large Size',
      tag: 'size',
      description: 'Wider canvas envelope for dense point clouds.',
      statePatch: { size: 'lg' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override (better contrast on 3D grid).',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'compact',
      label: 'Compact Density',
      tag: 'density',
      description: 'Tighter spacing for embedded dashboards.',
      statePatch: { density: 'compact' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — orbit + click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'surface-3d-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default rectangular grid surface.',
      statePatch: {},
    },
    {
      id: 'no-animation',
      label: 'No Animation',
      tag: 'motion',
      description: 'Skip mount animation for snapshot tests.',
      statePatch: { animate: false },
    },
    {
      id: 'large',
      label: 'Large Size',
      tag: 'size',
      description: 'Wider canvas for finer mesh inspection.',
      statePatch: { size: 'lg' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — orbit no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'lines-3d-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Multiple xyz paths rendered as line3D series.',
      statePatch: {},
    },
    {
      id: 'thick-lines',
      label: 'Thick Lines',
      tag: 'line',
      description: 'Bump lineWidth to 4 for high-contrast paths.',
      statePatch: { lineWidth: 4 },
    },
    {
      id: 'thin-lines',
      label: 'Thin Lines',
      tag: 'line',
      description: 'Drop lineWidth to 1 for dense path bundles.',
      statePatch: { lineWidth: 1 },
    },
    {
      id: 'large',
      label: 'Large Size',
      tag: 'size',
      description: 'Wider canvas for path inspection.',
      statePatch: { size: 'lg' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — orbit no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'globe-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Geo sphere with multi-layer overlay.',
      statePatch: {},
    },
    {
      id: 'no-animation',
      label: 'No Animation',
      tag: 'motion',
      description: 'Skip rotation + mount animation.',
      statePatch: { animate: false },
    },
    {
      id: 'large',
      label: 'Large Size',
      tag: 'size',
      description: 'Wider canvas for high-density layers.',
      statePatch: { size: 'lg' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Dark canvas — better contrast on bright layer overlays.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — orbit + click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // ComboChart (Codex 019e41cd AGREE): dual-axis composite preset gallery.
  'combo-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Bar + line on dual axes — legend, grid, line dots.',
      statePatch: {},
    },
    {
      id: 'with-values',
      label: 'Bar/Point Values',
      tag: 'display',
      description: 'Show the raw value label on every bar and line point.',
      statePatch: { showValues: true },
    },
    {
      id: 'no-legend',
      label: 'No Legend',
      tag: 'layout',
      description: 'Hide the series legend for a denser dashboard cell.',
      statePatch: { showLegend: false },
    },
    {
      id: 'no-dots',
      label: 'No Line Dots',
      tag: 'display',
      description: 'Hide the line-series point markers — cleaner trend line.',
      statePatch: { showDots: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // EffectScatterChart (Codex 019e425b AGREE): standalone effectScatter
  // preset gallery. 6 entries covering the main playground axes:
  // starter, no-grid layout, emphasis-mode interactivity, dark theme,
  // animation off (also zeroes the ripple — vestibular-safe), readonly.
  'effect-scatter-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default ripple animation — render-mode loop, grid on.',
      statePatch: {},
    },
    {
      id: 'no-grid',
      label: 'No Grid',
      tag: 'layout',
      description: 'Cleaner canvas — no axis grid lines.',
      statePatch: { showGrid: false },
    },
    {
      id: 'emphasis',
      label: 'Emphasis Only',
      tag: 'interaction',
      description: 'Ripple fires only on hover / focus — quiet default state.',
      statePatch: { showEffectOn: 'emphasis' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'no-animation',
      label: 'No Animation',
      tag: 'motion',
      description: 'Static render — also zeroes the ripple (vestibular-safe).',
      statePatch: { animate: false },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // Bar3DChart (Codex 019e42c3 AGREE): cartesian3D bar3D preset gallery.
  // 6 entries covering the main playground axes: starter, with-values
  // display, realistic shading, dark theme, no-animation, readonly.
  'bar-3d-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default lambert shading — 12-cell departman × kıdem pivot.',
      statePatch: {},
    },
    {
      id: 'with-values',
      label: 'Bar Values',
      tag: 'display',
      description: 'Show the z-value (ortalama maaş) on top of every 3D bar.',
      statePatch: { showValues: true },
    },
    {
      id: 'realistic',
      label: 'Realistic Shading',
      tag: 'render',
      description: 'PBR-style realistic shading — heavier GL load but glossier bars.',
      statePatch: { shading: 'realistic' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'no-animation',
      label: 'No Animation',
      tag: 'motion',
      description: 'Static render — no entry tween.',
      statePatch: { animate: false },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // PR#2 (Codex 019e3f75): PopulationPyramid preset gallery.
  'population-pyramid': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Diverging horizontal bar — left / right legend + grid.',
      statePatch: {},
    },
    {
      id: 'gendered',
      label: 'Gendered Labels',
      tag: 'labels',
      description: 'HR age × gender use case — Erkek / Kadın series labels.',
      statePatch: { leftLabel: 'Erkek', rightLabel: 'Kadın' },
    },
    {
      id: 'with-values',
      label: 'Bar Values',
      tag: 'display',
      description: 'Show the raw positive headcount label on each bar.',
      statePatch: { showValues: true },
    },
    {
      id: 'no-legend',
      label: 'No Legend',
      tag: 'layout',
      description: 'Hide the left/right legend for a denser dashboard cell.',
      statePatch: { showLegend: false },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // ─────────────────────────────────────────────────────────────────
  // Faz 21.11 PR-Playground-Coverage-2 — fill remaining 3 wrappers
  // (heatmap / waterfall / funnel) that had LIVE_PROP_SUPPORT but no
  // CHART_PRESETS gallery. Mirrors the bar/line/area pattern.
  // ─────────────────────────────────────────────────────────────────
  'heatmap-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default 2D density matrix with auto value range.',
      statePatch: {},
    },
    {
      id: 'with-values',
      label: 'With Values',
      tag: 'labels',
      description: 'Show numeric values inside each cell for precise read.',
      statePatch: { showValues: true },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Display the visualMap legend strip alongside the matrix.',
      statePatch: { showLegend: true },
    },
    {
      id: 'fixed-range',
      label: 'Fixed Range (0-100)',
      tag: 'scale',
      description: 'Pin min/max to absolute scale instead of observed range.',
      statePatch: { min: 0, max: 100 },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'compact',
      label: 'Compact Density',
      tag: 'density',
      description: 'Tighter cell spacing + smaller value labels.',
      statePatch: { density: 'compact' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — cell click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'waterfall-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Vertical waterfall with connector lines + animation.',
      statePatch: {},
    },
    {
      id: 'horizontal',
      label: 'Horizontal',
      tag: 'orientation',
      description: 'Switch to horizontal layout for long-label scenarios.',
      statePatch: { orientation: 'horizontal' },
    },
    {
      id: 'no-connectors',
      label: 'No Connectors',
      tag: 'visual',
      description: 'Hide the connector lines between bars (cleaner stacked look).',
      statePatch: { showConnector: false },
    },
    {
      id: 'with-values',
      label: 'With Values',
      tag: 'labels',
      description: 'Show numeric value labels above each bar segment.',
      statePatch: { showValues: true },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Display the increase/decrease/total legend below the chart.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — bar click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'funnel-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Vertical conversion funnel with descending sort.',
      statePatch: {},
    },
    {
      id: 'horizontal',
      label: 'Horizontal',
      tag: 'orientation',
      description: 'Horizontal layout for embedded sidebar dashboards.',
      statePatch: { orientation: 'horizontal' },
    },
    {
      id: 'ascending',
      label: 'Ascending',
      tag: 'sort',
      description: 'Reverse the conversion direction (smallest stage on top).',
      statePatch: { sort: 'ascending' },
    },
    {
      id: 'no-sort',
      label: 'Original Order',
      tag: 'sort',
      description: 'Preserve insertion order instead of sorting by value.',
      statePatch: { sort: 'none' },
    },
    {
      id: 'with-conversion',
      label: 'With Conversion %',
      tag: 'labels',
      description: 'Show stage-to-stage conversion percentage labels.',
      statePatch: { showConversion: true },
    },
    {
      id: 'labels-outside',
      label: 'Labels Outside',
      tag: 'labels',
      description: 'Move labels outside the funnel for compact bodies.',
      statePatch: { labelPosition: 'outside' },
    },
    {
      id: 'left-aligned',
      label: 'Left-Aligned',
      tag: 'layout',
      description: 'Align funnel to the left edge (common for kanban boards).',
      statePatch: { funnelAlign: 'left' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — segment click no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  // ─────────────────────────────────────────────────────────────────
  // PR-X campaign preset galleries (Codex thread 019e22b6 follow-up):
  // 6 wrappers shipped without playground presets in PR #449; this
  // block closes that gap so Examples tab shows real preset variants
  // for BoxPlot / Candlestick / Pictorial / Parallel / Graph / GeoMap.
  // ─────────────────────────────────────────────────────────────────
  'box-plot-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default vertical box-plot with outliers shown.',
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
      id: 'no-outliers',
      label: 'Without Outliers',
      tag: 'outliers',
      description: 'Hide the outlier scatter overlay — pure quartile boxes.',
      statePatch: { showOutliers: false },
    },
    {
      id: 'no-grid',
      label: 'No Grid',
      tag: 'grid',
      description: 'Hide grid lines for minimalist publication-style charts.',
      statePatch: { showGrid: false },
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
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — click on whisker no-op.',
      statePatch: { access: 'readonly' },
    },
  ],
  'candlestick-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default OHLC candlesticks with bullish/bearish colouring.',
      statePatch: {},
    },
    {
      id: 'no-grid',
      label: 'No Grid',
      tag: 'grid',
      description: 'Hide grid lines.',
      statePatch: { showGrid: false },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Show legend below.',
      statePatch: { showLegend: true },
    },
    {
      id: 'compact',
      label: 'Compact Density',
      tag: 'density',
      description: 'Compact density — tighter bar spacing.',
      statePatch: { density: 'compact' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Dark theme — better contrast on bullish/bearish colours.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive.',
      statePatch: { access: 'readonly' },
    },
  ],
  'pictorial-bar-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Tiled circle symbols repeated per value.',
      statePatch: {},
    },
    {
      id: 'horizontal',
      label: 'Horizontal',
      tag: 'orientation',
      description: 'Horizontal pictogram layout.',
      statePatch: { orientation: 'horizontal' },
    },
    {
      id: 'no-repeat',
      label: 'Single Symbol',
      tag: 'symbol',
      description: 'Render one stretched symbol per bar instead of repeating.',
      statePatch: { symbolRepeat: false },
    },
    {
      id: 'rect-symbol',
      label: 'Rectangle Symbol',
      tag: 'symbol',
      description: 'Use rect symbol for solid block infographic.',
      statePatch: { symbol: 'rect' },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Show legend below.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Explicit dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
  'parallel-coordinates-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default parallel-coordinates with grouped polylines.',
      statePatch: {},
    },
    {
      id: 'no-group',
      label: 'No Grouping',
      tag: 'group',
      description: 'Single colour for every polyline (no groupBy).',
      statePatch: { groupBy: '' },
    },
    {
      id: 'thick-lines',
      label: 'Thick Lines',
      tag: 'line',
      description: 'Increased line width — emphasise each row.',
      statePatch: { lineWidth: 3 },
    },
    {
      id: 'high-opacity',
      label: 'High Opacity',
      tag: 'opacity',
      description: 'Higher line opacity (0.8) — denser overlap visible.',
      statePatch: { lineOpacity: 0.8 },
    },
    {
      id: 'with-legend',
      label: 'With Legend',
      tag: 'legend',
      description: 'Show legend strip for groupBy categories.',
      statePatch: { showLegend: true },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Dark theme override.',
      statePatch: { theme: 'dark' },
    },
  ],
  'graph-chart': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Force-directed layout with arrowed edges and node clustering.',
      statePatch: {},
    },
    {
      id: 'circular',
      label: 'Circular Layout',
      tag: 'layout',
      description: 'Arrange nodes on a ring — good for cycle topologies.',
      statePatch: { layout: 'circular' },
    },
    {
      id: 'undirected',
      label: 'Undirected Graph',
      tag: 'directed',
      description: 'Hide edge arrowheads — symmetric relationship model.',
      statePatch: { directed: false },
    },
    {
      id: 'no-roam',
      label: 'No Pan/Zoom',
      tag: 'roam',
      description: 'Lock camera — static dashboard mode.',
      statePatch: { roam: false },
    },
    {
      id: 'tight-cluster',
      label: 'Tight Cluster',
      tag: 'force',
      description: 'Stronger repulsion pulls nodes closer together.',
      statePatch: { forceRepulsion: 250 },
    },
    {
      id: 'large-nodes',
      label: 'Large Nodes',
      tag: 'size',
      description: 'Bigger default symbol size for readability.',
      statePatch: { defaultSymbolSize: 50 },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Dark theme — high-contrast topology view.',
      statePatch: { theme: 'dark' },
    },
  ],
  'geo-map': [
    {
      id: 'basic',
      label: 'Basic',
      tag: 'starter',
      description: 'Default choropleth with visualMap gradient legend.',
      statePatch: {},
    },
    {
      id: 'with-labels',
      label: 'With Region Labels',
      tag: 'labels',
      description: 'Show region names as labels on the map (denser canvas).',
      statePatch: { showLabels: true },
    },
    {
      id: 'with-bubble-overlay',
      label: 'With Bubble Overlay',
      tag: 'overlay',
      description:
        'Choropleth + city HQ bubbles (PR-X13a). Bubble symbolSize ∝ √value (area-perceptual scale).',
      statePatch: { showBubbleOverlay: true },
    },
    {
      id: 'with-effect-scatter-overlay',
      label: 'With Pulse Overlay',
      tag: 'overlay',
      description:
        'Choropleth + animated pulse on critical points (PR-X13b). Pin marker + radar pulse for highlighted lokasyonlar.',
      statePatch: { showEffectScatterOverlay: true },
    },
    {
      id: 'with-bubble-and-pulse',
      label: 'Bubble + Pulse Combo',
      tag: 'overlay',
      description:
        'Multi-layer demo — silent bubbles for HQ headcount + animated pulse for critical alerts.',
      statePatch: { showBubbleOverlay: true, showEffectScatterOverlay: true },
    },
    {
      id: 'with-flow-overlay',
      label: 'With Flow Overlay',
      tag: 'overlay',
      description:
        'Choropleth + origin-destination flow lines (PR-X13c). Linear width scale by metric + animated trail.',
      statePatch: { showFlowOverlay: true },
    },
    {
      id: 'with-heatmap-overlay',
      label: 'With Density Overlay',
      tag: 'overlay',
      description:
        'Choropleth + smoothed event density blob (PR-X13d). Dedicated heatmap visualMap + alpha-blended pixels.',
      statePatch: { showHeatmapOverlay: true },
    },
    {
      id: 'with-marker-overlay',
      label: 'With Marker Overlay',
      tag: 'overlay',
      description:
        'Choropleth + declarative SVG/icon markers (PR-X13e). Built-in pin/diamond presets + custom path:// SVG with safe-symbol validation.',
      statePatch: { showMarkerOverlay: true },
    },
    {
      id: 'with-all-overlays',
      label: 'All Overlays (5 types)',
      tag: 'overlay',
      description:
        'PR-X13 campaign closure demo — choropleth + HQ bubbles + critical pulse + logistics flow + density heatmap + branch markers (X13a/b/c/d/e all together).',
      statePatch: {
        showBubbleOverlay: true,
        showEffectScatterOverlay: true,
        showFlowOverlay: true,
        showHeatmapOverlay: true,
        showMarkerOverlay: true,
      },
    },
    {
      id: 'no-roam',
      label: 'No Pan/Zoom',
      tag: 'roam',
      description: 'Lock map navigation — static dashboard mode.',
      statePatch: { roam: false },
    },
    {
      id: 'multi-select',
      label: 'Multi-select',
      tag: 'selection',
      description: 'Allow multiple regions to be selected simultaneously.',
      statePatch: { selectedMode: 'multiple' },
    },
    {
      id: 'compact',
      label: 'Compact Density',
      tag: 'density',
      description: 'Compact density — tighter label spacing.',
      statePatch: { density: 'compact' },
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      tag: 'theme',
      description: 'Dark theme — high contrast for population/density maps.',
      statePatch: { theme: 'dark' },
    },
    {
      id: 'readonly',
      label: 'Read-only Access',
      tag: 'access',
      description: 'Visible but non-interactive — region click no-op.',
      statePatch: { access: 'readonly' },
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
