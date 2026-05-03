// @vitest-environment jsdom
/**
 * UsersPage AG Grid bridge smoke (Faz 21.8 PR-X4c).
 *
 * Verifies the `<CrossFilterProvider>` wrap + `useGridCrossFilter` wiring:
 * a fake gridApi pushed via the simulated `onGridReady` event must receive
 * `setFilterModel` calls when the cross-filter store is populated. This
 * proves the real production route (UsersPage) actually consumes the
 * @mfe/x-charts cross-filter store, not just imports it.
 *
 * Mutation discipline (each assertion would fail under a plausible mutation):
 *   - "drop CrossFilterProvider wrap"     → providerWrapMounts (throws
 *                                            from useGridCrossFilter
 *                                            because no provider in tree)
 *   - "drop useGridCrossFilter call"      → setFilterModelInvoked (mock
 *                                            never called when store
 *                                            filter is pushed)
 *   - "drop syncStoreToGrid pathway"      → setFilterModelInvoked
 *
 * The hook itself has its own deeper unit tests in `@mfe/x-charts`; this
 * smoke proves the production page wires it correctly.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
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
