/**
 * useGridCrossFilter — Hook for AG Grid integration with cross-filter bus
 *
 * Subscribes to store via event bridge. On filter change from charts,
 * calls gridApi methods. When grid filter changes, pushes back to store.
 *
 * Faz 21.11 PR-A2c-adopt — adopts the brush operator. Today the
 * `FilterOperator` enum already includes `'brush'` (PR-A2c shipped
 * the helper layer) but this hook used to silently ignore brush
 * entries. After this PR a `CrossFilterEntry` with `operator: 'brush'`
 * carrying a `BrushFilterValue` shape is translated to per-column
 * AG Grid `inRange` filters via `mergeBrushFilterModel`, preserving
 * any non-brush column filters the user had on the grid (Codex
 * thread `019e1020` iter-1).
 *
 * Backwards compat: brush-free filter stream keeps the legacy
 * `setFilterModel(model)` replace semantics — no change. Brush
 * entries flip the path into a merge mode that delete-then-layer
 * the brush x/y columns onto the existing model so non-brush
 * filters survive a brush update or clear.
 *
 * @see D-006 (cross-filter bus)
 */
import { useEffect, useCallback, useRef } from 'react';
import { useCrossFilterStoreApi } from './useCrossFilterStore';
import { createEventBridge } from './eventBridge';
import type { CrossFilterEntry, CrossFilterBridge } from './types';
import { brushToAgGridFilterModel, mergeBrushFilterModel } from './brushToAgGridFilter';
import type { BrushSelection } from './brushSelection';

/**
 * Typed value shape a `CrossFilterEntry` MUST carry when its
 * `operator === 'brush'`. The chart wrapper (`ScatterChart` etc.)
 * pushes this into the store via
 * `useCrossFilterStoreApi().getState().setFilter({ operator: 'brush',
 * value: { selection, xColId, yColId }, ... })`. A naked
 * `BrushSelection` is not enough — the AG Grid adapter needs the
 * column ids to know which axes the brush owns.
 */
export interface BrushFilterValue {
  selection: BrushSelection;
  xColId: string;
  yColId: string;
}

/** Stable `CrossFilterEntry.field` key for a brush entry. Single
 * key per (xColId, yColId) pair so a fresh brush update overwrites
 * the previous one without leaking stale entries. */
export function brushFilterKey(xColId: string, yColId: string): string {
  return `__brush__:${xColId}:${yColId}`;
}

function isBrushPoint(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const xOk = candidate.x === null || typeof candidate.x === 'number';
  const yOk = candidate.y === null || typeof candidate.y === 'number';
  return xOk && yOk;
}

/**
 * Strict shape guard. Codex iter-2 §P2: a thin `{ selection: {} }`
 * value used to slip through the loose previous guard and crash
 * the downstream `brushToAgGridFilterModel` when it dereferenced
 * `selection.from.x`. Now we walk the full `BrushSelection`
 * surface so a malformed entry is rejected at the boundary, not
 * inside the helper.
 */
function isBrushFilterValue(value: unknown): value is BrushFilterValue {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.xColId !== 'string' ||
    typeof candidate.yColId !== 'string' ||
    !candidate.selection ||
    typeof candidate.selection !== 'object'
  ) {
    return false;
  }
  const sel = candidate.selection as Record<string, unknown>;
  if (!isBrushPoint(sel.from) || !isBrushPoint(sel.to)) return false;
  if (!Array.isArray(sel.indices)) return false;
  if (sel.kind !== 'rect' && sel.kind !== 'polygon-bbox') return false;
  return true;
}

export interface GridApi {
  setFilterModel: (model: Record<string, unknown>) => void;
  refreshServerSide: (params?: { purge?: boolean }) => void;
  getFilterModel: () => Record<string, unknown>;
}

export interface UseGridCrossFilterOptions {
  /** Unique grid ID for the cross-filter store. */
  gridId: string;
  /** AG Grid API ref. Null until grid is ready. */
  gridApi: GridApi | null;
  /** Whether to automatically push grid filter changes to the store. @default true */
  syncGridToStore?: boolean;
  /** Whether to automatically apply store filters to the grid. @default true */
  syncStoreToGrid?: boolean;
}

