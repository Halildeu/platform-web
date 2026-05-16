import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ColDef,
  GridReadyEvent,
  GridOptions,
  GridApi,
  IServerSideGetRowsParams,
  IServerSideDatasource,
} from 'ag-grid-community';
// Side-effect: ensures all AG Grid modules are registered.
import '@mfe/design-system/advanced/data-grid/setup';
import { useResponsiveColumnDefs, type ColumnMeta } from '@mfe/design-system/advanced/data-grid';
// Grid-contract migration (PR grid-contract): AuditEventFeed renders
// through the design-system `EntityGridTemplate` instead of a raw
// `AgGridReact`. Lazy-loaded so the heavy AG Grid bundle stays off the
// audit cold-load path — same pattern as `UsersGrid.ui.tsx`.
const EntityGridTemplate = React.lazy(() =>
  import('@mfe/design-system').then((m) => ({ default: m.EntityGridTemplate })),
);
import './audit-event-feed.css';
import { AuditEvent } from '../types/audit-event';
import {
  createAuditExportJob,
  downloadAuditExportJob,
  fetchAuditEvents,
  waitForAuditExportJob,
} from '../services/audit-api';
import { useAuditLiveStream } from '../hooks/useAuditLiveStream';
import { AuditDetailDrawer } from './AuditDetailDrawer';
import { getShellServices, type RemoteShellServices } from '../services/shell-services';
import { parseAuditFeedSearch } from '../utils/audit-feed-deeplink';
import { useWindowSearch } from '../hooks/useWindowSearch';

const DEFAULT_PAGE_SIZE = 10;
const AUDIT_EXPORT_PERMISSION = 'AUDIT-EXPORT';

const GRID_ID = 'mfe-audit/audit-event-feed';
const GRID_SCHEMA_VERSION = 1;

// Module registration delegated to @mfe/design-system/advanced/data-grid/setup (single owner)

/*
 * Viewport-aware column visibility (PR #237 propagation pattern).
 *
 * Mobile (<sm, 0–639):     timestamp + userEmail + action (essential
 *                          — who did what, when — minimum useful
 *                          triage). Codex iter-1 review (thread
 *                          019e0317) flagged that omitting `action`
 *                          strips the "what happened" signal that
 *                          audit feeds exist for; promoting it to
 *                          essential keeps the mobile view triage-
 *                          actionable while service/level/correlationId
 *                          stay on larger viewports.
 * Tablet (md, 768–1023):   + service (operation source).
 * Desktop (lg+, 1024+):    + level + correlationId (debug/forensics).
 *
 * `headerNameKey` carries the human-readable label directly because
 * mfe-audit has no i18n dictionary yet — the identity translator
 * `(key) => key` below passes it through to AG Grid's `headerName`.
 *
 * Exported for test introspection only — production rendering still
 * goes through `useResponsiveColumnDefs` inside the component.
 */
export const auditColumnMeta: ColumnMeta[] = [
  {
    field: 'timestamp',
    headerNameKey: 'Timestamp',
    columnType: 'date',
    format: 'datetime',
    flex: 1.4,
    essential: true,
  },
  {
    field: 'userEmail',
    headerNameKey: 'User',
    columnType: 'text',
    flex: 1,
    essential: true,
  },
  {
    field: 'action',
    headerNameKey: 'Action',
    columnType: 'text',
    flex: 1.2,
    essential: true,
  },
  {
    field: 'service',
    headerNameKey: 'Service',
    columnType: 'text',
    flex: 1,
    responsive: { hideBelow: 'md' },
  },
  {
    field: 'level',
    headerNameKey: 'Level',
    columnType: 'text',
    width: 110,
    responsive: { hideBelow: 'lg' },
  },
  {
    field: 'correlationId',
    headerNameKey: 'Correlation ID',
    columnType: 'text',
    flex: 1,
    responsive: { hideBelow: 'lg' },
  },
];

// Identity translator — mfe-audit has no i18n dictionary, so column
// `headerNameKey` values double as the rendered labels.
const auditHeaderTranslator = (key: string): string => key;

