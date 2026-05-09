/**
 * Storybook: Markup Overlay Demo
 *
 * Highcharts annotation parity (Codex thread 019e0df1). 3 stories:
 *   1. ManualMarkupDemo — explicit `markups` prop with all 4 variants
 *      (line + area + point + label) on a BarChart
 *   2. TrendOverlayDemo — `useTrendOverlay` AI hook on a LineChart
 *   3. AnomalyOverlayDemo — `useAnomalyOverlay` AI hook on a LineChart
 *
 * The full-suite contract test (`adaptToEcharts.test.ts`) covers
 * every chart × every variant; this story file is the visual
 * reference for consumers and the design lab catalog. Codex iter-3
 * absorb pattern: minimal demo + reusable fixtures.
 */
import React from 'react';
import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { useTrendOverlay } from '../annotations/useTrendOverlay';
import { useAnomalyOverlay } from '../annotations/useAnomalyOverlay';
import type { ChartMarkup } from '../types';

export default {
  title: 'x-charts / Markup Overlay',
  parameters: { layout: 'padded' },
};

/* ------------------------------------------------------------------ */
/*  Story 1: Manual markups (all 4 variants on a BarChart)             */
/* ------------------------------------------------------------------ */

const SALES_DATA = [
  { label: 'Jan', value: 320 },
  { label: 'Feb', value: 480 },
  { label: 'Mar', value: 290 },
  { label: 'Apr', value: 720 },
  { label: 'May', value: 510 },
  { label: 'Jun', value: 850 },
];

const MANUAL_MARKUPS: ChartMarkup[] = [
  {
    id: 'budget',
    type: 'line',
    axis: 'y',
    value: 600,
    label: { text: 'Budget', position: 'end' },
    color: 'var(--state-success-text, #22c55e)',
    style: 'dashed',
  },
  {
    id: 'q1-band',
    type: 'area',
    axis: 'x',
    from: 'Jan',
    to: 'Mar',
    label: { text: 'Q1' },
    color: 'var(--accent-soft, #c7d2fe)',
    opacity: 0.25,
  },
  {
    id: 'spike',
    type: 'point',
    x: 'Apr',
    y: 720,
    symbol: 'diamond',
    color: 'var(--state-info-text, #06b6d4)',
    label: { text: '↑ Lansman' },
  },
  {
    id: 'campaign-note',
    type: 'label',
    text: 'Spring campaign',
    anchor: { dataIndex: 5 },
    color: 'var(--text-secondary, #6b7280)',
    background: 'var(--surface-raised, #f3f4f6)',
  },
];

export const ManualMarkupDemo = () => (
  <div style={{ padding: 24 }}>
    <h3 style={{ marginBottom: 12 }}>Manual markups — line + area + point + label</h3>
    <BarChart
      data={SALES_DATA}
      title="Monthly Revenue (with markups)"
      markups={MANUAL_MARKUPS}
      onMarkupClick={(e) => console.info('[markup click]', e.markup)}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/*  Story 2: AI trend overlay (linear regression line + label)         */
/* ------------------------------------------------------------------ */

const TREND_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const TREND_SERIES = [
  {
    name: 'Sales',
    data: [120, 180, 240, 230, 320, 410],
  },
];

export const TrendOverlayDemo = () => {
  // computeTrendOverlay expects {x, y} — adapt LineChart's series + labels
  const trendInput = TREND_LABELS.map((label, i) => ({
    x: label,
    y: TREND_SERIES[0].data[i],
  }));
  const trend = useTrendOverlay({ data: trendInput, color: 'var(--state-info-text, #06b6d4)' });

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ marginBottom: 12 }}>AI trend overlay (OLS regression line + slope label)</h3>
      <LineChart series={TREND_SERIES} labels={TREND_LABELS} markups={trend} title="Sales Trend" />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Story 3: AI anomaly overlay (IQR fence outliers)                   */
/* ------------------------------------------------------------------ */

const ANOMALY_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const ANOMALY_SERIES = [
  {
    name: 'Latency (ms)',
    data: [120, 130, 125, 128, 122, 1450, 135, 140, 122, 90],
  },
];

export const AnomalyOverlayDemo = () => {
  const anomalyInput = ANOMALY_LABELS.map((label, i) => ({
    x: label,
    y: ANOMALY_SERIES[0].data[i],
  }));
  const anomalies = useAnomalyOverlay({
    data: anomalyInput,
    color: 'var(--state-error-text, #ef4444)',
    size: 14,
  });

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ marginBottom: 12 }}>AI anomaly overlay (IQR fences flag outliers)</h3>
      <LineChart
        series={ANOMALY_SERIES}
        labels={ANOMALY_LABELS}
        markups={anomalies}
        title="Latency (with outlier markers)"
      />
    </div>
  );
};
