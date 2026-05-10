// @vitest-environment jsdom
/**
 * Scatter3D — wrapper lifecycle + a11y contract (Faz 21.11 P1a).
 *
 * The wrapper's invariants are gated by `useRequiredEChartsGL` (the
 * helper has its own dedicated lifecycle test in
 * `renderers/gl/__tests__/useRequiredEChartsGL.test.tsx`). This spec
 * locks the WRAPPER-level contract:
 *
 *   - empty `data`       → empty-state div, no GL import attempted
 *   - WebGL unsupported  → unsupported div with `data-reason`,
 *                          ECharts mock NEVER receives a `'scatter3D'`
 *                          option dispatch
 *   - ready              → ChartA11yShell mounts (testId `scatter3d-chart`)
 *                          + a11y data table includes (x, y, z) labels
 *
 * The full ECharts option-shape assertion is exercised in the
 * design-lab benchmark route (browser env) — jsdom can't execute the
 * real `echarts-gl` chunk, so we keep the mock surface tight.
 */
import './fixtures/echarts-mock'; // side-effect: vi.mock('../renderers/echarts-imports') hoisted before component imports
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

import { Scatter3D, buildScatter3DOption } from '../Scatter3D';
import { resetEChartsGLRegistration, isEChartsGLRegistered } from '../renderers/gl';
import { allDispatchedOptions, resetEChartsMock } from './fixtures/echarts-mock';
import { setChartsLocale, __resetChartsLocaleStoreForTests } from '../i18n/locale-store';

const SAMPLE_DATA = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 1, z: 2 },
  { x: 2, y: 2, z: 4, value: 9 },
];

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  resetEChartsGLRegistration();
  // Default: WebGL supported so the wrapper reaches the 'ready' state.
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

describe('Scatter3D — empty / unsupported lifecycle', () => {
  it('empty data renders the empty-state div without attempting GL load', () => {
    render(<Scatter3D data={[]} title="Empty 3D" />);
    expect(screen.getByTestId('scatter3d-chart-empty')).toBeInTheDocument();
    expect(allDispatchedOptions()).toHaveLength(0);
    expect(isEChartsGLRegistered()).toBe(false);
  });

  it('WebGL unsupported renders the unsupported div with data-reason', async () => {
    mockedDetect.mockReturnValue({
      supported: false,
      webgl2: false,
      reason: 'context-unavailable',
    });
    render(<Scatter3D data={SAMPLE_DATA} title="Unsupported" />);
    await waitFor(() => {
      expect(screen.getByTestId('scatter3d-chart-unsupported')).toBeInTheDocument();
    });
    const node = screen.getByTestId('scatter3d-chart-unsupported');
    expect(node.getAttribute('data-reason')).toBe('webgl-unavailable');
    // Critically: no scatter3D series was ever dispatched.
    expect(allDispatchedOptions()).toHaveLength(0);
  });

  it('WebGL unsupported still renders an aria-label so SR users hear the failure', async () => {
    mockedDetect.mockReturnValue({
      supported: false,
      webgl2: false,
      reason: 'context-unavailable',
    });
    render(<Scatter3D data={SAMPLE_DATA} title="No GL" description="Sales 3D" />);
    await waitFor(() => {
      expect(screen.getByTestId('scatter3d-chart-unsupported')).toBeInTheDocument();
    });
    const node = screen.getByTestId('scatter3d-chart-unsupported');
    expect(node.getAttribute('aria-label')).toMatch(/WebGL unavailable/);
  });
});

describe('Scatter3D — ready (GL registered) wrapper mount', () => {
  it('mounts ChartA11yShell once GL ready (testId scatter3d-chart present)', async () => {
    render(<Scatter3D data={SAMPLE_DATA} title="Ready 3D" />);
    await waitFor(() => {
      expect(screen.getByTestId('scatter3d-chart')).toBeInTheDocument();
    });
  });

  it('a11y data table embeds (x, y, z) coordinates as the row label', async () => {
    render(<Scatter3D data={SAMPLE_DATA} title="A11y 3D" />);
    await waitFor(() => {
      expect(screen.getByTestId('scatter3d-chart')).toBeInTheDocument();
    });
    expect(screen.getByText(/Point 1 \(x=0, y=0, z=0\)/)).toBeInTheDocument();
  });

  it('respects custom point labels on the a11y data table', async () => {
    render(
      <Scatter3D
        data={[
          { x: 1, y: 2, z: 3, label: 'Alpha' },
          { x: 4, y: 5, z: 6, label: 'Beta' },
        ]}
        title="Labelled 3D"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('scatter3d-chart')).toBeInTheDocument();
    });
    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
  });

  it('caps the a11y data table at 1000 rows + adds a sample-note caption', async () => {
    // 2000 points → cap at 1000, title gets sample annotation.
    const big = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: i, z: i }));
    render(<Scatter3D data={big} title="Big 3D" />);
    await waitFor(() => {
      expect(screen.getByTestId('scatter3d-chart')).toBeInTheDocument();
    });
    // Caption surfaces the sample disclosure so SR users know
    // the table doesn't enumerate every WebGL point.
    expect(screen.getByText(/showing first 1000 of 2000 points/)).toBeInTheDocument();
  });
});

