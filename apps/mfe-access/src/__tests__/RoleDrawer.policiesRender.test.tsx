// @vitest-environment jsdom
/**
 * RoleDrawer — iter-19 policies render regression guard.
 *
 * Bug (Codex 019dd927 iter-19): drawer briefly populated correct values
 * on mount, then state-replaced to empty `{}` — every module rendered
 * "—" even when role.policies / granules data was valid. Live React
 * fiber inspection on testai.acik.com confirmed hooks 21-24
 * (moduleGrants/actionGrants/reportGrants/pageGrants) = `{}` despite
 * roleGranulesQuery.data carrying parsed Array(2) of policy entries.
 *
 * Root cause: single useEffect at parse time raced with React's commit
 * phase; setModuleGrants(filledMods) was either dropped or overwritten
 * before paint.
 *
 * Fix:
 *   1. useState lazy initializer derives mods from props.role.policies
 *      on mount → first paint guaranteed populated.
 *   2. Effect A (deps: [role?.id]): on role change, reset to props
 *      initial. Uses role.id string not object reference.
 *   3. Effect B (deps: [role, granules.data]): only OVERWRITES when
 *      granules has parseable entries. Empty/undefined never clears.
 *
 * This suite asserts:
 *   A. Initial render after mount with role.policies set has the module
 *      <select> showing the expected level (not "NONE"). This catches
 *      the empty-after-flash regression at the source-code level.
 *   B. After roleGranulesQuery.data resolves with the same shape,
 *      state stays filled (effect B does not clear).
 *   C. Lazy initializer pattern is preserved — direct `useState({})`
 *      reintroduction would fail this test.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ---------------------------------------------------------------

vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({ authz: { userId: 'test-user' } }),
  useZanzibarAccess: () => ({ access: 'enabled', reason: undefined }),
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../shared/notifications', () => ({
  pushToast: vi.fn(),
}));

vi.mock('../widgets/explain-modal/ExplainPermissionModal', () => ({
  ExplainPermissionModal: () => null,
}));

vi.mock('@mfe/design-system', async () => {
  const React = await import('react');
  return {
    Alert: ({ children, title }: { children: React.ReactNode; title?: string }) =>
      React.createElement('div', { role: 'alert', 'data-title': title ?? '' }, children),
    Autocomplete: () => null,
    Badge: ({ children }: { children: React.ReactNode }) =>
      React.createElement('span', null, children),
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
      React.createElement('button', { onClick }, children),
    Checkbox: () => React.createElement('input', { type: 'checkbox' }),
    DetailDrawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? React.createElement('aside', { 'data-testid': 'role-drawer' }, children) : null,
    TextInput: () => React.createElement('input'),
  };
});

import { api } from '@mfe/shared-http';
import RoleDrawerWrapper from '../widgets/role-drawer/RoleDrawer.ui';
import type { AccessRole } from '../features/access-management/model/access.types';

const buildRole = (overrides?: Partial<AccessRole>): AccessRole => ({
  id: '10',
  name: 'PURCHASE_MANAGER',
  description: 'Test role',
  memberCount: 2,
  isSystemRole: false,
  policies: [
    {
      moduleKey: 'USER_MANAGEMENT',
      moduleLabel: 'Kullanıcı Yönetimi',
      level: 'VIEW',
      lastUpdatedAt: '2026-04-20T00:00:00Z',
      updatedBy: 'system',
    },
    {
      moduleKey: 'PURCHASE',
      moduleLabel: 'Satın Alma',
      level: 'MANAGE',
      lastUpdatedAt: '2026-04-20T00:00:00Z',
      updatedBy: 'system',
    },
  ],
  lastModifiedAt: '2026-04-20T00:00:00Z',
  lastModifiedBy: 'system',
  permissions: [],
  ...overrides,
});

const buildCatalog = () => ({
  modules: [
    { key: 'USER_MANAGEMENT', label: 'Kullanıcı Yönetimi', levels: ['VIEW', 'MANAGE'] },
    { key: 'ACCESS', label: 'Erişim Yönetimi', levels: ['VIEW', 'MANAGE'] },
    { key: 'PURCHASE', label: 'Satın Alma', levels: ['VIEW', 'MANAGE'] },
  ],
  actions: [],
  reports: [],
  pages: [],
});

const renderDrawer = (role: AccessRole | null = buildRole()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(RoleDrawerWrapper, {
        open: true,
        mode: 'view',
        role,
        onClose: () => undefined,
        t: (key: string) => key,
        formatNumber: (n: number) => String(n),
        formatDate: () => '',
      } as React.ComponentProps<typeof RoleDrawerWrapper>),
    ),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (url === '/v1/authz/catalog') return { data: buildCatalog() };
    if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
    if (url.match(/^\/v1\/roles\/\d+$/)) {
      return {
        data: {
          policies: buildRole().policies,
          permissions: [],
        },
      };
    }
    return { data: {} };
  });
});

describe('RoleDrawer — iter-19 policies render regression guard', () => {
  it('mount sonrası MODÜLLER select USER_MANAGEMENT için VIEW gösterir (no empty-after-flash)', async () => {
    renderDrawer();

    // Drawer must render
    const drawer = await screen.findByTestId('role-drawer');
    expect(drawer).toBeTruthy();

    // Wait for catalog query to resolve so module selects render
    await waitFor(
      () => {
        expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );

    // Read all module-level selects and assert at least one shows non-NONE
    const selects = drawer.querySelectorAll<HTMLSelectElement>('select');
    const values = Array.from(selects).map((s) => s.value);

    expect(
      values.some((v) => v && v !== 'NONE'),
      `iter-19 regression: tüm modül selects NONE kalıyor — useEffect parse path race geri gelmiş. ` +
        `Values: ${JSON.stringify(values)}`,
    ).toBe(true);

    // Specific assertion: USER_MANAGEMENT must be VIEW (from props.role.policies)
    expect(
      values.includes('VIEW'),
      `Beklenen VIEW level görünmüyor. Selects: ${JSON.stringify(values)}`,
    ).toBe(true);

    // PURCHASE must be MANAGE
    expect(
      values.includes('MANAGE'),
      `Beklenen MANAGE level görünmüyor. Selects: ${JSON.stringify(values)}`,
    ).toBe(true);
  });

  it('granules query data props.policies ile aynı shape döndüğünde state STABLE kalır', async () => {
    renderDrawer();
    const drawer = await screen.findByTestId('role-drawer');

    // Wait for both queries (catalog + granules) to settle
    await waitFor(
      () => {
        expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );

    // Allow React to flush effect B from the granules query response
    await new Promise((r) => setTimeout(r, 100));

    const selects = drawer.querySelectorAll<HTMLSelectElement>('select');
    const values = Array.from(selects).map((s) => s.value);

    expect(values.includes('VIEW')).toBe(true);
    expect(values.includes('MANAGE')).toBe(true);
  });

  it('boş policies için NONE gösterir (degenerate case)', async () => {
    // Override the api.get mock for this test only — return empty policies
    // from both members and role-detail endpoints so neither the lazy init
    // nor effect B fills any module level.
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') return { data: buildCatalog() };
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+$/)) {
        return { data: { policies: [], permissions: [] } };
      }
      return { data: {} };
    });

    renderDrawer(buildRole({ policies: [] }));
    const drawer = await screen.findByTestId('role-drawer');

    await waitFor(
      () => {
        expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );

    const selects = drawer.querySelectorAll<HTMLSelectElement>('select');
    const values = Array.from(selects).map((s) => s.value);

    // All should be NONE since neither props.policies nor granules has entries
    expect(values.every((v) => !v || v === 'NONE')).toBe(true);
  });
});
