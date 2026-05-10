// @vitest-environment jsdom
/**
 * Lines3D — wrapper lifecycle + a11y + multi-series option contract (P1b).
 *
 * Lines3D maps each consumer-supplied path to one ECharts `'line3D'`
 * (singular — the geo `'lines3D'` family is deferred). This spec
 * locks:
 *   - empty data → empty-state div, no GL import
 *   - WebGL unsupported → unsupported div + data-reason, no series dispatched
 *   - ready → ChartA11yShell mounts (testId lines3d-chart) + per-path
 *     a11y rows with `<label> start` / `<label> end` markers
 *   - pure helper (`buildLines3DOption`) locks: series.length === paths.length,
 *     every series.type === 'line3D', series[i].data === path[i].coords,
 *     line color passthrough, tooltip path-label escape
 */
import './fixtures/echarts-mock';
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import * as detectModule from '../renderers/detectWebGLCapability';

vi.mock('echarts-gl', () => ({}));
vi.mock('../renderers/detectWebGLCapability', () => ({
  detectWebGLCapability: vi.fn(),
  resetWebGLCapabilityCache: vi.fn(),
}));

const mockedDetect = vi.mocked(detectModule.detectWebGLCapability);

import { Lines3D, buildLines3DOption } from '../Lines3D';
import type { Lines3DPath } from '../Lines3D';
import { resetEChartsGLRegistration, isEChartsGLRegistered } from '../renderers/gl';
import { allDispatchedOptions, resetEChartsMock } from './fixtures/echarts-mock';
import { setChartsLocale, __resetChartsLocaleStoreForTests } from '../i18n/locale-store';

const SAMPLE_PATHS: Lines3DPath[] = [
  {
    coords: [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 4],
    ],
    label: 'Alpha',
  },
  {
    coords: [
      [0, 0, 0],
      [1, 0, 2],
      [2, 0, 1],
    ],
    label: 'Beta',
    color: '#22c55e',
  },
];

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  resetEChartsGLRegistration();
  mockedDetect.mockReturnValue({ supported: true, webgl2: true });
  setChartsLocale('en');
});

afterEach(() => {
  restoreJsdomPolyfills();
  resetEChartsGLRegistration();
  mockedDetect.mockReset();
  __resetChartsLocaleStoreForTests();
  vi.restoreAllMocks();
});

describe('Lines3D — empty / unsupported lifecycle', () => {
  it('empty data renders the empty-state div without attempting GL load', () => {
    render(<Lines3D data={[]} title="Empty" />);
    expect(screen.getByTestId('lines3d-chart-empty')).toBeInTheDocument();
    expect(allDispatchedOptions()).toHaveLength(0);
    expect(isEChartsGLRegistered()).toBe(false);
  });

  it('WebGL unsupported renders the unsupported div with data-reason', async () => {
    mockedDetect.mockReturnValue({
      supported: false,
      webgl2: false,
      reason: 'context-unavailable',
    });
    render(<Lines3D data={SAMPLE_PATHS} title="Unsupported" />);
    await waitFor(() => {
      expect(screen.getByTestId('lines3d-chart-unsupported')).toBeInTheDocument();
    });
    const node = screen.getByTestId('lines3d-chart-unsupported');
    expect(node.getAttribute('data-reason')).toBe('webgl-unavailable');
    expect(allDispatchedOptions()).toHaveLength(0);
  });
});

describe('Lines3D — ready (GL registered) wrapper mount', () => {
  it('mounts ChartA11yShell once GL ready (testId lines3d-chart present)', async () => {
    render(<Lines3D data={SAMPLE_PATHS} title="Ready" />);
    await waitFor(() => {
      expect(screen.getByTestId('lines3d-chart')).toBeInTheDocument();
    });
  });

  it('a11y data table includes per-path coordinate rows', async () => {
    render(<Lines3D data={SAMPLE_PATHS} title="A11y" />);
    await waitFor(() => {
      expect(screen.getByTestId('lines3d-chart')).toBeInTheDocument();
    });
    // Small fixture (6 coords total) stays under the 1000-cap so the
    // sampler emits every coord with the `<label> #N (x=…, y=…)`
    // format. Large fixtures get the `<label> start` / `<label> end`
    // markers — covered by the sampling helper unit test.
    const alphaRows = screen.getAllByText(/Alpha #/);
    const betaRows = screen.getAllByText(/Beta #/);
    expect(alphaRows.length).toBeGreaterThanOrEqual(2);
    expect(betaRows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildLines3DOption — pure option builder', () => {
  it('emits one series.type==="line3D" per consumer path', () => {
    const opt = buildLines3DOption({
      paths: SAMPLE_PATHS,
      palette: ['#3b82f6', '#22c55e', '#f59e0b'],
      fmt: String,
      animate: true,
      lineWidth: 2,
    });
    const series = (opt.series ?? []) as Array<{ type: string; data: unknown[]; name: string }>;
    expect(series).toHaveLength(2);
    expect(series.every((s) => s.type === 'line3D')).toBe(true);
    expect(series[0].name).toBe('Alpha');
    expect(series[1].name).toBe('Beta');
    expect(series[0].data).toHaveLength(3);
  });

  it('passes per-path color override through (palette fallback otherwise)', () => {
    const opt = buildLines3DOption({
      paths: SAMPLE_PATHS,
      palette: ['#3b82f6', '#fffaaa'], // path 0 gets palette[0]; path 1 has explicit color
      fmt: String,
      animate: true,
      lineWidth: 3,
    });
    const series = (opt.series ?? []) as Array<{ lineStyle: { color: string; width: number } }>;
    expect(series[0].lineStyle.color).toBe('#3b82f6'); // palette[0]
    expect(series[1].lineStyle.color).toBe('#22c55e'); // explicit override
    expect(series[0].lineStyle.width).toBe(3);
  });

  it('configures grid3D + visualMap.dimension===2 + min/max across all paths', () => {
    const opt = buildLines3DOption({
      paths: SAMPLE_PATHS,
      palette: ['#3b82f6'],
      fmt: String,
      animate: false,
      lineWidth: 2,
    });
    expect(opt.grid3D).toBeTruthy();
    const visualMap = opt.visualMap as { dimension: number; min: number; max: number };
    expect(visualMap.dimension).toBe(2);
    // Z-range across all coords: [0, 1, 4, 0, 2, 1] → min=0, max=4.
    expect(visualMap.min).toBe(0);
    expect(visualMap.max).toBe(4);
  });

  it('tooltip formatter resolves path label via params.seriesIndex (XSS-escaped)', () => {
    const opt = buildLines3DOption({
      paths: [{ coords: [[0, 0, 0]], label: '<img src=x onerror=alert(1)>' }],
      palette: ['#000'],
      fmt: String,
      animate: true,
      lineWidth: 2,
    });
    const tooltip = opt.tooltip as {
      formatter: (p: { value?: number[]; seriesIndex?: number }) => string;
    };
    const out = tooltip.formatter({ value: [0, 0, 0], seriesIndex: 0 });
    expect(out).not.toMatch(/<img/);
    expect(out).toMatch(/&lt;img/);
  });
});
