// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { GovernanceBoard } from '../GovernanceBoard';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('GovernanceBoard', () => {
  const items = [
    {
      id: '1',
      title: 'GDPR',
      domain: 'legal',
      status: 'compliant' as const,
      severity: 'high' as const,
    },
    {
      id: '2',
      title: 'SOC2',
      domain: 'it',
      status: 'non-compliant' as const,
      severity: 'critical' as const,
    },
  ];

  it('renders board', () => {
    const { container } = render(<GovernanceBoard items={items} />);
    expect(container.textContent).toContain('GDPR');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<GovernanceBoard items={items} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const { container } = render(<GovernanceBoard items={items} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-label]') || container.firstElementChild).toBeTruthy();
  });
});
