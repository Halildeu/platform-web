/**
 * Unit tests for `chartPlaygroundModel` helpers (Faz 21.8 follow-up,
 * Codex thread `019def27`).
 */
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
    const defaults: Record<string, unknown> = {
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
    // 13 charts × 11 common-axis props = 143 just from common axis.
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
    'bar-chart': 15,
    'line-chart': 16,
    'area-chart': 17,
    'pie-chart': 15,
    'scatter-chart': 18, // PR-A2c-wire: + enableBrush
    'gauge-chart': 19,
    'radar-chart': 16,
    'treemap-chart': 15,
    'heatmap-chart': 15,
    'waterfall-chart': 15,
    'funnel-chart': 19,
    'sankey-chart': 17,
    'sunburst-chart': 14,
  };

  // Per-chart preset-enabled complex prop count from COMPLEX_PROP_PRESETS.
  const PRESET_COUNTS: Record<string, number> = {
    'bar-chart': 3, // valueFormatter, onDataPointClick, colors
    'line-chart': 2, // valueFormatter, onDataPointClick
    'area-chart': 2,
    'pie-chart': 2,
    'scatter-chart': 3, // + colors
    'gauge-chart': 3, // + thresholds
    'radar-chart': 2,
    'treemap-chart': 3, // + onNodeClick
    'heatmap-chart': 4, // + onCellClick + colors
    'waterfall-chart': 2,
    'funnel-chart': 2,
    'sankey-chart': 3, // + onNodeClick
    'sunburst-chart': 3, // + onNodeClick
  };

  // PR-A2c-wire bumped scatter-chart primitives 17 → 18 (`enableBrush`)
  // and added 2 public ScatterChart props (`enableBrush`,
  // `onBrushSelection`) to the catalog → 264 → 266. Coverage:
  // 211 (primitives) + 34 (presets) = 245 / 266 ≈ %92.1.
  const TOTAL_CATALOG_PROPS = 266;
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

  it('system-wide live count (primitives + presets) hits PR-B target (~%92)', () => {
    let primitives = 0;
    for (const chartId of Object.keys(PRIMITIVE_LIVE_COUNTS)) {
      primitives += LIVE_PROP_SUPPORT[chartId]?.size ?? 0;
    }
    expect(primitives).toBe(PRIMITIVE_TOTAL);

    const presets = Object.keys(COMPLEX_PROP_PRESETS).length;
    expect(presets).toBe(PRESET_TOTAL);

    const total = primitives + presets;
    expect(total).toBe(EXPECTED_TOTAL);
    // Coverage floor for PR-B: at least %90 of the catalog (user request).
    expect(total / TOTAL_CATALOG_PROPS).toBeGreaterThanOrEqual(0.9);
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
