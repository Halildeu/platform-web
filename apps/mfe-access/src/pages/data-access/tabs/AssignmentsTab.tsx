import React from 'react';
import { Button } from '@mfe/design-system';
import {
  useDataAccessScopes,
  useRevokeDataAccessScope,
} from '../../../features/data-access/model/use-data-access-scopes.model';
import { SCOPE_KIND_I18N_KEY } from '../../../features/data-access/lib/scopeKindLabel';
import type { DataAccessScope } from '../../../entities/data-access-scope';
import { pushToast } from '../../../shared/notifications';

export interface AssignmentsTabProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  formatDate?: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const AssignmentsTab: React.FC<AssignmentsTabProps> = ({ t, formatDate }) => {
  const [userIdInput, setUserIdInput] = React.useState('');
  const [orgIdInput, setOrgIdInput] = React.useState('');
  const [appliedFilter, setAppliedFilter] = React.useState<{
    userId: string;
    orgId: number;
  } | null>(null);

  const userId = appliedFilter?.userId;
  const orgId = appliedFilter?.orgId;

  const { scopes, isLoading, isError, isServiceUnavailable, error, refetch } = useDataAccessScopes(
    userId,
    orgId,
  );
  const revokeMutation = useRevokeDataAccessScope();

  const handleApplyFilter = React.useCallback(() => {
    if (!isUuid(userIdInput)) {
      pushToast('error', t('dataAccess.assign.invalidUserId'));
      return;
    }
    const parsedOrgId = Number(orgIdInput);
    if (!Number.isInteger(parsedOrgId) || parsedOrgId <= 0) {
      pushToast('error', t('dataAccess.assign.invalidOrgId'));
      return;
    }
    setAppliedFilter({ userId: userIdInput, orgId: parsedOrgId });
  }, [userIdInput, orgIdInput, t]);

  const handleRevoke = React.useCallback(
    async (scope: DataAccessScope) => {
      if (!appliedFilter) return;
      const confirmed = window.confirm(t('dataAccess.confirm.revoke'));
      if (!confirmed) return;
      try {
        await revokeMutation.mutateAsync({
          scopeId: scope.id,
          userId: appliedFilter.userId,
          orgId: appliedFilter.orgId,
        });
        pushToast('success', t('dataAccess.assignments.revoke.success'));
      } catch (err) {
        const message = err instanceof Error ? err.message : t('dataAccess.error.unknown');
        pushToast('error', message);
      }
    },
    [appliedFilter, revokeMutation, t],
  );

  const formatGrantedAt = React.useCallback(
    (iso: string) => {
      if (!formatDate) return iso;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      return formatDate(date, { dateStyle: 'short', timeStyle: 'short' });
    },
    [formatDate],
  );

  return (
    <div className="space-y-4 p-4" data-testid="data-access-tab-assignments">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t('dataAccess.assignments.filters.userIdLabel')}
          <input
            type="text"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder={t('dataAccess.assign.userIdPlaceholder')}
            className="min-w-[280px] rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
            data-testid="data-access-filter-user-id"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t('dataAccess.assignments.filters.orgIdLabel')}
          <input
            type="number"
            min={1}
            value={orgIdInput}
            onChange={(e) => setOrgIdInput(e.target.value)}
            placeholder={t('dataAccess.assign.orgIdPlaceholder')}
            className="w-[140px] rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
            data-testid="data-access-filter-org-id"
          />
        </label>
        <Button
          variant="primary"
          onClick={handleApplyFilter}
          data-testid="data-access-filter-apply"
        >
          {t('dataAccess.assignments.filters.apply')}
        </Button>
        {appliedFilter ? (
          <Button variant="secondary" onClick={() => refetch()} data-testid="data-access-refresh">
            {t('dataAccess.action.refresh')}
          </Button>
        ) : null}
      </div>

      {isServiceUnavailable ? (
        <div
          className="rounded-md border border-border-warning bg-surface-warning-subtle p-3 text-sm text-text-warning"
          data-testid="data-access-service-unavailable"
        >
          {t('dataAccess.error.serviceUnavailable')}
        </div>
      ) : null}

      {!appliedFilter ? (
        <p className="text-sm text-text-secondary" data-testid="data-access-assignments-idle">
          {t('dataAccess.assignments.empty')}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-text-secondary" data-testid="data-access-assignments-loading">
          …
        </p>
      ) : isError && !isServiceUnavailable ? (
        <p className="text-sm text-text-error" data-testid="data-access-assignments-error">
          {error instanceof Error ? error.message : t('dataAccess.error.unknown')}
        </p>
      ) : scopes.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="data-access-assignments-empty">
          {t('dataAccess.assignments.empty')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <table className="w-full text-sm" data-testid="data-access-assignments-table">
            <thead className="bg-surface-muted text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-3 py-2">{t('dataAccess.assignments.column.scopeId')}</th>
                <th className="px-3 py-2">{t('dataAccess.assignments.column.kind')}</th>
                <th className="px-3 py-2">{t('dataAccess.assignments.column.ref')}</th>
                <th className="px-3 py-2">{t('dataAccess.assignments.column.grantedAt')}</th>
                <th className="px-3 py-2">{t('dataAccess.assignments.column.active')}</th>
                <th className="px-3 py-2">{t('dataAccess.assignments.column.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {scopes.map((scope) => (
                <tr key={scope.id} className="border-t border-border-subtle">
                  <td className="px-3 py-2">{scope.id}</td>
                  <td className="px-3 py-2">{t(SCOPE_KIND_I18N_KEY[scope.scopeKind])}</td>
                  <td className="px-3 py-2 font-mono text-xs">{scope.scopeRef}</td>
                  <td className="px-3 py-2">{formatGrantedAt(scope.grantedAt)}</td>
                  <td className="px-3 py-2">{scope.active ? '✓' : '×'}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRevoke(scope)}
                      disabled={!scope.active || revokeMutation.isPending}
                      data-testid={`data-access-revoke-${scope.id}`}
                    >
                      {t('dataAccess.action.revoke')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AssignmentsTab;
