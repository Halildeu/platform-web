// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { NotificationCenter } from '../NotificationCenter';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('NotificationCenter', () => {
  it('renders notifications', () => {
    const items = [
      {
        id: '1',
        title: 'Build complete',
        type: 'success' as const,
        timestamp: '2026-03-23T10:00:00Z',
      },
    ];
    const { container } = render(<NotificationCenter notifications={items} />);
    expect(container.textContent).toContain('Build complete');
  });

  it('has no accessibility violations', async () => {
    const items = [
      {
        id: '1',
        title: 'Build complete',
        type: 'success' as const,
        timestamp: '2026-03-23T10:00:00Z',
      },
    ];
    const { container } = render(<NotificationCenter notifications={items} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const items = [
      {
        id: '1',
        title: 'Build complete',
        type: 'success' as const,
        timestamp: '2026-03-23T10:00:00Z',
      },
    ];
    render(<NotificationCenter notifications={items} />);
    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-label');
  });
});
