// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusIndicator } from '../StatusIndicator';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

describe('StatusIndicator — render', () => {
  it('renders default status (online)', () => {
    const { container } = render(<StatusIndicator />);
    // Default status renders a span; assert presence instead of label
    // because showLabel defaults true but no label prop renders empty.
    expect(container.firstElementChild).toBeTruthy();
  });

  it('renders custom label when provided', () => {
    render(<StatusIndicator status="online" label="Online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('moves label into a sr-only span when showLabel=false', () => {
    // showLabel=false keeps the label in the DOM as `sr-only` so screen
    // readers can still announce it; the visual label is hidden.
    const { container } = render(<StatusIndicator status="busy" label="Busy" showLabel={false} />);
    const label = screen.getByText('Busy');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('sr-only');
    // Confirm the label is the only Busy-text node.
    expect(container.textContent).toBe('Busy');
  });

  it('renders different statuses without crashing', () => {
    for (const status of ['online', 'offline', 'busy', 'away', 'unknown'] as const) {
      const { unmount } = render(<StatusIndicator status={status} label={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('StatusIndicator — accessibility', () => {
  it('has no a11y violations (with label)', async () => {
    const { container } = render(<StatusIndicator status="online" label="Online" />);
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (icon-only with aria-label)', async () => {
    // Without a visible label, the dot needs an accessible name so
    // screen readers can announce the status state.
    const { container } = render(
      <StatusIndicator status="busy" showLabel={false} aria-label="Busy" />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (with pulse animation)', async () => {
    const { container } = render(<StatusIndicator status="online" label="Live" pulse />);
    await expectNoA11yViolations(container);
  });
});
