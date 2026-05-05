// @vitest-environment jsdom
/**
 * a11y-pr3 batch — 2 pattern components (Result, ShellSidebar).
 *
 * Patterns assemble multiple primitives into a higher-level layout;
 * adding separate test files would each duplicate the
 * `expectNoA11yViolations` boilerplate. This file groups them so the
 * a11y gate sees coverage for every uncovered pattern in one place.
 *
 * DetailSummary is intentionally NOT covered here. Its `entity` prop
 * is required and forwards to `EntitySummaryBlock`, which itself
 * cascades several required slots before bottoming out at the
 * `Descriptions` primitive — minimum-render setup approaches "render
 * the entire detail page" rather than a smoke test. Tracked
 * separately so a focused fixture can do justice to the entity
 * shape.
 */
import React from 'react';
import { afterEach, describe, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { expectNoA11yViolations } from '../../__tests__/a11y-utils';

import { Result } from '../result/Result';
import { ShellSidebar } from '../shell-sidebar/ShellSidebar';

afterEach(() => cleanup());

describe('Patterns — accessibility', () => {
  it('Result has no a11y violations (404 status)', async () => {
    const { container } = render(
      <Result
        status="404"
        title="Page not found"
        subTitle="The page you are looking for does not exist."
      />,
    );
    await expectNoA11yViolations(container);
  });

  it('Result has no a11y violations (success)', async () => {
    const { container } = render(
      <Result status="success" title="Order placed" subTitle="Confirmation email sent." />,
    );
    await expectNoA11yViolations(container);
  });

  it('ShellSidebar has no a11y violations (minimal nav)', async () => {
    // ShellSidebar composes AppSidebar internals; render a minimal nav
    // so axe sees the assembled structure without loading the entire
    // app shell.
    const { container } = render(
      <ShellSidebar
        navItems={[
          { key: 'home', label: 'Home', icon: <span aria-hidden="true">⌂</span>, href: '/home' },
          {
            key: 'reports',
            label: 'Reports',
            icon: <span aria-hidden="true">📊</span>,
            href: '/reports',
          },
        ]}
        activeNavKey="home"
        brand={{ title: 'Platform' }}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
