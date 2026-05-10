// @vitest-environment jsdom
/**
 * Faz 21.11 PR-A2b-a11y-other — anomaly summary forward contract.
 *
 * Locks the wrapper-level prop pass-through: Line / Area / Bar /
 * Heatmap charts must forward `anomalySummary` + `formatAnomalyAnnouncement`
 * to ChartA11yShell exactly the way ScatterChart already does (PR-A2b-a11y).
 *
 * Each chart × 3 cases:
 *   - no anomalySummary        → backwards compat (single role="status" region)
 *   - anomalySummary=[ANOM]    → second `chart-aria-live-anomalies` region
 *                                 mounts; debounced text matches /1 outlier/
 *   - custom formatter         → formatAnomalyAnnouncement called once
 *                                 + region text mirrors custom output
 *
 * Plus: one extra `access="readonly"` smoke proves the access gate
 * does NOT block anomaly props (these are not user-facing callbacks
 * that `guardChartCallback` would wrap — Codex iter-1 nice-to-have).
 */
import './fixtures/echarts-mock'; // side-effect: vi.mock('../renderers/echarts-imports') hoisted before component imports
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { BarChart } from '../BarChart';
import { HeatmapChart } from '../HeatmapChart';
import { PieChart } from '../PieChart';
import { FunnelChart } from '../FunnelChart';
import { WaterfallChart } from '../WaterfallChart';
import { RadarChart } from '../RadarChart';
import type { AnomalySummary } from '../annotations/computeAnomalyOverlay';
import { setChartsLocale, __resetChartsLocaleStoreForTests } from '../i18n/locale-store';

const ANOM: AnomalySummary = {
  id: 'a-1',
  x: 'May',
  y: 100,
  formattedY: '100.00',
  direction: 'above',
  severity: 50,
  severityBucket: 'high',
  ariaLabel: 'Outlier above expected at x=May, y=100.00 (high severity)',
};

const SERIES = [{ name: 'sales', data: [10, 20, 30, 40] }];
const LABELS = ['Jan', 'Feb', 'Mar', 'Apr'];

const BAR_DATA = [
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 20 },
  { label: 'Mar', value: 30 },
  { label: 'Apr', value: 40 },
];

// Object-format heatmap data — `xLabels`/`yLabels` are auto-derived
// from the unique x/y keys, no manual axis label remap needed.
const HEATMAP_DATA = [
  { x: 'x0', y: 'y0', value: 5 },
  { x: 'x0', y: 'y1', value: 10 },
  { x: 'x1', y: 'y0', value: 15 },
  { x: 'x1', y: 'y1', value: 20 },
];

// PR-A2b-a11y-other-batch2 (Codex thread 019e1096): per-wrapper data
// shapes verified against each chart's `Props` interface — Pie + Waterfall
// use `{ label, value }`, Funnel uses `{ name, value }`. Codex iter-1
// flagged that mixing these up in the original plan would pass typescript
// but produce wrong axis labels at runtime.
const PIE_DATA = [
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 20 },
  { label: 'Mar', value: 30 },
];

const FUNNEL_DATA = [
  { name: 'Visit', value: 100 },
  { name: 'Signup', value: 60 },
  { name: 'Purchase', value: 20 },
];

const WATERFALL_DATA = [
  { label: 'Start', value: 100 },
  { label: 'Q1', value: 30 },
  { label: 'Q2', value: -20 },
  { label: 'Q3', value: 50 },
];

type ChartCase = {
  name: string;
  // Each chart wrapper has its own `Props` shape — the matrix only
  // shares the anomaly props, so `Record<string, unknown>` is the
  // narrowest type that lets us spread base props of all four shapes.

  Component: React.ComponentType<any>;
  baseProps: Record<string, unknown>;
};

const CHARTS: ChartCase[] = [
  { name: 'LineChart', Component: LineChart, baseProps: { series: SERIES, labels: LABELS } },
  { name: 'AreaChart', Component: AreaChart, baseProps: { series: SERIES, labels: LABELS } },
  { name: 'BarChart', Component: BarChart, baseProps: { data: BAR_DATA } },
  { name: 'HeatmapChart', Component: HeatmapChart, baseProps: { data: HEATMAP_DATA } },
  // PR-A2b-a11y-other-batch2 (Codex thread 019e1096): semantic-aligned
  // wrappers added — PieChart/FunnelChart markup overlay is a NO-OP, so
  // the SR announcement is the consumer's primary anomaly channel.
  // WaterfallChart `useChartA11y({ chartType: 'waterfall' })` already
  // emits ECharts type union, so the forward is mechanical.
  { name: 'PieChart', Component: PieChart, baseProps: { data: PIE_DATA } },
  { name: 'FunnelChart', Component: FunnelChart, baseProps: { data: FUNNEL_DATA } },
  { name: 'WaterfallChart', Component: WaterfallChart, baseProps: { data: WATERFALL_DATA } },
];

beforeEach(() => {
  installJsdomPolyfills();
  vi.useFakeTimers();
  // Pin the locale so the default EN formatter ("1 outlier detected") is
  // deterministic — without this the assertion is at the mercy of the
  // host's stored locale (TR vs EN) and the SR copy regex flakes.
  setChartsLocale('en');
});

afterEach(() => {
  vi.useRealTimers();
  restoreJsdomPolyfills();
  __resetChartsLocaleStoreForTests();
});

