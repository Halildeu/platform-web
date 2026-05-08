/* ------------------------------------------------------------------ */
/*  Drawer-target guard — pure helper for entity-row drawer-open       */
/*                                                                     */
/*  Codex 019dde93 iter-48 — when an ag-grid cell or row double-click  */
/*  triggers an entity-detail drawer, we must NOT open the drawer for  */
/*  interactive cells: action menus, checkboxes, group rows, editable  */
/*  cells, or DOM targets that ARE buttons / links / inputs / role-    */
/*  button. The guard isolates that decision into a single pure        */
/*  function so it can be unit-tested without bootstrapping ag-grid.   */
/* ------------------------------------------------------------------ */

/**
 * Minimal structural shape we need from an ag-grid double-click event.
 * Both `RowDoubleClickedEvent` and `CellDoubleClickedEvent` can be
 * coerced into this shape — keeping the input narrow makes the guard
 * trivial to test and reusable across both event paths.
 */
export type DrawerTargetEventLike = {
  /** Event target element (the actual DOM node clicked). */
  event?: { target?: EventTarget | null } | null;
  /** Column metadata if known. */
  column?: { getColId?: () => string | null | undefined } | null;
  /**
   * Column definition. We treat `editable: true` as an opt-out and
   * also support a custom `suppressDrawerOpenOnDoubleClick` flag so
   * consumers can mark action columns explicitly.
   */
  colDef?: {
    // `editable` is widened to `boolean | Function` to stay compatible
    // with AG Grid v34's `EditableCallback<TData, TValue, TContext>`
    // which carries fully-typed parameters that don't fit a generic
    // `(...args: unknown[]) => boolean`. The guard only checks the
    // truthiness of `editable`, so the precise call signature is
    // irrelevant — accepting any callable here keeps the structural
    // overlap with all AG Grid event variants without weakening the
    // runtime check.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editable?: boolean | ((...args: any[]) => boolean);
    // Same callable-or-boolean widening as `editable`: AG Grid v34
    // ships `CheckboxSelectionCallback<TData, TValue, TContext>` so
    // a literal `boolean` constraint rejects the typed event variants.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkboxSelection?: boolean | ((...args: any[]) => boolean);
    type?: string | string[];
    suppressDrawerOpenOnDoubleClick?: boolean;
  } | null;
  /** Row node metadata. */
  node?: {
    group?: boolean;
    footer?: boolean;
    rowPinned?: 'top' | 'bottom' | null;
  } | null;
};

/**
 * Column ids that are always treated as action columns in this DS.
 * Codex 019dde93 iter-48 — explicit allow-list per consumer review.
 * Add via `colDef.suppressDrawerOpenOnDoubleClick: true` for ad-hoc
 * action columns; this set covers the canonical names so consumers
 * don't have to remember the flag in the common case.
 */
const ACTION_COLUMN_IDS = new Set([
  'actions',
  'userActions',
  'roleActions',
  'rowActions',
  'ag-Grid-SelectionColumn',
]);

/**
 * Selectors used to skip drawer-open when the actual DOM target is an
 * interactive control. `closest` walks up so clicking text INSIDE a
 * button still skips drawer.
 */
const INTERACTIVE_TARGET_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[contenteditable="true"]',
].join(',');

/**
 * Returns `true` when an entity-row double-click event should open the
 * drawer (normal data cell, plain text target). Returns `false` for
 * group/footer/pinned rows, action columns, editable cells, and any
 * interactive DOM target. Pure: no DOM walks beyond `closest()`, no
 * side effects.
 */
export function isDrawerOpenSafeTarget(event: DrawerTargetEventLike): boolean {
  // Group / footer / pinned rows — drawer doesn't apply
  if (event.node?.group || event.node?.footer) return false;
  if (event.node?.rowPinned) return false;

  // Column-level opt-outs
  const colId = event.column?.getColId?.();
  if (colId && ACTION_COLUMN_IDS.has(colId)) return false;

  const colDef = event.colDef;
  if (colDef?.suppressDrawerOpenOnDoubleClick) return false;
  if (colDef?.checkboxSelection) return false;
  if (colDef?.editable) return false;

  // DOM target opt-out — interactive controls
  const target = event.event?.target as HTMLElement | null;
  if (target && typeof target.closest === 'function') {
    if (target.closest(INTERACTIVE_TARGET_SELECTOR)) return false;
  }

  return true;
}
