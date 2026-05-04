// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HeaderBar } from '../HeaderBar';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

describe('HeaderBar — render', () => {
  it('renders children', () => {
    render(
      <HeaderBar>
        <nav>App nav</nav>
      </HeaderBar>,
    );
    expect(screen.getByText('App nav')).toBeInTheDocument();
  });

  it('renders as a <header> landmark by default', () => {
    const { container } = render(
      <HeaderBar>
        <span>x</span>
      </HeaderBar>,
    );
    // HeaderBar uses an actual <header> element so screen readers can
    // discover the banner landmark; this asserts the contract instead
    // of relying on visual presence.
    expect(container.querySelector('header')).toBeInTheDocument();
  });

  it('renders inner card by default', () => {
    const { container } = render(
      <HeaderBar>
        <span>x</span>
      </HeaderBar>,
    );
    // Default `card={true}` wraps children in a styled inner div.
    const header = container.querySelector('header');
    expect(header?.firstElementChild).toBeTruthy();
  });
});

describe('HeaderBar — accessibility', () => {
  it('has no a11y violations (default)', async () => {
    const { container } = render(
      <HeaderBar>
        <nav aria-label="Primary">
          <a href="/home">Home</a>
        </nav>
      </HeaderBar>,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (card=false bare layout)', async () => {
    const { container } = render(
      <HeaderBar card={false}>
        <nav aria-label="Primary">
          <a href="/home">Home</a>
        </nav>
      </HeaderBar>,
    );
    await expectNoA11yViolations(container);
  });
});
