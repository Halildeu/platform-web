// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { ExecutiveKPIStrip } from '../ExecutiveKPIStrip';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('ExecutiveKPIStrip', () => {
  const metrics = [
    { key: 'rev', label: 'Revenue', value: 1200000, format: 'currency' as const },
    { key: 'conv', label: 'Conversion', value: 23.5, format: 'percent' as const, target: 30 },
  ];

  it('renders metrics', () => {
    const { container } = render(<ExecutiveKPIStrip metrics={metrics} />);
    expect(container.firstElementChild).toBeTruthy();
    expect(container.textContent).toContain('Revenue');
  });

  it('renders loading skeleton', () => {
    const { container } = render(<ExecutiveKPIStrip metrics={metrics} loading />);
    expect(container.innerHTML).toContain('animate-pulse');
  });

  it('access="hidden" renders nothing', () => {
    const { container } = render(<ExecutiveKPIStrip metrics={metrics} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ExecutiveKPIStrip metrics={metrics} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<ExecutiveKPIStrip metrics={metrics} />);
    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-label', 'Key performance indicators');
  });
});
