/**
 * useResponsiveColumnDefs — viewport-aware ColumnDef[] derivation.
 *
 * Codex DataGrid hardening REVISE plan (2026-05-05) — keeps the
 * viewport observation OUT of `GridShell` (which has no `ColumnMeta`
 * knowledge) and inside the consumer hook layer where `buildColDefs`
 * already runs. Wiring it here also keeps a single source of truth for
 * `EntityGridTemplate` (toolbar, filter builder, variant integration,
 * GridShell all share the same `columnDefs`).
 *
 * Usage:
 * ```tsx
 * const metaDefs = useResponsiveColumnDefs<UserSummary>({
 *   columns: columnMeta,
 *   t,
 *   locale: localeCode,
 *   permissions: currentUserPermissions,
 * });
 *
 * const columnDefs = useMemo(
 *   () => [...metaDefs, ...customColumnDefs],
 *   [metaDefs, customColumnDefs],
 * );
 * ```
 */

import { useMemo } from 'react';
import type { ColumnDef, ColumnMeta, TranslateFn } from './column-system/types';
import { buildColDefs } from './column-system/transformer';
import { useViewportWidth } from './useViewportWidth';

export interface UseResponsiveColumnDefsOptions<TRow> {
  /** Declarative column metadata. */
  columns: ColumnMeta[];
  /** Translation function (i18n). */
  t: TranslateFn;
  /** Locale string for date/number formatting. @default 'tr-TR' */
  locale?: string;
  /** Current user's permission codes (for column visibility). */
  permissions?: string[];
  // Generic parameter is reserved for future row-typed renderer hooks.
  // It's not consumed inside the body but retained on the public
  // signature so existing call sites can keep their `<UserSummary>` etc.
  /** Reserved — keep parity with `buildColDefs<TRow>()`. */
  _row?: TRow;
}

/**
 * Derive AG Grid column definitions from declarative `ColumnMeta` and
 * subscribe to the viewport store. Re-renders only when the viewport
 * crosses a breakpoint bucket (sm/md/lg/xl), so drag-resize inside a
 * single bucket is free.
 */
export function useResponsiveColumnDefs<TRow = unknown>({
  columns,
  t,
  locale = 'tr-TR',
  permissions,
}: UseResponsiveColumnDefsOptions<TRow>): ColumnDef<TRow>[] {
  // breakpointsOnly: true → React only re-runs when the snapshot
  // crosses 0/640/768/1024/1280, matching the responsive.hideBelow
  // thresholds the transformer already understands.
  const viewportWidth = useViewportWidth({ breakpointsOnly: true });

  return useMemo(
    () => buildColDefs<TRow>(columns, t, locale, permissions, viewportWidth),
    [columns, t, locale, permissions, viewportWidth],
  );
}
