// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Home, Inbox, Scale, Settings, UserX, AlarmClock, BarChart3 } from 'lucide-react';
import {
  buildGlobalSidebarItems,
  buildModuleSidebarItems,
  resolveModuleActiveKey,
} from './Sidebar';
import type { ResolvedNavGroup } from './header/useHeaderNavigation';

/**
 * Issue #1120 (cross-AI REVISE absorbed): the sidebar is context-sensitive —
 * the header answers "which product", the sidebar answers "where inside it".
 * These tests pin the two builders and the query-aware active resolution.
 *
 * The inputs are RESOLVED groups, i.e. what useHeaderNavigation returns after
 * entitlement filtering, remote gating and i18n. Fail-closed behaviour
 * (unauthorized groups never reaching the sidebar, nothing rendered before
 * initialization) is the hook's contract; the contract under test here is:
 * whatever survived the filter is ALL that renders.
 */
const ethicsGroup: ResolvedNavGroup = {
  key: 'ethics',
  label: 'Etik',
  icon: Scale,
  items: [
    { key: 'ethics-cases', label: 'Tüm vakalar', path: '/admin/ethics', icon: Inbox },
    {
      key: 'ethics-unattended',
      label: 'Sahipsiz vakalar',
      path: '/admin/ethics?odak=sahipsiz',
      icon: UserX,
    },
    {
      key: 'ethics-ack-due',
      label: 'Teyit süresi geçenler',
      path: '/admin/ethics?odak=teyit',
      icon: AlarmClock,
    },
  ],
};

const adminGroup: ResolvedNavGroup = {
  key: 'admin',
  label: 'Yönetim',
  icon: Settings,
  items: [
    { key: 'users', label: 'Kullanıcılar', path: '/admin/users', icon: Home },
    { key: 'audit', label: 'Denetim', path: '/audit/events', icon: Home },
  ],
};

const reportsGroup: ResolvedNavGroup = {
  key: 'reports',
  label: 'Raporlar',
  icon: BarChart3,
  directPath: '/admin/reports',
};

describe('buildGlobalSidebarItems', () => {
  it('lists home first, then one launcher entry per surviving module', () => {
    const items = buildGlobalSidebarItems([ethicsGroup, reportsGroup], 'Ana Sayfa');

    expect(items.map((i) => i.key)).toEqual(['home', 'ethics', 'reports']);
    expect(items[0]?.href).toBe('/home');
    // A grouped module lands on its first destination, a direct one on its path.
    expect(items[1]?.href).toBe('/admin/ethics');
    expect(items[2]?.href).toBe('/admin/reports');
  });

  it('renders nothing privileged that the hook did not pass through', () => {
    // Pre-initialization the hook returns [] — the launcher must then be home
    // alone, not a flash of modules that later disappear (fail-closed).
    const items = buildGlobalSidebarItems([], 'Ana Sayfa');
    expect(items.map((i) => i.key)).toEqual(['home']);
  });

  it('skips a group that has nowhere to land', () => {
    const empty: ResolvedNavGroup = { key: 'ghost', label: 'Ghost', icon: Home, items: [] };
    const items = buildGlobalSidebarItems([empty, reportsGroup], 'Ana Sayfa');
    expect(items.map((i) => i.key)).toEqual(['home', 'reports']);
  });
});

describe('buildModuleSidebarItems', () => {
  it('shows the exit to the hub first, then the module destinations only', () => {
    const items = buildModuleSidebarItems(ethicsGroup, 'Tüm modüller');

    expect(items.map((i) => i.key)).toEqual([
      'all-modules',
      'ethics-cases',
      'ethics-unattended',
      'ethics-ack-due',
    ]);
    expect(items[0]?.href).toBe('/home');
    // Static config labels only. An ethics case title must never be able to
    // reach the sidebar — confidentiality, not styling.
    expect(items.every((i) => typeof i.label === 'string')).toBe(true);
  });
});

describe('resolveModuleActiveKey', () => {
  it('tells the ethics work queues apart by query string', () => {
    expect(resolveModuleActiveKey(ethicsGroup, '/admin/ethics', '')).toBe('ethics-cases');
    expect(resolveModuleActiveKey(ethicsGroup, '/admin/ethics', '?odak=sahipsiz')).toBe(
      'ethics-unattended',
    );
    expect(resolveModuleActiveKey(ethicsGroup, '/admin/ethics', '?odak=teyit')).toBe(
      'ethics-ack-due',
    );
  });

  it('falls back to the longest query-less prefix for deep routes', () => {
    // A case detail deep-link keeps the module's list destination lit.
    expect(resolveModuleActiveKey(ethicsGroup, '/admin/ethics/case/123', '')).toBe('ethics-cases');
    expect(resolveModuleActiveKey(adminGroup, '/audit/events/42', '')).toBe('audit');
  });

  it('keeps the case list lit for an unknown focus query', () => {
    // Unknown query → no exact match; the query-less destination wins, which
    // is the honest answer (the reader IS on the case list, just filtered).
    expect(resolveModuleActiveKey(ethicsGroup, '/admin/ethics', '?odak=bilinmeyen')).toBe(
      'ethics-cases',
    );
  });

  it('answers undefined outside the module so the exit item takes over', () => {
    expect(resolveModuleActiveKey(ethicsGroup, '/home', '')).toBeUndefined();
  });
});
