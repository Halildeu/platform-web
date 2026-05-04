// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Progress } from '../Progress';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

describe('Progress — temel render', () => {
  it('progressbar role render eder', () => {
    render(<Progress percent={50} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
  it('aria-valuenow dogru set eder', () => {
    render(<Progress percent={75} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });
  it('yuzde metni gosterir', () => {
    render(<Progress percent={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
  it('showInfo=false yuzde gizler', () => {
    render(<Progress percent={42} showInfo={false} />);
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
  });
  it('100% de otomatik success olur', () => {
    const { container } = render(<Progress percent={100} />);
    expect(container.querySelector('svg')).toBeInTheDocument(); // check icon
  });
});

describe('Progress — circle', () => {
  it('circle tipinde SVG render eder', () => {
    const { container } = render(<Progress type="circle" percent={60} />);
    expect(container.querySelector('svg circle')).toBeInTheDocument();
  });
});

describe('Progress — steps', () => {
  it('dogru segment sayisi olusturur', () => {
    const { container } = render(<Progress percent={60} steps={5} />);
    const segments = container.querySelectorAll('.flex-1.rounded-full');
    expect(segments.length).toBe(5);
  });
});

describe('Progress — accessibility', () => {
  // axe `aria-progressbar-name` rule requires every progressbar to expose
  // an accessible name; we satisfy that with `aria-label` here. Real
  // consumers either use this or wrap the bar in a <label>.
  it('has no a11y violations (line, default)', async () => {
    const { container } = render(<Progress percent={50} aria-label="Upload progress" />);
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (circle with percent)', async () => {
    const { container } = render(
      <Progress type="circle" percent={75} aria-label="Profile completion" />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (success status hides info text)', async () => {
    const { container } = render(
      <Progress percent={100} status="success" aria-label="Upload complete" />,
    );
    await expectNoA11yViolations(container);
  });
});
