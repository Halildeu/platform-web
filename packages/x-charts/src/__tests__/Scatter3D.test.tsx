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

import { Scatter3D } from '../Scatter3D';
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
});
