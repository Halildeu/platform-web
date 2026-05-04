import type { ReactNode } from 'react';
import type { SharedReportId } from '@platform/capabilities';
import type { ColumnDef, GridRequest, GridResponse } from '../grid';
import type { ColumnMeta } from '@mfe/design-system/advanced/data-grid';

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export interface FilterRenderContext<TFilters extends Record<string, unknown>> {
  values: TFilters;
  submit: () => void;
  setFieldValue: <K extends keyof TFilters>(key: K, value: TFilters[K]) => void;
  t: TranslateFn;
}

export interface FilterInitContext {
  searchParams?: URLSearchParams;
}

export interface ReportModule<TFilters extends Record<string, unknown>, TRow> {
  id: string;
  sharedReportId: SharedReportId;
  route: string;
  titleKey: string;
  descriptionKey: string;
  breadcrumbKeys: Array<{ key: string; to?: string }>;
  navKey: string;
  createInitialFilters: (context?: FilterInitContext) => TFilters;
  renderFilters: (ctx: FilterRenderContext<TFilters>) => ReactNode;
  getColumns: (t: TranslateFn) => ColumnDef<TRow>[];
  /** Declarative column metadata — preferred over getColumns. Skeleton auto-generates renderers. */
  getColumnMeta?: () => ColumnMeta[];
  /**
   * Optional async hook for modules whose column metadata is fetched at
   * runtime (e.g. dynamic reports loading from `/v1/reports/{key}/metadata`).
   * When present, ReportPage awaits this before computing column defs so
   * the grid never mounts with an empty column set while data is in
   * flight. Modules with statically-defined `getColumnMeta()` may omit
   * this — the sync getter is then trusted as ready immediately.
   */
  ensureColumnMeta?: () => Promise<ColumnMeta[]>;
  fetchRows: (filters: TFilters, request: GridRequest) => Promise<GridResponse<TRow>>;
  renderDashboard?: (t: TranslateFn, filters?: TFilters) => ReactNode;
  renderDetail?: (row: TRow | null, t: TranslateFn) => ReactNode;
  exportRows?: (
    filters: TFilters,
    format: 'csv' | 'json',
  ) => Promise<{ blob: Blob; filename: string }>;

  /** Database tables this report reads from — enables schema lineage, related reports, FK lookup */
  sourceTables?: string[];
  /** Schema/tier identifier (e.g., 'workcube_mikrolink', 'workcube_mikrolink_2026_1') */
  sourceSchema?: string;
  /** Data source ID (for multi-DB support) */
  dataSourceId?: string;
}
