// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellHeader } from '../shell-header/ShellHeader';
import type { ShellHeaderNavItem } from '../shell-header/types';
import { expectNoA11yViolations } from '../../__tests__/a11y-utils';

const NAV_ITEMS: ShellHeaderNavItem[] = [
  { key: '/', path: '/', label: 'Home' },
  { key: '/reports', path: '/reports', label: 'Reports' },
  { key: '/admin', path: '/admin', label: 'Admin' },
];

afterEach(cleanup);

describe('ShellHeader — depth', () => {
  describe('navigation rendering', () => {
    it('renders the primary navigation menubar with the configured aria-label', () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" />);

      const menubar = screen.getByRole('menubar', { name: /primary navigation/i });
      expect(menubar).toBeInTheDocument();
    });

    it('honours a custom navAriaLabel for organisations that localise menu copy', () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" navAriaLabel="Ana gezinme" />);

      expect(screen.getByRole('menubar', { name: /ana gezinme/i })).toBeInTheDocument();
    });

    it('renders one menuitem per nav entry with the matching label', () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" />);

      const items = screen.getAllByRole('menuitem');
      expect(items).toHaveLength(NAV_ITEMS.length);
      expect(items.map((node) => node.textContent?.trim())).toEqual(['Home', 'Reports', 'Admin']);
    });

    it('survives an empty navItems array without crashing or rendering menuitems', () => {
      render(<ShellHeader navItems={[]} currentPath="/" />);

      expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });

  describe('active route resolution (longest-prefix match)', () => {
    it('marks the deepest matching item as the current page via aria-current', () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/admin/reports/q1" />);

      const adminItem = screen.getByRole('menuitem', { name: /admin/i });
      expect(adminItem).toHaveAttribute('aria-current', 'page');

      const reportsItem = screen.getByRole('menuitem', { name: /reports/i });
      expect(reportsItem).not.toHaveAttribute('aria-current', 'page');
    });

    it('falls back to the root item when current path is exactly "/"', () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" />);

      const homeItem = screen.getByRole('menuitem', { name: /home/i });
      expect(homeItem).toHaveAttribute('aria-current', 'page');
    });

    it('marks only one item as the current page at a time', () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/admin/reports/q1" />);

      const currentItems = screen
        .getAllByRole('menuitem')
        .filter((node) => node.getAttribute('aria-current') === 'page');
      expect(currentItems).toHaveLength(1);
    });
  });

  describe('navigation interaction', () => {
    it('calls onNavigate with path and item when a menuitem is clicked', async () => {
      const onNavigate = vi.fn();
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" onNavigate={onNavigate} />);

      const reportsItem = screen.getByRole('menuitem', { name: /reports/i });
      await userEvent.click(reportsItem);

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith('/reports', NAV_ITEMS[1]);
    });

    it('prevents default on click so plain anchor href does not trigger a full reload', async () => {
      const onNavigate = vi.fn();
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" onNavigate={onNavigate} />);

      const adminItem = screen.getByRole('menuitem', { name: /admin/i });
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      adminItem.dispatchEvent(clickEvent);

      expect(clickEvent.defaultPrevented).toBe(true);
      expect(onNavigate).toHaveBeenCalledWith('/admin', NAV_ITEMS[2]);
    });

    it('does not throw when onNavigate is not provided', async () => {
      render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" />);

      const reportsItem = screen.getByRole('menuitem', { name: /reports/i });
      await expect(userEvent.click(reportsItem)).resolves.not.toThrow();
    });
  });

  describe('slots and composition', () => {
    it('renders startSlot before the navigation', () => {
      render(
        <ShellHeader
          navItems={NAV_ITEMS}
          currentPath="/"
          startSlot={<button type="button">Launcher</button>}
        />,
      );

      expect(screen.getByRole('button', { name: /launcher/i })).toBeInTheDocument();
    });

    it('renders endSlot after the navigation', () => {
      render(
        <ShellHeader
          navItems={NAV_ITEMS}
          currentPath="/"
          endSlot={<button type="button">User menu</button>}
        />,
      );

      expect(screen.getByRole('button', { name: /user menu/i })).toBeInTheDocument();
    });

    it('passes menuUtility into the menubar end slot', () => {
      render(
        <ShellHeader
          navItems={NAV_ITEMS}
          currentPath="/"
          menuUtility={<button type="button">Design Lab</button>}
        />,
      );

      const utility = screen.getByRole('button', { name: /design lab/i });
      const banner = screen.getByRole('banner');
      expect(within(banner).getByRole('button', { name: /design lab/i })).toBe(utility);
    });
  });

  describe('accessibility', () => {
    it('has no axe-core violations in the default state', async () => {
      const { container } = render(<ShellHeader navItems={NAV_ITEMS} currentPath="/" />);
      await expectNoA11yViolations(container);
    });

    it('has no axe-core violations with all slots populated', async () => {
      const { container } = render(
        <ShellHeader
          navItems={NAV_ITEMS}
          currentPath="/admin"
          onNavigate={vi.fn()}
          startSlot={<button type="button">Launcher</button>}
          endSlot={<button type="button">User</button>}
          menuUtility={<button type="button">Lab</button>}
        />,
      );
      await expectNoA11yViolations(container);
    });
  });
});
