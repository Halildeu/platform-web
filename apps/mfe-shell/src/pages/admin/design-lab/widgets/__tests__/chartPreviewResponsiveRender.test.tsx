// @vitest-environment jsdom
/**
 * ChartPreviewLive responsive render-path test
 *
 * Codex thread `019defa5` PARTIAL iter-3: helper unit tests already lock
 * the math (`responsiveHeight('sm') === 220`), but the bug Codex flagged
 * was that the call-site or component default could silently re-introduce
 * a `360` floor and bypass the math at runtime. This test renders the
 * real component with `useResponsiveBreakpoint` stubbed to `'mobile'` and
 * asserts the rendered preview surface ends up at the chart-size-derived
 * envelope (220px), not 360px.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@mfe/x-charts', async () => {
  const actual = await vi.importActual<typeof import('@mfe/x-charts')>('@mfe/x-charts');
  // Sentinel components — we don't care what the chart renders, only that
  // ChartPreviewLive forwards the right `size` and that the wrapping
  // PreviewBox carries the responsive height.
  const sentinel = (kind: string) => {
    const C: React.FC<{ size?: string }> = ({ size }) =>
      React.createElement('div', {
        'data-testid': `mock-${kind}`,
        'data-size': size,
      });
    C.displayName = `Mock${kind}`;
    return C;
  };
  return {
    ...actual,
    BarChart: sentinel('bar'),
    LineChart: sentinel('line'),
    AreaChart: sentinel('area'),
    PieChart: sentinel('pie'),
    ScatterChart: sentinel('scatter'),
    GaugeChart: sentinel('gauge'),
    RadarChart: sentinel('radar'),
    TreemapChart: sentinel('treemap'),
    HeatmapChart: sentinel('heatmap'),
    WaterfallChart: sentinel('waterfall'),
    FunnelChart: sentinel('funnel'),
    SankeyChart: sentinel('sankey'),
    SunburstChart: sentinel('sunburst'),
    SparklineChart: sentinel('sparkline'),
    KPICard: sentinel('kpi'),
    ChartContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    ChartToolbar: () => React.createElement('div'),
    ChartDashboard: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    useChartInteractions: () => [{}, {}],
    // The crucial mock — pinned to 'mobile' for the duration of these
    // tests so the responsive shrink path actually fires.
    useResponsiveBreakpoint: () => 'mobile',
  };
});

import ChartPreviewLive from '../ChartPreviewLive';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChartPreviewLive responsive render path (mobile breakpoint)', () => {
  it('PreviewBox height defaults to the chart-size envelope (220px), not the legacy 360 floor', () => {
    const { container } = render(<ChartPreviewLive chartId="bar-chart" chartName="BarChart" />);
    const previewBox = container.querySelector(
      '[data-testid="design-lab-chart-preview-bar-chart"]',
    ) as HTMLElement | null;
    expect(previewBox).not.toBeNull();
    // 220px = CHART_CANVAS_HEIGHT['sm'] (200) + 20 padding — mobile clamp.
    expect(previewBox!.style.height).toBe('220px');
  });

  it('forwards a clamped chart size to the wrapper (mobile → "sm")', () => {
    const { container } = render(<ChartPreviewLive chartId="bar-chart" chartName="BarChart" />);
    const sentinel = container.querySelector('[data-testid="mock-bar"]') as HTMLElement | null;
    expect(sentinel).not.toBeNull();
    expect(sentinel!.dataset.size).toBe('sm');
  });

  it('respects an explicit floor when greater than the chart envelope', () => {
    const { container } = render(
      <ChartPreviewLive chartId="bar-chart" chartName="BarChart" height={300} />,
    );
    const previewBox = container.querySelector(
      '[data-testid="design-lab-chart-preview-bar-chart"]',
    ) as HTMLElement | null;
    expect(previewBox!.style.height).toBe('300px');
  });

  it('clamps ext chart sizes too (Radar mobile → "sm")', () => {
    const { container } = render(<ChartPreviewLive chartId="radar-chart" chartName="RadarChart" />);
    const sentinel = container.querySelector('[data-testid="mock-radar"]') as HTMLElement | null;
    expect(sentinel).not.toBeNull();
    expect(sentinel!.dataset.size).toBe('sm');
  });

  it('PreviewBox has overflow:hidden + position:relative so charts cannot bleed past the surround', () => {
    const { container } = render(<ChartPreviewLive chartId="bar-chart" chartName="BarChart" />);
    const previewBox = container.querySelector(
      '[data-testid="design-lab-chart-preview-bar-chart"]',
    ) as HTMLElement | null;
    expect(previewBox!.style.overflow).toBe('hidden');
    expect(previewBox!.style.position).toBe('relative');
  });
});
