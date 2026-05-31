import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reportModules } from '../../modules';
import { ReportPage } from './ReportPage';
import { createDynamicReportModule, fetchReportList } from '../../modules/dynamic-report';
import { DashboardPage, fetchDashboardList } from '../../modules/dashboard';
import type { DashboardListItem } from '../../modules/dashboard';
import type { ReportListItem } from '../../modules/dynamic-report';
import type { ReportModule } from '../../modules/types';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyModule = ReportModule<any, any>;

type MergedModule = {
  module: AnyModule;
  isDynamic: boolean;
  isDashboard?: boolean;
  dashboardKey?: string;
  reportKey?: string;
  category?: string;
};

const resolveBasePath = (pathname: string): string => {
  if (pathname.startsWith('/admin/reports')) {
    return '/admin/reports';
  }
  return '/reports';
};

/**
 * Determine the active sub-route from the URL.
 * Returns empty string when at root (hub view).
 */
const getActiveRoute = (pathname: string, basePath: string): string => {
  const remainder = pathname.slice(basePath.length).replace(/^\//, '');
  if (!remainder) return '';
  const [firstSegment] = remainder.split('/');
  return firstSegment || '';
};

const ReportingApp: React.FC = () => {
  const location = useLocation();
  const basePath = resolveBasePath(location.pathname);

  const [dynamicReports, setDynamicReports] = React.useState<ReportListItem[]>([]);
  const [dashboards, setDashboards] = React.useState<DashboardListItem[]>([]);
  const [dynamicLoaded, setDynamicLoaded] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchReportList().catch((err) => {
        console.warn('[mfe-reporting] dynamic report list fetch failed:', err);
        return [] as ReportListItem[];
      }),
      fetchDashboardList().catch((err) => {
        console.warn('[mfe-reporting] dashboard list fetch failed:', err);
        return [] as DashboardListItem[];
      }),
    ])
      .then(([reports, dashboardList]) => {
        if (active) {
          setDynamicReports(reports);
          setDashboards(dashboardList);
        }
      })
      .finally(() => {
        if (active) {
          setDynamicLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const mergedModules = React.useMemo<MergedModule[]>(() => {
    const dashboardEntries: MergedModule[] = dashboards.map((db) => ({
      module: {
        id: `dashboard-${db.key}`,
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        sharedReportId: db.key as any,
        route: `dashboard-${db.key}`,
        titleKey: db.title,
        descriptionKey: db.description,
        breadcrumbKeys: [],
        navKey: db.title,
        createInitialFilters: () => ({}),
        renderFilters: () => null,
        getColumns: () => [],
        fetchRows: async () => ({ rows: [], total: 0 }),
      } as AnyModule,
      isDynamic: false,
      isDashboard: true,
      dashboardKey: db.key,
      category: db.category,
    }));

    // PR-D1b.A (Codex 019e800b finding #1 absorbed): dynamic catalog
    // REPLACES legacy static modules at the same route — migration goal.
    // Order: build dynamic entries first; static entries filtered against
    // dynamic route set. Dedupe key is `routeSegment ?? key` per the
    // backend ReportListItemDto.routeSegment alias contract (PR-D1a).
    const dynamicEntries: MergedModule[] = dynamicReports.map((report) => ({
      module: createDynamicReportModule(report) as AnyModule,
      isDynamic: true,
      reportKey: report.key,
      category: report.category,
    }));
    const dynamicRoutes = new Set(dynamicEntries.map((e) => e.module.route));

    const staticEntries: MergedModule[] = reportModules
      .filter((mod) => !dynamicRoutes.has((mod as AnyModule).route))
      .map((mod) => ({
        module: mod as AnyModule,
        isDynamic: false,
      }));

    return [...dashboardEntries, ...staticEntries, ...dynamicEntries];
  }, [dynamicReports, dashboards]);

  const activeKey = getActiveRoute(location.pathname, basePath);

  // Root route → show hub (lazy loaded)
  if (!activeKey) {
    const ReportingHub = React.lazy(() => import('./ReportingHub'));
    return (
      <React.Suspense
        fallback={
          <div className="flex flex-col gap-4 p-6">
            <div className="h-10 w-64 animate-pulse rounded-lg bg-surface-muted" />
          </div>
        }
      >
        <ReportingHub />
      </React.Suspense>
    );
  }

  // Sub-route → find matching module and render
  const activeEntry = mergedModules.find((e) => e.module.route === activeKey);

  if (!dynamicLoaded && !activeEntry) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-10 w-full animate-pulse rounded-xs bg-surface-muted" />
      </div>
    );
  }

  if (!activeEntry) {
    // Unknown route — redirect to hub
    return <RedirectToHub basePath={basePath} />;
  }

  if (activeEntry.isDashboard) {
    return <DashboardPage dashboardKey={activeEntry.dashboardKey!} />;
  }

  /* Both dynamic and static reports use the same ReportPage skeleton */
  return <ReportPage module={activeEntry.module} />;
};

/** Tiny component to redirect unknown sub-routes back to hub */
const RedirectToHub: React.FC<{ basePath: string }> = ({ basePath }) => {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(basePath, { replace: true });
  }, [navigate, basePath]);
  return null;
};

export default ReportingApp;