/*
 * Grid-contract migration note — InfiniteRowModel → SSRM.
 *
 * The pre-migration grid used AG Grid's infinite row model
 * (`rowModelType: 'infinite'` + `IDatasource`) with a bespoke
 * `TablePagination` footer. `EntityGridTemplate`'s server mode uses
 * the Server-Side Row Model (`IServerSideDatasource`) and owns
 * pagination internally via `ServerPaginationFooter`. The audit
 * datasource is therefore re-expressed as an SSRM datasource: the
 * SSRM `request` carries `startRow` / `endRow` / `sortModel`, and the
 * block is resolved into the 0-indexed `page` + `pageSize` that
 * `fetchAuditEvents` expects. Behaviour (same data, same paging) is
 * preserved.
 */

// `AgGridApi` surface used for SSRM refresh — `refreshServerSide` is
// the SSRM analogue of the old infinite-model `refreshInfiniteCache`.
type AuditGridApi = GridApi<AuditEvent> & {
  refreshServerSide?: (params?: { purge?: boolean }) => void;
};

type ServerSideParamsWithCallbacks = IServerSideGetRowsParams<AuditEvent> & {
  success?: (payload: { rowData: AuditEvent[]; rowCount: number }) => void;
  fail?: () => void;
};

export const AuditEventFeed: React.FC = () => {
  const locationSearch = useWindowSearch();
  const initialDeepLink = useRef(
    parseAuditFeedSearch(typeof window !== 'undefined' ? window.location.search : ''),
  );
  const gridApiRef = useRef<AuditGridApi | null>(null);
  const [filters, setFilters] = useState(initialDeepLink.current.filters);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(initialDeepLink.current.auditId);
  const [isLive, setIsLive] = useState(false);
  const [currentSort, setCurrentSort] = useState<string | undefined>(undefined);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // SSRM `getRows` runs inside a stable datasource closure, so the
  // latest `filters` value is read through a ref — a filter change
  // updates the ref then triggers `refreshServerSide`.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const initialAuditIdRef = useRef<string | null>(initialDeepLink.current.auditId);
  const lastSearchRef = useRef<string>(locationSearch);
  const activeRequestRef = useRef<AbortController | null>(null);
  const deeplinkNotifiedRef = useRef(false);
  const deeplinkResolvedRef = useRef(false);
  const userManagedLiveRef = useRef(false);

  const shellServices = useMemo<RemoteShellServices | null>(() => {
    try {
      return getShellServices();
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[audit] Shell servisleri hazır değil, noop kullanılacak.', error);
      }
      return null;
    }
  }, []);

  const canExportAudit = useMemo(() => {
    const shellUser = shellServices?.auth.getUser() as {
      permissions?: unknown;
      role?: unknown;
    } | null;
    const permissions = Array.isArray(shellUser?.permissions) ? shellUser.permissions : [];
    return permissions.some(
      (permission) =>
        String(permission ?? '')
          .trim()
          .toUpperCase()
          .replace(/_/g, '-') === AUDIT_EXPORT_PERMISSION,
    );
  }, [shellServices]);

  const emitTelemetry = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        return;
      }
      try {
        shellServices?.telemetry?.emit({ type, payload });
      } catch (error: unknown) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[audit] Telemetry emit failed', error);
        }
      }
    },
    [shellServices],
  );

  useEffect(() => {
    if (shellServices && initialAuditIdRef.current && !deeplinkNotifiedRef.current) {
      deeplinkNotifiedRef.current = true;
      emitTelemetry('fe.audit.deeplink_requested', {
        auditId: initialAuditIdRef.current,
      });
    }
  }, [shellServices, emitTelemetry]);

  const refreshData = useCallback(() => {
    const api = gridApiRef.current;
    api?.refreshServerSide?.({ purge: true });
  }, []);

  /*
   * SSRM datasource factory passed to `EntityGridTemplate`. The
   * `createServerSideDatasource` contract receives `{ gridApi }` and
   * returns an `IServerSideDatasource`. The closure is stable across
   * filter changes — the latest filters/sort are pulled from refs so
   * a filter change only needs a `refreshServerSide` call.
   */
  const createServerSideDatasource = useCallback(
    (_params: { gridApi: GridApi<AuditEvent> }): IServerSideDatasource => ({
      getRows: async (params: IServerSideGetRowsParams<AuditEvent>) => {
        // Cancel any in-flight request before starting a new one.
        activeRequestRef.current?.abort();
        const controller = new AbortController();
        activeRequestRef.current = controller;

        const callbacks = params as ServerSideParamsWithCallbacks;
        const succeed = (events: AuditEvent[], total: number) => {
          callbacks.success?.({ rowData: events, rowCount: total });
        };
        const failRequest = () => {
          callbacks.fail?.();
        };

        try {
          const { startRow, endRow, sortModel } = params.request;
          const resolvedStart = startRow ?? 0;
          const blockSize = Math.max(
            (endRow ?? resolvedStart + DEFAULT_PAGE_SIZE) - resolvedStart,
            1,
          );
          const page = Math.floor(resolvedStart / blockSize);
          const sort =
            sortModel && sortModel[0] ? `${sortModel[0].colId},${sortModel[0].sort}` : undefined;
          const requestedAuditId = initialAuditIdRef.current ?? undefined;
          const activeFilters = filtersRef.current;
          setCurrentSort(sort);

          const response = await fetchAuditEvents({
            page,
            pageSize: blockSize,
            auditId: requestedAuditId,
            sort,
            filters:
              activeFilters.userEmail ||
              activeFilters.service ||
              activeFilters.level ||
              activeFilters.action
                ? activeFilters
                : undefined,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;

          succeed(response.events, response.total);

          if (!response.fallback && !userManagedLiveRef.current) {
            setIsLive(true);
          }
          emitTelemetry('fe.audit.grid_fetch', {
            page,
            pageSize: blockSize,
            returned: response.events.length,
            total: response.total,
            sort,
            filters: activeFilters,
            fallback: response.fallback === true,
          });
          if (initialAuditIdRef.current && !deeplinkResolvedRef.current) {
            const matched = response.events.some((event) => event.id === initialAuditIdRef.current);
            if (matched) {
              deeplinkResolvedRef.current = true;
              emitTelemetry('fe.audit.deeplink_resolved', {
                auditId: initialAuditIdRef.current,
                page,
              });
            }
          }
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') return;
          console.error('Audit events fetch failed', error);
          failRequest();
          emitTelemetry('fe.audit.grid_fetch_failed', {
            filters: filtersRef.current,
            sort: currentSort,
          });
        }
      },
    }),
    [currentSort, emitTelemetry],
  );

  const handleGridReady = useCallback((event: GridReadyEvent<AuditEvent>) => {
    gridApiRef.current = event.api as AuditGridApi;
  }, []);

  useEffect(() => {
    if (locationSearch === lastSearchRef.current) {
      return;
    }
    lastSearchRef.current = locationSearch;
    const deepLink = parseAuditFeedSearch(locationSearch);
    // `refreshServerSide` triggers the SSRM datasource's `getRows`
    // synchronously; `getRows` reads the active filter from
    // `filtersRef.current`. The `filters` state setter only flushes
    // the ref via a post-render effect, so the ref MUST be set to the
    // next filters synchronously here — otherwise the deeplink refresh
    // fetches with the stale (previous) filter set.
    filtersRef.current = deepLink.filters;
    setFilters(deepLink.filters);
    setHighlightId(deepLink.auditId);
    initialAuditIdRef.current = deepLink.auditId;
    deeplinkNotifiedRef.current = false;
    deeplinkResolvedRef.current = false;
    const api = gridApiRef.current;
    if (api && (api.getDisplayedRowCount?.() ?? 0) > 0) {
      api.ensureIndexVisible?.(0, 'top');
      api.paginationGoToFirstPage?.();
    }
    refreshData();
  }, [locationSearch, refreshData]);

  const handleLiveEvent = useCallback(
    (event: AuditEvent) => {
      setHighlightId(event.id);
      refreshData();
      emitTelemetry('fe.audit.live_event_received', {
        auditId: event.id,
        level: event.level,
        service: event.service,
      });
    },
    [refreshData, emitTelemetry],
  );

  const liveHandlers = useMemo(
    () => ({
      onEvent: handleLiveEvent,
      onFallbackTick: () => {
        emitTelemetry('fe.audit.live_fallback_poll', {
          filters,
        });
        refreshData();
      },
    }),
    [handleLiveEvent, refreshData, emitTelemetry, filters],
  );

  useAuditLiveStream(isLive, liveHandlers);

  const onFilterSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const nextFilters = {
        userEmail: (formData.get('userEmail') as string) ?? '',
        service: (formData.get('service') as string) ?? '',
        level: (formData.get('level') as string) ?? '',
        action: (formData.get('action') as string) ?? '',
      };
      // `refreshData` → `refreshServerSide` runs the SSRM `getRows`
      // synchronously, and `getRows` reads `filtersRef.current`. The
      // `setFilters` state update only flushes the ref on the next
      // render (post-render effect), so the ref MUST be assigned the
      // next filters synchronously here — otherwise the refresh fetches
      // the OLD filter set and the applied filter is silently dropped.
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      const api = gridApiRef.current;
      if (api && (api.getDisplayedRowCount?.() ?? 0) > 0) {
        api.ensureIndexVisible?.(0, 'top');
        api.paginationGoToFirstPage?.();
      }
      refreshData();
    },
    [refreshData],
  );

  const rowClassRules = useMemo(
    () => ({
      'audit-row-highlight': (params: { data?: AuditEvent }) =>
        !!highlightId && params.data?.id === highlightId,
    }),
    [highlightId],
  );

  // Viewport-aware column derivation — `useResponsiveColumnDefs`
  // (PR #236) re-derives only when the viewport crosses a breakpoint
  // bucket (640 / 768 / 1024 / 1280), so drag-resize within a single
  // bucket is free. Output is forwarded verbatim to
  // `EntityGridTemplate`'s `columnDefs` prop.
  const columnDefs = useResponsiveColumnDefs<AuditEvent>({
    columns: auditColumnMeta,
    t: auditHeaderTranslator,
  }) as ColDef<AuditEvent>[];

  // Grid behaviour passed through `EntityGridTemplate` → `GridShell`
  // → `AgGridReact` via the `gridOptions` slot. Row-click drawer-open
  // and the highlight row class are audit-specific; `GridShell`
  // composes the consumer's `onRowClicked` with its own handlers.
  const gridOptions = useMemo<GridOptions<AuditEvent>>(
    () => ({
      rowSelection: {
        mode: 'singleRow',
        enableClickSelection: true,
        checkboxes: false,
      },
      getRowId: ({ data }) => data?.id ?? '',
      onRowClicked: (event) => {
        setSelected(event.data ?? null);
        setHighlightId(event.data?.id ?? null);
        if (event.data) {
          emitTelemetry('fe.audit.drawer_open', {
            auditId: event.data.id,
            level: event.data.level,
            service: event.data.service,
          });
        }
      },
      rowClassRules,
    }),
    [emitTelemetry, rowClassRules],
  );

  useEffect(() => {
    const api = gridApiRef.current;
    if (!highlightId || !api) {
      return;
    }
    let matched = false;
    // `forEachNode`'s callback node carries a loosely-typed `data`;
    // cast at the access point so audit knowledge doesn't leak into
    // the shared grid types.
    api.forEachNode?.((node) => {
      const auditData = node.data as AuditEvent | undefined;
      if (auditData?.id === highlightId) {
        matched = true;
        node.setSelected(true);
        api.ensureNodeVisible?.(node, 'middle');
      }
    });
    if (!matched && (api.getDisplayedRowCount?.() ?? 0) > 0) {
      api.ensureIndexVisible?.(0, 'top');
    }
  }, [highlightId]);

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      setExportingFormat(format);
      setExportError(null);
      emitTelemetry('fe.audit.export', {
        format,
        filters,
        sort: currentSort,
      });
      try {
        const activeFilters = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => Boolean(value)),
        );
        const createdJob = await createAuditExportJob({
          format,
          sort: currentSort,
          filters: activeFilters,
        });
        emitTelemetry('fe.audit.export_job_created', {
          format,
          jobId: createdJob.id,
          status: createdJob.status,
        });
        const resolvedJob =
          createdJob.status === 'PROCESSING'
            ? await waitForAuditExportJob(createdJob.id)
            : createdJob;
        if (resolvedJob.status !== 'COMPLETED') {
          throw new Error(
            resolvedJob.errorMessage || `Audit export job ended with status ${resolvedJob.status}`,
          );
        }
        const { blob, filename } = await downloadAuditExportJob(resolvedJob.id);
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
        emitTelemetry('fe.audit.export_completed', {
          format,
          jobId: resolvedJob.id,
          eventCount: resolvedJob.eventCount,
        });
      } catch (error: unknown) {
        console.error('Audit export failed', error);
        setExportError(error instanceof Error ? error.message : 'Audit export failed');
        emitTelemetry('fe.audit.export_failed', {
          format,
          filters,
          sort: currentSort,
        });
      } finally {
        setExportingFormat(null);
      }
    },
    [emitTelemetry, filters, currentSort],
  );

  const handleDrawerTabChange = useCallback(
    (tab: string, event?: AuditEvent | null) => {
      if (!event) {
        return;
      }
      emitTelemetry('fe.audit.drawer_tab', {
        tab,
        auditId: event.id,
      });
    },
    [emitTelemetry],
  );

  return (
    <div>
      <div className="audit-toolbar">
        <form
          key={locationSearch || 'audit-filter-default'}
          data-testid="audit-filter-bar"
          className="audit-filter-bar"
          onSubmit={onFilterSubmit}
        >
          <label>
            User Email
            <input
              name="userEmail"
              data-testid="audit-filter-user-email"
              placeholder="user@example.com"
              defaultValue={filters.userEmail}
            />
          </label>
          <label>
            Service
            <input name="service" placeholder="service-name" defaultValue={filters.service} />
          </label>
          <label>
            Action
            <input name="action" placeholder="SESSION_CREATED" defaultValue={filters.action} />
          </label>
          <label>
            Level
            <select name="level" defaultValue={filters.level}>
              <option value="">All</option>
              <option value="INFO">Info</option>
              <option value="WARN">Warn</option>
              <option value="ERROR">Error</option>
            </select>
          </label>
          <div>
            <button data-testid="audit-filter-apply" type="submit">
              Apply Filters
            </button>
          </div>
        </form>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={refreshData}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exportingFormat !== null || !canExportAudit}
          >
            {exportingFormat === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exportingFormat !== null || !canExportAudit}
          >
            {exportingFormat === 'json' ? 'Exporting JSON...' : 'Export JSON'}
          </button>
          <label className="audit-live-indicator">
            <input
              type="checkbox"
              checked={isLive}
              onChange={(e) => {
                userManagedLiveRef.current = true;
                emitTelemetry('fe.audit.live_toggle', {
                  enabled: e.target.checked,
                });
                setIsLive(e.target.checked);
              }}
              style={{ marginRight: '0.25rem' }}
            />
            Live stream
          </label>
        </div>
      </div>
      {exportError ? (
        <div role="alert" style={{ marginBottom: '0.75rem', color: 'var(--state-danger-text)' }}>
          {exportError}
        </div>
      ) : null}
      {!canExportAudit ? (
        <div style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Export unavailable: audit-export permission required.
        </div>
      ) : null}

      {/*
        `data-testid="audit-grid"` is preserved (Playwright e2e —
        `tests/playwright/access_audit.grid.pagination.runtime.spec.ts`
        and `pw_scenarios.yml` query this wrapper + the AG-Grid
        `.ag-center-cols-container` row). `EntityGridTemplate` renders
        its own container inside.
      */}
      <div data-testid="audit-grid" className="audit-grid-shell">
        <React.Suspense fallback={<div style={{ height: 320 }} />}>
          <EntityGridTemplate<AuditEvent>
            gridId={GRID_ID}
            gridSchemaVersion={GRID_SCHEMA_VERSION}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            dataSourceMode="server"
            pageSize={DEFAULT_PAGE_SIZE}
            createServerSideDatasource={createServerSideDatasource}
            onGridReady={handleGridReady}
          />
        </React.Suspense>
      </div>

      <AuditDetailDrawer
        open={!!selected}
        event={selected}
        onClose={() => setSelected(null)}
        onTabChange={handleDrawerTabChange}
      />
    </div>
  );
};
