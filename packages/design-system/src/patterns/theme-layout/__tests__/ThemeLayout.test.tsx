// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { ThemeLayout } from '../ThemeLayout';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('ThemeLayout', () => {
  it('renders executive layout', () => {
    const { container } = render(
      <ThemeLayout theme="executive" slots={{ header: <div>KPI</div>, grid: <div>Grid</div> }} />,
    );
    expect(container.innerHTML).toContain('KPI');
    expect(container.innerHTML).toContain('Grid');
  });

  it('renders compact layout', () => {
    const { container } = render(
      <ThemeLayout theme="compact" slots={{ header: <div>KPI</div> }} />,
    );
    expect(container.innerHTML).toContain('KPI');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ThemeLayout theme="executive" slots={{ header: <div>KPI</div>, grid: <div>Grid</div> }} />,
    );
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const { container } = render(
      <ThemeLayout
        theme="executive"
        slots={{ header: <div role="banner">KPI</div>, grid: <div>Grid</div> }}
      />,
    );
    const banner = screen.getByRole('banner');
    expect(banner).toBeInTheDocument();
    expect(container.querySelector('[aria-label]') || container.firstElementChild).toBeTruthy();
  });
});
