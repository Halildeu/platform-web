// @vitest-environment jsdom
/**
 * a11y-pr2 batch — 13 AppSidebar component family
 *
 * The AppSidebar family ships with contract tests but no axe-core
 * coverage. Adding 13 separate `<Component>.a11y.test.tsx` files
 * would be 13× the overhead for a family that shares a single
 * `SidebarContext` wrapper. This file groups all 13 axe runs together;
 * each test imports the real component, wraps it in a minimal
 * `SidebarContext.Provider`, and asserts no violations.
 */
import React from 'react';
import { afterEach, describe, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';
import { SidebarContext } from '../useSidebar';
import type { SidebarContextValue } from '../types';

import { AppSidebar } from '../AppSidebar';
import { AppSidebarHeader } from '../AppSidebarHeader';
import { AppSidebarFooter } from '../AppSidebarFooter';
import { AppSidebarFooterAction } from '../AppSidebarFooterAction';
import { AppSidebarFooterStatus } from '../AppSidebarFooterStatus';
import { AppSidebarGroup } from '../AppSidebarGroup';
import { AppSidebarNav } from '../AppSidebarNav';
import { AppSidebarNavItem } from '../AppSidebarNavItem';
import { AppSidebarResizer } from '../AppSidebarResizer';
import { AppSidebarSearch } from '../AppSidebarSearch';
import { AppSidebarSection } from '../AppSidebarSection';
import { AppSidebarSeparator } from '../AppSidebarSeparator';
import { AppSidebarTrigger } from '../AppSidebarTrigger';

afterEach(() => cleanup());

const mockCtx: SidebarContextValue = {
  mode: 'expanded',
  toggle: () => {},
  expand: () => {},
  collapse: () => {},
  isCollapsed: false,
  resize: null,
  setWidth: () => {},
  setIsResizing: () => {},
};

const wrap = (ui: React.ReactElement) =>
  render(<SidebarContext.Provider value={mockCtx}>{ui}</SidebarContext.Provider>);

describe('AppSidebar family — accessibility', () => {
  it('AppSidebar root has no a11y violations', async () => {
    const { container } = render(
      <AppSidebar>
        <div>Sidebar content</div>
      </AppSidebar>,
    );
    await expectNoA11yViolations(container);
  });

  it('AppSidebarHeader has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarHeader>Title</AppSidebarHeader>);
    await expectNoA11yViolations(container);
  });

  it('AppSidebarFooter has no a11y violations', async () => {
    const { container } = wrap(
      <AppSidebarFooter>
        <span>footer</span>
      </AppSidebarFooter>,
    );
    await expectNoA11yViolations(container);
  });

  it('AppSidebarFooterAction has no a11y violations', async () => {
    const { container } = wrap(
      <AppSidebarFooterAction
        icon={<span aria-hidden="true">⚙</span>}
        label="Settings"
        onClick={vi.fn()}
      />,
    );
    await expectNoA11yViolations(container);
  });

  it('AppSidebarFooterStatus has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarFooterStatus label="Online" />);
    await expectNoA11yViolations(container);
  });

  it('AppSidebarGroup has no a11y violations', async () => {
    const { container } = wrap(
      <AppSidebarGroup label="Section">
        <span>group child</span>
      </AppSidebarGroup>,
    );
    await expectNoA11yViolations(container);
  });

  it('AppSidebarNav has no a11y violations', async () => {
    const { container } = wrap(
      <AppSidebarNav>
        <AppSidebarNavItem label="Home" href="/home" />
      </AppSidebarNav>,
    );
    await expectNoA11yViolations(container);
  });

  it('AppSidebarNavItem has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarNavItem label="Dashboard" href="/dashboard" />);
    await expectNoA11yViolations(container);
  });

  it('AppSidebarResizer has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarResizer aria-label="Resize sidebar" />);
    await expectNoA11yViolations(container);
  });

  it('AppSidebarSearch has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarSearch placeholder="Search…" />);
    await expectNoA11yViolations(container);
  });

  it('AppSidebarSection has no a11y violations', async () => {
    const { container } = wrap(
      <AppSidebarSection title="Section title">
        <span>section content</span>
      </AppSidebarSection>,
    );
    await expectNoA11yViolations(container);
  });

  it('AppSidebarSeparator has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarSeparator />);
    await expectNoA11yViolations(container);
  });

  it('AppSidebarTrigger has no a11y violations', async () => {
    const { container } = wrap(<AppSidebarTrigger aria-label="Toggle sidebar" />);
    await expectNoA11yViolations(container);
  });
});
