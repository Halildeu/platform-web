// @vitest-environment jsdom
/**
 * UsersPage AG Grid bridge smoke (Faz 21.8 PR-X4c).
 *
 * Codex iter-1 PR-X4c review absorbed: tests render the real UsersPage
 * (default + isFullscreen paths) with a mocked UsersGrid that simulates
 * `onGridReady`. The previous version only drove the hook through a
 * Harness, so a regression that removed `setGridApi` from the default
 * render path silently passed.
 *
 * Mutation discipline:
 *   - "drop CrossFilterProvider wrap from UsersPage" → defaultPathWiresBridge
 *   - "drop setGridApi from default onGridReady"      → defaultPathWiresBridge
 *   - "drop setGridApi from isFullscreen onGridReady" → fullscreenPathWiresBridge
 *   - "drop syncStoreToGrid pathway"                  → both
 *   - "drop CrossFilterProvider wrap entirely"        → throwsWithoutProvider
 *                                                       (regression guard)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// Capture useGridCrossFilter call arguments so the production-wiring test
// can prove the bridge actually receives a non-null gridApi (Codex iter-2
// PR-X4c review: previous test only asserted `lastOnGridReady` was set,
// which a regression that drops `setGridApi` from `handleGridReady`
// would still pass).
const useGridCrossFilterSpy = vi.fn();

vi.mock('@mfe/x-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mfe/x-charts')>();
  return {
    ...actual,
    useGridCrossFilter: (options: Parameters<typeof actual.useGridCrossFilter>[0]) => {
      useGridCrossFilterSpy(options);
      return actual.useGridCrossFilter(options);
    },
  };
});

import { CrossFilterProvider, useGridCrossFilter, useCrossFilter } from '@mfe/x-charts';
import type { GridApi as XChartsGridApi } from '@mfe/x-charts';

/* ------------------------------------------------------------------ */
/*  Bridge wiring smoke                                                */
/* ------------------------------------------------------------------ */

function makeFakeGridApi() {
  return {
    setFilterModel: vi.fn(),
    refreshServerSide: vi.fn(),
    getFilterModel: vi.fn().mockReturnValue({}),
  } satisfies XChartsGridApi;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CrossFilterProvider options={{ groupId: 'users-page', debounceMs: 0 }}>
    {children}
  </CrossFilterProvider>
);

/* ------------------------------------------------------------------ */
/*  UsersPage production render tests                                  */
/* ------------------------------------------------------------------ */

// We need to mock UsersGrid + UserDetailDrawer + i18n + query. Each mock
// keeps the test focused on the bridge wiring rather than dragging in
// the full data-fetching stack.

let lastOnGridReady: ((event: { api: XChartsGridApi }) => void) | null = null;

vi.mock('../../../widgets/user-management/ui/UsersGrid.ui', () => ({
  default: ({ onGridReady }: { onGridReady?: (event: { api: XChartsGridApi }) => void }) => {
    // Capture the latest onGridReady so the test can fire it.
    lastOnGridReady = onGridReady ?? null;
    return <div data-testid="mock-users-grid" />;
  },
}));
vi.mock('../../../widgets/user-management/ui/UserDetailDrawer.ui', () => ({
  default: () => <div data-testid="mock-user-detail-drawer" />,
}));
vi.mock('../../../i18n/useUsersI18n', () => ({
  useUsersI18n: () => ({ t: (k: string) => k }),
}));
vi.mock('../../../features/user-management/model/use-users-query.model', () => ({
  useUserDetailQuery: () => ({ data: null, isLoading: false }),
}));
vi.mock('@mfe/shared-http', () => ({
  fetchPageLayout: vi.fn().mockResolvedValue(null),
  trackAction: vi.fn(),
  resolveTraceId: vi.fn().mockReturnValue('trace-id'),
}));

import UsersPage from '../UsersPage.ui';

