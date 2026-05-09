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
  // PR-FE-7 absorb iter-2: real ZanzibarAccessLevel type is
  // 'full' | 'readonly' | 'disabled' | 'hidden' — pre-fix mock used
  // a non-existent 'enabled' which silently failed the new
  // `canEdit === editAccess === 'full'` gate added to setters.
  // PR-FE-7 absorb iter-3: factory wrapped in vi.fn so individual
  // tests can override the access level via mockReturnValueOnce
  // (read-only / disabled simulations).
  useZanzibarAccess: vi.fn(() => ({ access: 'full', loading: false, reason: '' })),
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
    // iter-44 — IconShield decorative leading icon for RoleDrawer header.
    // Stub returns a passthrough span so existing assertions on grid
    // policies still pass; leading-slot DOM is exercised in the
    // dedicated `widgets/role-drawer/__tests__/RoleDrawer.leadingIcon.spec.tsx`.
    IconShield: () =>
      React.createElement('span', { 'data-testid': 'icon-shield', 'aria-hidden': 'true' }),
    TextInput: () => React.createElement('input'),
  };
});

import { api } from '@mfe/shared-http';
import { useZanzibarAccess } from '@mfe/auth';
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
  // PR-FE-7 absorb iter-3: reset useZanzibarAccess mock to default
  // 'full' between tests. vi.clearAllMocks() clears CALL history
  // but preserves mockReturnValue settings, so a per-test override
  // (e.g. the readonly test) would leak into subsequent tests.
  vi.mocked(useZanzibarAccess).mockReturnValue({ access: 'full', loading: false, reason: '' });
  (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (url === '/v1/authz/catalog') return { data: buildCatalog() };
    if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
    // Codex 019dda05 iter-25: drawer source-of-truth artık typed read endpoint
    // /v1/roles/{id}/granules. RoleDto (/v1/roles/{id}) sadece module summary
    // döndürdüğü için ACTION/REPORT granules orada yok.
    if (url.match(/^\/v1\/roles\/\d+\/granules$/)) {
      const role = buildRole();
      const idMatch = url.match(/^\/v1\/roles\/(\d+)\/granules$/);
      const roleId = idMatch ? Number(idMatch[1]) : 10;
      return {
        data: {
          roleId,
          granules: (role.policies ?? []).map((p) => ({
            type: 'MODULE',
            key: p.moduleKey,
            grant: p.level,
          })),
        },
      };
    }
    // Legacy /v1/roles/{id} (RoleDto) — drawer bunu artık çağırmamalı, ama
    // mevcut testlerdeki diğer çağrılar (örn. members) için geriye dönük
    // mock yine de policies döner.
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

  it('iter-25: yeni endpoint /v1/roles/{id}/granules typed entries döner ve drawer state populated', async () => {
    // Codex 019dda05 iter-25 read-after-write fix: backend GET /granules
    // typed shape döner. Drawer Effect B bu shape'i parse eder, MODULE
    // entries paralel render edilir. (Eski iter-20 mixed shape testinin
    // yerini aldı — typed-only kontrat artık tek geçerli yol.)
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') return { data: buildCatalog() };
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+\/granules$/)) {
        return {
          data: {
            roleId: 10,
            granules: [
              { type: 'MODULE', key: 'ACCESS', grant: 'MANAGE' },
              { type: 'MODULE', key: 'PURCHASE', grant: 'VIEW' },
            ],
          },
        };
      }
      return { data: {} };
    });

    renderDrawer(buildRole({ policies: [] })); // props boş; sadece /granules endpoint
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });
    await new Promise((r) => setTimeout(r, 100));

    const values = Array.from(drawer.querySelectorAll<HTMLSelectElement>('select')).map(
      (s) => s.value,
    );
    expect(
      values.includes('MANAGE') && values.includes('VIEW'),
      `iter-25 typed read endpoint: ACCESS=MANAGE + PURCHASE=VIEW parse edilmedi. Values: ${JSON.stringify(values)}`,
    ).toBe(true);
  });

  it('iter-25: read-after-write — REPORT granules yeni endpoint üzerinden render edilir', async () => {
    // Pre-iter-25'te /v1/roles/{id} (RoleDto) ACTION/REPORT granules'i
    // FİLTRELİYORDU (line 388-392 backend comment). iter-25 sonrası
    // /granules typed endpoint hepsini döndürür. Bu test REPORT entries'in
    // drawer açılışında bireysel select'lerde görünür olduğunu doğrular —
    // kullanıcı 2026-04-29 raporu: "raporlar kaydolmuyor".
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') {
        return {
          data: {
            modules: [
              { key: 'USER_MANAGEMENT', label: 'Kullanıcı Yönetimi', levels: ['VIEW', 'MANAGE'] },
            ],
            actions: [],
            reports: [
              { key: 'HR_REPORTS', label: 'İK Raporları', module: 'USER_MANAGEMENT' },
              { key: 'FINANCE_REPORTS', label: 'Finans Raporları', module: 'USER_MANAGEMENT' },
            ],
          },
        };
      }
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+\/granules$/)) {
        return {
          data: {
            roleId: 10,
            granules: [
              { type: 'MODULE', key: 'USER_MANAGEMENT', grant: 'VIEW' },
              { type: 'REPORT', key: 'HR_REPORTS', grant: 'MANAGE' },
              { type: 'REPORT', key: 'FINANCE_REPORTS', grant: 'VIEW' },
            ],
          },
        };
      }
      return { data: {} };
    });

    renderDrawer(buildRole({ policies: [] }));
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });
    await new Promise((r) => setTimeout(r, 100));

    const hrReport = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-level-HR_REPORTS"]',
    );
    const financeReport = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-level-FINANCE_REPORTS"]',
    );
    expect(hrReport, 'HR_REPORTS select rendered').toBeTruthy();
    expect(financeReport, 'FINANCE_REPORTS select rendered').toBeTruthy();
    expect(hrReport!.value).toBe('MANAGE');
    expect(financeReport!.value).toBe('VIEW');
  });

  it('iter-25: bulk-select header dropdown — modül grup için tüm raporlar aynı level alır', async () => {
    // Kullanıcı feature isteği (2026-04-29): "ana kategoride toplu seçim
    // alanı olacak". Modül header'ında bulk dropdown MANAGE seçilince
    // modüle ait TÜM raporlar MANAGE olur. allSame = true, dropdown
    // MANAGE göstermeli (MIXED placeholder kalkmalı).
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') {
        return {
          data: {
            modules: [
              { key: 'USER_MANAGEMENT', label: 'Kullanıcı Yönetimi', levels: ['VIEW', 'MANAGE'] },
            ],
            actions: [],
            reports: [
              { key: 'HR_REPORTS', label: 'İK Raporları', module: 'USER_MANAGEMENT' },
              { key: 'PAYROLL_REPORTS', label: 'Bordro Raporları', module: 'USER_MANAGEMENT' },
            ],
          },
        };
      }
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+\/granules$/)) {
        return { data: { roleId: 10, granules: [] } };
      }
      return { data: {} };
    });

    renderDrawer(buildRole({ policies: [] }));
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });

    const groupSelect = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-group-level-USER_MANAGEMENT"]',
    );
    expect(groupSelect, 'Bulk-level select header dropdown rendered').toBeTruthy();
    expect(groupSelect!.value).toBe('NONE');

    // Bulk select'i MANAGE'e değiştir (React change event ile)
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(groupSelect!, { target: { value: 'MANAGE' } });

    // Bireysel rapor select'leri MANAGE olmuş olmalı
    await waitFor(
      () => {
        const hr = drawer.querySelector<HTMLSelectElement>(
          '[data-testid="report-level-HR_REPORTS"]',
        );
        const payroll = drawer.querySelector<HTMLSelectElement>(
          '[data-testid="report-level-PAYROLL_REPORTS"]',
        );
        expect(hr?.value).toBe('MANAGE');
        expect(payroll?.value).toBe('MANAGE');
      },
      { timeout: 2_000 },
    );

    // Bulk dropdown da MANAGE göstermeli (allSame = true)
    expect(groupSelect!.value).toBe('MANAGE');
  });

  it('iter-26: catalog category field ile rapor grouping kategori-bazlı çalışır', async () => {
    // Codex 019dda1c iter-26: backend catalog şimdi `category` field
    // döndürüyor ("İnsan Kaynakları" / "Finans"). Drawer eski module-bazlı
    // grouping yerine `category ?? module` ile gruplar; header'da kategori
    // adı görünür, bulk dropdown sadece o kategorideki raporları etkiler.
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/v1/authz/catalog') {
        return {
          data: {
            modules: [{ key: 'REPORT', label: 'Raporlama', levels: ['VIEW', 'MANAGE'] }],
            actions: [],
            reports: [
              {
                key: 'HR_ANALYTICS',
                label: 'İK Analitik Dashboard',
                module: 'REPORT',
                category: 'İnsan Kaynakları',
              },
              {
                key: 'HR_PAYROLL_TRENDS',
                label: 'Bordro Trendleri',
                module: 'REPORT',
                category: 'İnsan Kaynakları',
              },
              {
                key: 'FIN_ANALYTICS',
                label: 'Finans Analitik Dashboard',
                module: 'REPORT',
                category: 'Finans',
              },
              {
                key: 'FIN_RATIOS',
                label: 'Finansal Oran Analizi',
                module: 'REPORT',
                category: 'Finans',
              },
            ],
          },
        };
      }
      if (url.startsWith('/v1/roles/') && url.endsWith('/members')) return { data: [] };
      if (url.match(/^\/v1\/roles\/\d+\/granules$/)) {
        return { data: { roleId: 10, granules: [] } };
      }
      return { data: {} };
    });

    renderDrawer(buildRole({ policies: [] }));
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });

    // Drawer iki bulk-select dropdown render etmeli (İnsan Kaynakları + Finans)
    const hrGroup = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-group-level-İnsan Kaynakları"]',
    );
    const finGroup = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-group-level-Finans"]',
    );
    expect(hrGroup, 'İnsan Kaynakları header bulk dropdown rendered').toBeTruthy();
    expect(finGroup, 'Finans header bulk dropdown rendered').toBeTruthy();
    expect(hrGroup!.value).toBe('NONE');
    expect(finGroup!.value).toBe('NONE');

    // İnsan Kaynakları bulk'ını MANAGE yap
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(hrGroup!, { target: { value: 'MANAGE' } });

    // İnsan Kaynakları altındaki 2 rapor MANAGE olmalı
    await waitFor(
      () => {
        const hrAnalytics = drawer.querySelector<HTMLSelectElement>(
          '[data-testid="report-level-HR_ANALYTICS"]',
        );
        const hrPayroll = drawer.querySelector<HTMLSelectElement>(
          '[data-testid="report-level-HR_PAYROLL_TRENDS"]',
        );
        expect(hrAnalytics?.value).toBe('MANAGE');
        expect(hrPayroll?.value).toBe('MANAGE');
      },
      { timeout: 2_000 },
    );

    // KRITIK: Finans kategorisi etkilenmemiş olmalı (cross-category leak guard)
    const finAnalytics = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-level-FIN_ANALYTICS"]',
    );
    const finRatios = drawer.querySelector<HTMLSelectElement>(
      '[data-testid="report-level-FIN_RATIOS"]',
    );
    expect(finAnalytics!.value).toBe('NONE');
    expect(finRatios!.value).toBe('NONE');

    // Finans bulk dropdown hâlâ NONE göstermeli
    expect(finGroup!.value).toBe('NONE');
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

  // PR-FE-7 absorb iter-3 (Codex thread 019e0bdc #1): readonly gate
  // verification. Codex demanded a test that proves a permission
  // flip / readonly access level cannot leak a PUT through the
  // auto-save scheduler. We assert two facts: (a) every grant
  // <select> renders with `disabled` set, (b) no PUT lands within
  // the debounce window even after a programmatic change event
  // bypasses the disabled attribute (defense-in-depth: the setters
  // also gate on canEdit).
  it('PR-FE-7: readonly editAccess blocks auto-save PUT and disables grant selects', async () => {
    vi.mocked(useZanzibarAccess).mockReturnValue({
      access: 'readonly',
      loading: false,
      reason: '',
    });
    renderDrawer();
    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });

    const selects = Array.from(drawer.querySelectorAll<HTMLSelectElement>('select'));
    expect(
      selects.every((s) => s.disabled),
      `readonly gate: every grant select must be disabled. Found ${selects.filter((s) => !s.disabled).length} enabled`,
    ).toBe(true);

    // Simulate a programmatic change anyway (covers the case
    // where a future bug strips the `disabled` attribute).
    const firstSelect = selects.find(
      (s) => s.dataset.testid?.startsWith('role-module-level-') ?? false,
    );
    if (firstSelect) {
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(firstSelect, { target: { value: 'MANAGE' } });
    }

    // Wait past the 500ms debounce window plus a buffer.
    await new Promise((r) => setTimeout(r, 700));

    expect(
      (api.put as ReturnType<typeof vi.fn>).mock.calls.length,
      'PR-FE-7 readonly: PUT /granules must not fire when canEdit=false',
    ).toBe(0);
  });

  // PR-FE-7 absorb iter-3 (Codex thread 019e0bdc #2): role switch
  // ownership guard. The pre-fix bug: a slow PUT for role A could
  // resolve AFTER the user had already switched to role B and
  // started a B-PUT. Without an owner-id guard, A's onSuccess
  // would have prematurely freed inFlightRef and could have
  // flushed B's queue at the wrong instant. We assert that
  // re-rendering with a different role:
  //   1. clears the debounce timer (no late PUT for the old role)
  //   2. resets autosave refs (lastSavedDraftRef, queue, inFlight)
  //   3. lets a save on the NEW role proceed normally without a
  //      stale response from the old role disrupting it
  // The shape of this test is observability-focused: we drive an
  // edit on role A, switch to role B before debounce fires, edit
  // role B, and assert exactly one PUT (B's) lands at B's URL.
  it('PR-FE-7: role switch cancels in-flight A-debounce; B-debounce fires for B only', async () => {
    const putMock = api.put as ReturnType<typeof vi.fn>;
    putMock.mockResolvedValue({ data: {} });

    const roleA = buildRole({ id: '10', name: 'ROLE_A' });
    const roleB = buildRole({ id: '20', name: 'ROLE_B' });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(RoleDrawerWrapper, {
          open: true,
          mode: 'view',
          role: roleA,
          onClose: () => undefined,
          t: (key: string) => key,
          formatNumber: (n: number) => String(n),
          formatDate: () => '',
        } as React.ComponentProps<typeof RoleDrawerWrapper>),
      ),
    );

    const drawer = await screen.findByTestId('role-drawer');
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0), {
      timeout: 3_000,
    });

    // Fire a change on role A (this would set a 500ms debounce timer).
    const aSelect = drawer.querySelector<HTMLSelectElement>('select');
    expect(aSelect).toBeTruthy();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(aSelect!, { target: { value: 'MANAGE' } });

    // Switch to role B BEFORE A's debounce fires (well under 500ms).
    await new Promise((r) => setTimeout(r, 100));
    rerender(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(RoleDrawerWrapper, {
          open: true,
          mode: 'view',
          role: roleB,
          onClose: () => undefined,
          t: (key: string) => key,
          formatNumber: (n: number) => String(n),
          formatDate: () => '',
        } as React.ComponentProps<typeof RoleDrawerWrapper>),
      ),
    );

    // Wait long enough for any timer from A to have fired (500ms +
    // buffer). Effect A should have cleared it; if the absorb #2
    // regression returns, an A-PUT would land here.
    await waitFor(
      () => {
        const aPutCalls = putMock.mock.calls.filter(([url]) => url === '/v1/roles/10/granules');
        expect(
          aPutCalls.length,
          'PR-FE-7 role-switch: stale A-PUT must not fire after role swap',
        ).toBe(0);
      },
      { timeout: 1_500 },
    );

    // Now edit role B and let its debounce fire normally.
    await waitFor(() => expect(drawer.querySelectorAll('select').length).toBeGreaterThan(0));
    const bSelect = drawer.querySelector<HTMLSelectElement>('select');
    expect(bSelect).toBeTruthy();
    fireEvent.change(bSelect!, { target: { value: 'MANAGE' } });

    await waitFor(
      () => {
        const bPutCalls = putMock.mock.calls.filter(([url]) => url === '/v1/roles/20/granules');
        expect(
          bPutCalls.length,
          'PR-FE-7 role-switch: B-PUT must fire normally after role swap',
        ).toBeGreaterThanOrEqual(1);
      },
      { timeout: 2_000 },
    );

    // Final invariant: zero PUTs for role A's URL.
    const aPutCalls = putMock.mock.calls.filter(([url]) => url === '/v1/roles/10/granules');
    expect(aPutCalls.length).toBe(0);
  });
});
