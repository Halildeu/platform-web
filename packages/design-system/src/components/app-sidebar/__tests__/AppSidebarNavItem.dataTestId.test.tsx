// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { AppSidebarNavItem } from '../AppSidebarNavItem';
import { SidebarContext } from '../useSidebar';
import type { SidebarContextValue } from '../types';

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

/**
 * The type had promised dataTestId since the flat-sidebar days while
 * ShellSidebar forwarded it into a className ternary, so the DOM never carried
 * it and every getByTestId against a nav item silently matched nothing. This
 * pins the delivery on both render branches so the gap cannot reopen.
 */
describe('AppSidebarNavItem — dataTestId reaches the DOM', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders it on the anchor branch', () => {
    const { getByTestId } = wrap(
      <AppSidebarNavItem label="İK" href="/admin/ats" dataTestId="nav-module-hr" />,
    );
    const el = getByTestId('nav-module-hr');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/admin/ats');
  });

  it('renders it on the button branch', () => {
    const { getByTestId } = wrap(<AppSidebarNavItem label="Destek" dataTestId="nav-support-x" />);
    expect(getByTestId('nav-support-x').tagName).toBe('BUTTON');
  });
});
