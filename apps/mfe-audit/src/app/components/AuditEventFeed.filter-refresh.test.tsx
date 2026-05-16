// @vitest-environment jsdom
/**
 * AuditEventFeed — filter/deeplink refresh carries the NEW filters
 * (Codex 019e2f86 REVISE finding 2).
 *
 * The SSRM datasource's `getRows` reads the active filter from
 * `filtersRef.current`. Before the fix `onFilterSubmit` / the deeplink
 * `useEffect` called `setFilters(next)` then `refreshData()` — but the
 * ref was only flushed by a post-render effect, so the refresh fired
 * with the STALE filter set. The fix assigns `filtersRef.current`
 * synchronously before `refreshData()`.
 *
 * These tests drive a controllable `AgGridReact` mock: its synthetic
 * `GridApi` captures the SSRM datasource attached via
 * `setGridOption('serverSideDatasource', ds)` and re-invokes
 * `ds.getRows` on `refreshServerSide`. The assertion locks that the
 * first `getRows` request AFTER a filter change calls
 * `fetchAuditEvents` with the just-applied filter params.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  Controllable AgGridReact mock                                      */
/* ------------------------------------------------------------------ */
/*
 * The real AG Grid cannot render in jsdom. This mock builds a minimal
 * synthetic GridApi that the EntityGridTemplate → DatasourceModeAdapter
 * stack drives exactly like the real one:
 *  - `setGridOption('serverSideDatasource', ds)` → store the datasource
 *  - `refreshServerSide()` → re-run `ds.getRows` with a fresh request
 * `onGridReady` fires on mount so the audit component attaches its
 * datasource and the adapter wires it onto the api.
 */
type GetRows = (params: {
  request: { startRow: number; endRow: number; sortModel: unknown[] };
  success?: (p: { rowData: unknown[]; rowCount: number }) => void;
  fail?: () => void;
}) => void | Promise<void>;

interface MockServerDatasource {
  getRows: GetRows;
}

function createMockApi() {
  let datasource: MockServerDatasource | null = null;
  const options = new Map<string, unknown>();

  const runGetRows = () => {
    if (!datasource) return;
    datasource.getRows({
      request: { startRow: 0, endRow: 10, sortModel: [] },
      success: () => {},
      fail: () => {},
    });
  };

  const api: Record<string, unknown> = {
    setGridOption: (key: string, value: unknown) => {
      options.set(key, value);
      if (key === 'serverSideDatasource') {
        datasource = value as MockServerDatasource;
        // The real grid issues an initial block fetch once the
        // datasource is attached.
        runGetRows();
      }
    },
    getGridOption: (key: string) => options.get(key),
    refreshServerSide: () => {
      runGetRows();
    },
    getDisplayedRowCount: () => 0,
    paginationGetCurrentPage: () => 0,
    paginationGetTotalPages: () => 0,
    paginationGetPageSize: () => 10,
    paginationGetRowCount: () => 0,
    paginationGoToFirstPage: () => {},
    ensureIndexVisible: () => {},
    ensureNodeVisible: () => {},
    forEachNode: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    applyColumnState: () => {},
    getColumnState: () => [],
  };
  return api;
}

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    const apiRef = React.useRef<Record<string, unknown> | null>(null);
    React.useEffect(() => {
      if (apiRef.current) return;
      const api = createMockApi();
      apiRef.current = api;
      const onGridReady = props.onGridReady as ((e: { api: unknown }) => void) | undefined;
      onGridReady?.({ api });
      // Mount-once: a guard ref makes the empty-deps array intentional.
    }, []);
    return <div data-testid="ag-grid-mock" />;
  },
}));

// AG Grid setup side-effect — no-op in tests.
vi.mock('@mfe/design-system/advanced/data-grid/setup', () => ({
  AG_GRID_SETUP_COMPLETE: true,
}));

// VariantIntegration pulls fetch-based grid-variant APIs; stub it out
// so the test stays focused on the datasource filter wiring.
vi.mock('@mfe/design-system', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    EntityGridTemplate: actual.EntityGridTemplate,
  };
});

// Audit live stream — the SSE/poll hook is irrelevant here.
vi.mock('../hooks/useAuditLiveStream', () => ({
  useAuditLiveStream: () => {},
}));

// Shell services — return null so telemetry/export gating is inert.
vi.mock('../services/shell-services', () => ({
  getShellServices: () => {
    throw new Error('shell services not available in test');
  },
}));

/* ------------------------------------------------------------------ */
/*  audit-api mock — records the filters every fetch was called with   */
/* ------------------------------------------------------------------ */

interface FetchAuditEventsArg {
  page: number;
  pageSize: number;
  filters?: Record<string, string>;
  sort?: string;
}

const fetchAuditEvents = vi.fn(async (_args: FetchAuditEventsArg) => ({
  events: [] as unknown[],
  total: 0,
  page: 0,
  fallback: false,
}));

vi.mock('../services/audit-api', () => ({
  fetchAuditEvents: (args: FetchAuditEventsArg) => fetchAuditEvents(args),
  createAuditExportJob: vi.fn(),
  downloadAuditExportJob: vi.fn(),
  waitForAuditExportJob: vi.fn(),
}));

import { AuditEventFeed } from './AuditEventFeed';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const lastFetchFilters = (): Record<string, string> | undefined => {
  const calls = fetchAuditEvents.mock.calls;
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1][0].filters;
};

beforeEach(() => {
  fetchAuditEvents.mockClear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
});

describe('AuditEventFeed — filter refresh carries new filters (finding 2)', () => {
  it('applying a filter triggers a getRows fetch with the NEW filter params', async () => {
    render(<AuditEventFeed />);

    // Initial datasource attach fires one getRows → one fetch.
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalled());
    fetchAuditEvents.mockClear();

    // Type a userEmail filter and submit the filter form.
    fireEvent.change(screen.getByTestId('audit-filter-user-email'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByTestId('audit-filter-apply'));

    // The submit synchronously refreshes the SSRM datasource; the
    // resulting getRows MUST carry the just-applied filter — proving
    // `filtersRef.current` was set before `refreshData()`.
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalled());
    expect(lastFetchFilters()).toMatchObject({ userEmail: 'alice@example.com' });
  });

  it('a deeplink location change refreshes getRows with the deeplink filters', async () => {
    render(<AuditEventFeed />);
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalled());
    fetchAuditEvents.mockClear();

    // Simulate a deeplink navigation (the audit feed listens to the
    // window search via useWindowSearch + a popstate event).
    window.history.pushState({}, '', '/?service=auth-service');
    fireEvent.popState(window);

    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalled());
    expect(lastFetchFilters()).toMatchObject({ service: 'auth-service' });
  });
});
