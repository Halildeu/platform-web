// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { HoverDescription } from '../HoverDescription';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

describe('HoverDescription — render', () => {
  it('renders the trigger child', () => {
    render(
      <HoverDescription description="Helper text">
        <button>Trigger</button>
      </HoverDescription>,
    );
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });

  it('description is hidden by default (only on hover)', () => {
    render(
      <HoverDescription description="This is hidden until hover">
        <button>Trigger</button>
      </HoverDescription>,
    );
    // Description should not be in the rendered DOM until pointer hovers.
    expect(screen.queryByText('This is hidden until hover')).not.toBeInTheDocument();
  });

  it('shows description on mouse enter', () => {
    render(
      <HoverDescription description="Helper text" delay={0}>
        <button>Trigger</button>
      </HoverDescription>,
    );
    // HoverDescription wires onMouseEnter (not pointer events) so the
    // tooltip becomes visible after a synthesized mouseEnter on the
    // wrapper span. Use the wrapper, not the inner button.
    const trigger = screen.getByText('Trigger').parentElement!;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Helper text')).toBeInTheDocument();
  });
});

describe('HoverDescription — accessibility', () => {
  it('has no a11y violations (default state — tooltip hidden)', async () => {
    const { container } = render(
      <HoverDescription description="Helper text">
        <button>Trigger</button>
      </HoverDescription>,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (with title and description visible)', async () => {
    const { container } = render(
      <HoverDescription title="Pricing" description="Monthly billing details" delay={0}>
        <button>Pricing</button>
      </HoverDescription>,
    );
    const trigger = container.querySelector('button')!.parentElement!;
    fireEvent.mouseEnter(trigger);
    await expectNoA11yViolations(container);
  });
});
