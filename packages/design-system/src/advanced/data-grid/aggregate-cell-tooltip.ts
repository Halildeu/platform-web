/* ------------------------------------------------------------------ */
/*  Aggregate-cell tooltip helpers — PR-0.5f                           */
/*                                                                     */
/*  Codex 019e2de6 — aggregate explainability. When a report is        */
/*  grouped, AG Grid renders aggregated values on three kinds of cell  */
/*  the user can't otherwise decode at a glance:                       */
/*                                                                     */
/*    1. The aggregated value cell inside a GROUP row                  */
/*       (`node.group === true`).                                      */
/*    2. The aggregated value cell inside the grand-total pinned-      */
/*       bottom row (`node.rowPinned === 'bottom'`).                   */
/*    3. The auto group column cell — group context only.              */
/*                                                                     */
/*  These helpers feed AG Grid's NATIVE `tooltipValueGetter`           */
/*  (a string in → AG Grid renders its own tooltip). No custom         */
/*  `tooltipComponent`, no design-system Tooltip adapter, no           */
/*  `tooltipField` — the native tooltip lifecycle avoids portal /      */
/*  virtualization / focus debt.                                       */
/*                                                                     */
/*  Both functions are pure and testable WITHOUT a live AG Grid: the   */
/*  input is the plain `tooltipValueGetter` param shape, narrowed to   */
/*  `AggregateTooltipParams` (the same minimal-structural-type         */
/*  approach `internal/drawer-target.ts` uses).                        */
/* ------------------------------------------------------------------ */

/**
 * Minimal structural shape of AG Grid's `ITooltipParams` that the
 * tooltip helpers actually read. AG Grid's real `ITooltipParams` is
 * assignable to this type, so the helpers can be wired straight into
 * `tooltipValueGetter` while staying trivially unit-testable with a
 * plain object literal.
 */
export type AggregateTooltipParams<TData = unknown, TValue = unknown> = {
  /** Raw value AG Grid would render in the cell. */
  value?: TValue | null;
  /** Formatted value AG Grid already computed for the cell, if any. */
  valueFormatted?: string | null;
  /** Row data object. */
  data?: TData;
  /** Column definition for the cell's column. */
  colDef?: AggregateTooltipColDef | null;
  /**
   * Column handle — used only as a fallback to reach the live colDef
   * via `getColDef()`.
   *
   * Typed as `unknown` on purpose: AG Grid's real
   * `ITooltipParams.column` is `Column | ColumnGroup` (a `ColumnGroup`
   * has no `getColDef`), and a `tooltipValueGetter`'s param is
   * contravariant — so `AggregateTooltipParams` must stay a *supertype*
   * of `ITooltipParams` to be assignable into `ColDef.tooltipValueGetter`.
   * `resolveColDef` feature-detects a callable `getColDef` at runtime
   * (see {@link hasGetColDef}), so a `ColumnGroup` simply yields no
   * colDef rather than throwing.
   */
  column?: unknown;
  /** Row node — group / pinned-bottom detection + group context. */
  node?: AggregateTooltipRowNode | null;
};

/**
 * The slice of AG Grid's `ColDef` the helpers read. `aggFunc` may be a
 * string (`'sum'`, `'avg'`, …) or a custom `IAggFunc` callable; both
 * are accepted and only the string form maps to a localized label.
 * `valueFormatter` is widened to `unknown` because AG Grid's real
 * `ValueFormatterFunc` carries fully-typed params that don't fit a
 * generic `(...args) => string`; the helper feature-detects + guards
 * the call instead of relying on the precise signature.
 */
export type AggregateTooltipColDef = {
  /** Display name shown in the column header. */
  headerName?: string | null;
  /** Underlying row-data field. */
  field?: string | null;
  /** Column id (fallback display name). */
  colId?: string | null;
  /** Aggregation function — string preset or custom callable. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AG Grid IAggFunc carries fully-typed params
  aggFunc?: string | ((...args: any[]) => any) | null;
  /** AG Grid value formatter — feature-detected + guarded at call. */
  valueFormatter?: unknown;
};

