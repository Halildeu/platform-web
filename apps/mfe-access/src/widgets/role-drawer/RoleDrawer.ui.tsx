// PR-FE-6 (2026-05-09): pre-existing `api` import from @mfe/shared-http
// violates the no-restricted-imports rule introduced in PR-HTTP-3.
// Tracked for separate refactor (migrate to getShellServices().http).
// Disabling at file scope keeps PR-FE-6 focused on the members
// invalidation + UX hint without bundling the HTTP-client migration.
/* eslint-disable no-restricted-imports */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Codex 019dde0c iter-44 — IconShield decorative leading icon for role
// drawer header (DetailDrawer.leading slot symmetric with FormDrawer's
// leading slot from iter-43). Plain shield, not ShieldCheck — the
// checkmark variant carries verified/success semantics that conflict
// with the existing tags badges (system, member-count, unsaved).
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  DetailDrawer,
  IconShield,
  TextInput,
} from '@mfe/design-system';
import type { AutocompleteOption } from '@mfe/design-system';
import { usePermissions, useZanzibarAccess } from '@mfe/auth';
import type { AccessRole, AccessLevel } from '../../features/access-management/model/access.types';
import { api } from '@mfe/shared-http';
import { pushToast } from '../../shared/notifications';
import { ExplainPermissionModal } from '../explain-modal/ExplainPermissionModal';

interface RoleDrawerProps {
  open: boolean;
  mode: 'view' | 'create';
  role: AccessRole | null;
  onClose: () => void;
  /** Reserved API hook (legacy onSave handler — replaced by saveGranulesMutation). */
  onSavePermissions?: (roleId: string, permissionIds: string[]) => Promise<void>;
  onCreateRole?: (values: { name: string; description?: string }) => Promise<void>;
  /** Reserved API hook (legacy loading flag — saveGranulesMutation.isPending replaces). */
  savingPermissions?: boolean;
  creatingRole?: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  formatNumber: (value: number) => string;
  /** Reserved formatter prop — unused after explain-modal carved out date rendering. */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
}

// --- Types for permission catalog ---
interface CatalogModule {
  key: string;
  label: string;
  levels: string[];
}
interface CatalogAction {
  key: string;
  label: string;
  module: string;
  deniable: boolean;
}
interface CatalogReport {
  key: string;
  label: string;
  module: string;
  /**
   * Codex 019dda1c iter-26: Türkçe UI grouping label, mirrors the source
   * dashboard JSON's `category` (e.g. "İnsan Kaynakları" / "Finans"). Used
   * by the drawer to group report selects into category accordions instead
   * of generic module accordions. Optional for backward compatibility —
   * legacy catalog rows without category fall back to `module` for grouping.
   */
  category?: string;
}
// Codex 019dda1c iter-27: PAGE granule type retired in V10/TB-21 backend
// migration. Frontend kept dead state and a SAYFALAR render section that
// would crash the save mutation if the catalog ever returned a page entry
// (backend's PermissionType enum no longer contains PAGE; valueOf would
// throw IllegalArgumentException → 500). CatalogPage and pages field
// removed; the matching state, effects, and render section follow.
interface Catalog {
  modules: CatalogModule[];
  actions: CatalogAction[];
  reports: CatalogReport[];
}
interface RoleMember {
  userId: number;
  assignedAt?: string;
}
interface Granule {
  type: string;
  key: string;
  grant: string;
}

const LEVEL_OPTIONS: AccessLevel[] = ['NONE', 'VIEW', 'MANAGE'];

const isPersistedRoleId = (value: string | undefined) => /^\d+$/.test(String(value ?? ''));

const buildFallbackCatalog = (role: AccessRole | null): Catalog => ({
  modules: (role?.policies ?? []).map((policy) => ({
    key: policy.moduleKey,
    label: policy.moduleLabel,
    levels: ['NONE', 'VIEW', 'MANAGE'],
  })),
  actions: [],
  reports: [],
});

