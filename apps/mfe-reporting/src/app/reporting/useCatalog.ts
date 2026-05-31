import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listSharedReportsForChannel, type SharedReportCatalogItem } from '@platform/capabilities';
import { fetchReportList, type ReportListItem } from '../../modules/dynamic-report';
import { fetchDashboardList, type DashboardListItem } from '../../modules/dashboard';
import { reportModules } from '../../modules';
import type { GalleryItem } from '@mfe/design-system';

/* ------------------------------------------------------------------ */
/*  CatalogItem — extends GalleryItem for the reporting hub            */
/* ------------------------------------------------------------------ */

export interface CatalogItem extends GalleryItem {
  type: 'grid' | 'dashboard' | 'mixed';
  category: string;
  source: 'static' | 'dynamic' | 'dashboard';
  route: string;
  reportGroup?: string;
}

/* ------------------------------------------------------------------ */
/*  Type colors for badge rendering                                    */
/* ------------------------------------------------------------------ */

export const catalogTypeTone: Record<string, string> = {
  grid: 'primary',
  dashboard: 'info',
  mixed: 'warning',
};

/* ------------------------------------------------------------------ */
/*  Mappers                                                            */
/* ------------------------------------------------------------------ */

function mapStatic(report: SharedReportCatalogItem): CatalogItem {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    group: report.category ?? 'Genel',
    icon: report.icon ?? '📋',
    tags: report.tags ? [...report.tags] : [],
    badge: {
      label: report.type === 'dashboard' ? 'Dashboard' : 'Grid',
      tone: catalogTypeTone[report.type ?? 'grid'],
    },
    route: report.webRouteSegment,
    type: report.type ?? 'grid',
    category: report.category ?? 'Genel',
    source: 'static',
    reportGroup: report.reportGroup,
  };
}

function mapDynamic(report: ReportListItem): CatalogItem {
  return {
    id: `dynamic-${report.key}`,
    title: report.title,
    description: report.description,
    group: report.category || 'Diger',
    icon: '📊',
    tags: [],
    badge: { label: 'Grid', tone: 'primary' },
    // PR-D1b (Codex thread 019e800b, 2026-05-31): prefer backend-
    // supplied `routeSegment` alias when present (e.g. backend key
    // `hr-compensation-detay` aliased to route `hr-compensation`)
    // so the URL stays the legacy module's URL.
    route: report.routeSegment ?? report.key,
    type: 'grid',
    category: report.category || 'Diger',
    source: 'dynamic',
    // CNS-006 R18: propagate reportGroup from backend access_config
    reportGroup: report.reportGroup,
  };
}

function mapDashboard(db: DashboardListItem): CatalogItem {
  return {
    id: `dashboard-${db.key}`,
    title: db.title,
    description: db.description,
    group: db.category || 'Dashboard',
    icon: db.icon || '📈',
    tags: [],
    badge: { label: 'Dashboard', tone: 'info' },
    route: `dashboard-${db.key}`,
    type: 'dashboard',
    category: db.category || 'Dashboard',
    source: 'dashboard',
    // CNS-006 R18: propagate reportGroup from backend dashboard config
    reportGroup: db.reportGroup,
  };
}

/* ------------------------------------------------------------------ */
/*  useCatalog                                                         */
/* ------------------------------------------------------------------ */

export function useCatalog() {
  // Static reports — instant, no async needed
  const staticItems = useMemo(() => {
    return listSharedReportsForChannel('web').map(mapStatic);
  }, []);

  // R15 user-visible repair hotfix (Codex 019e2a83 / 019e2aef follow-up).
  //
  // Symptom (proven via browser smoke on testai cluster, 2026-05-15):
  // backend /api/v1/reports returned 31 items and /api/v1/dashboards
  // returned 12, but /admin/reports rendered only 14 entries with zero
  // Grid-badged cards. All 31 dynamic reports were missing from the UI.
  //
  // Root cause: the previous useState + useEffect([]) + Promise.all
  // pattern with an `active` cleanup flag was racy under certain
  // mount/unmount sequences (StrictMode dev double-invoke, lazy MFE
  // remount, suspense boundary). React Query removes the race entirely
  // because the cache lives outside component lifecycle and resolved
  // data survives remounts. This is a defensive refactor, not a precise
  // reproduction-bound fix.
  const reportsQuery = useQuery<ReportListItem[]>({
    queryKey: ['catalog', 'dynamic-reports'],
    queryFn: () =>
      fetchReportList().catch((err) => {
        console.warn('[useCatalog] dynamic report list failed:', err);
        return [] as ReportListItem[];
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const dashboardsQuery = useQuery<DashboardListItem[]>({
    queryKey: ['catalog', 'dashboards'],
    queryFn: () =>
      fetchDashboardList().catch((err) => {
        console.warn('[useCatalog] dashboard list failed:', err);
        return [] as DashboardListItem[];
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Merge all sources — deduplicate by route
  const items = useMemo<CatalogItem[]>(() => {
    const dynamicReports = reportsQuery.data ?? [];
    const dashboards = dashboardsQuery.data ?? [];

    const staticRoutes = new Set(staticItems.map((s) => s.route));

    // PR-D1b (Codex thread 019e800b, 2026-05-31): dedupe against
    // `r.routeSegment ?? r.key` so a dynamic entry whose backend
    // alias matches a legacy static module's route replaces it
    // instead of shadowing.
    const dynamicItems = dynamicReports
      .filter((r) => !staticRoutes.has(r.routeSegment ?? r.key))
      .map(mapDynamic);

    const allRoutes = new Set([...staticRoutes, ...dynamicItems.map((d) => d.route)]);

    const dashboardItems = dashboards
      .filter((db) => !allRoutes.has(`dashboard-${db.key}`))
      .map(mapDashboard);

    // Extra modules registered in reportModuleMap but not in any catalog source
    const allFinalRoutes = new Set([
      ...staticRoutes,
      ...dynamicItems.map((d) => d.route),
      ...dashboardItems.map((d) => d.route),
    ]);
    const extraItems: CatalogItem[] = reportModules
      .filter((m) => !allFinalRoutes.has(m.route))
      .map((m) => ({
        id: m.id,
        title: m.titleKey,
        description: m.descriptionKey ?? '',
        group: 'Dashboard',
        icon: '🔍',
        tags: [],
        badge: { label: 'Dashboard', tone: 'info' },
        route: m.route,
        type: 'dashboard' as const,
        category: 'Dashboard',
        source: 'static' as const,
      }));

    return [...staticItems, ...dynamicItems, ...dashboardItems, ...extraItems];
  }, [staticItems, reportsQuery.data, dashboardsQuery.data]);

  const isLoading = reportsQuery.isLoading || dashboardsQuery.isLoading;

  return { items, isLoading };
}