/** The slice of AG Grid's `IRowNode` the helpers read. */
export type AggregateTooltipRowNode = {
  /** True for an aggregated group row. */
  group?: boolean;
  /** `'top'` / `'bottom'` for pinned rows; null/undefined otherwise. */
  rowPinned?: 'top' | 'bottom' | null;
  /** Group key — the label of the bucket this group row represents. */
  key?: string | null;
  /** Footer (group total) flag. */
  footer?: boolean;
  /** Leaf-row count under a group node. */
  allChildrenCount?: number | null;
  /** Direct children after grouping (row-count fallback). */
  childrenAfterGroup?: unknown[] | null;
};

/* ------------------------------------------------------------------ */
/*  aggFunc label mapping                                              */
/* ------------------------------------------------------------------ */

/**
 * Localized (Turkish) labels for AG Grid's built-in aggregation
 * functions. An unknown / custom string aggFunc falls back to the raw
 * string; an absent aggFunc falls back to the neutral `Agregasyon`.
 */
const AGG_FUNC_LABELS: Record<string, string> = {
  sum: 'Toplam',
  avg: 'Ortalama',
  count: 'Adet',
  min: 'Minimum',
  max: 'Maksimum',
};

const NEUTRAL_AGG_LABEL = 'Agregasyon';

/**
 * Resolve a human label for the cell's aggregation function.
 * - string preset (`sum` → `Toplam`, …)
 * - unknown string → the raw string (custom registered aggFunc)
 * - custom callable / absent → `Agregasyon`
 */
function resolveAggFuncLabel(aggFunc: AggregateTooltipColDef['aggFunc'] | undefined): string {
  if (typeof aggFunc === 'string' && aggFunc.length > 0) {
    return AGG_FUNC_LABELS[aggFunc] ?? aggFunc;
  }
  return NEUTRAL_AGG_LABEL;
}

/* ------------------------------------------------------------------ */
/*  Internal resolvers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Runtime type guard: does the (untyped) `column` handle expose a
 * callable `getColDef`? AG Grid's `Column` does; `ColumnGroup` does
 * not. Used so the `unknown`-typed `params.column` can be narrowed
 * before the fallback colDef lookup.
 */
function hasGetColDef(
  column: unknown,
): column is { getColDef: () => AggregateTooltipColDef | null | undefined } {
  return (
    typeof column === 'object' &&
    column !== null &&
    typeof (column as { getColDef?: unknown }).getColDef === 'function'
  );
}

/**
 * Resolve the live colDef for the cell. `params.colDef` is preferred;
 * `params.column.getColDef()` is the fallback (the column handle
 * always reflects runtime column-state changes such as a context-menu
 * `aggFunc` switch).
 */
function resolveColDef<TData, TValue>(
  params: AggregateTooltipParams<TData, TValue>,
): AggregateTooltipColDef | null {
  if (params.colDef) return params.colDef;
  if (hasGetColDef(params.column)) {
    return params.column.getColDef() ?? null;
  }
  return null;
}

/**
 * Runtime type guard: does the (untyped) `column` handle expose a
 * callable `getAggFunc`? AG Grid's `Column` does; `ColumnGroup` does
 * not. Used to read the LIVE aggregation function off the column.
 */
function hasGetAggFunc(
  column: unknown,
): column is { getAggFunc: () => AggregateTooltipColDef['aggFunc'] | undefined } {
  return (
    typeof column === 'object' &&
    column !== null &&
    typeof (column as { getAggFunc?: unknown }).getAggFunc === 'function'
  );
}

/**
 * Resolve the cell's aggregation function. Codex 019e2de6 post-impl
 * review: the reporting flow sets `aggFunc` at RUNTIME via
 * `api.applyColumnState({ state: [{ colId, aggFunc }] })` (the
 * "Sütun Hesaplama" context menu, PR #272c/PR-0.5d) and on saved
 * variant restore — `ReportPage` never writes `aggFunc` onto the
 * static colDef. So `params.column.getAggFunc()` (the live column
 * state) is authoritative; `colDef.aggFunc` is only the fallback for
 * a column statically configured with an aggregation.
 */
