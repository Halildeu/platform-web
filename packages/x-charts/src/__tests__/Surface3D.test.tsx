// @vitest-environment jsdom
/**
 * Surface3D — wrapper lifecycle + a11y + option-shape contract (P1b).
 *
 * Mirrors the Scatter3D test layout (P1a precedent):
 *   - empty data → empty-state div, no GL import
 *   - WebGL unsupported → unsupported div + data-reason, no series dispatched
 *   - ready → ChartA11yShell mounts (testId surface3d-chart) + a11y data table
 *   - pure helper (`buildSurface3DOption`) locks series.type='surface',
 *     dataShape invariant, visualMap.dimension===2, grid3D + light + viewControl
 *     passthrough, tooltip XSS escape
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

import { Surface3D, buildSurface3DOption, buildSurface3DClickEvent } from '../Surface3D';
import { resetEChartsGLRegistration, isEChartsGLRegistered } from '../renderers/gl';
import { allDispatchedOptions, resetEChartsMock } from './fixtures/echarts-mock';
import { setChartsLocale, __resetChartsLocaleStoreForTests } from '../i18n/locale-store';

const SAMPLE_DATA = [
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 0, z: 2 },
  { x: 0, y: 1, z: 3 },
  { x: 1, y: 1, z: 4 },
];
const SAMPLE_SHAPE: readonly [number, number] = [2, 2];

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

describe('Surface3D — empty / unsupported lifecycle', () => {
  it('empty data renders the empty-state div without attempting GL load', () => {
    render(<Surface3D data={[]} dataShape={[0, 0]} title="Empty" />);
    expect(screen.getByTestId('surface3d-chart-empty')).toBeInTheDocument();
    expect(allDispatchedOptions()).toHaveLength(0);
    expect(isEChartsGLRegistered()).toBe(false);
  });

  // Codex thread `019e10d7` iter-3: stale `dataShape` (left over after
  // the consumer cleared `data`) used to throw inside the sampler
  // before the empty-state branch could render. Wrapper now gates
  // the sampler on `isEmpty`.
  it('empty data with stale non-zero dataShape still renders the empty state', () => {
    render(<Surface3D data={[]} dataShape={[2, 2]} title="Empty + stale shape" />);
    expect(screen.getByTestId('surface3d-chart-empty')).toBeInTheDocument();
    expect(allDispatchedOptions()).toHaveLength(0);
  });

  it('WebGL unsupported renders the unsupported div with data-reason', async () => {
    mockedDetect.mockReturnValue({
      supported: false,
      webgl2: false,
      reason: 'context-unavailable',
    });
    render(<Surface3D data={SAMPLE_DATA} dataShape={SAMPLE_SHAPE} title="Unsupported" />);
    await waitFor(() => {
      expect(screen.getByTestId('surface3d-chart-unsupported')).toBeInTheDocument();
    });
    const node = screen.getByTestId('surface3d-chart-unsupported');
    expect(node.getAttribute('data-reason')).toBe('webgl-unavailable');
    expect(allDispatchedOptions()).toHaveLength(0);
  });
});

describe('Surface3D — ready (GL registered) wrapper mount', () => {
  it('mounts ChartA11yShell once GL ready (testId surface3d-chart present)', async () => {
    render(<Surface3D data={SAMPLE_DATA} dataShape={SAMPLE_SHAPE} title="Ready" />);
    await waitFor(() => {
      expect(screen.getByTestId('surface3d-chart')).toBeInTheDocument();
    });
  });

  it('a11y data table embeds (x=…, y=…) labels for each grid cell', async () => {
    render(<Surface3D data={SAMPLE_DATA} dataShape={SAMPLE_SHAPE} title="A11y" />);
    await waitFor(() => {
      expect(screen.getByTestId('surface3d-chart')).toBeInTheDocument();
    });
    expect(screen.getByText(/x=0, y=0/)).toBeInTheDocument();
    expect(screen.getByText(/x=1, y=1/)).toBeInTheDocument();
  });
});

describe('buildSurface3DOption — pure option builder', () => {
  it('emits series[0].type === "surface" with [x, y, z] data tuples', () => {
    const opt = buildSurface3DOption({
      data: SAMPLE_DATA,
      dataShape: SAMPLE_SHAPE,
      palette: ['#3b82f6', '#22c55e'],
      fmt: (v) => String(v),
      animate: true,
      shading: 'lambert',
    });
    const series = (opt.series ?? []) as Array<{ type: string; data: unknown[]; shading?: string }>;
    expect(series[0].type).toBe('surface');
    expect(series[0].data).toHaveLength(4);
    expect(series[0].data[0]).toEqual([0, 0, 1]);
    expect(series[0].shading).toBe('lambert');
  });

  it('throws when dataShape does not match data.length (Codex iter-2)', () => {
    expect(() =>
      buildSurface3DOption({
        data: SAMPLE_DATA,
        dataShape: [3, 3], // 9 ≠ 4
        palette: ['#000'],
        fmt: String,
        animate: false,
        shading: 'lambert',
      }),
    ).toThrow(/dataShape/);
  });

  it('configures grid3D + visualMap.dimension===2 + min/max from z-range', () => {
    const opt = buildSurface3DOption({
      data: SAMPLE_DATA,
      dataShape: SAMPLE_SHAPE,
      palette: ['#3b82f6'],
      fmt: String,
      animate: false,
      shading: 'realistic',
    });
    expect(opt.grid3D).toBeTruthy();
    const visualMap = opt.visualMap as { dimension: number; min: number; max: number };
    expect(visualMap.dimension).toBe(2);
    expect(visualMap.min).toBe(1);
    expect(visualMap.max).toBe(4);
  });

  it('passes viewControl / light / grid3D overrides through unchanged', () => {
    const opt = buildSurface3DOption({
      data: SAMPLE_DATA,
      dataShape: SAMPLE_SHAPE,
      palette: ['#3b82f6'],
      fmt: String,
      animate: true,
      shading: 'lambert',
      viewControl: { autoRotate: true, distance: 500 },
      light: { main: { intensity: 2.0, shadow: true } },
      grid3D: { boxWidth: 400 },
    });
    const grid3D = opt.grid3D as Record<string, unknown>;
    expect(grid3D.viewControl).toEqual({ autoRotate: true, distance: 500 });
    expect(grid3D.light).toEqual({ main: { intensity: 2.0, shadow: true } });
    expect(grid3D.boxWidth).toBe(400);
  });

  it('escapes z value in tooltip formatter (XSS guard)', () => {
    const opt = buildSurface3DOption({
      data: SAMPLE_DATA,
      dataShape: SAMPLE_SHAPE,
      palette: ['#000'],
      fmt: () => '<img src=x onerror=alert(1)>',
      animate: true,
      shading: 'lambert',
    });
    const tooltip = opt.tooltip as { formatter: (p: { value?: number[] }) => string };
    const out = tooltip.formatter({ value: [0, 0, 1] });
    expect(out).not.toMatch(/<img/);
    expect(out).toMatch(/&lt;img/);
  });
});

// Faz 21.11 P1d — pure click-event factory unit tests.
describe('buildSurface3DClickEvent — pure click event factory', () => {
  it('emits canonical event with z as value', () => {
    const event = buildSurface3DClickEvent([{ x: 1, y: 2, z: 9 }], {
      value: [1, 2, 9],
      dataIndex: 0,
    });
    expect(event?.value).toBe(9);
    expect(event?.datum.x).toBe(1);
    expect(event?.datum.y).toBe(2);
    expect(event?.datum.z).toBe(9);
    expect(event?.datum.chartType).toBe('surface3d');
  });

  it('uses source data[dataIndex] (not params.value) for x/y/z', () => {
    // Even if params.value carries different numbers (shouldn't in
    // practice), source-of-truth wins.
    const event = buildSurface3DClickEvent([{ x: 100, y: 200, z: 300 }], {
      value: [99, 99, 99],
      dataIndex: 0,
    });
    expect(event?.datum.x).toBe(100);
    expect(event?.datum.y).toBe(200);
    expect(event?.datum.z).toBe(300);
    expect(event?.value).toBe(300);
  });

  it('returns null when dataIndex is out-of-bounds (defensive guard)', () => {
    expect(buildSurface3DClickEvent([{ x: 0, y: 0, z: 0 }], { dataIndex: 999 })).toBeNull();
  });
});
