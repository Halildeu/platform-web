/**
 * ScatterBrushGridDemoLive — Faz 21.11 PR-A2c-adopt design-lab demo.
 *
 * Pairs a real `ScatterChart` (with `enableBrush`) against a mock
 * AG Grid that renders the live `IFilterModel` it receives from the
 * cross-filter store. The pattern matches `CrossFilterGridDemoLive`
 * (Bar → grid click flow) — same store provider, same mock grid API
 * shape — so the design-lab tester can SEE the brush adoption end
 * to end:
 *
 *   1. User drags a rectangle on the scatter
 *   2. `onBrushSelection` fires with a normalised `BrushSelection`
 *   3. The chart-side hook pushes a `CrossFilterEntry`
 *      `{ operator: 'brush', value: { selection, xColId, yColId } }`
 *      into the store
 *   4. `useGridCrossFilter` (PR-A2c-adopt) folds the brush into the
 *      AG Grid filter model via `mergeBrushFilterModel`, preserving
 *      any non-brush column filters (e.g. a status set-filter the
 *      user toggled in the grid toolbar)
 *   5. The mock grid's `setFilterModel` updates a React state so the
 *      filter model panel re-renders and proves the round-trip
 *
 * Real AG Grid mount is intentionally out of scope (Codex thread
 * `019e1020` iter-1 §4 — heavy in jsdom + AG Grid behaviour locked
 * elsewhere). Real `EntityGridTemplate` adoption lives in PR-A2c-prod
 * once the helper contract has burned in via this demo.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  CrossFilterProvider,
  ScatterChart,
  brushFilterKey,
  useCrossFilterStoreApi,
  useGridCrossFilter,
} from '@mfe/x-charts';
import type { BrushSelection } from '@mfe/x-charts';

interface ScatterRow {
  id: number;
  salary: number;
  tenure: number;
  status: 'ACTIVE' | 'PASSIVE';
  label: string;
}

const FIXTURE: readonly ScatterRow[] = [
  { id: 1, salary: 25000, tenure: 1, status: 'ACTIVE', label: 'A1' },
  { id: 2, salary: 30000, tenure: 2, status: 'ACTIVE', label: 'A2' },
  { id: 3, salary: 35000, tenure: 2, status: 'PASSIVE', label: 'P1' },
  { id: 4, salary: 45000, tenure: 3, status: 'ACTIVE', label: 'A3' },
  { id: 5, salary: 60000, tenure: 4, status: 'ACTIVE', label: 'A4' },
  { id: 6, salary: 75000, tenure: 5, status: 'PASSIVE', label: 'P2' },
  { id: 7, salary: 90000, tenure: 6, status: 'ACTIVE', label: 'A5' },
  { id: 8, salary: 110000, tenure: 8, status: 'ACTIVE', label: 'A6' },
  { id: 9, salary: 140000, tenure: 10, status: 'PASSIVE', label: 'P3' },
  { id: 10, salary: 180000, tenure: 12, status: 'ACTIVE', label: 'A7' },
];

interface MockGridApi {
  setFilterModel: (model: Record<string, unknown>) => void;
  refreshServerSide: (params?: { purge?: boolean }) => void;
  getFilterModel: () => Record<string, unknown>;
}

const useMockGridApi = (
  initial: Record<string, unknown> = {},
): { api: MockGridApi; filterModel: Record<string, unknown> } => {
  const [filterModel, setFilterModel] = useState<Record<string, unknown>>(initial);
  const filterModelRef = useRef(filterModel);
  filterModelRef.current = filterModel;

  const api = useMemo<MockGridApi>(
    () => ({
      setFilterModel: (model) => {
        setFilterModel({ ...model });
      },
      refreshServerSide: () => {
        /* mock no-op */
      },
      getFilterModel: () => filterModelRef.current,
    }),
    [],
  );
  return { api, filterModel };
};

