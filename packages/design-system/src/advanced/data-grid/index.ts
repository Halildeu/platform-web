/* ------------------------------------------------------------------ */
/*  Data Grid — AG Grid wrapper components                             */
/*                                                                     */
/*  PERF-INIT-V2 PR-B1a: the previous `import './setup'` side-effect   */
/*  here cascaded through the root `@mfe/design-system` barrel into    */
/*  every consumer (including shell HomePage which only needs          */
/*  PageHeader/VStack). That leaked AG Grid Enterprise into shell's    */
/*  /home and /login cold loads.                                       */
/*                                                                     */
/*  The setup side-effect now lives at the explicit consumer entry:    */
/*    apps/mfe-{users,access,reporting,audit}/src/app/bootstrap.tsx    */
/*    apps/mfe-shell/src/pages/admin/design-lab/pages/ChartDetail.tsx  */
/*                                                                     */
/*  If you add a NEW grid-using surface, add an explicit               */
/*  `import '@mfe/design-system/advanced/data-grid/setup';` at the     */
/*  module entry. The setup file itself remains the SINGLE source of   */
/*  truth for ModuleRegistry.registerModules — only the import POINT   */
/*  has moved.                                                         */
/* ------------------------------------------------------------------ */

// Design token mapping for AG Grid themes
import './grid-theme.css';

// --- AgGridServer ---
export { AgGridServer } from './AgGridServer';
export type {
  AgGridServerProps,
  AgGridServerMessages,
  FetchServerSideData,
  ServerSideDataRequest,
  ServerSideDataResult,
} from './AgGridServer';

// --- GridShell (core wrapper) ---
export { GridShell } from './GridShell';
export type { GridShellProps, GridShellApi, GridTheme, GridDensity } from './GridShell';

// --- GridToolbar ---
export { GridToolbar } from './GridToolbar';
export type { GridToolbarProps, GridToolbarMessages } from './GridToolbar';

// --- VariantIntegration ---
export { VariantIntegration } from './VariantIntegration';
export type {
  VariantIntegrationProps,
  VariantIntegrationMessages,
  GridVariantState,
} from './VariantIntegration';

// --- Column layout draft (PR-0.5e — local working-layout persistence) ---
export {
  LAYOUT_DRAFT_NAMESPACE,
  LAYOUT_DRAFT_TTL_MS,
  DEFAULT_VARIANT_KEY,
  buildDraftKey,
  serializeColumnState,
  computeSchemaFingerprint,
  readDraft,
  writeDraft,
  clearDraft,
  isDraftDirty,
  applyDraftOverColumnState,
} from './column-layout-draft';
export type { DraftColumnState, LayoutDraft, DraftScope } from './column-layout-draft';

// --- DatasourceModeAdapter ---
export { useDatasourceModeAdapter } from './DatasourceModeAdapter';
export type {
  DataSourceMode,
  CreateServerSideDatasource,
  DatasourceModeAdapterOptions,
  DatasourceModeAdapterResult,
} from './DatasourceModeAdapter';

// --- EntityGridTemplate (orchestrator) ---
export { EntityGridTemplate } from './EntityGridTemplate';
export type {
  EntityGridTemplateProps,
  EntityGridTemplateMessages,
  GridExportConfig,
} from './EntityGridTemplate';

// --- TablePagination ---
export { TablePagination, useAgGridTablePagination } from './TablePagination';
export type {
  TablePaginationProps,
  TablePaginationLocaleText,
  TablePaginationActionsProps,
  TablePaginationSlots,
  TablePaginationSlotProps,
  UseAgGridTablePaginationOptions,
  UseAgGridTablePaginationResult,
  AgGridTablePaginationApi,
  AgGridTablePaginationSnapshot,
} from './TablePagination';

// --- ServerPaginationFooter ---
export { ServerPaginationFooter } from './ServerPaginationFooter';
export type { ServerPaginationFooterProps } from './ServerPaginationFooter';

// --- Pagination State ---
export { usePaginationState } from './usePaginationState';
export type {
  UsePaginationStateOptions,
  PaginationStateController,
  PaginationPageRange,
} from './usePaginationState';

// --- Chart Theme Bridge ---
export { getChartThemeOverrides, getChartColorPalette } from './chart-theme-bridge';
export type { ChartThemeOverrides } from './chart-theme-bridge';

// --- Query Params ---
export { buildEntityGridQueryParams } from './buildEntityGridQueryParams';
export type {
  EntityGridQueryParams,
  MapAdvancedFilter,
  BuildEntityGridQueryParamsOptions,
} from './buildEntityGridQueryParams';

// --- Responsive viewport hooks (Codex DataGrid hardening, 2026-05-05) ---
export { useViewportWidth } from './useViewportWidth';
export type { UseViewportWidthOptions } from './useViewportWidth';

export { useResponsiveColumnDefs } from './useResponsiveColumnDefs';
export type { UseResponsiveColumnDefsOptions } from './useResponsiveColumnDefs';

// --- Column System (declarative column metadata → AG Grid ColDef) ---
export {
  buildColDefs,
  buildFilterConfig,
  buildDetailRenderer,
  buildProcessCellCallback,
  withConditionalFormatting,
  findMatchingRule,
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
} from './column-system';
export type {
  ColumnMeta,
  TextColumnMeta,
  BoldTextColumnMeta,
  BadgeColumnMeta,
  StatusColumnMeta,
  StatusMapEntry,
  DateColumnMeta,
  NumberColumnMeta,
  CurrencyColumnMeta,
  EnumColumnMeta,
  BooleanColumnMeta,
  PercentColumnMeta,
  LinkColumnMeta,
  ActionsColumnMeta,
  ActionItem,
  BaseColumnMeta,
  BadgeVariant as ColumnBadgeVariant,
  ConditionalRule,
  TranslateFn,
  FilterConfig,
  DetailExtraField,
  ColumnDef as ColumnSystemColumnDef,
} from './column-system';
