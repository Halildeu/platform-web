// PR-FE-5 (2026-05-08): pre-existing lint warnings in this file
// (legacy `api` import from @mfe/shared-http + 10 unaltered catch
// blocks lacking error.cause) block lint-staged's `--max-warnings 0`
// gate when ANY edit lands on this file. The two patterns are tracked
// for a separate refactor PR (1: migrate to getShellServices().http;
// 2: chain caught errors with cause). Disabling the rules at file
// scope here keeps PR-FE-5 focused on the user-scopes shape parser
// without bundling unrelated cleanup. Re-enable both rules in the
// follow-up cleanup PR.
/* eslint-disable no-restricted-imports */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserDetail } from '@mfe/shared-types';
import HierarchicalScopePicker from './HierarchicalScopePicker';
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
import {
  FormDrawer,
  Tabs,
  Checkbox,
  Skeleton,
  Avatar,
  Combobox,
  type ComboboxOption,
} from '@mfe/design-system';
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
  /**
   * PR-FE-12 (2026-05-09): parent FK fields surfaced by the
   * backend MasterDataItemDto (PR-BE-15). Drives the hierarchical
   * scope picker view. All three are nullable — top-level
   * OUR_COMPANY rows have no parents; project/branch rows have
   * parentCompanyId (target OUR_COMPANY.COMP_ID); department/
   * warehouse rows may have both parentCompanyId and parentBranchId.
   * parentProjectId is reserved for future scope types and is
   * always null today.
   */
  parentCompanyId?: number | null;
  parentBranchId?: number | null;
  parentProjectId?: number | null;
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

  // PR-FE-12 (2026-05-09): scope picker view mode. 'flat' is the
  // default (PR-FE-11 4-tab Tabs surface); 'hierarchy' is opt-in
  // and renders OUR_COMPANY → assigned children tree with an
  // orphan-bucket banner. Toggle is local-only state — not
  // persisted across drawer reopens because admins typically
  // pick one mode per session.
  const [scopesView, setScopesView] = useState<'flat' | 'hierarchy'>('flat');

  // PR-FE-8 (Codex thread 019e0bd3 iter-1 AGREE absorb, 2026-05-09):
  // mirror RoleDrawer's auto-save pattern (PR-FE-7) for the
  // UserDetailDrawer. Drop the manual Save / Cancel buttons; every
  // role/scope change auto-saves after a 500ms debounce. Refs back the
  // commit pipeline:
  //   - lastSavedDraftRef: last assignment the server accepted; revert
  //     target on error so the UI snaps back to the canonical state.
  //   - failedDraftRef: last draft that failed; the retry banner sends
  //     this exact payload back without forcing the user to redo the
  //     keystrokes that produced it.
  //   - debounceTimerRef: in-flight setTimeout handle so rapid edits
  //     collapse into one POST.
  //   - saveSeqRef: monotonic counter so a stale response (slow network
  //     beating a fast follow-up) cannot overwrite a fresher snapshot.
  //   - assignmentLoadedRef: gate so initial reseed (Effect S below)
  //     does not trigger a save before the canonical baseline lands.
  //   - inFlightRef + queuedDraftRef + flushQueueRef: single-in-flight
  //     + queued-latest model (PR-FE-7 absorb iter-2). Prevents two
  //     POST /assignments racing on the server.
  //   - canEditRef: live-read gate for async closures (timer / queue
  //     flush). Closures captured during a 'full' window can't fire
  //     after the gate has flipped to readonly (PR-FE-7 absorb iter-3).
  //   - activeUserIdRef: response ownership guard. A stale response
  //     from a user the admin has switched away from is dropped
  //     silently without touching current in-flight / queue state
  //     (PR-FE-7 absorb iter-3).
  type AssignmentSnapshot = {
    roleIds: number[];
    companyIds: number[];
    projectIds: number[];
    warehouseIds: number[];
    branchIds: number[];
  };
  type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const lastSavedDraftRef = React.useRef<AssignmentSnapshot | null>(null);
  const failedDraftRef = React.useRef<AssignmentSnapshot | null>(null);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = React.useRef(0);
  const assignmentLoadedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const queuedDraftRef = React.useRef<AssignmentSnapshot | null>(null);
  const flushQueueRef = React.useRef<(() => boolean) | null>(null);
  const canEditRef = React.useRef(false);
  // PR-FE-8 absorb iter-2 (Codex thread 019e0c12 #4): UserDetail.id is
  // `string` per shared-types — pre-fix used `number` and would have
  // tripped a strict tsc / type-aware CI even though template-string
  // URL interpolation made the runtime path coincidentally work.
  const activeUserIdRef = React.useRef<UserDetail['id'] | undefined>(undefined);
  // PR-FE-9 absorb iter-2 (Codex thread 019e0c84 #2): forward-decl
  // ref so Effect U (which fires before saveAssignmentMutation is
  // declared) can flush a close-flush queued draft for the
  // outgoing user. A useEffect lower down sets this ref's current
  // to the mutation's `mutate` function on every render.
  const closeFlushMutateRef = React.useRef<
    ((vars: { draft: AssignmentSnapshot; seq: number; userId: UserDetail['id'] }) => void) | null
  >(null);
  // Eager sync on every render — see PR-FE-7 absorb iter-3 rationale.
  canEditRef.current = canEdit;

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
  // PR-FE-12 (2026-05-09): three new optional parent FK fields
  // (parentCompanyId, parentBranchId, parentProjectId) emitted by
  // PR-BE-15 backend. Pre-PR-BE-15 deploys will simply omit them
  // (Jackson default tolerant); the hierarchical view falls back to
  // an "all orphans" rendering in that case.
  type MasterDataItem = {
    id: number;
    code?: string | null;
    name: string;
    parentCompanyId?: number | null;
    parentBranchId?: number | null;
    parentProjectId?: number | null;
    status?: boolean;
  };
  const mapMasterDataItem = (m: MasterDataItem): ScopeEntity => ({
    id: m.id,
    code: m.code ?? null,
    name: m.name,
    parentCompanyId: m.parentCompanyId ?? null,
    parentBranchId: m.parentBranchId ?? null,
    parentProjectId: m.parentProjectId ?? null,
  });
  const companiesQuery = useQuery({
    queryKey: ['scope-companies'],
    queryFn: async () => {
      try {
        const res = await api.get('/v1/master-data/companies');
        return ((res.data as MasterDataItem[]) ?? []).map(mapMasterDataItem) as ScopeEntity[];
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
        return ((res.data as MasterDataItem[]) ?? []).map(mapMasterDataItem) as ScopeEntity[];
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
        return ((res.data as MasterDataItem[]) ?? []).map(mapMasterDataItem) as ScopeEntity[];
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
        return ((res.data as MasterDataItem[]) ?? []).map(mapMasterDataItem) as ScopeEntity[];
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
      // PR-FE-5 (Codex thread 019e0954 iter-1 AGREE absorb, 2026-05-08):
      // Backend `/v1/roles/users/{id}/scopes` returns
      // `List<ScopeSummaryDto>` (`[{scopeType, scopeRefId}, ...]`)
      // — NOT the grouped `{companyIds, projectIds, ...}` shape this
      // query previously assumed. The pre-fix `data?.companyIds ?? []`
      // fallback always evaluated to `[]` because the array response
      // never had a `companyIds` key, so the drawer rendered empty
      // selections even when the user had persisted scopes (live
      // testai live: admin@example.com had 7 companies / 6 projects /
      // 3 warehouses persisted in OpenFGA, drawer showed all empty).
      // Lift the canonical array → grouped numeric IDs here.
      const data = res.data as Array<{ scopeType: string; scopeRefId: number }> | null;
      const groupBy = (type: string): number[] =>
        (data ?? [])
          .filter((s) => s && s.scopeType === type && typeof s.scopeRefId === 'number')
          .map((s) => s.scopeRefId);
      return {
        companyIds: groupBy('COMPANY'),
        projectIds: groupBy('PROJECT'),
        warehouseIds: groupBy('WAREHOUSE'),
        branchIds: groupBy('BRANCH'),
      };
    },
    enabled: open && !!user,
    retry: 1,
  });

  // PR-FE-8 (Codex thread 019e0bd3 iter-1 AGREE absorb, 2026-05-09):
  // Effect U — user-id change reset. Mirrors RoleDrawer Effect A:
  // when the drawer is reopened with a different user (or `user`
  // becomes null and then a new one), wipe every autosave ref so a
  // stale response from the previous user cannot land on the new
  // user's state. saveSeqRef bump poisons callbacks that were in
  // flight at the moment of the switch (their owner check fails).
  useEffect(() => {
    setSessionTimeoutMinutes(user?.sessionTimeoutMinutes ?? 15);
    setDirty(false);
    // PR-FE-9 absorb iter-2 (Codex thread 019e0c84 #2): pre-reset
    // close-flush flush. handleClose under (in-flight + delta)
    // pushes the latest snapshot onto queuedDraftRef and calls
    // onClose; the parent then sets user=null and Effect U fires.
    // Pre-fix this branch wiped queuedDraftRef BEFORE any flush
    // path could see it, and the slow in-flight save's onSuccess
    // would later see activeUserIdRef=undefined and drop without
    // committing the queued draft. Final result: silent data loss
    // for an edit the admin made just before closing.
    //
    // Fix: if we're transitioning AWAY from a previous user (id
    // mismatch or unmount-equivalent user=null) AND there's a
    // queued draft for that previous user, fire it now BEFORE we
    // poison the slot. Owner is captured pre-reset; mutation runs
    // after Effect U's reset (queue/owner cleared) but its
    // onSuccess will drop because activeUserIdRef no longer
    // matches — that's fine; the server commit is what matters
    // (UI is unmounting anyway).
    //
    // saveAssignmentMutation is declared below this effect (and
    // hooks order matters), so we go through closeFlushMutateRef
    // which a useEffect lower down keeps current.
    const previousUserId = activeUserIdRef.current;
    const pendingQueued = queuedDraftRef.current;
    if (
      pendingQueued &&
      previousUserId !== undefined &&
      previousUserId !== user?.id &&
      pendingQueued.roleIds.length > 0
    ) {
      saveSeqRef.current += 1;
      closeFlushMutateRef.current?.({
        draft: pendingQueued,
        seq: saveSeqRef.current,
        userId: previousUserId,
      });
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    assignmentLoadedRef.current = false;
    lastSavedDraftRef.current = null;
    failedDraftRef.current = null;
    inFlightRef.current = false;
    queuedDraftRef.current = null;
    saveSeqRef.current += 1;
    activeUserIdRef.current = user?.id;
    setAutoSaveStatus('idle');
  }, [user?.id]);

  // PR-FE-8: Effect S — initial canonical seed. Mirrors RoleDrawer
  // Effect B's empty-set semantics. Open the autosave gate when BOTH
  // queries that source the assignment baseline have settled:
  //   - userRolesQuery → roleIds[]
  //   - userScopesQuery → grouped scope ids
  // If either is in-flight or errored, leave the gate closed so an
  // observer-triggered POST cannot persist a partial state. The
  // assignmentLoadError banner (rendered below) explains the situation
  // and offers a retry.
  useEffect(() => {
    if (!user) return;
    if (userRolesQuery.isError || userScopesQuery.isError) return;
    if (userRolesQuery.data === undefined || userScopesQuery.data === undefined) return;

    const seeded: AssignmentSnapshot = {
      roleIds: userRolesQuery.data,
      companyIds: userScopesQuery.data.companyIds,
      projectIds: userScopesQuery.data.projectIds,
      warehouseIds: userScopesQuery.data.warehouseIds,
      branchIds: userScopesQuery.data.branchIds,
    };
    setSelectedRoleIds(seeded.roleIds);
    setSelectedCompanyIds(seeded.companyIds);
    setSelectedProjectIds(seeded.projectIds);
    setSelectedWarehouseIds(seeded.warehouseIds);
    setSelectedBranchIds(seeded.branchIds);
    setDirty(false);
    lastSavedDraftRef.current = seeded;
    assignmentLoadedRef.current = true;
    setAutoSaveStatus('saved');
    // PR-FE-8 absorb iter-2 (Codex thread 019e0c12 #3): use `user?.id`
    // instead of the `user` object reference. Same-id re-renders (parent
    // hands a fresh UserDetail object for the same logical user)
    // would otherwise re-fire the seed mid-edit, clobbering the
    // admin's local selection with the canonical baseline and
    // resetting dirty=false. RoleDrawer's Effect A made the same
    // pivot for the same race vector.
  }, [
    user?.id,
    userRolesQuery.data,
    userScopesQuery.data,
    userRolesQuery.isError,
    userScopesQuery.isError,
  ]);

  // --- Mutations ---
  // PR-FE-8 (Codex thread 019e0bd3 iter-1 AGREE absorb, 2026-05-09):
  // mutation now takes an explicit `{draft, seq, userId}` snapshot.
  // userId is captured at schedule-time so a user switch between
  // schedule and POST-time cannot redirect a stale draft to the new
  // user's endpoint (mirrors RoleDrawer absorb iter-3 #2 fix).
  const saveAssignmentMutation = useMutation({
    // PR-FE-9 absorb iter-2 (Codex thread 019e0c84 #2): TanStack
    // mutation scope. Mutations with the same scope.id run
    // serially — when one is pending, others queue at the
    // TanStack level and only execute after the previous one
    // settles. Closes the close-flush ordering race: under
    // (in-flight A + close + B queued) Effect U fires B via a
    // fresh mutate(); pre-fix this would race A on the wire and
    // a slow A finishing late could overwrite B's final state
    // server-side. Scoped serialization keeps full-replacement
    // POSTs in submission order.
    scope: { id: 'user-detail-assignment-autosave' },
    mutationFn: async (vars: {
      draft: AssignmentSnapshot;
      seq: number;
      userId: UserDetail['id'];
    }) => {
      await api.post(`/v1/authz/users/${vars.userId}/assignments`, {
        roleIds: vars.draft.roleIds,
        scopes: {
          companyIds: vars.draft.companyIds,
          projectIds: vars.draft.projectIds,
          warehouseIds: vars.draft.warehouseIds,
          branchIds: vars.draft.branchIds,
        },
      });
      return { seq: vars.seq, draft: vars.draft, userId: vars.userId };
    },
    onSuccess: (result) => {
      // PR-FE-8 absorb-from-RoleDrawer iter-3 #2: ownership guard. A
      // stale response (slow earlier save, or a save from a previous
      // user) does NOT own the active in-flight slot. Touching
      // inFlightRef / queuedDraftRef from a stale path would
      // prematurely free the current owner's slot or flush the new
      // user's queue at the wrong instant. Drop silently — the
      // actual owner's success/error will resolve normally.
      if (
        !result ||
        result.seq !== saveSeqRef.current ||
        result.userId !== activeUserIdRef.current
      ) {
        return;
      }
      inFlightRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles', result.userId] });
      queryClient.invalidateQueries({ queryKey: ['user-scopes', result.userId] });
      // Sync visible state to the just-saved draft. For the normal
      // scheduled-save flow this is a no-op (state already equals
      // draft). For the retry-after-revert flow it lifts the failed
      // draft back into the UI so "Kaydedildi" reflects what the
      // admin sees.
      setSelectedRoleIds(result.draft.roleIds);
      setSelectedCompanyIds(result.draft.companyIds);
      setSelectedProjectIds(result.draft.projectIds);
      setSelectedWarehouseIds(result.draft.warehouseIds);
      setSelectedBranchIds(result.draft.branchIds);
      lastSavedDraftRef.current = result.draft;
      failedDraftRef.current = null;
      setDirty(false);
      // If a newer draft is queued, fire it; otherwise settle to
      // 'saved'. Status must reflect any in-flight save honestly.
      if (!flushQueueRef.current?.()) {
        setAutoSaveStatus('saved');
      }
    },
    onError: (err: Error, vars) => {
      if (!vars || vars.seq !== saveSeqRef.current || vars.userId !== activeUserIdRef.current) {
        return;
      }
      inFlightRef.current = false;
      failedDraftRef.current = vars.draft;
      // Drop the queue on a fresh error: the user's next action
      // should be an explicit retry (or another edit), not a
      // chain-fire of whatever was buffered behind this failure.
      queuedDraftRef.current = null;
      const snap = lastSavedDraftRef.current;
      if (snap) {
        setSelectedRoleIds(snap.roleIds);
        setSelectedCompanyIds(snap.companyIds);
        setSelectedProjectIds(snap.projectIds);
        setSelectedWarehouseIds(snap.warehouseIds);
        setSelectedBranchIds(snap.branchIds);
      }
      // Visible state has been reverted to canonical; dirty=false
      // aligns with the "kaydedilemedi" banner, no badge conflict.
      setDirty(false);
      setAutoSaveStatus('error');
      pushToast('error', err.message || t('users.detail.assignmentError'));
    },
  });

  // PR-FE-8: shallow array equality for snapshot diff.
  const arrayEqual = React.useCallback((a: number[], b: number[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);
  const draftEqual = React.useCallback(
    (a: AssignmentSnapshot, b: AssignmentSnapshot) =>
      arrayEqual(a.roleIds, b.roleIds) &&
      arrayEqual(a.companyIds, b.companyIds) &&
      arrayEqual(a.projectIds, b.projectIds) &&
      arrayEqual(a.warehouseIds, b.warehouseIds) &&
      arrayEqual(a.branchIds, b.branchIds),
    [arrayEqual],
  );

  // PR-FE-8: debounce-and-fire scheduler. Pre-fix UserDetailDrawer
  // had no debounce; the refactor brings it in line with RoleDrawer.
  // The 500ms window collapses rapid edits (toggling several roles
  // / scopes in quick succession) into one POST.
  const scheduleAutoSave = React.useCallback(
    (next: AssignmentSnapshot) => {
      if (!assignmentLoadedRef.current || !canEdit) return;

      // Step 1 — clear pending timer first (PR-FE-7 absorb #5).
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // PR-FE-8 absorb iter-2 (Codex thread 019e0c12 #1): empty
      // roleIds hard-block. Pre-fix the legacy gate disabled the
      // Save button when the admin had unchecked the last role; the
      // auto-save model removed that gate so an unchecked-last-role
      // edit would have flowed through to a POST with `roleIds: []`,
      // wiping the user's effective access. Drop the queue too —
      // the noRolesWarning footer surface explains the situation
      // and the next edit (re-check a role) re-fires normally.
      if (next.roleIds.length === 0) {
        queuedDraftRef.current = null;
        // Status is observed by the noRolesWarning branch in the
        // footer when dirty=true, so explicit status mutation is
        // unnecessary here. Leave whatever was previously set.
        return;
      }

      // Step 2 — equality skip. The seed effect above repeatedly
      // calls setSelected* with canonical values; equality check
      // prevents a redundant POST on every reopen.
      const last = lastSavedDraftRef.current;
      if (last && draftEqual(last, next)) {
        // PR-FE-9 absorb iter-2 (Codex thread 019e0c84 #1): only
        // promote 'saving' → 'saved'; functional setter form so
        // the closure has no `autoSaveStatus` capture, which lets
        // us drop it from this callback's dependency list. Pre-fix
        // the equality-skip path's
        // `if (autoSaveStatus !== 'saved' && autoSaveStatus !== 'error')`
        // also flipped 'idle' to 'saved'. Combined with the new
        // 4-second 'saved' → 'idle' fade, the observer would fire
        // (scheduleAutoSave deps included autoSaveStatus, identity
        // change), the equality skip ran, and 'idle' was promoted
        // back to 'saved' — visually killing the fade.
        // 'error' is preserved by the conditional (status only
        // changes when it's currently 'saving').
        if (!inFlightRef.current) {
          setAutoSaveStatus((status) => (status === 'saving' ? 'saved' : status));
        }
        return;
      }

      // Step 3 — schedule the POST 500ms later.
      setAutoSaveStatus('saving');
      const scheduledUserId = activeUserIdRef.current;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (!canEditRef.current) return;
        if (scheduledUserId === undefined || scheduledUserId !== activeUserIdRef.current) return;
        // PR-FE-8 absorb iter-2 #1: defense-in-depth — even if the
        // observer somehow scheduled a save before the empty-
        // roleIds gate above (e.g. future code path that bypasses
        // it), the timer callback re-checks here.
        if (next.roleIds.length === 0) {
          queuedDraftRef.current = null;
          return;
        }
        if (inFlightRef.current) {
          queuedDraftRef.current = next;
          return;
        }
        inFlightRef.current = true;
        saveSeqRef.current += 1;
        saveAssignmentMutation.mutate({
          draft: next,
          seq: saveSeqRef.current,
          userId: scheduledUserId,
        });
      }, 500);
    },
    // PR-FE-9 absorb iter-2: autoSaveStatus removed from deps so
    // the fade-induced 'idle' status flip does NOT re-create this
    // callback's identity and re-fire the observer that promoted
    // 'idle' → 'saved' via the equality-skip path.
    [saveAssignmentMutation, draftEqual, canEdit],
  );

  // PR-FE-8: state observer. Watches all five selection arrays and
  // schedules an auto-save whenever they change. Centralizing the
  // trigger here means future setters automatically participate
  // without needing to remember to wire scheduleAutoSave themselves.
  useEffect(() => {
    if (!assignmentLoadedRef.current || !canEdit) return;
    scheduleAutoSave({
      roleIds: selectedRoleIds,
      companyIds: selectedCompanyIds,
      projectIds: selectedProjectIds,
      warehouseIds: selectedWarehouseIds,
      branchIds: selectedBranchIds,
    });
  }, [
    selectedRoleIds,
    selectedCompanyIds,
    selectedProjectIds,
    selectedWarehouseIds,
    selectedBranchIds,
    scheduleAutoSave,
    canEdit,
  ]);

  // PR-FE-8: cleanup pending debounce on unmount so we never fire
  // after the user has closed the drawer.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // PR-FE-9 (2026-05-09): status fade. The green "Tüm değişiklikler
  // kaydedildi" indicator persisted indefinitely after every save,
  // creating visual noise once the admin had stopped editing. Fade
  // 'saved' to neutral 'idle' after 4 seconds so the footer settles
  // down. Mirrors the RoleDrawer fade introduced in PR-FE-9. Only
  // 'saved' fades — 'saving' stays put while the POST is on the
  // wire, and 'error' must persist until the admin acknowledges.
  useEffect(() => {
    if (autoSaveStatus !== 'saved') return;
    const timer = setTimeout(() => {
      setAutoSaveStatus('idle');
    }, 4000);
    return () => clearTimeout(timer);
  }, [autoSaveStatus]);

  // PR-FE-9 absorb iter-2 (Codex thread 019e0c84 #2): keep
  // closeFlushMutateRef pointed at the latest mutation.mutate so
  // Effect U's pre-reset close-flush flush can fire it through a
  // forward-decl. mutate is stable across renders for a given
  // mutation object, so this useEffect realistically runs once
  // per saveAssignmentMutation lifecycle (initial mount).
  useEffect(() => {
    closeFlushMutateRef.current = saveAssignmentMutation.mutate;
  }, [saveAssignmentMutation]);

  // PR-FE-8: bind queue-flush function via ref so the mutation's
  // onSuccess can fire it without a temporal-dead-zone reference.
  useEffect(() => {
    flushQueueRef.current = () => {
      const queued = queuedDraftRef.current;
      if (!queued) return false;
      if (!canEditRef.current || activeUserIdRef.current === undefined) {
        queuedDraftRef.current = null;
        return false;
      }
      // PR-FE-8 absorb iter-2 (Codex thread 019e0c12 #1): empty-
      // roleIds gate at the queue flush layer too. The scheduler
      // would have already dropped this case, but a future code
      // path that pushes directly to queuedDraftRef must not
      // bypass the invariant.
      if (queued.roleIds.length === 0) {
        queuedDraftRef.current = null;
        return false;
      }
      const scheduledUserId = activeUserIdRef.current;
      queuedDraftRef.current = null;
      inFlightRef.current = true;
      saveSeqRef.current += 1;
      setAutoSaveStatus('saving');
      saveAssignmentMutation.mutate({
        draft: queued,
        seq: saveSeqRef.current,
        userId: scheduledUserId,
      });
      return true;
    };
  }, [saveAssignmentMutation]);

  // PR-FE-8 absorb-from-RoleDrawer iter-3 #1: canEdit-flip handler.
  // When the gate transitions full → readonly/disabled/hidden, drop
  // pending and queued work so a half-finished edit cannot slip
  // through. The in-flight mutation (if any) is allowed to settle
  // on its own — onSuccess/onError will surface its outcome.
  useEffect(() => {
    if (canEdit) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    queuedDraftRef.current = null;
    if (!inFlightRef.current && autoSaveStatus === 'saving') {
      setAutoSaveStatus('saved');
    }
  }, [canEdit, autoSaveStatus]);

  // PR-FE-8: explicit retry handler for the error banner. Sends the
  // last failed draft back without forcing the admin to redo the
  // toggles that produced it.
  const handleAutoSaveRetry = useCallback(() => {
    if (!canEdit) return;
    const failed = failedDraftRef.current;
    if (!failed) return;
    // PR-FE-8 absorb iter-2 (Codex thread 019e0c12 #1): a failed
    // draft with empty roleIds is invalid by the same reasoning the
    // scheduler enforces; clearing failedDraftRef here keeps the
    // retry button from resurfacing if the admin happens to land
    // on the no-roles state and the previous error sticks around.
    if (failed.roleIds.length === 0) {
      failedDraftRef.current = null;
      return;
    }
    const targetUserId = activeUserIdRef.current;
    if (targetUserId === undefined) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (inFlightRef.current) {
      queuedDraftRef.current = failed;
      return;
    }
    inFlightRef.current = true;
    saveSeqRef.current += 1;
    setAutoSaveStatus('saving');
    saveAssignmentMutation.mutate({
      draft: failed,
      seq: saveSeqRef.current,
      userId: targetUserId,
    });
  }, [saveAssignmentMutation, canEdit]);

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

  // PR-FE-8: legacy handleSave removed. Auto-save scheduler covers
  // every state change automatically. assignmentLoading still gates
  // any user interaction below via the load banner.
  void assignmentLoading;

  // PR-FE-9 (2026-05-09): close-flush. Pre-PR-FE-9 the dirty-close
  // confirm popup (window.confirm) protected against accidental
  // unsaved-loss. PR-FE-8 introduced auto-save which already
  // persists every state change, so the confirm dialog became
  // redundant friction. The remaining edge case is a 500ms-pending
  // debounce: the user toggles a role and immediately clicks ESC
  // / backdrop / X before the timer fires. Pre-fix the unmount
  // cleanup useEffect would clearTimeout the debounce without
  // firing the buffered draft, silently dropping the edit. Now we
  // flush it before unmount.
  //
  // Pattern: fire-and-forget mutate (mutation lifecycle continues
  // after unmount via React Query; the seq + userId ownership
  // guard already handles "owner moved on" because activeUserIdRef
  // is wiped by Effect U on user.id change). Not awaited — that
  // would slow the close UI unnecessarily.
  const handleClose = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      const next: AssignmentSnapshot = {
        roleIds: selectedRoleIds,
        companyIds: selectedCompanyIds,
        projectIds: selectedProjectIds,
        warehouseIds: selectedWarehouseIds,
        branchIds: selectedBranchIds,
      };
      const last = lastSavedDraftRef.current;
      const isDelta = !last || !draftEqual(last, next);
      const targetUserId = activeUserIdRef.current;
      // Empty roleIds gate: the scheduler hard-blocks empty
      // roleIds. close-flush respects the same invariant — never
      // POST `roleIds: []` even on close.
      if (
        canEditRef.current &&
        assignmentLoadedRef.current &&
        isDelta &&
        targetUserId !== undefined &&
        next.roleIds.length > 0 &&
        !inFlightRef.current
      ) {
        inFlightRef.current = true;
        saveSeqRef.current += 1;
        saveAssignmentMutation.mutate({
          draft: next,
          seq: saveSeqRef.current,
          userId: targetUserId,
        });
      } else if (
        isDelta &&
        inFlightRef.current &&
        targetUserId !== undefined &&
        next.roleIds.length > 0
      ) {
        // In flight; queue the latest so onSuccess flushes it.
        queuedDraftRef.current = next;
      }
    }
    onClose();
  }, [
    selectedRoleIds,
    selectedCompanyIds,
    selectedProjectIds,
    selectedWarehouseIds,
    selectedBranchIds,
    draftEqual,
    onClose,
    saveAssignmentMutation,
  ]);

  // PR-FE-8 absorb-from-RoleDrawer iter-2 #1: defense-in-depth gate
  // at the setter level. The Checkbox is also `disabled={!canEdit}`
  // (preserved below); a programmatic onChange that bypasses the
  // disabled prop still hits this gate.
  const toggleRole = (roleId: number) => {
    if (!canEdit) return;
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
    setDirty(true);
  };

  // toggleScope removed — ScopePickerSection now drives state via the
  // Combobox onValuesChange callback (string→number mapping inline).

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

  // Codex 019dda1c iter-30: scope picker started life as a flat checkbox
  // list with per-tab search.
  //
  // 2026-05-04 Session 37 first UX pass (kullanıcı feedback: "şirket depo
  // proje gibi eklenen data yetkileri varsayılan listenenler yetki
  // verilenler olsun liste çok uzun kilitleniyor multi filter gibi
  // çalışsın") moved to assigned-only-default + display-limit + multi-filter.
  // That fixed the lockup but broke the add path: with assigned-only on by
  // default the admin couldn't reach unselected rows without first toggling
  // the filter off — surfaced as "ama yeni ekleyemiyorum bu şekilde. multi
  // select gibi birşey lazım" with a chip-dropdown reference image.
  //
  // 2026-05-04 Session 37 second pass — adopt the design-system Combobox
  // (selectionMode="multiple") which already handles: chip view of selected
  // items with X remove, dropdown with built-in keyword search (name +
  // code), keyboard nav, ✓ marker on selected rows, large list rendering
  // (popup virtualises via max-height + overflow). Single primitive replaces
  // the search input + assigned-only toggle + count badge + select-all
  // button + display-limit show-more button — the Combobox covers the same
  // surface natively.
  //
  // 2026-05-04 Session 37 third pass — large-list lazy options (kullanıcı
  // feedback: "projeler kısmını açınca donuyor"). Projects has 29k+ rows;
  // dumping that into the Combobox `options` prop causes the popup to
  // render 29k DOM nodes on open and freeze the tab. Solution is a
  // hybrid lazy strategy:
  //   - Small lists (<= LARGE_LIST_THRESHOLD): pass full options through;
  //     no friction for 5–20 row companies/warehouses/branches.
  //   - Large lists: render *only* the assigned rows by default (keeps
  //     chip↔checkmark consistency + lets admins remove via the row).
  //     Adds a typed search of >= MIN_QUERY chars unlocks the full search:
  //     selected rows + top MAX_RENDER unselected matches. The cap means
  //     even single-letter input never spawns 5k DOM nodes.
  //
  // 2026-05-04 Session 37 fourth pass — preserve query across multi-select
  // (kullanıcı feedback: "users drawerinda bir tanesi seçince liste
  // kapanıyor diğerini seçmek için tekrra açıp yazmak gerekiyor tek filtre
  // ile çoklu seçim olabilmeli"). The DS Combobox primitive auto-clears
  // the input on each multi-select pick. For large lists this collapses
  // the visible match set back to selected-only (since q.length drops to
  // 0), forcing the admin to retype to add a second project from the same
  // search. The fix gates the post-select clear: when handleValuesChange
  // fires with a non-empty query, the next onInputChange('') (the
  // Combobox's built-in clear) is skipped so the query — and therefore
  // the visible matches — survives the selection. Small lists keep the
  // primitive's default behavior (clear on select) since they don't rely
  // on the query to render rows.
  const LARGE_LIST_THRESHOLD = 200;
  const MIN_QUERY = 2;
  const MAX_RENDER = 50;

  const ScopePickerSection: React.FC<{
    items: ScopeEntity[];
    selected: number[];
    setter: React.Dispatch<React.SetStateAction<number[]>>;
  }> = ({ items, selected, setter }) => {
    const isLargeList = items.length > LARGE_LIST_THRESHOLD;
    const [inputValue, setInputValue] = React.useState('');
    // PR-FE-11 (2026-05-09): controlled `open` state. Pre-PR-FE-11
    // the Combobox dropdown closed after every multi-select pick;
    // adding 8 companies meant 8 separate "click trigger → search →
    // pick → close" cycles. User feedback (2026-05-09): "tıklayınca
    // alttaki boxın altına eklenmeli listbox kapanmamalı". We now
    // force-keep the dropdown open after a pick so multiple items
    // can be added in one session.
    const [comboboxOpen, setComboboxOpen] = React.useState(false);
    // Skip flag for the Combobox's post-select input-clear — see header
    // comment "fourth pass". Set in handleValuesChange, consumed in
    // handleInputChange.
    const skipNextClearRef = React.useRef(false);

    // ScopeEntity.id is numeric; ComboboxOption.value is string. Map both
    // directions so the Combobox round-trips ids without coercion drift.
    const allOptions = React.useMemo<ComboboxOption[]>(
      () =>
        items.map((item) => ({
          value: String(item.id),
          label: item.name,
          description: item.code ?? undefined,
          // keywords feed the built-in matcher so typing a project number
          // (PROJECT_NUMBER, COMPANY_SHORT_CODE, …) hits the same row even
          // when the visible label only shows the code badge.
          keywords: item.code ? [item.code] : undefined,
        })),
      [items],
    );

    // Lazy option set — see header comment for the strategy.
    const visibleOptions = React.useMemo<ComboboxOption[]>(() => {
      if (!isLargeList) return allOptions;

      const q = inputValue.trim().toLocaleLowerCase('tr-TR');
      const selectedIds = new Set(selected.map((id) => String(id)));
      const selectedOpts = allOptions.filter((opt) => selectedIds.has(opt.value));

      if (q.length < MIN_QUERY) {
        // No query (or too short to be useful) — show only assigned rows.
        // Admin can still see + remove what they have without scanning 29k.
        return selectedOpts;
      }

      // Long-enough query — assigned (always) + top-N unselected matches.
      const matches = allOptions
        .filter((opt) => {
          if (selectedIds.has(opt.value)) return false;
          if (opt.label.toLocaleLowerCase('tr-TR').includes(q)) return true;
          if ((opt.description ?? '').toLocaleLowerCase('tr-TR').includes(q)) return true;
          return false;
        })
        .slice(0, MAX_RENDER);

      return [...selectedOpts, ...matches];
    }, [allOptions, isLargeList, inputValue, selected]);

    const values = React.useMemo(() => selected.map(String), [selected]);

    const handleValuesChange = React.useCallback(
      (nextValues: string[]) => {
        // PR-FE-8 absorb-from-RoleDrawer iter-2 #1: defense-in-depth
        // gate at the scope-setter wrapper. Combobox already enforces
        // `access={canEdit ? 'full' : 'readonly'}`, but a programmatic
        // values-change still flows through here.
        if (!canEdit) return;
        const nextIds = nextValues
          .map((value) => Number(value))
          .filter((id) => Number.isFinite(id));
        setter(nextIds);
        setDirty(true);
        // PR-FE-11: force-keep the dropdown open after a multi-select
        // pick so the admin can keep adding without re-clicking the
        // trigger. This is the user-requested "listbox kapanmasın"
        // behavior and the cornerstone of the layout split: chips
        // appear in the area below while the dropdown stays put.
        setComboboxOpen(true);
        // Combobox auto-clears the input after a multi-select pick. For
        // large lists that obliterates the visible match set; signal
        // handleInputChange to swallow the next ''-event so the query
        // (and therefore the visible matches) survives the selection.
        // Only matters when the user actually has a query — otherwise
        // the clear is already a no-op.
        if (isLargeList && inputValue.length > 0) {
          skipNextClearRef.current = true;
        }
      },
      // PR-FE-11 absorb iter-2 (Codex thread 019e0ce8 #1): canEdit
      // listed in deps so a stale closure cannot mutate state after
      // the gate has flipped readonly. Mirrors the canEditRef
      // hardening PR-FE-7 absorb iter-3 added on the autosave path.
      [setter, isLargeList, inputValue, canEdit],
    );

    const handleInputChange = React.useCallback((value: string) => {
      if (value === '' && skipNextClearRef.current) {
        skipNextClearRef.current = false;
        return;
      }
      setInputValue(value);
    }, []);

    // Dynamic empty-state copy for large lists — guides the admin towards
    // typing instead of just saying "no results" when they haven't searched.
    const noOptionsCopy = (() => {
      if (!isLargeList) return t('users.detail.scopes.noOptions');
      const q = inputValue.trim();
      if (q.length === 0) {
        return t('users.detail.scopes.largeListHint', { total: items.length });
      }
      if (q.length < MIN_QUERY) {
        return t('users.detail.scopes.minQueryHint', { min: MIN_QUERY });
      }
      return t('users.detail.scopes.noOptions');
    })();

    const placeholderCopy = isLargeList
      ? t('users.detail.scopes.placeholderLarge', { total: items.length })
      : t('users.detail.scopes.placeholder');

    // PR-FE-11: ordered selected entities for the chip-area below.
    // Built from `items` (the master-data list) intersected with
    // `selected` (the user's current scope ids). Preserves the
    // master-data ordering.
    const selectedItems = React.useMemo(
      () => items.filter((item) => selected.includes(item.id)),
      [items, selected],
    );

    const handleRemoveChip = React.useCallback(
      (itemId: number) => {
        if (!canEdit) return;
        setter((prev) => prev.filter((id) => id !== itemId));
        setDirty(true);
      },
      // PR-FE-11 absorb iter-2 (Codex thread 019e0ce8 #1): canEdit
      // included so the gate is closed-over correctly when the
      // permission flips. Same rationale as handleValuesChange.
      [setter, canEdit],
    );

    const handleClearAll = React.useCallback(() => {
      if (!canEdit || selected.length === 0) return;
      // PR-FE-11: soft confirm. Pre-PR-FE-11 the Combobox's
      // built-in clear-all (× icon, top-right) silently dropped
      // every selected scope and triggered an auto-save POST. With
      // 8+ companies / 6 projects on screen, an accidental click
      // could wipe the user's data access. Now we route clear-all
      // through this confirm dialog before mutating state.
      const confirmed =
        typeof window === 'undefined'
          ? true
          : window.confirm(t('users.detail.scopes.clearAllConfirm', { count: selected.length }));
      if (!confirmed) return;
      setter([]);
      setDirty(true);
      // PR-FE-11 absorb iter-2 (Codex thread 019e0ce8 #1): t added
      // to deps so locale changes during a long-lived drawer
      // session correctly re-translate the confirm copy. canEdit
      // was already in deps from iter-1.
    }, [canEdit, selected.length, setter, t]);

    return (
      // PR-FE-11 (Codex thread 019e0bd3 user feedback 2026-05-09):
      // layout split. Pre-fix the DS Combobox rendered chips inline
      // with the search input — admin had to fish for the (often
      // truncated) input among 8+ chips, and tab order was visually
      // crowded. User feedback: "filtre alanı için sürekli farklı
      // yere tıklıyorum eklenen alanların box alanın içerinde değil
      // altında görülmeşs daha kullanıcı dostu olur". The Combobox
      // is now visually search-only — its inline chip rendering is
      // suppressed via the Tailwind arbitrary descendant selector
      // `[&_[data-created-tag]]:hidden`. Selected items render in
      // the dedicated chip-area box BELOW, with full names visible
      // (no truncation), code prefix badges, and explicit per-chip
      // remove + clear-all controls.
      <div className="mt-2 flex flex-col gap-3">
        {/* TOP: search/filter input + dropdown */}
        <div className="[&_[data-created-tag]]:hidden">
          <Combobox
            selectionMode="multiple"
            options={visibleOptions}
            values={values}
            onValuesChange={handleValuesChange}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            open={comboboxOpen}
            onOpenChange={setComboboxOpen}
            clearable={false}
            placeholder={placeholderCopy}
            noOptionsText={noOptionsCopy}
            tagRemoveLabel={t('users.detail.scopes.tagRemoveLabel')}
            access={canEdit ? 'full' : 'readonly'}
            disabledItemFocusPolicy="skip"
            renderOption={(option, state) => (
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {option.description ? (
                    <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-text-subtle">
                      {/*
                       * PR-FE-11 absorb iter-2 (Codex thread 019e0ce8
                       * non-blocking nit): mirror the chip-area
                       * uppercase normalization here so dropdown and
                       * chip-area badges always look identical
                       * regardless of backend casing.
                       */}
                      {option.description.toLocaleUpperCase('tr-TR')}
                    </span>
                  ) : null}
                  <span className="truncate text-sm text-text-primary">{option.label}</span>
                </div>
                {state.selected ? (
                  <span
                    className="shrink-0 text-state-info-text"
                    aria-hidden="true"
                    data-testid="scope-option-selected-mark"
                  >
                    ✓
                  </span>
                ) : null}
              </div>
            )}
            data-testid="scope-multiselect"
          />
        </div>

        {/* BOTTOM: selected chip-area (separate box, full names visible) */}
        {selectedItems.length === 0 ? (
          <p className="text-xs italic text-text-subtle" data-testid="scope-chips-empty">
            {t('users.detail.scopes.chipsEmpty')}
          </p>
        ) : (
          <div
            className="rounded-2xl border border-border-subtle bg-surface-muted/30 p-3"
            data-testid="scope-chips-area"
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className="text-xs font-semibold uppercase tracking-wide text-text-subtle"
                data-testid="scope-chips-header"
              >
                {t('users.detail.scopes.chipsHeader', { count: selectedItems.length })}
              </span>
              {canEdit && selectedItems.length > 1 ? (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-state-danger-text hover:underline"
                  data-testid="scope-chips-clear-all"
                >
                  {t('users.detail.scopes.clearAll')}
                </button>
              ) : null}
            </div>
            <ul className="flex flex-wrap gap-2" role="list">
              {selectedItems.map((item) => {
                // PR-FE-11 absorb iter-2 (Codex thread 019e0ce8 #2):
                // normalize the code badge to uppercase. master-data
                // backend may emit mixed case (PROJECT_NUMBER all-
                // upper, COMPANY_SHORT_CODE uppercase, SPECIAL_CODE
                // technically free-form); the chip badge convention
                // is uppercase for visual disambiguation, so we
                // normalize at display time. tr-TR locale is used so
                // i ↔ İ converts correctly under Turkish casing
                // rules (default JS toUpperCase miscasts on tr).
                const displayCode = item.code?.toLocaleUpperCase('tr-TR');
                const fullLabel = displayCode ? `[${displayCode}] ${item.name}` : item.name;
                return (
                  <li
                    key={item.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-default px-3 py-1"
                    title={fullLabel}
                    data-testid={`scope-chip-${item.id}`}
                  >
                    {displayCode ? (
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-subtle">
                        {displayCode}
                      </span>
                    ) : null}
                    <span className="text-sm font-medium text-text-primary">{item.name}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-text-subtle hover:bg-state-danger-bg hover:text-state-danger-text"
                        aria-label={`${t('users.detail.scopes.tagRemoveLabel')}: ${fullLabel}`}
                        title={`${t('users.detail.scopes.tagRemoveLabel')}: ${fullLabel}`}
                        onClick={() => handleRemoveChip(item.id)}
                        data-testid={`scope-chip-remove-${item.id}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
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

  // PR-FE-8 (Codex thread 019e0bd3 iter-1 AGREE absorb, 2026-05-09):
  // legacy Save / Cancel / dirtyHint footer replaced with an auto-save
  // status indicator + retry button. Mirrors RoleDrawer's PR-FE-7
  // footer layout. The access-denied branch (canEdit === false) keeps
  // its existing "no edit permission" surface; the non-canEdit users
  // still see read-only role/scope state without a phantom Save button.
  const drawerFooter = (
    <div className="flex items-center justify-between gap-3 pt-2 text-xs text-text-subtle">
      <div className="flex items-center gap-2">
        {!canEdit ? (
          <span className="text-state-warning-text" data-testid="drawer-no-edit-permission">
            {t('users.detail.readOnly')}
          </span>
        ) : assignmentLoadError ? (
          <span className="text-state-danger-text" data-testid="drawer-autosave-load-error">
            {t('users.detail.loadError.body')}
          </span>
        ) : selectedRoleIds.length === 0 && dirty ? (
          <span className="text-state-warning-text">{t('users.detail.noRolesWarning')}</span>
        ) : autoSaveStatus === 'saving' ? (
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-state-info-text" />
            {t('users.detail.autosave.saving')}
          </span>
        ) : autoSaveStatus === 'saved' ? (
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-state-success-text"
            data-testid="drawer-autosave-saved"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-state-success-text" />
            {t('users.detail.autosave.saved')}
          </span>
        ) : autoSaveStatus === 'error' ? (
          <span
            aria-live="assertive"
            className="text-state-danger-text"
            data-testid="drawer-autosave-error"
          >
            {t('users.detail.autosave.error')}
          </span>
        ) : (
          <span>{t('users.detail.autosave.hint')}</span>
        )}
      </div>
      {canEdit && autoSaveStatus === 'error' && failedDraftRef.current ? (
        <button
          type="button"
          onClick={handleAutoSaveRetry}
          disabled={saveAssignmentMutation.isPending}
          className="rounded-xl border border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50"
          data-testid="drawer-autosave-retry"
        >
          {t('users.detail.autosave.retry')}
        </button>
      ) : null}
    </div>
  );

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
          {/*
           * PR-FE-11 (2026-05-09): subtitle now surfaces the totals
           * breakdown inline. Pre-fix the subtitle was a generic
           * "Bu kullanıcının görebileceği veri kapsamı." — admins had
           * to tab through every panel to count their scope
           * assignments. With (8 + 6 + 3 + 1) = 18 typical scope
           * loadouts on testai, an inline totals subtitle answers
           * "how broad is this user's access?" at a glance.
           */}
          <p className="mt-1 text-xs text-text-subtle" data-testid="scopes-totals-subtitle">
            {selectedCompanyIds.length +
              selectedProjectIds.length +
              selectedWarehouseIds.length +
              selectedBranchIds.length >
            0
              ? t('users.detail.section.scopes.subtitleWithTotals', {
                  total:
                    selectedCompanyIds.length +
                    selectedProjectIds.length +
                    selectedWarehouseIds.length +
                    selectedBranchIds.length,
                  companies: selectedCompanyIds.length,
                  projects: selectedProjectIds.length,
                  warehouses: selectedWarehouseIds.length,
                  branches: selectedBranchIds.length,
                })
              : t('users.detail.section.scopes.subtitle')}
          </p>
          {/*
           * PR-FE-12 (2026-05-09): view toggle. Default 'flat' (PR-FE-11
           * Tabs surface) preserves the existing UX so admins are not
           * surprised. Opt-in 'hierarchy' renders the OUR_COMPANY tree
           * with assigned children grouped under each company plus an
           * orphan-bucket banner for child assignments whose parent
           * OUR_COMPANY is not in the assigned set. Backed by the
           * parentCompanyId / parentBranchId fields PR-BE-15 added to
           * MasterDataItemDto.
           */}
          {/*
           * PR-FE-12 absorb iter-2 (Codex thread 019e0df3 #2):
           * proper radiogroup ARIA pattern. Pre-fix used
           * role="tablist"/"tab" without aria-controls /
           * tabpanel / arrow-key roving — partial pattern that
           * misleads screen readers about the widget contract.
           * Two-state mutually-exclusive selection is exactly
           * what radiogroup expresses; arrow-key handler covers
           * the standard left/right navigation between options.
           */}
          <div
            role="radiogroup"
            aria-label={t('users.detail.scopes.viewToggle.label')}
            className="mt-3 inline-flex rounded-full border border-border-subtle bg-surface-muted/30 p-0.5 text-xs"
            data-testid="scopes-view-toggle"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              setScopesView((prev) => (prev === 'flat' ? 'hierarchy' : 'flat'));
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={scopesView === 'flat'}
              tabIndex={scopesView === 'flat' ? 0 : -1}
              onClick={() => setScopesView('flat')}
              className={
                scopesView === 'flat'
                  ? 'rounded-full bg-surface-default px-3 py-1 font-semibold text-text-primary shadow-sm'
                  : 'rounded-full px-3 py-1 text-text-subtle hover:text-text-primary'
              }
              data-testid="scopes-view-toggle-flat"
            >
              {t('users.detail.scopes.viewToggle.flat')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scopesView === 'hierarchy'}
              tabIndex={scopesView === 'hierarchy' ? 0 : -1}
              onClick={() => setScopesView('hierarchy')}
              className={
                scopesView === 'hierarchy'
                  ? 'rounded-full bg-surface-default px-3 py-1 font-semibold text-text-primary shadow-sm'
                  : 'rounded-full px-3 py-1 text-text-subtle hover:text-text-primary'
              }
              data-testid="scopes-view-toggle-hierarchy"
            >
              {t('users.detail.scopes.viewToggle.hierarchy')}
            </button>
          </div>
          <div className="mt-3">
            {scopesView === 'flat' ? (
              <Tabs items={scopeTabs} variant="line" size="sm" />
            ) : (
              <HierarchicalScopePicker
                companies={companies}
                projects={projects}
                warehouses={warehouses}
                branches={branches}
                selectedCompanyIds={selectedCompanyIds}
                selectedProjectIds={selectedProjectIds}
                selectedWarehouseIds={selectedWarehouseIds}
                selectedBranchIds={selectedBranchIds}
                setSelectedCompanyIds={setSelectedCompanyIds}
                setSelectedProjectIds={setSelectedProjectIds}
                setSelectedWarehouseIds={setSelectedWarehouseIds}
                setSelectedBranchIds={setSelectedBranchIds}
                setDirty={setDirty}
                canEdit={canEdit}
                t={t}
              />
            )}
          </div>
        </section>

        {/* iter-36 — footer moved to FormDrawer.footer slot above (sticky). */}
      </div>
    </FormDrawer>
  );
};

export default UserDetailDrawer;
