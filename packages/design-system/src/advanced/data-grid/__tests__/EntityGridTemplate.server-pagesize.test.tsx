// @vitest-environment jsdom
/**
 * EntityGridTemplate — server-mode page/block size propagation
 * (Codex 019e2f86 REVISE finding 3).
 *
 * Before the fix a consumer-passed `pageSize` (e.g. audit's 10-row
 * cadence) never reached the SSRM stack:
 *  - GridShell hardcodes `paginationPageSize={50}` on AgGridReact;
 *  - DatasourceModeAdapter defaults `cacheBlockSize` to 100;
 *  - ServerPaginationFooter had no `pageSizeOptions` plumbing.
 *
 * The fix routes `pageSize` to all three. These tests assert the
 * effective page size AG Grid receives, the SSRM `cacheBlockSize`
 * applied via `setGridOption`, and that omitting `pageSize` keeps the
 * legacy defaults (no behaviour change for existing consumers).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  AgGridReact mock — captures the effective grid props + GridApi    */
/* ------------------------------------------------------------------ */
/*
 * GridShell renders `paginationPageSize={50}` then spreads
 * `{...gridOptions}` AFTER it, so the props the mock receives already
 * reflect the merged value (a `gridOptions.paginationPageSize` wins).
 * The mock records the last props and fires `onGridReady` with a
 * synthetic api whose `setGridOption` records every key — which is how
 * DatasourceModeAdapter applies `cacheBlockSize`.
 */
const lastGridProps: { current: Record<string, unknown> | null } = { current: null };
const setGridOptionCalls: Array<[string, unknown]> = [];

function createMockApi() {
  return {
    setGridOption: (key: string, value: unknown) => {
      setGridOptionCalls.push([key, value]);
    },
    getGridOption: () => undefined,
    paginationGetCurrentPage: () => 0,
    paginationGetTotalPages: () => 0,
    paginationGetPageSize: () => 50,
    paginationGetRowCount: () => 0,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    lastGridProps.current = props;
    const readyRef = React.useRef(false);
    React.useEffect(() => {
      if (readyRef.current) return;
      readyRef.current = true;
      const onGridReady = props.onGridReady as ((e: { api: unknown }) => void) | undefined;
      onGridReady?.({ api: createMockApi() });
      // Mount-once: a guard ref makes the empty-deps array intentional.
    }, []);
    return (
      <div
        data-testid="ag-grid-mock"
        data-pagination-page-size={String(props.paginationPageSize)}
      />
    );
  },
}));

vi.mock('../setup', () => ({ AG_GRID_SETUP_COMPLETE: true }));
vi.mock('../grid-theme.css', () => ({}));
vi.mock('../VariantIntegration', () => ({
  VariantIntegration: () => <div data-testid="variant-integration-mock" />,
}));

import { EntityGridTemplate } from '../EntityGridTemplate';

const noopDatasource = () => ({ getRows: () => {} });

beforeEach(() => {
  lastGridProps.current = null;
  setGridOptionCalls.length = 0;
});

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/*  pageSize → AG Grid paginationPageSize                              */
/* ------------------------------------------------------------------ */

describe('EntityGridTemplate — server pageSize propagation (finding 3)', () => {
  it('propagates a server-mode pageSize to AG Grid paginationPageSize', async () => {
    render(
      <EntityGridTemplate
        gridId="audit-grid"
        gridSchemaVersion={1}
        columnDefs={[{ field: 'id' }]}
        dataSourceMode="server"
        pageSize={10}
        createServerSideDatasource={noopDatasource}
      />,
    );
    await waitFor(() => expect(lastGridProps.current).not.toBeNull());
    // GridShell's hardcoded 50 must be overridden by the consumer's 10.
    expect(lastGridProps.current?.paginationPageSize).toBe(10);
    expect(screen.getByTestId('ag-grid-mock')).toHaveAttribute('data-pagination-page-size', '10');
  });

  it('propagates the server pageSize to the SSRM cacheBlockSize', async () => {
    render(
      <EntityGridTemplate
        gridId="audit-grid"
        gridSchemaVersion={1}
        columnDefs={[{ field: 'id' }]}
        dataSourceMode="server"
        pageSize={10}
        createServerSideDatasource={noopDatasource}
      />,
    );
    await waitFor(() =>
      expect(setGridOptionCalls.some(([k]) => k === 'cacheBlockSize')).toBe(true),
    );
    const cacheBlock = setGridOptionCalls.find(([k]) => k === 'cacheBlockSize');
    // The adapter must size the SSRM block to the page size, not 100.
    expect(cacheBlock?.[1]).toBe(10);
  });

  it('keeps the GridShell default (50) when no pageSize is passed', async () => {
    render(
      <EntityGridTemplate
        gridId="default-grid"
        gridSchemaVersion={1}
        columnDefs={[{ field: 'id' }]}
        dataSourceMode="server"
        createServerSideDatasource={noopDatasource}
      />,
    );
    await waitFor(() => expect(lastGridProps.current).not.toBeNull());
    expect(lastGridProps.current?.paginationPageSize).toBe(50);
  });

  it('keeps the SSRM cacheBlockSize default (100) when no pageSize is passed', async () => {
    render(
      <EntityGridTemplate
        gridId="default-grid"
        gridSchemaVersion={1}
        columnDefs={[{ field: 'id' }]}
        dataSourceMode="server"
        createServerSideDatasource={noopDatasource}
      />,
    );
    await waitFor(() =>
      expect(setGridOptionCalls.some(([k]) => k === 'cacheBlockSize')).toBe(true),
    );
    const cacheBlock = setGridOptionCalls.find(([k]) => k === 'cacheBlockSize');
    expect(cacheBlock?.[1]).toBe(100);
  });

  it('does not force paginationPageSize in client mode', async () => {
    render(
      <EntityGridTemplate
        gridId="client-grid"
        gridSchemaVersion={1}
        columnDefs={[{ field: 'id' }]}
        dataSourceMode="client"
        rowData={[{ id: 1 }]}
        pageSize={10}
      />,
    );
    await waitFor(() => expect(lastGridProps.current).not.toBeNull());
    // Client mode is unaffected — GridShell's own default stands.
    expect(lastGridProps.current?.paginationPageSize).toBe(50);
  });

  it('lets an explicit gridOptions.paginationPageSize win over the pageSize prop', async () => {
    render(
      <EntityGridTemplate
        gridId="explicit-grid"
        gridSchemaVersion={1}
        columnDefs={[{ field: 'id' }]}
        dataSourceMode="server"
        pageSize={10}
        gridOptions={{ paginationPageSize: 25 }}
        createServerSideDatasource={noopDatasource}
      />,
    );
    await waitFor(() => expect(lastGridProps.current).not.toBeNull());
    // The consumer's explicit gridOptions value is authoritative.
    expect(lastGridProps.current?.paginationPageSize).toBe(25);
  });
});
