// @vitest-environment jsdom
/**
 * Faz 21.5-B PR-B1 — BarChart referans entegrasyon contract.
 *
 * Codex iter-7 hibrit pattern: x-charts wrapper'ları useChartA11y hook'u
 * ile default-on a11y kazanıyor. Bu spec BarChart'ın hook'u doğru
 * compose ettiğini pin'liyor.
 *
 * Each assertion below would fail under a plausible mutation:
 *   - "drop containerProps spread"           → role="region" not on chart div
 *   - "ignore tabIndex"                       → keyboard-unreachable
 *   - "skip describedById wiring"             → SR can't find data table
 *   - "hidden table not rendered"             → data table absent
 *   - "swap describedById on table"           → aria-describedby orphan
 *   - "live region not rendered"              → no aria-live announcer
 *   - "loose hook call inside isEmpty branch" → empty state lacks ariaLabel
 *   - "table caption uses raw chart-type"     → caption ignores user title
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BarChart } from '../BarChart';
import type { ChartDataPoint } from '../BarChart';

/**
 * jsdom does not ship ResizeObserver; ECharts renderer uses it.
 * Minimal stub satisfies the renderer's constructor + observe/unobserve;
 * the resize callback never fires in these assertions.
 */
class ResizeObserverPolyfill {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const originalResizeObserver = (globalThis as { ResizeObserver?: typeof ResizeObserver })
  .ResizeObserver;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
  window.matchMedia = originalMatchMedia;
});

// Mock the renderer so jsdom doesn't try to init a real ECharts canvas.
const { setOptionMock, dispatchMock } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('../renderers/echarts-imports', () => {
  const fakeInstance = {
    setOption: setOptionMock,
    dispatchAction: dispatchMock,
    dispose: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getZr: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
    getDataURL: vi.fn(),
    getOption: vi.fn(() => ({})),
  };
  return {
    echarts: {
      init: vi.fn(() => fakeInstance),
      registerLocale: vi.fn(),
      registerTheme: vi.fn(),
    },
    registerECharts: vi.fn(),
  };
});

const SAMPLE_DATA: ChartDataPoint[] = [
  { label: 'Ocak', value: 100 },
  { label: 'Şubat', value: 200 },
  { label: 'Mart', value: 150 },
];

describe('BarChart — useChartA11y integration (Faz 21.5-B PR-B1)', () => {
  it('chart container exposes role="region", tabIndex=0, aria-label, aria-describedby', () => {
    render(<BarChart data={SAMPLE_DATA} title="Aylık Satış" />);
    const chart = screen.getByTestId('bar-chart');
    expect(chart.getAttribute('role')).toBe('region');
    expect(chart.getAttribute('tabindex')).toBe('0');
    expect(chart.getAttribute('aria-label')).toBe('Bar chart: Aylık Satış');
    const describedBy = chart.getAttribute('aria-describedby');
    expect(describedBy).toMatch(/-data-table$/);
  });

  it('uses description (when provided) over title in aria-label', () => {
    render(
      <BarChart
        data={SAMPLE_DATA}
        title="Sales"
        description="Aylık satış verileri Türk lirası cinsinden"
      />,
    );
    expect(screen.getByTestId('bar-chart').getAttribute('aria-label')).toBe(
      'Aylık satış verileri Türk lirası cinsinden',
    );
  });

  it('renders hidden data table with one row per data point', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} title="Aylık Satış" />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Ocak');
    expect(rows[1].textContent).toContain('Şubat');
    expect(rows[2].textContent).toContain('Mart');
  });

  it('hidden data table id matches chart aria-describedby', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} />);
    const chart = screen.getByTestId('bar-chart');
    const describedBy = chart.getAttribute('aria-describedby');
    const table = container.querySelector('table');
    expect(table?.getAttribute('id')).toBe(describedBy);
  });

  it('hidden data table caption mentions title or aria-label', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} title="Q1 Sales" />);
    const caption = container.querySelector('table caption');
    expect(caption?.textContent).toContain('Q1 Sales');
  });

  it('renders aria-live region with role="status"', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} />);
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
  });

  it('uses provided valueFormatter for hidden data table values', () => {
    const formatter = (v: number) => `${v} TL`;
    const { container } = render(<BarChart data={SAMPLE_DATA} valueFormatter={formatter} />);
    const cells = container.querySelectorAll('table tbody td');
    // Each row has 2 cells (label + value); value is the second cell.
    expect(cells[1].textContent).toBe('100 TL');
    expect(cells[3].textContent).toBe('200 TL');
  });

  it('empty state aria-label uses chart-type fallback', () => {
    render(<BarChart data={[]} />);
    const empty = screen.getByTestId('bar-chart-empty');
    // Hook computes "Bar chart — no data" when no data + no title/description.
    expect(empty.getAttribute('aria-label')).toBe('Bar chart — no data');
  });

  it('empty state aria-label respects title when provided', () => {
    render(<BarChart data={[]} title="Quarterly Revenue" />);
    const empty = screen.getByTestId('bar-chart-empty');
    expect(empty.getAttribute('aria-label')).toBe('Bar chart: Quarterly Revenue');
  });

  it('table headers default to "Label" and "Value"', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} />);
    const headers = container.querySelectorAll('table thead th');
    expect(headers[0].textContent).toBe('Label');
    expect(headers[1].textContent).toBe('Value');
  });
});
