// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Phase 2 PR-Reporting-2 (MFE Auth Transport Contract): unit tests for the
 * shared metadata cache helper.
 *
 * Coverage:
 *   1. cache hit returns synchronously without re-fetching
 *   2. concurrent calls share one in-flight promise
 *   3. auth.ready() fail-closed → empty meta + no fetch
 *   4. failure is NOT cached — next call retries
 *   5. epoch advance clears the cache (logout / re-login)
 *   6. bounded concurrency caps simultaneous fetches
 *   7. mapBackendColumnMeta covers all column types
 */

const { mockFetchReportMetadata, authReadyResult, currentEpoch } = vi.hoisted(() => ({
  mockFetchReportMetadata: vi.fn(),
  authReadyResult: { value: { ok: true } as { ok: boolean; reason?: string; error?: string } },
  currentEpoch: { value: 0 },
}));

vi.mock('../api', () => ({
  fetchReportMetadata: mockFetchReportMetadata,
}));

vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    auth: {
      ready: () => Promise.resolve(authReadyResult.value),
      getEpoch: () => currentEpoch.value,
    },
  }),
}));

import {
  fetchMeta,
  getCachedCapabilities,
  getCachedColumns,
  mapBackendColumnMeta,
  __getInflightCountForTest,
  __resetMetadataCacheForTest,
  __setMaxConcurrentForTest,
} from '../metadata-cache';

const baseCol = { width: 100, sensitive: false } as const;
const sampleMeta = {
  columns: [
    { field: 'id', headerName: 'ID', type: 'number' as const, ...baseCol, decimals: 0 },
    { field: 'name', headerName: 'Ad', type: 'text' as const, ...baseCol },
  ],
  capabilities: { serverSideGrouping: true },
};