const ScatterSide: React.FC = () => {
  const storeApi = useCrossFilterStoreApi();
  const [lastSelection, setLastSelection] = useState<BrushSelection | null>(null);

  const handleBrushSelection = useCallback(
    (selection: BrushSelection | null) => {
      setLastSelection(selection);
      const state = storeApi.getState();
      const xColId = 'salary';
      const yColId = 'tenure';
      const field = brushFilterKey(xColId, yColId);
      if (selection === null) {
        // Clear: drop the brush entry from the store. The grid
        // hook (PR-A2c-adopt) sees the brush vanish and strips
        // its previously-owned x/y columns from the filter model.
        state.removeFilter(`scatter-brush-grid-chart:${field}`);
        return;
      }
      state.setFilter({
        sourceId: 'scatter-brush-grid-chart',
        field,
        operator: 'brush',
        value: { selection, xColId, yColId },
        createdAt: Date.now(),
      });
    },
    [storeApi],
  );

  const xValues = useMemo(() => FIXTURE.map((row) => row.salary), []);
  const yValues = useMemo(() => FIXTURE.map((row) => row.tenure), []);

  const data = useMemo(
    () =>
      FIXTURE.map((row, i) => ({
        x: row.salary,
        y: row.tenure,
        label: row.label,
        originalIndex: i,
      })),
    [],
  );

  return (
    <div className="space-y-2" data-testid="scatter-brush-grid-chart-panel">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="font-semibold">Salary vs Tenure (drag to brush)</span>
        <span
          className="rounded bg-state-info-bg px-2 py-0.5 text-state-info-text"
          data-testid="scatter-brush-grid-selection"
        >
          {lastSelection
            ? `selection: ${lastSelection.indices.length} pts (x ${
                lastSelection.from.x ?? '·'
              }–${lastSelection.to.x ?? '·'})`
            : 'no selection'}
        </span>
      </div>
      <ScatterChart
        data={data}
        title="Salary vs Tenure"
        xLabel="Salary"
        yLabel="Tenure (yrs)"
        size="md"
        animate={false}
        enableBrush
        onBrushSelection={handleBrushSelection}
      />
      <p className="text-[11px] text-text-secondary">
        x-range: {Math.min(...xValues)}–{Math.max(...xValues)} · y-range: {Math.min(...yValues)}–
        {Math.max(...yValues)}
      </p>
    </div>
  );
};

const GridSide: React.FC = () => {
  // Seed the grid model with a status set-filter so the demo
  // proves the merge semantic (PR-A2c §P1.2): brush-driven x/y
  // columns coexist with non-brush column filters.
  const { api, filterModel } = useMockGridApi({
    status: { filterType: 'set', values: ['ACTIVE'] },
  });
  useGridCrossFilter({
    gridId: 'scatter-brush-grid-mock',
    gridApi: api,
  });

  const entries = Object.entries(filterModel);
  return (
    <div
      className="rounded border border-border-subtle bg-surface-default p-3 text-xs"
      data-testid="scatter-brush-grid-mock-panel"
    >
      <div className="flex items-center justify-between text-text-secondary">
        <span className="font-semibold">Mock grid filter model</span>
        <span data-testid="scatter-brush-grid-filter-count">
          {entries.length} filter{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-text-secondary" data-testid="scatter-brush-grid-empty">
          (no filters)
        </p>
      ) : (
        <ul className="mt-2 space-y-1 font-mono">
          {entries.map(([field, config]) => (
            <li key={field} data-testid={`scatter-brush-grid-filter-${field}`}>
              <strong>{field}</strong>: {JSON.stringify(config)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const ScatterBrushGridDemoLive: React.FC = () => {
  return (
    <CrossFilterProvider>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="scatter-brush-grid-demo">
        <ScatterSide />
        <GridSide />
      </div>
    </CrossFilterProvider>
  );
};

export default ScatterBrushGridDemoLive;
