import React from 'react';
import { Modal, Button } from '@mfe/design-system';
import { useQuery } from '@tanstack/react-query';
import { api } from '@mfe/shared-http';
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

interface UserOption {
  id: string;
  fullName: string;
  email: string;
}

interface MasterDataItem {
  id: string | number;
  code?: string | null;
  name: string;
  status?: boolean;
}

// iter-31 — UserDetailDrawer'daki ScopePickerSection ile parite. ScopeAssignModal
// tek-seçim, UserDetailDrawer çok-seçim olduğu için aynı component değil ama UX
// (search + code badge + scrollable list) tutarlı. Projeler 29k+ satıra çıkıyor;
// native <select> bu boyutta render edilemez — search-then-pick zorunlu.
interface SingleScopePickerProps {
  items: MasterDataItem[];
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  searchPlaceholder: string;
  emptyText: string;
  inactiveLabel: string;
}

const SingleScopePicker: React.FC<SingleScopePickerProps> = ({
  items,
  value,
  onChange,
  loading,
  searchPlaceholder,
  emptyText,
  inactiveLabel,
}) => {
  const [search, setSearch] = React.useState('');
  const q = search.trim().toLocaleLowerCase('tr-TR');
  const filtered = q
    ? items.filter((it) => {
        const name = (it.name ?? '').toLocaleLowerCase('tr-TR');
        const code = (it.code ?? '').toLocaleLowerCase('tr-TR');
        const id = String(it.id);
        return name.includes(q) || code.includes(q) || id.includes(q);
      })
    : items;
  const VISIBLE_CAP = 100;
  const visible = filtered.slice(0, VISIBLE_CAP);

  return (
    <div className="space-y-1">
      <input
        type="search"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={loading}
        className="w-full rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm disabled:opacity-50"
        data-testid="scope-assign-modal-scope-ref-search"
      />
      <div
        className="max-h-44 overflow-y-auto rounded border border-border-subtle bg-surface-default"
        data-testid="scope-assign-modal-scope-ref-list"
      >
        {loading ? (
          <div className="p-2 text-xs text-text-subtle">…</div>
        ) : filtered.length === 0 ? (
          <div className="p-2 text-xs text-text-subtle">{emptyText}</div>
        ) : (
          <>
            {visible.map((item) => {
              const isSelected = String(item.id) === value;
              return (
                <button
                  key={String(item.id)}
                  type="button"
                  onClick={() => onChange(String(item.id))}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-sm hover:bg-surface-hover ${
                    isSelected ? 'bg-surface-selected font-medium' : ''
                  }`}
                  data-testid={`scope-assign-modal-scope-ref-item-${item.id}`}
                  aria-pressed={isSelected}
                >
                  <span className="truncate">
                    {item.code ? <span className="text-text-subtle">[{item.code}] </span> : null}
                    {item.name || `#${item.id}`}
                  </span>
                  {item.status === false ? (
                    <span className="shrink-0 text-xs text-text-subtle">{inactiveLabel}</span>
                  ) : null}
                </button>
              );
            })}
            {filtered.length > VISIBLE_CAP ? (
              <div className="p-2 text-xs text-text-subtle">+{filtered.length - VISIBLE_CAP} …</div>
            ) : null}
          </>
        )}
      </div>
      {/* Hidden input to keep test compatibility (fireEvent.change still
          targets `scope-assign-modal-scope-ref` to set scopeRef directly).
          Visible UI is the search-list above. */}
      <input
        type="hidden"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="scope-assign-modal-scope-ref"
      />
    </div>
  );
};

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

  // 2026-04-29: User picker dropdown — kullanıcı feedback "user'dan
  // atanmalı". Mevcut user listesi user-service /api/v1/users'tan çekilir
  // (sayfa boyutu 100 — pagination scope picker tek seferlik yeterli).
  const usersQuery = useQuery({
    queryKey: ['scope-modal-users'],
    queryFn: async (): Promise<UserOption[]> => {
      try {
        const res = await api.get('/v1/users', { params: { pageSize: 100 } });
        const items = (res.data?.items ?? res.data?.content ?? []) as Array<{
          id: string | number;
          fullName?: string;
          name?: string;
          email?: string;
        }>;
        return items.map((u) => ({
          id: String(u.id),
          fullName: u.fullName ?? u.name ?? '',
          email: u.email ?? '',
        }));
      } catch {
        return [];
      }
    },
    enabled: open,
    staleTime: 60_000,
  });
  const userOptions = usersQuery.data ?? [];
  const hasUserOptions = userOptions.length > 0;

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
          {hasUserOptions ? (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
              data-testid="scope-assign-modal-user-id"
            >
              <option value="">{t('dataAccess.assign.userIdPlaceholder')}</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName ? `${u.fullName} (${u.email})` : u.email || `#${u.id}`}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder={usersQuery.isLoading ? '...' : t('dataAccess.assign.userIdPlaceholder')}
              disabled={usersQuery.isLoading}
              className="rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm disabled:opacity-50"
              data-testid="scope-assign-modal-user-id"
            />
          )}
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
            <SingleScopePicker
              items={masterDataItems}
              value={scopeRef}
              onChange={setScopeRef}
              loading={masterDataQuery.isLoading}
              searchPlaceholder={t('dataAccess.assign.scopeRefSearchPlaceholder')}
              emptyText={t('dataAccess.assign.scopeRefEmptySearch')}
              inactiveLabel={t('dataAccess.assign.scopeRefInactive')}
            />
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
                  masterDataQuery.isLoading ? '...' : t('dataAccess.assign.scopeRefPlaceholder')
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