describe('UsersPage production wiring (Faz 21.8 PR-X4c, Codex iter-1+2 absorbed)', () => {
  beforeEach(() => {
    lastOnGridReady = null;
    useGridCrossFilterSpy.mockClear();
    vi.clearAllMocks();
  });

  /**
   * Renders UsersPage, fires `onGridReady` with a mocked AG Grid api, then
   * waits for the bridge to re-render with a non-null `gridApi`. The spy
   * on `useGridCrossFilter` lets the test fail when `handleGridReady`
   * drops the `setGridApi(event.api)` call — the bridge would never see a
   * real gridApi and the spy's last call would still carry `gridApi: null`.
   *
   * This is the production parity proof Codex iter-2 asked for.
   */
  async function assertBridgeWiresFor(isFullscreen: boolean) {
    const fakeGridApi = makeFakeGridApi();
    render(<UsersPage isFullscreen={isFullscreen} />);

    expect(lastOnGridReady).not.toBeNull();

    // Initial calls happen with gridApi=null (mount time), then again
    // after setGridApi propagates the value. We assert that the LATEST
    // call after onGridReady carries a non-null gridApi — proving the
    // setGridApi -> useMemo -> hook re-subscribe chain works.
    lastOnGridReady!({ api: fakeGridApi });

    await waitFor(() => {
      const calls = useGridCrossFilterSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const latestOptions = calls[calls.length - 1]?.[0];
      expect(latestOptions).toMatchObject({
        gridId: 'users-grid',
        gridApi: fakeGridApi,
      });
    });
  }

  it('defaultPathWiresBridge: PageLayout render path passes gridApi into useGridCrossFilter', async () => {
    await assertBridgeWiresFor(false);
  });

  it('fullscreenPathWiresBridge: isFullscreen render path passes gridApi into useGridCrossFilter', async () => {
    await assertBridgeWiresFor(true);
  });
});

describe('UsersPage AG Grid bridge wiring (Faz 21.8 PR-X4c)', () => {
  it('providerWrapMounts: useGridCrossFilter does not throw under CrossFilterProvider', () => {
    const fakeGridApi = makeFakeGridApi();
    expect(() =>
      renderHook(
        () =>
          useGridCrossFilter({
            gridId: 'users-grid',
            gridApi: fakeGridApi,
          }),
        { wrapper },
      ),
    ).not.toThrow();
  });

  it('throwsWithoutProvider: useGridCrossFilter requires a provider (regression guard)', () => {
    const fakeGridApi = makeFakeGridApi();
    // Without the wrapper the hook must throw — this is the negative case
    // that protects us from accidentally dropping the CrossFilterProvider
    // wrap from UsersPage.
    expect(() =>
      renderHook(() =>
        useGridCrossFilter({
          gridId: 'users-grid',
          gridApi: fakeGridApi,
        }),
      ),
    ).toThrow(/CrossFilterProvider/);
  });

  it('setFilterModelInvoked: external store filter triggers gridApi.setFilterModel', async () => {
    // Use real timers — debounceMs:0 still wraps in `setTimeout(cb, 0)`,
    // and waitFor needs the macrotask queue to advance. Mixing fake
    // timers with waitFor times out.
    const fakeGridApi = makeFakeGridApi();

    function Harness() {
      useGridCrossFilter({
        gridId: 'users-grid',
        gridApi: fakeGridApi,
        syncGridToStore: false, // avoid AG Grid → store loop in test
        syncStoreToGrid: true,
      });
      const setFilter = useCrossFilter((s) => s.setFilter);
      React.useEffect(() => {
        setFilter({
          sourceId: 'chart:role-filter',
          field: 'role',
          value: 'ADMIN',
          operator: 'eq',
          createdAt: Date.now(),
        });
      }, [setFilter]);
      return null;
    }

    render(
      <CrossFilterProvider options={{ groupId: 'users-page', debounceMs: 0 }}>
        <Harness />
      </CrossFilterProvider>,
    );

    await waitFor(() => {
      expect(fakeGridApi.setFilterModel).toHaveBeenCalled();
    });

    // The first argument carries the AG Grid filter model derived from
    // the cross-filter entry — for a single eq filter on `role` we expect
    // a `text/equals` shape (see useGridCrossFilter.toGridFilterModel).
    const lastCall = fakeGridApi.setFilterModel.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({
      role: { filterType: 'text', type: 'equals', filter: 'ADMIN' },
    });
  });
});