export interface UseGridCrossFilterReturn {
  /** Filters from charts that apply to this grid. */
  activeFilters: CrossFilterEntry[];
  /** Manually push current grid filter model to the store. */
  pushGridFilters: () => void;
  /** Bridge instance for direct imperative access (AG Grid datasource). */
  bridge: CrossFilterBridge | null;
}

/**
 * Converts the non-brush subset of `CrossFilterEntry[]` to a raw
 * AG Grid FilterModel object. Brush entries are handled
 * separately by the merge path so non-brush column filters can
 * survive a brush update / clear.
 */
function toGridFilterModel(filters: CrossFilterEntry[]): Record<string, unknown> {
  const model: Record<string, unknown> = {};
  for (const f of filters) {
    if (f.operator === 'brush') continue; // owned by mergeBrushFilterModel below
    if (f.operator === 'eq') {
      model[f.field] = { filterType: 'text', type: 'equals', filter: f.value };
    } else if (f.operator === 'in') {
      model[f.field] = {
        filterType: 'set',
        values: Array.isArray(f.value) ? f.value : [f.value],
      };
    } else if (f.operator === 'range') {
      const range = f.value as { min: number; max: number };
      model[f.field] = {
        filterType: 'number',
        type: 'inRange',
        filter: range.min,
        filterTo: range.max,
      };
    }
  }
  return model;
}

/**
 * Pulls every brush entry out of `filters` and folds them into
 * the existing model via `mergeBrushFilterModel`. Returns the
 * merged model AND the set of `(xColId, yColId)` pairs the
 * brush currently owns so the caller can tell us when a brush
 * was cleared (axes vanish from the entry stream → previous
 * brush axes ref still has them → strip via merge with
 * `null` brushModel).
 *
 * Multi-brush semantics — Codex iter-2 Q3 note. When the same
 * `(xColId, yColId)` pair appears in two brush entries, **last
 * writer wins** (entries are folded in iteration order; the
 * later entry's `mergeBrushFilterModel` strips and re-layers
 * the same x/y keys). When two brushes share only ONE column
 * (e.g. A owns salary/tenure, B owns salary/age), the shared
 * column gets the later writer's bounds while the earlier
 * writer's unique column (tenure) survives. Multi-brush
 * rejection / overlap-conflict surfacing is out of scope for
 * PR-A2c-adopt; the demo wires a single brush.
 */
function applyBrushEntries(
  baseModel: Record<string, unknown>,
  filters: CrossFilterEntry[],
): {
  model: Record<string, unknown>;
  ownedAxes: Array<{ xColId: string; yColId: string }>;
} {
  let model: Record<string, unknown> = baseModel;
  const ownedAxes: Array<{ xColId: string; yColId: string }> = [];
  for (const f of filters) {
    if (f.operator !== 'brush') continue;
    if (!isBrushFilterValue(f.value)) continue; // unknown shape → silently ignore
    const { selection, xColId, yColId } = f.value;
    const brushModel = brushToAgGridFilterModel(selection, { xColId, yColId });
    const merged = mergeBrushFilterModel(model, brushModel, { xColId, yColId });
    model = merged ?? {};
    ownedAxes.push({ xColId, yColId });
  }
  return { model, ownedAxes };
}

