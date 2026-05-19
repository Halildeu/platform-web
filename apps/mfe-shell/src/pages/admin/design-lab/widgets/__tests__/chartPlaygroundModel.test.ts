/**
 * Unit tests for `chartPlaygroundModel` helpers (Faz 21.8 follow-up,
 * Codex thread `019def27`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, it, expect } from 'vitest';
import {
  applyPreset,
  buildDescriptor,
  buildDescriptors,
  COMPLEX_PROP_PRESETS,
  decodeBase64Utf8,
  decodePlaygroundState,
  deriveDefaults,
  encodeBase64Utf8,
  encodePlaygroundState,
  generatePlaygroundCode,
  getAnomalyAnnouncementPreset,
  getAnomalySummaryPreset,
  getBool,
  getCallbackPreset,
  getCategory,
  getChartPresets,
  getColorsPreset,
  getDecal,
  getEditorKind,
  getEnum,
  getEnumOptions,
  getFaq,
  getFeatureBadge,
  getMarkupsPreset,
  getNum,
  getOptStr,
  getPerformanceGuidance,
  getSampleData,
  getStr,
  getThresholdsPreset,
  getValueFormatterPreset,
  isLiveEditable,
  LIVE_PROP_SUPPORT,
  parseDefault,
  parseStringLiteralUnion,
  serialisePropToCode,
  type ChartProp,
  type PlaygroundState,
  type PlaygroundValue,
} from '../chartPlaygroundModel';

const mkProp = (over: Partial<ChartProp> = {}): ChartProp => ({
  name: over.name ?? 'sample',
  type: over.type ?? 'string',
  required: over.required ?? false,
  default: over.default ?? '—',
  description: over.description ?? '',
});

/* ================================================================== */
/*  §4f truth source — AST-derived CHART_CATALOG prop counts            */
/* ================================================================== */

/**
 * Resolve ChartDetail.tsx from disk. vitest's `import.meta.url` is not a
 * usable `file:` URL under the jsdom pool, so the file is located relative
 * to `process.cwd()` — the mfe-shell package dir when vitest runs there
 * directly, the monorepo root under the CI `test:workspace` run.
 */
function resolveChartDetailPath(): string {
  const rel = 'src/pages/admin/design-lab/pages/ChartDetail.tsx';
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), 'apps/mfe-shell', rel)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`chartPlaygroundModel.test: ChartDetail.tsx not found (cwd=${process.cwd()})`);
  }
  return found;
}

/**
 * AST-count the `props[]` array length for every chart in ChartDetail.tsx's
 * `CHART_CATALOG`. `CHART_CATALOG` is the single source of truth the Design
 * Lab API tab + playground descriptors render from, but it is a `const`
 * (not exported), so the count-lock reads it via the TypeScript AST.
 *
 * Exists because the old hand-maintained `FULL_CATALOG_PROPS` accumulator
 * silently drifted (378) below the real enrolled-chart catalog (450) — see
 * PR-X16 §4f. Deriving from the AST means the denominator can never drift
 * from `CHART_CATALOG` again.
 */
