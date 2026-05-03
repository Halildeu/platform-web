// @vitest-environment jsdom
/**
 * Deep functional test for CrossFilterGridDemoLive (Faz 21.4 PR-B).
 *
 * Mutation discipline:
 *   - "kill click handler"           → Test 1 (filter model stays empty)
 *   - "drop bridge subscription"     → Test 2 (grid panel never updates)
 *   - "skip clearAllFilters"         → Test 3 (reset leaves model intact)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@mfe/x-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mfe/x-charts')>();
  const MockBarChart: React.FC<{
    data: Array<{ label: string; value: number }>;
    title?: string;
    onDataPointClick?: (event: { label: string; value: number }) => void;
  }> = ({ data, title, onDataPointClick }) => (
    <div data-testid={`mock-barchart-${title ?? 'untitled'}`}>
      {data.map((point) => (
        <button
          key={point.label}
          type="button"
          data-testid={`mock-bar-${point.label}`}
          onClick={() => onDataPointClick?.({ label: point.label, value: point.value })}
        >
          {point.label}: {point.value}
        </button>
      ))}
    </div>
  );
  return { ...actual, BarChart: MockBarChart };
});

import CrossFilterGridDemoLive from '../CrossFilterGridDemoLive';

describe('CrossFilterGridDemoLive — chart→grid bridge observability', () => {
  it('Test 1: initial render — no filters, mock grid panel shows empty state', () => {
    render(<CrossFilterGridDemoLive />);
    expect(screen.getByTestId('cross-filter-grid-empty')).toBeTruthy();
    expect(screen.getByTestId('cross-filter-grid-filter-count')).toHaveTextContent('0 filters');
  });

  it('Test 2: clicking a chart bar pushes a filter through the bridge into the mock grid', async () => {
    render(<CrossFilterGridDemoLive />);

    fireEvent.click(screen.getByTestId('mock-bar-Asia'));

    // Bridge fires async; let React reconcile via waitFor.
    await waitFor(() => {
      expect(screen.getByTestId('cross-filter-grid-filter-count')).toHaveTextContent('1 filter');
    });

    expect(screen.queryByTestId('cross-filter-grid-empty')).toBeNull();
    const json = screen.getByTestId('cross-filter-grid-filter-json');
    expect(json.textContent).toContain('region');
    expect(json.textContent).toContain('Asia');
  });

  it('Test 3: reset button clears the grid filter model', async () => {
    render(<CrossFilterGridDemoLive />);
    fireEvent.click(screen.getByTestId('mock-bar-Europe'));
    await waitFor(() => {
      expect(screen.queryByTestId('cross-filter-grid-empty')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('cross-filter-grid-reset'));
    await waitFor(() => {
      expect(screen.queryByTestId('cross-filter-grid-empty')).not.toBeNull();
    });
    expect(screen.getByTestId('cross-filter-grid-filter-count')).toHaveTextContent('0 filters');
  });
});