describe('metadata-cache', () => {
  beforeEach(() => {
    __resetMetadataCacheForTest();
    mockFetchReportMetadata.mockReset();
    authReadyResult.value = { ok: true };
    currentEpoch.value = 1;
  });

  afterEach(() => {
    __resetMetadataCacheForTest();
  });

  it('returns cached value on hit (no second fetch)', async () => {
    mockFetchReportMetadata.mockResolvedValueOnce(sampleMeta);

    const first = await fetchMeta('hr-puantaj');
    const second = await fetchMeta('hr-puantaj');

    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(1);
    expect(first.columns).toHaveLength(2);
    expect(second).toBe(first);
    expect(getCachedColumns('hr-puantaj')).toHaveLength(2);
    expect(getCachedCapabilities('hr-puantaj')).toEqual({ serverSideGrouping: true });
  });

  it('shares one in-flight promise across concurrent calls for the same key', async () => {
    let resolveFn!: (value: typeof sampleMeta) => void;
    mockFetchReportMetadata.mockImplementationOnce(
      () =>
        new Promise<typeof sampleMeta>((resolve) => {
          resolveFn = resolve;
        }),
    );

    const a = fetchMeta('cross-pod-report');
    const b = fetchMeta('cross-pod-report');
    const c = fetchMeta('cross-pod-report');

    // The auth.ready() gate runs as a microtask; flush a few rounds so
    // the underlying fetch is actually issued before we assert.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(1);

    resolveFn(sampleMeta);
    const [resA, resB, resC] = await Promise.all([a, b, c]);

    expect(resA.columns).toHaveLength(2);
    expect(resA).toBe(resB);
    expect(resB).toBe(resC);
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(1);
  });

  it('fail-closes when auth.ready() resolves with !ok (no fetch issued)', async () => {
    authReadyResult.value = { ok: false, reason: 'unauthenticated' };

    const result = await fetchMeta('hr-giris-cikis');

    expect(mockFetchReportMetadata).not.toHaveBeenCalled();
    expect(result.columns).toEqual([]);
    expect(result.capabilities).toBeUndefined();
    expect(getCachedColumns('hr-giris-cikis')).toEqual([]);
  });

  it('does NOT cache failure — the next call retries', async () => {
    mockFetchReportMetadata
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(sampleMeta);

    const first = await fetchMeta('flaky-report');
    expect(first.columns).toEqual([]);

    const second = await fetchMeta('flaky-report');
    expect(second.columns).toHaveLength(2);
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(2);
  });

  it('clears cache when auth epoch advances (logout / re-login)', async () => {
    mockFetchReportMetadata.mockResolvedValueOnce(sampleMeta).mockResolvedValueOnce({
      columns: [{ field: 'x', headerName: 'X', type: 'text' as const, ...baseCol }],
    });

    const first = await fetchMeta('rebadge');
    expect(first.columns).toHaveLength(2);

    // Simulate logout/re-login: epoch advances.
    currentEpoch.value = 2;

    const second = await fetchMeta('rebadge');
    expect(second.columns).toHaveLength(1);
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(2);
  });

  it('epoch advance MID-FLIGHT does not poison the new principal cache (Codex 019e0450 §1)', async () => {
    // Old principal's fetch is in flight; new principal's epoch starts.
    let resolveOld!: (value: typeof sampleMeta) => void;
    mockFetchReportMetadata.mockImplementationOnce(
      () =>
        new Promise<typeof sampleMeta>((resolve) => {
          resolveOld = resolve;
        }),
    );

    const oldFetch = fetchMeta('cross-epoch-report');

    // Allow the inflight to register and the auth gate to pass.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Epoch advances mid-flight (logout / re-login).
    currentEpoch.value = 2;

    // Now resolve the OLD fetch. Without the identity/epoch fence this
    // would write the old principal's columns into the new principal's
    // cache.
    resolveOld({
      columns: [
        { field: 'old', headerName: 'OLD', type: 'text' as const, ...baseCol },
        { field: 'old2', headerName: 'OLD2', type: 'text' as const, ...baseCol },
      ],
      capabilities: { serverSideGrouping: false } as { serverSideGrouping: boolean },
    } as unknown as typeof sampleMeta);
    await oldFetch;

    // New principal MUST NOT see the old principal's data via sync read.
    expect(getCachedColumns('cross-epoch-report')).toEqual([]);
    expect(getCachedCapabilities('cross-epoch-report')).toBeUndefined();
  });

  it('sync readers see no stale cache after epoch advance (Codex 019e0450 §2)', async () => {
    mockFetchReportMetadata.mockResolvedValueOnce(sampleMeta);

    await fetchMeta('hr-cikis');
    expect(getCachedColumns('hr-cikis')).toHaveLength(2);

    // Logout: epoch advances. Sync readers must NOT serve the old data.
    currentEpoch.value = 2;
    expect(getCachedColumns('hr-cikis')).toEqual([]);
    expect(getCachedCapabilities('hr-cikis')).toBeUndefined();
  });

  it('does not delete inflight entry registered by a NEW epoch when an OLD fetch finishes', async () => {
    let resolveOld!: (value: typeof sampleMeta) => void;
    let resolveNew!: (value: typeof sampleMeta) => void;
    mockFetchReportMetadata
      .mockImplementationOnce(
        () =>
          new Promise<typeof sampleMeta>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<typeof sampleMeta>((resolve) => {
            resolveNew = resolve;
          }),
      );

    const oldFetch = fetchMeta('drift-key');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    currentEpoch.value = 2;
    const newFetch = fetchMeta('drift-key');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Both fetches should now be issued (one per epoch).
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(2);

    // The OLD fetch finishes first. It must NOT delete the NEW inflight.
    resolveOld({
      columns: [{ field: 'a', headerName: 'A', type: 'text' as const, ...baseCol }],
    } as unknown as typeof sampleMeta);
    await oldFetch;

    // NEW finishes — its result should be cached for the new epoch.
    resolveNew({
      columns: [
        { field: 'n1', headerName: 'N1', type: 'text' as const, ...baseCol },
        { field: 'n2', headerName: 'N2', type: 'text' as const, ...baseCol },
        { field: 'n3', headerName: 'N3', type: 'text' as const, ...baseCol },
      ],
      capabilities: { serverSideGrouping: true },
    });
    const newResult = await newFetch;

    expect(newResult.columns).toHaveLength(3);
    expect(getCachedColumns('drift-key')).toHaveLength(3);
  });

  it('respects bounded concurrency', async () => {
    __setMaxConcurrentForTest(2);

    const resolvers: Array<(value: typeof sampleMeta) => void> = [];
    mockFetchReportMetadata.mockImplementation(
      () =>
        new Promise<typeof sampleMeta>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const promises = ['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => fetchMeta(k));

    // Allow microtasks to settle so the two slot-bound fetches start.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Only 2 should have entered the underlying fetch.
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(2);
    expect(__getInflightCountForTest()).toBe(2);

    // Drain the first slot — third call should now enter.
    resolvers[0](sampleMeta);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(3);

    // Resolve the rest so the test can finish.
    resolvers[1](sampleMeta);
    resolvers[2](sampleMeta);
    await Promise.resolve();
    await Promise.resolve();
    resolvers[3](sampleMeta);
    resolvers[4](sampleMeta);

    await Promise.all(promises);
    expect(mockFetchReportMetadata).toHaveBeenCalledTimes(5);
    expect(__getInflightCountForTest()).toBe(0);
  });

  it('mapBackendColumnMeta covers number / date / badge / status / currency / boolean / percent / enum / text', () => {
    expect(
      mapBackendColumnMeta({
        field: 'a',
        headerName: 'A',
        type: 'number',
        ...baseCol,
        decimals: 2,
      }),
    ).toMatchObject({ columnType: 'number', decimals: 2 });
    expect(
      mapBackendColumnMeta({ field: 'b', headerName: 'B', type: 'date', ...baseCol }),
    ).toMatchObject({ columnType: 'date' });
    expect(
      mapBackendColumnMeta({
        field: 'c',
        headerName: 'C',
        type: 'badge',
        ...baseCol,
        variantMap: { ok: 'success' },
        labelMap: { ok: 'OK' },
      }),
    ).toMatchObject({ columnType: 'badge', variantMap: { ok: 'success' }, labelMap: { ok: 'OK' } });
    expect(
      mapBackendColumnMeta({
        field: 'd',
        headerName: 'D',
        type: 'status',
        ...baseCol,
        statusMap: { active: { variant: 'success', labelKey: 'common.active' } },
      }),
    ).toMatchObject({
      columnType: 'status',
      statusMap: { active: { variant: 'success', labelKey: 'common.active' } },
    });
    expect(
      mapBackendColumnMeta({
        field: 'e',
        headerName: 'E',
        type: 'currency',
        ...baseCol,
        currencyCode: 'TRY',
        decimals: 2,
      }),
    ).toMatchObject({ columnType: 'currency', currencyCode: 'TRY', decimals: 2 });
    expect(
      mapBackendColumnMeta({ field: 'f', headerName: 'F', type: 'boolean', ...baseCol }),
    ).toMatchObject({ columnType: 'boolean' });
    expect(
      mapBackendColumnMeta({
        field: 'g',
        headerName: 'G',
        type: 'percent',
        ...baseCol,
        decimals: 1,
      }),
    ).toMatchObject({ columnType: 'percent', decimals: 1 });
    expect(
      mapBackendColumnMeta({
        field: 'h',
        headerName: 'H',
        type: 'enum',
        ...baseCol,
        labelMap: { x: 'Xx' },
      }),
    ).toMatchObject({ columnType: 'enum', labelMap: { x: 'Xx' } });
    expect(
      mapBackendColumnMeta({ field: 'i', headerName: 'I', type: 'text', ...baseCol }),
    ).toMatchObject({ columnType: 'text' });
    expect(
      mapBackendColumnMeta({
        field: 'j',
        headerName: 'J',
        type: 'unknown' as unknown as 'text',
        ...baseCol,
      }),
    ).toMatchObject({ columnType: 'text' });
  });
});