function resolveAggFunc<TData, TValue>(
  params: AggregateTooltipParams<TData, TValue>,
  colDef: AggregateTooltipColDef | null,
): AggregateTooltipColDef['aggFunc'] | undefined {
  if (hasGetAggFunc(params.column)) {
    const liveAggFunc = params.column.getAggFunc();
    if (liveAggFunc !== null && liveAggFunc !== undefined) return liveAggFunc;
  }
  return colDef?.aggFunc;
}

/**
 * Column display name: header name when present, else the field, else
 * the colId, else a neutral fallback.
 */
function resolveColumnDisplayName(colDef: AggregateTooltipColDef | null): string {
  const headerName = colDef?.headerName;
  if (typeof headerName === 'string' && headerName.trim().length > 0) {
    return headerName;
  }
  const field = colDef?.field;
  if (typeof field === 'string' && field.trim().length > 0) return field;
  const colId = colDef?.colId;
  if (typeof colId === 'string' && colId.trim().length > 0) return colId;
  return 'Sütun';
}

/**
 * Resolve the leaf-row count under a group node. AG Grid populates
 * `allChildrenCount` for grouped nodes; `childrenAfterGroup.length` is
 * the fallback. Returns `null` when no count is resolvable so the
 * caller can omit the "· N satır" segment.
 */
function resolveRowCount(node: AggregateTooltipRowNode | null | undefined): number | null {
  if (!node) return null;
  if (typeof node.allChildrenCount === 'number' && node.allChildrenCount >= 0) {
    return node.allChildrenCount;
  }
  if (Array.isArray(node.childrenAfterGroup)) {
    return node.childrenAfterGroup.length;
  }
  return null;
}

/** Locale for tooltip number formatting — matches the grid's tr-TR locale. */
const GRID_LOCALE = 'tr-TR';

/** Format a row count with locale-aware grouping (`1234` → `1.234`). */
function formatRowCount(count: number): string {
  try {
    return count.toLocaleString(GRID_LOCALE);
  } catch {
    return String(count);
  }
}

/**
 * Is the value renderable in a tooltip? Null / undefined / empty
 * string / NaN are all treated as "no value" → no tooltip.
 */
function hasRenderableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim().length === 0) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  return true;
}

/**
 * Produce the full, locale-aware formatted value for an aggregate cell.
 *
 * Priority:
 *   1. `params.valueFormatted` — AG Grid already formatted the cell.
 *   2. The column's `valueFormatter` — re-run it against this param so
 *      the tooltip never shows a raw DB number unformatted.
 *   3. Locale-formatted number — `column-system` columns format the
 *      visible cell via a `cellRenderer` (which a tooltip getter cannot
 *      invoke) and carry an EXPORT value-getter on `valueFormatter`, so
 *      a finite number reaching this tier is locale-formatted rather
 *      than raw-stringified (no `-824820919.1300002` leaking through).
 *   4. `String(value)` — non-numeric last resort.
 *
 * Returns `undefined` only when the value itself is not renderable
 * (caller already guards this, but kept defensive).
 */
