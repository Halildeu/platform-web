/**
 * Unit tests for `chartPlaygroundModel` helpers (Faz 21.8 follow-up,
 * Codex thread `019def27`).
 */
import { describe, it, expect } from 'vitest';
import {
  applyPreset,
  buildDescriptor,
  buildDescriptors,
  deriveDefaults,
  generatePlaygroundCode,
  getBool,
  getCategory,
  getChartPresets,
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
  isLiveEditable,
  parseDefault,
  parseStringLiteralUnion,
  serialisePropToCode,
  type ChartProp,
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
    const showGrid = mkProp({ name: 'showGrid', type: 'boolean', default: 'true' });
    const onClick = mkProp({ name: 'onDataPointClick', type: '(e: any) => void' });
    const dBar = buildDescriptor('bar-chart', showGrid);
    const dCb = buildDescriptor('bar-chart', onClick);
    expect(dBar.liveEditable).toBe(true);
    expect(dBar.readOnlyHint).toBeNull();
    expect(dCb.liveEditable).toBe(false);
    expect(dCb.kind).toBe('complex');
    expect(dCb.readOnlyHint).toMatch(/Code\/API only/);
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
    expect(isLiveEditable('bar-chart', 'animate')).toBe(true);
    expect(isLiveEditable('treemap-chart', 'animate')).toBe(false);
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

  it('returns empty array for charts without presets', () => {
    expect(getChartPresets('treemap-chart')).toEqual([]);
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
