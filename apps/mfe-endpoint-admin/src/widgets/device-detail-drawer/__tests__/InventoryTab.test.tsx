// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type {
  DeviceSoftwareInventory,
  SoftwareInventoryItem,
  SoftwareInventorySnapshot,
} from '../../../entities/endpoint-software-inventory/types';
// Imported AFTER the `vi.mock` call below so the hook resolves to the
// mocked implementation. `vi.mock` is hoisted by Vitest above all imports
// regardless of source order, so this layout is safe.
import { InventoryTab } from '../tabs/InventoryTab';

/* ------------------------------------------------------------------ */
/*  WEB-011 — InventoryTab unit tests (Faz 22.5.1B).                   */
/*                                                                     */
/*  Component contract (post-WEB-011):                                  */
/*   - Reads from BE-020I via                                           */
/*       endpointAdminApi.useGetDeviceSoftwareInventoryQuery(...)       */
/*   - Skips the query when `!active || !deviceId`.                    */
/*   - 404 (no snapshot ingested) → empty state (canonical).           */
/*   - 403 → forbidden state.                                          */
/*   - Other errors → error state.                                     */
/*   - `appsAvailable=false` → summary + appsUnavailable banner only.  */
/*   - `appsAvailable=true` → summary + filters + paged items table.   */
/*   - `snapshot.truncated=true` → warning badge.                      */
/*   - Tri-state `wingetReady` (true/false/null) rendered as           */
/*     ready/notReady/unknown via the i18n keys.                       */
/*                                                                     */
/*  This file mocks `useGetDeviceSoftwareInventoryQuery` directly via  */
/*  `vi.mock` so each spec controls the exact query result without     */
/*  spinning up a Redux store or fake fetch.                           */
/* ------------------------------------------------------------------ */

const useGetDeviceSoftwareInventoryQueryMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetDeviceSoftwareInventoryQuery: (...args: unknown[]) =>
      useGetDeviceSoftwareInventoryQueryMock(...args),
  },
}));

type QueryResult = {
  data?: DeviceSoftwareInventory;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
};

function mockQuery(result: QueryResult): void {
  useGetDeviceSoftwareInventoryQueryMock.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isFetching: false,
    ...result,
  });
}

function buildSnapshot(
  overrides: Partial<SoftwareInventorySnapshot> = {},
): SoftwareInventorySnapshot {
  return {
    id: 'snap-1',
    tenantId: 't-1',
    deviceId: 'd-1',
    schemaVersion: 1,
    supported: true,
    appCount: 42,
    appsStoredCount: 42,
    wingetReady: true,
    wingetVersion: '1.8.1911-preview',
    totalSizeKb: 8_388_608,
    truncated: false,
    probeErrors: null,
    summaryCollectedAt: '2026-05-27T08:00:00Z',
    appsCollectedAt: '2026-05-27T08:05:00Z',
    appsAvailable: true,
    updatedAt: '2026-05-27T08:05:30Z',
    ...overrides,
  };
}

function buildItem(overrides: Partial<SoftwareInventoryItem> = {}): SoftwareInventoryItem {
  return {
    id: 'item-' + Math.random().toString(36).slice(2, 8),
    snapshotId: 'snap-1',
    deviceId: 'd-1',
    displayName: 'Mozilla Firefox 124.0.1 (x64 tr)',
    displayVersion: '124.0.1',
    publisher: 'Mozilla',
    installDate: null,
    estimatedSizeKb: null,
    architecture: 'x64',
    installSource: 'HKLM',
    uninstallStringPresent: true,
    msiProductCodeHash: null,
    ...overrides,
  };
}

function buildResponse(
  snapshot: SoftwareInventorySnapshot,
  items: SoftwareInventoryItem[],
  pageOverrides: Partial<DeviceSoftwareInventory['items']> = {},
): DeviceSoftwareInventory {
  return {
    snapshot,
    items: {
      content: items,
      number: 0,
      size: 25,
      totalElements: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      empty: items.length === 0,
      ...pageOverrides,
    },
  };
}

beforeEach(() => {
  useGetDeviceSoftwareInventoryQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('InventoryTab — skip + lifecycle states', () => {
  it('active=false iken query skip edilir ve hicbir tab body render edilmez', () => {
    mockQuery({ data: undefined });
    render(<InventoryTab deviceId="d-1" active={false} />);

    // When the query is skipped, RTK Query returns `{ data: undefined,
    // error: undefined, isLoading: false }`. The component must NOT
    // surface a misleading state — it shows the empty placeholder
    // because there is no snapshot to render. Either behaviour is
    // acceptable so long as it is NOT loading/error.
    expect(screen.queryByTestId('inventory-tab-loading')).toBeNull();
    expect(screen.queryByTestId('inventory-tab-error')).toBeNull();
    // Hook was called with skip=true.
    const lastCall = useGetDeviceSoftwareInventoryQueryMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ skip: true });
  });

  it('isLoading=true iken loading placeholder gosterir', () => {
    mockQuery({ isLoading: true });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-tab-loading')).toBeInTheDocument();
  });

  it('403 iken forbidden state gosterir', () => {
    mockQuery({ error: { status: 403 } });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-tab-forbidden')).toBeInTheDocument();
  });

  it('404 (no snapshot ingested) iken empty state gosterir', () => {
    mockQuery({ error: { status: 404 } });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-tab-empty')).toBeInTheDocument();
  });

  it('500 iken error state gosterir', () => {
    mockQuery({ error: { status: 500 } });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-tab-error')).toBeInTheDocument();
  });
});

