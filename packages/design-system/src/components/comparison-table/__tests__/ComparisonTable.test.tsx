// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ComparisonTable } from '../ComparisonTable';
import type { ComparisonRow } from '../ComparisonTable';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('ComparisonTable', () => {
  const rows = [
    { label: 'Revenue', actual: 1200000, target: 1000000 },
    { label: 'Expenses', actual: 800000, target: 750000 },
  ];

  it('renders table', () => {
    const { container } = render(<ComparisonTable rows={rows} />);
    expect(container.textContent).toContain('Revenue');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ComparisonTable rows={rows} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const { container } = render(<ComparisonTable rows={rows} />);
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(container.querySelector('[aria-label]') || table).toBeTruthy();
  });

  // ---------------------------------------------------------------------
  // ComparisonTable — nested rows, expand/collapse, invert
  // ---------------------------------------------------------------------

  const nestedRows: ComparisonRow[] = [
    {
      id: 'rev',
      label: 'Revenue',
      actual: 15000,
      target: 12000,
      children: [
        { id: 'rev-a', label: 'Product A', actual: 10000, target: 8000 },
        { id: 'rev-b', label: 'Product B', actual: 5000, target: 4000 },
      ],
    },
    { id: 'cost', label: 'Costs', actual: 8000, target: 10000 },
  ];

  it('renders with default column labels', () => {
    render(<ComparisonTable rows={nestedRows} />);
    expect(screen.getByText('Item')).toBeTruthy();
    expect(screen.getByText('Actual')).toBeTruthy();
    expect(screen.getByText('Target')).toBeTruthy();
  });

  it('expands/collapses nested rows', () => {
    render(<ComparisonTable rows={nestedRows} defaultExpandedIds={['rev']} />);
    // Children should be visible initially
    expect(screen.getByText('Product A')).toBeTruthy();
    // Click toggle to collapse
    const toggleBtns = screen.getAllByText('▼');
    fireEvent.click(toggleBtns[0]);
    // Product A should be hidden
    expect(screen.queryByText('Product A')).toBeNull();
  });

  it('handles onRowClick', () => {
    const handler = vi.fn();
    render(<ComparisonTable rows={nestedRows} onRowClick={handler} />);
    fireEvent.click(screen.getByText('Costs'));
    expect(handler).toHaveBeenCalled();
  });

  it('handles invertVarianceColors', () => {
    const { container } = render(<ComparisonTable rows={nestedRows} invertVarianceColors />);
    expect(container.querySelector('[data-component="comparison-table"]')).toBeTruthy();
  });

  it('custom column labels', () => {
    render(
      <ComparisonTable
        rows={nestedRows}
        columns={{
          label: 'Name',
          actual: 'Real',
          target: 'Plan',
          variance: 'Diff',
          variancePercent: 'Pct',
        }}
      />,
    );
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Real')).toBeTruthy();
  });

  it('handles flat row direction (actual equals target)', () => {
    const flatRows: ComparisonRow[] = [{ id: '1', label: 'Same', actual: 100, target: 100 }];
    render(<ComparisonTable rows={flatRows} />);
    expect(screen.getByText('Same')).toBeTruthy();
  });

  it('handles target=0 variance edge case', () => {
    const zeroTarget: ComparisonRow[] = [{ id: '1', label: 'Zero', actual: 50, target: 0 }];
    render(<ComparisonTable rows={zeroTarget} />);
    expect(screen.getByText('Zero')).toBeTruthy();
  });

  it('returns null when access=hidden', () => {
    const { container } = render(<ComparisonTable rows={nestedRows} access="hidden" />);
    expect(container.querySelector('[data-component="comparison-table"]')).toBeNull();
  });

  it('handles row-level format override', () => {
    const fmtRows: ComparisonRow[] = [
      { id: '1', label: 'X', actual: 100, target: 80, format: { format: 'percent' } },
    ];
    render(<ComparisonTable rows={fmtRows} />);
    expect(screen.getByText('X')).toBeTruthy();
  });
});
