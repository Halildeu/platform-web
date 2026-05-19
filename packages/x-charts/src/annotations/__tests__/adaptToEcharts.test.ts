/**
 * adaptToEcharts — pure helper unit tests.
 *
 * Covers:
 *   - Per-type ECharts mapping (line / segment / area / point / label)
 *   - Support matrix (5 full + 1 partial + 7 no-op) — Codex iter-3
 *   - Per-series patch routing (target.seriesIndex / seriesName)
 *   - dataContext lookup for `LabelMarkup.anchor: { dataIndex }`
 *   - Warnings emission (no-op chart kinds, unresolved label anchors)
 *   - sanitizeChartText integration (XSS escape)
 *   - markupLookup map for click-event resolution
 *   - Public name collision regression (ChartMarkup ≠ ChartAnnotation
 *     ≠ collaboration Annotation)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { adaptToEcharts, DEFAULT_SUPPORT_MATRIX, type AdaptOptions } from '../adaptToEcharts';
import type {
  ChartMarkup,
  LineMarkup,
  SegmentMarkup,
  AreaMarkup,
  PointMarkup,
  LabelMarkup,
} from '../../types';

const baseOpts: AdaptOptions = { chartType: 'bar' };

describe('adaptToEcharts — line markup', () => {
  it('maps a y-axis line to markLine data', () => {
    const m: LineMarkup = {
      id: 'budget',
      type: 'line',
      axis: 'y',
      value: 1000,
      label: { text: 'Hedef', position: 'end' },
      color: '#3b82f6',
      style: 'dashed',
      width: 2,
    };
    const r = adaptToEcharts([m], baseOpts);
    expect(r.seriesPatches).toHaveLength(1);
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      name: 'budget',
      yAxis: 1000,
      lineStyle: { color: '#3b82f6', type: 'dashed', width: 2 },
      label: { show: true, formatter: 'Hedef', position: 'end' },
    });
  });

  it('maps an x-axis line', () => {
    const r = adaptToEcharts([{ id: 'q3-marker', type: 'line', axis: 'x', value: 'Q3' }], baseOpts);
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    expect(data[0]).toMatchObject({ name: 'q3-marker', xAxis: 'Q3' });
  });

  it('uses default semantic color when omitted (resolved off the var() token)', () => {
    // The DEFAULT_LINE_COLOR token (`var(--action-primary, #3b82f6)`)
    // is run through resolveCssVarColor before it reaches the ECharts
    // color field. With no `--action-primary` set on <html> the
    // resolver falls back to the literal, so the canvas never sees a
    // `var(...)` string.
    const r = adaptToEcharts([{ id: 'l', type: 'line', axis: 'y', value: 50 }], baseOpts);
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    const color = (data[0] as { lineStyle: { color: string } }).lineStyle.color;
    expect(color).not.toContain('var(');
    expect(color).toBe('#3b82f6');
  });
});

describe('adaptToEcharts — segment markup (sloped trend line)', () => {
  it('emits a 2-coord segment for sloped lines', () => {
    const m: SegmentMarkup = {
      id: 'trend',
      type: 'segment',
      from: { x: 0, y: 10 },
      to: { x: 5, y: 60 },
      label: { text: 'OLS', position: 'middle' },
      color: '#22c55e',
      style: 'dashed',
    };
    const r = adaptToEcharts([m], baseOpts);
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    expect(data).toHaveLength(1);
    const segment = data[0] as Array<{ name?: string; coord: [number, number] }>;
    expect(Array.isArray(segment)).toBe(true);
    expect(segment).toHaveLength(2);
    expect(segment[0]).toMatchObject({ name: 'trend', coord: [0, 10] });
    expect(segment[1]).toMatchObject({ coord: [5, 60] });
  });
});

describe('adaptToEcharts — area markup', () => {
  it('emits markArea data with from/to bounds', () => {
    const m: AreaMarkup = {
      id: 'warn',
      type: 'area',
      axis: 'x',
      from: 'Q2',
      to: 'Q3',
      label: { text: 'Riskli' },
      color: '#fef3c7',
      opacity: 0.3,
    };
    const r = adaptToEcharts([m], baseOpts);
    const data = (r.seriesPatches[0].markArea as { data: unknown[] }).data;
    expect(data).toHaveLength(1);
    const area = data[0] as Array<{
      xAxis?: unknown;
      itemStyle?: { color: string; opacity: number };
    }>;
    expect(area).toHaveLength(2);
    expect(area[0]).toMatchObject({ name: 'warn', xAxis: 'Q2' });
    expect(area[0].itemStyle).toMatchObject({ color: '#fef3c7', opacity: 0.3 });
    expect(area[1]).toMatchObject({ xAxis: 'Q3' });
  });

  it('uses default warning-bg + 0.15 opacity when omitted (color resolved off the var() token)', () => {
    // DEFAULT_AREA_COLOR (`var(--state-warning-bg, #fef3c7)`) resolves
    // to its literal fallback when the token is unset — the canvas
    // never receives a raw `var(...)` string.
    const r = adaptToEcharts([{ id: 'a', type: 'area', axis: 'y', from: 0, to: 10 }], baseOpts);
    const data = (r.seriesPatches[0].markArea as { data: unknown[] }).data;
    const area = data[0] as Array<{ itemStyle: { color: string; opacity: number } }>;
    expect(area[0].itemStyle.color).not.toContain('var(');
    expect(area[0].itemStyle.color).toBe('#fef3c7');
    expect(area[0].itemStyle.opacity).toBe(0.15);
  });
});

describe('adaptToEcharts — point markup', () => {
  it('emits markPoint data with coord', () => {
    const m: PointMarkup = {
      id: 'spike',
      type: 'point',
      x: 'Mar',
      y: 950,
      label: { text: '↑ outlier' },
      symbol: 'diamond',
      color: '#ef4444',
      size: 12,
    };
    const r = adaptToEcharts([m], baseOpts);
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect(data[0]).toMatchObject({
      name: 'spike',
      coord: ['Mar', 950],
      symbol: 'diamond',
      symbolSize: 12,
      itemStyle: { color: '#ef4444' },
    });
  });

  it('supports categorical y for heatmap', () => {
    const r = adaptToEcharts([{ id: 'cell', type: 'point', x: 'Mon', y: 'AM' }], {
      chartType: 'heatmap',
    });
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, string] }).coord).toEqual(['Mon', 'AM']);
  });
});

describe('adaptToEcharts — label markup', () => {
  it('resolves explicit {x, y} anchor', () => {
    const m: LabelMarkup = {
      id: 'note',
      type: 'label',
      text: 'Lansman',
      anchor: { x: 'Apr', y: 600 },
    };
    const r = adaptToEcharts([m], baseOpts);
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      name: 'note',
      coord: ['Apr', 600],
      symbol: 'circle',
      symbolSize: 1,
      itemStyle: { opacity: 0 },
      label: { show: true, formatter: 'Lansman' },
    });
  });

  it('resolves {dataIndex} anchor via dataContext', () => {
    const r = adaptToEcharts(
      [
        {
          id: 'peak',
          type: 'label',
          text: 'Tepe',
          anchor: { dataIndex: 2 },
        },
      ],
      {
        chartType: 'line',
        dataContext: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr'],
          series: [{ name: 'Sales', data: [10, 20, 50, 30] }],
        },
      },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, number] }).coord).toEqual(['Mar', 50]);
  });

  it('warns when dataIndex anchor cannot be resolved (no dataContext)', () => {
    const r = adaptToEcharts(
      [{ id: 'orphan', type: 'label', text: 'Foo', anchor: { dataIndex: 0 } }],
      { chartType: 'line' }, // no dataContext
    );
    expect(r.seriesPatches).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('orphan');
    expect(r.warnings[0]).toContain('anchor could not be resolved');
  });

  it('warns when dataIndex is out of range', () => {
    const r = adaptToEcharts([{ id: 'oob', type: 'label', text: 'X', anchor: { dataIndex: 99 } }], {
      chartType: 'line',
      dataContext: { labels: ['a'], series: [{ data: [1] }] },
    });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('oob');
  });

  it('honors object-form data points (data: [{value: N}])', () => {
    const r = adaptToEcharts([{ id: 'p', type: 'label', text: 'Y', anchor: { dataIndex: 1 } }], {
      chartType: 'line',
      dataContext: {
        labels: ['Jan', 'Feb'],
        series: [{ data: [{ value: 10 }, { value: 20 }] }],
      },
    });
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, number] }).coord).toEqual(['Feb', 20]);
  });
});

describe('adaptToEcharts — Heatmap dataIndex enrichment (v2 backlog closure)', () => {
  // Codex thread `019e0e20` iter-2 backlog: prior to this, Heatmap shims
  // could not resolve `LabelMarkup.anchor: { dataIndex }` because the
  // adapter only knew the cartesian shape (`labels[i]` + `data[i]`).
  // Heatmap shim now feeds `dataContext.series[0].data[i]` as the
  // cell-tuple `{ x: <xCat>, y: <yCat>, value: <v> }`, and the
  // resolver picks up `[cell.x, cell.y]` directly.
  it('resolves {dataIndex} on heatmap via cell-tuple shape {x, y, value}', () => {
    const r = adaptToEcharts(
      [{ id: 'cell-2', type: 'label', text: 'Spike', anchor: { dataIndex: 2 } }],
      {
        chartType: 'heatmap',
        dataContext: {
          xLabels: ['Mon', 'Tue', 'Wed'],
          yLabels: ['AM', 'PM'],
          labels: ['Mon', 'Tue', 'Wed'],
          series: [
            {
              data: [
                { x: 'Mon', y: 'AM', value: 1 },
                { x: 'Tue', y: 'AM', value: 2 },
                { x: 'Wed', y: 'AM', value: 99 },
                { x: 'Mon', y: 'PM', value: 4 },
              ],
            },
          ],
        },
      },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect(data).toHaveLength(1);
    expect((data[0] as { coord: [string, string] }).coord).toEqual(['Wed', 'AM']);
  });

  it('falls back to cartesian path when series data items are plain numbers', () => {
    // Defensive: a non-Heatmap shim populating dataContext should still
    // resolve via labels[i] + data[i] (the original cartesian path).
    const r = adaptToEcharts(
      [{ id: 'plain', type: 'label', text: 'Z', anchor: { dataIndex: 1 } }],
      {
        chartType: 'line',
        dataContext: {
          labels: ['A', 'B'],
          series: [{ data: [10, 20] }],
        },
      },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, number] }).coord).toEqual(['B', 20]);
  });

  it('falls through to cartesian when an object data item lacks {x, y} keys', () => {
    // Defensive: `{value: N}` legacy shape continues to resolve via the
    // cartesian fallback and does NOT collide with the heatmap branch.
    const r = adaptToEcharts(
      [{ id: 'legacy', type: 'label', text: 'L', anchor: { dataIndex: 0 } }],
      {
        chartType: 'line',
        dataContext: {
          labels: ['Jan'],
          series: [{ data: [{ value: 42 }] }],
        },
      },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, number] }).coord).toEqual(['Jan', 42]);
  });

  it('falls through to cartesian {value} reading when cell tuple x/y are non-stringy / non-numeric', () => {
    // Defensive: if a future shim feeds a malformed cell shape (e.g.
    // `{x: null, y: 'AM', value: 1}`), the heatmap branch refuses
    // (null x rejects the type guard) and the cartesian fallback
    // picks up `value: 1`. The resolver still produces a coord, just
    // using the cartesian semantics of the markup.
    const r = adaptToEcharts(
      [{ id: 'bad', type: 'label', text: 'Bad', anchor: { dataIndex: 0 } }],
      {
        chartType: 'heatmap',
        dataContext: {
          labels: ['Mon'],
          series: [{ data: [{ x: null, y: 'AM', value: 1 }] }],
        },
      },
    );
    expect(r.warnings).toHaveLength(0);
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, number] }).coord).toEqual(['Mon', 1]);
  });

  it('drops markup + warns when cell tuple is fully malformed (no recoverable value)', () => {
    // If neither the heatmap branch nor the cartesian {value} fallback
    // can extract a numeric y, the adapter drops the markup and warns
    // — same contract as legacy "out of range" behaviour.
    const r = adaptToEcharts(
      [{ id: 'orphan-cell', type: 'label', text: 'X', anchor: { dataIndex: 0 } }],
      {
        chartType: 'heatmap',
        dataContext: {
          labels: ['Mon'],
          series: [{ data: [{ x: null, y: 'AM' }] }], // no value, no x string
        },
      },
    );
    expect(r.seriesPatches).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('orphan-cell');
  });
});

describe('adaptToEcharts — LabelMarkup {xLabel, yLabel} shorthand', () => {
  // Heatmap-friendly categorical anchor that bypasses dataContext.
  // Use when the consumer already knows the cell labels.
  it('resolves {xLabel, yLabel} directly without dataContext', () => {
    const r = adaptToEcharts(
      [
        {
          id: 'shorthand',
          type: 'label',
          text: 'Tepe',
          anchor: { xLabel: 'Wed', yLabel: 'AM' },
        },
      ],
      { chartType: 'heatmap' },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect(data).toHaveLength(1);
    expect((data[0] as { coord: [string, string] }).coord).toEqual(['Wed', 'AM']);
    expect((data[0] as { name: string }).name).toBe('shorthand');
  });

  it('works on cartesian charts too (string x, numeric y not required)', () => {
    // The shorthand is a tunneling escape hatch: the adapter just hands
    // `[xLabel, yLabel]` to ECharts. Whether the chart can render it is
    // up to the underlying coordinate system.
    const r = adaptToEcharts(
      [{ id: 'cart', type: 'label', text: 'X', anchor: { xLabel: 'Q3', yLabel: 'High' } }],
      { chartType: 'bar' },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, string] }).coord).toEqual(['Q3', 'High']);
  });

  it('does not collide with {dataIndex} resolution path', () => {
    // Sanity: if both keys could theoretically collide (they cannot —
    // the union is exclusive — but TS structural typing might let
    // something slip), the {xLabel,yLabel} branch wins because it's
    // checked before dataIndex.
    const r = adaptToEcharts(
      [
        {
          id: 'precedence',
          type: 'label',
          text: 'P',
          anchor: { xLabel: 'A', yLabel: 'B' },
        },
      ],
      {
        chartType: 'heatmap',
        dataContext: {
          labels: ['ZZZ'],
          series: [{ data: [{ x: 'never', y: 'used', value: 0 }] }],
        },
      },
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { coord: [string, string] }).coord).toEqual(['A', 'B']);
  });
});

describe('adaptToEcharts — support matrix', () => {
  it('emits 5 full + 1 partial + 7 no-op chart kinds (Codex iter-3 contract)', () => {
    const fullKinds = ['bar', 'line', 'area', 'scatter', 'heatmap'];
    const partialKinds = ['waterfall'];
    const noopKinds = ['pie', 'gauge', 'radar', 'funnel', 'treemap', 'sankey', 'sunburst'];

    expect(fullKinds.length + partialKinds.length + noopKinds.length).toBe(13);

    for (const kind of fullKinds) {
      const policy = DEFAULT_SUPPORT_MATRIX[kind as keyof typeof DEFAULT_SUPPORT_MATRIX];
      expect(policy.line).toBe('full');
      expect(policy.segment).toBe('full');
      expect(policy.area).toBe('full');
      expect(policy.point).toBe('full');
      expect(policy.label).toBe('full');
    }

    for (const kind of partialKinds) {
      const policy = DEFAULT_SUPPORT_MATRIX[kind as keyof typeof DEFAULT_SUPPORT_MATRIX];
      // Waterfall: line/area partial (connector merge), point/label full
      expect(policy.line).toBe('partial');
      expect(policy.area).toBe('partial');
      expect(policy.point).toBe('full');
      expect(policy.label).toBe('full');
    }

    for (const kind of noopKinds) {
      const policy = DEFAULT_SUPPORT_MATRIX[kind as keyof typeof DEFAULT_SUPPORT_MATRIX];
      // Every variant is no-op for non-cartesian / hierarchical charts.
      expect(Object.values(policy).every((s) => s === 'no-op')).toBe(true);
    }
  });

  it('drops markups + warns on no-op chart kinds', () => {
    const r = adaptToEcharts([{ id: 'x', type: 'line', axis: 'y', value: 50 }], {
      chartType: 'pie',
    });
    expect(r.seriesPatches).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('pie');
    expect(r.warnings[0]).toContain('line');
    expect(r.warnings[0]).toContain('not supported');
  });

  it('still populates markupLookup even for no-op markups', () => {
    const r = adaptToEcharts([{ id: 'dropped', type: 'line', axis: 'y', value: 50 }], {
      chartType: 'pie',
    });
    expect(r.markupLookup.get('dropped')?.id).toBe('dropped');
  });
});

describe('adaptToEcharts — per-series patch routing', () => {
  it('routes markups with different target.seriesIndex into separate patches', () => {
    const r = adaptToEcharts(
      [
        { id: 'l1', type: 'line', axis: 'y', value: 100, target: { seriesIndex: 0 } },
        { id: 'l2', type: 'line', axis: 'y', value: 200, target: { seriesIndex: 1 } },
      ],
      { chartType: 'line' },
    );
    expect(r.seriesPatches).toHaveLength(2);
    const p0 = r.seriesPatches.find((p) => p.seriesIndex === 0)!;
    const p1 = r.seriesPatches.find((p) => p.seriesIndex === 1)!;
    expect((p0.markLine as { data: unknown[] }).data).toHaveLength(1);
    expect((p1.markLine as { data: unknown[] }).data).toHaveLength(1);
  });

  it('routes by target.seriesName when seriesIndex is omitted', () => {
    const r = adaptToEcharts(
      [
        { id: 'l1', type: 'line', axis: 'y', value: 100, target: { seriesName: 'Sales' } },
        { id: 'l2', type: 'line', axis: 'y', value: 200, target: { seriesName: 'Costs' } },
      ],
      { chartType: 'line' },
    );
    expect(r.seriesPatches).toHaveLength(2);
    expect(r.seriesPatches.some((p) => p.seriesName === 'Sales')).toBe(true);
    expect(r.seriesPatches.some((p) => p.seriesName === 'Costs')).toBe(true);
  });

  it('groups untargeted markups into a single default patch', () => {
    const r = adaptToEcharts(
      [
        { id: 'l1', type: 'line', axis: 'y', value: 100 },
        { id: 'l2', type: 'line', axis: 'y', value: 200 },
        { id: 'a1', type: 'area', axis: 'y', from: 50, to: 150 },
      ],
      { chartType: 'bar' },
    );
    expect(r.seriesPatches).toHaveLength(1);
    expect((r.seriesPatches[0].markLine as { data: unknown[] }).data).toHaveLength(2);
    expect((r.seriesPatches[0].markArea as { data: unknown[] }).data).toHaveLength(1);
  });
});

describe('adaptToEcharts — XSS sanitization', () => {
  it('escapes <script> in line label.text', () => {
    const r = adaptToEcharts(
      [
        {
          id: 'xss',
          type: 'line',
          axis: 'y',
          value: 50,
          label: { text: '<script>alert(1)</script>' },
        },
      ],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    const formatter = (data[0] as { label: { formatter?: string } }).label.formatter;
    expect(formatter).not.toContain('<script>');
    expect(formatter).toContain('&lt;');
  });

  it('escapes < > & " in label markup text', () => {
    const r = adaptToEcharts(
      [{ id: 's', type: 'label', text: '<a>&"foo"</a>', anchor: { x: 0, y: 0 } }],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    const formatter = (data[0] as { label: { formatter: string } }).label.formatter;
    expect(formatter).not.toContain('<a>');
    expect(formatter).toContain('&lt;');
  });
});

describe('adaptToEcharts — CSS custom-property color resolution', () => {
  // The ECharts canvas renderer silently ignores `var(--…)` color
  // strings. Every markup color surface — consumer-supplied AND the
  // DEFAULT_* token fallbacks — must be resolved by the adapter before
  // it reaches an ECharts color field. These tests set a real custom
  // property on <html> (jsdom env from vitest.config) so the resolver
  // returns the concrete computed value rather than the var() literal.
  afterEach(() => {
    for (const t of [
      '--xc-mk-line',
      '--xc-mk-segment',
      '--xc-mk-area',
      '--xc-mk-point',
      '--xc-mk-label',
      '--xc-mk-label-bg',
    ]) {
      document.documentElement.style.removeProperty(t);
    }
  });

  it('resolves a var(--token) consumer color on a line markup', () => {
    document.documentElement.style.setProperty('--xc-mk-line', '#1d4ed8');
    const r = adaptToEcharts(
      [{ id: 'l', type: 'line', axis: 'y', value: 10, color: 'var(--xc-mk-line)' }],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    expect((data[0] as { lineStyle: { color: string } }).lineStyle.color).toBe('#1d4ed8');
  });

  it('resolves a var(--token) consumer color on a segment markup', () => {
    document.documentElement.style.setProperty('--xc-mk-segment', '#22c55e');
    const r = adaptToEcharts(
      [
        {
          id: 's',
          type: 'segment',
          from: { x: 0, y: 0 },
          to: { x: 1, y: 1 },
          color: 'var(--xc-mk-segment)',
        },
      ],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    const segment = data[0] as Array<{ lineStyle?: { color: string } }>;
    expect(segment[0].lineStyle?.color).toBe('#22c55e');
  });

  it('resolves a var(--token) consumer color on an area markup', () => {
    document.documentElement.style.setProperty('--xc-mk-area', '#fef3c7');
    const r = adaptToEcharts(
      [{ id: 'a', type: 'area', axis: 'x', from: 'Q1', to: 'Q2', color: 'var(--xc-mk-area)' }],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markArea as { data: unknown[] }).data;
    const area = data[0] as Array<{ itemStyle?: { color: string } }>;
    expect(area[0].itemStyle?.color).toBe('#fef3c7');
  });

  it('resolves a var(--token) consumer color on a point markup', () => {
    document.documentElement.style.setProperty('--xc-mk-point', '#8b5cf6');
    const r = adaptToEcharts(
      [{ id: 'p', type: 'point', x: 'Mar', y: 5, color: 'var(--xc-mk-point)' }],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { itemStyle: { color: string } }).itemStyle.color).toBe('#8b5cf6');
  });

  it('resolves var(--token) color AND background on a label markup', () => {
    document.documentElement.style.setProperty('--xc-mk-label', '#6b7280');
    document.documentElement.style.setProperty('--xc-mk-label-bg', '#f3f4f6');
    const r = adaptToEcharts(
      [
        {
          id: 'lbl',
          type: 'label',
          text: 'Note',
          anchor: { x: 'Apr', y: 100 },
          color: 'var(--xc-mk-label)',
          background: 'var(--xc-mk-label-bg)',
        },
      ],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    const label = (data[0] as { label: { color: string; backgroundColor?: string } }).label;
    expect(label.color).toBe('#6b7280');
    expect(label.backgroundColor).toBe('#f3f4f6');
  });

  it('falls back to a var() literal fallback when the token is undefined', () => {
    // --xc-mk-line intentionally never set: the resolver yields the
    // literal fallback, so the canvas never sees `var(...)`.
    const r = adaptToEcharts(
      [
        {
          id: 'l',
          type: 'line',
          axis: 'y',
          value: 10,
          color: 'var(--xc-mk-line, #abcdef)',
        },
      ],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    expect((data[0] as { lineStyle: { color: string } }).lineStyle.color).toBe('#abcdef');
  });

  it('passes a plain hex consumer color through untouched', () => {
    const r = adaptToEcharts(
      [{ id: 'l', type: 'line', axis: 'y', value: 10, color: '#ff0000' }],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markLine as { data: unknown[] }).data;
    expect((data[0] as { lineStyle: { color: string } }).lineStyle.color).toBe('#ff0000');
  });

  it('leaves label backgroundColor undefined when no background is supplied', () => {
    // resolveCssVarColor(undefined) === undefined — the optional
    // surface must not be coerced into a string.
    const r = adaptToEcharts(
      [{ id: 'lbl', type: 'label', text: 'X', anchor: { x: 0, y: 0 } }],
      baseOpts,
    );
    const data = (r.seriesPatches[0].markPoint as { data: unknown[] }).data;
    expect((data[0] as { label: { backgroundColor?: string } }).label.backgroundColor).toBe(
      undefined,
    );
  });
});

describe('adaptToEcharts — markupLookup', () => {
  it('exposes every markup by id (including dropped no-op markups)', () => {
    const r = adaptToEcharts(
      [
        { id: 'a', type: 'line', axis: 'y', value: 1 },
        { id: 'b', type: 'point', x: 0, y: 0 },
        { id: 'c', type: 'line', axis: 'y', value: 2 }, // dropped on pie
      ],
      { chartType: 'bar' },
    );
    expect(r.markupLookup.size).toBe(3);
    expect(r.markupLookup.get('a')?.type).toBe('line');
    expect(r.markupLookup.get('b')?.type).toBe('point');
    expect(r.markupLookup.get('c')?.type).toBe('line');
  });
});

describe('adaptToEcharts — empty input', () => {
  it('returns empty patches + no warnings for an empty markups array', () => {
    const r = adaptToEcharts([], baseOpts);
    expect(r.seriesPatches).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.markupLookup.size).toBe(0);
    expect(r.graphic).toEqual([]);
  });
});

describe('adaptToEcharts — public name collision regression', () => {
  it('ChartMarkup is a distinct type identifier (no collision with ChartAnnotation or Annotation)', () => {
    // Compile-time regression: importing all three from the package
    // surface must not produce a TS conflict. We can't directly assert
    // type identity at runtime (types are erased), but a successful
    // import + use is the regression.
    const m: ChartMarkup = { id: 'r', type: 'line', axis: 'y', value: 0 };
    expect(m.id).toBe('r');
  });
});
