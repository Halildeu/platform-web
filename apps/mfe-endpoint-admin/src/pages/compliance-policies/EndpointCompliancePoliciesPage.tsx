import React from 'react';

import {
  useListCompliancePolicyItemsQuery,
  useDeleteCompliancePolicyItemMutation,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type {
  ComplianceEnforcementMode,
  CompliancePolicyItem,
} from '../../entities/endpoint-device-compliance/types';
import { CreatePolicyDialog } from '../../widgets/compliance-policy-dialog/CreatePolicyDialog';
import { EditPolicyDialog } from '../../widgets/compliance-policy-dialog/EditPolicyDialog';
import { DeletePolicyConfirm } from '../../widgets/compliance-policy-dialog/DeletePolicyConfirm';
import {
  CapabilityState,
  classifyCapabilityError,
  FLEET_CAPABILITY_POLICY,
} from '../../widgets/capability-state';
import { ManageHint } from '../../widgets/manage-hint';
import { useManageGate } from './useManageGate';

/**
 * WEB-014C — Compliance Policy CRUD page (Codex 019e6dff plan-time
 * iter-2 AGREE-with-minor-revisions / ready_for_impl=true).
 *
 * Read + manage REQUIRED / ALLOWED / FORBIDDEN policy items per catalog
 * item. Backed by the BE-023 admin endpoints:
 *
 *   GET    /endpoint-admin/compliance/policy-items?page=&size=
 *   POST   /endpoint-admin/compliance/policy-items
 *   PUT    /endpoint-admin/compliance/policy-items/{id}
 *   DELETE /endpoint-admin/compliance/policy-items/{id}
 *
 * RBAC: list endpoint requires `can_view`; create / update / delete
 * require `can_manage`. Frontend mirrors that with two layers:
 *   1. visual gate — Create / Edit / Delete buttons disabled when the
 *      shell-side `getModuleLevel('ENDPOINT_ADMIN')` is `VIEW`.
 *   2. backend authoritative — 403 still surfaces as a toast.
 *
 * Codex 019e6dff iter-1 / iter-2 absorbed contract notes:
 *   - List response is `ComplianceEvaluationListResponse<T>` (custom
 *     `{items, page, size, totalElements, totalPages}` envelope), NOT
 *     Spring `Page<T>`.
 *   - `enabled=false` is a soft disable (evaluator skips the row);
 *     delete is a hard remove (missing row -> ALLOWED default).
 *   - Edit dialog disables the `catalogItemId` field — backend
 *     enforces immutability and returns 400 if changed.
 *   - PUT body does NOT include `version` — backend ignores
 *     optimistic concurrency on the request DTO; 409 surfaces as
 *     generic conflict toast.
 *   - Enforcement badge palette: REQUIRED primary/blue, FORBIDDEN
 *     danger/red, ALLOWED neutral (Codex 019e6dff iter-2 §2 absorb;
 *     green would falsely imply "compliant" semantics).
 */

const DEFAULT_PAGE_SIZE = 20;

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function enforcementBadgeClass(mode: ComplianceEnforcementMode): string {
  switch (mode) {
    case 'REQUIRED':
      return 'compliance-policies__enforcement compliance-policies__enforcement--required';
    case 'FORBIDDEN':
      return 'compliance-policies__enforcement compliance-policies__enforcement--forbidden';
    case 'ALLOWED':
    default:
      return 'compliance-policies__enforcement compliance-policies__enforcement--allowed';
  }
}

function enforcementLabel(mode: ComplianceEnforcementMode, t: (k: string) => string): string {
  switch (mode) {
    case 'REQUIRED':
      return t('endpointAdmin.compliance.policies.enforcement.required');
    case 'FORBIDDEN':
      return t('endpointAdmin.compliance.policies.enforcement.forbidden');
    case 'ALLOWED':
    default:
      return t('endpointAdmin.compliance.policies.enforcement.allowed');
  }
}

export const EndpointCompliancePoliciesPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const canManage = useManageGate();
  const manageHintId = React.useId();

  const [page, setPage] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<CompliancePolicyItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CompliancePolicyItem | null>(null);

  const { data, error, isLoading, isFetching, refetch } = useListCompliancePolicyItemsQuery({
    page,
    size: DEFAULT_PAGE_SIZE,
  });

  const [deletePolicy, deleteState] = useDeleteCompliancePolicyItemMutation();

  const onDeleteConfirm = React.useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deletePolicy({ id: deleteTarget.id }).unwrap();
      setDeleteTarget(null);
    } catch {
      // Toast surfaced inside DeletePolicyConfirm via mutation state
    }
  }, [deletePolicy, deleteTarget]);

  return (
    <div className="compliance-policies" data-testid="compliance-policies">
      <header className="compliance-policies__header">
        <h1>{t('endpointAdmin.compliance.policies.title')}</h1>
        <p className="compliance-policies__subtitle">
          {t('endpointAdmin.compliance.policies.subtitle')}
        </p>
        <div className="compliance-policies__actions">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canManage}
            aria-describedby={!canManage ? manageHintId : undefined}
            title={!canManage ? t('endpointAdmin.authz.manageRequired') : undefined}
            data-testid="compliance-policies-create-button"
          >
            {t('endpointAdmin.compliance.policies.createButton')}
          </button>
        </div>
      </header>

      {!canManage && <ManageHint id={manageHintId} testId="compliance-policies-manage-hint" />}

      {error ? (
        <CapabilityState
          kind={classifyCapabilityError(error, FLEET_CAPABILITY_POLICY)}
          onRetry={refetch}
          testId="compliance-policies-state"
        />
      ) : null}
      {!error && (isLoading || isFetching) ? (
        <div className="compliance-policies__loading" data-testid="compliance-policies-loading">
          {t('endpointAdmin.compliance.policies.loading')}
        </div>
      ) : null}
      {!error && !isLoading && !isFetching && data && data.items.length === 0 ? (
        <div className="compliance-policies__empty" data-testid="compliance-policies-empty">
          {t('endpointAdmin.compliance.policies.empty')}
        </div>
      ) : null}
      {!error && !isLoading && !isFetching && data && data.items.length > 0 ? (
        <>
          <table className="compliance-policies__table" data-testid="compliance-policies-table">
            <thead>
              <tr>
                <th>{t('endpointAdmin.compliance.policies.col.catalogItemKey')}</th>
                <th>{t('endpointAdmin.compliance.policies.col.displayName')}</th>
                <th>{t('endpointAdmin.compliance.policies.col.enforcement')}</th>
                <th>{t('endpointAdmin.compliance.policies.col.enabled')}</th>
                <th>{t('endpointAdmin.compliance.policies.col.lastUpdated')}</th>
                <th>{t('endpointAdmin.compliance.policies.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: CompliancePolicyItem) => (
                <tr
                  key={item.id}
                  className="compliance-policies__row"
                  data-testid={`compliance-policies-row-${item.id}`}
                >
                  <td className="compliance-policies__catalog-key">{item.catalogItemKey}</td>
                  <td>{item.catalogDisplayName}</td>
                  <td>
                    <span className={enforcementBadgeClass(item.enforcementMode)}>
                      {enforcementLabel(item.enforcementMode, t)}
                    </span>
                  </td>
                  <td>
                    {item.enabled ? (
                      <span className="compliance-policies__enabled-yes">
                        {t('endpointAdmin.compliance.policies.enabled.yes')}
                      </span>
                    ) : (
                      <span className="compliance-policies__enabled-no">
                        {t('endpointAdmin.compliance.policies.enabled.no')}
                      </span>
                    )}
                  </td>
                  <td>{formatTimestamp(item.lastUpdatedAt)}</td>
                  <td className="compliance-policies__row-actions">
                    <button
                      type="button"
                      onClick={() => setEditTarget(item)}
                      disabled={!canManage}
                      aria-describedby={!canManage ? manageHintId : undefined}
                      title={!canManage ? t('endpointAdmin.authz.manageRequired') : undefined}
                      data-testid={`compliance-policies-edit-${item.id}`}
                    >
                      {t('endpointAdmin.compliance.policies.editButton')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      disabled={!canManage}
                      aria-describedby={!canManage ? manageHintId : undefined}
                      title={!canManage ? t('endpointAdmin.authz.manageRequired') : undefined}
                      data-testid={`compliance-policies-delete-${item.id}`}
                    >
                      {t('endpointAdmin.compliance.policies.deleteButton')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.totalPages > 1 ? (
            <nav
              className="compliance-policies__pagination"
              aria-label={t('endpointAdmin.compliance.policies.paginationAria')}
              data-testid="compliance-policies-pagination"
            >
              <button
                type="button"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page <= 0}
                data-testid="compliance-policies-prev"
              >
                {t('endpointAdmin.compliance.policies.prev')}
              </button>
              <span data-testid="compliance-policies-page-indicator">
                {t('endpointAdmin.compliance.policies.pageIndicator')
                  .replace('{page}', String(data.page + 1))
                  .replace('{totalPages}', String(data.totalPages))
                  .replace('{totalElements}', String(data.totalElements))}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(data.totalPages - 1, page + 1))}
                disabled={page + 1 >= data.totalPages}
                data-testid="compliance-policies-next"
              >
                {t('endpointAdmin.compliance.policies.next')}
              </button>
            </nav>
          ) : null}
        </>
      ) : null}

      <CreatePolicyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        canManage={canManage}
      />

      <EditPolicyDialog
        open={editTarget !== null}
        item={editTarget}
        onClose={() => setEditTarget(null)}
        canManage={canManage}
      />

      <DeletePolicyConfirm
        open={deleteTarget !== null}
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
        isLoading={deleteState.isLoading}
        error={
          deleteState.error && 'status' in deleteState.error
            ? (deleteState.error.status as number | string | undefined)
            : undefined
        }
      />
    </div>
  );
};

export default EndpointCompliancePoliciesPage;
