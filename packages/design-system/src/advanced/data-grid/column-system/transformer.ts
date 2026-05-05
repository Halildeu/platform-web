/**
 * Metadata → ColDef Transformer
 *
 * THE single entry point: `buildColDefs(columns, t, locale, permissions?)`
 *
 * Takes declarative ColumnMeta[] and produces full AG Grid ColumnDef[],
 * with renderers, filters, formatters — everything.
 */

import type { ColumnMeta, ColumnDef, TranslateFn } from './types';
import { buildFilterConfig } from './filters';
import { withConditionalFormatting } from './conditional';
import {
  createTextRenderer,
  createBoldTextRenderer,
  createBadgeRenderer,
  createStatusRenderer,
  createDateRenderer,
  createNumberRenderer,
  createCurrencyRenderer,
  createBooleanRenderer,
  createPercentRenderer,
  createLinkRenderer,
  createEnumRenderer,
  createExportValueGetter,
} from './presets';

/* ------------------------------------------------------------------ */
/*  Main transformer                                                   */
/* ------------------------------------------------------------------ */

/**
 * Transforms declarative column metadata into AG Grid ColumnDef objects.
 *
 * @param columns - Declarative column metadata array
 * @param t - Translation function (i18n)
 * @param locale - Locale string for date/number formatting (e.g., 'tr-TR')
 * @param permissions - Current user's permission codes (for column visibility)
 */
const BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

export function buildColDefs<TRow = unknown>(
  columns: ColumnMeta[],
  t: TranslateFn,
  locale: string = 'tr-TR',
  permissions?: string[],
  viewportWidth?: number,
): ColumnDef<TRow>[] {
  const vw = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);

  /*
   * Two-stage filter — Codex DataGrid hardening REVISE plan
   * (2026-05-05).
   *
   * 1. Permission visibility ALWAYS wins. A permission-hidden column
   *    cannot be revived by `essential`; security > layout invariant.
   * 2. Inside the permission-visible set, `essential` columns bypass
   *    `hideBelow`. If no column carries `essential`, the FIRST
   *    permission-visible column is implicitly essential — protects
   *    zero-config consumers from the "all columns hidden on mobile"
   *    footgun without a runtime throw.
   */
  const permissionVisible = columns.filter((meta) => {
    if (meta.requiredPermission && permissions) {
      return permissions.includes(meta.requiredPermission);
    }
    return true;
  });

  const hasExplicitEssential = permissionVisible.some((meta) => meta.essential === true);

  return permissionVisible
    .filter((meta, index) => {
      const isEssential = meta.essential === true || (!hasExplicitEssential && index === 0);
      if (isEssential) return true;

      const hideBelow = meta.responsive?.hideBelow;
      if (!hideBelow) return true;

      return vw >= (BREAKPOINTS[hideBelow] ?? 0);
    })
    .map((meta) => buildSingleColDef<TRow>(meta, t, locale));
}

/* ------------------------------------------------------------------ */
/*  Single column builder                                              */
/* ------------------------------------------------------------------ */

function buildSingleColDef<TRow>(
  meta: ColumnMeta,
  t: TranslateFn,
  locale: string,
): ColumnDef<TRow> {
  /* Base properties — shared across all types */
  const colDef: ColumnDef<TRow> = {
    field: meta.field,
    headerName: resolveHeaderName(meta.headerNameKey, t),
    width: meta.width,
    minWidth: meta.minWidth,
    flex: meta.flex,
    sortable: meta.sortable ?? meta.columnType !== 'actions',
  };

  /* Right-align numeric column types (AG Grid aligns both cell + header) */
  if (
    meta.columnType === 'number' ||
    meta.columnType === 'currency' ||
    meta.columnType === 'percent'
  ) {
    colDef.type = 'rightAligned';
  }

  /* Pinning */
  if (meta.pinned) colDef.pinned = meta.pinned;
  if (meta.columnType === 'actions') colDef.pinned = meta.pinned ?? 'right';

  /* Filter config — pass t for set filter label translation */
  const filterCfg = buildFilterConfig(meta, t);
  if (filterCfg) {
    colDef.filter = filterCfg.filter as string | boolean;
    if (filterCfg.filterParams) colDef.filterParams = filterCfg.filterParams;
    if (filterCfg.floatingFilter !== undefined) colDef.floatingFilter = filterCfg.floatingFilter;
  }

  /* Renderer — based on columnType */
  let renderer = buildRenderer(meta, t, locale);

  /* Wrap with conditional formatting if rules exist */
  if (meta.conditionalRules && meta.conditionalRules.length > 0 && typeof renderer !== 'string') {
    renderer = withConditionalFormatting(renderer, meta.conditionalRules);
  }

  if (renderer) colDef.cellRenderer = renderer;

  /* Export value formatter — rendered label for Excel/CSV */
  // `createExportValueGetter` is typed against the union'd `ColumnMeta`
  // family but TS narrows poorly through the local `meta` parameter;
  // the call shape is sound, so route through `unknown` instead of
  // `any` to satisfy `@typescript-eslint/no-explicit-any`.
  const exportGetter = createExportValueGetter(
    meta as unknown as Parameters<typeof createExportValueGetter>[0],
    t,
  );
  if (exportGetter) colDef.valueFormatter = exportGetter as ColumnDef<TRow>['valueFormatter'];

  return colDef;
}

/* ------------------------------------------------------------------ */
/*  Header name resolver                                               */
/* ------------------------------------------------------------------ */

function resolveHeaderName(key: string, t: TranslateFn): string {
  if (!key) return '';

  /* If key contains dots, it's likely an i18n key — try to resolve */
  if (key.includes('.')) {
    const resolved = t(key);
    /* If t() returns the key itself (unresolved), use it as-is */
    return resolved || key;
  }

  /* Plain string — use directly (for dynamic reports with pre-translated headers) */
  return key;
}

/* ------------------------------------------------------------------ */
/*  Renderer factory dispatcher                                        */
/* ------------------------------------------------------------------ */

function buildRenderer(
  meta: ColumnMeta,
  t: TranslateFn,
  locale: string,
): ColumnDef['cellRenderer'] {
  switch (meta.columnType) {
    case 'text':
      return createTextRenderer();

    case 'bold-text':
      return createBoldTextRenderer(meta.className);

    case 'badge':
      return createBadgeRenderer(meta.variantMap, meta.defaultVariant, meta.labelMap, t);

    case 'status':
      return createStatusRenderer(meta, t);

    case 'date':
      return createDateRenderer(meta, locale);

    case 'number':
      return createNumberRenderer(meta, locale);

    case 'currency':
      return createCurrencyRenderer(meta, locale);

    case 'boolean':
      return createBooleanRenderer(meta, t);

    case 'percent':
      return createPercentRenderer(meta);

    case 'link':
      return createLinkRenderer(meta);

    case 'enum':
      return createEnumRenderer(meta.labelMap, meta.labelsAreKeys ?? false, t);

    case 'actions':
      /* Actions renderer is intentionally left to the consumer —
         skeleton provides filter/sort suppression only */
      return undefined;

    default:
      return undefined;
  }
}
