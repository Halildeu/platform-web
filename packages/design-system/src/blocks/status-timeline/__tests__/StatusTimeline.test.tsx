// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { StatusTimeline } from '../StatusTimeline';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('StatusTimeline', () => {
  it('renders events', () => {
    const events = [
      { id: '1', status: 'Created', timestamp: '2026-01-01T10:00:00Z' },
      { id: '2', status: 'In Progress', timestamp: '2026-01-02T14:00:00Z' },
    ];
    const { container } = render(<StatusTimeline events={events} />);
    expect(container.textContent).toContain('Created');
  });

  it('fires onEventClick when event is clicked', () => {
    const onClick = vi.fn();
    const events = [{ id: '1', status: 'Created', timestamp: '2026-01-01T10:00:00Z' }];
    render(<StatusTimeline events={events} onEventClick={onClick} />);
    fireEvent.click(screen.getByText('Created'));
    expect(onClick).toHaveBeenCalledWith('1');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const events = [{ id: '1', status: 'Created', timestamp: '2026-01-01T10:00:00Z' }];
    const { container } = render(<StatusTimeline events={events} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const events = [{ id: '1', status: 'Created', timestamp: '2026-01-01T10:00:00Z' }];
    render(<StatusTimeline events={events} />);
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-label', 'Status timeline');
  });
});
