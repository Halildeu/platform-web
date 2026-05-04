// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { CommandPaletteTrigger } from '../CommandPaletteTrigger';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

describe('CommandPaletteTrigger — render', () => {
  it('renders default placeholder text', () => {
    render(<CommandPaletteTrigger />);
    expect(screen.getByText('Search…')).toBeInTheDocument();
  });

  it('renders custom placeholder', () => {
    render(<CommandPaletteTrigger placeholder="Find anything" />);
    expect(screen.getByText('Find anything')).toBeInTheDocument();
  });

  it('renders shortcut hint when provided', () => {
    render(<CommandPaletteTrigger shortcut="Ctrl+K" />);
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
  });

  it('hides text in compact mode (icon-only)', () => {
    render(<CommandPaletteTrigger compact placeholder="Search…" />);
    // Compact mode: placeholder text should not render (icon-only).
    expect(screen.queryByText('Search…')).not.toBeInTheDocument();
  });

  it('forwards onClick handler', () => {
    const handleClick = vi.fn();
    render(<CommandPaletteTrigger onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPaletteTrigger — accessibility', () => {
  it('has no a11y violations (default)', async () => {
    const { container } = render(<CommandPaletteTrigger />);
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (compact icon-only with aria-label)', async () => {
    // Icon-only buttons MUST carry an accessible name; `aria-label`
    // is the standard escape hatch.
    const { container } = render(
      <CommandPaletteTrigger compact aria-label="Open command palette" />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (with shortcut + custom placeholder)', async () => {
    const { container } = render(
      <CommandPaletteTrigger placeholder="Find anything" shortcut="Ctrl+K" />,
    );
    await expectNoA11yViolations(container);
  });
});