describe.each(CHARTS)(
  '$name — anomaly summary forward (PR-A2b-a11y-other)',
  ({ Component, baseProps }) => {
    it('keeps a single aria-live region when anomalySummary is omitted (backwards compat)', () => {
      render(<Component {...baseProps} />);
      const liveRegions = document.querySelectorAll('[role="status"]');
      expect(liveRegions.length).toBe(1);
      expect(screen.queryByTestId('chart-aria-live-anomalies')).not.toBeInTheDocument();
    });

    it('mounts the dedicated anomaly region + announces /1 outlier/ when anomalySummary=[ANOM]', () => {
      render(<Component {...baseProps} anomalySummary={[ANOM]} />);
      act(() => {
        vi.runAllTimers();
      });
      const region = screen.getByTestId('chart-aria-live-anomalies');
      expect(region.textContent ?? '').toMatch(/1 outlier/);
    });

    it('forwards formatAnomalyAnnouncement override unchanged', () => {
      const fmt = vi.fn(() => 'CUSTOM');
      render(<Component {...baseProps} anomalySummary={[ANOM]} formatAnomalyAnnouncement={fmt} />);
      act(() => {
        vi.runAllTimers();
      });
      expect(fmt).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('chart-aria-live-anomalies').textContent).toBe('CUSTOM');
    });
  },
);

// PR-Radar (Codex thread `019e10a5` iter-1): Radar lives outside the
// `CHARTS` matrix because its props shape (`indicators` + per-series
// `data: number[]` aligned with indicator order) doesn't share base
// props with the Line/Area/Bar/Heatmap/Pie/Funnel/Waterfall family.
// Codex iter-1 explicitly recommended: "ayrı Radar describe daha iyi:
// no anomaly single status, kind: 'radar' ile /1 radar indicator
// anomaly/, custom formatter pass-through". This describe locks the
// per-wrapper contract for Radar without polluting the generic matrix.
//
// `RADAR_ANOM` mirrors what `computeRadarAnomalySummary` would emit:
// kind='radar', indicatorIndex/indicatorName/seriesName/axisUnit
// metadata so the radar-aware default formatter ("X radar indicator
// anomalies … Most extreme: <series>, <indicator>=<value> <unit>")
// fires the radar branch instead of falling back to flat.
const RADAR_INDICATORS = [
  { name: 'Latency', max: 500, unit: 'ms' },
  { name: 'Throughput', max: 100000 },
  { name: 'Errors', max: 100 },
];

const RADAR_SERIES = [
  { name: 'Q1', data: [120, 50000, 5] },
  { name: 'Q2', data: [140, 60000, 8] },
];

const RADAR_ANOM: AnomalySummary = {
  id: 'radar-anomaly-0-1',
  kind: 'radar',
  x: 'Latency',
  y: 400,
  formattedY: '400.00',
  direction: 'above',
  severity: 0.6,
  severityBucket: 'high',
  ariaLabel: 'Outlier above expected at Latency, Q2, value=400.00 ms (high severity)',
  seriesName: 'Q2',
  indicatorIndex: 0,
  indicatorName: 'Latency',
  axisUnit: 'ms',
};

describe('RadarChart — anomaly summary forward (PR-Radar)', () => {
  it('keeps a single aria-live region when anomalySummary is omitted (backwards compat)', () => {
    render(<RadarChart indicators={RADAR_INDICATORS} series={RADAR_SERIES} />);
    const liveRegions = document.querySelectorAll('[role="status"]');
    expect(liveRegions.length).toBe(1);
    expect(screen.queryByTestId('chart-aria-live-anomalies')).not.toBeInTheDocument();
  });

  it('mounts the dedicated anomaly region + radar template fires on kind="radar"', () => {
    render(
      <RadarChart
        indicators={RADAR_INDICATORS}
        series={RADAR_SERIES}
        anomalySummary={[RADAR_ANOM]}
      />,
    );
    act(() => {
      vi.runAllTimers();
    });
    const region = screen.getByTestId('chart-aria-live-anomalies');
    const text = region.textContent ?? '';
    // Radar branch hit (NOT flat "1 outlier detected"). Single anomaly
    // pluralisation: "anomaly" (not "anomalies"); see ChartAriaLive
    // radar template — `total === 1 ? 'y' : 'ies'`.
    expect(text).toMatch(/1 radar indicator anomaly/);
    // Indicator + series + value + unit propagated through the
    // formatter exactly as the per-indicator IQR detector emits.
    expect(text).toMatch(/Most extreme: Q2, Latency=400\.00 ms/);
  });

  it('forwards formatAnomalyAnnouncement override unchanged (custom formatter wins over radar default)', () => {
    const fmt = vi.fn(() => 'CUSTOM RADAR');
    render(
      <RadarChart
        indicators={RADAR_INDICATORS}
        series={RADAR_SERIES}
        anomalySummary={[RADAR_ANOM]}
        formatAnomalyAnnouncement={fmt}
      />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chart-aria-live-anomalies').textContent).toBe('CUSTOM RADAR');
  });
});

// Codex iter-1 nice-to-have (Q in plan-time review): access gate cannot
// strip the anomaly props because they aren't user-facing callbacks.
// `guardChartCallback` only wraps `onDataPointClick` / `onMarkupClick` /
// `onCellClick`; the anomaly props pass through untouched even when
// `access="readonly"` flips the chart into a non-interactive state.
describe('access gate does NOT strip anomaly props (LineChart smoke)', () => {
  it('access="readonly" still forwards anomalySummary + formatAnomalyAnnouncement', () => {
    const fmt = vi.fn(() => 'AC SMOKE');
    render(
      <LineChart
        series={SERIES}
        labels={LABELS}
        access="readonly"
        accessReason="ReadOnly smoke"
        anomalySummary={[ANOM]}
        formatAnomalyAnnouncement={fmt}
      />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chart-aria-live-anomalies').textContent).toBe('AC SMOKE');
  });
});
