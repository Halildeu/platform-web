import React from 'react';
import { Modal, Button } from '@mfe/design-system';
import { useGrantDataAccessScope } from '../../features/data-access/model/use-data-access-scopes.model';
import { useMasterData } from '../../features/data-access/model/use-master-data.model';
import { buildScopeRef } from '../../features/data-access/lib/scopeRefBuilder';
import {
  SCOPE_KIND_I18N_KEY,
  ALL_SCOPE_KINDS,
} from '../../features/data-access/lib/scopeKindLabel';
import {
  ScopeAlreadyGrantedError,
  ScopeServiceUnavailableError,
  ScopeValidationError,
} from '../../data/dataAccessScopeApi';
import type { ScopeKind, ScopeGrantResponse } from '../../entities/data-access-scope';
import { pushToast } from '../../shared/notifications';

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export interface ScopeAssignModalProps {
  open: boolean;
  initialKind: ScopeKind | null;
  onClose: () => void;
  onGranted?: (response: ScopeGrantResponse) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const ScopeAssignModal: React.FC<ScopeAssignModalProps> = ({
  open,
  initialKind,
  onClose,
  onGranted,
  t,
}) => {
  const [userId, setUserId] = React.useState('');
  const [orgId, setOrgId] = React.useState('');
  const [scopeKind, setScopeKind] = React.useState<ScopeKind>(initialKind ?? 'COMPANY');
  const [scopeRef, setScopeRef] = React.useState('');
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<{ field: string; message: string } | null>(
    null,
  );

  const grantMutation = useGrantDataAccessScope();

  // 2026-04-29: Master data dropdown — backend
  // /api/v1/master-data/{companies|projects|branches|departments}'dan
  // çekilir. Boş list (ETL henüz koşmamış / table missing) durumunda
  // manuel ID input fallback gösterilir.
  const masterDataQuery = useMasterData(scopeKind, open);
  const masterDataItems = masterDataQuery.data ?? [];
  const hasMasterData = masterDataItems.length > 0;

  React.useEffect(() => {
    if (open) {
      setScopeKind(initialKind ?? 'COMPANY');
      setErrorBanner(null);
      setFieldError(null);
    }
  }, [open, initialKind]);

  // scopeKind değişince scopeRef seçimini sıfırla (eski kind'tan kalan ID
  // yeni kind için anlamsız).
  React.useEffect(() => {
    setScopeRef('');
  }, [scopeKind]);

  const resetForm = React.useCallback(() => {
    setUserId('');
    setOrgId('');
    setScopeRef('');
    setErrorBanner(null);
    setFieldError(null);
  }, []);

  const handleClose = React.useCallback(() => {
    if (grantMutation.isPending) return;
    onClose();
    resetForm();
  }, [grantMutation.isPending, onClose, resetForm]);

  const validate = React.useCallback((): boolean => {
    if (!isUuid(userId)) {
      setFieldError({ field: 'userId', message: t('dataAccess.assign.invalidUserId') });
      return false;
    }
    const parsedOrgId = Number(orgId);
    if (!Number.isInteger(parsedOrgId) || parsedOrgId <= 0) {
      setFieldError({ field: 'orgId', message: t('dataAccess.assign.invalidOrgId') });
      return false;
    }
    if (scopeRef.trim().length === 0) {
      setFieldError({ field: 'scopeRef', message: t('dataAccess.assign.invalidScopeRef') });
      return false;
    }
    setFieldError(null);
    return true;
  }, [userId, orgId, scopeRef, t]);

  const handleSubmit = React.useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setErrorBanner(null);
      if (!validate()) return;

      try {
        const response = await grantMutation.mutateAsync({
          userId,
          orgId: Number(orgId),
          scopeKind,
          scopeRef: buildScopeRef([scopeRef.trim()]),
        });
        pushToast('success', t('dataAccess.assign.success'));
        onGranted?.(response);
        onClose();
        resetForm();
      } catch (err) {
        if (err instanceof ScopeServiceUnavailableError) {
          setErrorBanner(t('dataAccess.error.serviceUnavailable'));
        } else if (err instanceof ScopeAlreadyGrantedError) {
          setErrorBanner(t('dataAccess.error.alreadyGranted'));
        } else if (err instanceof ScopeValidationError) {
          setErrorBanner(t('dataAccess.error.invalidRef'));
        } else if (err instanceof Error) {
          setErrorBanner(err.message);
        } else {
          setErrorBanner(t('dataAccess.error.unknown'));
        }
      }
    },
    [validate, grantMutation, userId, orgId, scopeKind, scopeRef, t, onGranted, onClose, resetForm],
  );

  const footer = (
    <div className="flex justify-end gap-2">
      <Button
        variant="secondary"
        onClick={handleClose}
        disabled={grantMutation.isPending}
        data-testid="scope-assign-modal-cancel"
      >
        {t('dataAccess.assign.cancel')}
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={grantMutation.isPending}
        data-testid="scope-assign-modal-submit"
      >
        {t('dataAccess.assign.submit')}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('dataAccess.assign.modalTitle')}
      size="md"
      footer={footer}
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-3"
        data-testid="scope-assign-modal-form"
        noValidate
      >
        {errorBanner ? (
          <div
            className="rounded-md border border-border-warning bg-surface-warning-subtle p-3 text-sm text-text-warning"
            data-testid="scope-assign-modal-error"
          >
            {errorBanner}
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t('dataAccess.assign.userIdLabel')}
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={t('dataAccess.assign.userIdPlaceholder')}
            className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
            data-testid="scope-assign-modal-user-id"
          />
          {fieldError?.field === 'userId' ? (
            <span className="text-xs text-text-error">{fieldError.message}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t('dataAccess.assign.orgIdLabel')}
          <input
            type="number"
            min={1}
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder={t('dataAccess.assign.orgIdPlaceholder')}
            className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
            data-testid="scope-assign-modal-org-id"
          />
          {fieldError?.field === 'orgId' ? (
            <span className="text-xs text-text-error">{fieldError.message}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t('dataAccess.assign.kindLabel')}
          <select
            value={scopeKind}
            onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
            className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
            data-testid="scope-assign-modal-kind"
          >
            {ALL_SCOPE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(SCOPE_KIND_I18N_KEY[kind])}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t('dataAccess.assign.scopeRefLabel')}
          {hasMasterData ? (
            <select
              value={scopeRef}
              onChange={(e) => setScopeRef(e.target.value)}
              className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
              data-testid="scope-assign-modal-scope-ref"
            >
              <option value="">{t('dataAccess.assign.scopeRefPlaceholder')}</option>
              {masterDataItems.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name || `#${item.id}`}{!item.status ? ' (pasif)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <>
              {/* Master data boş (ETL henüz koşmamış veya tablo yok). Manuel
                  ID input fallback. masterDataQuery.isLoading: spinner yerine
                  disabled placeholder. */}
              <input
                type="text"
                value={scopeRef}
                onChange={(e) => setScopeRef(e.target.value)}
                placeholder={
                  masterDataQuery.isLoading
                    ? '...'
                    : t('dataAccess.assign.scopeRefPlaceholder')
                }
                disabled={masterDataQuery.isLoading}
                className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm disabled:opacity-50"
                data-testid="scope-assign-modal-scope-ref"
              />
              {!masterDataQuery.isLoading && (
                <span className="text-xs text-text-subtle">
                  {t('dataAccess.assign.scopeRefManualHint')}
                </span>
              )}
            </>
          )}
          {fieldError?.field === 'scopeRef' ? (
            <span className="text-xs text-text-error">{fieldError.message}</span>
          ) : null}
        </label>
      </form>
    </Modal>
  );
};

export default ScopeAssignModal;
