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

  // ---------------------------------------------------------------------------
  // iter-20 (Codex 019dd9d6 REVISE absorb): additional lifecycle + semantic
  // tightening guards. Each addresses a critical blocker raised in the iter-19
  // post-impl review.
  // ---------------------------------------------------------------------------

  it('iter-20: closed→open lifecycle — null role mount sonrası role assign edildiğinde policies render olur', async () => {
    // Production'da RolesPage.ui.tsx parent her zaman <RoleDrawer/> render
    // ediyor; selectedRole başta null. Eski tasarımda useState lazy init
    // SADECE bu null mount'ta çalışıyor, sonraki role assign'da artık
    // çalışmıyor — iter-19'un asıl race vector. Effect A bu transition'ı
    // role?.id değişimini yakalayarak handle etmeli.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const baseProps = {
      open: true,
      mode: 'view' as const,
      onClose: () => undefined,
      t: (key: string) => key,
      formatNumber: (n: number) => String(n),
      formatDate: () => '',
    };
    const { rerender } = render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(RoleDrawerWrapper, {
          ...baseProps,
          role: null,
        } as React.ComponentProps<typeof RoleDrawerWrapper>),
      ),
    );

    // Now simulate parent assigning the role (mimics user clicking a row in
    // the grid). Effect A should fire on role?.id change null→"10" and reset
    // module grants to props initial.
    rerender(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(RoleDrawerWrapper, {
          ...baseProps,
          role: buildRole(),
        } as React.ComponentProps<typeof RoleDrawerWrapper>),
      ),
    );

    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(
      () => {
        expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );

    const selects = drawer.querySelectorAll<HTMLSelectElement>('select');
    const values = Array.from(selects).map((s) => s.value);
    expect(
      values.includes('VIEW') && values.includes('MANAGE'),
      `iter-20 closed→open lifecycle: role assign sonrası policies render olmadı. Values: ${JSON.stringify(values)}`,
    ).toBe(true);
  });

  it('iter-20: close→reopen aynı role — state contamine olmaz', async () => {
    // Same role.id, two separate mount cycles (parent-side key remount
    // simulation). Both should end up with the same filled state via lazy
    // init or Effect A.
    const r1 = renderDrawer(buildRole());
    const drawer1 = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer1.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });
    const values1 = Array.from(drawer1.querySelectorAll<HTMLSelectElement>('select')).map(
      (s) => s.value,
    );
    expect(values1.includes('VIEW')).toBe(true);
    r1.unmount();

    // Reopen
    renderDrawer(buildRole());
    const drawer2 = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer2.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });
    const values2 = Array.from(drawer2.querySelectorAll<HTMLSelectElement>('select')).map(
      (s) => s.value,
    );
    expect(values2.includes('VIEW')).toBe(true);
    expect(values2.includes('MANAGE')).toBe(true);
  });

  it('iter-20: typed + legacy mixed shape granules birlikte parse edilir', async () => {
    // Backend, transition döneminde, hem typed (`{type, key, grant}`) hem
    // legacy (`{moduleKey, level}`) entry içeren bir `policies` array dönerse
    // her ikisi de mods bucket'ına yazılmalı.
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') return { data: buildCatalog() };
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+$/)) {
        return {
          data: {
            policies: [
              { type: 'MODULE', key: 'ACCESS', grant: 'MANAGE' },
              { moduleKey: 'PURCHASE', level: 'VIEW' },
            ],
            permissions: [],
          },
        };
      }
      return { data: {} };
    });

    renderDrawer(buildRole({ policies: [] })); // props boş; sadece Effect B üzerinden gelmeli
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });
    // Allow Effect B flush
    await new Promise((r) => setTimeout(r, 100));

    const values = Array.from(drawer.querySelectorAll<HTMLSelectElement>('select')).map(
      (s) => s.value,
    );
    expect(
      values.includes('MANAGE') && values.includes('VIEW'),
      `iter-20 mixed shape: typed (ACCESS=MANAGE) ve legacy (PURCHASE=VIEW) entry parse edilmedi. Values: ${JSON.stringify(values)}`,
    ).toBe(true);
  });

  it('iter-20: unknown partial typed payload — written=false → lazy init state preserve', async () => {
    // Critical Blocker 2: eski `consumed=true` davranışı `g.type` görür görmez
    // set ediyordu; unknown type'lar (`{type:"BANANA", key:"X"}`) modülleri
    // `{}` ile ezerdi. Yeni `written` semantiği: yalnızca tanınan VE yazılan
    // entry varsa overwrite et; hepsi unknown ise lazy init state korunsun.
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') return { data: buildCatalog() };
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+$/)) {
        return {
          data: {
            // Sadece unknown type ve missing-key entry'ler — Effect B written=false
            // dönmeli, props.policies'ten gelen lazy init state korunmalı.
            policies: [
              { type: 'BANANA', key: 'X' },
              { type: 'MODULE' /* missing key → no write */ },
            ],
            permissions: [],
          },
        };
      }
      return { data: {} };
    });

    renderDrawer(); // default buildRole — props.policies USER_MANAGEMENT=VIEW + PURCHASE=MANAGE
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });
    await new Promise((r) => setTimeout(r, 100));

    const values = Array.from(drawer.querySelectorAll<HTMLSelectElement>('select')).map(
      (s) => s.value,
    );
    // Lazy init state preserve: VIEW + MANAGE props.policies'ten gelmiş olmalı
    expect(
      values.includes('VIEW') && values.includes('MANAGE'),
      `iter-20 unknown partial: Effect B written=false guard çalışmıyor; lazy init state ezildi. Values: ${JSON.stringify(values)}`,
    ).toBe(true);
  });
});