function resolveFormattedValue<TData, TValue>(
  params: AggregateTooltipParams<TData, TValue>,
  colDef: AggregateTooltipColDef | null,
): string | undefined {
  if (!hasRenderableValue(params.value)) return undefined;

  const preformatted = params.valueFormatted;
  if (typeof preformatted === 'string' && preformatted.trim().length > 0) {
    return preformatted;
  }

  const formatter = colDef?.valueFormatter;
  if (typeof formatter === 'function') {
    try {
      // AG Grid's ValueFormatterFunc reads `value` (and optionally
      // `data` / `colDef` / `node`); the live tooltip param carries
      // all of them, so forwarding the param verbatim is sound.
      const formatted = (formatter as (p: unknown) => unknown)(params);
      if (typeof formatted === 'string' && formatted.trim().length > 0) {
        return formatted;
      }
    } catch {
      /* fall through to String() — formatter threw on the param shape */
    }
  }

  // Tier 3 — no AG Grid `valueFormatted`, no usable display formatter.
  // `column-system` columns format the visible cell via a `cellRenderer`
  // and put an EXPORT value-getter on `valueFormatter`, so a raw
  // `String()` here would leak the unformatted DB float into the
  // tooltip (e.g. `-824820919.1300002`). Locale-format a finite number
  // so the tooltip stays readable and consistent with the grid locale.
  const rawValue = params.value;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    try {
      return rawValue.toLocaleString(GRID_LOCALE);
    } catch {
      return String(rawValue);
    }
  }

  // Tier 4 — non-numeric last resort.
  return String(rawValue);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * `tooltipValueGetter` for the DEFAULT column definition.
 *
 * Returns an explainability string ONLY for aggregated value cells:
 *   - group rows (`node.group === true`)
 *   - the grand-total pinned-bottom row (`node.rowPinned === 'bottom'`)
 *
 * Leaf / normal value cells, header cells, and any cell without a
 * renderable value return `undefined` → AG Grid shows no tooltip.
 *
 * Tooltip shapes:
 *   - group row:
 *     `<groupLabel> · <rowCount> satır · <aggLabel>(<column>): <value>`
 *   - grand-total pinned-bottom row:
 *     `Genel toplam · <aggLabel>(<column>): <value>`
 *
 * The aggFunc label + column display name + full formatted value are
 * ALWAYS present; group label / row count are added only when
 * resolvable.
 */
export function getAggregateCellTooltip<TData = unknown, TValue = unknown>(
  params: AggregateTooltipParams<TData, TValue>,
): string | undefined {
  const node = params.node;
  const isGroupRow = node?.group === true;
  const isGrandTotalRow = node?.rowPinned === 'bottom';

  // Leaf / normal cells (not a group row, not the pinned-bottom row)
  // get no tooltip — explainability only applies to aggregates.
  if (!isGroupRow && !isGrandTotalRow) return undefined;

  // Null / empty / NaN aggregate value → no tooltip.
  if (!hasRenderableValue(params.value)) return undefined;

  const colDef = resolveColDef(params);
  // Codex 019e2de6 post-impl: prefer the LIVE column aggFunc over the
  // static colDef — runtime aggregation switches (PR-0.5d menu) and
  // variant restores write column state, not colDef.aggFunc.
  const aggLabel = resolveAggFuncLabel(resolveAggFunc(params, colDef));
  const columnName = resolveColumnDisplayName(colDef);
  const formattedValue = resolveFormattedValue(params, colDef);
  if (formattedValue === undefined) return undefined;

  // Always-present core: aggLabel(column): value
  const valueSegment = `${aggLabel}(${columnName}): ${formattedValue}`;

  if (isGrandTotalRow) {
    // Grand-total row: a fixed "Genel toplam" context (the pinned
    // bottom row spans the whole grid, so there is no bucket label /
    // row count to attach).
    return `Genel toplam · ${valueSegment}`;
  }

  // Group row — prepend bucket context when it is resolvable.
  const segments: string[] = [];
  const groupLabel = typeof node?.key === 'string' ? node.key.trim() : '';
  if (groupLabel.length > 0) segments.push(groupLabel);

  const rowCount = resolveRowCount(node);
  if (rowCount !== null) segments.push(`${formatRowCount(rowCount)} satır`);

  segments.push(valueSegment);
  return segments.join(' · ');
}

/**
 * `tooltipValueGetter` for the AUTO GROUP column definition.
 *
 * Returns group context only — `Grup: <groupLabel> · <rowCount> satır`.
 * The "· N satır" segment is omitted when no row count is resolvable.
 *
 * Returns `undefined` for any non-group cell (the auto group column
 * also renders leaf rows once a group is expanded) and for a group
 * row whose label cannot be resolved.
 */
export function getGroupCellTooltip<TData = unknown, TValue = unknown>(
  params: AggregateTooltipParams<TData, TValue>,
): string | undefined {
  const node = params.node;
  if (node?.group !== true) return undefined;

  const groupLabel = typeof node.key === 'string' ? node.key.trim() : '';
  if (groupLabel.length === 0) return undefined;

  const rowCount = resolveRowCount(node);
  if (rowCount === null) {
    return `Grup: ${groupLabel}`;
  }
  return `Grup: ${groupLabel} · ${formatRowCount(rowCount)} satır`;
}
