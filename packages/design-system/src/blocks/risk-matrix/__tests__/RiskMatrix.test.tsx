// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { RiskMatrix } from '../RiskMatrix';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('RiskMatrix', () => {
  const risks = [
    { id: '1', title: 'Data breach', likelihood: 3 as const, impact: 5 as const },
    { id: '2', title: 'Budget overrun', likelihood: 4 as const, impact: 3 as const },
  ];

  it('renders grid', () => {
    const { container } = render(<RiskMatrix risks={risks} />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it('access="hidden" renders nothing', () => {
    const { container } = render(<RiskMatrix risks={risks} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<RiskMatrix risks={risks} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<RiskMatrix risks={risks} />);
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-label', 'Risk assessment matrix');
  });
});
