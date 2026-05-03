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

export type EditorKind = 'boolean' | 'enum' | 'tristate' | 'string' | 'number' | 'complex';

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
    'theme',
    'decal',
    'density',
    'accent',
    'access',
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
    'theme',
    'decal',
    'density',
    'accent',
    'access',
  ]),
  'pie-chart': new Set([
    'donut',
    'showLabels',
    'showLegend',
    'showPercentage',
    'animate',
    'size',
    'title',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
  ]),
  'scatter-chart': new Set([
    'size',
    'title',
    'xLabel',
    'yLabel',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
  ]),
  'gauge-chart': new Set([
    'size',
    'title',
    'value',
    'min',
    'max',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
  ]),
};

export function isLiveEditable(chartId: string, propName: string): boolean {
  const allowList = LIVE_PROP_SUPPORT[chartId];
  if (!allowList) return false;
  return allowList.has(propName);
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
  const kind = getEditorKind(prop);
  const category = getCategory(prop);
  const live = kind !== 'complex' && isLiveEditable(chartId, prop.name);
  const overrideKey = `${chartId}.${prop.name}`;
  const overrideDefault = PLAYGROUND_DEFAULT_OVERRIDES[overrideKey];
  const defaultValue = overrideDefault !== undefined ? overrideDefault : parseDefault(prop, kind);
  const options = kind === 'enum' || kind === 'tristate' ? (getEnumOptions(prop.type) ?? []) : [];

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
