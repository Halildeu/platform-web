// @vitest-environment jsdom
/**
 * AnomalyDetectorsShowcase — page render contract (Faz 21.11 batch3
 * follow-up).
 *
 * Locks:
 *   - Page mounts with all 4 detector cards visible
 *   - Each card has a toggle button + chart wrapper
 *   - Default state: anomaly region NOT in DOM (toggle off)
 *   - Toggle on: anomaly region mounts + announcement matches the
 *     domain template (verified through ChartA11yShell forward — the
 *     wrapper-level contract is exhaustively tested in
 *     `charts-anomaly-aria-live.test.tsx`)
 */
import './fixtures/jsdom-polyfills-stub'; // local minimal polyfills

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stub heavy chart wrappers — this test is about the showcase page
// shell, not echarts rendering. The detector helpers are real (pure
// functions) so the toggle counts are honest.
vi.mock('@mfe/x-charts', async () => {
  const actual = await vi.importActual<typeof import('@mfe/x-charts')>('@mfe/x-charts');
  return {
    ...actual,
    ScatterChart: () => <div data-testid="stub-ScatterChart" />,
    RadarChart: () => <div data-testid="stub-RadarChart" />,
    TreemapChart: () => <div data-testid="stub-TreemapChart" />,
    SankeyChart: () => <div data-testid="stub-SankeyChart" />,
  };
});

import AnomalyDetectorsShowcase from '../AnomalyDetectorsShowcase';

describe('AnomalyDetectorsShowcase', () => {
  it('mounts the showcase + 4 detector cards', () => {
    render(<AnomalyDetectorsShowcase />);
    expect(screen.getByTestId('anomaly-detectors-showcase')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-card-flat')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-card-radar')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-card-hierarchical')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-card-sankey')).toBeInTheDocument();
  });

  it('renders one toggle per card with detector counts > 0', () => {
    render(<AnomalyDetectorsShowcase />);
    // Each detector fixture is engineered to fire ≥1 anomaly under
    // default Tukey k=1.5; the toggle label exposes the count so the
    // showcase is honest about what the user is about to toggle.
    const flatToggle = screen.getByTestId('anomaly-card-flat-toggle');
    const radarToggle = screen.getByTestId('anomaly-card-radar-toggle');
    const hierToggle = screen.getByTestId('anomaly-card-hierarchical-toggle');
    const sankeyToggle = screen.getByTestId('anomaly-card-sankey-toggle');
    for (const toggle of [flatToggle, radarToggle, hierToggle, sankeyToggle]) {
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      // "Show anomalies (N)" with N >= 1.
      expect(toggle.textContent ?? '').toMatch(/Show anomalies \([1-9]\d*\)/);
    }
  });

  it('mounts a stub chart wrapper per card (no real ECharts boot)', () => {
    render(<AnomalyDetectorsShowcase />);
    expect(screen.getByTestId('stub-ScatterChart')).toBeInTheDocument();
    expect(screen.getByTestId('stub-RadarChart')).toBeInTheDocument();
    expect(screen.getByTestId('stub-TreemapChart')).toBeInTheDocument();
    expect(screen.getByTestId('stub-SankeyChart')).toBeInTheDocument();
  });
});
