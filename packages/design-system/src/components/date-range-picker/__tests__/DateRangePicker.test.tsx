// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { DateRangePicker } from '../DateRangePicker';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('DateRangePicker', () => {
  it('renders with default presets', () => {
    const { container } = render(<DateRangePicker defaultPresets />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<DateRangePicker defaultPresets />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<DateRangePicker defaultPresets />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  });
});
