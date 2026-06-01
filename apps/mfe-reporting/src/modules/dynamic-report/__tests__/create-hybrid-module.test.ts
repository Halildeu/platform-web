/**
 * PR-D2b step 1 (Codex thread 019e8269, 2026-06-01) — unit tests for
 * the hybrid module composition helper.
 *
 * Pinned invariants:
 *  - Identity (route, sharedReportId, titleKey, descriptionKey, navKey,
 *    breadcrumbKeys, renderDashboard) wins from the static module
 *  - Operational surface (createInitialFilters, renderFilters,
 *    getColumns, getColumnMeta, ensureColumnMeta, getCapabilities,
 *    getFilterDefinitions, hasMetadataDrivenFilters, fetchRows,
 *    exportRows, fetchFilterValues, requiredFilterFields) wins from
 *    the dynamic module
 *  - `id` STAYS DYNAMIC (critical — ReportPage uses gridId for column
 *    state variant; static id would map old camelCase variants to the
 *    new UPPER_SNAKE dynamic grid)
 */

import { describe, expect, it } from 'vitest';
import { createHybridReportModule } from '../create-hybrid-module';
import type { ReportModule } from '../../types';

type AnyMod = ReportModule<Record<string, unknown>, Record<string, unknown>>;

const stubModule = (overrides: Partial<AnyMod>): AnyMod => ({
  id: 'stub',
   
  sharedReportId: 'stub' as any,
  route: 'stub',
  titleKey: 'stub',
  descriptionKey: 'stub',
  breadcrumbKeys: [],
  navKey: 'stub',
  createInitialFilters: () => ({}),
  renderFilters: () => null,
  getColumns: () => [],
  fetchRows: async () => ({ rows: [], total: 0 }),
  ...overrides,
});

const staticModule = stubModule({
  id: 'static-hr-demografik',
   
  sharedReportId: 'hr-demografik-yapi' as any,
  route: 'hr-demografik-yapi',
  titleKey: 'reports.demographic.title',
  descriptionKey: 'reports.demographic.description',
  breadcrumbKeys: [{ key: 'reports.root' }, { key: 'reports.demographic.title' }],
  navKey: 'demografik',
  renderDashboard: () => 'STATIC_DASHBOARD' as unknown as React.ReactNode,
  fetchRows: async () => ({ rows: [{ camel: 'case-row' }], total: 1 }),
});

const dynamicModule = stubModule({
  id: 'reports.dynamic.hr-demografik-yapi',
   
  sharedReportId: 'dynamic:hr-demografik-yapi' as any,
  route: 'hr-demografik-yapi',
  titleKey: 'Dynamic Title (wrong)',
  descriptionKey: 'Dynamic Description (wrong)',
  breadcrumbKeys: [{ key: 'dynamic.root' }],
  navKey: 'Dynamic Nav (wrong)',
  hasMetadataDrivenFilters: true,
  getFilterDefinitions: () => [{ key: 'q', kind: 'text-search' }],
  getColumnMeta: () => [
    {
      field: 'FULL_NAME',
      headerNameKey: 'Ad Soyad',
      columnType: 'bold-text',
    },
  ],
  ensureColumnMeta: async () => [
    {
      field: 'FULL_NAME',
      headerNameKey: 'Ad Soyad',
      columnType: 'bold-text',
    },
  ],
  fetchRows: async () => ({ rows: [{ FULL_NAME: 'A' }], total: 1 }),
  exportRows: async () => ({ blob: new Blob(), filename: 'x.csv' }),
  fetchFilterValues: async () => ({ values: ['A'] }),
  renderFilters: () => 'DYNAMIC_FILTERS' as unknown as React.ReactNode,
  requiredFilterFields: ['companyId'],
});

describe('createHybridReportModule', () => {
  const hybrid = createHybridReportModule(staticModule, dynamicModule);

  it('static wins for route', () => {
    expect(hybrid.route).toBe('hr-demografik-yapi');
  });

  it('static wins for sharedReportId (identity continuity for favorites/saved filters)', () => {
    expect(hybrid.sharedReportId).toBe('hr-demografik-yapi');
  });

  it('static wins for titleKey + descriptionKey + navKey', () => {
    expect(hybrid.titleKey).toBe('reports.demographic.title');
    expect(hybrid.descriptionKey).toBe('reports.demographic.description');
    expect(hybrid.navKey).toBe('demografik');
  });

  it('static wins for breadcrumbKeys', () => {
    expect(hybrid.breadcrumbKeys).toEqual([
      { key: 'reports.root' },
      { key: 'reports.demographic.title' },
    ]);
  });

  it('static wins for renderDashboard (the whole point of the hybrid)', () => {
    expect(hybrid.renderDashboard).toBe(staticModule.renderDashboard);
  });

  it('dynamic wins for id (CRITICAL — gridId variant state continuity)', () => {
    expect(hybrid.id).toBe(dynamicModule.id);
    expect(hybrid.id).not.toBe(staticModule.id);
  });

  it('dynamic wins for hasMetadataDrivenFilters', () => {
    expect(hybrid.hasMetadataDrivenFilters).toBe(true);
  });

  it('dynamic wins for getFilterDefinitions', () => {
    expect(hybrid.getFilterDefinitions).toBe(dynamicModule.getFilterDefinitions);
  });

  it('dynamic wins for getColumnMeta + ensureColumnMeta', () => {
    expect(hybrid.getColumnMeta).toBe(dynamicModule.getColumnMeta);
    expect(hybrid.ensureColumnMeta).toBe(dynamicModule.ensureColumnMeta);
  });

  it('dynamic wins for renderFilters', () => {
    expect(hybrid.renderFilters).toBe(dynamicModule.renderFilters);
  });

  it('dynamic wins for fetchRows + exportRows + fetchFilterValues', () => {
    expect(hybrid.fetchRows).toBe(dynamicModule.fetchRows);
    expect(hybrid.exportRows).toBe(dynamicModule.exportRows);
    expect(hybrid.fetchFilterValues).toBe(dynamicModule.fetchFilterValues);
  });

  it('dynamic wins for requiredFilterFields', () => {
    expect(hybrid.requiredFilterFields).toEqual(['companyId']);
  });

  it('preserves dynamic identity for createInitialFilters (operational)', () => {
    expect(hybrid.createInitialFilters).toBe(dynamicModule.createInitialFilters);
  });

  it('a static module without renderDashboard still composes (defensive)', () => {
    const noDashboardStatic = stubModule({
      id: 'static-no-dash',
      route: 'r',
      titleKey: 'static title',
    });
    const localDynamic = stubModule({
      id: 'dyn',
      route: 'r',
      titleKey: 'dynamic title',
    });
    const result = createHybridReportModule(noDashboardStatic, localDynamic);
    expect(result.id).toBe('dyn');
    expect(result.titleKey).toBe('static title');
    expect(result.renderDashboard).toBeUndefined();
  });
});
