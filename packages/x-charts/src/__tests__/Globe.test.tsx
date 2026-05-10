// @vitest-environment jsdom
/**
 * Globe — wrapper lifecycle + a11y + multi-layer geo option contract (P1c).
 *
 * Locks the contract Codex thread `019e10f8` iter-1 set:
 *   - empty layers / all-empty layer data → empty state, no GL load
 *   - WebGL unsupported → unsupported div + data-reason
 *   - ready → ChartA11yShell mounts (testId globe-chart) + a11y rows
 *   - pure helper (`buildGlobeOption`) locks: option.globe truthy,
 *     series.length === layers.length, every series.coordinateSystem ==='globe',
 *     visualMap scoped to numeric layers (lines-only globe → omitted),
 *     `displacementScale` only emitted when `heightTexture` present,
 *     tooltip XSS escape on layer name + label.
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

import { Globe, buildGlobeOption } from '../Globe';
import type { GlobeLayer } from '../Globe';
import { resetEChartsGLRegistration, isEChartsGLRegistered } from '../renderers/gl';
import { allDispatchedOptions, resetEChartsMock } from './fixtures/echarts-mock';
import { setChartsLocale, __resetChartsLocaleStoreForTests } from '../i18n/locale-store';

const SAMPLE_LAYERS: GlobeLayer[] = [
  {
    type: 'scatter3D',
    name: 'Cities',
    data: [
      { lon: -74, lat: 40.7, value: 8.4, label: 'NYC' },
      { lon: 28.97, lat: 41.01, value: 15.5, label: 'IST' },
    ],
  },
  {
    type: 'lines3D',
    name: 'Flights',
    data: [{ from: [-74, 40.7], to: [28.97, 41.01], value: 8000, label: 'NY-IST' }],
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

describe('Globe — empty / unsupported lifecycle', () => {
  it('empty layers renders the empty-state div without attempting GL load', () => {
    render(<Globe layers={[]} title="Empty" />);
    expect(screen.getByTestId('globe-chart-empty')).toBeInTheDocument();
    expect(allDispatchedOptions()).toHaveLength(0);
    expect(isEChartsGLRegistered()).toBe(false);
  });

  it('all-empty layer data is treated as empty (no GL load, no series dispatch)', () => {
    render(<Globe layers={[{ type: 'scatter3D', data: [] }]} title="Empty layer" />);
    expect(screen.getByTestId('globe-chart-empty')).toBeInTheDocument();
    expect(allDispatchedOptions()).toHaveLength(0);
  });

  it('WebGL unsupported renders the unsupported div with data-reason', async () => {
    mockedDetect.mockReturnValue({
      supported: false,
      webgl2: false,
      reason: 'context-unavailable',
    });
    render(<Globe layers={SAMPLE_LAYERS} title="No GL" />);
    await waitFor(() => {
      expect(screen.getByTestId('globe-chart-unsupported')).toBeInTheDocument();
    });
    const node = screen.getByTestId('globe-chart-unsupported');
    expect(node.getAttribute('data-reason')).toBe('webgl-unavailable');
    expect(allDispatchedOptions()).toHaveLength(0);
  });
});

describe('Globe — ready (GL registered) wrapper mount', () => {
  it('mounts ChartA11yShell once GL ready (testId globe-chart present)', async () => {
    render(<Globe layers={SAMPLE_LAYERS} title="Ready" />);
    await waitFor(() => {
      expect(screen.getByTestId('globe-chart')).toBeInTheDocument();
    });
  });

  it('a11y data table includes scatter (NYC) + lines (NY-IST) rows', async () => {
    render(<Globe layers={SAMPLE_LAYERS} title="A11y" />);
    await waitFor(() => {
      expect(screen.getByTestId('globe-chart')).toBeInTheDocument();
    });
    expect(screen.getByText(/NYC/)).toBeInTheDocument();
    expect(screen.getByText(/NY-IST/)).toBeInTheDocument();
  });
});

describe('buildGlobeOption — pure option builder', () => {
  it('emits one series per layer, all coordinateSystem === "globe"', () => {
    const opt = buildGlobeOption({
      layers: SAMPLE_LAYERS,
      palette: ['#3b82f6', '#22c55e', '#f59e0b'],
      fmt: String,
      animate: true,
    });
    const series = (opt.series ?? []) as Array<{ type: string; coordinateSystem?: string }>;
    expect(series).toHaveLength(2);
    expect(series.every((s) => s.coordinateSystem === 'globe')).toBe(true);
    expect(series[0].type).toBe('scatter3D');
    expect(series[1].type).toBe('lines3D');
  });

  it('passes baseTexture / environment / regions / viewControl through onto option.globe', () => {
    const opt = buildGlobeOption({
      layers: SAMPLE_LAYERS,
      palette: ['#3b82f6'],
      fmt: String,
      animate: true,
      baseTexture: '/assets/world.jpg',
      environment: '/assets/sky.hdr',
      regions: [{ name: 'Turkey', itemStyle: { color: '#ff0000' } }],
      viewControl: { autoRotate: true, distance: 500 },
    });
    const globe = opt.globe as Record<string, unknown>;
    expect(globe.baseTexture).toBe('/assets/world.jpg');
    expect(globe.environment).toBe('/assets/sky.hdr');
    expect(globe.regions).toEqual([{ name: 'Turkey', itemStyle: { color: '#ff0000' } }]);
    expect(globe.viewControl).toEqual({ autoRotate: true, distance: 500 });
  });

  it('omits displacementScale when heightTexture is absent (Codex iter-1)', () => {
    const opt = buildGlobeOption({
      layers: SAMPLE_LAYERS,
      palette: ['#3b82f6'],
      fmt: String,
      animate: true,
      displacementScale: 0.05, // no heightTexture → must be omitted
    });
    const globe = opt.globe as Record<string, unknown>;
    expect(globe.displacementScale).toBeUndefined();
    expect(globe.heightTexture).toBeUndefined();
  });

  it('emits displacementScale when heightTexture IS set', () => {
    const opt = buildGlobeOption({
      layers: SAMPLE_LAYERS,
      palette: ['#3b82f6'],
      fmt: String,
      animate: true,
      heightTexture: '/assets/elev.png',
      displacementScale: 0.1,
    });
    const globe = opt.globe as Record<string, unknown>;
    expect(globe.heightTexture).toBe('/assets/elev.png');
    expect(globe.displacementScale).toBe(0.1);
  });

  it('omits visualMap on a lines-only globe (no numeric scatter / bar layer)', () => {
    const opt = buildGlobeOption({
      layers: [
        {
          type: 'lines3D',
          data: [{ from: [0, 0], to: [1, 1] }],
        },
      ],
      palette: ['#3b82f6'],
      fmt: String,
      animate: true,
    });
    expect(opt.visualMap).toBeUndefined();
  });

  it('emits visualMap with min/max from numeric scatter / bar layers', () => {
    const opt = buildGlobeOption({
      layers: [
        {
          type: 'scatter3D',
          data: [
            { lon: 0, lat: 0, value: 1 },
            { lon: 1, lat: 1, value: 50 },
            { lon: 2, lat: 2, value: 25 },
          ],
        },
      ],
      palette: ['#3b82f6'],
      fmt: String,
      animate: true,
    });
    const visualMap = opt.visualMap as { min: number; max: number; dimension: number };
    expect(visualMap.dimension).toBe(2);
    expect(visualMap.min).toBe(1);
    expect(visualMap.max).toBe(50);
  });

  it('escapes layer name + point label in tooltip formatter (XSS guard)', () => {
    const opt = buildGlobeOption({
      layers: [
        {
          type: 'scatter3D',
          name: '<script>alert(1)</script>',
          data: [{ lon: 0, lat: 0, value: 1, label: '<img src=x onerror=alert(2)>' }],
        },
      ],
      palette: ['#000'],
      fmt: String,
      animate: true,
    });
    const tooltip = opt.tooltip as {
      formatter: (p: { value?: number[]; name?: string; seriesIndex?: number }) => string;
    };
    const out = tooltip.formatter({
      value: [0, 0, 1],
      name: '<img src=x onerror=alert(2)>',
      seriesIndex: 0,
    });
    expect(out).not.toMatch(/<script/);
    expect(out).not.toMatch(/<img/);
    expect(out).toMatch(/&lt;script/);
    expect(out).toMatch(/&lt;img/);
  });
});
