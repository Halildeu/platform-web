import React, { useEffect, useMemo, useState } from 'react';
import { UserDetail } from '@mfe/shared-types';
import { useUserMutations } from '../../../features/user-management/model/use-users-query.model';
import { usePermissions } from '@mfe/auth';
import { DetailDrawer, Tabs, Checkbox } from '@mfe/design-system';
import { useUsersI18n } from '../../../i18n/useUsersI18n';
import { pushToast } from '../../../shared/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@mfe/shared-http';

const badgeBaseClass =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-tight';
const badgeToneClass: Record<string, string> = {
  default: 'border-border-subtle bg-surface-muted text-text-secondary',
  blue: 'border-state-info-border bg-state-info text-state-info-text',
  success: 'border-state-success-border bg-state-success-bg text-state-success-text',
  warning: 'border-state-warning-border bg-state-warning-bg text-state-warning-text',
  error: 'border-state-danger-border bg-state-danger-bg text-state-danger-text',
};
const getBadgeClass = (tone: string) =>
  `${badgeBaseClass} ${badgeToneClass[tone] ?? badgeToneClass.default}`;

interface UserDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  user: UserDetail | null;
}

// --- Role & Scope types ---
interface RoleOption {
  id: number;
  name: string;
}
interface ScopeEntity {
  id: number;
  /**
   * Codex 019dda1c iter-30: optional natural code (PROJECT_NUMBER,
   * COMPANY_SHORT_CODE, SPECIAL_CODE) shown alongside the name so admins
   * can disambiguate similarly-titled rows. Null when the entity has no
   * natural code (e.g. BRANCH).
   */
  code?: string | null;
  name: string;
}

const FALLBACK_ROLE_OPTIONS: RoleOption[] = [
  { id: 1, name: 'ADMIN' },
  { id: 2, name: 'USER_MANAGER' },
  { id: 3, name: 'USER_VIEWER' },
  { id: 4, name: 'PURCHASE_MANAGER' },
  { id: 5, name: 'WAREHOUSE_OPERATOR' },
];

const FALLBACK_ROLE_ID_BY_NAME: Record<string, number> = FALLBACK_ROLE_OPTIONS.reduce<
  Record<string, number>
>((acc, role) => {
  acc[role.name] = role.id;
  return acc;
}, {});

