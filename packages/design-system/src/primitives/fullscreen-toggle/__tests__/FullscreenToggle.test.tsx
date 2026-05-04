// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { FullscreenToggle } from '../FullscreenToggle';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

describe('FullscreenToggle — render', () => {
  it('renders with default expand label', () => {
    render(<FullscreenToggle />);
    expect(screen.getByText('Fullscreen')).toBeInTheDocument();
  });

  it('renders custom expandLabel', () => {
    render(<FullscreenToggle expandLabel="Open large view" />);
    expect(screen.getByText('Open large view')).toBeInTheDocument();
  });

  it('hides label when showLabel=false (icon-only)', () => {
    render(<FullscreenToggle showLabel={false} />);
    expect(screen.queryByText('Fullscreen')).not.toBeInTheDocument();
  });

  it('forwards onClick (separate from onToggle)', () => {
    const handleClick = vi.fn();
    render(<FullscreenToggle onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('FullscreenToggle — accessibility', () => {
  it('has no a11y violations (default with text label)', async () => {
    const { container } = render(<FullscreenToggle />);
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (icon-only with aria-label)', async () => {
    // Icon-only buttons need an accessible name when text label is hidden.
    const { container } = render(
      <FullscreenToggle showLabel={false} aria-label="Toggle fullscreen" />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (outline variant, sm size)', async () => {
    const { container } = render(<FullscreenToggle variant="outline" size="sm" />);
    await expectNoA11yViolations(container);
  });
});
