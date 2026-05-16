// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { MicroChart } from '../MicroChart';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('MicroChart', () => {
  it('renders sparkline', () => {
    const { container } = render(<MicroChart type="sparkline" data={[10, 20, 15, 30]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
  it('renders waffle', () => {
    const { container } = render(<MicroChart type="waffle" data={[65]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
  it('renders donut-ring', () => {
    const { container } = render(<MicroChart type="donut-ring" data={[75]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
  it('renders progress', () => {
    const { container } = render(<MicroChart type="progress" data={[80]} />);
    expect(container.querySelector('svg') || container.firstElementChild).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<MicroChart type="sparkline" data={[10, 20, 15, 30]} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<MicroChart type="sparkline" data={[10, 20, 15, 30]} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
  });
});
