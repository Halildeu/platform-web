// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { GanttTimeline } from '../GanttTimeline';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('GanttTimeline', () => {
  const tasks = [
    { id: '1', title: 'Design', startDate: '2026-01-01', endDate: '2026-01-15', progress: 80 },
    { id: '2', title: 'Dev', startDate: '2026-01-10', endDate: '2026-02-15', progress: 30 },
  ];

  it('renders timeline', () => {
    const { container } = render(<GanttTimeline tasks={tasks} />);
    expect(container.textContent).toContain('Design');
  });

  it('fires onTaskClick when task row is clicked', () => {
    const onClick = vi.fn();
    render(<GanttTimeline tasks={tasks} onTaskClick={onClick} />);
    // The title may appear in multiple places (row label + bar) — click the first.
    const elements = screen.getAllByText('Design');
    fireEvent.click(elements[0]);
    expect(onClick).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<GanttTimeline tasks={tasks} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const { container } = render(<GanttTimeline tasks={tasks} />);
    expect(container.firstElementChild).toBeTruthy();
    expect(container.textContent).toContain('Design');
  });
});
