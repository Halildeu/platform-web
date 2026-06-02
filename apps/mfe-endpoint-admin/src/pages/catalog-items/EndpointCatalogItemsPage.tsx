import React from 'react';

import { useListCatalogItemsQuery } from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type {
  AdminCatalogItemSummary,
  CatalogItemStatus,
  CatalogRiskTier,
} from '../../entities/endpoint-software-catalog/types';
import { CatalogItemDrawer } from '../../widgets/catalog-item-drawer/CatalogItemDrawer';
import type { CatalogItemDrawerMode } from '../../widgets/catalog-item-drawer/CatalogItemDrawer';
import { useManageGate } from '../compliance-policies/useManageGate';

/**
 * Path C3 — Endpoint Software Catalog list + authoring entry point
 * (Codex thread 019e8982 iter-2 absorb).
 *
 * Read surface mirrors WEB-014C catalog dropdown (Spring Page<T>).
 * Row click opens the unified CatalogItemDrawer in Edit mode;
 * "Yeni Katalog Öğesi" button opens in New mode. Both flows refetch
 * the list on success via RTK Query tag invalidation.
 */

const DEFAULT_PAGE_SIZE = 20;
const STATUS_FILTERS: Array<{ label: string; value: CatalogItemStatus | 'ALL' }> = [
  { label: 'ALL', value: 'ALL' },
  { label: 'DRAFT', value: 'DRAFT' },
  { label: 'APPROVED', value: 'APPROVED' },
  { label: 'REVOKED', value: 'REVOKED' },
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function riskBadgeClass(tier: CatalogRiskTier): string {
  switch (tier) {
    case 'HIGH':
      return 'catalog-items__risk catalog-items__risk--high';
    case 'MEDIUM':
      return 'catalog-items__risk catalog-items__risk--medium';
    case 'LOW':
    default:
      return 'catalog-items__risk catalog-items__risk--low';
  }
}

export const EndpointCatalogItemsPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const canManage = useManageGate();

  const [page, setPage] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<CatalogItemStatus | 'ALL'>('ALL');
  const [drawerMode, setDrawerMode] = React.useState<CatalogItemDrawerMode | null>(null);

  const queryArgs = {
    page,
    size: DEFAULT_PAGE_SIZE,
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  };
  const { data, error, isLoading, isFetching } = useListCatalogItemsQuery(queryArgs);

  const stale = isLoading || isFetching;
  const items: AdminCatalogItemSummary[] = data?.content ?? [];

  return (
    <div className="catalog-items" data-testid="endpoint-catalog-items-page">
      <header className="catalog-items__header">
        <h2>{t('endpointAdmin.catalog.page.title')}</h2>
        <button
          type="button"
          onClick={() => setDrawerMode({ kind: 'new' })}
          disabled={!canManage}
          data-testid="catalog-items-new-button"
        >
          {t('endpointAdmin.catalog.page.newButton')}
        </button>
      </header>
      <div className="catalog-items__filters">
        <label>
          {t('endpointAdmin.catalog.page.statusFilter')}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as CatalogItemStatus | 'ALL');
              setPage(0);
            }}
            data-testid="catalog-items-status-filter"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="catalog-items__error" data-testid="catalog-items-error">
          {t('endpointAdmin.catalog.page.error')}
        </p>
      )}
      {!error && !stale && items.length === 0 && (
        <p className="catalog-items__empty">{t('endpointAdmin.catalog.page.empty')}</p>
      )}
      {!error && (
        <table className="catalog-items__table">
          <thead>
            <tr>
              <th>{t('endpointAdmin.catalog.col.catalogItemId')}</th>
              <th>{t('endpointAdmin.catalog.col.displayName')}</th>
              <th>{t('endpointAdmin.catalog.col.provider')}</th>
              <th>{t('endpointAdmin.catalog.col.packageId')}</th>
              <th>{t('endpointAdmin.catalog.col.status')}</th>
              <th>{t('endpointAdmin.catalog.col.riskTier')}</th>
              <th>{t('endpointAdmin.catalog.col.enabled')}</th>
              <th>{t('endpointAdmin.catalog.col.lastUpdatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {!stale &&
              items.map((it) => (
                <tr
                  key={it.id}
                  onClick={() => setDrawerMode({ kind: 'edit', catalogItemId: it.catalogItemId })}
                  tabIndex={0}
                  data-testid={`catalog-items-row-${it.catalogItemId}`}
                >
                  <td className="catalog-items__id">{it.catalogItemId}</td>
                  <td>{it.displayName}</td>
                  <td>{it.provider}</td>
                  <td>{it.packageId}</td>
                  <td>{it.status}</td>
                  <td>
                    <span className={riskBadgeClass(it.riskTier)}>{it.riskTier}</span>
                  </td>
                  <td>{it.enabled ? '✓' : '✕'}</td>
                  <td>{formatTimestamp(it.lastUpdatedAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {data && data.totalPages > 1 && (
        <nav className="catalog-items__pager" aria-label="pagination">
          <button
            type="button"
            disabled={page <= 0 || stale}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ‹
          </button>
          <span>
            {page + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages - 1 || stale}
            onClick={() => setPage((p) => Math.min(data.totalPages - 1, p + 1))}
          >
            ›
          </button>
        </nav>
      )}
      {drawerMode && (
        <CatalogItemDrawer
          mode={drawerMode}
          open
          canManage={canManage}
          onClose={() => setDrawerMode(null)}
        />
      )}
    </div>
  );
};

export default EndpointCatalogItemsPage;
