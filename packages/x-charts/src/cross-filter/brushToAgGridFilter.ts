/**
 * brushToAgGridFilterModel — pure converter that turns a
 * normalised `BrushSelection` into an AG Grid v34.3.1
 * `IFilterModel` keyed per column.
 *
 * Faz 21.11 PR-A2c — Cross-filter rectangle brush parity.
 *
 * Contract (per Codex iter-1 §5)
 *   - Emits SIMPLE per-column `inRange` filter models — NOT
 *     advanced filter models, NOT `combinedSimpleModels`.
 *     Mirrors what `AGGridAdapter.entriesToAgFilter` already
 *     does for `range` operators (`grid-adapter/AGGridAdapter.ts`)
 *     so the SSRM pipeline accepts the brush filter without
 *     any backend change.
 *   - Open-ended axis (one bound `null`) collapses to
 *     `greaterThanOrEqual` / `lessThanOrEqual` instead of
 *     `inRange`. Drops the column entirely when both bounds
 *     are `null`.
 *   - Empty selection (`null`) → `null` filter model. Caller
 *     should clear the AG Grid filter when this is returned
 *     (Codex iter-1 §1: clear vs valid-empty are different).
 *   - A valid bounded rectangle that matched zero rendered
 *     points STILL emits a filter model — the user dragged a
 *     real region; AG Grid should obey the bounds even if it
 *     yields zero rows.
 *
 * Why not advanced filter
 *   - `agMultiColumnFilter` (the design-system default) accepts
 *     simple models per column. The repo's existing
 *     `buildEntityGridQueryParams.ts` discriminates advanced vs
 *     simple by the top-level `filterType` field. Emitting
 *     simple keeps both code paths clean.
 */
import type { BrushPoint, BrushSelection } from './brushSelection';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** AG Grid v34.3.1 simple-filter model entry for a numeric
 * column. We declare the subset our brush emits — `agNumberColumnFilter`
 * accepts the same shape. */
export interface AgGridNumberFilterEntry {
  filterType: 'number';
  type: 'inRange' | 'greaterThanOrEqual' | 'lessThanOrEqual';
  filter: number;
  filterTo?: number;
}

/** Per-column filter model. Maps column id → simple filter
 * entry. AG Grid SSRM forwards this verbatim through
 * `params.request.filterModel`. */
export type AgGridBrushFilterModel = Record<string, AgGridNumberFilterEntry>;

export interface BrushToAgGridFilterOptions {
  /** AG Grid `colId` (or `field`) for the x-axis column. */
  xColId: string;
  /** AG Grid `colId` (or `field`) for the y-axis column. */
  yColId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildAxisEntry(
  from: BrushPoint['x'],
  to: BrushPoint['x'],
): AgGridNumberFilterEntry | null {
  // Both bounds present → `inRange` (covers `from === to` as
  // an equals match — Codex iter-2 noted the dead duplicate
  // branch from iter-1; collapsed into a single return).
  if (typeof from === 'number' && typeof to === 'number') {
    return { filterType: 'number', type: 'inRange', filter: from, filterTo: to };
  }
  // Only upper bound → "≤ to".
  if (typeof to === 'number') {
    return { filterType: 'number', type: 'lessThanOrEqual', filter: to };
  }
  // Only lower bound → "≥ from".
  if (typeof from === 'number') {
    return { filterType: 'number', type: 'greaterThanOrEqual', filter: from };
  }
  // Both null → caller drops the column.
  return null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Convert a `BrushSelection` into an AG Grid SSRM-friendly
 * filter model.
 *
 * Returns `null` when `selection === null` (clear). Returns a
 * filter model object — possibly empty `{}` if BOTH axes are
 * fully open — when the selection has at least one usable
 * bound; an empty `{}` should still be passed through to the
 * grid (it semantically means "no axis-bound filter applied
 * via the brush adapter; other column filters keep their
 * state").
 */
export function brushToAgGridFilterModel(
  selection: BrushSelection | null,
  options: BrushToAgGridFilterOptions,
): AgGridBrushFilterModel | null {
  if (selection === null) return null;
  const model: AgGridBrushFilterModel = {};
  const xEntry = buildAxisEntry(selection.from.x, selection.to.x);
  if (xEntry !== null) model[options.xColId] = xEntry;
  const yEntry = buildAxisEntry(selection.from.y, selection.to.y);
  if (yEntry !== null) model[options.yColId] = yEntry;
  return model;
}

/**
 * Merge a brush filter model into an existing AG Grid filter
 * model so non-brush column filters survive a brush update.
 *
 * Why this exists (Codex iter-2 §P1.2)
 *   - `brushToAgGridFilterModel(...)` returns a FRAGMENT —
 *     only the x/y columns the brush owns. If a consumer
 *     pushes that fragment straight through
 *     `gridApi.setFilterModel(...)`, AG Grid REPLACES the
 *     whole model and silently drops every other column
 *     filter the user had set (status set-filter, text search,
 *     etc.).
 *   - This helper keeps every entry in `existing` that the
 *     brush does NOT own (`xColId` / `yColId`), then layers
 *     the brush fragment on top. A null brush fragment (clear)
 *     strips ONLY the brush columns and leaves the rest
 *     intact.
 *
 * Returns `null` when the merged model has zero entries —
 * callers can pass that straight to `gridApi.setFilterModel(null)`
 * to clear without confusing AG Grid.
 *
 * `existing` is intentionally typed `Record<string, unknown>`
 * because AG Grid filter models mix simple per-column entries
 * (number/text/date) with set/advanced shapes; this helper
 * does not pry into those.
 */
export function mergeBrushFilterModel(
  existing: Record<string, unknown> | null | undefined,
  brushModel: AgGridBrushFilterModel | null,
  options: BrushToAgGridFilterOptions,
): Record<string, unknown> | null {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  // Brush owns these two columns only — drop any prior brush
  // entries before layering the new fragment.
  delete next[options.xColId];
  delete next[options.yColId];
  if (brushModel !== null) {
    if (Object.prototype.hasOwnProperty.call(brushModel, options.xColId)) {
      next[options.xColId] = brushModel[options.xColId];
    }
    if (Object.prototype.hasOwnProperty.call(brushModel, options.yColId)) {
      next[options.yColId] = brushModel[options.yColId];
    }
  }
  return Object.keys(next).length === 0 ? null : next;
}

/**
 * Apply a brush filter model to a flat row array. Pure
 * reducer used by `brushRoundtrip.test.ts` — the production
 * path defers to AG Grid SSRM (`getRows({request:{filterModel}})`)
 * which forwards the same shape to the backend.
 */
export function applyBrushFilterModel<T extends Record<string, unknown>>(
  rows: ReadonlyArray<T>,
  model: AgGridBrushFilterModel | null,
): T[] {
  if (model === null) return [...rows];
  const entries = Object.entries(model);
  if (entries.length === 0) return [...rows];
  return rows.filter((row) => {
    for (const [colId, entry] of entries) {
      const raw = row[colId];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
      switch (entry.type) {
        case 'inRange':
          if (raw < entry.filter || raw > (entry.filterTo ?? entry.filter)) return false;
          break;
        case 'greaterThanOrEqual':
          if (raw < entry.filter) return false;
          break;
        case 'lessThanOrEqual':
          if (raw > entry.filter) return false;
          break;
      }
    }
    return true;
  });
}