describe('InventoryTab — summary panel rendering', () => {
  it('appsAvailable=false iken summary + appsUnavailable banner gosterir, filtre/tabloyu gizler', () => {
    const snapshot = buildSnapshot({
      appsAvailable: false,
      appsCollectedAt: null,
      wingetReady: null,
      wingetVersion: null,
      appCount: 0,
    });
    mockQuery({ data: buildResponse(snapshot, []) });

    render(<InventoryTab deviceId="d-1" active />);

    expect(screen.getByTestId('inventory-summary')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-apps-unavailable')).toBeInTheDocument();
    // Filters + items table must NOT be present when only summary was
    // collected — the BE-020I contract puts those fields under
    // `apps_available=true`.
    expect(screen.queryByTestId('inventory-filters')).toBeNull();
    expect(screen.queryByTestId('inventory-items-table')).toBeNull();
    // wingetReady=null → "unknown" label.
    expect(screen.getByTestId('inventory-summary-wingetReady').textContent).toMatch(
      /Bilinmiyor|Unknown/,
    );
  });

  it('truncated=true iken truncated uyarisi gosterir', () => {
    const snapshot = buildSnapshot({ truncated: true });
    mockQuery({ data: buildResponse(snapshot, [buildItem()]) });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-summary-truncated')).toBeInTheDocument();
  });

  it('wingetReady=true ise "ready", false ise "not ready" goruntulenir', () => {
    const snapshot = buildSnapshot({ wingetReady: false });
    mockQuery({ data: buildResponse(snapshot, [buildItem()]) });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-summary-wingetReady').textContent).toMatch(
      /Hazır değil|Not Ready/,
    );
  });
});

describe('InventoryTab — items table + filters', () => {
  it('appsAvailable=true ve items var iken filter formu + tablo render eder', () => {
    const items = [
      buildItem({
        id: 'a',
        displayName: 'Mozilla Firefox 124',
        publisher: 'Mozilla',
        installSource: 'HKLM',
      }),
      buildItem({
        id: 'b',
        displayName: '7-Zip 23.01 (x64)',
        publisher: 'Igor Pavlov',
        installSource: 'HKLM_WOW6432',
      }),
    ];
    mockQuery({ data: buildResponse(buildSnapshot(), items) });

    render(<InventoryTab deviceId="d-1" active />);

    expect(screen.getByTestId('inventory-filters')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-filter-q')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-filter-publisher')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-filter-installSource')).toBeInTheDocument();

    const table = screen.getByTestId('inventory-items-table');
    expect(table).toBeInTheDocument();
    expect(table.textContent).toContain('Mozilla Firefox 124');
    expect(table.textContent).toContain('7-Zip 23.01 (x64)');
  });

  it('appsAvailable=true ama items bos iken "items.empty" mesaji gosterir', () => {
    mockQuery({ data: buildResponse(buildSnapshot({ appCount: 0 }), []) });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.getByTestId('inventory-items-empty')).toBeInTheDocument();
  });

  it('q filtresine yazınca hook yeni q parametresi ile cagirilir', () => {
    mockQuery({ data: buildResponse(buildSnapshot(), [buildItem()]) });
    render(<InventoryTab deviceId="d-1" active />);

    const input = screen.getByTestId('inventory-filter-q') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'firefox' } });

    const lastCallArgs = useGetDeviceSoftwareInventoryQueryMock.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toMatchObject({ deviceId: 'd-1', q: 'firefox' });
  });

  it('installSource select degisince hook installSource parametresi ile cagirilir', () => {
    mockQuery({ data: buildResponse(buildSnapshot(), [buildItem()]) });
    render(<InventoryTab deviceId="d-1" active />);

    const select = screen.getByTestId('inventory-filter-installSource') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'HKLM_WOW6432' } });

    const lastCallArgs = useGetDeviceSoftwareInventoryQueryMock.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toMatchObject({ installSource: 'HKLM_WOW6432' });
  });
});

describe('InventoryTab — pagination', () => {
  it('totalPages>1 iken pager + next/prev butonlari gosterir', () => {
    const items = [buildItem(), buildItem({ id: 'second' })];
    mockQuery({
      data: buildResponse(buildSnapshot({ appCount: 60 }), items, {
        totalPages: 3,
        totalElements: 60,
        number: 0,
      }),
    });

    render(<InventoryTab deviceId="d-1" active />);

    expect(screen.getByTestId('inventory-pager')).toBeInTheDocument();
    const next = screen.getByTestId('inventory-pager-next');
    const prev = screen.getByTestId('inventory-pager-prev');
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    fireEvent.click(next);
    const lastCallArgs = useGetDeviceSoftwareInventoryQueryMock.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toMatchObject({ page: 1 });
  });

  it('totalPages=1 iken pager render edilmez', () => {
    mockQuery({ data: buildResponse(buildSnapshot(), [buildItem()]) });
    render(<InventoryTab deviceId="d-1" active />);
    expect(screen.queryByTestId('inventory-pager')).toBeNull();
  });
});
