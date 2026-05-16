// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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