const RoleDrawer: React.FC<RoleDrawerProps> = ({
  open,
  mode,
  role,
  onClose,
  onCreateRole,
  creatingRole,
  t,
  formatNumber,
}) => {
  const queryClient = useQueryClient();
  const [createName, setCreateName] = React.useState('');
  const [createDesc, setCreateDesc] = React.useState('');

  // Faz 4 Explain UX: target of the "Why?" button the user clicked.
  // Null => modal closed. Set => modal opens and auto-fetches /v1/authz/explain.
  const [explainTarget, setExplainTarget] = React.useState<{
    type: 'MODULE' | 'ACTION' | 'REPORT';
    key: string;
    label: string;
  } | null>(null);

  // Current user for the explain call (admin debugging own permission set; STORY-0318 §6).
  const { authz } = usePermissions();
  const currentUserId = (authz as { userId?: string | number } | null | undefined)?.userId ?? null;

  // Stable httpPost reference — ExplainPermissionModal (now from @mfe/auth)
  // takes httpPost as a prop. Inline arrow would recreate explain() identity
  // every render and re-fire the auto-fetch effect (P1.1 loop root cause).
  const explainHttpPost = React.useCallback(
    (url: string, body: unknown) => api.post(url, body),
    [],
  );

  // Zanzibar object-level access check: can current user edit the ACCESS module?
  // Codex 019dd818 iter-7 (B-prime PR-2b): reason field session_expired ile
  // authn unknown'ı authz deny'den ayır — UX'te "yetkin yok" yerine "oturum yenile".
  const { access: editAccess, reason: editReason } = useZanzibarAccess(
    'can_edit',
    'module',
    'ACCESS',
  );
  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc): the read-only gate
  // used to live ONLY on the Save button via `access={editAccess}`.
  // Now that the button is gone, every mutation entry-point —
  // setters, scheduler, retry handler — must consult this flag.
  // Defense-in-depth: the JSX selects are also `disabled={!canEdit}`.
  const canEdit = editAccess === 'full';

  // --- Catalog query ---
  // Codex CNS thread 019d9a28 Tur 14-15: persisted role için fallback YASAK.
  // Eski davranış: catalog fetch pending iken `buildFallbackCatalog(role)` render
  // edilir → fallback'in moduleKey'i `label.toUpperCase()` (örn. "RAPORLAMA")
  // geldiği için explain-trigger setExplainTarget({key: mod.key="RAPORLAMA",...})
  // ile yanlış key kilitlenir. Race'i kapatmak için:
  //   1) queryFn persisted role'de fallback dönmesin, backend response döner.
  //   2) Render'da `catalog = catalogQuery.data` sadece (fallback yok).
  //   3) Catalog henüz yüklenmediyse module/action/report bölümleri ve explain
  //      butonları render edilmesin (loading UI).
  // 2026-04-29 fix: drawer her açıldığında catalog yüklenir (mode=view +
  // mode=create). Eski koşul `mode === 'view' && isPersistedRoleId` Yeni Rol
  // modal'ında reports/modules/actions render edilmemesine sebep oluyordu —
  // catalog null kalıyor, fallback yok. Artık catalog drawer açılır açılmaz
  // gelir; race condition (84-92 satır yorumundaki fallback kilitlenmesi)
  // catalogQuery.data null kontrolüyle render layer'da zaten güvende
  // (442+ satırda `catalog?.reports ?? []` pattern'i).
  const catalogQuery = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: async () => {
      const res = await api.get('/v1/authz/catalog');
      return res.data as Catalog;
    },
    enabled: open,
    staleTime: 120_000,
  });

  // --- Members query ---
  const membersQuery = useQuery({
    queryKey: ['role-members', role?.id],
    queryFn: async () => {
      if (!isPersistedRoleId(role?.id)) {
        return [] as RoleMember[];
      }
      const res = await api.get(`/v1/roles/${role!.id}/members`);
      return res.data as RoleMember[];
    },
    enabled: open && mode === 'view' && !!role,
  });

  // Codex 019dda1c iter-28b: member display fix. Backend
  // /v1/roles/{id}/members only emits {userId, assignedAt}; rendering
  // "Kullanıcı #{userId}" produces an unhelpful UI. Fetch user info
  // from user-service /v1/users/{id} for every member in a single
  // batched useQuery (Promise.all). useQueries with a dynamic queries
  // array length would trigger a "Rendered more hooks" React violation
  // when the members list grows from 0 → N across role transitions,
  // so we keep a fixed hook count and recompute the batch by
  // member-ids key. React Query caches by queryKey so adding/removing
  // members only invalidates the batch entry. Hooks must live above
  // the `if (!role) return null` early-return below to satisfy Rules
  // of Hooks across role={null} → role={...} transitions.
  const membersList = membersQuery.data ?? [];
  const memberIdsKey = membersList.map((m) => m.userId).join(',');
  const memberInfoQuery = useQuery({
    queryKey: ['role-member-info-batch', memberIdsKey],
    queryFn: async () => {
      const results = await Promise.all(
        membersList.map((m) =>
          api
            .get(`/v1/users/${m.userId}`)
            .then((res) => res.data as Record<string, unknown>)
            .catch(() => null),
        ),
      );
      const map: Record<number, Record<string, unknown> | null> = {};
      membersList.forEach((m, idx) => {
        map[m.userId] = results[idx];
      });
      return map;
    },
    enabled: membersList.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  // --- Granule state ---
  //
  // Codex 019dd927 iter-19 (state-replace race fix): initialize state lazily
  // from props.role.policies on mount instead of starting from an empty {}.
  //
  // Bug observed (2026-04-29): drawer briefly renders with correct values
  // (initial render), then state replaces with empty `{}` — every module
  // shows "—" even when role.policies has valid data. React fiber inspection
  // confirmed: hook 21-24 (moduleGrants/actionGrants/reportGrants/pageGrants)
  // = `{}` despite role props having {moduleKey:"USER_MANAGEMENT",level:"VIEW"}
  // and roleGranulesQuery.data carrying matching data. The previous useEffect
  // pattern was racing with React's commit phase: setModuleGrants(mods) calls
  // were either dropped or overwritten before paint.
  //
  // Fix: useState lazy initializer reads role.policies once on mount. The
  // sync useEffect below then reconciles with roleGranulesQuery.data when it
  // arrives. Initial render is GUARANTEED to have populated mods — no race.
  const initialModsFromRole = React.useCallback((r: AccessRole | null): Record<string, string> => {
    const mods: Record<string, string> = {};
    if (r && Array.isArray(r.policies)) {
      for (const p of r.policies) {
        if (p.moduleKey && p.level) mods[p.moduleKey] = p.level;
      }
    }
    return mods;
  }, []);
  const [moduleGrants, setModuleGrants] = React.useState<Record<string, string>>(() =>
    initialModsFromRole(role),
  );
  const [actionGrants, setActionGrants] = React.useState<Record<string, string>>({});
  const [reportGrants, setReportGrants] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);

  // PR-FE-7 (Codex thread 019e0bd3 iter-1 AGREE absorb, 2026-05-09):
  // unified drawer UX, drop manual Save/Cancel buttons, every grant
  // change auto-saves after a 500ms debounce. State refs back the
  // commit pipeline:
  //   - lastSavedDraftRef: last draft the server accepted; revert
  //     target on error so the UI snaps back to the canonical state.
  //   - failedDraftRef: last draft that failed; retry banner sends
  //     this exact payload back without forcing the user to redo
  //     the keystrokes that produced it.
  //   - debounceTimerRef: the in-flight setTimeout handle so the
  //     scheduler can collapse rapid-fire changes into one PUT.
  //   - saveSeqRef: monotonic counter so a stale response (slow
  //     network, fast typing) cannot overwrite a fresher snapshot.
  type GrantSnapshot = {
    moduleGrants: Record<string, string>;
    actionGrants: Record<string, string>;
    reportGrants: Record<string, string>;
  };
  type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [autoSaveStatus, setAutoSaveStatus] = React.useState<AutoSaveStatus>('idle');
  const lastSavedDraftRef = React.useRef<GrantSnapshot | null>(null);
  const failedDraftRef = React.useRef<GrantSnapshot | null>(null);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = React.useRef(0);
  const grantsLoadedRef = React.useRef(false);
  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc): single-in-flight +
  // queued-latest model so two PUT /granules requests never race on
  // the server. Without this, the seq-guard only protects the UI
  // commit; the server itself could still apply requests in arrival
  // order (PUT v1 arriving after PUT v2 → server final = v1, stale).
  const inFlightRef = React.useRef(false);
  const queuedDraftRef = React.useRef<GrantSnapshot | null>(null);
  // Forward-decl ref so the mutation's onSuccess can flush the queued
  // draft without a temporal-dead-zone reference to itself.
  const flushQueueRef = React.useRef<(() => boolean) | null>(null);
  const [, setSelectedUser] = React.useState<AutocompleteOption | null>(null);
  const [userSearchOptions, setUserSearchOptions] = React.useState<AutocompleteOption[]>([]);
  const [userSearchLoading, setUserSearchLoading] = React.useState(false);
  // Raw input text for the user search Autocomplete, kept separate from
  // `selectedUser` so that typing does not clear the input every keystroke
  // (the component is controlled and matched=null keystrokes would otherwise
  // reset the displayed value). Cleared only after a successful add or a
  // duplicate-check rejection (P1.7 Codex verdict).
  const [userSearchValue, setUserSearchValue] = React.useState('');

  // Codex 019dda05 iter-25: drawer's source-of-truth is the typed read
  // endpoint `GET /v1/roles/{id}/granules` (companion to the existing
  // `PUT /v1/roles/{id}/granules`). Pre-iter-25 the drawer parsed
  // `GET /v1/roles/{id}` (RoleDto), which exposes only a per-MODULE
  // summary in `policies`. ACTION/REPORT granules were filtered out per
  // STORY-0318/OI-03 contract, producing the read-after-write regression
  // where REPORT/EYLEM selects rendered "Yetki Yok" after a successful
  // save round-trip. The new endpoint returns every granule-shape row
  // (MODULE/ACTION/REPORT) in typed `{type, key, grant}` form.
  const roleGranulesQuery = useQuery({
    queryKey: ['role-granules', role?.id],
    queryFn: async () => {
      if (!isPersistedRoleId(role?.id)) return null;
      const res = await api.get(`/v1/roles/${role!.id}/granules`);
      const data = res.data as { granules?: Granule[] };
      return (data?.granules ?? []) as Granule[];
    },
    enabled: open && mode === 'view' && !!role && isPersistedRoleId(role?.id),
  });

  // Codex 019dd927 iter-19: parse useEffect rewritten as TWO separate effects.
  //
  // Effect A: when role.id changes (drawer reopened with different role), reset
  // grants to props-derived initial. Replaces old single useEffect's reset
  // semantics that previously raced with React's commit phase.
  React.useEffect(() => {
    if (!role) return;
    setModuleGrants(initialModsFromRole(role));
    setActionGrants({});
    setReportGrants({});
    setDirty(false);
    // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #2): full autosave
    // reset on role switch. Without this, an in-flight save from
    // role A could land after role B is selected and overwrite B's
    // snapshot; the seq bump poisons stale onSuccess/onError because
    // their `result.seq !== saveSeqRef.current` guard now fires for
    // anything in flight at the moment of the switch.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    grantsLoadedRef.current = false;
    lastSavedDraftRef.current = null;
    failedDraftRef.current = null;
    inFlightRef.current = false;
    queuedDraftRef.current = null;
    saveSeqRef.current += 1;
    setAutoSaveStatus('idle');
    // Use role.id (string) instead of role (object ref) so re-renders with the
    // same role identity don't trigger a state reset (the previous race vector).
  }, [role?.id, initialModsFromRole]);

  // Effect B: when granules query data arrives, parse it and overwrite grants
  // (only if the data actually carries entries). Crucially, this effect does
  // NOT clear state when granules is undefined/empty — it only fills.
  //
  // Codex 019dda05 iter-25: roleGranulesQuery now returns the typed shape
  // `{type, key, grant}` from `GET /v1/roles/{id}/granules`. The legacy
  // `{moduleKey, level}` (AccessModulePolicyDto) parse branch is removed —
  // the new endpoint never emits that shape, so the branch is dead code
  // and keeping it would mask future regressions on the typed contract.
  //
  // Earlier iter-20 invariants preserved:
  //   - `written` is ONLY true when at least one recognizable AND writable
  //     entry was actually placed into a bucket. Unknown types and missing
  //     keys no-op rather than blanking module-grant state with `{}`.
  //   - Deps `[role?.id, roleGranulesQuery.data]`: object-ref re-renders of
  //     the same role don't re-trigger this effect (avoids spurious
  //     setDirty(false) calls right after a user edit).
  React.useEffect(() => {
    if (!role) return;
    const granules = roleGranulesQuery.data;
    // Wait for the query to actually complete (undefined === still
    // loading or disabled). null is a sentinel for non-persisted role.
    if (granules === undefined) return;
    const mods: Record<string, string> = {};
    const acts: Record<string, string> = {};
    const reps: Record<string, string> = {};
    let written = false;
    for (const g of granules ?? []) {
      const gAny = g as {
        type?: string;
        key?: string;
        grant?: string;
      };
      if (!gAny.type) continue;
      switch (gAny.type.toUpperCase()) {
        case 'MODULE':
          if (gAny.key) {
            mods[gAny.key] = gAny.grant ?? 'NONE';
            written = true;
          }
          break;
        case 'ACTION':
          if (gAny.key) {
            acts[gAny.key] = gAny.grant ?? 'ALLOW';
            written = true;
          }
          break;
        case 'REPORT':
          if (gAny.key) {
            reps[gAny.key] = gAny.grant ?? 'VIEW';
            written = true;
          }
          break;
        // PAGE case removed in iter-27: backend PermissionType enum has no
        // PAGE value (V10/TB-21 retired the type). If a stale tuple ever
        // shows up with type='PAGE' the unknown-type fallthrough below
        // ignores it safely.
        // unknown type → no-op, `written` remains false unless another
        // entry in this batch contributes a real grant.
      }
    }
    if (written) {
      setModuleGrants(mods);
      setActionGrants(acts);
      setReportGrants(reps);
      setDirty(false);
      // PR-FE-7: seed the canonical snapshot once granules arrive so a
      // subsequent error can revert here, AND open the autosave gate.
      // Pre-load edits MUST NOT trigger a save (would persist {} to the
      // server before the user has even seen the current state).
      lastSavedDraftRef.current = {
        moduleGrants: mods,
        actionGrants: acts,
        reportGrants: reps,
      };
    } else {
      // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #3): empty (or
      // wholly-unrecognized) granules is still a valid canonical
      // state — "no grants yet". Effect-A's props-derived modules
      // ARE the saved snapshot for this role; seed it so the first
      // grant the admin adds becomes a real delta and triggers a
      // save (pre-fix the gate stayed closed and zero-grant roles
      // could never auto-save their first edit).
      lastSavedDraftRef.current = {
        moduleGrants: initialModsFromRole(role),
        actionGrants: {},
        reportGrants: {},
      };
    }
    grantsLoadedRef.current = true;
    setAutoSaveStatus('saved');
  }, [role?.id, roleGranulesQuery.data, initialModsFromRole]);

  // --- User search handler ---
  // Threshold 3 (P1.7 user feedback): 2-char queries return too many matches in
  // staging, degrading autocomplete UX. Autocomplete component already debounces
  // onSearch by 250ms (design-system/Autocomplete.tsx:188), so no extra debounce
  // here. Queries shorter than 3 chars clear the dropdown.
  const handleUserSearch = React.useCallback(async (query: string) => {
    if (query.length < 3) {
      setUserSearchOptions([]);
      return;
    }
    setUserSearchLoading(true);
    try {
      const res = await api.get('/v1/users', { params: { search: query, pageSize: 10 } });
      const items = res.data?.items ?? res.data?.content ?? [];
      setUserSearchOptions(
        items.map(
          (u: { id: string | number; fullName?: string; name?: string; email?: string }) => ({
            value: String(u.id),
            label: `${u.fullName ?? u.name ?? ''} (${u.email ?? ''})`.trim(),
          }),
        ),
      );
    } catch {
      setUserSearchOptions([]);
    } finally {
      setUserSearchLoading(false);
    }
  }, []);

  // --- Save granules mutation ---
  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc): mutation signature
  // expanded to `{ draft, seq }` so onError can read the seq it was
  // launched with (closure-only seq capture in onSuccess wasn't
  // enough for stale-error detection). The whole flow now follows a
  // single-in-flight + queued-latest model — see scheduleAutoSave
  // and the flushQueueRef useEffect below.
  const saveGranulesMutation = useMutation({
    mutationFn: async (vars: { draft: GrantSnapshot; seq: number }) => {
      if (!isPersistedRoleId(role?.id)) return;
      const granules: Granule[] = [];
      for (const [key, grant] of Object.entries(vars.draft.moduleGrants)) {
        if (grant !== 'NONE') granules.push({ type: 'module', key, grant });
      }
      for (const [key, grant] of Object.entries(vars.draft.actionGrants)) {
        granules.push({ type: 'action', key, grant });
      }
      // Codex 019dda1c iter-26: skip catalog-stale report keys (e.g.
      // legacy group keys from prior versions) so a save does not
      // re-introduce rows the catalog has dropped.
      const validReportKeys = new Set((catalog?.reports ?? []).map((r) => r.key));
      for (const [key, grant] of Object.entries(vars.draft.reportGrants)) {
        if (!validReportKeys.has(key)) continue;
        granules.push({ type: 'report', key, grant });
      }
      // PAGE granules removed in iter-27 — backend rejects them at
      // validateAndNormalize (PermissionType enum has no PAGE value).
      await api.put(`/v1/roles/${role!.id}/granules`, { permissions: granules });
      return { seq: vars.seq, draft: vars.draft };
    },
    onSuccess: (result) => {
      // Mark slot free regardless; the queue flush below decides
      // whether to claim it again.
      inFlightRef.current = false;
      // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #4): stale-success
      // guard. Without this, a slow earlier response could land
      // after a newer save's seq bump and (a) re-commit its older
      // draft as canonical, (b) trigger invalidate which refetches
      // server state and re-seeds Effect B with old data. Both vectors
      // could regress the user's pending edits.
      if (!result || result.seq !== saveSeqRef.current) {
        flushQueueRef.current?.();
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      // Codex 019dd9d6 iter-20: drawer's own source-of-truth (role-granules
      // detail query) must also be invalidated so the next reopen pulls fresh
      // server state instead of stale cached data parsed by Effect B.
      queryClient.invalidateQueries({ queryKey: ['role-granules', role?.id] });
      // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #6): explicitly
      // sync visible state to the just-saved draft. For the normal
      // scheduled-save flow this is a no-op (state already equals
      // draft). For the retry-after-revert flow it lifts the
      // failed-draft back into the UI so "Kaydedildi" reflects what
      // the admin actually sees in the dropdowns.
      setModuleGrants(result.draft.moduleGrants);
      setActionGrants(result.draft.actionGrants);
      setReportGrants(result.draft.reportGrants);
      lastSavedDraftRef.current = result.draft;
      failedDraftRef.current = null;
      setDirty(false);
      // If a newer draft is already queued, fire it; otherwise
      // settle to 'saved'. The status flag must reflect whether
      // any save is still in flight so the badge is honest.
      if (!flushQueueRef.current?.()) {
        setAutoSaveStatus('saved');
      }
    },
    onError: (err: Error, vars) => {
      inFlightRef.current = false;
      // Stale error from a previous role/save — drop banner. The
      // user has already moved on; surfacing an error for a request
      // they no longer care about would be confusing.
      if (!vars || vars.seq !== saveSeqRef.current) {
        // Drop queue too: a stale error means the chain might be
        // poisoned. Forcing the user to start fresh is safer than
        // auto-firing the queued draft into an unknown server state.
        queuedDraftRef.current = null;
        return;
      }
      // PR-FE-7: revert to the last server-accepted snapshot so the UI
      // is honest about persistence ("Kaydedilemedi, son kayıtlı duruma
      // dönüldü"). The retry banner remembers the failed draft so the
      // user can re-attempt the same change without retyping.
      failedDraftRef.current = vars.draft;
      // Drop the queue on a fresh error: the user's next action
      // should be an explicit retry (or another edit), not an
      // implicit chain-fire of whatever was buffered behind this
      // failed save.
      queuedDraftRef.current = null;
      const snap = lastSavedDraftRef.current;
      if (snap) {
        setModuleGrants(snap.moduleGrants);
        setActionGrants(snap.actionGrants);
        setReportGrants(snap.reportGrants);
      }
      // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #6): the visible
      // state has been reverted to canonical, so dirty=false aligns
      // with the "tüm değişiklikler kaydedildi" reality minus the
      // explicit "Kaydedilemedi" banner. Pre-fix the unsaved-changes
      // badge could still be lit alongside the revert message.
      setDirty(false);
      setAutoSaveStatus('error');
      pushToast('error', err.message || t('access.notifications.permissionSaveError'));
    },
  });

  // PR-FE-7: shallow-equal helper for grant snapshots. Used as the
  // skip guard so a state-set that mirrors the server-canonical
  // snapshot (e.g. Effect B seeding from the granules query) does
  // not produce a redundant PUT.
  const grantsEqual = React.useCallback((a: Record<string, string>, b: Record<string, string>) => {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  }, []);

  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #5): clear the
  // pending timer FIRST, equality-check SECOND. Pre-fix flow: saved
  // A → user types B (timer set, status=saving) → user reverts to A
  // (equality returns true → no-op) → 500ms later the B timer fires
  // and PUTs B back. Now reverting cancels the timer regardless,
  // which is the only correct semantics.
  const scheduleAutoSave = React.useCallback(
    (next: GrantSnapshot) => {
      if (!grantsLoadedRef.current || !canEdit) return;

      // Step 1 — cancel any pending timer. A subsequent equality-
      // skip return is now safe: even if we don't fire, we won't
      // leave a stale timer aimed at an obsolete draft.
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Step 2 — equality skip. Effect B's canonical seed and any
      // round-trip through invalidate-refetch can call this with
      // the snapshot equal to lastSavedDraft. Don't churn the wire.
      const last = lastSavedDraftRef.current;
      if (
        last &&
        grantsEqual(last.moduleGrants, next.moduleGrants) &&
        grantsEqual(last.actionGrants, next.actionGrants) &&
        grantsEqual(last.reportGrants, next.reportGrants)
      ) {
        // If nothing was in flight, surface 'saved' explicitly so
        // the badge transitions out of 'saving' (a previous tick
        // might have flipped it on its way to here).
        if (!inFlightRef.current && autoSaveStatus !== 'saved') {
          setAutoSaveStatus('saved');
        }
        return;
      }

      // Step 3 — schedule the save 500ms later.
      setAutoSaveStatus('saving');
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        // Single-in-flight + queued-latest: if a save is on the
        // wire, just buffer the latest draft. onSuccess/onError
        // (via flushQueueRef) will pull it back out.
        if (inFlightRef.current) {
          queuedDraftRef.current = next;
          return;
        }
        inFlightRef.current = true;
        saveSeqRef.current += 1;
        saveGranulesMutation.mutate({ draft: next, seq: saveSeqRef.current });
      }, 500);
    },
    [saveGranulesMutation, grantsEqual, canEdit, autoSaveStatus],
  );

  // PR-FE-7 absorb iter-2: bind the queue-flush function via a ref
  // so the mutation's onSuccess (defined upstream of this hook
  // call) can fire it without a temporal-dead-zone reference. The
  // ref reads the latest mutate function on every render, so
  // queue flushes always hit the freshest mutation instance.
  React.useEffect(() => {
    flushQueueRef.current = () => {
      const queued = queuedDraftRef.current;
      if (!queued) return false;
      queuedDraftRef.current = null;
      inFlightRef.current = true;
      saveSeqRef.current += 1;
      setAutoSaveStatus('saving');
      saveGranulesMutation.mutate({ draft: queued, seq: saveSeqRef.current });
      return true;
    };
  }, [saveGranulesMutation]);

  // PR-FE-7: state observer. Watches the grant maps and schedules an
  // auto-save whenever they change. Centralizing the trigger here
  // avoids touching every individual handler (setModule,
  // setActionLevel, setActionGroupLevel, setReportLevel,
  // setReportGroupLevel) and guarantees that any future handler
  // contributes to the auto-save flow without forgetting to wire it.
  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #1): also gate on
  // canEdit. The setters return early in read-only mode, but Effect
  // B's seed call still flows through here on every render — gate
  // here too so a permissions flip during an open drawer doesn't
  // leak a save.
  React.useEffect(() => {
    if (!grantsLoadedRef.current || !canEdit) return;
    scheduleAutoSave({ moduleGrants, actionGrants, reportGrants });
  }, [moduleGrants, actionGrants, reportGrants, scheduleAutoSave, canEdit]);

  // PR-FE-7: cleanup pending debounce when the component unmounts so
  // we never fire after the user has navigated away.
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #6): retry sends
  // the failed draft straight back. We do NOT lift the failed draft
  // into UI state here — onSuccess does that with `result.draft`,
  // which keeps the visible state and the canonical snapshot in
  // lockstep. Pushing the state up here would also trigger the
  // observer effect → another debounced save, racing with the
  // retry mutation we just fired.
  const handleAutoSaveRetry = React.useCallback(() => {
    if (!canEdit) return;
    const failed = failedDraftRef.current;
    if (!failed) return;
    // Cancel any straggling debounce so the retry isn't doubled
    // by the observer effect firing on the (yet-unchanged) state.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (inFlightRef.current) {
      // Another save is already running (rare — typically retry is
      // pressed only after error which already cleared inFlight).
      // Queue the failed draft as latest so onSuccess flushes it.
      queuedDraftRef.current = failed;
      return;
    }
    inFlightRef.current = true;
    saveSeqRef.current += 1;
    setAutoSaveStatus('saving');
    saveGranulesMutation.mutate({ draft: failed, seq: saveSeqRef.current });
  }, [saveGranulesMutation, canEdit]);

  // --- Add member mutation ---
  const addMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      if (!isPersistedRoleId(role?.id)) return;
      await api.post(`/v1/roles/${role!.id}/members`, { userIds: [userId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-members', role?.id] });
      // PR-FE-6 (2026-05-09): the roles list query carries `memberCount`
      // per role. Pre-fix only `role-members` was invalidated, so the
      // role grid badge stayed stale after every add/remove (drawer
      // header N differed from body N+/-1). Invalidate the roles list
      // here too so the badge matches the live count.
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setSelectedUser(null);
      setUserSearchOptions([]);
      setUserSearchValue('');
      pushToast('success', t('access.notifications.memberAddSuccess'));
    },
    onError: (err: Error) => {
      pushToast('error', err.message || t('access.notifications.memberAddError'));
    },
  });

  // --- Remove member mutation ---
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      if (!isPersistedRoleId(role?.id)) return;
      await api.delete(`/v1/roles/${role!.id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-members', role?.id] });
      // PR-FE-6 (2026-05-09): mirror the roles list invalidation from
      // addMemberMutation above so the badge in the role grid matches
      // the live members count after a removal.
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      pushToast('success', t('access.notifications.memberRemoveSuccess'));
    },
    onError: (err: Error) => {
      pushToast('error', err.message || t('access.notifications.memberRemoveError'));
    },
  });

  // Reset on mode change
  React.useEffect(() => {
    if (mode === 'create') {
      setCreateName('');
      setCreateDesc('');
    }
  }, [mode, open]);

  const handleCreate = async () => {
    if (!onCreateRole || !createName.trim()) return;
    await onCreateRole({ name: createName.trim(), description: createDesc.trim() || undefined });
  };

  // --- Create mode ---
  if (mode === 'create') {
    return (
      <DetailDrawer open={open} onClose={onClose} title={t('access.create.title')} size="lg">
        <div className="flex flex-col gap-5 p-1">
          <TextInput
            label={t('access.create.nameLabel')}
            placeholder={t('access.create.namePlaceholder')}
            value={createName}
            onValueChange={setCreateName}
            autoFocus
            fullWidth
          />
          <TextInput
            label={t('access.create.descriptionLabel')}
            placeholder={t('access.create.descriptionPlaceholder')}
            value={createDesc}
            onValueChange={setCreateDesc}
            fullWidth
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              {t('access.clone.cancelText')}
            </Button>
            <Button
              onClick={handleCreate}
              loading={creatingRole}
              disabled={createName.trim().length < 3}
            >
              {t('access.create.submitText')}
            </Button>
          </div>
        </div>
      </DetailDrawer>
    );
  }

  if (!role) return null;

  // Codex Tur 15 verdict: persisted role → backend catalog zorunlu, fallback yok.
  // non-persisted (new role create) akışında fallback `role.policies` kullanılabilir.
  const persistedRole = isPersistedRoleId(role?.id);
  const catalog = persistedRole ? (catalogQuery.data ?? null) : buildFallbackCatalog(role);
  const members = membersQuery.data ?? [];

  type UserInfo = {
    id?: number;
    fullName?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  const memberDisplayName = (info: UserInfo | null | undefined, userId: number): string => {
    if (info?.fullName && info.fullName.trim()) return info.fullName;
    if (info?.name && info.name.trim()) return info.name;
    const composed = [info?.firstName, info?.lastName].filter(Boolean).join(' ').trim();
    if (composed) return composed;
    if (info?.email && info.email.trim()) return info.email;
    return `Kullanıcı #${userId}`;
  };

  // Persisted role + catalog henüz yüklenmedi (veya hata): loading/error state
  // — module/explain listesi render edilmesin, yanlış key kilitlenmesin.
  if (persistedRole && !catalog) {
    return (
      <DetailDrawer
        open={open}
        onClose={onClose}
        title={role.name}
        subtitle={role.description || t('access.drawer.noDescription')}
        size="lg"
      >
        <div className="flex flex-col gap-3 py-6">
          {catalogQuery.isError ? (
            <Alert
              variant="error"
              title={t('access.drawer.catalogErrorTitle') || 'Katalog yüklenemedi'}
            >
              {String(catalogQuery.error ?? 'Unknown error')}
            </Alert>
          ) : (
            <div className="text-sm text-text-subtle" data-testid="role-drawer-catalog-loading">
              {t('access.drawer.catalogLoading') || 'Yetki katalogu yükleniyor…'}
            </div>
          )}
        </div>
      </DetailDrawer>
    );
  }

  // --- Helpers ---
  // PR-FE-7 absorb iter-2 (Codex thread 019e0bdc #1): every grant
  // setter now early-returns when canEdit is false. The drawer
  // dropdowns are also `disabled={!canEdit}` (defense-in-depth), but
  // a programmatic onChange or future code path that bypasses the
  // disabled prop will still hit this gate.
  const setModule = (key: string, level: string) => {
    if (!canEdit) return;
    setModuleGrants((prev) => ({ ...prev, [key]: level }));
    setDirty(true);
  };

  // Codex 019dda1c iter-27 (C): individual action level setter — 3-state
  // (NONE / ALLOW / DENY). Replaces the legacy two-checkbox toggle so action
  // selects can match the report select pattern (single dropdown). DENY is
  // only meaningful when {@code action.deniable === true}; the render layer
  // hides the option for non-deniable actions, but this setter still accepts
  // it as a no-op safety net.
  const setActionLevel = (key: string, level: 'NONE' | 'ALLOW' | 'DENY') => {
    if (!canEdit) return;
    setActionGrants((prev) => {
      const next = { ...prev };
      if (level === 'NONE') {
        delete next[key];
      } else {
        next[key] = level;
      }
      return next;
    });
    setDirty(true);
  };

  // Codex 019dda1c iter-27 (C): bulk-select for an action module group.
  // Mirrors setReportGroupLevel from iter-25/26: header dropdown sets every
  // action in the module to the chosen level. DENY is only applied to
  // actions whose {@code deniable} flag is true; non-deniable actions get
  // ALLOW instead (or stay NONE if the bulk choice is NONE), so the user
  // never sees a confusing "some changed, some didn't" partial state.
  const setActionGroupLevel = (moduleKey: string, level: 'NONE' | 'ALLOW' | 'DENY') => {
    if (!canEdit) return;
    setActionGrants((prev) => {
      const next = { ...prev };
      const acts = catalog?.actions.filter((a) => a.module === moduleKey) ?? [];
      for (const a of acts) {
        if (level === 'NONE') {
          delete next[a.key];
        } else if (level === 'DENY' && !a.deniable) {
          // Non-deniable action under a DENY bulk: fall back to ALLOW so the
          // group ends in a coherent state (all entries explicitly allowed
          // except deniable rows that the user wanted denied).
          next[a.key] = 'ALLOW';
        } else {
          next[a.key] = level;
        }
      }
      return next;
    });
    setDirty(true);
  };

  // 2026-04-29: tree pattern — kullanıcı feedback "raporlar inline aşağı doğru
  // açılsın tek tek, rol bazlı yetki". Üç seviye:
  //   NONE → granule yok (hide on save)
  //   VIEW → görüntüleyebilir
  //   MANAGE → tam yetki
  // Eski toggleReport (ALLOW toggle) yerine setReportLevel(key, level).
  const setReportLevel = (key: string, level: 'NONE' | 'VIEW' | 'MANAGE') => {
    if (!canEdit) return;
    setReportGrants((prev) => {
      if (level === 'NONE') {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: level };
    });
    setDirty(true);
  };

  // Codex 019dda05 iter-25 + 2026-04-29 kullanıcı feature isteği: "ana
  // kategoride toplu yetki + inline tek tek". Modül header'ından bir
  // bulk select dropdown ile o modüle ait TÜM raporları aynı level'a
  // setlemek. Bireysel rapor select'leri korunur — kullanıcı bulk
  // sonrası tek-tek override edebilir.
  //
  // NONE seçilirse o modüle ait tüm reportGrants entry'leri silinir
  // (drawer kapanışta NONE rapor entry zaten payload'a girmez).
  // VIEW/MANAGE seçilirse her rapor için aynı level set edilir.
  const setReportGroupLevel = (groupKey: string, level: 'NONE' | 'VIEW' | 'MANAGE') => {
    if (!canEdit) return;
    setReportGrants((prev) => {
      const next = { ...prev };
      // Codex 019dda1c iter-26: bulk filter must match the same `category ??
      // module` key the drawer renders by, otherwise category-grouped
      // reports won't all flip when the bulk dropdown is changed.
      const reports = catalog?.reports.filter((r) => (r.category ?? r.module) === groupKey) ?? [];
      for (const r of reports) {
        if (level === 'NONE') {
          delete next[r.key];
        } else {
          next[r.key] = level;
        }
      }
      return next;
    });
    setDirty(true);
  };

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={role.name}
      subtitle={role.description || t('access.drawer.noDescription')}
      leading={
        // Codex 019dde0c iter-44 — decorative leading icon. h-8 w-8
        // (32px) per Codex review: bare SVG at 40px would dominate
        // the header next to the role name + subtitle + tags row.
        // text-text-secondary keeps it as a neutral identity anchor;
        // CTA-like text-action-primary would compete with the badges
        // already present in `tags` for visual emphasis.
        <IconShield className="h-8 w-8 text-text-secondary" aria-hidden="true" />
      }
      tags={
        <div className="flex gap-2">
          {role.isSystemRole && (
            <Badge variant="default" size="sm">
              {t('access.drawer.systemRole')}
            </Badge>
          )}
          <Badge variant="info" size="sm">
            {formatNumber(role.memberCount)} {t('access.drawer.members')}
          </Badge>
          {dirty && (
            <Badge variant="warning" size="sm">
              {t('access.drawer.unsavedChanges')}
            </Badge>
          )}
        </div>
      }
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {/* --- MODÜLLER --- */}
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">
          {t('access.drawer.modulesTitle')}
        </h3>
        <div className="flex flex-col gap-2">
          {(catalog?.modules ?? []).map((mod) => (
            <div
              key={mod.key}
              className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-muted/50 px-4 py-3"
            >
              <span className="text-sm font-medium text-text-primary">{mod.label}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExplainTarget({ type: 'MODULE', key: mod.key, label: mod.label })
                  }
                  aria-label={t('access.explainModal.triggerAria', { label: mod.label })}
                  title={t('access.explainModal.triggerTitle')}
                  data-testid={`explain-trigger-module-${mod.key}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-xs text-text-subtle hover:bg-surface-default hover:text-text-primary"
                >
                  ?
                </button>
                <select
                  className="rounded-lg border border-border-subtle bg-surface-default px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  value={moduleGrants[mod.key] ?? 'NONE'}
                  onChange={(e) => setModule(mod.key, e.target.value)}
                  disabled={!canEdit}
                >
                  {LEVEL_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {level === 'NONE'
                        ? '—'
                        : level === 'VIEW'
                          ? t('access.drawer.levelView')
                          : t('access.drawer.levelManage')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <hr className="border-border-subtle" />

        {/* --- EYLEMLER (Codex 019dda1c iter-27 C: module-grouped + bulk select) --- */}
        {/* Pattern mirrors RAPORLAR section: each module gets an accordion;
            header has a 3-state bulk dropdown (NONE/ALLOW/DENY); individual
            actions are select dropdowns. DENY option is hidden for actions
            whose deniable=false. Bulk DENY hides if the group has any
            non-deniable action — UI never offers a half-applied state. */}
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">
          {t('access.drawer.actionsTitle')}
        </h3>
        <div className="flex flex-col gap-3">
          {(() => {
            // Group actions by module key (preserves catalog ordering)
            const grouped = new Map<string, typeof catalog.actions>();
            for (const action of catalog?.actions ?? []) {
              const arr = grouped.get(action.module) ?? [];
              arr.push(action);
              grouped.set(action.module, arr);
            }
            return Array.from(grouped.entries()).map(([moduleKey, actions]) => {
              const moduleLabel =
                catalog?.modules?.find((m) => m.key === moduleKey)?.label ?? moduleKey;
              const activeCount = actions.filter((a) => !!actionGrants[a.key]).length;
              const allDeniable = actions.every((a) => a.deniable);

              // Bulk-level computation — 3-state with MIXED placeholder.
              const levels: ('NONE' | 'ALLOW' | 'DENY')[] = actions.map((a) => {
                const raw = actionGrants[a.key];
                if (raw === 'DENY') return 'DENY';
                if (raw === 'ALLOW') return 'ALLOW';
                return 'NONE';
              });
              const firstLevel = levels[0] ?? 'NONE';
              const allSame = levels.every((l) => l === firstLevel);
              const bulkLevel: 'NONE' | 'ALLOW' | 'DENY' | 'MIXED' = allSame ? firstLevel : 'MIXED';

              return (
                <details
                  key={moduleKey}
                  className="rounded-xl border border-border-subtle bg-surface-muted/30"
                  open={activeCount > 0}
                  data-testid={`action-module-group-${moduleKey}`}
                >
                  <summary className="flex cursor-pointer items-center justify-between rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-muted/60">
                    <span>
                      <span className="font-semibold">{moduleLabel}</span>
                      <span className="ml-2 text-xs text-text-subtle">({moduleKey})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-subtle">
                        {activeCount > 0
                          ? t('access.drawer.actionsActiveCount', {
                              active: activeCount,
                              total: actions.length,
                            })
                          : t('access.drawer.actionsTotal', { total: actions.length })}
                      </span>
                      <select
                        value={bulkLevel}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const v = e.target.value as 'NONE' | 'ALLOW' | 'DENY' | 'MIXED';
                          if (v === 'MIXED') return;
                          setActionGroupLevel(moduleKey, v);
                        }}
                        className="rounded border border-border-subtle bg-surface-default px-2 py-0.5 text-xs font-normal disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid={`action-group-level-${moduleKey}`}
                        aria-label={t('access.drawer.actionsBulkLevelAria', {
                          module: moduleLabel,
                        })}
                        disabled={!canEdit}
                      >
                        <option value="NONE">{t('access.drawer.actionsLevel.none')}</option>
                        <option value="ALLOW">{t('access.drawer.actionsLevel.allow')}</option>
                        {/* DENY only if every action in this group is deniable. */}
                        {allDeniable && (
                          <option value="DENY">{t('access.drawer.actionsLevel.deny')}</option>
                        )}
                        {bulkLevel === 'MIXED' && (
                          <option value="MIXED" disabled>
                            {t('access.drawer.actionsBulkMixed')}
                          </option>
                        )}
                      </select>
                    </div>
                  </summary>
                  <div className="flex flex-col gap-1 px-4 py-2">
                    {actions.map((action) => {
                      const raw = actionGrants[action.key];
                      const currentLevel: 'NONE' | 'ALLOW' | 'DENY' =
                        raw === 'DENY' ? 'DENY' : raw === 'ALLOW' ? 'ALLOW' : 'NONE';
                      return (
                        <div
                          key={action.key}
                          className="flex items-center justify-between gap-2 rounded-md bg-surface-default px-3 py-1.5"
                        >
                          <span className="flex-1 text-sm">{action.label}</span>
                          <select
                            value={currentLevel}
                            onChange={(e) =>
                              setActionLevel(
                                action.key,
                                e.target.value as 'NONE' | 'ALLOW' | 'DENY',
                              )
                            }
                            className={
                              currentLevel === 'DENY'
                                ? 'rounded border border-state-danger-border bg-state-danger-surface px-2 py-0.5 text-xs text-state-danger-text disabled:cursor-not-allowed disabled:opacity-50'
                                : 'rounded border border-border-subtle bg-surface-muted px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50'
                            }
                            data-testid={`action-level-${action.key}`}
                            disabled={!canEdit}
                          >
                            <option value="NONE">{t('access.drawer.actionsLevel.none')}</option>
                            <option value="ALLOW">{t('access.drawer.actionsLevel.allow')}</option>
                            {action.deniable && (
                              <option value="DENY">{t('access.drawer.actionsLevel.deny')}</option>
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setExplainTarget({
                                type: 'ACTION',
                                key: action.key,
                                label: action.label,
                              })
                            }
                            aria-label={t('access.explainModal.triggerAria', {
                              label: action.label,
                            })}
                            title={t('access.explainModal.triggerTitle')}
                            data-testid={`explain-trigger-action-${action.key}`}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-xs text-text-subtle hover:bg-surface-default hover:text-text-primary"
                          >
                            ?
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            });
          })()}
        </div>

        <hr className="border-border-subtle" />

        {/* --- RAPORLAR (tree pattern: modül-gruplu accordion + 3-level select) --- */}
        {/* 2026-04-29 redesign: kullanıcı feedback "raporlar inline aşağı doğru
            açılsın tek tek, rol bazlı yetki". Eski düz checkbox listesi yerine
            modül başlığı altında raporlar grouplu, her birine NONE/VIEW/MANAGE
            select. Mevcut catalog?.reports zaten {key,label,module}; reportGrants
            level value'su 'VIEW'|'MANAGE'|undefined. */}
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">
          {t('access.drawer.reportsTitle')}
        </h3>
        <div className="flex flex-col gap-3">
          {(() => {
            // Codex 019dda1c iter-26: drawer report section now groups by
            // `category` (Turkish UI label like "İnsan Kaynakları" / "Finans")
            // when the catalog row exposes one. Falls back to `module`
            // (enum key like "REPORT" / "USER_MANAGEMENT") for legacy catalog
            // rows that haven't been re-baselined to category yet.
            const grouped = new Map<string, typeof catalog.reports>();
            for (const report of catalog?.reports ?? []) {
              const groupKey = report.category ?? report.module;
              const arr = grouped.get(groupKey) ?? [];
              arr.push(report);
              grouped.set(groupKey, arr);
            }
            return Array.from(grouped.entries()).map(([groupKey, reports]) => {
              // Group label resolution:
              //   1. If groupKey came from `category`, use it directly (it's
              //      already a Turkish user-facing label).
              //   2. Otherwise (legacy `module` fallback), look up the module
              //      label in catalog.modules.
              //   3. Last resort: render the raw key.
              const isCategory = reports.some((r) => r.category === groupKey);
              const moduleLabel = isCategory
                ? groupKey
                : (catalog?.modules?.find((m) => m.key === groupKey)?.label ?? groupKey);
              const activeCount = reports.filter((r) => !!reportGrants[r.key]).length;

              // Codex 019dda05 iter-25 + kullanıcı feature: bulk-select header
              // dropdown'u. Modül içindeki TÜM raporların effektif level'i
              // hesaplanır:
              //   - hepsi aynı (NONE / VIEW / MANAGE) → o level
              //   - karışık → 'MIXED' (placeholder, kullanıcı override için)
              // Legacy 'ALLOW' grant değeri 'VIEW' olarak normalize edilir
              // (bireysel select'le aynı kontrat).
              const normalizedLevels: ('NONE' | 'VIEW' | 'MANAGE')[] = reports.map((r) => {
                const raw = reportGrants[r.key];
                if (raw === 'MANAGE') return 'MANAGE';
                if (raw === 'VIEW') return 'VIEW';
                if (raw) return 'VIEW'; // legacy 'ALLOW' → VIEW
                return 'NONE';
              });
              const firstLevel = normalizedLevels[0] ?? 'NONE';
              const allSame = normalizedLevels.every((l) => l === firstLevel);
              const bulkLevel: 'NONE' | 'VIEW' | 'MANAGE' | 'MIXED' = allSame
                ? firstLevel
                : 'MIXED';

              return (
                <details
                  key={groupKey}
                  className="rounded-xl border border-border-subtle bg-surface-muted/30"
                  open={activeCount > 0}
                  data-testid={`report-module-group-${groupKey}`}
                >
                  <summary className="flex cursor-pointer items-center justify-between rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-muted/60">
                    <span>
                      <span className="font-semibold">{moduleLabel}</span>
                      <span className="ml-2 text-xs text-text-subtle">({groupKey})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-subtle">
                        {activeCount > 0
                          ? t('access.drawer.reportsActiveCount', {
                              active: activeCount,
                              total: reports.length,
                            })
                          : t('access.drawer.reportsTotal', { total: reports.length })}
                      </span>
                      {/*
                        Bulk-level select (modül header'ı). onClick
                        stopPropagation ile <details> toggle'ını engeller
                        (select açılırken accordion kapanmasın).
                      */}
                      <select
                        value={bulkLevel}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const v = e.target.value as 'NONE' | 'VIEW' | 'MANAGE' | 'MIXED';
                          if (v === 'MIXED') return; // MIXED placeholder, no-op
                          setReportGroupLevel(groupKey, v);
                        }}
                        className="rounded border border-border-subtle bg-surface-default px-2 py-0.5 text-xs font-normal disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid={`report-group-level-${groupKey}`}
                        aria-label={t('access.drawer.reportsBulkLevelAria', {
                          module: moduleLabel,
                        })}
                        disabled={!canEdit}
                      >
                        <option value="NONE">{t('access.drawer.reportLevel.none')}</option>
                        <option value="VIEW">{t('access.drawer.reportLevel.view')}</option>
                        <option value="MANAGE">{t('access.drawer.reportLevel.manage')}</option>
                        {bulkLevel === 'MIXED' && (
                          <option value="MIXED" disabled>
                            {t('access.drawer.reportsBulkMixed')}
                          </option>
                        )}
                      </select>
                    </div>
                  </summary>
                  <div className="flex flex-col gap-1 px-4 py-2">
                    {reports.map((report) => {
                      const currentLevel = (
                        reportGrants[report.key] === 'MANAGE'
                          ? 'MANAGE'
                          : reportGrants[report.key] === 'VIEW'
                            ? 'VIEW'
                            : reportGrants[report.key]
                              ? 'VIEW' // legacy 'ALLOW' default → VIEW
                              : 'NONE'
                      ) as 'NONE' | 'VIEW' | 'MANAGE';
                      return (
                        <div
                          key={report.key}
                          className="flex items-center justify-between gap-2 rounded-md bg-surface-default px-3 py-1.5"
                        >
                          <span className="flex-1 text-sm">{report.label}</span>
                          <select
                            value={currentLevel}
                            onChange={(e) =>
                              setReportLevel(
                                report.key,
                                e.target.value as 'NONE' | 'VIEW' | 'MANAGE',
                              )
                            }
                            className="rounded border border-border-subtle bg-surface-muted px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid={`report-level-${report.key}`}
                            disabled={!canEdit}
                          >
                            <option value="NONE">{t('access.drawer.reportLevel.none')}</option>
                            <option value="VIEW">{t('access.drawer.reportLevel.view')}</option>
                            <option value="MANAGE">{t('access.drawer.reportLevel.manage')}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setExplainTarget({
                                type: 'REPORT',
                                key: report.key,
                                label: report.label,
                              })
                            }
                            aria-label={t('access.explainModal.triggerAria', {
                              label: report.label,
                            })}
                            title={t('access.explainModal.triggerTitle')}
                            data-testid={`explain-trigger-report-${report.key}`}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-xs text-text-subtle hover:bg-surface-default hover:text-text-primary"
                          >
                            ?
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            });
          })()}
        </div>

        {/* --- ATANMIŞ KİŞİLER --- */}
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">
          {t('access.drawer.membersTitle')} ({members.length})
        </h3>
        {/*
         * PR-FE-6 (2026-05-09): UX hint clarifying that member
         * add/remove is auto-saved, distinct from the permission
         * grants section which still requires the Save button at the
         * drawer footer. Pre-fix users expected the Save button to
         * apply member changes too, but Save is gated on permission
         * grant dirty state only.
         */}
        <p className="text-xs text-text-subtle">
          Üyeler eklediğinizde/kaldırdığınızda anlık kaydedilir; ayrıca Kaydet&apos;e gerek yoktur.
        </p>
        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const info = memberInfoQuery.data?.[member.userId];
            const displayName = memberDisplayName(info, member.userId);
            // Email shown as a secondary line when the primary display
            // name is something other than the email itself (avoids
            // duplicate rendering for users without a fullName).
            const showEmailLine = !!info?.email && info.email !== displayName;
            return (
              <div
                key={member.userId}
                className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-muted/50 px-4 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm text-text-primary">{displayName}</span>
                  {showEmailLine && <span className="text-xs text-text-subtle">{info!.email}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        t('access.notifications.memberRemoveConfirm', {
                          userName: displayName,
                        }),
                      )
                    ) {
                      removeMemberMutation.mutate(member.userId);
                    }
                  }}
                  className="text-xs text-state-danger-text hover:underline"
                >
                  Kaldır
                </button>
              </div>
            );
          })}
          {members.length === 0 && (
            <p className="text-xs text-text-subtle">Henüz atanmış kişi yok.</p>
          )}

          {/* Kişi ekle — P1.7: auto-add on selection, no button.
              Autocomplete.onChange fires on BOTH typing and explicit selection
              (design-system/Autocomplete.tsx:219). `userSearchValue` holds the
              raw input text (every keystroke); `selectedUser` is set only when
              a matched option comes through (explicit dropdown pick). Auto-add
              fires only for matched picks, with duplicate + pending guards. */}
          <div className="flex items-center gap-2 mt-2">
            <Autocomplete
              placeholder={t('access.drawer.userSearchPlaceholder')}
              options={userSearchOptions}
              onSearch={handleUserSearch}
              loading={userSearchLoading || addMemberMutation.isPending}
              value={userSearchValue}
              onChange={(val) => {
                setUserSearchValue(val);
                const matched = userSearchOptions.find((o) => o.value === val);
                setSelectedUser(matched ?? null);
                if (!matched) return; // typing in progress
                if (addMemberMutation.isPending) return; // previous add still running
                const userId = Number(matched.value);
                if (members.some((m) => m.userId === userId)) {
                  pushToast(
                    'warning',
                    t('access.notifications.memberAlreadyExists', { userName: matched.label }),
                  );
                  setSelectedUser(null);
                  setUserSearchValue('');
                  return;
                }
                addMemberMutation.mutate(userId);
              }}
              allowCustomValue={false}
              fullWidth
            />
          </div>
        </div>

        <hr className="border-border-subtle" />

        {/* --- FOOTER ---
            PR-FE-7 (2026-05-09): Save / Cancel buttons removed. Every
            grant change auto-saves after a 500ms debounce; the footer
            now hosts a status indicator that reflects the autosave
            state machine and a retry button when a save fails. The
            access-denied surface (editAccess !== 'full') also lives
            here so super-admins can see the gate reason without a
            phantom Save button. */}
        <div className="flex items-center justify-between gap-3 pt-2 text-xs text-text-subtle">
          <div className="flex items-center gap-2">
            {editAccess !== 'full' ? (
              <span className="text-state-warning-text">
                {editReason === 'session_expired'
                  ? t('auth.session.expired')
                  : t('access.drawer.noEditPermission')}
              </span>
            ) : autoSaveStatus === 'saving' ? (
              <span aria-live="polite" className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-state-info-text" />
                Kaydediliyor...
              </span>
            ) : autoSaveStatus === 'saved' ? (
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-state-success-text"
              >
                <span className="inline-flex h-2 w-2 rounded-full bg-state-success-text" />
                Tüm değişiklikler kaydedildi
              </span>
            ) : autoSaveStatus === 'error' ? (
              <span aria-live="assertive" className="text-state-danger-text">
                Kaydedilemedi, son kayıtlı duruma dönüldü.
              </span>
            ) : (
              <span>Tüm değişiklikler otomatik kaydedilir.</span>
            )}
          </div>
          {autoSaveStatus === 'error' && failedDraftRef.current ? (
            <Button
              variant="secondary"
              onClick={handleAutoSaveRetry}
              loading={saveGranulesMutation.isPending}
            >
              Tekrar dene
            </Button>
          ) : null}
        </div>
      </div>

      {/* Faz 4 Explain UX: per-permission "Why?" modal. Portal-based, auto-fetches on open. */}
      {explainTarget && (
        <ExplainPermissionModal
          open={!!explainTarget}
          onClose={() => setExplainTarget(null)}
          userId={currentUserId != null ? String(currentUserId) : null}
          permissionType={explainTarget.type}
          permissionKey={explainTarget.key}
          permissionLabel={explainTarget.label}
          httpPost={explainHttpPost}
          t={t}
        />
      )}
    </DetailDrawer>
  );
};

export default RoleDrawer;
