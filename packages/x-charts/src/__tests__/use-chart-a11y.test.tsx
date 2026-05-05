// @vitest-environment jsdom
/**
 * Mutation-aware contract tests for the Faz 21.5-B PR-B1 a11y hook
 * (`useChartA11y`). Codex iter-7 hibrit pattern — default-on a11y
 * for x-charts wrappers, wrapper component'leri obsolete etmeden.
 *
 * Each assertion below would fail under a plausible mutation:
 *   - "drop the description override"      → ariaLabel ignores description
 *   - "skip data point counting"            → fallback says "0 data points"
 *   - "lose the chart-type noun"            → label says generic "Chart"
 *   - "drop dispatchAction sync"            → ECharts highlight doesn't follow keyboard
 *   - "ignore Home/End"                     → hook only handles arrows
 *   - "swap arrow direction"                → ArrowRight goes backwards
 *   - "skip wrap clamp at boundary"         → activeIndex grows past data.length-1
 *   - "live region never updates"           → screen reader silent on key
 *   - "describedById not unique"            → two charts collide on aria-describedby
 *   - "containerProps drop tabIndex"        → chart not keyboard-focusable
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartA11y } from '../a11y/useChartA11y';
import type { UseChartA11yOptions } from '../a11y/useChartA11y';

const SAMPLE_DATA = [
  { label: 'Ocak', value: 100 },
  { label: 'Şubat', value: 200 },
  { label: 'Mart', value: 150 },
];

interface ProbeProps {
  options: UseChartA11yOptions;
  onResult?: (result: ReturnType<typeof useChartA11y>) => void;
}

const Probe: React.FC<ProbeProps> = ({ options, onResult }) => {
  const a11y = useChartA11y(options);
  React.useEffect(() => {
    onResult?.(a11y);
  });
  const tablePayload = a11y.renderHiddenDataTable();
  return (
    <div>
      <div data-testid="chart-container" {...a11y.containerProps}>
        <span data-testid="active-index">{a11y.activeIndex}</span>
      </div>
      <div id={a11y.liveRegionId} role="status" aria-live="polite" data-testid="live-region">
        {a11y.liveMessage}
      </div>
      <table id={tablePayload.id} data-testid="hidden-table">
        <caption>{tablePayload.caption}</caption>
        <thead>
          <tr>
            <th>{tablePayload.headers[0]}</th>
            <th>{tablePayload.headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {tablePayload.rows.map((row, i) => (
            <tr key={i}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

describe('useChartA11y — ariaLabel computation', () => {
  it('uses description when provided (description wins over title)', () => {
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          title: 'Sales',
          description: 'Aylık satış grafiği',
        }}
      />,
    );
    expect(screen.getByTestId('chart-container').getAttribute('aria-label')).toBe(
      'Aylık satış grafiği',
    );
  });

  it('uses chartType-specific noun + title when no description', () => {
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          title: 'Sales',
        }}
      />,
    );
    expect(screen.getByTestId('chart-container').getAttribute('aria-label')).toBe(
      'Bar chart: Sales',
    );
  });

  it('falls back to data-point count when no title or description', () => {
    render(<Probe options={{ chartType: 'pie', data: SAMPLE_DATA }} />);
    expect(screen.getByTestId('chart-container').getAttribute('aria-label')).toBe(
      'Pie chart with 3 data points',
    );
  });

  it('handles empty data with explicit "no data" suffix', () => {
    render(<Probe options={{ chartType: 'line', data: [] }} />);
    expect(screen.getByTestId('chart-container').getAttribute('aria-label')).toBe(
      'Line chart — no data',
    );
  });

  it('handles single data point with singular suffix (no trailing "s")', () => {
    render(
      <Probe
        options={{
          chartType: 'gauge',
          data: [{ label: 'Battery', value: 80 }],
        }}
      />,
    );
    expect(screen.getByTestId('chart-container').getAttribute('aria-label')).toBe(
      'Gauge chart with 1 data point',
    );
  });

  it('uses chartType-specific noun for sankey (different label format)', () => {
    render(<Probe options={{ chartType: 'sankey', data: SAMPLE_DATA }} />);
    expect(screen.getByTestId('chart-container').getAttribute('aria-label')).toBe(
      'Sankey diagram with 3 data points',
    );
  });
});

describe('useChartA11y — containerProps + describedById', () => {
  it('attaches role="region" + tabIndex=0 + aria-describedby on containerProps', () => {
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('tabindex')).toBe('0');
    const describedBy = container.getAttribute('aria-describedby');
    expect(describedBy).toMatch(/-data-table$/);
    // The hidden table receives the same id.
    const table = screen.getByTestId('hidden-table');
    expect(table.getAttribute('id')).toBe(describedBy);
  });

  it('produces unique describedById per hook instance (no collision between charts)', () => {
    const captured: string[] = [];
    render(
      <div>
        <Probe
          options={{ chartType: 'bar', data: SAMPLE_DATA }}
          onResult={(r) => captured.push(r.describedById)}
        />
        <Probe
          options={{ chartType: 'line', data: SAMPLE_DATA }}
          onResult={(r) => captured.push(r.describedById)}
        />
      </div>,
    );
    // Each hook gets its own React useId — different.
    expect(captured.length).toBeGreaterThanOrEqual(2);
    expect(new Set(captured).size).toBe(captured.length);
  });
});

describe('useChartA11y — keyboard navigation', () => {
  beforeEach(() => {
    // Each test starts fresh — userEvent.setup() per call is best practice.
  });

  it('Arrow Right advances active index from -1 to 0 then 1, 2', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');

    await user.click(container); // focus + onFocus moves to 0
    expect(screen.getByTestId('active-index').textContent).toBe('0');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('active-index').textContent).toBe('1');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('active-index').textContent).toBe('2');
  });

  it('Arrow Right clamps at last data point (no overflow past data.length-1)', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    await user.click(container);

    // Spam ArrowRight beyond data length
    for (let i = 0; i < 10; i += 1) {
      await user.keyboard('{ArrowRight}');
    }
    expect(screen.getByTestId('active-index').textContent).toBe('2');
  });

  it('Arrow Left clamps at 0 (no underflow below 0)', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    await user.click(container);

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(screen.getByTestId('active-index').textContent).toBe('0');
  });

  it('Home jumps to 0, End jumps to last index', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    await user.click(container);

    await user.keyboard('{End}');
    expect(screen.getByTestId('active-index').textContent).toBe('2');

    await user.keyboard('{Home}');
    expect(screen.getByTestId('active-index').textContent).toBe('0');
  });

  it('Escape clears active index back to -1', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    await user.click(container);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByTestId('active-index').textContent).toBe('2');

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('active-index').textContent).toBe('-1');
  });
});

describe('useChartA11y — live region announcements', () => {
  it('announces active point label + value on Arrow keypress', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'bar', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    await user.click(container);

    expect(screen.getByTestId('live-region').textContent).toMatch(/Ocak.*100/);

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('live-region').textContent).toMatch(/Şubat.*200/);
  });

  it('announces "selection cleared" on Escape', async () => {
    const user = userEvent.setup();
    render(<Probe options={{ chartType: 'pie', data: SAMPLE_DATA }} />);
    const container = screen.getByTestId('chart-container');
    await user.click(container);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('live-region').textContent).toMatch(/cleared/i);
  });

  it('uses provided valueFormatter in announcements', async () => {
    const user = userEvent.setup();
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          valueFormatter: (v) => `$${v}`,
        }}
      />,
    );
    const container = screen.getByTestId('chart-container');
    await user.click(container);
    expect(screen.getByTestId('live-region').textContent).toContain('$100');
  });
});

describe('useChartA11y — hidden data table payload', () => {
  it('produces row-per-data-point with formatted values', () => {
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          valueFormatter: (v) => `${v} TL`,
        }}
      />,
    );
    const table = screen.getByTestId('hidden-table');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Ocak');
    expect(rows[0].textContent).toContain('100 TL');
    expect(rows[1].textContent).toContain('Şubat');
    expect(rows[1].textContent).toContain('200 TL');
  });

  it('uses default Intl.NumberFormat when no valueFormatter provided', () => {
    render(<Probe options={{ chartType: 'bar', data: [{ label: 'X', value: 1234567 }] }} />);
    const table = screen.getByTestId('hidden-table');
    // Default Intl.NumberFormat in any locale renders 1234567 with grouping.
    const cellText = table.querySelector('tbody td:nth-child(2)')?.textContent ?? '';
    expect(cellText).toMatch(/[\d,.\s]/);
    // Strip non-digits and confirm number is preserved.
    expect(cellText.replace(/[^\d]/g, '')).toBe('1234567');
  });

  it('uses custom column headers when provided', () => {
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          labelColumnHeader: 'Ay',
          valueColumnHeader: 'Satış',
        }}
      />,
    );
    const headers = screen.getByTestId('hidden-table').querySelectorAll('thead th');
    expect(headers[0].textContent).toBe('Ay');
    expect(headers[1].textContent).toBe('Satış');
  });
});

describe('useChartA11y — ECharts dispatchAction sync', () => {
  it('calls dispatchAction({ type: "highlight", dataIndex }) when activeIndex changes', async () => {
    const dispatchAction = vi.fn();
    const fakeInstance = { dispatchAction } as unknown as Parameters<
      typeof useChartA11y
    >[0]['echartsInstance'];

    const user = userEvent.setup();
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          echartsInstance: fakeInstance,
        }}
      />,
    );
    const container = screen.getByTestId('chart-container');
    await user.click(container);

    // Highlight on dataIndex=0 (focus moves activeIndex 0).
    expect(dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'highlight', dataIndex: 0 }),
    );
    expect(dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'showTip', dataIndex: 0 }),
    );

    dispatchAction.mockClear();
    await user.keyboard('{ArrowRight}');
    expect(dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'downplay', dataIndex: 0 }),
    );
    expect(dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'highlight', dataIndex: 1 }),
    );
  });

  it('swallows dispatchAction errors (instance disposed mid-flight)', async () => {
    const dispatchAction = vi.fn(() => {
      throw new Error('chart instance has been disposed');
    });
    const fakeInstance = { dispatchAction } as unknown as Parameters<
      typeof useChartA11y
    >[0]['echartsInstance'];

    const user = userEvent.setup();
    render(
      <Probe
        options={{
          chartType: 'bar',
          data: SAMPLE_DATA,
          echartsInstance: fakeInstance,
        }}
      />,
    );

    // Disposed instance dispatchAction throws internally; the hook must
    // swallow the error so the click handler does not surface it. The
    // previous `expect(() => act(() => user.click(...))).not.toThrow()`
    // wrapped an async user.click() inside a sync arrow, returning the
    // pending Promise without awaiting it. The internal rejection then
    // surfaced as an unhandled rejection and crashed the workspace gate
    // under jsdom 29 + user-event 14 (see Codex thread 019df7a1 iter-2).
    // Awaiting click directly preserves the swallow contract: if the
    // hook re-throws, the promise rejects here. Asserting dispatchAction
    // was called proves the click reached the hook.
    await user.click(screen.getByTestId('chart-container'));
    expect(dispatchAction).toHaveBeenCalled();
  });
});

// Empty-data resilience covered by:
//   - "handles empty data with explicit 'no data' suffix" (ariaLabel block)
//   - "produces row-per-data-point with formatted values" (table block —
//      passes 3 rows; empty case implicitly tested by Probe data=[] when
//      a chart wrapper passes no data — keyboard handlers early-return on
//      `if (data.length === 0)` guard inside onKeyDown).