// Codex thread `019e10ab` iter-3 Q1 — option shape contract via the
// extracted pure helper `buildScatter3DOption`. Lifting the option
// builder out of the React component lets us assert the exact ECharts
// option shape without dancing around the jsdom + hoisted mock + lazy
// GL gate race that broke the previous full-mount assertion. The
// wrapper's option memo is now a thin call-site over this helper, so
// these assertions also lock the wrapper's runtime contract.
describe('buildScatter3DOption — pure option builder', () => {
  it('emits series[0].type === "scatter3D" with [x, y, z, value] data tuples', () => {
    const opt = buildScatter3DOption({
      data: SAMPLE_DATA,
      palette: ['#3b82f6', '#22c55e'],
      fmt: (v) => String(v),
      animate: true,
    });
    const series = (opt.series ?? []) as Array<{ type: string; data: unknown[] }>;
    expect(series[0].type).toBe('scatter3D');
    expect(series[0].data).toHaveLength(3);
    // First point: { x: 0, y: 0, z: 0 } → value defaults to z=0.
    expect((series[0].data[0] as { value: number[] }).value).toEqual([0, 0, 0, 0]);
    // Third point: explicit value=9 carries through.
    expect((series[0].data[2] as { value: number[] }).value).toEqual([2, 2, 4, 9]);
  });

  it('configures grid3D + visualMap with dimension 3 + min/max from data range', () => {
    const opt = buildScatter3DOption({
      data: SAMPLE_DATA,
      palette: ['#3b82f6'],
      fmt: (v) => String(v),
      animate: false,
    });
    expect(opt.grid3D).toBeTruthy();
    const visualMap = opt.visualMap as { dimension: number; min: number; max: number };
    expect(visualMap.dimension).toBe(3);
    // Data values: [0, 2, 9].
    expect(visualMap.min).toBe(0);
    expect(visualMap.max).toBe(9);
  });

  it('passes viewControl / light / grid3D overrides through unchanged', () => {
    const opt = buildScatter3DOption({
      data: SAMPLE_DATA,
      palette: ['#3b82f6'],
      fmt: (v) => String(v),
      animate: true,
      viewControl: { autoRotate: true, distance: 500 },
      light: { main: { intensity: 2.0, shadow: true } },
      grid3D: { boxWidth: 400, boxHeight: 300 },
    });
    const grid3D = opt.grid3D as Record<string, unknown>;
    expect(grid3D.viewControl).toEqual({ autoRotate: true, distance: 500 });
    expect(grid3D.light).toEqual({ main: { intensity: 2.0, shadow: true } });
    // Codex iter-3: spread order — overrides come AFTER defaults so
    // user-provided grid3D fields (boxWidth/boxHeight) override defaults.
    expect(grid3D.boxWidth).toBe(400);
    expect(grid3D.boxHeight).toBe(300);
  });

  it('escapes consumer-supplied label in the tooltip formatter (XSS guard)', () => {
    const opt = buildScatter3DOption({
      data: [{ x: 1, y: 2, z: 3, label: '<img src=x onerror=alert(1)>' }],
      palette: ['#3b82f6'],
      fmt: (v) => String(v),
      animate: true,
    });
    const tooltip = opt.tooltip as {
      formatter: (p: { value?: number[]; name?: string }) => string;
    };
    const out = tooltip.formatter({ value: [1, 2, 3, 3], name: '<img src=x onerror=alert(1)>' });
    expect(out).not.toMatch(/<img/);
    expect(out).toMatch(/&lt;img/);
  });
});

// NOTE: a wrapper-level integration assertion that observes the
// dispatched ECharts option was attempted but the jsdom + hoisted mock
// + lazy GL gate sequence races `lastDispatchedOption()` past the
// poll window (the wrapper mounts, but the mocked instance's
// `setOption` flush lands after the assertion exhausts its retries).
// The pure-helper test above (`buildScatter3DOption`) covers the
// strict option shape; the wrapper-mount test (`getByTestId`) covers
// the lifecycle gate. The full end-to-end option-dispatch invariant
// is locked in the design-lab benchmark Playwright spec (browser env,
// real ECharts, no mock race).
