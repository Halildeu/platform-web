import React from 'react';

import { endpointAdminApi } from '../../../app/services/endpointAdminApi';
import type {
  SoftwareInstallSource,
  SoftwareInventoryItem,
} from '../../../entities/endpoint-software-inventory/types';
import { useEndpointAdminI18n } from '../../../i18n';

/**
 * WEB-011 — Faz 22.5.1B (Codex 019e6b16 iter-3 AGREE).
 *
 * Read-only software inventory + WinGet readiness view for the device
 * detail drawer. Backed by the platform-backend BE-020I endpoint
 *   GET /api/v1/admin/endpoint-devices/{deviceId}/software-inventory
 * exposed through the gateway at
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/software-inventory
 *
 * 404 is the canonical "no snapshot ingested yet" empty state (Codex
 * iter-2 must-fix #1). Mutation surface (COLLECT_INVENTORY command issue)
 * was deliberately moved out of this tab — command issuance belongs to
 * the İşlemler tab (Codex iter-1 acceptance + iter-2 boundary).
 */
export interface InventoryTabProps {
  deviceId: string;
  active: boolean;
}

const INSTALL_SOURCE_OPTIONS: ReadonlyArray<SoftwareInstallSource> = ['HKLM', 'HKLM_WOW6432'];

const DEFAULT_PAGE_SIZE = 25;

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function renderTriStateWingetReady(
  ready: boolean | null | undefined,
  t: (key: string) => string,
): string {
  if (ready === true) return t('endpointAdmin.drawer.inventory.winget.ready');
  if (ready === false) return t('endpointAdmin.drawer.inventory.winget.notReady');
  return t('endpointAdmin.drawer.inventory.winget.unknown');
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const [q, setQ] = React.useState('');
  const [publisher, setPublisher] = React.useState('');
  const [installSource, setInstallSource] = React.useState<SoftwareInstallSource | ''>('');
  const [page, setPage] = React.useState(0);
  const [size] = React.useState(DEFAULT_PAGE_SIZE);

  // Codex 019e6b2b iter-1 MUST-FIX #1: reset filters AND page in the same
  // event batch as the device change, so the very first hook subscription
  // for a new device cannot inherit a stale page / filter combo from the
  // previous selection. The drawer keeps `InventoryTab` mounted across
  // devices (the `Tabs` widget does not unmount inactive tabs), so we
  // cannot rely on remount alone.
  const previousDeviceIdRef = React.useRef(deviceId);
  if (previousDeviceIdRef.current !== deviceId) {
    previousDeviceIdRef.current = deviceId;
    // Synchronous state reset during render is safe here because the
    // setters short-circuit when values match. React batches these into
    // a single re-render before any effect runs.
    setQ('');
    setPublisher('');
    setInstallSource('');
    setPage(0);
  }

  const queryResult = endpointAdminApi.useGetDeviceSoftwareInventoryQuery(
    {
      deviceId,
      q: q.trim() || undefined,
      publisher: publisher.trim() || undefined,
      installSource: installSource || undefined,
      page,
      size,
    },
    { skip: !active || !deviceId },
  );

  const { data, error, isLoading, isFetching, isUninitialized } = queryResult;

  // Codex 019e6b2b iter-1 MUST-FIX #2: short-circuit BEFORE any
  // empty/loading/error branch when the hook is skipped. RTK Query returns
  // `{ data: undefined, error: undefined, isLoading: false, isUninitialized: true }`
  // in that case, which the previous wide `!data && !error` fallback was
  // silently rendering as the empty state. Skipped == not active or
  // missing deviceId == nothing to render at all.
  if (!active || !deviceId || isUninitialized) {
    return null;
  }

  const status404 =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status: unknown }).status === 404;
  const status403 =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status: unknown }).status === 403;

  if (status403) {
    return (
      <div className="px-6 py-6 text-sm text-text-secondary" data-testid="inventory-tab-forbidden">
        {t('endpointAdmin.drawer.inventory.forbidden')}
      </div>
    );
  }

  // Codex 019e6b2b iter-1 MUST-FIX #2 (cont.): empty-state is now strictly
  // `status === 404` (the canonical "no snapshot ingested yet" backend
  // signal). The prior wide `!data && !error` fallback would silently
  // swallow future API drift (e.g. a server returning HTTP 200 with an
  // empty body). With the early-return above, the only way to reach this
  // point with `!data && !error` is a transient pre-fetch frame; we let
  // the loading branch handle that.
  if (status404) {
    return (
      <div className="px-6 py-6 text-sm text-text-secondary" data-testid="inventory-tab-empty">
        {t('endpointAdmin.drawer.inventory.empty')}
      </div>
    );
  }

  if (isLoading || (!data && !error)) {
    return (
      <div className="px-6 py-6 text-sm text-text-secondary" data-testid="inventory-tab-loading">
        {t('endpointAdmin.drawer.inventory.loading')}
      </div>
    );
  }

  if (error && !status404 && !status403) {
    return (
      <div className="px-6 py-6 text-sm text-text-danger" data-testid="inventory-tab-error">
        {t('endpointAdmin.drawer.inventory.error')}
      </div>
    );
  }

  const snapshot = data?.snapshot;
  const items = data?.items;
  const itemRows: SoftwareInventoryItem[] = items?.content ?? [];

  return (
    <div className="px-6 py-4 space-y-4" data-testid="inventory-tab">
      <div
        className="rounded-md border border-border-default bg-surface-default p-4 grid grid-cols-2 gap-2 text-sm"
        data-testid="inventory-summary"
      >
        <div>
          <strong>{t('endpointAdmin.drawer.inventory.summary.appCount')}:</strong>{' '}
          <span data-testid="inventory-summary-appCount">{snapshot?.appCount ?? '—'}</span>
        </div>
        <div>
          <strong>{t('endpointAdmin.drawer.inventory.summary.wingetReady')}:</strong>{' '}
          <span data-testid="inventory-summary-wingetReady">
            {renderTriStateWingetReady(snapshot?.wingetReady ?? null, t)}
          </span>
        </div>
        <div>
          <strong>{t('endpointAdmin.drawer.inventory.summary.wingetVersion')}:</strong>{' '}
          <span data-testid="inventory-summary-wingetVersion">
            {snapshot?.wingetVersion ?? '—'}
          </span>
        </div>
        <div>
          <strong>{t('endpointAdmin.drawer.inventory.summary.appsAvailable')}:</strong>{' '}
          <span data-testid="inventory-summary-appsAvailable">
            {snapshot?.appsAvailable
              ? t('endpointAdmin.drawer.inventory.summary.appsAvailable.yes')
              : t('endpointAdmin.drawer.inventory.summary.appsAvailable.no')}
          </span>
        </div>
        <div>
          <strong>{t('endpointAdmin.drawer.inventory.summary.summaryCollectedAt')}:</strong>{' '}
          <span data-testid="inventory-summary-summaryCollectedAt">
            {formatTimestamp(snapshot?.summaryCollectedAt)}
          </span>
        </div>
        <div>
          <strong>{t('endpointAdmin.drawer.inventory.summary.appsCollectedAt')}:</strong>{' '}
          <span data-testid="inventory-summary-appsCollectedAt">
            {formatTimestamp(snapshot?.appsCollectedAt)}
          </span>
        </div>
        {snapshot?.truncated && (
          <div
            className="col-span-2 mt-2 rounded bg-warning-soft px-3 py-2 text-xs text-warning-strong"
            data-testid="inventory-summary-truncated"
          >
            {t('endpointAdmin.drawer.inventory.summary.truncated')}
          </div>
        )}
      </div>

      {!snapshot?.appsAvailable ? (
        <div
          className="rounded-md border border-border-default bg-surface-muted p-4 text-sm text-text-secondary"
          data-testid="inventory-apps-unavailable"
        >
          {t('endpointAdmin.drawer.inventory.appsUnavailable')}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3" data-testid="inventory-filters">
            <label className="flex flex-col text-xs">
              <span className="text-text-secondary mb-1">
                {t('endpointAdmin.drawer.inventory.filter.q')}
              </span>
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  // Codex 019e6b2b iter-1 MUST-FIX #1: inline page reset
                  // in the same event batch as the filter change. The
                  // previous useEffect-based reset fired AFTER the next
                  // render, so the first hook subscription used the new
                  // filter + stale page (e.g. page=2 from a prior next-
                  // click) and only the second render corrected it.
                  setQ(e.target.value);
                  setPage(0);
                }}
                data-testid="inventory-filter-q"
                className="px-3 py-1.5 rounded border border-border-default bg-surface-default text-sm"
              />
            </label>
            <label className="flex flex-col text-xs">
              <span className="text-text-secondary mb-1">
                {t('endpointAdmin.drawer.inventory.filter.publisher')}
              </span>
              <input
                type="text"
                value={publisher}
                onChange={(e) => {
                  setPublisher(e.target.value);
                  setPage(0);
                }}
                data-testid="inventory-filter-publisher"
                className="px-3 py-1.5 rounded border border-border-default bg-surface-default text-sm"
              />
            </label>
            <label className="flex flex-col text-xs">
              <span className="text-text-secondary mb-1">
                {t('endpointAdmin.drawer.inventory.filter.installSource')}
              </span>
              <select
                value={installSource}
                onChange={(e) => {
                  setInstallSource(e.target.value as SoftwareInstallSource | '');
                  setPage(0);
                }}
                data-testid="inventory-filter-installSource"
                className="px-3 py-1.5 rounded border border-border-default bg-surface-default text-sm"
              >
                <option value="">
                  {t('endpointAdmin.drawer.inventory.filter.installSource.any')}
                </option>
                {INSTALL_SOURCE_OPTIONS.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-md border border-border-default overflow-hidden">
            <table className="w-full text-sm" data-testid="inventory-items-table">
              <thead className="bg-surface-muted text-text-secondary text-xs">
                <tr>
                  <th className="text-left px-3 py-2">
                    {t('endpointAdmin.drawer.inventory.col.displayName')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('endpointAdmin.drawer.inventory.col.displayVersion')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('endpointAdmin.drawer.inventory.col.publisher')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('endpointAdmin.drawer.inventory.col.installSource')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {itemRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-text-secondary"
                      data-testid="inventory-items-empty"
                    >
                      {t('endpointAdmin.drawer.inventory.items.empty')}
                    </td>
                  </tr>
                ) : (
                  itemRows.map((item) => (
                    <tr key={item.id} className="border-t border-border-subtle">
                      <td className="px-3 py-2">{item.displayName}</td>
                      <td className="px-3 py-2">{item.displayVersion ?? '—'}</td>
                      <td className="px-3 py-2">{item.publisher ?? '—'}</td>
                      <td className="px-3 py-2">{item.installSource}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {items && items.totalPages > 1 && (
            <div
              className="flex items-center justify-between text-xs text-text-secondary"
              data-testid="inventory-pager"
            >
              <span>
                {t('endpointAdmin.drawer.inventory.pager.page')} {items.number + 1} /{' '}
                {items.totalPages} ({items.totalElements}{' '}
                {t('endpointAdmin.drawer.inventory.pager.total')})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, items.number - 1))}
                  disabled={items.number === 0 || isFetching}
                  className="px-3 py-1 rounded border border-border-default disabled:opacity-50"
                  data-testid="inventory-pager-prev"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setPage(items.number + 1)}
                  disabled={items.number + 1 >= items.totalPages || isFetching}
                  className="px-3 py-1 rounded border border-border-default disabled:opacity-50"
                  data-testid="inventory-pager-next"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
