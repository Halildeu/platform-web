// @vitest-environment jsdom
/**
 * Deep functional test for DrillDownDemoLive (Faz 21.4 PR-B).
 *
 * Mutation discipline (each assertion would fail under a plausible mutation):
 *   - "kill the click handler"          → Test 1 (click leaves level=0)
 *   - "skip drillPath aggregation"      → Test 2 (data never narrows)
 *   - "drop drillToRoot from reset btn" → Test 3 (reset stays at level 1)
 *   - "lose drillCount accumulation"    → Test 4 (counter stays at 0)
 *   - "break breadcrumb drillTo wiring" → Test 5 (root crumb no-op)
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

  it('Test 4: history mode — drillCount monotonic, undo decreases depth not count', () => {
    render(<DrillDownDemoLive mode="history" />);
    expect(screen.getByTestId('drill-down-history-counter')).toHaveTextContent(
      'depth 0 · drills fired 0',
    );

    fireEvent.click(screen.getByTestId('mock-bar-Americas'));
    expect(screen.getByTestId('drill-down-history-counter')).toHaveTextContent(
      'depth 1 · drills fired 1',
    );

    const undoBtn = screen.getByTestId('drill-down-undo');
    expect(undoBtn).not.toBeDisabled();
    fireEvent.click(undoBtn);
    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 0 / 3');
    // drillCount stays 1 — it counts drills fired, not depth.
    expect(screen.getByTestId('drill-down-history-counter')).toHaveTextContent(
      'depth 0 · drills fired 1',
    );
  });

  it('Test 5: breadcrumb item click navigates back via drillTo wiring', () => {
    render(<DrillDownDemoLive mode="basic" />);
    fireEvent.click(screen.getByTestId('mock-bar-Europe'));
    fireEvent.click(screen.getByTestId('mock-bar-London'));
    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 2 / 3');

    // DrillDownBreadcrumb renders one <button> per breadcrumb item; the
    // first one is the root and corresponds to drillTo(-1).
    const breadcrumb = screen.getByTestId('drill-down-breadcrumb');
    const rootBtn = breadcrumb.querySelector('button');
    expect(rootBtn).not.toBeNull();
    fireEvent.click(rootBtn!);
    expect(screen.getByTestId('drill-down-level')).toHaveTextContent('level 0 / 3');
  });
});
