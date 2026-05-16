// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { FineKinney } from '../FineKinney';
import type { FineKinneyRisk } from '../FineKinney';
import { expectNoA11yViolations } from '../../../../__tests__/a11y-utils';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleRisks: FineKinneyRisk[] = [
  {
    id: '1',
    hazard: 'Kaygan zemin',
    probability: 3,
    frequency: 6,
    severity: 7,
    controls: ['Kaymaz paspas'],
    responsiblePerson: 'Ahmet',
    status: 'open',
  },
  {
    id: '2',
    hazard: 'Yüksekte çalışma',
    probability: 6,
    frequency: 3,
    severity: 40,
    status: 'in-progress',
  },
];

// ---------------------------------------------------------------------------
// FineKinney
// ---------------------------------------------------------------------------

describe('FineKinney', () => {
  it('renders risk rows', () => {
    const { container } = render(<FineKinney risks={sampleRisks} />);
    expect(container.textContent).toContain('Kaygan zemin');
    expect(container.textContent).toContain('Yüksekte çalışma');
  });

  it('renders empty state when no risks', () => {
    const { container } = render(<FineKinney risks={[]} />);
    expect(container.textContent).toContain('Kayıtlı risk bulunamadı');
  });

  it('fires onRiskClick handler', () => {
    const onClick = vi.fn();
    render(<FineKinney risks={sampleRisks} onRiskClick={onClick} />);
    const rows = screen.getAllByRole('button');
    fireEvent.click(rows[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('returns null when access is hidden', () => {
    const { container } = render(<FineKinney risks={sampleRisks} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<FineKinney risks={sampleRisks} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<FineKinney risks={sampleRisks} />);
    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-label', 'Fine-Kinney risk assessment');
  });
});
