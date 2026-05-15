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
    route: report.key,
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

  // R15 user-visible repair hotfix (Codex 019e2a83 follow-up):
  // Önceki useState/useEffect + Promise.all + active flag patterni
  // StrictMode mount-unmount-remount race'inde `setDynamicReports`
  // çağrılmadan `active=false` set ediliyordu → dynamicReports
  // hep [] kalıyor → 31 backend report UI'da hiç render edilmiyor
  // (sadece 12 dashboard + 2 extra = 14 entry görünüyordu; 31 report
  // tamamen filter ediliyordu). React Query mount/unmount race'i
  // built-in çözer; cache + retry + deduping ile production-grade.
  // Browser smoke (testai cluster) kanıtladı: /api/v1/reports 200 + 31
  // entry array geldiği halde gridCardsCount=0 (Grid badge'li card yok).
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

    const dynamicItems = dynamicReports.filter((r) => !staticRoutes.has(r.key)).map(mapDynamic);

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
