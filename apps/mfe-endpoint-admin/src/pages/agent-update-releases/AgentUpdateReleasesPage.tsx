import React from 'react';

import {
  useApproveAgentUpdateReleaseMutation,
  useListAgentUpdateReleasesQuery,
  useRevokeAgentUpdateReleaseMutation,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import { useManageGate } from '../compliance-policies/useManageGate';
import { AgentUpdateReleaseCreateModal } from '../../widgets/agent-update-release/AgentUpdateReleaseCreateModal';
import {
  CapabilityState,
  classifyCapabilityError,
  FLEET_CAPABILITY_POLICY,
} from '../../widgets/capability-state';
import type {
  AgentUpdateRelease,
  AgentUpdateReleaseStatus,
} from '../../entities/agent-update/types';

/**
 * GAP 1 slice 2 — BE-031 agent-update RELEASE CATALOG management page.
 * List (all statuses) + create (DRAFT) + approve (DRAFT→APPROVED, maker-checker)
 * + revoke (APPROVED→REVOKED). Codex 019ea0a6 AGREE. The dispatch trust boundary
 * is preserved: this page collects trust material at create; the device-drawer
 * dispatch modal never does.
 */

const DEFAULT_PAGE_SIZE = 20;
const STATUS_FILTERS: Array<AgentUpdateReleaseStatus | 'ALL'> = [
  'ALL',
  'DRAFT',
  'APPROVED',
  'REVOKED',
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const statusBadge = (s: AgentUpdateReleaseStatus): string => {
  const base = 'text-xs rounded px-1.5 py-0.5 ';
  if (s === 'APPROVED') return base + 'bg-state-success-subtle text-state-success-text';
  if (s === 'REVOKED') return base + 'bg-state-danger-subtle text-state-danger-text';
  return base + 'bg-surface-subtle text-text-secondary';
};

export const AgentUpdateReleasesPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const canManage = useManageGate();

  const [page, setPage] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<AgentUpdateReleaseStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<string | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);

  const queryArgs = {
    page,
    size: DEFAULT_PAGE_SIZE,
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  };
  const { data, error, isLoading, isFetching, refetch } =
    useListAgentUpdateReleasesQuery(queryArgs);
  const [approve, { isLoading: approving }] = useApproveAgentUpdateReleaseMutation();
  const [revoke, { isLoading: revoking }] = useRevokeAgentUpdateReleaseMutation();

  const stale = isLoading || isFetching;
  const items: AgentUpdateRelease[] = data?.content ?? [];

  const handleApprove = async (releaseId: string) => {
    setActionError(null);
    try {
      await approve({ releaseId }).unwrap();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      setActionError(
        status === 403 || status === 409
          ? t('endpointAdmin.releases.approve.makerCheckerError')
          : t('endpointAdmin.releases.approve.error'),
      );
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget || revokeReason.trim().length === 0) return;
    setActionError(null);
    try {
      await revoke({
        releaseId: revokeTarget,
        body: { revocationReason: revokeReason.trim() },
      }).unwrap();
      setRevokeTarget(null);
      setRevokeReason('');
    } catch {
      setActionError(t('endpointAdmin.releases.revoke.error'));
    }
  };

  return (
    <div className="px-6 py-4 space-y-4" data-testid="agent-update-releases-page">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {t('endpointAdmin.releases.page.title')}
        </h2>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!canManage}
          data-testid="releases-new-button"
          className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {t('endpointAdmin.releases.page.newButton')}
        </button>
      </header>

      <label className="text-sm text-text-secondary">
        {t('endpointAdmin.releases.page.statusFilter')}{' '}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AgentUpdateReleaseStatus | 'ALL');
            setPage(0);
          }}
          data-testid="releases-status-filter"
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
        <p role="alert" data-testid="releases-action-error" className="text-sm text-danger">
          {actionError}
        </p>
      )}
      {error && (
        <CapabilityState
          kind={classifyCapabilityError(error, FLEET_CAPABILITY_POLICY)}
          onRetry={refetch}
          testId="releases-state"
        />
      )}
      {!error && !stale && items.length === 0 && (
        <p className="text-sm text-text-secondary" data-testid="releases-empty">
          {t('endpointAdmin.releases.page.empty')}
        </p>
      )}

      {!error && (
        <table className="w-full text-sm" data-testid="releases-table">
          <thead>
            <tr className="text-left text-text-secondary border-b border-border-subtle">
              <th className="py-1">{t('endpointAdmin.releases.col.releaseId')}</th>
              <th>{t('endpointAdmin.releases.col.channel')}</th>
              <th>{t('endpointAdmin.releases.col.targetVersion')}</th>
              <th>{t('endpointAdmin.releases.col.signingTier')}</th>
              <th>{t('endpointAdmin.releases.col.status')}</th>
              <th>{t('endpointAdmin.releases.col.enabled')}</th>
              <th>{t('endpointAdmin.releases.col.lastUpdatedAt')}</th>
              <th>{t('endpointAdmin.releases.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!stale &&
              items.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border-subtle"
                  data-testid={`releases-row-${r.releaseId}`}
                >
                  <td className="py-1 font-mono">{r.releaseId}</td>
                  <td>{r.channel}</td>
                  <td className="font-mono">{r.targetVersion}</td>
                  <td>
                    <span
                      className={
                        r.signingTier === 'TRUSTED_SIGNED'
                          ? 'text-xs rounded px-1.5 py-0.5 bg-state-success-subtle text-state-success-text'
                          : 'text-xs rounded px-1.5 py-0.5 bg-state-warning-subtle text-state-warning-text'
                      }
                    >
                      {t(`endpointAdmin.releases.tier.${r.signingTier}`)}
                    </span>
                  </td>
                  <td>
                    <span className={statusBadge(r.status)}>{r.status}</span>
                  </td>
                  <td>{r.enabled ? '✓' : '✕'}</td>
                  <td>{formatTimestamp(r.lastUpdatedAt)}</td>
                  <td className="space-x-2">
                    {r.status === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={() => handleApprove(r.releaseId)}
                        disabled={!canManage || approving}
                        data-testid={`releases-approve-${r.releaseId}`}
                        className="text-xs px-2 py-1 rounded border border-border-default text-text-primary disabled:opacity-50"
                      >
                        {t('endpointAdmin.releases.action.approve')}
                      </button>
                    )}
                    {r.status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevokeTarget(r.releaseId);
                          setRevokeReason('');
                          setActionError(null);
                        }}
                        disabled={!canManage || revoking}
                        data-testid={`releases-revoke-${r.releaseId}`}
                        className="text-xs px-2 py-1 rounded border border-danger text-danger disabled:opacity-50"
                      >
                        {t('endpointAdmin.releases.action.revoke')}
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
        <AgentUpdateReleaseCreateModal
          open
          onCancel={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
        />
      )}

      {revokeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="releases-revoke-modal"
          className="fixed inset-0 z-[1400] flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-surface-overlay/60"
            onClick={() => setRevokeTarget(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">
              {t('endpointAdmin.releases.revoke.title')}
            </h3>
            <p className="text-sm text-text-secondary font-mono">{revokeTarget}</p>
            <label className="block">
              <span className="text-sm text-text-secondary block mb-1">
                {t('endpointAdmin.releases.revoke.reasonLabel')}
              </span>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                data-testid="releases-revoke-reason"
                className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                data-testid="releases-revoke-cancel"
                className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
              >
                {t('endpointAdmin.modal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revoking || revokeReason.trim().length === 0}
                data-testid="releases-revoke-confirm"
                className="px-4 py-2 rounded-md bg-danger text-white text-sm font-medium disabled:opacity-50"
              >
                {t('endpointAdmin.releases.action.revoke')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentUpdateReleasesPage;