function countChartCatalogProps(): Record<string, number> {
  const source = readFileSync(resolveChartDetailPath(), 'utf8');
  const sourceFile = ts.createSourceFile(
    'ChartDetail.tsx',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const counts: Record<string, number> = {};

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'CHART_CATALOG' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const entry of node.initializer.properties) {
        if (!ts.isPropertyAssignment(entry)) continue;
        const chartId = ts.isStringLiteralLike(entry.name)
          ? entry.name.text
          : ts.isIdentifier(entry.name)
            ? entry.name.text
            : null;
        if (!chartId || !ts.isObjectLiteralExpression(entry.initializer)) continue;
        for (const member of entry.initializer.properties) {
          if (
            ts.isPropertyAssignment(member) &&
            ts.isIdentifier(member.name) &&
            member.name.text === 'props' &&
            ts.isArrayLiteralExpression(member.initializer)
          ) {
            counts[chartId] = member.initializer.elements.length;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return counts;
}

describe('chartPlaygroundModel — type detection', () => {
  it('identifies primitive editor kinds', () => {
    expect(getEditorKind(mkProp({ type: 'boolean' }))).toBe('boolean');
    expect(getEditorKind(mkProp({ type: 'string' }))).toBe('string');
    expect(getEditorKind(mkProp({ type: 'number' }))).toBe('number');
  });

  it('detects inline string-literal unions as enum', () => {
    expect(getEditorKind(mkProp({ type: "'vertical' | 'horizontal'" }))).toBe('enum');
    expect(getEditorKind(mkProp({ type: '"a" | "b" | "c"' }))).toBe('enum');
  });

  it('detects known type aliases as enum or tristate', () => {
    expect(getEditorKind(mkProp({ type: 'ChartSize' }))).toBe('enum');
    expect(getEditorKind(mkProp({ type: 'ChartThemePreference' }))).toBe('enum');
    // ChartDecalPreference is `boolean | 'auto'` — must be tristate so the
    // wrapper resolver receives a real boolean instead of `Boolean('off')`.
    expect(getEditorKind(mkProp({ type: 'ChartDecalPreference' }))).toBe('tristate');
    expect(getEditorKind(mkProp({ type: 'ChartDensityPreference' }))).toBe('enum');
    expect(getEditorKind(mkProp({ type: 'ChartAccentPreference' }))).toBe('enum');
  });

  it('exposes ChartSize as exactly sm/md/lg (no xl)', () => {
    const opts = getEnumOptions('ChartSize');
    expect(opts?.map((o) => o.value)).toEqual(['sm', 'md', 'lg']);
  });

  it('exposes ChartDecalPreference as auto/true/false (encoded for select)', () => {
    const opts = getEnumOptions('ChartDecalPreference');
    expect(opts?.map((o) => o.value)).toEqual(['auto', 'true', 'false']);
  });

  it('falls back to complex for arrays / functions / unknown structured types', () => {
    expect(getEditorKind(mkProp({ type: 'ChartDataPoint[]' }))).toBe('complex');
    expect(getEditorKind(mkProp({ type: '(value: number) => string' }))).toBe('complex');
    expect(getEditorKind(mkProp({ type: '{ field: string }' }))).toBe('complex');
    expect(getEditorKind(mkProp({ type: 'string[]' }))).toBe('complex');
  });

  it('parses string-literal unions and rejects mixed unions', () => {
    expect(parseStringLiteralUnion("'a' | 'b'")).toEqual(['a', 'b']);
    expect(parseStringLiteralUnion('"x" | "y" | "z"')).toEqual(['x', 'y', 'z']);
    expect(parseStringLiteralUnion("'a' | number")).toBeNull();
    expect(parseStringLiteralUnion('boolean | string')).toBeNull();
    expect(parseStringLiteralUnion("'only-one'")).toBeNull();
  });

  it('returns enum options for the access-level inline union', () => {
    const opts = getEnumOptions('"full" | "readonly" | "disabled" | "hidden"');
    expect(opts).toBeDefined();
    expect(opts?.map((o) => o.value)).toEqual(['full', 'readonly', 'disabled', 'hidden']);
  });
});

describe('chartPlaygroundModel — default parsing', () => {
  it('parses boolean defaults', () => {
    expect(parseDefault(mkProp({ type: 'boolean', default: 'true' }), 'boolean')).toBe(true);
    expect(parseDefault(mkProp({ type: 'boolean', default: 'false' }), 'boolean')).toBe(false);
  });

  it('parses number defaults and rejects non-numeric', () => {
    expect(parseDefault(mkProp({ type: 'number', default: '72' }), 'number')).toBe(72);
    expect(parseDefault(mkProp({ type: 'number', default: 'foo' }), 'number')).toBeUndefined();
  });

  it('extracts the first quoted token from string/enum defaults', () => {
    expect(parseDefault(mkProp({ type: 'string', default: '"vertical"' }), 'enum')).toBe(
      'vertical',
    );
    expect(
      parseDefault(
        mkProp({
          type: 'ChartThemePreference',
          default:
            '"auto" — follows documentElement signals (data-appearance / data-theme / media)',
        }),
        'enum',
      ),
    ).toBe('auto');
  });

  it('returns undefined for missing / em-dash / undefined sentinels', () => {
    expect(parseDefault(mkProp({ default: '—' }), 'string')).toBeUndefined();
    expect(parseDefault(mkProp({ default: 'undefined' }), 'string')).toBeUndefined();
    expect(parseDefault(mkProp({ default: '' }), 'string')).toBeUndefined();
  });

  it('returns undefined for complex props regardless of default', () => {
    expect(parseDefault(mkProp({ default: '{ a: 1 }' }), 'complex')).toBeUndefined();
  });
});

describe('chartPlaygroundModel — categorization', () => {
  it('routes data props to data', () => {
    expect(getCategory(mkProp({ name: 'data' }))).toBe('data');
    expect(getCategory(mkProp({ name: 'series' }))).toBe('data');
    expect(getCategory(mkProp({ name: 'value' }))).toBe('data');
  });

  it('routes display props to display', () => {
    expect(getCategory(mkProp({ name: 'showGrid' }))).toBe('display');
    expect(getCategory(mkProp({ name: 'orientation' }))).toBe('display');
    expect(getCategory(mkProp({ name: 'animate' }))).toBe('display');
  });

  it('routes theme props to theme', () => {
    expect(getCategory(mkProp({ name: 'theme' }))).toBe('theme');
    expect(getCategory(mkProp({ name: 'accent' }))).toBe('theme');
    expect(getCategory(mkProp({ name: 'colors' }))).toBe('theme');
  });

  it('routes access props to access', () => {
    expect(getCategory(mkProp({ name: 'access' }))).toBe('access');
    expect(getCategory(mkProp({ name: 'accessReason' }))).toBe('access');
  });

  it('falls back to advanced', () => {
    expect(getCategory(mkProp({ name: 'title' }))).toBe('advanced');
    expect(getCategory(mkProp({ name: 'onDataPointClick' }))).toBe('advanced');
  });
});

describe('chartPlaygroundModel — descriptor + defaults', () => {
  it('marks supported props live and unsupported read-only', () => {
    // PR-FE-Playground-3 absorb: `onDataPointClick` is now a preset-mapped
    // complex prop (live editable via dropdown). Switch to `innerLabel`
    // (React.ReactNode, no preset) for the read-only path.
    const showGrid = mkProp({ name: 'showGrid', type: 'boolean', default: 'true' });
    const innerLabel = mkProp({ name: 'innerLabel', type: 'React.ReactNode' });
    const dBar = buildDescriptor('bar-chart', showGrid);
    const dInner = buildDescriptor('pie-chart', innerLabel);
    expect(dBar.liveEditable).toBe(true);
    expect(dBar.readOnlyHint).toBeNull();
    expect(dInner.liveEditable).toBe(false);
    expect(dInner.kind).toBe('complex');
    expect(dInner.readOnlyHint).toMatch(/Code\/API only/);
  });

  it('respects sidecar default overrides', () => {
    const value = mkProp({ name: 'value', type: 'number', default: '—' });
    const d = buildDescriptor('gauge-chart', value);
    expect(d.defaultValue).toBe(72);
  });

  it('derives defaults from descriptors and skips empty values', () => {
    const props: ChartProp[] = [
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
      mkProp({ name: 'title', type: 'string', default: 'undefined' }),
      mkProp({ name: 'orientation', type: "'vertical' | 'horizontal'", default: '"vertical"' }),
    ];
    const descriptors = buildDescriptors('bar-chart', props);
    const defaults = deriveDefaults(descriptors);
    expect(defaults).toEqual({ animate: true, orientation: 'vertical' });
  });

  it('flags chart ids without a live-prop entry as fully read-only', () => {
    // Faz 21.10 PR-FE-Playground-2: every known chart now has at least the
    // common-axis primitives, so the original `treemap-chart.animate=false`
    // case is no longer representative — `treemap-chart.animate` is now
    // live. Use an unknown chartId to assert the fallback path, plus a
    // complex prop on a known chart to assert non-live props stay false.
    expect(isLiveEditable('bar-chart', 'animate')).toBe(true);
    expect(isLiveEditable('treemap-chart', 'animate')).toBe(true);
    expect(isLiveEditable('treemap-chart', 'data')).toBe(false);
    expect(isLiveEditable('unknown-chart', 'animate')).toBe(false);
  });
});

describe('chartPlaygroundModel — codegen serialisation', () => {
  it('omits boolean values matching the default', () => {
    const d = buildDescriptor(
      'bar-chart',
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
    );
    expect(serialisePropToCode(d, true)).toBeNull();
  });

  it('emits bare prop name when boolean differs from default false/undefined', () => {
    const d = buildDescriptor(
      'bar-chart',
      mkProp({ name: 'showValues', type: 'boolean', default: 'false' }),
    );
    expect(serialisePropToCode(d, true)).toBe('showValues');
  });

  it('emits explicit `={false}` when boolean is off and default is true', () => {
    const d = buildDescriptor(
      'bar-chart',
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
    );
    expect(serialisePropToCode(d, false)).toBe('animate={false}');
  });

  it('emits string/enum values with quotes and escapes embedded quotes', () => {
    const d = buildDescriptor(
      'bar-chart',
      mkProp({ name: 'title', type: 'string', default: 'undefined' }),
    );
    expect(serialisePropToCode(d, 'My Chart')).toBe('title="My Chart"');
    expect(serialisePropToCode(d, 'a "quoted" word')).toBe('title="a \\"quoted\\" word"');
  });

  it('emits numbers with curly braces', () => {
    const d = buildDescriptor(
      'gauge-chart',
      mkProp({ name: 'value', type: 'number', default: '—' }),
    );
    expect(serialisePropToCode(d, 50)).toBe('value={50}');
    // sidecar default is 72 → 72 should be omitted
    expect(serialisePropToCode(d, 72)).toBeNull();
  });

  it('omits complex props entirely', () => {
    const d = buildDescriptor('bar-chart', mkProp({ name: 'data', type: 'ChartDataPoint[]' }));
    expect(serialisePropToCode(d, undefined)).toBeNull();
  });

  it('renders a legacy snippet when no chartId is passed (no scaffold preamble)', () => {
    const props: ChartProp[] = [
      mkProp({ name: 'data', type: 'ChartDataPoint[]', required: true }),
      mkProp({ name: 'showValues', type: 'boolean', default: 'false' }),
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
      mkProp({ name: 'orientation', type: "'vertical' | 'horizontal'", default: '"vertical"' }),
    ];
    const descriptors = buildDescriptors('bar-chart', props);
    const code = generatePlaygroundCode('BarChart', descriptors, {
      showValues: true,
      animate: false,
      orientation: 'horizontal',
    });
    expect(code).toBe(
      [
        '<BarChart',
        '  data={sampleData}',
        '  showValues',
        '  animate={false}',
        '  orientation="horizontal"',
        '/>',
      ].join('\n'),
    );
  });

  it('emits compile-ready preamble when chartId scaffold exists (bar-chart)', () => {
    const props: ChartProp[] = [
      mkProp({ name: 'data', type: 'ChartDataPoint[]', required: true }),
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
    ];
    const descriptors = buildDescriptors('bar-chart', props);
    const code = generatePlaygroundCode('BarChart', descriptors, { animate: false }, 'bar-chart');
    // Preamble defines `const sampleData = [...]` before the chart usage.
    expect(code.startsWith('const sampleData = [')).toBe(true);
    expect(code).toContain("{ label: 'Ocak', value: 320 }");
    // Snippet still references the local var, not a free-floating identifier.
    expect(code).toContain('  data={sampleData}');
    expect(code).toContain('  animate={false}');
    // The catalog-declared `data` prop is NOT emitted as a duplicate prop
    // line by the descriptor walker — the scaffold owns it.
    const dataLines = code.split('\n').filter((l) => /^\s*data=/.test(l));
    expect(dataLines).toHaveLength(1);
  });

  it('emits multiple consts for charts with auxiliary props (line-chart)', () => {
    const props: ChartProp[] = [
      mkProp({ name: 'series', type: 'ChartSeries[]', required: true }),
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
    ];
    const descriptors = buildDescriptors('line-chart', props);
    const code = generatePlaygroundCode('LineChart', descriptors, {}, 'line-chart');
    expect(code).toContain('const series = [');
    expect(code).toContain('const labels = [');
    expect(code).toContain('  series={series}');
    expect(code).toContain('  labels={labels}');
  });
});

describe('chartPlaygroundModel — sample data', () => {
  it('returns scaffold for known chart ids', () => {
    const bar = getSampleData('bar-chart');
    expect(bar?.scaffold[0].propName).toBe('data');
    expect(bar?.scaffold[0].varName).toBe('sampleData');
    expect(bar?.scaffold[0].jsLiteral).toContain("label: 'Ocak'");
  });

  it('exposes auxiliary props for series-based charts', () => {
    const line = getSampleData('line-chart');
    expect(line?.auxiliaryProps?.[0].propName).toBe('labels');
    expect(line?.auxiliaryProps?.[0].varName).toBe('labels');
    const area = getSampleData('area-chart');
    expect(area?.auxiliaryProps?.[0].propName).toBe('labels');
  });

  it('returns null for unknown chart ids', () => {
    expect(getSampleData('non-existent-chart')).toBeNull();
  });
});

describe('chartPlaygroundModel — typed accessors', () => {
  it('reads booleans with backwards-compat for legacy string encoding', () => {
    expect(getBool({ a: true }, 'a', false)).toBe(true);
    expect(getBool({ a: 'true' }, 'a', false)).toBe(true);
    expect(getBool({ a: 'false' }, 'a', true)).toBe(false);
    expect(getBool({}, 'missing', true)).toBe(true);
  });

  it('reads enum/string values with fallback', () => {
    expect(getEnum({ k: 'dark' }, 'k', 'auto' as const)).toBe('dark');
    expect(getEnum({}, 'k', 'auto' as const)).toBe('auto');
    expect(getEnum({ k: '' }, 'k', 'auto' as const)).toBe('auto');
    expect(getStr({ k: 'hello' }, 'k', 'fallback')).toBe('hello');
    expect(getStr({ k: '' }, 'k', 'fallback')).toBe('fallback');
  });

  it('reads numbers with fallback for non-numeric / missing', () => {
    expect(getNum({ a: 42 }, 'a', 0)).toBe(42);
    expect(getNum({ a: '7' }, 'a', 0)).toBe(7);
    expect(getNum({ a: 'oops' }, 'a', 99)).toBe(99);
    expect(getNum(undefined, 'a', 5)).toBe(5);
  });

  it('decodes tristate decal back to boolean | "auto"', () => {
    // The select stores literal strings; getDecal must NOT round-trip them
    // through `Boolean(...)` (would turn "false" into true and break decal).
    expect(getDecal({ decal: 'auto' }, 'decal')).toBe('auto');
    expect(getDecal({ decal: 'true' }, 'decal')).toBe(true);
    expect(getDecal({ decal: 'false' }, 'decal')).toBe(false);
    expect(getDecal({ decal: true }, 'decal')).toBe(true);
    expect(getDecal({ decal: false }, 'decal')).toBe(false);
    expect(getDecal({}, 'decal')).toBe('auto');
    expect(getDecal({}, 'decal', true)).toBe(true);
  });

  it('returns undefined for empty optional strings', () => {
    expect(getOptStr({ desc: 'hi' }, 'desc')).toBe('hi');
    expect(getOptStr({ desc: '' }, 'desc')).toBeUndefined();
    expect(getOptStr({}, 'desc')).toBeUndefined();
    expect(getOptStr(undefined, 'desc')).toBeUndefined();
  });
});

describe('chartPlaygroundModel — tristate codegen', () => {
  const decalProp = (): ChartProp => ({
    name: 'decal',
    type: 'ChartDecalPreference',
    required: false,
    default: '"auto"',
    description: 'Decal pattern override.',
  });

  it('omits "auto" (matches default)', () => {
    const d = buildDescriptor('bar-chart', decalProp());
    expect(d.kind).toBe('tristate');
    expect(serialisePropToCode(d, 'auto')).toBeNull();
  });

  it('emits bare prop for "true" (decal on)', () => {
    const d = buildDescriptor('bar-chart', decalProp());
    expect(serialisePropToCode(d, 'true')).toBe('decal');
  });

  it('emits explicit `={false}` for "false" (decal off)', () => {
    const d = buildDescriptor('bar-chart', decalProp());
    expect(serialisePropToCode(d, 'false')).toBe('decal={false}');
  });

  it('drops unexpected tristate values', () => {
    const d = buildDescriptor('bar-chart', decalProp());
    expect(serialisePropToCode(d, 'on')).toBeNull();
    expect(serialisePropToCode(d, 'off')).toBeNull();
  });

  it('renders a full prop list with decal tri-state in generatePlaygroundCode', () => {
    const props: ChartProp[] = [
      mkProp({ name: 'data', type: 'ChartDataPoint[]', required: true }),
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
      decalProp(),
    ];
    const descriptors = buildDescriptors('bar-chart', props);
    const codeOff = generatePlaygroundCode('BarChart', descriptors, {
      animate: true, // matches default → omitted
      decal: 'false', // tri-state off → decal={false}
    });
    expect(codeOff).toContain('decal={false}');
    expect(codeOff).not.toContain('animate');

    const codeOn = generatePlaygroundCode('BarChart', descriptors, {
      animate: false, // off, default true → animate={false}
      decal: 'true', // tri-state on → bare prop
    });
    expect(codeOn).toContain('animate={false}');
    expect(codeOn).toContain('decal');
    expect(codeOn).not.toContain('decal=');
  });
});

describe('chartPlaygroundModel — preset gallery', () => {
  it('returns BarChart presets including basic + horizontal + dark + readonly', () => {
    const presets = getChartPresets('bar-chart');
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('basic');
    expect(ids).toContain('horizontal');
    expect(ids).toContain('with-values');
    expect(ids).toContain('with-legend');
    expect(ids).toContain('dark');
    expect(ids).toContain('compact');
    expect(ids).toContain('readonly');
  });

  it('returns LineChart / AreaChart / PieChart / ScatterChart / GaugeChart presets', () => {
    expect(getChartPresets('line-chart').length).toBeGreaterThanOrEqual(3);
    expect(getChartPresets('area-chart').length).toBeGreaterThanOrEqual(3);
    expect(getChartPresets('pie-chart').length).toBeGreaterThanOrEqual(3);
    expect(getChartPresets('scatter-chart').length).toBeGreaterThanOrEqual(2);
    expect(getChartPresets('gauge-chart').length).toBeGreaterThanOrEqual(4);
  });

  // Faz 21.11 PR-Playground-Coverage: 8 hierarchical / flow / 3D
  // wrappers (radar, treemap, sankey, sunburst + scatter3d, surface3d,
  // lines3d, globe) gained preset galleries so the Examples tab renders
  // a non-empty grid for every chart wrapper added in PR-A2 batch3 +
  // P1 3D pack.
  it('returns presets for hierarchical / flow / 3D wrappers (PR-Playground-Coverage)', () => {
    expect(getChartPresets('radar-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('treemap-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('sankey-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('sunburst-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('scatter-3d-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('surface-3d-chart').length).toBeGreaterThanOrEqual(4);
    expect(getChartPresets('lines-3d-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('globe-chart').length).toBeGreaterThanOrEqual(4);
  });

  // Faz 21.11 PR-Playground-Coverage-2: heatmap / waterfall / funnel
  // gained preset galleries so all 17 chart wrappers (12 2D + 4 3D + 1
  // gauge) render a non-empty Examples gallery. Locks the contract that
  // every wrapper with LIVE_PROP_SUPPORT also has CHART_PRESETS.
  it('returns presets for heatmap / waterfall / funnel wrappers (PR-Playground-Coverage-2)', () => {
    expect(getChartPresets('heatmap-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('waterfall-chart').length).toBeGreaterThanOrEqual(5);
    expect(getChartPresets('funnel-chart').length).toBeGreaterThanOrEqual(5);
  });

  it('returns empty array for non-existent charts (no preset wired)', () => {
    expect(getChartPresets('non-existent-chart')).toEqual([]);
  });

  it('every BarChart preset declares a label + description (gallery card requirements)', () => {
    for (const preset of getChartPresets('bar-chart')) {
      expect(preset.label).toBeTruthy();
      expect(preset.description).toBeTruthy();
    }
  });

  it("BarChart 'basic' preset has empty patch (defaults preserved)", () => {
    const preset = getChartPresets('bar-chart').find((p) => p.id === 'basic')!;
    expect(preset.statePatch).toEqual({});
  });

  it("BarChart 'horizontal' preset only patches orientation", () => {
    const preset = getChartPresets('bar-chart').find((p) => p.id === 'horizontal')!;
    expect(preset.statePatch).toEqual({ orientation: 'horizontal' });
  });

  it("GaugeChart 'low' preset overrides value (number patch)", () => {
    const preset = getChartPresets('gauge-chart').find((p) => p.id === 'low')!;
    expect(preset.statePatch.value).toBe(15);
  });

  it('applyPreset shallow-merges patch over defaults', () => {
    const defaults: PlaygroundState = {
      showGrid: true,
      animate: true,
      orientation: 'vertical',
    };
    const result = applyPreset(defaults, {
      id: 'horiz',
      label: 'Horizontal',
      description: 'turn it sideways',
      statePatch: { orientation: 'horizontal' },
    });
    expect(result.orientation).toBe('horizontal');
    expect(result.showGrid).toBe(true);
    expect(result.animate).toBe(true);
    // Returned object is a new reference (caller can mutate freely).
    expect(result).not.toBe(defaults);
  });

  it('preset state patch flows through generatePlaygroundCode for compile-ready output', () => {
    const props: ChartProp[] = [
      mkProp({ name: 'data', type: 'ChartDataPoint[]', required: true }),
      mkProp({ name: 'orientation', type: "'vertical' | 'horizontal'", default: '"vertical"' }),
      mkProp({ name: 'animate', type: 'boolean', default: 'true' }),
    ];
    const descriptors = buildDescriptors('bar-chart', props);
    const defaults = deriveDefaults(descriptors);
    const horizontalPreset = getChartPresets('bar-chart').find((p) => p.id === 'horizontal')!;
    const presetState = applyPreset(defaults, horizontalPreset);
    const code = generatePlaygroundCode('BarChart', descriptors, presetState, 'bar-chart');
    expect(code).toContain('orientation="horizontal"');
    // Default-matching props (animate=true) are omitted.
    expect(code).not.toContain('animate');
  });
});

describe('chartPlaygroundModel — feature badges', () => {
  it('returns null for cross-filter (promoted to stable after the 13-chart rollout sweep)', () => {
    // Previously this returned a `beta` badge with a "Faz 22" tooltip.
    // PR #338 wired all 13 chart adapters through the canonical
    // `ChartClickEvent` contract and PR #339 surfaced the badge on
    // every chart. Live testai smoke (13/13 BETA → 0 BETA after this
    // change) + 38 new tests close the BETA → stable promotion gate.
    expect(getFeatureBadge('cross-filter')).toBeNull();
  });

  it('returns null for stable features so the chip strip stays clean', () => {
    expect(getFeatureBadge('animation')).toBeNull();
    expect(getFeatureBadge('axe-gated')).toBeNull();
    expect(getFeatureBadge('tree-shake-gated')).toBeNull();
    expect(getFeatureBadge('non-existent')).toBeNull();
  });
});

describe('chartPlaygroundModel — performance guidance + FAQ', () => {
  it('exposes a non-empty performance playbook with labels + bodies', () => {
    const guidance = getPerformanceGuidance();
    expect(guidance.length).toBeGreaterThan(0);
    for (const item of guidance) {
      expect(item.label).toBeTruthy();
      expect(item.body).toBeTruthy();
    }
  });

  it('covers the canonical scaling concerns', () => {
    const guidance = getPerformanceGuidance();
    const labels = guidance.map((g) => g.label.toLowerCase()).join(' ');
    expect(labels).toMatch(/large series|2,000|2k/);
    expect(labels).toMatch(/animation|reduced motion/);
    expect(labels).toMatch(/dashboard|lazy/);
    expect(labels).toMatch(/bundle|tree[- ]shake/);
  });

  it('exposes a non-empty FAQ with question + answer pairs', () => {
    const faq = getFaq();
    expect(faq.length).toBeGreaterThan(0);
    for (const entry of faq) {
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.answer.length).toBeGreaterThan(0);
    }
  });

  it('FAQ covers theme=auto, decal, colors-vs-accent, access ladder, and valueFormatter', () => {
    const faq = getFaq()
      .map((e) => e.question.toLowerCase())
      .join(' ');
    expect(faq).toContain('auto');
    expect(faq).toContain('decal');
    expect(faq).toContain('colors');
    expect(faq).toContain('access');
    expect(faq).toContain('valueformatter');
  });
});

/* ================================================================== */
/*  URL persistence (Faz 21.10 PR-FE-Playground-1, Codex 019e0d02)    */
/* ================================================================== */

describe('chartPlaygroundModel — Base64 UTF-8 helpers', () => {
  it('round-trips ASCII strings', () => {
    expect(decodeBase64Utf8(encodeBase64Utf8('hello world'))).toBe('hello world');
  });

  it('round-trips Turkish characters that would crash plain btoa', () => {
    const sample = 'İş gücü Ağırlık Şirket Çankaya Ümraniye';
    expect(decodeBase64Utf8(encodeBase64Utf8(sample))).toBe(sample);
    // Sanity check: plain btoa would throw on these characters.
    expect(() => btoa(sample)).toThrow();
  });

  it('round-trips emoji', () => {
    const sample = '🚀📊📈 chart playground';
    expect(decodeBase64Utf8(encodeBase64Utf8(sample))).toBe(sample);
  });

  it('handles long strings without call-stack overflow (chunked encode)', () => {
    const sample = 'A'.repeat(100_000);
    const round = decodeBase64Utf8(encodeBase64Utf8(sample));
    expect(round.length).toBe(sample.length);
    expect(round).toBe(sample);
  });
});

describe('chartPlaygroundModel — encodePlaygroundState / decodePlaygroundState', () => {
  const defaults: PlaygroundState = {
    showValues: false,
    showGrid: true,
    title: 'Bar Chart',
    size: 'md',
  };
  const validKeys: ReadonlySet<string> = new Set([
    'showValues',
    'showGrid',
    'title',
    'size',
    'orientation',
    'theme',
  ]);

  it('returns null when state matches defaults (URL stays clean)', () => {
    expect(encodePlaygroundState({ ...defaults }, defaults)).toBeNull();
  });

  it('encodes only the diff vs defaults', () => {
    const encoded = encodePlaygroundState({ ...defaults, showValues: true }, defaults);
    expect(encoded).not.toBeNull();
    const decoded = decodePlaygroundState(encoded, defaults, validKeys);
    expect(decoded.showValues).toBe(true);
    // Untouched defaults preserved on round-trip merge.
    expect(decoded.showGrid).toBe(true);
    expect(decoded.title).toBe('Bar Chart');
  });

  it('round-trips Turkish title without crashing (REVISE fix)', () => {
    const stateWithTr: PlaygroundState = { ...defaults, title: 'İş gücü dağılımı' };
    const encoded = encodePlaygroundState(stateWithTr, defaults);
    expect(encoded).not.toBeNull();
    const decoded = decodePlaygroundState(encoded, defaults, validKeys);
    expect(decoded.title).toBe('İş gücü dağılımı');
  });

  it('round-trips emoji in string props', () => {
    const stateWithEmoji: PlaygroundState = { ...defaults, title: '📊 Grafik 🚀' };
    const encoded = encodePlaygroundState(stateWithEmoji, defaults);
    const decoded = decodePlaygroundState(encoded, defaults, validKeys);
    expect(decoded.title).toBe('📊 Grafik 🚀');
  });

  it('falls back to defaults on malformed base64', () => {
    const decoded = decodePlaygroundState('!!!not-base64!!!', defaults, validKeys);
    expect(decoded).toEqual(defaults);
  });

  it('falls back to defaults on invalid JSON inside valid base64', () => {
    const decoded = decodePlaygroundState(btoa('not-json'), defaults, validKeys);
    expect(decoded).toEqual(defaults);
  });

  it('returns defaults when encoded is null (no URL param)', () => {
    expect(decodePlaygroundState(null, defaults, validKeys)).toEqual(defaults);
  });

  it('filters out cross-chart stale keys (bar-chart link pasted into pie-chart)', () => {
    // bar-chart user encoded `orientation` + `donut` (donut belongs to pie).
    const stateWithLeak = {
      ...defaults,
      orientation: 'horizontal' as PlaygroundValue,
      donut: true as PlaygroundValue,
    };
    const encoded = encodePlaygroundState(stateWithLeak, defaults);
    // Pie-chart's validKeys lacks `donut` (and validKeys above lacks it too).
    const decoded = decodePlaygroundState(encoded, defaults, validKeys);
    expect(decoded.orientation).toBe('horizontal');
    expect((decoded as Record<string, PlaygroundValue>).donut).toBeUndefined();
  });

  it('LIVE_PROP_SUPPORT entries match props actually forwarded by ChartPreviewLive', () => {
    // Smoke-level invariant: every chartId in LIVE_PROP_SUPPORT exposes only
    // primitive editor kinds (boolean/string/number/enum/tristate). Complex
    // props leak past `liveEditable` only via descriptor builder.
    const sankey: ChartProp[] = [
      { name: 'title', type: 'string', required: false, default: '—', description: '' },
      { name: 'size', type: 'ChartSize', required: false, default: '"md"', description: '' },
      {
        name: 'theme',
        type: 'ChartThemePreference',
        required: false,
        default: '"auto"',
        description: '',
      },
      {
        name: 'decal',
        type: 'ChartDecalPreference',
        required: false,
        default: '"auto"',
        description: '',
      },
      {
        name: 'density',
        type: 'ChartDensityPreference',
        required: false,
        default: '"auto"',
        description: '',
      },
      {
        name: 'accent',
        type: 'ChartAccentPreference',
        required: false,
        default: '"auto"',
        description: '',
      },
      {
        name: 'access',
        type: '"full" | "readonly" | "disabled" | "hidden"',
        required: false,
        default: '"full"',
        description: '',
      },
    ];
    const descriptors = buildDescriptors('sankey-chart', sankey);
    // Every prop SankeyChart's LIVE_PROP_SUPPORT exposes should be liveEditable now.
    for (const d of descriptors) {
      expect(isLiveEditable('sankey-chart', d.prop.name)).toBe(true);
      expect(d.liveEditable).toBe(true);
    }
  });
});

/* ================================================================== */
/*  PR-FE-Playground-2: common-axis coverage invariants                */
/* ================================================================== */

describe('chartPlaygroundModel — LIVE_PROP_SUPPORT common-axis coverage', () => {
  // Every chart in the catalog must expose the same baseline set of
  // primitive props so the playground is consistent across chart types.
  // Complex props (data/series/callbacks/colors/thresholds) intentionally
  // stay read-only here — they are addressed via the preset infrastructure
  // in a follow-up PR.
  const ALL_CHART_IDS = [
    'bar-chart',
    'line-chart',
    'area-chart',
    'pie-chart',
    'scatter-chart',
    'gauge-chart',
    'radar-chart',
    'treemap-chart',
    'tree-chart',
    // PR-X16b — CalendarHeatmap (ECharts Depth campaign second wrapper).
    'calendar-heatmap',
    // PR-X16c — PolarChart (ECharts Depth campaign third wrapper).
    'polar-chart',
    // PR-X16d — ThemeRiverChart (ECharts Depth campaign fourth wrapper).
    'theme-river-chart',
    // PR-X16e — GanttChart (ECharts Depth campaign fifth wrapper).
    'gantt-chart',
    // PR#2 — PopulationPyramid (HR demographic pyramid, Codex 019e3f75).
    'population-pyramid',
    'heatmap-chart',
    'waterfall-chart',
    'funnel-chart',
    'sankey-chart',
    'sunburst-chart',
  ];
  const COMMON_AXIS = [
    'title',
    'description',
    'className',
    'theme',
    'decal',
    'density',
    'accent',
    'access',
    'accessReason',
    'size',
    'animate',
  ];

  it.each(ALL_CHART_IDS)('chart "%s" exposes the full common axis as live editable', (chartId) => {
    for (const prop of COMMON_AXIS) {
      expect(isLiveEditable(chartId, prop)).toBe(true);
    }
  });

  it('unknown chart ids fall through to read-only', () => {
    for (const prop of COMMON_AXIS) {
      expect(isLiveEditable('does-not-exist', prop)).toBe(false);
    }
  });

  it('per-chart live-editable count matches the manual coverage uplift target', () => {
    // Sanity bounds — exact numbers shift as we add chart-specific
    // primitives, but the system-wide total should be well above the
    // pre-PR baseline of 73. Lower bound is conservative (PR-A floor),
    // upper bound is sensible cap (no chart accidentally adds 30+ entries).
    let total = 0;
    for (const chartId of ALL_CHART_IDS) {
      const count = COMMON_AXIS.filter((p) => isLiveEditable(chartId, p)).length;
      expect(count).toBe(COMMON_AXIS.length);
      total += count;
    }
    // 19 charts × 11 common-axis props = 209 just from common axis.
    expect(total).toBe(ALL_CHART_IDS.length * COMMON_AXIS.length);
  });
});

/* ================================================================== */
/*  PR-FE-Playground-2: per-chart exact live-count + system total      */
/*  (Codex 019e0ddf REVISE finding #4 — assert real coverage target)   */
/* ================================================================== */

describe('chartPlaygroundModel — exact per-chart live count (PR-B target lock)', () => {
  // PR-FE-Playground-3 lifts the count by adding `preset` editor kind for
  // complex props (valueFormatter, onDataPointClick / onNodeClick /
  // onCellClick, colors, gauge.thresholds). These preset-driven props are
  // live-editable via the dropdown and `isLiveEditable` returns true thanks
  // to the COMPLEX_PROP_PRESETS lookup — so the per-chart count below
  // counts (a) the LIVE_PROP_SUPPORT primitive set + (b) preset-mapped
  // complex props for that chartId.
  const PRIMITIVE_LIVE_COUNTS: Record<string, number> = {
    'bar-chart': 21, // PR-X16 §4f.1: + stacked/showBackground/barGap/barCategoryGap/valueAxisMin/valueAxisMax
    'line-chart': 18, // PR-X16 §4f.1: + step/connectNulls
    'area-chart': 19, // PR-X16 §4f.1: + step/connectNulls
    'pie-chart': 16, // PR-X16 §4f.1: + roseType
    'scatter-chart': 21, // PR-A2c-wire: + enableBrush; §4f.1: + large/largeThreshold/crossFilterRequired
    'gauge-chart': 19,
    'radar-chart': 16,
    'treemap-chart': 15,
    'tree-chart': 19, // PR-X16a: 19 primitives (valueFormatter/onDataPointClick are preset-driven)
    'calendar-heatmap': 17, // PR-X16b: 11 common-axis + orient/startOfWeek/showValues/showVisualMap/min/max
    'polar-chart': 17, // PR-X16c: 11 common-axis + seriesType/startAngle/showAngleAxisLabel/showRadiusAxisLabel/min/max
    'theme-river-chart': 12, // PR-X16d: 11 common-axis + showLabel (ThemeRiverChart has no enum / axis-label / scale props)
    'gantt-chart': 11, // PR-X16e: 11 common-axis only (GanttChart has no enum / axis-label / scale / showLabel props)
    'population-pyramid': 17, // PR#2: 11 common-axis + showValues/showGrid/showLegend/leftLabel/rightLabel/maxValue
    'heatmap-chart': 15,
    'waterfall-chart': 15,
    'funnel-chart': 19,
    'sankey-chart': 17,
    'sunburst-chart': 14,
  };

  // Per-chart preset-enabled complex prop count from COMPLEX_PROP_PRESETS.
  // Every enrolled chart except Gauge carries the anomaly a11y pair
  // (anomalySummary + formatAnomalyAnnouncement) = +2 each — 18 of the 19
  // enrolled charts. Gauge has no anomaly catalog pair → unchanged.
  const PRESET_COUNTS: Record<string, number> = {
    'bar-chart': 7, // vF, onDPC, colors; §4f.2: + markups/onMarkupClick; §4f.3: + anomaly pair
    'line-chart': 6, // vF, onDPC; §4f.2: + markups/onMarkupClick; §4f.3: + anomaly pair
    'area-chart': 6, // §4f.2: + markups/onMarkupClick; §4f.3: + anomaly pair
    'pie-chart': 4, // vF, onDPC; §4f.3: + anomaly pair
    'scatter-chart': 8, // + colors; §4f.2: + markups/onMarkupClick/onBrushSelection; §4f.3: + anomaly pair
    'gauge-chart': 3, // + thresholds — no anomaly catalog pair, §4f.3 skips Gauge
    'radar-chart': 4, // vF, onDPC; §4f.3: + anomaly pair
    'treemap-chart': 5, // + onNodeClick; §4f.3: + anomaly pair
    'tree-chart': 4, // PR-X16a: vF + onDPC; §4f.3: + anomaly pair
    'calendar-heatmap': 5, // PR-X16b: vF + onDPC + colors; §4f.3: + anomaly pair
    'polar-chart': 4, // PR-X16c: vF + onDPC; §4f.3: + anomaly pair
    'theme-river-chart': 4, // PR-X16d: vF + onDPC; §4f.3: + anomaly pair
    'gantt-chart': 4, // PR-X16e: vF + onDPC; §4f.3: + anomaly pair
    'heatmap-chart': 8, // + onCellClick + colors; §4f.2: + markups/onMarkupClick; §4f.3: + anomaly pair
    'waterfall-chart': 6, // §4f.2: + markups/onMarkupClick; §4f.3: + anomaly pair
    'funnel-chart': 4, // vF, onDPC; §4f.3: + anomaly pair
    'sankey-chart': 5, // + onNodeClick; §4f.3: + anomaly pair
    'sunburst-chart': 5, // + onNodeClick; §4f.3: + anomaly pair
    'population-pyramid': 7, // PR#2: vF + onDPC + colors + markups + onMarkupClick + anomaly pair
  };

  // ---- §4f live-surface coverage lock --------------------------------
  //
  // Measures Design Lab Playground live-surface coverage: of every
  // catalog prop an enrolled chart exposes, how many are live-editable in
  // the playground (a LIVE_PROP_SUPPORT primitive or a COMPLEX_PROP_PRESETS
  // entry).
  //
  // Enrolled set — 19 charts: the 13 core wrappers + the 5 PR-X16 depth
  // charts (tree / calendar-heatmap / polar / theme-river / gantt) + the
  // PopulationPyramid wrapper (Codex thread `019e3f75`, PR#2). The PR-X12+
  // campaign charts (graph / geo-map / box-plot / candlestick /
  // pictorial-bar / parallel-coordinates) are intentionally NOT enrolled.
  //
  // DENOMINATOR — honest, AST-derived (PR-X16 §4f.0). `DERIVED_CATALOG_PROPS`
  // sums `CHART_CATALOG[id].props.length` over the enrolled charts, counted
  // from ChartDetail.tsx via the TypeScript AST. The old hand-maintained
  // `FULL_CATALOG_PROPS` accumulator had silently drifted (378) below the
  // real enrolled-chart catalog — AST-deriving means the denominator can
  // never drift from `CHART_CATALOG` again.
  //
  // One sample-input surface per enrolled chart is excluded: a chart's
  // dataset is supplied by SAMPLE_DATA scaffolds, never by a live
  // primitive/preset, so it can never be in the numerator (one prop per
  // chart, 19 total). A few charts express their sample input as more
  // than one catalog prop (series+labels, nodes+links) — those extra
  // input props stay in the denominator, only making the gate more
  // conservative.
  //
  // HARD GATE (PR-X16 §4f.4 — sprint close). The §4f coverage sprint
  // landed: §4f.1 +14 primitives, §4f.2 +13 markup/brush presets, §4f.3
  // +34 anomaly a11y presets; PR#2 then enrolled PopulationPyramid (+17
  // primitives, +7 presets, +25 catalog props). Honest live-surface
  // coverage is now 417 / 456 ≈ 91.4%, clearing the 0.9 target — the gate
  // runs directly on the honest AST-derived 456 denominator below.
  const ENROLLED_CHART_IDS = Object.keys(PRIMITIVE_LIVE_COUNTS);
  const CATALOG_PROP_COUNTS = countChartCatalogProps();
  const DERIVED_CATALOG_PROPS = ENROLLED_CHART_IDS.reduce(
    (sum, id) => sum + (CATALOG_PROP_COUNTS[id] ?? 0),
    0,
  );
  const EXCLUDED_SAMPLE_INPUTS = ENROLLED_CHART_IDS.length;
  const HONEST_LIVE_SURFACE_DENOMINATOR = DERIVED_CATALOG_PROPS - EXCLUDED_SAMPLE_INPUTS;
  // Hard 0.9 coverage floor — ceil(0.9 × 456) = 411. EXPECTED_TOTAL must
  // stay at or above this; the per-chart counts above are exact-locked.
  const HARD_COVERAGE_FLOOR = Math.ceil(0.9 * HONEST_LIVE_SURFACE_DENOMINATOR);
  const PRIMITIVE_TOTAL = Object.values(PRIMITIVE_LIVE_COUNTS).reduce((a, b) => a + b, 0);
  const PRESET_TOTAL = Object.values(PRESET_COUNTS).reduce((a, b) => a + b, 0);
  const EXPECTED_TOTAL = PRIMITIVE_TOTAL + PRESET_TOTAL;

  it.each(Object.entries(PRIMITIVE_LIVE_COUNTS))(
    'chart "%s" LIVE_PROP_SUPPORT primitive set size = %i',
    (chartId, expected) => {
      expect(LIVE_PROP_SUPPORT[chartId]?.size).toBe(expected);
    },
  );

  it.each(Object.entries(PRESET_COUNTS))(
    'chart "%s" exposes %i preset-driven props via COMPLEX_PROP_PRESETS',
    (chartId, expected) => {
      const presetKeys = Object.keys(COMPLEX_PROP_PRESETS).filter((k) =>
        k.startsWith(`${chartId}.`),
      );
      expect(presetKeys.length).toBe(expected);
    },
  );

  it('system-wide live count — primitive + preset totals match the lock', () => {
    let primitives = 0;
    for (const chartId of Object.keys(PRIMITIVE_LIVE_COUNTS)) {
      primitives += LIVE_PROP_SUPPORT[chartId]?.size ?? 0;
    }
    expect(primitives).toBe(PRIMITIVE_TOTAL);

    const presets = Object.keys(COMPLEX_PROP_PRESETS).length;
    expect(presets).toBe(PRESET_TOTAL);

    const total = primitives + presets;
    expect(total).toBe(EXPECTED_TOTAL);
  });

  it('honest catalog-derived live-surface coverage — hard 0.9 gate (PR-X16 §4f.4)', () => {
    // Every enrolled chart must resolve to a CHART_CATALOG entry — a
    // missing id would silently under-count the honest denominator.
    for (const id of ENROLLED_CHART_IDS) {
      expect(CATALOG_PROP_COUNTS[id], `CHART_CATALOG missing "${id}"`).toBeGreaterThan(0);
    }
    // Denominator AST-counted from ChartDetail.tsx CHART_CATALOG — drift
    // from the real catalog now fails CI instead of hiding behind a
    // hand-maintained accumulator.
    expect(DERIVED_CATALOG_PROPS).toBe(475);
    expect(EXCLUDED_SAMPLE_INPUTS).toBe(19);
    expect(HONEST_LIVE_SURFACE_DENOMINATOR).toBe(456);
    // HARD GATE (PR-X16 §4f.4 + PR#2). Honest coverage is 417 / 456 ≈
    // 91.4%. EXPECTED_TOTAL must stay at/above the 0.9 floor (411 =
    // ceil(0.9 × 456)) and the ratio must clear 0.9 — a real coverage
    // regression (removing a preset or primitive) now fails CI.
    expect(HARD_COVERAGE_FLOOR).toBe(411);
    expect(EXPECTED_TOTAL).toBeGreaterThanOrEqual(HARD_COVERAGE_FLOOR);
    expect(EXPECTED_TOTAL / HONEST_LIVE_SURFACE_DENOMINATOR).toBeGreaterThanOrEqual(0.9);
  });
});

/* ================================================================== */
/*  PR-FE-Playground-3: preset infrastructure tests                    */
/* ================================================================== */

describe('chartPlaygroundModel — preset infrastructure (PR-B)', () => {
  it('valueFormatter preset resolves currency-tl correctly', () => {
    const fn = getValueFormatterPreset('currency-tl');
    expect(fn).toBeDefined();
    expect(fn?.(1234.5)).toBe('₺1.234,5');
  });

  it('valueFormatter preset resolves percentage correctly', () => {
    const fn = getValueFormatterPreset('percentage');
    expect(fn?.(0.456)).toBe('45.6%');
  });

  it('valueFormatter preset resolves compact correctly', () => {
    const fn = getValueFormatterPreset('compact');
    expect(fn?.(2500)).toBe('2.5K');
    expect(fn?.(42)).toBe('42');
  });

  it('valueFormatter preset returns undefined for raw / unknown / undefined', () => {
    expect(getValueFormatterPreset('raw')).toBeUndefined();
    expect(getValueFormatterPreset(undefined)).toBeUndefined();
    expect(getValueFormatterPreset('does-not-exist')).toBeUndefined();
  });

  it('callback preset returns side-effecting handler for console-log', () => {
    const fn = getCallbackPreset<{ x: number }>('console-log');
    expect(fn).toBeDefined();
    expect(typeof fn).toBe('function');
  });

  it('callback preset returns undefined for noop / unknown', () => {
    expect(getCallbackPreset('noop')).toBeUndefined();
    expect(getCallbackPreset(undefined)).toBeUndefined();
  });

  it('colors preset returns rainbow palette', () => {
    const palette = getColorsPreset('rainbow');
    expect(Array.isArray(palette)).toBe(true);
    expect(palette?.length).toBeGreaterThan(0);
  });

  it('colors preset returns undefined for default / unknown', () => {
    expect(getColorsPreset('default')).toBeUndefined();
    expect(getColorsPreset(undefined)).toBeUndefined();
  });

  it('thresholds preset returns traffic-light by default', () => {
    const t = getThresholdsPreset(undefined);
    expect(t).toEqual([
      { value: 30, color: '#ef4444' },
      { value: 70, color: '#f59e0b' },
      { value: 100, color: '#22c55e' },
    ]);
  });

  it('thresholds preset returns two-tier on demand', () => {
    const t = getThresholdsPreset('two-tier');
    expect(t?.length).toBe(2);
  });

  it('buildDescriptor upgrades complex prop with preset to kind=preset, liveEditable=true', () => {
    const formatterProp: ChartProp = {
      name: 'valueFormatter',
      type: '(value: number) => string',
      required: false,
      default: '—',
      description: '',
    };
    const d = buildDescriptor('bar-chart', formatterProp);
    expect(d.kind).toBe('preset');
    expect(d.liveEditable).toBe(true);
    expect(d.options.length).toBeGreaterThan(0);
    expect(d.defaultValue).toBe('raw'); // first preset id
  });

  it('isLiveEditable returns true for preset-mapped complex prop', () => {
    expect(isLiveEditable('bar-chart', 'valueFormatter')).toBe(true);
    expect(isLiveEditable('gauge-chart', 'thresholds')).toBe(true);
    expect(isLiveEditable('heatmap-chart', 'onCellClick')).toBe(true);
  });

  it('isLiveEditable returns false for complex prop WITHOUT preset', () => {
    expect(isLiveEditable('pie-chart', 'innerLabel')).toBe(false); // React.ReactNode, no preset
    expect(isLiveEditable('treemap-chart', 'data')).toBe(false); // sample data preset deferred to PR-B2
  });

  it('serialisePropToCode skips preset props in generated code', () => {
    const formatterProp: ChartProp = {
      name: 'valueFormatter',
      type: '(value: number) => string',
      required: false,
      default: '—',
      description: '',
    };
    const d = buildDescriptor('bar-chart', formatterProp);
    expect(serialisePropToCode(d, 'currency-tl')).toBeNull();
  });
});

/* ================================================================== */
/*  PR-X16 §4f.2: markup overlay preset resolver                       */
/* ================================================================== */

describe('chartPlaygroundModel — markup preset resolver (§4f.2)', () => {
  const GENUINE_MARKUP_CHARTS = [
    'bar-chart',
    'line-chart',
    'area-chart',
    'scatter-chart',
    'heatmap-chart',
    'waterfall-chart',
    // PR#2 (Codex 019e3f75): PopulationPyramid — its wrapper calls
    // useMarkupAdapter + fires onMarkupClick (genuine-markup chart).
    'population-pyramid',
  ];
  const MARKUP_VARIANTS = ['threshold-line', 'highlight-band', 'kpi-label'];

  it('getMarkupsPreset returns undefined for none / undefined / unenrolled chart / unknown id', () => {
    expect(getMarkupsPreset('none', 'bar-chart')).toBeUndefined();
    expect(getMarkupsPreset(undefined, 'bar-chart')).toBeUndefined();
    // pie / gauge / radar / treemap / funnel / sankey / sunburst markups
    // are a documented NO-OP — those charts are deliberately not enrolled.
    expect(getMarkupsPreset('threshold-line', 'pie-chart')).toBeUndefined();
    expect(getMarkupsPreset('threshold-line', 'gauge-chart')).toBeUndefined();
    expect(getMarkupsPreset('does-not-exist', 'bar-chart')).toBeUndefined();
  });

  it('getMarkupsPreset resolves every variant for all seven genuine-markup charts', () => {
    for (const chartId of GENUINE_MARKUP_CHARTS) {
      for (const preset of MARKUP_VARIANTS) {
        const result = getMarkupsPreset(preset, chartId);
        expect(result, `${chartId}.${preset}`).toHaveLength(1);
        // Every markup carries a stable id (ECharts click-lookup key).
        expect(result?.[0].id, `${chartId}.${preset} id`).toBeTruthy();
      }
    }
  });

  it('getMarkupsPreset threshold-line is a numeric y-axis LineMarkup for cartesian charts', () => {
    for (const chartId of [
      'bar-chart',
      'line-chart',
      'area-chart',
      'scatter-chart',
      'waterfall-chart',
    ]) {
      const m = getMarkupsPreset('threshold-line', chartId)?.[0];
      expect(m?.type, chartId).toBe('line');
      if (m?.type === 'line') {
        expect(m.axis, chartId).toBe('y');
        expect(typeof m.value, chartId).toBe('number');
      }
    }
  });

  it('getMarkupsPreset uses categorical-string anchors for the heatmap (no numeric axis)', () => {
    const threshold = getMarkupsPreset('threshold-line', 'heatmap-chart')?.[0];
    expect(threshold?.type).toBe('line');
    if (threshold?.type === 'line') expect(typeof threshold.value).toBe('string');

    const band = getMarkupsPreset('highlight-band', 'heatmap-chart')?.[0];
    expect(band?.type).toBe('area');
    if (band?.type === 'area') {
      expect(typeof band.from).toBe('string');
      expect(typeof band.to).toBe('string');
    }

    const label = getMarkupsPreset('kpi-label', 'heatmap-chart')?.[0];
    expect(label?.type).toBe('label');
    if (label?.type === 'label') {
      expect(label.anchor).toHaveProperty('xLabel');
      expect(label.anchor).toHaveProperty('yLabel');
    }
  });

  it('getMarkupsPreset uses numeric x-axis anchors for the population pyramid', () => {
    // The pyramid is a horizontal diverging bar — the value axis is `x`
    // (numeric, symmetric), the category axis is `y` (age bands). The
    // axis-mirror of the bar / line / area `axis: 'y'` cartesian anchors.
    const threshold = getMarkupsPreset('threshold-line', 'population-pyramid')?.[0];
    expect(threshold?.type).toBe('line');
    if (threshold?.type === 'line') {
      expect(threshold.axis).toBe('x');
      expect(typeof threshold.value).toBe('number');
    }

    const band = getMarkupsPreset('highlight-band', 'population-pyramid')?.[0];
    expect(band?.type).toBe('area');
    if (band?.type === 'area') {
      expect(band.axis).toBe('x');
      expect(typeof band.from).toBe('number');
      expect(typeof band.to).toBe('number');
    }

    const label = getMarkupsPreset('kpi-label', 'population-pyramid')?.[0];
    expect(label?.type).toBe('label');
    if (label?.type === 'label') {
      // Explicit-coordinate `{ x, y }` anchor — x is the numeric value
      // axis, y is the age-band category (the `{ dataIndex }` anchor is a
      // documented v1 NO-OP on this chart).
      expect(label.anchor).toHaveProperty('x');
      expect(label.anchor).toHaveProperty('y');
    }
  });

  it('buildDescriptor upgrades the markups complex prop to a preset control', () => {
    const markupsProp: ChartProp = {
      name: 'markups',
      type: 'ChartMarkup[]',
      required: false,
      default: 'undefined',
      description: '',
    };
    const d = buildDescriptor('bar-chart', markupsProp);
    expect(d.kind).toBe('preset');
    expect(d.liveEditable).toBe(true);
    expect(d.defaultValue).toBe('none'); // first preset id
    expect(d.options.map((o) => o.value)).toContain('threshold-line');
  });

  it('isLiveEditable is true for markup props on enrolled charts, false on NO-OP charts', () => {
    expect(isLiveEditable('bar-chart', 'markups')).toBe(true);
    expect(isLiveEditable('waterfall-chart', 'onMarkupClick')).toBe(true);
    expect(isLiveEditable('scatter-chart', 'onBrushSelection')).toBe(true);
    // pie / gauge markups are a NO-OP — not enrolled, so not live.
    expect(isLiveEditable('pie-chart', 'markups')).toBe(false);
    expect(isLiveEditable('gauge-chart', 'onMarkupClick')).toBe(false);
  });
});

/* ================================================================== */
/*  PR-X16 §4f.3: anomaly a11y preset resolvers                        */
/* ================================================================== */

describe('chartPlaygroundModel — anomaly a11y preset resolvers (§4f.3)', () => {
  const ANOMALY_CHARTS = [
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
  ];

  it('getAnomalySummaryPreset returns undefined for none / undefined / Gauge / unknown id', () => {
    expect(getAnomalySummaryPreset('none', 'bar-chart')).toBeUndefined();
    expect(getAnomalySummaryPreset(undefined, 'bar-chart')).toBeUndefined();
    // Gauge has no anomaly catalog pair — deliberately not enrolled in §4f.3.
    expect(getAnomalySummaryPreset('one-outlier', 'gauge-chart')).toBeUndefined();
    expect(getAnomalySummaryPreset('does-not-exist', 'bar-chart')).toBeUndefined();
  });

  it('getAnomalySummaryPreset returns 1 summary for one-outlier, 3 for multi-outlier', () => {
    expect(getAnomalySummaryPreset('one-outlier', 'bar-chart')).toHaveLength(1);
    expect(getAnomalySummaryPreset('multi-outlier', 'bar-chart')).toHaveLength(3);
  });

  it('getAnomalySummaryPreset resolves valid AnomalySummary[] for all 18 enrolled charts', () => {
    for (const chartId of ANOMALY_CHARTS) {
      const summaries = getAnomalySummaryPreset('multi-outlier', chartId);
      expect(summaries, chartId).toHaveLength(3);
      for (const s of summaries ?? []) {
        // Every required AnomalySummary field must be populated.
        expect(s.id, `${chartId} id`).toBeTruthy();
        expect(typeof s.formattedY, `${chartId} formattedY`).toBe('string');
        expect(['above', 'below']).toContain(s.direction);
        expect(['high', 'medium']).toContain(s.severityBucket);
        expect(s.ariaLabel, `${chartId} ariaLabel`).toBeTruthy();
      }
    }
  });

  it('getAnomalySummaryPreset emits kind-aware summaries for radar / hierarchical / sankey', () => {
    const radar = getAnomalySummaryPreset('one-outlier', 'radar-chart')?.[0];
    expect(radar?.kind).toBe('radar');
    expect(radar?.indicatorName).toBeTruthy();

    const tree = getAnomalySummaryPreset('one-outlier', 'tree-chart')?.[0];
    expect(tree?.kind).toBe('hierarchical');
    expect(Array.isArray(tree?.path)).toBe(true);

    const sankey = getAnomalySummaryPreset('one-outlier', 'sankey-chart')?.[0];
    expect(sankey?.kind).toBe('sankey-edge');
    expect(sankey?.source).toBeTruthy();
    expect(sankey?.target).toBeTruthy();

    // Flat charts carry no kind discriminator (legacy flat template).
    expect(getAnomalySummaryPreset('one-outlier', 'bar-chart')?.[0].kind).toBeUndefined();
  });

  it('getAnomalyAnnouncementPreset returns undefined for default / undefined / unknown', () => {
    expect(getAnomalyAnnouncementPreset('default')).toBeUndefined();
    expect(getAnomalyAnnouncementPreset(undefined)).toBeUndefined();
    expect(getAnomalyAnnouncementPreset('does-not-exist')).toBeUndefined();
  });

  it('getAnomalyAnnouncementPreset terse / verbose return working formatters', () => {
    const summaries = getAnomalySummaryPreset('multi-outlier', 'bar-chart')!;
    const terse = getAnomalyAnnouncementPreset('terse');
    expect(typeof terse).toBe('function');
    expect(terse!(summaries, 'tr')).toBe('3 anomali');
    expect(terse!([], 'tr')).toBe('');

    const verbose = getAnomalyAnnouncementPreset('verbose');
    expect(typeof verbose).toBe('function');
    expect(verbose!(summaries, 'tr-TR')).toContain('3 anomali');
    expect(verbose!(summaries, 'en-US')).toContain('3 anomalies');
    expect(verbose!([], 'en')).toBe('');
  });

  it('buildDescriptor upgrades the anomaly pair to preset controls', () => {
    const summaryProp: ChartProp = {
      name: 'anomalySummary',
      type: 'AnomalySummary[]',
      required: false,
      default: 'undefined',
      description: '',
    };
    const fmtProp: ChartProp = {
      name: 'formatAnomalyAnnouncement',
      type: 'AnomalyAnnouncementFormatter',
      required: false,
      default: 'undefined',
      description: '',
    };
    const dS = buildDescriptor('bar-chart', summaryProp);
    expect(dS.kind).toBe('preset');
    expect(dS.liveEditable).toBe(true);
    expect(dS.defaultValue).toBe('none');
    const dF = buildDescriptor('bar-chart', fmtProp);
    expect(dF.kind).toBe('preset');
    expect(dF.liveEditable).toBe(true);
    expect(dF.defaultValue).toBe('default');
  });

  it('isLiveEditable is true for the anomaly pair on enrolled charts, false on Gauge', () => {
    expect(isLiveEditable('bar-chart', 'anomalySummary')).toBe(true);
    expect(isLiveEditable('sankey-chart', 'formatAnomalyAnnouncement')).toBe(true);
    expect(isLiveEditable('gauge-chart', 'anomalySummary')).toBe(false);
    expect(isLiveEditable('gauge-chart', 'formatAnomalyAnnouncement')).toBe(false);
  });
});
