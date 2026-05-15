// @vitest-environment jsdom
/**
 * R15 hotfix regression guard (Codex 019e2aef peer review §3).
 *
 * After the useState/useEffect/active-flag → React Query refactor,
 * the catalog must:
 *   1. Render dynamic reports + dashboards once both fetches resolve
 *      under a QueryClientProvider (no "No QueryClient set" crash).
 *   2. Survive delayed (async) fetch resolution without losing items.
 *   3. Continue to expose static + extra items even when both async
 *      sources reject.
 *
 * These three cases collectively reproduce the original bug:
 * backend returns 31 reports + 12 dashboards but UI shows 0 grid cards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock module sources BEFORE importing the hook under test.
vi.mock('@platform/capabilities', () => ({
  listSharedReportsForChannel: vi.fn(() => []),
}));
vi.mock('../../modules/dynamic-report', () => ({
  fetchReportList: vi.fn(),
}));
vi.mock('../../modules/dashboard', () => ({
  fetchDashboardList: vi.fn(),
}));
vi.mock('../../modules', () => ({
  reportModules: [],
}));

import { useCatalog } from './useCatalog';
import { fetchReportList } from '../../modules/dynamic-report';
import { fetchDashboardList } from '../../modules/dashboard';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCatalog (R15 hotfix regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 31 dynamic reports + 12 dashboards when both fetches resolve', async () => {
    const reports = Array.from({ length: 31 }, (_, i) => ({
      key: `report-${i}`,
      title: `Report ${i}`,
      description: '',
      category: 'Finans',
      reportGroup: 'FINANCE_REPORTS',
    }));
    const dashboards = Array.from({ length: 12 }, (_, i) => ({
      key: `dash-${i}`,
      title: `Dashboard ${i}`,
      description: '',
      category: 'Dashboard',
      icon: '📈',
      reportGroup: 'ANALYTICS_REPORTS',
    }));

    (fetchReportList as ReturnType<typeof vi.fn>).mockResolvedValue(reports);
    (fetchDashboardList as ReturnType<typeof vi.fn>).mockResolvedValue(dashboards);

    const { result } = renderHook(() => useCatalog(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const items = result.current.items;
    expect(items.filter((it) => it.source === 'dynamic')).toHaveLength(31);
    expect(items.filter((it) => it.source === 'dashboard')).toHaveLength(12);
  });

  it('still resolves even when both fetches are delayed (mount race regression)', async () => {
    let resolveReports: (v: unknown) => void = () => {};
    let resolveDashboards: (v: unknown) => void = () => {};

    (fetchReportList as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((res) => {
        resolveReports = res;
      }),
    );
    (fetchDashboardList as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((res) => {
        resolveDashboards = res;
      }),
    );

    const { result } = renderHook(() => useCatalog(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);

    // Resolve fetches AFTER initial mount (simulates real network latency).
    resolveReports([
      {
        key: 'late-report',
        title: 'Late Report',
        description: '',
        category: 'Finans',
      },
    ]);
    resolveDashboards([
      {
        key: 'late-dash',
        title: 'Late Dashboard',
        description: '',
        category: 'Dashboard',
        icon: '📈',
      },
    ]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.some((it) => it.id === 'dynamic-late-report')).toBe(true);
    expect(result.current.items.some((it) => it.id === 'dashboard-late-dash')).toBe(true);
  });

  it('does not crash when both async sources reject (error fallback)', async () => {
    (fetchReportList as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('reports boom'));
    (fetchDashboardList as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('dashboards boom'),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useCatalog(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Static + extras still present (here both lists are empty mocks, so 0).
    expect(Array.isArray(result.current.items)).toBe(true);
    expect(result.current.items.filter((it) => it.source === 'dynamic')).toHaveLength(0);
    expect(result.current.items.filter((it) => it.source === 'dashboard')).toHaveLength(0);

    warnSpy.mockRestore();
  });
});
