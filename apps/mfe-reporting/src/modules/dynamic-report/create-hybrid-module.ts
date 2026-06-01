/**
 * PR-D2b (Codex thread 019e8269, 2026-06-01) — hybrid module wrapper for
 * karma reports (static dashboard + dynamic grid).
 *
 * Closes the dashboard-preservation gap the D1b dedupe semantic opens.
 * D1b.A `useCatalog` + `ReportingApp` REPLACE a static module at the
 * same route as a dynamic catalog entry. For karma modules (e.g.
 * `hr-demografik-yapi`) the static module owns BOTH the legacy grid
 * surface AND `renderDashboard`. A blind replacement kills the dashboard.
 *
 * The hybrid wrapper preserves both surfaces:
 *  - **Dynamic wins** for operational fields: createInitialFilters,
 *    renderFilters, getColumns, getColumnMeta, ensureColumnMeta,
 *    getCapabilities, getFilterDefinitions, hasMetadataDrivenFilters,
 *    requiredFilterFields, fetchRows, exportRows, fetchFilterValues,
 *    `id` (CRITICAL — ReportPage uses this as gridId; static `id` would
 *    map old camelCase column-state variants to the new UPPER_SNAKE
 *    dynamic grid).
 *  - **Static wins** for identity + dashboard: renderDashboard, route,
 *    sharedReportId, titleKey, descriptionKey, navKey, breadcrumbKeys.
 *
 * Cross-AI peer review (Codex thread 019e8269): Option C verbatim — the
 * single clean choice that preserves both surfaces without breaking
 * grid variant state continuity.
 */

import type { ReportModule } from '../types';

/**
 * Compose a hybrid module from a static (dashboard-owning) module and a
 * dynamic (grid-driving) module that resolve to the same route. The
 * result is a single `ReportModule` that ReportPage can render as one
 * coherent entry.
 *
 * @param staticModule  The hand-coded static module (must expose
 *                      `renderDashboard` for the hybrid to make sense).
 * @param dynamicModule The dynamic factory's module (produced by
 *                      `createDynamicReportModule(report)`).
 */
export function createHybridReportModule<TFilters extends Record<string, unknown>, TRow>(
  staticModule: ReportModule<TFilters, TRow>,
  dynamicModule: ReportModule<TFilters, TRow>,
): ReportModule<TFilters, TRow> {
  return {
    // Spread dynamic FIRST so static's identity overrides land on top.
    ...dynamicModule,

    // ---- Static wins (identity + dashboard surface) ---------------- //
    route: staticModule.route,
    sharedReportId: staticModule.sharedReportId,
    titleKey: staticModule.titleKey,
    descriptionKey: staticModule.descriptionKey,
    navKey: staticModule.navKey,
    breadcrumbKeys: staticModule.breadcrumbKeys,
    renderDashboard: staticModule.renderDashboard,

    // ---- Dynamic wins guardrails (Codex 019e8269) ------------------ //
    // `id` MUST stay dynamic — ReportPage uses it as gridId, and the
    // dynamic grid's UPPER_SNAKE column state must not be re-applied
    // through the static module's saved camelCase variants. Even
    // though `...dynamicModule` already supplies it, we restate it
    // here for documentation clarity and to prevent any future
    // refactor from accidentally letting static `id` win.
    id: dynamicModule.id,
  };
}