export function useGridCrossFilter(options: UseGridCrossFilterOptions): UseGridCrossFilterReturn {
  const { gridId, gridApi, syncGridToStore = true, syncStoreToGrid = true } = options;

  const storeApi = useCrossFilterStoreApi();
  const bridgeRef = useRef<CrossFilterBridge | null>(null);

  const filtersRef = useRef<CrossFilterEntry[]>([]);
  // PR-A2c-adopt: previous brush ownership ref. When a brush
  // entry vanishes from the filter stream (user dragged "clear"),
  // we still need to strip the owned x/y columns from the grid
  // model — `mergeBrushFilterModel(currentGridModel, null, opts)`
  // does that. Without this ref we can't tell a "brush cleared"
  // state apart from a "no brush ever existed" state.
  const previousBrushAxesRef = useRef<Array<{ xColId: string; yColId: string }>>([]);

  // Create bridge + subscribe to filter changes
  useEffect(() => {
    const bridge = createEventBridge(storeApi);
    bridgeRef.current = bridge;

    bridge.on((event) => {
      // Compute filters for this grid (exclude own)
      const allFilters = event.payload.filters;
      const applicable: CrossFilterEntry[] = [];
      for (const entry of allFilters.values()) {
        if (entry.sourceId !== gridId) applicable.push(entry);
      }
      filtersRef.current = applicable;

      // Apply to grid if sync enabled
      if (syncStoreToGrid && gridApi) {
        const hasBrush = applicable.some((f) => f.operator === 'brush');
        const previousAxes = previousBrushAxesRef.current;
        const hadPreviousBrush = previousAxes.length > 0;

        if (!hasBrush && !hadPreviousBrush) {
          // Legacy bit-identical path: no brush in the store and
          // none was ever there → set the model wholesale and
          // refresh. Backwards compat with every chart that
          // doesn't opt into brush.
          const model = toGridFilterModel(applicable);
          gridApi.setFilterModel(model);
          gridApi.refreshServerSide({ purge: true });
          return;
        }

        // Brush-aware path. Codex iter-2 §P1 sequencing:
        //   1. Seed from the CURRENT grid model (preserves
        //      grid-local entries the user toggled directly).
        //   2. Strip previously-owned brush axis pairs that ARE NOT
        //      present in the current `applicable` stream — a
        //      `mergeBrushFilterModel(model, null, opts)` call
        //      deletes only `xColId` + `yColId`. Doing the strip
        //      BEFORE layering the cross-filter overlay means a
        //      sibling chart's `range` on the same column survives
        //      a brush clear (the previous-iter sequencing dropped
        //      those non-brush overlays alongside the brush
        //      vacate).
        //   3. Layer the non-brush cross-filter overlay (eq/in/range
        //      from sibling charts) — overwrites any grid-local
        //      entry on the same column to keep legacy replace
        //      semantics.
        //   4. Layer the active brush entries — `applyBrushEntries`
        //      runs `mergeBrushFilterModel(model, brushModel, opts)`
        //      per (xColId, yColId) pair so a fresh brush
        //      overwrites stale brush bounds without leaking.
        let nextModel: Record<string, unknown> = gridApi.getFilterModel() ?? {};

        // Step 2 — collect current brush pair keys + strip vanished.
        // We dedupe on `xColId::yColId` so the same pair re-asserted
        // by the new stream is NOT stripped here (it'll be re-applied
        // in step 4 fresh).
        const currentBrushPairKeys = new Set<string>();
        if (hasBrush) {
          for (const f of applicable) {
            if (f.operator !== 'brush') continue;
            if (!isBrushFilterValue(f.value)) continue;
            currentBrushPairKeys.add(`${f.value.xColId}::${f.value.yColId}`);
          }
        }
        for (const prev of previousAxes) {
          if (currentBrushPairKeys.has(`${prev.xColId}::${prev.yColId}`)) continue;
          const stripped = mergeBrushFilterModel(nextModel, null, prev);
          nextModel = stripped ?? {};
        }

        // Step 3 — non-brush cross-filter overlay.
        const overlay = toGridFilterModel(applicable);
        nextModel = { ...nextModel, ...overlay };

        // Step 4 — active brush entries.
        if (hasBrush) {
          const { model: mergedModel, ownedAxes } = applyBrushEntries(nextModel, applicable);
          nextModel = mergedModel;
          previousBrushAxesRef.current = ownedAxes;
        } else {
          previousBrushAxesRef.current = [];
        }

        gridApi.setFilterModel(nextModel);
        gridApi.refreshServerSide({ purge: true });
      }
    });

    return () => {
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, [storeApi, gridId, gridApi, syncStoreToGrid]);

  // Push grid filter changes to store (imperative — no useCrossFilter needed)
  const pushGridFilters = useCallback(() => {
    if (!gridApi || !syncGridToStore) return;
    const model = gridApi.getFilterModel();
    const store = storeApi.getState();
    for (const [field, config] of Object.entries(model)) {
      const filterConfig = config as Record<string, unknown>;
      store.setFilter({
        sourceId: gridId,
        field,
        value: filterConfig.filter ?? filterConfig.values,
        operator: filterConfig.filterType === 'set' ? 'in' : 'eq',
        createdAt: Date.now(),
      });
    }
  }, [gridApi, gridId, syncGridToStore, storeApi]);

  return {
    activeFilters: filtersRef.current,
    pushGridFilters,
    bridge: bridgeRef.current,
  };
}
