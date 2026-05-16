// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ParetoChart } from '../ParetoChart';
import type { ParetoItem } from '../ParetoChart';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

const paretoItems: ParetoItem[] = [
  { id: 'a', label: 'Defect A', value: 80 },
  { id: 'b', label: 'Defect B', value: 45 },
  { id: 'c', label: 'Defect C', value: 25 },
];

describe('ParetoChart', () => {
  it('renders SVG', () => {
    const { container } = render(<ParetoChart items={paretoItems} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders empty state when no items', () => {
    const { container } = render(<ParetoChart items={[]} />);
    expect(container.textContent).toContain('No data');
  });

  it('fires onItemClick handler', () => {
    const onClick = vi.fn();
    const { container } = render(<ParetoChart items={paretoItems} onItemClick={onClick} />);
    const rects = container.querySelectorAll('rect');
    // Find a bar rect (has rx=2 attribute)
    const barRect = Array.from(rects).find(
      (r) => r.getAttribute('rx') === '2' && Number(r.getAttribute('height') || 0) > 5,
    );
    if (barRect) fireEvent.click(barRect);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('returns null when access is hidden', () => {
    const { container } = render(<ParetoChart items={paretoItems} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ParetoChart items={paretoItems} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<ParetoChart items={paretoItems} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label', 'Pareto chart');
  });
});
