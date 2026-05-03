import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserDetail } from '@mfe/shared-types';
import { useUserMutations } from '../../../features/user-management/model/use-users-query.model';
import { usePermissions } from '@mfe/auth';
// Codex 019ddd78 iter-38 P1 — primitive switch from DetailDrawer (read-only
// detail) to FormDrawer (edit/create). Same slot signature (title/subtitle/
// footer/size) so the migration is a one-line semantic rename — but it
// brings the drawer in line with the design-system contract: this drawer
// persists role + scope writes, so it belongs on the form primitive. Real
// focus-trap uplift stays a separate DS epic per Codex review.
// Codex 019dddf4 iter-43 — leading slot avatar: visual hierarchy uplift in
// drawer header. DS FormDrawer gained a `leading` slot prop (LTR-neutral)
// in this iter; UserDetailDrawer becomes the first consumer. Avatar uses
// the existing DS primitive (initials/photo/icon fallback chain).
import { FormDrawer, Tabs, Checkbox, Skeleton, Avatar } from '@mfe/design-system';
import { getInitials } from '../utils/getInitials';
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

// Codex 019ddd5b iter-37 — human-readable role labels and descriptions.
// Pre-iter-37 the drawer rendered raw UPPER_SNAKE_CASE identifiers
// ("USER_VIEWER", "ROLE_MANAGE") which mix admin notation with end-user
// notation. The mapping below pairs each known role with a Turkish label
// and a one-line description. Unknown roles fall through to the raw
// identifier so a freshly-introduced role still shows up.
type RoleMeta = { label: string; description: string };
type RoleLabelDict = Record<string, RoleMeta>;
const ROLE_LABELS_TR: RoleLabelDict = {
  ADMIN: { label: 'Yönetici', description: 'Tüm modüllerde tam yetki — sistem yöneticisi' },
  USER_MANAGER: {
    label: 'Kullanıcı Yöneticisi',
    description: 'Kullanıcı oluşturma, rol atama, hesap güvenliği işlemleri',
  },
  USER_MANAGE: {
    label: 'Kullanıcı Yönetimi (eski)',
    description: 'Eski rol — yeni atamalar için USER_MANAGER kullanın',
  },
  USER_VIEWER: {
    label: 'Kullanıcı Görüntüleyici',
    description: 'Kullanıcı listesini okur; değişiklik yapamaz',
  },
  ROLE_MANAGE: { label: 'Rol Yönetimi', description: 'Rol oluşturma, granül izin düzenleme' },
  REPORT_MANAGER: {
    label: 'Rapor Yöneticisi',
    description: 'Tüm raporları görür, yönetir, paylaşır',
  },
  REPORT_VIEWER: { label: 'Rapor Görüntüleyici', description: 'Atanmış raporları görür' },
  FINANCE_MANAGER: {
    label: 'Finans Yöneticisi',
    description: 'Finans modülü tam erişim — onay yetkili',
  },
  FINANCE_VIEWER: {
    label: 'Finans Görüntüleyici',
    description: 'Finans verilerini okur, değişiklik yapamaz',
  },
  WAREHOUSE_OPERATOR: {
    label: 'Depo Operatörü',
    description: 'Stok hareketleri, sayım, transfer işlemleri',
  },
  PURCHASE_MANAGER: {
    label: 'Satınalma Yöneticisi',
    description: 'Satınalma siparişleri ve onay yetkisi',
  },
  AUDIT_READ: {
    label: 'Denetim Görüntüleyici',
    description: 'Audit log ve aktivite takip ekranlarına erişim',
  },
  SYSTEM_CONFIGURE: {
    label: 'Sistem Yapılandırma',
    description: 'Sistem ayarları, modül konfigürasyonu',
  },
  PERMISSION_MANAGE: {
    label: 'İzin Yönetimi (eski)',
    description: 'Eski rol — yeni atamalar için ROLE_MANAGE kullanın',
  },
  VARIANT_SCOPE_CANARY: {
    label: 'Varyant Canary (test)',
    description: 'Yalnızca test/canary kapsamı için',
  },
  FULL_ACCESS_EXTRA: { label: 'Tam Erişim (eski)', description: 'Eski genişletilmiş erişim rolü' },
};
const ROLE_LABELS_EN: RoleLabelDict = {
  ADMIN: { label: 'Administrator', description: 'Full access across every module — system admin' },
  USER_MANAGER: {
    label: 'User Manager',
    description: 'Create users, assign roles, manage account security',
  },
  USER_MANAGE: {
    label: 'User Management (legacy)',
    description: 'Legacy role — use USER_MANAGER for new assignments',
  },
  USER_VIEWER: { label: 'User Viewer', description: 'Reads the user list; cannot make changes' },
  ROLE_MANAGE: { label: 'Role Management', description: 'Create roles, edit granule permissions' },
  REPORT_MANAGER: {
    label: 'Report Manager',
    description: 'Sees, manages, and shares every report',
  },
  REPORT_VIEWER: { label: 'Report Viewer', description: 'Sees assigned reports' },
  FINANCE_MANAGER: {
    label: 'Finance Manager',
    description: 'Full finance module access — approval authority',
  },
  FINANCE_VIEWER: {
    label: 'Finance Viewer',
    description: 'Reads finance data; cannot make changes',
  },
  WAREHOUSE_OPERATOR: {
    label: 'Warehouse Operator',
    description: 'Stock movements, counts, transfers',
  },
  PURCHASE_MANAGER: {
    label: 'Purchase Manager',
    description: 'Purchase orders and approval authority',
  },
  AUDIT_READ: { label: 'Audit Viewer', description: 'Access to audit log and activity screens' },
  SYSTEM_CONFIGURE: {
    label: 'System Configuration',
    description: 'System settings, module configuration',
  },
  PERMISSION_MANAGE: {
    label: 'Permission Management (legacy)',
    description: 'Legacy role — use ROLE_MANAGE for new assignments',
  },
  VARIANT_SCOPE_CANARY: { label: 'Variant Canary (test)', description: 'Test/canary scope only' },
  FULL_ACCESS_EXTRA: { label: 'Full Access (legacy)', description: 'Legacy expanded-access role' },
};
const resolveRoleMeta = (rawName: string, locale: string): RoleMeta => {
  const dict = locale === 'en' ? ROLE_LABELS_EN : ROLE_LABELS_TR;
  return dict[rawName] ?? { label: rawName, description: '' };
};

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ open, onClose, user }) => {
  const { t, locale } = useUsersI18n();
  const queryClient = useQueryClient();
  const { hasModule, isSuperAdmin, sessionExpired, initialized, authz } = usePermissions();
  const isAdmin = isSuperAdmin();
  // Codex 019dd818 iter-7 (B-prime PR-2b): sessionExpired durumunda canEdit
  // false olur — kullanıcı authn unknown'ı authz deny gibi görmesin. Shell
  // toast 'Oturum yenile' CTA gösterir; burada kontrolleri disabled tutmak yeterli.
  //
  // iter-35c — loading-state fallback. Live capture (Playwright on
  // testai.acik.com) showed the drawer mounting before the
  // PermissionProvider authz fetch settled. Pre-fix the gate flipped to
  // disabled (authz=null → isSuperAdmin=false → canEdit=false) and the
  // user was stuck staring at cursor:not-allowed checkboxes even though
  // /authz/me was about to return superAdmin:true. Backend is always the
  // final authority on the assignment write, so the safer default while
  // authz is still loading is "interactive" — once authz lands, the
  // existing gate kicks in.
  const authzReady = initialized && authz != null;
  const canEdit = !sessionExpired && (!authzReady || isAdmin || hasModule('USER_MANAGEMENT'));

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
  // iter-37 — role list search. Only renders when there are >6 roles
  // (below that threshold the list is readable as-is).
  const [roleSearch, setRoleSearch] = useState('');

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

  // Codex 019ddd5b iter-36: do NOT silently fall back to a single legacy role
  // when the assignment endpoint fails. The pre-iter-36 catch returned a
  // partial list ([fallbackRoleId]); if the user then changed scope and hit
  // Save, the assignment write replaced the real role set with that fallback
  // — silent data loss. We now let the query expose its error state so the
  // drawer can disable Save and show a banner. Fallback is reserved for the
  // genuine "no assignments yet" 404 response (handled below).
  const userRolesQuery = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      const res = await api.get(`/v1/authz/users/${user!.id}/roles`);
      const rows = (res.data as Array<{ roleId: number }>) ?? [];
      return rows.map((r) => r.roleId);
    },
    enabled: open && !!user,
    retry: 1,
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

  // User's current scope assignments.
  //
  // Codex 019ddd5b iter-36: removed the silent catch that turned a 5xx into
  // an "empty scope" response. Pre-iter-36 a transient failure here would
  // initialize the four scope state arrays to []; if the user then ticked a
  // role and hit Save, the assignment write would broadcast a payload of
  // ALL-EMPTY scopes and blow away whatever access the user actually had.
  // The error now propagates to React Query's error state so the drawer
  // can block Save and surface a banner.
  const userScopesQuery = useQuery({
    queryKey: ['user-scopes', user?.id],
    queryFn: async () => {
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
    },
    enabled: open && !!user,
    retry: 1,
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

  // Codex 019ddd5b iter-36 — P0 Save Safety derivation.
  //
  // assignmentLoadError: true if the queries that seed the *initial selection*
  // failed. Saving while this is true would persist a partially-known state
  // and silently revoke the parts that never loaded. We block Save and
  // surface a banner offering a retry. master-data list queries are not in
  // the gate — those only affect what's renderable, not what's persisted.
  const assignmentLoadError = userRolesQuery.isError || userScopesQuery.isError;
  const assignmentLoading =
    userRolesQuery.isLoading || userScopesQuery.isLoading || rolesQuery.isLoading;

  const retryAssignmentLoad = useCallback(() => {
    userRolesQuery.refetch();
    userScopesQuery.refetch();
    rolesQuery.refetch();
  }, [userRolesQuery, userScopesQuery, rolesQuery]);

  const handleSave = () => {
    if (assignmentLoadError) return; // defensive: button is also disabled
    assignMutation.mutate();
  };

  // Dirty close guard. ESC, backdrop, and the explicit Cancel button all funnel
  // through this. Pre-iter-36 the user could lose unsaved role/scope changes
  // by hitting ESC; the design-system DetailDrawer wires useEscapeKey to its
  // onClose, so wrapping onClose at this layer is enough.
  const handleClose = useCallback(() => {
    if (dirty) {
      const ok =
        typeof window !== 'undefined' ? window.confirm(t('users.detail.dirtyCloseConfirm')) : true;
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose, t]);

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
  // iter-37 — filter the role list against the search query. Match against
  // both the human-readable label and the raw identifier.
  const filteredRoles = roleSearch.trim()
    ? roles.filter((r) => {
        const q = roleSearch.trim().toLocaleLowerCase('tr-TR');
        const meta = resolveRoleMeta(r.name, locale);
        return (
          r.name.toLocaleLowerCase('tr-TR').includes(q) ||
          meta.label.toLocaleLowerCase('tr-TR').includes(q) ||
          meta.description.toLocaleLowerCase('tr-TR').includes(q)
        );
      })
    : roles;
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
  //
  // 2026-05-04 Session 37 UX fix (kullanıcı feedback: "şirket depo proje
  // gibi eklenen data yetkileri varsayılan listenenler yetki verişlenler
  // olsun liste çok uzun kilitleniyor multi filter gibi çalışsın"):
  // - Default mode: SADECE atanmış (selected) items render edilir → büyük
  //   master-data listelerinde (yüzlerce şirket) drawer açılışı hızlanır.
  // - Toggle: "Sadece atanmış / Hepsini göster" — admin yetki ekleme
  //   moduna geçince tümü görünür.
  // - Search + assigned-only filter combine eder (multi-filter pattern).
  // - Render limit (DEFAULT_DISPLAY_LIMIT = 100): tümü modda + arama yoksa
  //   ilk 100 item; "Daha fazla göster" buton ile genişletilir.
  // - "Tümünü Seç" davranışı korunur (TÜM dataset toggle).
  const DEFAULT_DISPLAY_LIMIT = 100;
  const ScopePickerSection: React.FC<{
    items: ScopeEntity[];
    selected: number[];
    setter: React.Dispatch<React.SetStateAction<number[]>>;
  }> = ({ items, selected, setter }) => {
    const [search, setSearch] = React.useState('');
    const [showOnlySelected, setShowOnlySelected] = React.useState(true);
    const [displayLimit, setDisplayLimit] = React.useState(DEFAULT_DISPLAY_LIMIT);
    const q = search.trim().toLocaleLowerCase('tr-TR');

    // Multi-filter: assigned-only + search combine
    const filtered = React.useMemo(() => {
      const base = showOnlySelected ? items.filter((i) => selected.includes(i.id)) : items;
      if (!q) return base;
      return base.filter(
        (i) =>
          (i.name ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
          (i.code ?? '').toLocaleLowerCase('tr-TR').includes(q),
      );
    }, [items, selected, showOnlySelected, q]);

    // Performance: render limit (büyük listeler kilitlenmesin)
    const displayed = filtered.slice(0, displayLimit);
    const hasMore = filtered.length > displayLimit;

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
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDisplayLimit(DEFAULT_DISPLAY_LIMIT);
              }}
              placeholder={t('users.detail.scopes.searchPlaceholder')}
              className="w-full rounded border border-border-subtle bg-surface-default px-3 py-1.5 text-sm placeholder:text-text-subtle focus:border-border-default focus:outline-none"
              data-testid="scope-search-input"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <Checkbox
                label={t('users.detail.scopes.assignedOnly')}
                checked={showOnlySelected}
                onChange={(checked) => {
                  setShowOnlySelected(checked);
                  setDisplayLimit(DEFAULT_DISPLAY_LIMIT);
                }}
              />
              <span className="text-text-subtle font-mono" data-testid="scope-count-badge">
                {t('users.detail.scopes.countBadge', {
                  shown: filtered.length,
                  total: items.length,
                  selected: selected.length,
                })}
              </span>
            </div>
          </div>
        )}
        {items.length > 1 && !showOnlySelected && (
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
        {!q && showOnlySelected && filtered.length === 0 && (
          <p className="text-xs text-text-subtle italic">
            {t('users.detail.scopes.assignedEmpty')}
          </p>
        )}
        {displayed.map((item) => (
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
        {hasMore && (
          <button
            type="button"
            onClick={() => setDisplayLimit(displayLimit + DEFAULT_DISPLAY_LIMIT)}
            className="mt-1 self-start rounded border border-border-subtle bg-surface-muted px-3 py-1 text-xs text-text-subtle hover:bg-surface-default"
            data-testid="scope-show-more"
          >
            {t('users.detail.scopes.showMore', {
              remaining: filtered.length - displayLimit,
            })}
          </button>
        )}
      </div>
    );
  };

  // Backward-compat wrapper so existing scopeTabs entries keep their shape.
  const scopeCheckboxList = (
    items: ScopeEntity[],
    selected: number[],
    setter: React.Dispatch<React.SetStateAction<number[]>>,
  ) => <ScopePickerSection items={items} selected={selected} setter={setter} />;

  // iter-39 — tab labels carry "(N seçili)" badges so the admin sees scope
  // selection state without opening every tab. Reads from the controlled
  // selection state (not the master-data list) since that's the user's
  // actual access surface.
  const tabLabel = (baseKey: string, selectedCount: number) =>
    selectedCount > 0 ? `${t(baseKey)} (${selectedCount})` : t(baseKey);

  const scopeTabs = [
    {
      key: 'companies',
      label: tabLabel('users.detail.scopes.companies', selectedCompanyIds.length),
      content: scopeCheckboxList(companies, selectedCompanyIds, setSelectedCompanyIds),
    },
    {
      key: 'projects',
      label: tabLabel('users.detail.scopes.projects', selectedProjectIds.length),
      content: scopeCheckboxList(projects, selectedProjectIds, setSelectedProjectIds),
    },
    {
      key: 'warehouses',
      label: tabLabel('users.detail.scopes.warehouses', selectedWarehouseIds.length),
      content: scopeCheckboxList(warehouses, selectedWarehouseIds, setSelectedWarehouseIds),
    },
    {
      key: 'branches',
      label: tabLabel('users.detail.scopes.branches', selectedBranchIds.length),
      content: scopeCheckboxList(branches, selectedBranchIds, setSelectedBranchIds),
    },
  ];

  // Codex 019ddd5b iter-36 — sticky footer via DetailDrawer.footer slot.
  // Pre-iter-36 the actions sat inside the scrollable body so users had to
  // scroll past every role/scope to reach Save. The design-system
  // DetailDrawer already exposes a sticky footer slot; we just feed it.
  const dirtyCount =
    selectedRoleIds.length !== (userRolesQuery.data ?? []).length ||
    selectedRoleIds.some((id) => !(userRolesQuery.data ?? []).includes(id))
      ? 1
      : 0;
  const saveLabel = dirty ? t('users.detail.save.scope') : t('users.detail.save.scope');
  const saveDisabled =
    !dirty ||
    assignMutation.isPending ||
    selectedRoleIds.length === 0 ||
    assignmentLoadError ||
    assignmentLoading;

  const drawerFooter = canEdit ? (
    <div className="flex flex-col gap-2">
      {dirty && (
        <p className="text-xs text-text-subtle italic" data-testid="drawer-dirty-hint">
          {t('users.detail.dirtyHint')}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
        >
          {t('users.detail.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveDisabled}
          title={
            assignmentLoadError
              ? t('users.detail.loadError.body')
              : selectedRoleIds.length === 0
                ? t('users.detail.noRolesWarning')
                : undefined
          }
          className="rounded-xl bg-action-primary px-4 py-2 text-sm font-semibold text-action-primary-text shadow-xs hover:opacity-90 disabled:opacity-50"
          data-testid="drawer-save-button"
        >
          {assignMutation.isPending ? t('users.detail.saving') : saveLabel}
        </button>
      </div>
    </div>
  ) : undefined;
  // dirtyCount currently used only for analytics future work; suppress lint.
  void dirtyCount;

  return (
    <FormDrawer
      open={open}
      onClose={handleClose}
      title={user.fullName}
      subtitle={user.email}
      leading={
        <Avatar
          // Codex 019dddf4 iter-43 — initial-circle avatar in drawer
          // header. size="lg" (48px) gives strong visual hierarchy
          // anchor without dominating the title text. Image src can be
          // wired in a follow-up if/when user profile pictures land.
          initials={getInitials({
            fullName: user.fullName,
            email: user.email,
          })}
          size="lg"
          alt={user.fullName}
          aria-hidden="true"
        />
      }
      footer={drawerFooter}
      size="md"
    >
      <div className="flex flex-col gap-6">
        {/* iter-36 — initial-load failure banner. When the assignment queries
            fail the drawer would otherwise render with empty selections AND
            an enabled Save button, allowing the user to wipe access by
            mistake. We block Save (above) and explain why here. */}
        {assignmentLoadError && (
          <div
            className="rounded-2xl border border-state-danger-border bg-state-danger-bg p-4 text-sm"
            data-testid="drawer-load-error-banner"
          >
            <p className="font-semibold text-state-danger-text">
              {t('users.detail.loadError.title')}
            </p>
            <p className="mt-1 text-state-danger-text">{t('users.detail.loadError.body')}</p>
            <button
              type="button"
              onClick={retryAssignmentLoad}
              className="mt-3 rounded-xl border border-state-danger-border bg-surface-default px-3 py-1.5 text-xs font-semibold text-state-danger-text hover:bg-state-danger-bg"
              data-testid="drawer-load-error-retry"
            >
              {t('users.detail.loadError.retry')}
            </button>
          </div>
        )}

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

        {/* iter-37/iter-39 Roles section — search + human-readable labels +
            count badge + skeleton. Pre-iter-37 we rendered raw
            UPPER_SNAKE_CASE for 16 roles. Codex 019ddd5b: subtitle avoids
            overpromising. iter-39: header carries a "N atanmış / M toplam"
            badge so admins see selection state at a glance, and skeleton
            placeholders appear while rolesQuery is in flight. */}
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">
              {t('users.detail.section.roles')}
            </h3>
            {!rolesQuery.isLoading && roles.length > 0 && (
              <span
                className="text-xs font-medium text-text-subtle"
                data-testid="roles-count-badge"
              >
                {t('users.detail.roles.count', {
                  selected: selectedRoleIds.length,
                  total: roles.length,
                })}
              </span>
            )}
          </div>
          <p className="text-xs text-text-subtle mt-1">
            {t('users.detail.section.roles.subtitle')}
          </p>
          {roles.length > 6 && (
            <input
              type="search"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder={t('users.detail.roles.searchPlaceholder')}
              className="mt-3 w-full rounded border border-border-subtle bg-surface-default px-3 py-1.5 text-sm placeholder:text-text-subtle focus:border-border-default focus:outline-none"
              data-testid="roles-search-input"
            />
          )}
          <div className="mt-3 flex flex-col gap-2">
            {rolesQuery.isLoading && (
              <div data-testid="roles-skeleton" className="flex flex-col gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
            {filteredRoles.map((role) => {
              const meta = resolveRoleMeta(role.name, locale);
              return (
                <Checkbox
                  key={role.id}
                  label={
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-text-primary">
                        {meta.label}
                        {meta.label !== role.name && (
                          <span className="ml-2 font-mono text-xs text-text-subtle">
                            ({role.name})
                          </span>
                        )}
                      </span>
                      {meta.description && (
                        <span className="text-xs text-text-subtle">{meta.description}</span>
                      )}
                    </div>
                  }
                  checked={selectedRoleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                  disabled={!canEdit}
                />
              );
            })}
            {roleSearch && filteredRoles.length === 0 && roles.length > 0 && (
              <span className="text-xs text-text-subtle italic">
                {t('users.detail.roles.searchEmpty', { query: roleSearch })}
              </span>
            )}
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
            {t('users.detail.section.scopes.subtitle')}
          </p>
          <div className="mt-3">
            <Tabs items={scopeTabs} variant="line" size="sm" />
          </div>
        </section>

        {/* iter-36 — footer moved to FormDrawer.footer slot above (sticky). */}
      </div>
    </FormDrawer>
  );
};

export default UserDetailDrawer;
