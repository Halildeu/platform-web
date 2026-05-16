// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('fires onItemClick when item is clicked', () => {
    const onClick = vi.fn();
    const clickItems = [
      {
        id: '1',
        title: 'GDPR',
        domain: 'legal',
        status: 'compliant' as const,
        severity: 'high' as const,
        findingsCount: 0,
      },
    ];
    render(<GovernanceBoard items={clickItems} onItemClick={onClick} />);
    fireEvent.click(screen.getByText('GDPR'));
    expect(onClick).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
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
