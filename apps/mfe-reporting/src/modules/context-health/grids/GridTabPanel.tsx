import React from 'react';
import type { ColDef } from 'ag-grid-community';
// Grid-contract migration (PR grid-contract): GridTabPanel renders
// through the design-system grid contract instead of a raw
// `AgGridReact`. The bespoke `GridColumnDef.type` union is mapped to
// the design-system `ColumnMeta` column-system; columns are built
// with `buildColDefs` and the hardcoded badge-tone logic is replaced
// by the `badge` columnType's `variantMap`.
//
// `GridShell` (not `EntityGridTemplate`) is the contract surface here
// on purpose: these context-health debug grids are read-only, tabbed,
// `autoHeight` panels with no toolbar / variant / export / filter
// needs. `EntityGridTemplate` would force a full toolbar and a fixed
// `calc(100vh - 320px)` height onto a small summary grid. `GridShell`
// IS part of the contract (the same wrapper `EntityGridTemplate`
// composes) — it is the correct fit for a no-toolbar grid.
import {
  GridShell,
  buildColDefs,
  type ColumnMeta,
  type BadgeColumnMeta,
} from '@mfe/design-system/advanced/data-grid';
// Side-effect: ensures AG Grid modules are registered.
import '@mfe/design-system/advanced/data-grid/setup';
import type { GridMeta, GridColumnDef } from '../types';

type Props = {
  grids: GridMeta[];
  activeGridId: string | null;
  gridData: Record<string, unknown>[];
  onSelectGrid: (gridId: string) => void;
};

/*
 * Badge variant map for `badge`-typed context-health columns.
 *
 * Pre-migration the badge cell rendered raw HTML via a bespoke
 * `badgeTone()` helper that hardcoded a status string → Tailwind
 * class lookup. The design-system `badge` columnType replaces this
 * with a declarative `variantMap` (raw value → BadgeVariant). The
 * key set below is the same status vocabulary `badgeTone()` matched;
 * `defaultVariant: 'muted'` covers anything outside it (the old
 * `bg-gray-100` fallback).
 */
const HEALTH_BADGE_VARIANT_MAP: BadgeColumnMeta['variantMap'] = {
  OK: 'success',
  READY: 'success',
  PASS: 'success',
  YES: 'success',
  WARN: 'warning',
  WARNING: 'warning',
  MEDIUM: 'warning',
  FAIL: 'error',
  ERROR: 'error',
  NO: 'error',
  HIGH: 'error',
  BLOCKED: 'error',
};

/*
 * Wire-type → design-system `ColumnMeta` mapper.
 *
 * `GridColumnDef` (in `../types`) stays as the backend wire shape
 * returned by `GET /v1/context-health/grids`. Inside the component it
 * is converted to a declarative `ColumnMeta` so `buildColDefs`
 * produces the AG Grid `ColDef` — replacing the hand-rolled
 * `mapColumnType` transformer.
 *
 * Badge tone parity: the design-system `createBadgeRenderer`
 * uppercases the raw cell value before the `variantMap` lookup
 * (`variantMap[raw.toUpperCase()]`) — identical to the old
 * `badgeTone()` helper which did `value.toUpperCase()`. The
 * uppercase-keyed `HEALTH_BADGE_VARIANT_MAP` therefore matches
 * lowercase server values too; tone behaviour is preserved exactly.
 */
const toColumnMeta = (col: GridColumnDef): ColumnMeta => {
  const base = {
    field: col.field,
    // `headerNameKey` accepts a raw (already-translated) string —
    // context-health has no i18n dictionary, the backend sends the
    // display label directly.
    headerNameKey: col.headerName,
    width: col.width,
  };
  switch (col.type) {
    case 'number':
      return { ...base, columnType: 'number' };
    case 'date':
      return { ...base, columnType: 'date' };
    case 'badge':
      return {
        ...base,
        columnType: 'badge',
        variantMap: HEALTH_BADGE_VARIANT_MAP,
        defaultVariant: 'muted',
      };
    case 'text':
    default:
      return { ...base, columnType: 'text' };
  }
};

// Identity translator — context-health has no i18n dictionary; the
// backend supplies pre-translated header labels.
const identityTranslate = (key: string): string => key;

const GridTabPanel: React.FC<Props> = ({ grids, activeGridId, gridData, onSelectGrid }) => {
  const activeGrid = grids.find((g) => g.gridId === activeGridId);

  const columnDefs = React.useMemo<ColDef[]>(() => {
    if (!activeGrid) return [];
    const metas = activeGrid.columns.map(toColumnMeta);
    return buildColDefs(metas, identityTranslate) as ColDef[];
  }, [activeGrid]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border-subtle">
        {grids.map((grid) => (
          <button
            key={grid.gridId}
            onClick={() => onSelectGrid(grid.gridId)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              grid.gridId === activeGridId
                ? 'border-b-2 border-action-primary text-action-primary'
                : 'text-text-subtle hover:text-text-primary'
            }`}
          >
            {grid.title}
          </button>
        ))}
      </div>
      <GridShell
        // Remount the grid per tab so `autoHeight` recomputes for the
        // new row set (parity with the previous `AgGridReact` instance
        // which was re-rendered with fresh `columnDefs`/`rowData`).
        gridKey={activeGridId ?? 'context-health-grid'}
        columnDefs={columnDefs}
        // Grid-contract migration (Codex 019e2f86 finding 5): the
        // context-health `GridColumnDef` wire type carries a REQUIRED
        // pixel `width` per column, so the backend deliberately sizes
        // these debug grids. `GridShell`'s `DEFAULT_COL_DEF` sets
        // `flex: 1`, and AG Grid lets `flex` win over `width` when a
        // column inherits both — which would flex-distribute away the
        // server-sent pixel widths. Clearing `flex` on the default
        // colDef lets each column's explicit `width` win, restoring
        // pre-migration column sizing.
        defaultColDef={{ flex: undefined }}
        rowData={gridData}
        rowModelType="clientSide"
        // `gridOptions` is spread AFTER GridShell's explicit AgGridReact
        // props, so these keys override the contract defaults:
        //  - `domLayout: 'autoHeight'` — restores the panel's natural
        //    height (the old raw grid used autoHeight).
        //  - `suppressPaginationPanel: false` — GridShell defaults this
        //    to `true` (EntityGridTemplate replaces the panel with its
        //    own footer). A bare GridShell has no footer child, so the
        //    AG Grid native pagination panel is re-enabled to preserve
        //    the pre-migration paging UX.
        //  - `paginationPageSize: 15` — same page size as before.
        gridOptions={{
          domLayout: 'autoHeight',
          pagination: true,
          paginationPageSize: 15,
          suppressPaginationPanel: false,
          suppressCellFocus: true,
          animateRows: false,
        }}
        animateRows={false}
        height="auto"
      />
    </div>
  );
};

export default GridTabPanel;
