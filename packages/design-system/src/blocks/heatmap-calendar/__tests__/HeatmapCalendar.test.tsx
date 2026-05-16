// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { HeatmapCalendar } from '../HeatmapCalendar';
import type { HeatmapDay } from '../HeatmapCalendar';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

const heatmapData: HeatmapDay[] = [
  { date: '2025-06-01', value: 5 },
  { date: '2025-06-15', value: 12 },
  { date: '2025-07-04', value: 3 },
];

describe('HeatmapCalendar', () => {
  it('renders SVG', () => {
    const { container } = render(
      <HeatmapCalendar data={heatmapData} startDate="2025-01-01" endDate="2025-12-31" />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('handles empty data', () => {
    const { container } = render(
      <HeatmapCalendar data={[]} startDate="2025-01-01" endDate="2025-12-31" />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('fires onDayClick handler', () => {
    const onClick = vi.fn();
    const { container } = render(
      <HeatmapCalendar
        data={heatmapData}
        startDate="2025-01-01"
        endDate="2025-12-31"
        onDayClick={onClick}
      />,
    );
    // Find a rect with a value aria-label (has data)
    const rects = container.querySelectorAll('rect[aria-label]');
    const dayRect = Array.from(rects).find((r) => {
      const label = r.getAttribute('aria-label') || '';
      return label.includes(': 5');
    });
    if (dayRect) fireEvent.click(dayRect);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('returns null when access is hidden', () => {
    const { container } = render(
      <HeatmapCalendar
        data={heatmapData}
        startDate="2025-01-01"
        endDate="2025-12-31"
        access="hidden"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    // 6-week / 42-day fixture range: Sunday 2025-06-01 → Saturday 2025-07-12.
    // The full-year (365-day) variant exceeded the 15s axe traversal budget
    // on the CI runner (PR #238 surfaced the timeout). Component logic is
    // identical for any startDate/endDate range; axe asserts the structural
    // ARIA + landmark contract on a representative grid. Range covers a
    // month transition (June → July) and includes existing heatmapData
    // entries 2025-06-01, 2025-06-15, 2025-07-04 so non-empty cell rendering
    // is exercised. Codex thread 019df8a4 plan-time AGREE.
    const { container } = render(
      <HeatmapCalendar data={heatmapData} startDate="2025-06-01" endDate="2025-07-12" />,
    );
    await expectNoA11yViolations(container);
  }, 15_000);

  it('has accessible ARIA structure', () => {
    render(<HeatmapCalendar data={heatmapData} startDate="2025-01-01" endDate="2025-12-31" />);
    const img = screen.getByRole('img', { name: 'Heatmap calendar' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label', 'Heatmap calendar');
  });
});
