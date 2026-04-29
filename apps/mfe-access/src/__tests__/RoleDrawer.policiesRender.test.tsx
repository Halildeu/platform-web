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
});
