// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { BulletChart } from '../BulletChart';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('BulletChart', () => {
  it('renders SVG', () => {
    const { container } = render(<BulletChart actual={75} target={90} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<BulletChart actual={75} target={90} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<BulletChart actual={75} target={90} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label');
  });

  it('renders horizontal by default', () => {
    const { container } = render(
      <BulletChart value={72} target={85} label="Revenue" subtitle="Q4" />,
    );
    expect(container.querySelector('[data-component="bullet-chart"]')).toBeTruthy();
  });

  it('renders vertical orientation', () => {
    const { container } = render(
      <BulletChart value={72} target={85} orientation="vertical" label="Rev" />,
    );
    expect(container.querySelector('[data-component="bullet-chart"]')).toBeTruthy();
  });

  it('renders vertical without label', () => {
    const { container } = render(<BulletChart value={50} target={70} orientation="vertical" />);
    expect(container.querySelector('[data-component="bullet-chart"]')).toBeTruthy();
  });

  it('renders sm size', () => {
    render(<BulletChart value={50} target={70} size="sm" label="X" />);
  });

  it('renders lg size', () => {
    render(<BulletChart value={50} target={70} size="lg" label="X" />);
  });

  it('returns null when access=hidden', () => {
    const { container } = render(<BulletChart value={50} target={70} access="hidden" />);
    expect(container.querySelector('[data-component="bullet-chart"]')).toBeNull();
  });

  it('handles max=min (scaleValue edge case)', () => {
    render(<BulletChart value={50} target={50} min={50} max={50} />);
    // Should render without error
  });

  it('handles custom ranges with color', () => {
    render(
      <BulletChart
        value={60}
        target={80}
        ranges={[
          { limit: 30, label: 'Low', color: 'red' },
          { limit: 70, label: 'Mid', color: 'yellow' },
          { limit: 100, label: 'High', color: 'green' },
        ]}
      />,
    );
  });

  it('handles horizontal without label or subtitle', () => {
    render(<BulletChart value={60} target={80} />);
  });
});
