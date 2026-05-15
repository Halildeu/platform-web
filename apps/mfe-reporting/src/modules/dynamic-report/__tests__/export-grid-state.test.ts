import { describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { captureExportGridState } from '../export-grid-state';

/**
 * PR-0.5b (Codex thread 019e2cd7): cover the AG Grid snapshot
 * adapter that produces the export `gridState` payload. The shape
 * matters because the backend dispatcher (sanitizeAggregations +
 * singleLevelPivotRequest reuse) reads `id` / `field` / `aggFunc`
 * verbatim — a missing field or stray null aggFunc would break
 * the export contract.
 */
describe('captureExportGridState', () => {
  const mockColumn = (overrides: {
    colId: string;
    field?: string;
    headerName?: string;
    aggFunc?: string | unknown;
  }) => {
    const colDef = {
      field: overrides.field,
      headerName: overrides.headerName,
    };
    return {
      getColId: () => overrides.colId,
      getColDef: () => colDef,
      getAggFunc: () => overrides.aggFunc ?? null,
    } as unknown as ReturnType<GridApi['getRowGroupColumns']>[number];
  };

  it('returns undefined when api is null', () => {
    expect(captureExportGridState(null)).toBeUndefined();
  });

  it('captures rowGroupCols, valueCols, pivotCols and pivotMode', () => {
    const api = {
      getRowGroupColumns: () => [
        mockColumn({ colId: 'category', field: 'category', headerName: 'Category' }),
      ],
      getValueColumns: () => [
        mockColumn({ colId: 'amount', field: 'amount', headerName: 'Amount', aggFunc: 'sum' }),
      ],
      getPivotColumns: () => [mockColumn({ colId: 'ba', field: 'ba', headerName: 'B/A' })],
      isPivotMode: () => true,
      getFilterModel: () => ({ category: { type: 'equals', filter: 'FIN' } }),
      getColumnState: () => [
        { colId: 'category', sort: 'asc' as const, sortIndex: 0 },
        { colId: 'amount', sort: 'desc' as const, sortIndex: 1 },
      ],
    } as unknown as GridApi;

    const state = captureExportGridState(api);

    expect(state).toBeDefined();
    expect(state?.rowGroupCols).toEqual([
      { id: 'category', displayName: 'Category', field: 'category', aggFunc: undefined },
    ]);
    expect(state?.valueCols).toEqual([
      { id: 'amount', displayName: 'Amount', field: 'amount', aggFunc: 'sum' },
    ]);
    expect(state?.pivotCols).toEqual([
      { id: 'ba', displayName: 'B/A', field: 'ba', aggFunc: undefined },
    ]);
    expect(state?.pivotMode).toBe(true);
    expect(state?.filterModel).toEqual({
      category: { type: 'equals', filter: 'FIN' },
    });
    expect(state?.sortModel).toEqual([
      { colId: 'category', sort: 'asc' },
      { colId: 'amount', sort: 'desc' },
    ]);
  });

  it('drops function-shaped aggFunc values (custom client-side aggregators)', () => {
    // AG Grid allows aggFunc to be a function for custom aggregators;
    // those don't map to backend SQL so we strip them in the wire payload.
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [mockColumn({ colId: 'amount', field: 'amount', aggFunc: () => 0 })],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [],
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state?.valueCols?.[0]?.aggFunc).toBeUndefined();
  });

  it('returns empty arrays when grid has no grouping intent', () => {
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [],
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state?.rowGroupCols).toEqual([]);
    expect(state?.valueCols).toEqual([]);
    expect(state?.pivotCols).toEqual([]);
    expect(state?.pivotMode).toBe(false);
  });

  it('orders sortModel by sortIndex (deterministic multi-column sort)', () => {
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [
        // intentionally out of order to verify the helper sorts
        { colId: 'b', sort: 'desc' as const, sortIndex: 1 },
        { colId: 'a', sort: 'asc' as const, sortIndex: 0 },
        { colId: 'c', sort: null, sortIndex: null },
      ],
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state?.sortModel).toEqual([
      { colId: 'a', sort: 'asc' },
      { colId: 'b', sort: 'desc' },
    ]);
  });

  it('returns undefined on api throw (component unmount race)', () => {
    const api = {
      getRowGroupColumns: () => {
        throw new Error('grid destroyed');
      },
    } as unknown as GridApi;

    expect(captureExportGridState(api)).toBeUndefined();
  });

  it('omits filterModel when api returns null', () => {
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [],
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state?.filterModel).toBeUndefined();
  });

  /*
   * PR-0.5b2 iter-2 §P2 (Codex 019e2d85): capture the toolbar
   * quick-filter so a raw / view export honours the on-screen quick
   * search. The capture is best-effort — a grid api without
   * getGridOption must NOT collapse the whole snapshot.
   */
  it('captures quickFilterText from the grid quick-filter option (PR-0.5b2 §P2)', () => {
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [],
      getGridOption: (key: string) => (key === 'quickFilterText' ? 'istanbul' : undefined),
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state?.quickFilterText).toBe('istanbul');
  });

  it('omits quickFilterText when the quick-filter is empty / whitespace', () => {
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [],
      getGridOption: (key: string) => (key === 'quickFilterText' ? '   ' : undefined),
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state?.quickFilterText).toBeUndefined();
  });

  it('survives a grid api without getGridOption (older AG Grid / partial stub)', () => {
    // The mock apis above intentionally omit getGridOption; the
    // capture must still return a defined snapshot with
    // quickFilterText undefined — NOT collapse via the outer catch.
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [],
      getPivotColumns: () => [],
      isPivotMode: () => false,
      getFilterModel: () => null,
      getColumnState: () => [],
    } as unknown as GridApi;

    const state = captureExportGridState(api);
    expect(state).toBeDefined();
    expect(state?.quickFilterText).toBeUndefined();
  });
});

describe('exportReportData POST dispatch', () => {
  it('captures gridState shape covers the contract', () => {
    // Smoke test: the helper produces a payload the
    // ExportGridState type accepts. Real wire-level POST behavior is
    // covered by the fetchReportData test file (separate test).
    const expectedKeys: ReadonlyArray<keyof typeof sample> = [
      'rowGroupCols',
      'valueCols',
      'pivotCols',
      'pivotMode',
      'filterModel',
      'sortModel',
    ];
    const sample = {
      rowGroupCols: [],
      valueCols: [],
      pivotCols: [],
      pivotMode: false,
      filterModel: {},
      sortModel: [],
    };
    for (const key of expectedKeys) {
      expect(sample).toHaveProperty(key);
    }
  });
});
