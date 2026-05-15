// @vitest-environment jsdom
/**
 * Adım 14 PR-3 — useReportData unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReportData, type PagedReportResult, type ReportDataQuery } from './use-report-data';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useReportData', () => {
  it('fetches successfully via custom fetcher', async () => {
    const mockData: PagedReportResult<{ id: number }> = {
      rows: [{ id: 1 }, { id: 2 }],
      total: 2,
      page: 1,
      pageSize: 50,
    };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(
      () =>
        useReportData<{ id: number }>(
          { reportKey: 'fin-test', page: 1, pageSize: 50 },
          { fetcher },
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(2);
    expect(result.current.data?.total).toBe(2);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports error state when fetcher throws', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useReportData({ reportKey: 'fin-fail' }, { fetcher }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('boom');
  });

  it('passes query input to fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    renderHook(
      () =>
        useReportData(
          {
            reportKey: 'fin-x',
            filter: { branch: '1' },
            sort: [{ colId: 'date', sort: 'desc' }],
            page: 2,
            pageSize: 100,
            companyId: 42,
          },
          { fetcher },
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const callArg = fetcher.mock.calls[0][0] as ReportDataQuery;
    expect(callArg.reportKey).toBe('fin-x');
    expect(callArg.filter).toEqual({ branch: '1' });
    expect(callArg.page).toBe(2);
    expect(callArg.pageSize).toBe(100);
    expect(callArg.companyId).toBe(42);
  });

  it('respects disabled option (enabled=false)', () => {
    const fetcher = vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const { result } = renderHook(
      () => useReportData({ reportKey: 'fin-disabled' }, { fetcher, disabled: true }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses different queryKey for different inputs', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const wrapper = makeWrapper();
    renderHook(() => useReportData({ reportKey: 'fin-a', page: 1 }, { fetcher }), { wrapper });
    renderHook(() => useReportData({ reportKey: 'fin-a', page: 2 }, { fetcher }), { wrapper });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