const resolveFallbackRoleOptions = (currentRole: string | undefined): RoleOption[] => {
  const normalizedRole = String(currentRole ?? '')
    .trim()
    .toUpperCase();
  if (!normalizedRole || FALLBACK_ROLE_ID_BY_NAME[normalizedRole]) {
    return FALLBACK_ROLE_OPTIONS;
  }
  return [...FALLBACK_ROLE_OPTIONS, { id: FALLBACK_ROLE_OPTIONS.length + 1, name: normalizedRole }];
};

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ open, onClose, user }) => {
  const { t, locale } = useUsersI18n();
  const queryClient = useQueryClient();
  const { hasModule, isSuperAdmin, sessionExpired } = usePermissions();
  const isAdmin = isSuperAdmin();
  // Codex 019dd818 iter-7 (B-prime PR-2b): sessionExpired durumunda canEdit
  // false olur — kullanıcı authn unknown'ı authz deny gibi görmesin. Shell
  // toast 'Oturum yenile' CTA gösterir; burada kontrolleri disabled tutmak yeterli.
  const canEdit = !sessionExpired && (isAdmin || hasModule('USER_MANAGEMENT'));

  const storedScope = useMemo(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('halo.scope') : null;
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const { toggleStatusMutation, updateSessionTimeoutMutation } = useUserMutations({
    companyId: storedScope.companyId,
    projectId: storedScope.projectId,
    warehouseId: storedScope.warehouseId,
  });

  // --- State ---
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<number[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(15);
  const [dirty, setDirty] = useState(false);

  // --- Queries (all hooks MUST be above any early return) ---
  // 2026-04-29 fix: kullanıcı feedback "users da sınırlı roller görünüyor"
  // (sadece 5 fallback rol). Backend /v1/roles 16 rol dönerken frontend
  // catch'e düşüp hardcoded FALLBACK_ROLE_OPTIONS gösteriyordu (network/parse
  // failure'da bile 5 rol kafa karıştırıcı).
  //
  // Yeni davranış:
  // 1. /v1/roles HTTP 200 + items array → tüm rolleri göster (DB'den ne gelirse)
  // 2. Fail (network/parse) → BOŞ list + console.warn (UI "rol yüklenemedi"
  //    mesajı gösterebilir). Hardcoded fallback yalnız son çare olarak
  //    user.role'ü içerir (en azından mevcut atama görünür).
  // Generic API list payload — Spring's Page<T> shape (`content`) or
  // raw arrays (no envelope). Helper unwraps both into a typed item list.
  type ListPayload<T> = T[] | { items?: T[]; content?: T[] };
  const unwrapList = <T,>(data: unknown): T[] => {
    if (Array.isArray(data)) return data as T[];
    const envelope = data as { items?: T[]; content?: T[] } | null | undefined;
    return envelope?.items ?? envelope?.content ?? [];
  };

  const rolesQuery = useQuery({
    queryKey: ['roles-list'],
    queryFn: async () => {
      try {
        const res = await api.get('/v1/roles');
        const items = unwrapList<{ id?: number | string; name?: string }>(
          res.data as ListPayload<unknown>,
        );
        const parsed = items
          .map((r) => ({ id: r.id as number, name: r.name ?? '' }))
          .filter((r) => r.id != null && r.name) as RoleOption[];
        if (parsed.length > 0) {
          return parsed;
        }
        // Empty array → backend roller henüz seedlenmemiş veya filter
        // tüm rolleri elemiş; fallback'e geç (kullanıcı yine de mevcut
        // atamasını görsün).
        return resolveFallbackRoleOptions(user?.role);
      } catch (err) {
        console.warn('[UserDetailDrawer] /v1/roles fetch failed, using fallback', err);
        return resolveFallbackRoleOptions(user?.role);
      }
    },
    enabled: open,
  });

  const userRolesQuery = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      try {
        const res = await api.get(`/v1/authz/users/${user!.id}/roles`);
        const rows = (res.data as Array<{ roleId: number }>) ?? [];
        return rows.map((r) => r.roleId);
      } catch {
        const fallbackRoleId =
          FALLBACK_ROLE_ID_BY_NAME[
            String(user?.role ?? '')
              .trim()
              .toUpperCase()
          ];
        return fallbackRoleId ? [fallbackRoleId] : [];
      }
    },
    enabled: open && !!user,
  });

  // Codex 019dda1c iter-28c: scope picker source endpoints retargeted to
  // permission-service MasterDataController (/api/v1/master-data/{...}).
  // Pre-iter-28c the drawer hit /v1/{companies,projects,warehouses,branches}
  // expecting a non-existent core-data-service stub — every query 404'd,
  // the catch silently returned [], and the four scope tabs rendered as
  // empty lists with the misleading "scope atanmadan kullanıcı veri
  // göremez" placeholder. The real master-data live in workcube_mikrolink
  // and are exposed by permission-service's MasterDataController, which
  // returns a flat List<MasterDataItem> ({id, name, status}) — no
  // pagination wrapper, so we drop the unwrapList helper here.
  //
  // Endpoint mapping mirrors mfe-access ScopeAssignModal:
  //   companies   → /v1/master-data/companies
  //   projects    → /v1/master-data/projects
  //   branches    → /v1/master-data/branches
  //   warehouses  → /v1/master-data/departments
  //     (the system contract treats DEPOT as the workcube DEPARTMENTS
  //      table; the UI label "Depolar" is a downstream naming choice
  //      preserved across both drawers.)
  // Codex 019dda1c iter-30: backend now emits an optional `code` field
  // (PROJECT_NUMBER, COMPANY_SHORT_CODE, SPECIAL_CODE) per master-data
  // item. Pipe it through the ScopeEntity mapping so the drawer can
  // render "[code] name" disambiguation alongside the checkbox label.
  type MasterDataItem = { id: number; code?: string | null; name: string; status?: boolean };
  const companiesQuery = useQuery({
    queryKey: ['scope-companies'],
    queryFn: async () => {
      try {
        const res = await api.get('/v1/master-data/companies');
        return ((res.data as MasterDataItem[]) ?? []).map((c) => ({
          id: c.id,
          code: c.code ?? null,
          name: c.name,
        })) as ScopeEntity[];
      } catch {
        return [] as ScopeEntity[];
      }
    },
    enabled: open,
    staleTime: 60_000,
  });
  const projectsQuery = useQuery({
    queryKey: ['scope-projects'],
    queryFn: async () => {
      try {
        const res = await api.get('/v1/master-data/projects');
        return ((res.data as MasterDataItem[]) ?? []).map((p) => ({
          id: p.id,
          code: p.code ?? null,
          name: p.name,
        })) as ScopeEntity[];
      } catch {
        return [] as ScopeEntity[];
      }
    },
    enabled: open,
    staleTime: 60_000,
  });
  const warehousesQuery = useQuery({
    queryKey: ['scope-warehouses'],
    queryFn: async () => {
      try {
        const res = await api.get('/v1/master-data/departments');
        return ((res.data as MasterDataItem[]) ?? []).map((w) => ({
          id: w.id,
          code: w.code ?? null,
          name: w.name,
        })) as ScopeEntity[];
      } catch {
        return [] as ScopeEntity[];
      }
    },
    enabled: open,
    staleTime: 60_000,
  });
  const branchesQuery = useQuery({
    queryKey: ['scope-branches'],
    queryFn: async () => {
      try {
        const res = await api.get('/v1/master-data/branches');
        return ((res.data as MasterDataItem[]) ?? []).map((b) => ({
          id: b.id,
          code: b.code ?? null,
          name: b.name,
        })) as ScopeEntity[];
      } catch {
        return [] as ScopeEntity[];
      }
    },
    enabled: open,
    staleTime: 60_000,
  });

  // User's current scope assignments
  const userScopesQuery = useQuery({
    queryKey: ['user-scopes', user?.id],
    queryFn: async () => {
      try {
        const res = await api.get(`/v1/roles/users/${user!.id}/scopes`);
        const data = res.data as {
          companyIds?: number[];
          projectIds?: number[];
          warehouseIds?: number[];
          branchIds?: number[];
        } | null;
        return {
          companyIds: data?.companyIds ?? [],
          projectIds: data?.projectIds ?? [],
          warehouseIds: data?.warehouseIds ?? [],
          branchIds: data?.branchIds ?? [],
        };
      } catch {
        return { companyIds: [], projectIds: [], warehouseIds: [], branchIds: [] };
      }
    },
    enabled: open && !!user,
  });

  // Reset state when user changes
  useEffect(() => {
    if (userRolesQuery.data) {
      setSelectedRoleIds(userRolesQuery.data);
    }
    setSessionTimeoutMinutes(user?.sessionTimeoutMinutes ?? 15);
    setDirty(false);
  }, [user?.id, userRolesQuery.data]);

  // Initialize scope selections from user's current assignments
  useEffect(() => {
    if (userScopesQuery.data) {
      setSelectedCompanyIds(userScopesQuery.data.companyIds);
      setSelectedProjectIds(userScopesQuery.data.projectIds);
      setSelectedWarehouseIds(userScopesQuery.data.warehouseIds);
      setSelectedBranchIds(userScopesQuery.data.branchIds);
    }
  }, [userScopesQuery.data]);

  // --- Mutations ---
  const assignMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/v1/authz/users/${user!.id}/assignments`, {
        roleIds: selectedRoleIds,
        scopes: {
          companyIds: selectedCompanyIds,
          projectIds: selectedProjectIds,
          warehouseIds: selectedWarehouseIds,
          branchIds: selectedBranchIds,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles', user?.id] });
      pushToast('success', t('users.detail.assignmentSaved'));
      setDirty(false);
    },
    onError: (err: Error) => pushToast('error', err.message),
  });

  const handleSave = () => assignMutation.mutate();

  const toggleRole = (roleId: number) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
    setDirty(true);
  };

  const toggleScope = (setter: React.Dispatch<React.SetStateAction<number[]>>, id: number) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setDirty(true);
  };

  // --- Session timeout ---
  const handleSessionTimeoutSave = async () => {
    if (!user) return;
    const nextValue = Math.round(Number(sessionTimeoutMinutes));
    if (!Number.isFinite(nextValue) || nextValue < 1) {
      pushToast('warning', t('users.detail.sessionTimeout.minWarning'));
      return;
    }
    if (user.sessionTimeoutMinutes === nextValue) return;
    try {
      await updateSessionTimeoutMutation.mutateAsync({
        userId: user.id,
        sessionTimeoutMinutes: nextValue,
      });
      pushToast('success', t('users.detail.sessionTimeout.updated'));
    } catch {
      pushToast('error', t('users.detail.sessionTimeout.updateFailed'));
    }
  };

  const formattedLastLogin = useMemo(() => {
    if (!user?.lastLoginAt) return t('shell.header.neverLoggedIn');
    try {
      const date = new Date(user.lastLoginAt);
      const localeMap: Record<string, string> = {
        tr: 'tr-TR',
        en: 'en-US',
        de: 'de-DE',
        es: 'es-ES',
      };
      return date.toLocaleString(localeMap[locale] ?? undefined);
    } catch {
      return String(user?.lastLoginAt ?? '');
    }
  }, [user?.lastLoginAt, locale, t]);

  const statusToneMap: Record<string, string> = {
    ACTIVE: 'success',
    INACTIVE: 'default',
    INVITED: 'warning',
    SUSPENDED: 'error',
  };

  if (!user) return null;

  const roles = rolesQuery.data ?? [];
  const companies = companiesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const branches = branchesQuery.data ?? [];

  // Codex 019dda1c iter-30: scope picker section refactored into a
  // dedicated component so each tab can hold its own search state
  // (helper functions can't useState — Rules of Hooks). Search filters
  // by both code and name (case-insensitive). "Tümünü Seç" still toggles
  // ALL items in the dataset, not just the filtered subset, so an admin
  // doesn't accidentally clear unselected rows by typing a search query.
  // Code prefix rendered in monospace before the name when present.
  const ScopePickerSection: React.FC<{
    items: ScopeEntity[];
    selected: number[];
    setter: React.Dispatch<React.SetStateAction<number[]>>;
  }> = ({ items, selected, setter }) => {
    const [search, setSearch] = React.useState('');
    const q = search.trim().toLocaleLowerCase('tr-TR');
    const filtered = q
      ? items.filter(
          (i) =>
            (i.name ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
            (i.code ?? '').toLocaleLowerCase('tr-TR').includes(q),
        )
      : items;

    const allSelected = items.length > 0 && items.every((i) => selected.includes(i.id));
    const noneSelected = items.every((i) => !selected.includes(i.id));
    const toggleAll = () => {
      if (allSelected) {
        setter([]);
      } else {
        setter(items.map((i) => i.id));
      }
      setDirty(true);
    };

    return (
      <div className="flex flex-col gap-2 mt-2">
        {items.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('users.detail.scopes.searchPlaceholder')}
            className="w-full rounded border border-border-subtle bg-surface-default px-3 py-1.5 text-sm placeholder:text-text-subtle focus:border-border-default focus:outline-none"
            data-testid="scope-search-input"
          />
        )}
        {items.length > 1 && (
          <Checkbox
            label={t('users.detail.scopes.selectAll')}
            checked={allSelected}
            indeterminate={!allSelected && !noneSelected}
            onChange={toggleAll}
            disabled={!canEdit}
          />
        )}
        {q && filtered.length === 0 && (
          <p className="text-xs text-text-subtle italic">
            {t('users.detail.scopes.searchEmpty', { query: search })}
          </p>
        )}
        {filtered.map((item) => (
          <Checkbox
            key={item.id}
            label={
              item.code ? (
                <span>
                  <span className="mr-2 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-text-subtle">
                    {item.code}
                  </span>
                  {item.name}
                </span>
              ) : (
                item.name
              )
            }
            checked={selected.includes(item.id)}
            onChange={() => toggleScope(setter, item.id)}
            disabled={!canEdit}
          />
        ))}
      </div>
    );
  };

  // Backward-compat wrapper so existing scopeTabs entries keep their shape.
  const scopeCheckboxList = (
    items: ScopeEntity[],
    selected: number[],
    setter: React.Dispatch<React.SetStateAction<number[]>>,
  ) => <ScopePickerSection items={items} selected={selected} setter={setter} />;

  const scopeTabs = [
    {
      key: 'companies',
      label: t('users.detail.scopes.companies'),
      content: scopeCheckboxList(companies, selectedCompanyIds, setSelectedCompanyIds),
    },
    {
      key: 'projects',
      label: t('users.detail.scopes.projects'),
      content: scopeCheckboxList(projects, selectedProjectIds, setSelectedProjectIds),
    },
    {
      key: 'warehouses',
      label: t('users.detail.scopes.warehouses'),
      content: scopeCheckboxList(warehouses, selectedWarehouseIds, setSelectedWarehouseIds),
    },
    {
      key: 'branches',
      label: t('users.detail.scopes.branches'),
      content: scopeCheckboxList(branches, selectedBranchIds, setSelectedBranchIds),
    },
  ];

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      width={520}
      title={`${user.fullName}`}
      extra={
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-text-secondary hover:text-text-primary"
        >
          {t('shell.launcher.close')}
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Profile Section */}
        <section>
          <h3 className="text-base font-semibold text-text-primary">
            {t('users.detail.section.profile')}
          </h3>
          <dl className="flex flex-col mt-3 gap-3 rounded-2xl border border-border-subtle bg-surface-muted p-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                {t('users.grid.columns.email')}
              </dt>
              <dd className="text-text-primary">{user.email}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                {t('users.grid.columns.status')}
              </dt>
              <dd className="flex items-center gap-3">
                <span className={getBadgeClass(statusToneMap[user.status] ?? 'default')}>
                  {user.status}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={user.status === 'ACTIVE'}
                    disabled={toggleStatusMutation.isPending}
                    onClick={async () => {
                      try {
                        const nextEnabled = user.status !== 'ACTIVE';
                        await toggleStatusMutation.mutateAsync({
                          userId: user.id,
                          enabled: nextEnabled,
                        });
                        pushToast('success', t('users.actions.status.success'));
                      } catch (e: unknown) {
                        pushToast('error', (e as Error).message);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${user.status === 'ACTIVE' ? 'bg-action-primary' : 'bg-border-subtle'}`}
                  >
                    <span
                      className="inline-block h-5 w-5 transform rounded-full bg-surface-default transition"
                      style={{
                        transform:
                          user.status === 'ACTIVE' ? 'translateX(20px)' : 'translateX(2px)',
                      }}
                    />
                  </button>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                {t('users.grid.columns.sessionTimeoutMinutes')}
              </dt>
              <dd>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={sessionTimeoutMinutes}
                      onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value))}
                      className="w-20 rounded-xl border border-border-subtle px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSessionTimeoutSave}
                      disabled={
                        updateSessionTimeoutMutation.isPending ||
                        sessionTimeoutMinutes === (user.sessionTimeoutMinutes ?? 15)
                      }
                      className="rounded-xl bg-action-primary px-3 py-1.5 text-xs font-semibold text-action-primary-text disabled:opacity-50"
                    >
                      {updateSessionTimeoutMutation.isPending
                        ? '...'
                        : t('users.detail.sessionTimeout.save')}
                    </button>
                  </div>
                ) : (
                  <span className="text-text-secondary">{user.sessionTimeoutMinutes ?? 15} dk</span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                {t('users.grid.columns.lastLoginAt')}
              </dt>
              <dd className="text-text-secondary">{formattedLastLogin}</dd>
            </div>
          </dl>
        </section>

        <hr className="border-border-subtle" />

        {/* Roles Section — Multi-select checkboxes */}
        <section>
          <h3 className="text-base font-semibold text-text-primary">
            {t('users.detail.section.roles')}
          </h3>
          <p className="text-xs text-text-subtle mt-1">
            {t('users.detail.section.roles.description')}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {rolesQuery.isLoading && (
              <span className="text-xs text-text-subtle">{t('users.detail.loadingRoles')}</span>
            )}
            {roles.map((role) => (
              <Checkbox
                key={role.id}
                label={role.name}
                checked={selectedRoleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                disabled={!canEdit}
              />
            ))}
            {roles.length === 0 && !rolesQuery.isLoading && (
              <span className="text-xs text-text-subtle">{t('users.detail.noRolesDefined')}</span>
            )}
            {dirty && selectedRoleIds.length === 0 && (
              <span className="text-xs text-state-danger-text">
                {t('users.detail.noRolesWarning')}
              </span>
            )}
          </div>
        </section>

        <hr className="border-border-subtle" />

        {/* Scope Section — Tabbed */}
        <section>
          <h3 className="text-base font-semibold text-text-primary">
            {t('users.detail.section.scopes')}
          </h3>
          <p className="text-xs text-text-subtle mt-1">
            {t('users.detail.section.scopes.description')}
          </p>
          <div className="mt-3">
            <Tabs items={scopeTabs} variant="line" size="sm" />
          </div>
        </section>

        <hr className="border-border-subtle" />

        {/* Footer — Save */}
        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
            >
              {t('users.detail.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || assignMutation.isPending || selectedRoleIds.length === 0}
              className="rounded-xl bg-action-primary px-4 py-2 text-sm font-semibold text-action-primary-text shadow-xs hover:opacity-90 disabled:opacity-50"
            >
              {assignMutation.isPending ? t('users.detail.saving') : t('users.detail.save')}
            </button>
          </div>
        )}
      </div>
    </DetailDrawer>
  );
};

export default UserDetailDrawer;
