// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChartLegend } from '../ChartLegend';

/* ------------------------------------------------------------------ */
/*  Tests — uses x-charts internal cn / Text (no DS runtime mock).     */
/* ------------------------------------------------------------------ */

describe('ChartLegend', () => {
  const baseItems = [
    { label: 'Revenue', color: 'var(--action-primary)' },
    { label: 'Expenses', color: 'var(--state-danger-text)' },
    { label: 'Profit', color: 'var(--state-success-text)' },
  ];

  it('renders legend items with labels', () => {
    render(<ChartLegend items={baseItems} />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toBeInTheDocument();
  });

  it('renders color dots for each item', () => {
    const { container } = render(<ChartLegend items={baseItems} />);

    // Each item has a color dot span with backgroundColor
    const dots = container.querySelectorAll('span[style]');
    expect(dots.length).toBe(3);
    // jsdom converts hex to rgb in style attributes
    expect((dots[0] as HTMLElement).style.backgroundColor).toBeTruthy();
    expect((dots[1] as HTMLElement).style.backgroundColor).toBeTruthy();
    expect((dots[2] as HTMLElement).style.backgroundColor).toBeTruthy();
  });

  it('renders values when provided', () => {
    const itemsWithValues = [
      { label: 'Revenue', color: 'var(--action-primary)', value: '$45K' },
      { label: 'Expenses', color: 'var(--state-danger-text)', value: '$30K' },
    ];

    render(<ChartLegend items={itemsWithValues} />);

    expect(screen.getByText('$45K')).toBeInTheDocument();
    expect(screen.getByText('$30K')).toBeInTheDocument();
  });

  it('renders numeric values', () => {
    const itemsWithNumericValues = [{ label: 'A', color: 'var(--text-primary)', value: 123 }];

    render(<ChartLegend items={itemsWithNumericValues} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('shows horizontal layout (default)', () => {
    render(<ChartLegend items={baseItems} />);

    const el = screen.getByTestId('chart-legend');
    expect(el.className).toContain('flex-row');
    expect(el.className).not.toContain('flex-col');
  });

  it('shows vertical layout', () => {
    render(<ChartLegend items={baseItems} direction="vertical" />);

    const el = screen.getByTestId('chart-legend');
    expect(el.className).toContain('flex-col');
  });

  it("truncates with '+N more' when exceeding maxItems", () => {
    const manyItems = [
      { label: 'A', color: 'var(--text-primary)' },
      { label: 'B', color: 'var(--text-primary)' },
      { label: 'C', color: 'var(--text-primary)' },
      { label: 'D', color: '#444' },
      { label: 'E', color: '#555' },
    ];

    render(<ChartLegend items={manyItems} maxItems={3} />);

    // First 3 visible
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();

    // Last 2 truncated
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(screen.queryByText('E')).not.toBeInTheDocument();

    // "+2 more" shown
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('does not show overflow text when all items fit', () => {
    render(<ChartLegend items={baseItems} maxItems={5} />);

    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it('shows all items when maxItems is not set', () => {
    render(<ChartLegend items={baseItems} />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it('applies className', () => {
    render(<ChartLegend items={baseItems} className="legend-extra" />);

    const el = screen.getByTestId('chart-legend');
    expect(el.className).toContain('legend-extra');
  });

  /* -------- Faz 21.10 wave 7: mobile-tight horizontal gap -------- */

  it('Faz 21.10 wave 7: horizontal layout uses gap-x-3 on mobile and sm:gap-x-4 on tablet+', () => {
    render(<ChartLegend items={baseItems} />);
    const el = screen.getByTestId('chart-legend');
    // classList.contains avoids substring false-matches between gap-x-3
    // and sm:gap-x-3, etc.
    expect(el.classList.contains('gap-x-3')).toBe(true);
    expect(el.classList.contains('sm:gap-x-4')).toBe(true);
  });

  it('Faz 21.10 wave 7: vertical layout keeps the existing gap-1.5 (no mobile-specific change)', () => {
    render(<ChartLegend items={baseItems} direction="vertical" />);
    const el = screen.getByTestId('chart-legend');
    expect(el.classList.contains('gap-1.5')).toBe(true);
    // Vertical mode does NOT apply the mobile/tablet horizontal-gap split.
    expect(el.classList.contains('gap-x-3')).toBe(false);
    expect(el.classList.contains('sm:gap-x-4')).toBe(false);
  });

  it('has role=list and items have role=listitem', () => {
    render(<ChartLegend items={baseItems} />);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();

    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBe(3);
  });

  it('has aria-label', () => {
    render(<ChartLegend items={baseItems} />);

    const el = screen.getByTestId('chart-legend');
    expect(el.getAttribute('aria-label')).toBe('Chart legend');
  });
});
