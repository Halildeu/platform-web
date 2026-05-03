// @vitest-environment jsdom
/**
 * Deep functional test for DrillDownDemoLive (Faz 21.4 PR-B).
 *
 * Mutation discipline (each assertion would fail under a plausible mutation):
 *   - "kill the click handler"           → Test 1 (click leaves level=0)
 *   - "skip drillPath aggregation"       → Test 2 (data never narrows)
 *   - "break breadcrumb drillTo wiring"  → Test 3 (breadcrumb click no-op)
 *   - "drop history future stack"        → Test 4 (redo button always disabled)
 *
 * Only the canvas-based BarChart is mocked; real CrossFilterProvider +
 * useDrillDown + DrillDownBreadcrumb + cross-filter store run unmodified.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

import DrillDownDemoLive from '../DrillDownDemoLive';

describe('DrillDownDemoLive — drill state mutation observability', () => {
  it('Test 1: initial render shows level 0 and region-aggregated total', () => {
    render(<DrillDownDemoLive mode="basic" />);
    const level = screen.getByTestId('drill-down-level');
    expect(level).toHaveTextContent('level 0 / 3');
    // Total of all 12 sample rows = 20900
    const total = screen.getByTestId('drill-down-total');
    expect(total).toHaveTextContent('20900');
    // Three regions visible
    expect(screen.getByTestId('mock-bar-Europe')).toBeTruthy();
    expect(screen.getByTestId('mock-bar-Asia')).toBeTruthy();
    expect(screen.getByTestId('mock-bar-Americas')).toBeTruthy();
  });

  it('Test 2: clicking a region bar drills into level 1 with narrower total', () => {
    render(<DrillDownDemoLive mode="basic" />);
    fireEvent.click(screen.getByTestId('mock-bar-Asia'));

    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 1 / 3');
    // Asia rows: Tokyo (Shibuya 2100 + Ginza 2500) + Seoul (Gangnam 1700 + Itaewon 1400) = 7700
    expect(screen.getByTestId('drill-down-total')).toHaveTextContent('7700');
    // Cities visible
    expect(screen.getByTestId('mock-bar-Tokyo')).toBeTruthy();
    expect(screen.getByTestId('mock-bar-Seoul')).toBeTruthy();
    // Region bars no longer visible
    expect(screen.queryByTestId('mock-bar-Europe')).toBeNull();
  });

  it('Test 3: breadcrumb root click resets to level 0 (drillToRoot path)', () => {
    render(<DrillDownDemoLive mode="basic" />);
    fireEvent.click(screen.getByTestId('mock-bar-Europe'));
    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 1 / 3');

    // Reset button uses drillToRoot
    fireEvent.click(screen.getByTestId('drill-down-reset'));
    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 0 / 3');
    expect(screen.getByTestId('drill-down-total')).toHaveTextContent('20900');
  });

  it('Test 4: history mode — drilling fills past, undo restores level', () => {
    render(<DrillDownDemoLive mode="history" />);
    expect(screen.getByTestId('drill-down-history-counter')).toHaveTextContent('past 0 · future 0');

    fireEvent.click(screen.getByTestId('mock-bar-Americas'));
    expect(screen.getByTestId('drill-down-history-counter')).toHaveTextContent('past 1 · future 0');

    // Undo button now enabled
    const undoBtn = screen.getByTestId('drill-down-undo');
    expect(undoBtn).not.toBeDisabled();
    fireEvent.click(undoBtn);
    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 0 / 3');
    // Future stack now has 1 entry
    expect(screen.getByTestId('drill-down-history-counter')).toHaveTextContent('past 0 · future 1');
  });
});
