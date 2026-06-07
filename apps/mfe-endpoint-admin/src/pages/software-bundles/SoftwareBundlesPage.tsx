import React from 'react';

import {
  useApproveSoftwareBundleMutation,
  useListSoftwareBundlesQuery,
  useRevokeSoftwareBundleMutation,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import { useManageGate } from '../compliance-policies/useManageGate';
import { SoftwareBundleCreateModal } from '../../widgets/software-bundle/SoftwareBundleCreateModal';
import type {
  SoftwareBundleStatus,
  SoftwareBundleSummary,
} from '../../entities/software-bundle/types';

/**
 * GAP 1 slice 3 — BE-029 approved software BUNDLES management page.
 * List (all statuses) + create (DRAFT) + approve (DRAFT→APPROVED, maker-checker)
 * + revoke (APPROVED→REVOKED). Clones the slice-2 release-catalog pattern
 * (Codex 019ea0a6 AGREE'd acceptance gate reused).
 */

const DEFAULT_PAGE_SIZE = 20;
const STATUS_FILTERS: Array<SoftwareBundleStatus | 'ALL'> = ['ALL', 'DRAFT', 'APPROVED', 'REVOKED'];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const statusBadge = (s: SoftwareBundleStatus): string => {
  const base = 'text-xs rounded px-1.5 py-0.5 ';
  if (s === 'APPROVED') return base + 'bg-state-success-subtle text-state-success-text';
  if (s === 'REVOKED') return base + 'bg-state-danger-subtle text-state-danger-text';
  return base + 'bg-surface-subtle text-text-secondary';
};

export const SoftwareBundlesPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const canManage = useManageGate();

  const [page, setPage] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<SoftwareBundleStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<string | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);

  const queryArgs = {
    page,
    size: DEFAULT_PAGE_SIZE,
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  };
  const { data, error, isLoading, isFetching } = useListSoftwareBundlesQuery(queryArgs);
  const [approve, { isLoading: approving }] = useApproveSoftwareBundleMutation();
  const [revoke, { isLoading: revoking }] = useRevokeSoftwareBundleMutation();

  const stale = isLoading || isFetching;
  const items: SoftwareBundleSummary[] = data?.content ?? [];

  const handleApprove = async (bundleId: string) => {
    setActionError(null);
    try {
      await approve({ bundleId }).unwrap();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      setActionError(
        status === 403 || status === 409
          ? t('endpointAdmin.bundles.approve.makerCheckerError')
          : t('endpointAdmin.bundles.approve.error'),
      );
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget || revokeReason.trim().length === 0) return;
    setActionError(null);
    try {
      await revoke({
        bundleId: revokeTarget,
        body: { revocationReason: revokeReason.trim() },
      }).unwrap();
      setRevokeTarget(null);
      setRevokeReason('');
    } catch {
      setActionError(t('endpointAdmin.bundles.revoke.error'));
    }
  };

  return (
    <div className="px-6 py-4 space-y-4" data-testid="software-bundles-page">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {t('endpointAdmin.bundles.page.title')}
        </h2>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!canManage}
          data-testid="bundles-new-button"
          className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {t('endpointAdmin.bundles.page.newButton')}
        </button>
      </header>

      <label className="text-sm text-text-secondary">
        {t('endpointAdmin.bundles.page.statusFilter')}{' '}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SoftwareBundleStatus | 'ALL');
            setPage(0);
          }}
          data-testid="bundles-status-filter"
          className="rounded-md border border-border-default px-2 py-1 text-sm bg-surface-default"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {actionError && (
        <p role="alert" data-testid="bundles-action-error" className="text-sm text-danger">
          {actionError}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="bundles-error" className="text-sm text-danger">
          {t('endpointAdmin.bundles.page.error')}
        </p>
      )}
      {!error && !stale && items.length === 0 && (
        <p className="text-sm text-text-secondary" data-testid="bundles-empty">
          {t('endpointAdmin.bundles.page.empty')}
        </p>
      )}

      {!error && (
        <table className="w-full text-sm" data-testid="bundles-table">
          <thead>
            <tr className="text-left text-text-secondary border-b border-border-subtle">
              <th className="py-1">{t('endpointAdmin.bundles.col.bundleId')}</th>
              <th>{t('endpointAdmin.bundles.col.displayName')}</th>
              <th>{t('endpointAdmin.bundles.col.status')}</th>
              <th>{t('endpointAdmin.bundles.col.enabled')}</th>
              <th>{t('endpointAdmin.bundles.col.lastUpdatedAt')}</th>
              <th>{t('endpointAdmin.bundles.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!stale &&
              items.map((b) => (
                <tr
                  key={b.bundleId}
                  className="border-b border-border-subtle"
                  data-testid={`bundles-row-${b.bundleId}`}
                >
                  <td className="py-1 font-mono">{b.bundleId}</td>
                  <td>{b.displayName}</td>
                  <td>
                    <span className={statusBadge(b.status)}>{b.status}</span>
                  </td>
                  <td>{b.enabled ? '✓' : '✕'}</td>
                  <td>{formatTimestamp(b.lastUpdatedAt)}</td>
                  <td className="space-x-2">
                    {b.status === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={() => handleApprove(b.bundleId)}
                        disabled={!canManage || approving}
                        data-testid={`bundles-approve-${b.bundleId}`}
                        className="text-xs px-2 py-1 rounded border border-border-default text-text-primary disabled:opacity-50"
                      >
                        {t('endpointAdmin.bundles.action.approve')}
                      </button>
                    )}
                    {b.status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevokeTarget(b.bundleId);
                          setRevokeReason('');
                          setActionError(null);
                        }}
                        disabled={!canManage || revoking}
                        data-testid={`bundles-revoke-${b.bundleId}`}
                        className="text-xs px-2 py-1 rounded border border-danger text-danger disabled:opacity-50"
                      >
                        {t('endpointAdmin.bundles.action.revoke')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {data && data.totalPages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="pagination">
          <button
            type="button"
            disabled={page <= 0 || stale}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-2 py-1 rounded border border-border-default disabled:opacity-50"
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
            className="px-2 py-1 rounded border border-border-default disabled:opacity-50"
          >
            ›
          </button>
        </nav>
      )}

      {createOpen && (
        <SoftwareBundleCreateModal
          open
          onCancel={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
        />
      )}

      {revokeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="bundles-revoke-modal"
          className="fixed inset-0 z-[1400] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-surface-overlay/60"
            onClick={() => setRevokeTarget(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">
              {t('endpointAdmin.bundles.revoke.title')}
            </h3>
            <p className="text-sm text-text-secondary font-mono">{revokeTarget}</p>
            <label className="block">
              <span className="text-sm text-text-secondary block mb-1">
                {t('endpointAdmin.bundles.revoke.reasonLabel')}
              </span>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                data-testid="bundles-revoke-reason"
                className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                data-testid="bundles-revoke-cancel"
                className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
              >
                {t('endpointAdmin.modal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revoking || revokeReason.trim().length === 0}
                data-testid="bundles-revoke-confirm"
                className="px-4 py-2 rounded-md bg-danger text-white text-sm font-medium disabled:opacity-50"
              >
                {t('endpointAdmin.bundles.action.revoke')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoftwareBundlesPage;
