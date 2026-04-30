// @vitest-environment jsdom
/**
 * Deep functional test for CrossFilterDemoLive.
 *
 * Asserts the cross-filter store actually mutates the rendered totals
 * when a bar is clicked — i.e. clicking a region narrows the category
 * panel's data, and clicking a category narrows the region panel's data.
 *
 * Mutation discipline: each assertion would fail under a plausible
 * mutation of the production code:
 *  - "kill the click handler"          → Test 1 (click does nothing)
 *  - "skip filter application"         → Test 2 (totals never change)
 *  - "drop the reset action"           → Test 3 (totals stuck after reset)
 *  - "mis-aggregate by wrong field"    → Test 4 (filtered total is wrong)
 *
 * Only the canvas-based BarChart is mocked. Real CrossFilterProvider,
 * useChartCrossFilter, store, and event bridge run unmodified — that is
 * the path the production page exercises.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@mfe/x-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mfe/x-charts')>();

  // Render BarChart as a column of plain buttons. Real onDataPointClick
  // wiring is exposed verbatim so cross-filter event bridge integration
  // matches the production path.
  const MockBarChart: React.FC<{
    data: Array<{ label: string; value: number }>;
    title?: string;
    onDataPointClick?: (event: { label: string; value: number }) => void;
  }> = ({ data, title, onDataPointClick }) => (
    <div data-testid={`mock-barchart-${title}`}>
      {data.map((point) => (
        <button
          key={point.label}
          type="button"
          data-testid={`mock-barchart-bar-${point.label}`}
          data-value={point.value}
          onClick={() => onDataPointClick?.({ label: point.label, value: point.value })}
        >
          {point.label}: {point.value}
        </button>
      ))}
    </div>
  );

  return {
    ...actual,
    BarChart: MockBarChart,
  };
});

import CrossFilterDemoLive from '../CrossFilterDemoLive';

const TOTAL_REVENUE = 31800; // sum of all SALES_DATA values
const EUROPE_TOTAL = 4200 + 3100 + 2800; // 10100
const ELECTRONICS_TOTAL = 4200 + 5500 + 3800; // 13500

describe('CrossFilterDemoLive — cross-filter mutation observability', () => {
  it('initial render: both panels report the unfiltered total (31800)', () => {
    render(<CrossFilterDemoLive />);

    expect(screen.getByTestId('cross-filter-region-total')).toHaveTextContent(
      String(TOTAL_REVENUE),
    );
    expect(screen.getByTestId('cross-filter-category-total')).toHaveTextContent(
      String(TOTAL_REVENUE),
    );
    // No filtered badges yet.
    expect(screen.queryByTestId('cross-filter-region-badge')).toBeNull();
    expect(screen.queryByTestId('cross-filter-category-badge')).toBeNull();
  });

  it('clicking a region bar narrows the OTHER panel total to that region only', async () => {
    render(<CrossFilterDemoLive />);

    const regionPanel = screen.getByTestId('cross-filter-region-panel');
    fireEvent.click(within(regionPanel).getByTestId('mock-barchart-bar-Europe'));

    // The category panel must re-aggregate against Europe only.
    await waitFor(() => {
      expect(screen.getByTestId('cross-filter-category-total')).toHaveTextContent(
        String(EUROPE_TOTAL),
      );
    });
    // The category panel's badge appears (incoming filter).
    expect(screen.getByTestId('cross-filter-category-badge')).toHaveTextContent(/filtered \(1\)/);

    // The region panel keeps its own total because filters from this chart
    // do not apply to itself.
    expect(screen.getByTestId('cross-filter-region-total')).toHaveTextContent(
      String(TOTAL_REVENUE),
    );
  });

  it('each panel ignores its OWN emitted filter and only applies INCOMING filters', async () => {
    render(<CrossFilterDemoLive />);

    const regionPanel = screen.getByTestId('cross-filter-region-panel');
    const categoryPanel = screen.getByTestId('cross-filter-category-panel');

    fireEvent.click(within(regionPanel).getByTestId('mock-barchart-bar-Europe'));

    // Wait for the first filter to debounce-flush before issuing the second
    // click. Without this gap a rapid second click clears the first filter's
    // pending setTimeout and only the second filter ever lands.
    await waitFor(() => {
      expect(screen.getByTestId('cross-filter-category-badge')).toHaveTextContent(/filtered/);
    });

    fireEvent.click(within(categoryPanel).getByTestId('mock-barchart-bar-Electronics'));

    // After both filters propagate:
    //   - region panel sees category=Electronics filter → re-aggregates
    //     over Electronics-only rows → ELECTRONICS_TOTAL (13500).
    //   - category panel sees region=Europe filter → re-aggregates over
    //     Europe-only rows → EUROPE_TOTAL (10100).
    // Crucially, neither panel applies its own emitted filter (otherwise
    // both totals would collapse to the intersection 4200 — the wrong
    // semantics for a hub/spoke filter bus).
    await waitFor(() => {
      expect(screen.getByTestId('cross-filter-region-total')).toHaveTextContent(
        String(ELECTRONICS_TOTAL),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('cross-filter-category-total')).toHaveTextContent(
        String(EUROPE_TOTAL),
      );
    });

    // Both panels carry the "filtered (1)" badge.
    expect(screen.getByTestId('cross-filter-region-badge')).toHaveTextContent(/filtered \(1\)/);
    expect(screen.getByTestId('cross-filter-category-badge')).toHaveTextContent(/filtered \(1\)/);
  });

  it('reset button clears all filters and restores the original totals', async () => {
    render(<CrossFilterDemoLive />);

    const regionPanel = screen.getByTestId('cross-filter-region-panel');
    fireEvent.click(within(regionPanel).getByTestId('mock-barchart-bar-Asia'));

    await waitFor(() => {
      expect(Number(screen.getByTestId('cross-filter-category-total').textContent)).toBeLessThan(
        TOTAL_REVENUE,
      );
    });

    fireEvent.click(screen.getByTestId('cross-filter-reset'));

    await waitFor(() => {
      expect(screen.getByTestId('cross-filter-category-total')).toHaveTextContent(
        String(TOTAL_REVENUE),
      );
    });
    expect(screen.queryByTestId('cross-filter-region-badge')).toBeNull();
    expect(screen.queryByTestId('cross-filter-category-badge')).toBeNull();
  });
});
