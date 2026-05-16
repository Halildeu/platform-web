/**
 * VariantIntegration — Grid variant save/load/clone with personal/global management.
 *
 * Responsibilities:
 * - Connects to useGridVariants hook (lib/grid-variants)
 * - Collects grid column/filter/sort state via GridApi
 * - Applies saved variant state to grid
 * - Provides variant dropdown selector (optgroup: personal/global)
 * - Provides compact accordion-based variant manager panel
 * - Handles variant CRUD, promote/demote, default management
 *
 * v34 API notes:
 * - getColumnState() / applyColumnState() on GridApi (not ColumnApi)
 * - getFilterModel() / setFilterModel()
 * - getAdvancedFilterModel() / setAdvancedFilterModel()
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import type { GridApi, ColumnState, AdvancedFilterModel } from 'ag-grid-community';
import {
  fetchGridVariants,
  createGridVariant,
  updateGridVariant,
  cloneGridVariant,
  deleteGridVariant,
  updateVariantPreference,
  compareGridVariants,
} from '../../lib/grid-variants';
import { cn } from '../../utils/cn';
import { useAccordion } from '../../headless/hooks/useAccordion';
import { IconSettings } from '../../icons/user/IconSettings';
import { IconClose } from '../../icons/action/IconClose';
import { IconSave } from '../../icons/action/IconSave';
import {
  type DraftScope,
  type LayoutDraft,
  applyDraftOverColumnState,
  buildDraftKey,
  clearDraft,
  computeSchemaFingerprint,
  readDraft,
  writeDraft,
} from './column-layout-draft';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------
 */

export interface GridVariantState {
  columnState?: unknown[];
  filterModel?: Record<string, unknown>;
  advancedFilterModel?: unknown;
  sortModel?: unknown[];
  pivotMode?: boolean;
  quickFilterText?: string;
  paginationPageSize?: number;
}

export interface GridVariant {
  id: string;
  gridId: string;
  name: string;
  state: GridVariantState;
  isDefault?: boolean;
  isGlobal?: boolean;
  isGlobalDefault?: boolean;
  isUserDefault?: boolean;
  isUserSelected?: boolean;
  isCompatible?: boolean;
  schemaVersion?: number;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface VariantIntegrationMessages {
  variantLabel?: string;
  variantPlaceholder?: string;
  variantNewButtonLabel?: string;
  variantNamePlaceholder?: string;
  variantModalTitle?: string;
  defaultVariantName?: string;
  // iter-35 — empty-state affordances inside the toolbar selector
  variantsEmptyHintLabel?: string; // disabled hint shown inside the listbox
  variantsCreateNewLabel?: string; // clickable "+ Yeni Varyant Oluştur" item
  // Section headers
  personalVariantsTitle?: string;
  globalVariantsTitle?: string;
  personalVariantsEmptyLabel?: string;
  globalVariantsEmptyLabel?: string;
  // Actions
  menuSelectLabel?: string;
  menuRenameLabel?: string;
  menuSetDefaultLabel?: string;
  menuUnsetDefaultLabel?: string;
  menuSetGlobalDefaultLabel?: string;
  menuUnsetGlobalDefaultLabel?: string;
  menuMoveToGlobalLabel?: string;
  menuMoveToPersonalLabel?: string;
  menuDeleteLabel?: string;
  saveCurrentStateLabel?: string;
  saveLabel?: string;
  cancelLabel?: string;
  // Tags
  selectedTagLabel?: string;
  personalTagLabel?: string;
  personalDefaultTagLabel?: string;
  globalPublicTagLabel?: string;
  globalPublicDefaultTagLabel?: string;
  incompatibleTagLabel?: string;
  // Detail
  showDetailsLabel?: string;
  hideDetailsLabel?: string;
  variantActionsLabel?: string;
  moveToPersonalTitle?: string;
  moveToGlobalTitle?: string;
  saveCurrentLayoutTitle?: string;
  saveTitle?: string;
  // Feedback
  variantSavedLabel?: string;
  variantSaveFailedLabel?: string;
  variantCreatedLabel?: string;
  variantCreateFailedLabel?: string;
  variantDeletedLabel?: string;
  variantDeleteFailedLabel?: string;
  variantPromotedToGlobalLabel?: string;
  variantDemotedToPersonalLabel?: string;
  variantGlobalStatusUpdateFailedLabel?: string;
  defaultViewEnabledLabel?: string;
  defaultViewDisabledLabel?: string;
  defaultStateUpdateFailedLabel?: string;
  deleteVariantConfirmationLabel?: string;
  closeVariantManagerLabel?: string;
  variantNameEmptyLabel?: string;
  variantNameUpdatedLabel?: string;
  variantNameUpdateFailedLabel?: string;
  variantPreferenceUpdateFailedLabel?: string;
  // PR-0.5e (Codex thread 019e2de0) — local working-layout draft.
  /** Dirty indicator copy shown when unsaved layout changes exist. */
  draftDirtyLabel?: string;
  /** "Kaydedilmiş görünüme dön" reset control label. */
  draftResetLabel?: string;
  /** Tooltip for the reset control. */
  draftResetTitle?: string;
}

/** Props for the VariantIntegration component. */
export interface VariantIntegrationProps<RowData = unknown> extends AccessControlledProps {
  /** Grid ID for variant isolation */
  gridId: string;
  /** Grid schema version for compatibility check */
  gridSchemaVersion: number;
  /** Reference to current GridApi */
  gridApi: GridApi<RowData> | null;
  /** Active variant ID */
  activeVariantId?: string;
  /** Variant change callback */
  onActiveVariantChange?: (variantId: string | null) => void;
  /** i18n messages */
  messages?: VariantIntegrationMessages;
  /** Whether the current user can promote personal variants to global */
  canPromoteToGlobal?: boolean;
  /** Whether the current user can demote global variants to personal */
  canDemoteToPersonal?: boolean;
  /** Whether the current user can delete global variants */
  canDeleteGlobal?: boolean;
  /** Additional CSS class for custom styling */
  className?: string;
  /**
   * PR #272c (reporting hardening, 2026-05): optional sanitizer that
   * runs over a saved variant's column state before {@code applyColumnState}
   * is invoked. Caller can strip {@code rowGroup}, {@code rowGroupIndex},
   * {@code aggFunc}, {@code pivot}, {@code pivotIndex} for columns the
   * backend doesn't allow as group/value/pivot dimensions, so a stale
   * variant restored under a more restrictive capability envelope can't
   * push the grid into a state the backend will reject.
   *
   * <p>Contract:
   * <ul>
   *   <li><b>Pure function</b>: caller MUST treat the input as immutable.
   *       The component passes a defensive shallow copy so in-place
   *       mutation is safe locally, but mutating + returning the same
   *       reference is fragile when other callers chain sanitizers.</li>
   *   <li>Always returns the array to apply (never {@code undefined}).
   *       Use {@code NonNullable<GridVariantState['columnState']>} so
   *       callers don't need to handle the optional case.</li>
   * </ul>
   */
  sanitizeColumnState?: (state: VariantColumnState) => VariantColumnState;
  /**
   * PR #272c: paired sanitizer for the {@code pivotMode} flag. Returns
   * the value that should actually be applied to the grid; useful when
   * a saved variant carries {@code pivotMode=true} but the report's
   * current capability envelope doesn't expose pivot.
   */
  sanitizePivotMode?: (pivotMode: boolean | undefined) => boolean | undefined;
  /**
   * PR-0.5e (Codex thread 019e2de0) — local working-layout draft.
   *
   * When provided, column resize / pin / move events auto-persist a
   * layout-only draft to {@code localStorage} (namespace
   * {@code grid-layout-draft}) WITHOUT touching the backend variant.
   * On the next grid mount the draft is overlaid on top of the
   * selected/default variant so the user's last working layout
   * survives a reload even when they never clicked "Kaydet".
   *
   * The draft storage key is scoped by {@code gridId} + this identity
   * string + the selected variant id + a schema fingerprint derived
   * from {@link columnDefIds}. Pass a stable per-user/tenant
   * discriminator (e.g. {@code `${tenantId}:${userId}`}); when omitted
   * the draft layer is DISABLED entirely (no persistence, no dirty
   * indicator) so consumers that don't opt in keep the legacy
   * variant-only behaviour.
   */
  draftIdentity?: string;
  /**
   * PR-0.5e: column field names / colIds of the current grid, used to
   * derive the draft's schema fingerprint. When the column set changes
   * (a column added/removed) the fingerprint changes and any stale
   * draft is discarded. Order-independent — a pure reorder keeps the
   * same fingerprint. Required for the draft layer to activate
   * alongside {@link draftIdentity}.
   */
  columnDefIds?: ReadonlyArray<string | null | undefined>;
}

/**
 * Non-null alias of {@link GridVariantState#columnState}. Used in the
 * sanitizer callback signatures so callers don't have to handle the
 * optional case (the component never invokes the sanitizer with
 * {@code undefined}).
 */
export type VariantColumnState = NonNullable<GridVariantState['columnState']>;

/* ------------------------------------------------------------------ */
/*  State collection (v34 GridApi)                                     */
/* ------------------------------------------------------------------ */

function collectGridState<RowData>(api: GridApi<RowData>): GridVariantState {
  return {
    columnState: api.getColumnState?.() ?? [],
    filterModel: api.getFilterModel?.() ?? {},
    advancedFilterModel: api.getAdvancedFilterModel?.() ?? null,
    sortModel: (api.getColumnState?.() ?? [])
      .filter((c) => c.sort)
      .map((c) => ({
        colId: c.colId,
        sort: c.sort!,
        sortIndex: c.sortIndex,
      })),
    pivotMode: api.isPivotMode?.() ?? false,
    quickFilterText: (api.getGridOption?.('quickFilterText') as string) ?? '',
    paginationPageSize: (api.getGridOption?.('paginationPageSize') as number) ?? undefined,
  };
}

/**
 * Optional PR #272c sanitizer hooks — run over the variant state
 * immediately before AG Grid sees it, so columns the current
 * capability envelope doesn't allow as group/value/pivot can't be
 * smuggled in via a stale saved variant.
 */
type ApplyVariantSanitizers = {
  sanitizeColumnState?: (state: VariantColumnState) => VariantColumnState;
  sanitizePivotMode?: (pivotMode: boolean | undefined) => boolean | undefined;
};

/**
 * Defensive shallow copy of an AG Grid {@code ColumnState[]} array.
 * Each entry is itself shallow-cloned so a sanitizer that mutates an
 * entry in place can't poison the cached variant object. Plain object
 * structure (no nested arrays per AG Grid v34 ColumnState shape) so
 * shallow copy is sufficient.
 */
function cloneColumnState(state: VariantColumnState): VariantColumnState {
  return state.map((entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? { ...(entry as Record<string, unknown>) }
      : entry,
  ) as VariantColumnState;
}

function applyVariantState<RowData>(
  api: GridApi<RowData>,
  state: GridVariantState,
  sanitizers: ApplyVariantSanitizers = {},
): void {
  if (state.columnState && Array.isArray(state.columnState)) {
    /*
     * Codex iter-1 absorb: pass a defensive shallow copy so a
     * sanitizer that mutates entries in place can't poison the cached
     * variant object inside the component's state.
     */
    const cloned = cloneColumnState(state.columnState as VariantColumnState);
    const sanitizedColumnState =
      typeof sanitizers.sanitizeColumnState === 'function'
        ? sanitizers.sanitizeColumnState(cloned)
        : cloned;
    api.applyColumnState?.({
      state: sanitizedColumnState as ColumnState[],
      applyOrder: true,
      defaultState: { hide: false },
    });
  }
  // Always apply filter model — null/undefined/{} clears existing filters
  api.setFilterModel?.(state.filterModel ?? null);
  if (state.advancedFilterModel !== undefined) {
    api.setAdvancedFilterModel?.(state.advancedFilterModel as AdvancedFilterModel);
  } else {
    // Clear advanced filter if variant has none
    api.setAdvancedFilterModel?.(null as unknown as AdvancedFilterModel);
  }
  const sanitizedPivotMode =
    typeof sanitizers.sanitizePivotMode === 'function'
      ? sanitizers.sanitizePivotMode(state.pivotMode)
      : state.pivotMode;
  if (typeof sanitizedPivotMode === 'boolean') {
    api.setGridOption?.('pivotMode', sanitizedPivotMode);
  }
  if (typeof state.quickFilterText === 'string') {
    api.setGridOption?.('quickFilterText', state.quickFilterText);
  }
  if (typeof state.paginationPageSize === 'number' && state.paginationPageSize > 0) {
    api.setGridOption?.('paginationPageSize', state.paginationPageSize);
  }
  // Refresh SSRM after applying variant state so filters/sort take effect
  const rowModelType = api.getGridOption?.('rowModelType');
  if (rowModelType === 'serverSide') {
    api.refreshServerSide?.({ purge: true });
  }
}

/**
 * PR-0.5e (Codex thread 019e2de0) — overlay a local working-layout
 * draft on top of the current grid column state.
 *
 * Restore order is: colDef defaults → variant ({@link applyVariantState}
 * already ran) → THEN this draft overlay last, so the draft is the
 * user's last working surface while the variant stays the base truth.
 *
 * Stale safety is delegated to {@link applyDraftOverColumnState}:
 * unknown {@code colId}s are ignored, only whitelisted layout fields
 * are merged, {@code width} is left for AG Grid to normalize against
 * the colDef min/max. A {@code null} draft is a no-op.
 */
function applyDraftLayer<RowData>(api: GridApi<RowData>, draft: LayoutDraft | null): void {
  if (!draft) return;
  const baseColumnState = api.getColumnState?.() ?? [];
  const nextColumnState = applyDraftOverColumnState(baseColumnState, draft);
  api.applyColumnState?.({
    state: nextColumnState as ColumnState[],
    applyOrder: true,
  });
}

function dispatchVariantToast(type: 'error' | 'success' | 'warning' | 'info', text: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, text } }));
  } catch {
    // ignore toast dispatch failures in non-browser or test runtimes
  }
}

/* ------------------------------------------------------------------ */
/*  Chevron icon                                                       */
/* ------------------------------------------------------------------ */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={cn(
        'shrink-0 transition-[rotate] duration-(--motion-duration-fast)',
        expanded && 'rotate-90',
      )}
    >
      <path
        d="M4.5 2.5L8 6L4.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/** Grid variant manager for saving, loading, and switching named column/filter configurations.
 * @example
 * ```tsx
 * <VariantIntegration />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/variant-integration)
 */
export const VariantIntegration = <RowData = unknown,>({
  gridId,
  gridSchemaVersion,
  gridApi,
  activeVariantId: controlledVariantId,
  onActiveVariantChange,
  messages,
  canPromoteToGlobal = false,
  canDemoteToPersonal = false,
  canDeleteGlobal = false,
  access,
  accessReason,
  sanitizeColumnState,
  sanitizePivotMode,
  draftIdentity,
  columnDefIds,
}: VariantIntegrationProps<RowData>): React.ReactElement => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return (<></>) as unknown as React.ReactElement;
  // ── Core state ─────────────────────────────────────────────────────
  const [variants, setVariants] = useState<GridVariant[]>([]);
  const [internalActiveId, setInternalActiveId] = useState<string | null>(
    controlledVariantId ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [showManager, setShowManager] = useState(false);
  const appliedRef = useRef<string | null>(null);

  // ── PR-0.5e — local working-layout draft ───────────────────────────
  // `isApplyingState` guards the restore step so applying the variant +
  // draft overlay does not re-trigger the column-event listeners into
  // writing a fresh (redundant) draft. `draftDirty` drives the dirty
  // indicator UI.
  const isApplyingStateRef = useRef(false);
  const [draftDirty, setDraftDirty] = useState(false);
  /*
   * PR-0.5e (Codex 019e2de0 REVISE finding 3) — the schema fingerprint
   * the draft overlay was LAST applied for. When `schemaFingerprint`
   * changes after the first apply (async colDef metadata for flat
   * reports) the layout-draft overlay must be retried for the new
   * schema. This is a layout-overlay-only re-apply — it never re-runs
   * the full variant/filter restore.
   */
  const lastAppliedSchemaRef = useRef<string | null>(null);
  /*
   * PR-0.5e fix — the variant id the draft overlay was LAST applied
   * for. Mirror of `lastAppliedSchemaRef` for the variant axis.
   *
   * The draft is keyed by the RESOLVED variant id. On reload the
   * variant list is fetched async, so the mount restore can run while
   * no variant is resolved yet (it lands on the `default`-scope draft).
   * When the variant subsequently resolves — or the controlled
   * `activeVariantId` transitions A→B after the first apply — the draft
   * for the now-resolved variant scope must be re-read and re-overlaid;
   * otherwise the `appliedRef.current` early-return swallows it and the
   * persisted layout (e.g. a pinned column) is silently dropped.
   *
   * Like the schema re-apply this is a layout-overlay-ONLY re-apply —
   * it never re-runs `applyVariantState` (no filter/sort/pivot
   * re-apply). `'__initial__'` is an impossible variant id used as
   * the "never applied a variant yet" sentinel so the very first
   * `target`-path apply is not mistaken for a transition.
   */
  const lastAppliedVariantRef = useRef<string | null>('__initial__');
  /*
   * PR-0.5e (Codex 019e2de0 REVISE finding 2) — the last pending draft
   * snapshot, captured AT EVENT TIME. The debounce timer writes this
   * ref and the effect cleanup flushes it, so the final mutation lands
   * in the correct scope even across a variant switch or an
   * unmount/reload that happens inside the debounce window.
   */
  const pendingDraftRef = useRef<{
    scope: DraftScope;
    columnState: unknown;
  } | null>(null);
  // Identity-aware draft enablement: the draft layer is OFF unless the
  // consumer passed a stable identity discriminator.
  const draftEnabled = typeof draftIdentity === 'string' && draftIdentity.trim().length > 0;
  // Order-independent schema fingerprint — a column add/remove changes
  // it (stale draft discarded), a pure reorder keeps it.
  const schemaFingerprint = useMemo(
    () => computeSchemaFingerprint(columnDefIds ?? []),
    [columnDefIds],
  );

  // ── Manager panel state ────────────────────────────────────────────
  const [renamingVariantId, setRenamingVariantId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const activeId = controlledVariantId ?? internalActiveId;
  const m = messages ?? {};

  // ── PR-0.5e — draft scope helper ───────────────────────────────────
  // The scope keys a draft to one report/grid + identity + variant +
  // column-schema combination so a draft on variant A never bleeds into
  // variant B. Built lazily for the CURRENTLY selected variant.
  const buildScope = useCallback(
    (variantId: string | null): DraftScope => ({
      gridId,
      identity: draftIdentity,
      variantId,
      schemaFingerprint,
    }),
    [gridId, draftIdentity, schemaFingerprint],
  );

  /*
   * PR-0.5e (Codex 019e2de0 REVISE iter-2 finding 1) — restore the
   * `default`-scope draft (buildScope(null)) onto the grid. This is the
   * "no variant selected / colDef default" working surface: there is no
   * backend variant to restore, but a layout draft the user built on
   * that surface must still survive a reload.
   *
   * Extracted into a named helper so it can be called from BOTH mount
   * auto-apply branches that land on the default surface:
   *  - `variants.length === 0` (no saved variants at all), and
   *  - `!target` (saved variants exist but none is selectable / default
   *    / compatible — `target` stays undefined).
   *
   * The `isApplyingStateRef` guard is raised so the programmatic overlay
   * is not captured by the column-event listeners as a fresh draft
   * write. Returns nothing; sets `draftDirty` from the draft presence.
   */
  const applyDefaultDraftScope = useCallback(() => {
    if (!gridApi || !draftEnabled) return;
    isApplyingStateRef.current = true;
    try {
      const draft = readDraft(buildScope(null));
      applyDraftLayer(gridApi, draft);
      setDraftDirty(draft !== null);
    } finally {
      isApplyingStateRef.current = false;
    }
  }, [gridApi, draftEnabled, buildScope]);

  /*
   * PR-0.5e (Codex 019e2de0 REVISE iter-2 finding 2) — scope-aware
   * pending-draft clear. `handleSave` / `handleResetDraft` must drop the
   * in-flight debounced snapshot so a timer firing after the
   * save/reset can't resurrect the just-cleared draft — but a blanket
   * `pendingDraftRef.current = null` also discards a pending mutation
   * that belongs to a DIFFERENT scope (the user resized in variant A,
   * switched to B, then saved/reset B before A's ~250ms debounce
   * fired → A's resize is silently lost).
   *
   * This helper instead flushes a pending mutation whose scope differs
   * from the one being saved/reset to ITS OWN scope before clearing the
   * ref, and only drops a pending mutation that targets the SAME scope.
   */
  const clearOrFlushPendingDraftForScope = useCallback((scopeToClear: DraftScope) => {
    const pending = pendingDraftRef.current;
    if (!pending) return;
    if (buildDraftKey(pending.scope) !== buildDraftKey(scopeToClear)) {
      writeDraft(pending.scope, pending.columnState);
    }
    pendingDraftRef.current = null;
  }, []);

  // ── Accordion ──────────────────────────────────────────────────────
  const accordion = useAccordion({ multiple: false });

  // ── Derived lists ──────────────────────────────────────────────────
  const personalVariants = useMemo(
    () =>
      variants
        .filter((v) => !v.isGlobal)
        .sort(compareGridVariants as (a: GridVariant, b: GridVariant) => number),
    [variants],
  );
  const globalVariants = useMemo(
    () =>
      variants
        .filter((v) => v.isGlobal)
        .sort(compareGridVariants as (a: GridVariant, b: GridVariant) => number),
    [variants],
  );

  /*
   * PR-0.5e fix — resolve the variant the grid should currently reflect.
   * Priority: requested initial variant → user selected → user default
   * → global default → first compatible. Returns `undefined` when no
   * variant is resolvable (the "no variant / colDef default" surface).
   *
   * Extracted from the auto-apply effect so the same resolution can be
   * consulted from the `appliedRef.current` early-return branch to
   * detect a variant-id transition (variant resolves async after mount,
   * or the controlled `activeVariantId` moves A→B).
   */
  const resolveTargetVariant = useCallback((): GridVariant | undefined => {
    if (variants.length === 0) return undefined;
    const requested = activeId
      ? variants.find((v) => v.id === activeId && v.isCompatible !== false)
      : null;
    const selected = variants.find((v) => v.isUserSelected);
    const userDefault = variants.find((v) => v.isUserDefault);
    const globalDefault = variants.find((v) => v.isGlobalDefault);
    const firstCompatible = variants.find((v) => v.isCompatible !== false);
    return requested ?? selected ?? userDefault ?? globalDefault ?? firstCompatible;
  }, [variants, activeId]);

  // ── Fetch variants ─────────────────────────────────────────────────
  const loadVariants = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchGridVariants(gridId);
      if (Array.isArray(result)) {
        setVariants(result as GridVariant[]);
      }
    } catch {
      // Graceful degradation — grid works without variants
    } finally {
      setLoading(false);
    }
  }, [gridId]);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  // ── Auto-apply on first load ───────────────────────────────────────
  useEffect(() => {
    if (!gridApi) return;

    /*
     * PR-0.5e (Codex 019e2de0 REVISE finding 3 + PR-0.5e variant-id
     * fix) — layout-overlay-only re-apply after the first variant
     * restore (`appliedRef.current` is set). Two async-ordering races
     * can leave the layout draft un-applied even though the variant
     * restore already ran:
     *
     *  - `schemaFingerprint` changed since — flat-report colDef
     *    metadata arrived async (finding 3).
     *  - the RESOLVED variant id changed since — the variant list
     *    resolved async after mount, or the controlled `activeVariantId`
     *    moved A→B (PR-0.5e variant-id fix). The draft is keyed by the
     *    resolved variant id, so a transition needs a fresh re-read for
     *    the new variant's scope.
     *
     * Either way the recovery is the SAME layout-overlay-only re-apply:
     * re-read the draft for `buildScope(currentVariantId)` and re-overlay
     * it WITHOUT re-running `applyVariantState` (no filter/sort/pivot
     * re-apply — those stay variant-only / explicit-save).
     */
    if (appliedRef.current && draftEnabled) {
      const resolvedVariantId = resolveTargetVariant()?.id ?? appliedRef.current;
      const variantChanged = lastAppliedVariantRef.current !== resolvedVariantId;
      const schemaChanged = lastAppliedSchemaRef.current !== schemaFingerprint;
      if (variantChanged || schemaChanged) {
        // A variant-id transition moves the draft scope to the newly
        // resolved variant; keep `appliedRef` aligned so subsequent
        // column-event writes + the dirty recompute target that scope.
        appliedRef.current = resolvedVariantId;
        isApplyingStateRef.current = true;
        try {
          const draft = readDraft(buildScope(resolvedVariantId));
          applyDraftLayer(gridApi, draft);
          setDraftDirty(draft !== null);
        } finally {
          isApplyingStateRef.current = false;
        }
        lastAppliedSchemaRef.current = schemaFingerprint;
        lastAppliedVariantRef.current = resolvedVariantId;
      }
      return;
    }
    if (appliedRef.current) return;

    if (variants.length === 0) {
      /*
       * PR-0.5e (Codex 019e2de0 REVISE finding 1) — no-variant /
       * "no variant selected" surface. There is no backend variant to
       * restore, but the draft layer must still honour the design's
       * "working layout draft even without a variant": read + overlay
       * the `default`-scope draft (buildScope(null)) and mark dirty.
       * appliedRef stays null so a real variant arriving later still
       * runs its own restore.
       */
      if (draftEnabled && lastAppliedSchemaRef.current !== schemaFingerprint) {
        applyDefaultDraftScope();
        lastAppliedSchemaRef.current = schemaFingerprint;
      }
      return;
    }

    // Priority: requested initial variant → user selected → user default → global default → first compatible
    const target = resolveTargetVariant();
    if (!target) {
      /*
       * PR-0.5e (Codex 019e2de0 REVISE iter-2 finding 1) — saved
       * variants exist but NONE is resolvable as a target (nothing
       * selected / default / compatible). `target` stays undefined and
       * the user is on the same "no variant selected / colDef default"
       * surface as the `variants.length === 0` case — an event write
       * there goes to the default scope, so the default-scope draft
       * must be restored here too. Without this the effect would
       * silently exit and the draft would never be re-applied on
       * reload. `appliedRef` stays null so a variant becoming
       * resolvable later still runs its own restore.
       */
      if (draftEnabled && lastAppliedSchemaRef.current !== schemaFingerprint) {
        applyDefaultDraftScope();
        lastAppliedSchemaRef.current = schemaFingerprint;
      }
      return;
    }

    /*
     * PR-0.5e (Codex 019e2de0) — restore order: colDef defaults →
     * variant → draft overlay LAST. The `isApplyingStateRef` guard is
     * raised across BOTH the variant apply and the draft overlay so
     * the column-event listeners (resize/pin/move) treat the whole
     * programmatic restore as a single non-user mutation and do NOT
     * write a redundant draft back.
     */
    isApplyingStateRef.current = true;
    try {
      applyVariantState(gridApi, target.state, { sanitizeColumnState, sanitizePivotMode });
      if (draftEnabled) {
        const draft = readDraft(buildScope(target.id));
        applyDraftLayer(gridApi, draft);
        setDraftDirty(draft !== null);
      }
    } finally {
      isApplyingStateRef.current = false;
    }
    appliedRef.current = target.id;
    lastAppliedSchemaRef.current = schemaFingerprint;
    // PR-0.5e fix — record the variant the draft overlay just ran for
    // so a later variant-id transition is detected as a transition.
    lastAppliedVariantRef.current = target.id;
    setInternalActiveId(target.id);
    onActiveVariantChange?.(target.id);
  }, [
    gridApi,
    variants,
    resolveTargetVariant,
    onActiveVariantChange,
    sanitizeColumnState,
    sanitizePivotMode,
    draftEnabled,
    schemaFingerprint,
    buildScope,
    applyDefaultDraftScope,
  ]);

  // ── Close manager on outside click ─────────────────────────────────
  const managerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showManager) return;
    const handler = (e: MouseEvent) => {
      if (
        managerRef.current &&
        !managerRef.current.contains(e.target as Node) &&
        toggleRef.current &&
        !toggleRef.current.contains(e.target as Node)
      ) {
        setShowManager(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showManager]);

  /*
   * PR-0.5e (Codex thread 019e2de0 §6) — auto-persist column layout.
   *
   * Wires AG Grid `columnResized` / `columnPinned` / `columnMoved` /
   * `columnVisible` events. On a (debounced) fire it snapshots
   * `getColumnState()`, whitelist-serializes it (only colId/width/
   * pinned/hide/order — `writeDraft` enforces this) and writes the
   * draft for the active variant scope.
   *
   * Guards:
   *  - `isApplyingStateRef` — skip while a programmatic variant/draft
   *    restore is in flight, so the restore can't re-trigger a write.
   *  - resize only acts on the FINAL event (`event.finished === true`)
   *    so a drag doesn't write a draft on every intermediate pixel.
   *  - the whole listener set is inert unless `draftEnabled`.
   */
  useEffect(() => {
    if (!gridApi || !draftEnabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /*
     * PR-0.5e (Codex 019e2de0 REVISE finding 2) — flush whatever is in
     * `pendingDraftRef`. The scope + columnState were captured AT EVENT
     * TIME, so a write that fires after a variant switch still lands in
     * the scope the mutation actually happened in (variant A), never
     * the scope that happens to be active when the timer runs.
     */
    const flushPendingDraft = () => {
      const pending = pendingDraftRef.current;
      pendingDraftRef.current = null;
      if (!pending) return;
      const draft = writeDraft(pending.scope, pending.columnState);
      // Only reflect the dirty state when the flushed scope is still the
      // active one — flushing variant A's pending write must not flip
      // the indicator for the now-selected variant B.
      if (buildDraftKey(pending.scope) === buildDraftKey(buildScope(appliedRef.current))) {
        setDraftDirty(draft !== null);
      }
    };

    const persistDraft = () => {
      debounceTimer = null;
      flushPendingDraft();
    };

    /*
     * Snapshot `{ scope, columnState }` AT EVENT TIME into
     * `pendingDraftRef` so the eventual write can't pick up a stale
     * scope. The timer just flushes the ref.
     */
    const schedulePersist = () => {
      if (isApplyingStateRef.current) return;
      pendingDraftRef.current = {
        scope: buildScope(appliedRef.current),
        columnState: gridApi.getColumnState?.() ?? [],
      };
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(persistDraft, 250);
    };

    // Resize fires continuously during a drag — only the terminal event
    // (`finished: true`) should produce a draft write.
    const handleColumnResized = (event: { finished?: boolean }) => {
      if (event?.finished !== true) return;
      schedulePersist();
    };
    const handleColumnPinned = () => schedulePersist();
    const handleColumnMoved = () => schedulePersist();
    const handleColumnVisible = () => schedulePersist();

    gridApi.addEventListener?.('columnResized', handleColumnResized);
    gridApi.addEventListener?.('columnPinned', handleColumnPinned);
    gridApi.addEventListener?.('columnMoved', handleColumnMoved);
    gridApi.addEventListener?.('columnVisible', handleColumnVisible);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      /*
       * PR-0.5e (Codex 019e2de0 REVISE finding 2) — flush the pending
       * draft BEFORE detaching. If a reload/unmount or a buildScope
       * dependency change lands inside the ~250ms debounce window, the
       * last resize/pin would otherwise be silently dropped — directly
       * defeating the "resize then reload preserves" acceptance.
       */
      flushPendingDraft();
      try {
        gridApi.removeEventListener?.('columnResized', handleColumnResized);
        gridApi.removeEventListener?.('columnPinned', handleColumnPinned);
        gridApi.removeEventListener?.('columnMoved', handleColumnMoved);
        gridApi.removeEventListener?.('columnVisible', handleColumnVisible);
      } catch {
        // gridApi may be destroyed mid-cleanup — harmless.
      }
    };
  }, [gridApi, draftEnabled, buildScope]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleSelect = useCallback(
    async (variantId: string) => {
      const variant = variants.find((v) => v.id === variantId);
      if (!variant || !gridApi) return;
      const previousActiveId = activeId;
      const _previousVariant = previousActiveId
        ? (variants.find((item) => item.id === previousActiveId) ?? null)
        : null;

      /*
       * PR-0.5e — switching variants re-runs the restore sequence
       * (variant → that variant's own draft overlay). The
       * `isApplyingStateRef` guard is raised so the column-event
       * listeners don't capture the programmatic mutation as a fresh
       * draft write. Each variant has its OWN draft scope, so variant
       * A's transient layout never leaks onto variant B.
       */
      isApplyingStateRef.current = true;
      try {
        applyVariantState(gridApi, variant.state, { sanitizeColumnState, sanitizePivotMode });
        if (draftEnabled) {
          const draft = readDraft(buildScope(variantId));
          applyDraftLayer(gridApi, draft);
          setDraftDirty(draft !== null);
        }
      } finally {
        isApplyingStateRef.current = false;
      }
      appliedRef.current = variantId;
      // PR-0.5e — the draft overlay just ran for the current schema +
      // variant; keep the schema- and variant-change trackers in sync
      // so the auto-apply effect does not redundantly re-overlay.
      lastAppliedSchemaRef.current = schemaFingerprint;
      lastAppliedVariantRef.current = variantId;
      setInternalActiveId(variantId);
      onActiveVariantChange?.(variantId);

      try {
        await updateVariantPreference({ variantId, isSelected: true, gridId });
      } catch {
        // Preference sync failed (e.g. 401) — keep variant applied locally.
        // updateVariantPreference already falls back to localStorage.
        dispatchVariantToast(
          'warning',
          m.variantPreferenceUpdateFailedLabel ?? 'Varyant tercihi sunucuya kaydedilemedi',
        );
      }
    },
    [
      activeId,
      gridApi,
      gridId,
      m.variantPreferenceUpdateFailedLabel,
      onActiveVariantChange,
      variants,
      sanitizeColumnState,
      sanitizePivotMode,
      draftEnabled,
      schemaFingerprint,
      buildScope,
    ],
  );

  const handleClear = useCallback(() => {
    setInternalActiveId(null);
    appliedRef.current = null;
    // Clear variant-specific filters and sort when deselecting
    if (gridApi) {
      gridApi.setFilterModel?.(null);
      gridApi.setAdvancedFilterModel?.(null as unknown as AdvancedFilterModel);
      gridApi.setGridOption?.('quickFilterText', '');
      const rowModelType = gridApi.getGridOption?.('rowModelType');
      if (rowModelType === 'serverSide') {
        gridApi.refreshServerSide?.({ purge: true });
      }
    }
    /*
     * PR-0.5e (Codex 019e2de0 REVISE finding 1) — deselecting a variant
     * drops onto the no-variant ("default") surface, which has its OWN
     * draft scope. Overlay that default-scope draft (so a working
     * layout the user built without a variant survives) and recompute
     * the dirty indicator against the default scope instead of leaving
     * it stale from the variant that was just deselected. Reset
     * `lastAppliedSchemaRef` so the auto-apply effect treats the
     * default surface as a fresh apply target.
     */
    if (draftEnabled && gridApi) {
      isApplyingStateRef.current = true;
      try {
        const draft = readDraft(buildScope(null));
        applyDraftLayer(gridApi, draft);
        setDraftDirty(draft !== null);
      } finally {
        isApplyingStateRef.current = false;
      }
      lastAppliedSchemaRef.current = schemaFingerprint;
      // PR-0.5e fix — the default-scope draft is now the applied
      // overlay; align the variant-change tracker with the no-variant
      // surface (`appliedRef.current` is null).
      lastAppliedVariantRef.current = null;
    }
    onActiveVariantChange?.(null);
  }, [gridApi, onActiveVariantChange, draftEnabled, schemaFingerprint, buildScope]);

  const handleSave = useCallback(
    async (variantId: string) => {
      if (!gridApi) return;
      setPendingAction(`save-${variantId}`);
      const state = collectGridState(gridApi);
      try {
        await updateGridVariant({
          id: variantId,
          state: state as Record<string, unknown>,
          schemaVersion: gridSchemaVersion,
        });
        await loadVariants();
        /*
         * PR-0.5e (Codex 019e2de0 §5) — the explicit "Kaydet" flow
         * persists the current layout INTO the variant; the transient
         * draft is now redundant, so clear it and drop the dirty
         * indicator. `collectGridState` above already captured the
         * live layout, so no information is lost. Also drop any
         * in-flight debounced write (finding 2) so a timer firing
         * after the save can't resurrect the just-cleared draft —
         * scope-aware (REVISE iter-2 finding 2) so a pending mutation
         * for a DIFFERENT variant's scope is flushed to its own scope
         * instead of being silently dropped.
         */
        if (draftEnabled) {
          clearDraft(buildScope(variantId));
          clearOrFlushPendingDraftForScope(buildScope(variantId));
          setDraftDirty(false);
        }
      } catch {
        // silent
      } finally {
        setPendingAction(null);
      }
    },
    [
      gridApi,
      gridSchemaVersion,
      loadVariants,
      draftEnabled,
      buildScope,
      clearOrFlushPendingDraftForScope,
    ],
  );

  /*
   * PR-0.5e (Codex 019e2de0 §5) — "Kaydedilmiş görünüme dön" (reset).
   * Deletes the local layout draft and reverts the grid to the
   * variant/default base state by re-running `applyVariantState`
   * WITHOUT the draft overlay. The `isApplyingStateRef` guard keeps the
   * re-apply from being captured as a new draft. When no variant is
   * selected the grid simply drops back to its colDef defaults
   * (`applyColumnState` with no state + a `hide:false` default).
   */
  const handleResetDraft = useCallback(() => {
    if (!draftEnabled) return;
    const variantId = appliedRef.current;
    clearDraft(buildScope(variantId));
    /*
     * PR-0.5e (Codex 019e2de0 REVISE finding 2) — drop any in-flight
     * debounced write. Without this, a timer that fires just after the
     * reset would re-persist the very draft the user just discarded.
     * Scope-aware (REVISE iter-2 finding 2): a pending mutation for a
     * DIFFERENT scope is flushed to its own scope first, so resetting
     * variant B can't silently drop variant A's not-yet-debounced
     * resize.
     */
    clearOrFlushPendingDraftForScope(buildScope(variantId));
    setDraftDirty(false);
    if (!gridApi) return;
    const variant = variantId ? variants.find((v) => v.id === variantId) : undefined;
    isApplyingStateRef.current = true;
    try {
      if (variant) {
        applyVariantState(gridApi, variant.state, { sanitizeColumnState, sanitizePivotMode });
      } else {
        // No variant — reset columns to their colDef defaults.
        gridApi.applyColumnState?.({ applyOrder: true, defaultState: { hide: false } });
      }
    } finally {
      isApplyingStateRef.current = false;
    }
    // Keep the finding-3 schema tracker aligned with the reapplied base.
    lastAppliedSchemaRef.current = schemaFingerprint;
  }, [
    draftEnabled,
    buildScope,
    clearOrFlushPendingDraftForScope,
    gridApi,
    variants,
    schemaFingerprint,
    sanitizeColumnState,
    sanitizePivotMode,
  ]);

  const handleCreate = useCallback(async () => {
    if (!gridApi) return;
    setPendingAction('create');
    const state = collectGridState(gridApi);
    const name = newVariantName.trim() || (m.defaultVariantName ?? 'Adsiz Varyant');
    try {
      const created = await createGridVariant({
        gridId,
        name,
        state: state as Record<string, unknown>,
        schemaVersion: gridSchemaVersion,
        isDefault: false,
        isGlobal: false,
        isGlobalDefault: false,
      });
      if (created && typeof created === 'object' && 'id' in created) {
        setInternalActiveId((created as { id: string }).id);
        onActiveVariantChange?.((created as { id: string }).id);
      }
      setNewVariantName('');
      await loadVariants();
    } catch {
      // silent
    } finally {
      setPendingAction(null);
    }
  }, [
    gridApi,
    gridId,
    gridSchemaVersion,
    newVariantName,
    m.defaultVariantName,
    onActiveVariantChange,
    loadVariants,
  ]);

  const handleDelete = useCallback(
    async (variantId: string) => {
      setPendingAction(`delete-${variantId}`);
      try {
        await deleteGridVariant(variantId);
        if (activeId === variantId) {
          setInternalActiveId(null);
          appliedRef.current = null;
          // PR-0.5e fix — the applied variant was deleted; clear the
          // variant-change tracker so the auto-apply effect treats the
          // next resolved variant (or default surface) as a fresh apply.
          lastAppliedVariantRef.current = null;
          onActiveVariantChange?.(null);
        }
        setConfirmDeleteId(null);
        // Optimistic state update — don't rely on loadVariants which may read stale cache
        setVariants((prev) => prev.filter((v) => v.id !== variantId));
      } catch {
        // silent — variant may still be in localStorage if API and local delete both failed
      } finally {
        setPendingAction(null);
      }
    },
    [activeId, onActiveVariantChange],
  );

  const handleClone = useCallback(
    async (variantId: string) => {
      setPendingAction(`clone-${variantId}`);
      try {
        await cloneGridVariant({ variantId });
        await loadVariants();
      } catch {
        // silent
      } finally {
        setPendingAction(null);
      }
    },
    [loadVariants],
  );

  const handleSetDefault = useCallback(
    async (variantId: string, isDefault: boolean) => {
      setPendingAction(`default-${variantId}`);
      try {
        await updateVariantPreference({ variantId, isDefault, gridId });
        await loadVariants();
      } catch {
        // silent
      } finally {
        setPendingAction(null);
      }
    },
    [loadVariants],
  );

  const handlePromoteToGlobal = useCallback(
    async (variantId: string) => {
      setPendingAction(`promote-${variantId}`);
      try {
        await updateGridVariant({ id: variantId, isGlobal: true });
        await loadVariants();
      } catch {
        // silent
      } finally {
        setPendingAction(null);
      }
    },
    [loadVariants],
  );

  const handleDemoteToPersonal = useCallback(
    async (variantId: string) => {
      setPendingAction(`demote-${variantId}`);
      try {
        await updateGridVariant({ id: variantId, isGlobal: false, isGlobalDefault: false });
        await loadVariants();
      } catch {
        // silent
      } finally {
        setPendingAction(null);
      }
    },
    [loadVariants],
  );

  const handleSetGlobalDefault = useCallback(
    async (variantId: string, isGlobalDefault: boolean) => {
      setPendingAction(`gdefault-${variantId}`);
      try {
        await updateGridVariant({ id: variantId, isGlobalDefault });
        await loadVariants();
      } catch {
        // silent
      } finally {
        setPendingAction(null);
      }
    },
    [loadVariants],
  );

  const handleRename = useCallback(
    async (variantId: string) => {
      const trimmed = renameValue.trim();
      if (!trimmed) {
        setRenamingVariantId(null);
        return;
      }
      setPendingAction(`rename-${variantId}`);
      try {
        await updateGridVariant({ id: variantId, name: trimmed });
        await loadVariants();
      } catch {
        // silent
      } finally {
        setRenamingVariantId(null);
        setPendingAction(null);
      }
    },
    [renameValue, loadVariants],
  );

  // ── Badge renderer ─────────────────────────────────────────────────

  const renderBadges = (v: GridVariant) => {
    const badges: React.ReactNode[] = [];

    if (v.id === activeId) {
      badges.push(
        <span
          key="sel"
          className="rounded-xs bg-action-primary/15 px-1 py-0.5 text-[10px] font-medium text-action-primary"
        >
          {m.selectedTagLabel ?? 'Secili'}
        </span>,
      );
    }
    if (v.isUserDefault) {
      badges.push(
        <span
          key="ud"
          className="rounded-xs bg-state-warning-bg px-1 py-0.5 text-[10px] font-medium text-state-warning-text"
        >
          {m.personalDefaultTagLabel ?? 'Varsayilan'}
        </span>,
      );
    }
    if (v.isGlobal && v.isGlobalDefault) {
      badges.push(
        <span
          key="gd"
          className="rounded-xs bg-state-success-bg px-1 py-0.5 text-[10px] font-medium text-state-success-text"
        >
          {m.globalPublicDefaultTagLabel ?? 'G. Varsayilan'}
        </span>,
      );
    }
    if (v.isCompatible === false) {
      badges.push(
        <span
          key="ic"
          className="rounded-xs bg-state-danger-bg px-1 py-0.5 text-[10px] font-medium text-state-danger-text"
        >
          {m.incompatibleTagLabel ?? 'Uyumsuz'}
        </span>,
      );
    }

    return badges.length > 0 ? <div className="flex items-center gap-1">{badges}</div> : null;
  };

  // ── Single variant row (accordion item) ────────────────────────────

  const renderVariantRow = (v: GridVariant, index: number) => {
    const itemState = accordion.getItemState(v.id);
    const triggerProps = itemState.getTriggerProps(index);
    const panelProps = itemState.getPanelProps();
    const isActive = v.id === activeId;
    const isBusy = pendingAction?.includes(v.id) ?? false;
    const isPersonal = !v.isGlobal;

    return (
      <div
        key={v.id}
        className={cn(
          'rounded-md border transition-colors',
          isActive
            ? 'border-action-primary/30 bg-action-primary/5'
            : 'border-transparent hover:bg-surface-muted',
        )}
      >
        {/* Collapsed row — h-8 compact */}
        <div className="flex h-8 items-center gap-1.5 px-2">
          {/* Select on name click */}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs font-medium text-text-primary"
            onClick={() => handleSelect(v.id)}
            title={v.name}
          >
            {renamingVariantId === v.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(v.id);
                  if (e.key === 'Escape') setRenamingVariantId(null);
                  e.stopPropagation();
                }}
                onBlur={() => handleRename(v.id)}
                onClick={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
                onInput={(e) => e.stopPropagation()}
                className="h-5 w-full rounded-xs border border-border-default bg-surface-default px-1 text-xs outline-hidden"
                autoFocus
              />
            ) : (
              v.name
            )}
          </button>

          {/* Badges */}
          {renderBadges(v)}

          {/* Accordion trigger (chevron) */}
          <button
            type="button"
            {...triggerProps}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-text-disabled hover:text-text-primary"
          >
            <ChevronIcon expanded={itemState.isExpanded} />
          </button>
        </div>

        {/* Expanded detail panel — accordion content */}
        <div {...panelProps} className={cn('overflow-hidden', !itemState.isExpanded && 'hidden')}>
          {confirmDeleteId === v.id ? (
            /* Delete confirmation */
            <div className="flex items-center gap-2 border-t border-border-subtle/50 px-2 py-2">
              <span className="flex-1 text-xs text-state-error-text">
                {m.deleteVariantConfirmationLabel ?? 'Silmek istediginize emin misiniz?'}
              </span>
              <button
                type="button"
                className="rounded-xs bg-state-error-text px-2 py-0.5 text-[10px] font-medium text-text-inverse hover:brightness-110 disabled:opacity-50"
                onClick={() => handleDelete(v.id)}
                disabled={isBusy}
              >
                {m.menuDeleteLabel ?? 'Sil'}
              </button>
              <button
                type="button"
                className="rounded-xs bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-surface-raised"
                onClick={() => setConfirmDeleteId(null)}
              >
                {m.cancelLabel ?? 'Iptal'}
              </button>
            </div>
          ) : (
            /* Action buttons */
            <div className="flex flex-wrap items-center gap-1 border-t border-border-subtle/50 px-2 py-2">
              {/* Save current state */}
              {isActive && (
                <ActionBtn
                  onClick={() => handleSave(v.id)}
                  disabled={isBusy}
                  title={m.saveCurrentLayoutTitle ?? 'Mevcut durumu kaydet'}
                >
                  {m.saveCurrentStateLabel ?? 'Kaydet'}
                </ActionBtn>
              )}

              {/* Set/Unset default */}
              {v.isUserDefault ? (
                <ActionBtn
                  onClick={() => handleSetDefault(v.id, false)}
                  disabled={isBusy}
                  variant="active"
                >
                  {m.menuUnsetDefaultLabel ?? 'Varsayilani Kaldir'}
                </ActionBtn>
              ) : (
                <ActionBtn onClick={() => handleSetDefault(v.id, true)} disabled={isBusy}>
                  {m.menuSetDefaultLabel ?? 'Varsayilan Yap'}
                </ActionBtn>
              )}

              {/* Personal-specific actions */}
              {isPersonal && (
                <>
                  {canPromoteToGlobal && (
                    <ActionBtn
                      onClick={() => handlePromoteToGlobal(v.id)}
                      disabled={isBusy}
                      title={m.moveToGlobalTitle ?? 'Paylasilan varyantlara tasi'}
                    >
                      {m.menuMoveToGlobalLabel ?? 'Globale Tasi'}
                    </ActionBtn>
                  )}
                  <ActionBtn
                    onClick={() => {
                      setRenamingVariantId(v.id);
                      setRenameValue(v.name);
                    }}
                    disabled={isBusy}
                  >
                    {m.menuRenameLabel ?? 'Yeniden Adlandir'}
                  </ActionBtn>
                  <ActionBtn
                    onClick={() => setConfirmDeleteId(v.id)}
                    disabled={isBusy}
                    variant="danger"
                  >
                    {m.menuDeleteLabel ?? 'Sil'}
                  </ActionBtn>
                </>
              )}

              {/* Global-specific actions */}
              {!isPersonal && (
                <>
                  {/* Clone to personal — everyone can do this */}
                  <ActionBtn onClick={() => handleClone(v.id)} disabled={isBusy}>
                    Kopya Al
                  </ActionBtn>

                  {/* Set/Unset global default — requires promote permission */}
                  {canPromoteToGlobal &&
                    (v.isGlobalDefault ? (
                      <ActionBtn
                        onClick={() => handleSetGlobalDefault(v.id, false)}
                        disabled={isBusy}
                        variant="active"
                      >
                        {m.menuUnsetGlobalDefaultLabel ?? 'G. Varsayilani Kaldir'}
                      </ActionBtn>
                    ) : (
                      <ActionBtn
                        onClick={() => handleSetGlobalDefault(v.id, true)}
                        disabled={isBusy}
                      >
                        {m.menuSetGlobalDefaultLabel ?? 'G. Varsayilan Yap'}
                      </ActionBtn>
                    ))}

                  {/* Demote to personal */}
                  {canDemoteToPersonal && (
                    <ActionBtn
                      onClick={() => handleDemoteToPersonal(v.id)}
                      disabled={isBusy}
                      title={m.moveToPersonalTitle ?? 'Kisisele tasi'}
                    >
                      {m.menuMoveToPersonalLabel ?? 'Kisisele Tasi'}
                    </ActionBtn>
                  )}

                  {/* Rename — only with permission */}
                  {canDemoteToPersonal && (
                    <ActionBtn
                      onClick={() => {
                        setRenamingVariantId(v.id);
                        setRenameValue(v.name);
                      }}
                      disabled={isBusy}
                    >
                      {m.menuRenameLabel ?? 'Yeniden Adlandir'}
                    </ActionBtn>
                  )}

                  {/* Delete global — requires canDeleteGlobal */}
                  {canDeleteGlobal && (
                    <ActionBtn
                      onClick={() => setConfirmDeleteId(v.id)}
                      disabled={isBusy}
                      variant="danger"
                    >
                      {m.menuDeleteLabel ?? 'Sil'}
                    </ActionBtn>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────

  // iter-35 \u2014 empty-state UX. Pre-iter-35 the <select> was disabled when no
  // variants existed, so end users clicked "\u2014 Variant \u2014" and nothing
  // happened ("son kullan\u0131c\u0131 bunun ne oldu\u011funu anlam\u0131yor"). Two coupled
  // affordances now make the empty state self-explaining:
  //   1. Listbox carries an inline disabled hint + a clickable
  //      "+ Yeni Varyant Olu\u015ftur" item (sentinel value CREATE_NEW_VALUE).
  //   2. Toolbar's gear button promotes to a primary-styled "+ Olu\u015ftur"
  //      label so the action is visible without opening the dropdown.
  // Either path opens the manage panel, where the existing create form
  // does the actual work.
  const CREATE_NEW_VALUE = '__create_new__';
  const isEmpty = variants.length === 0;

  return (
    <div className="relative">
      {/* Variant selector dropdown (inline in toolbar) */}
      <div
        className={`flex items-center gap-2 ${accessStyles(accessState.state)}`}
        data-component="variant-selector"
        data-access-state={accessState.state}
        data-empty={isEmpty ? 'true' : 'false'}
        title={accessReason}
      >
        <select
          value={activeId ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val === CREATE_NEW_VALUE) {
              setShowManager(true);
              // Don't propagate the sentinel into selection state \u2014 keep
              // value bound to activeId so the select snaps back to the
              // placeholder once the manage panel opens.
              return;
            }
            if (val) handleSelect(val);
            else handleClear();
          }}
          disabled={loading}
          className="h-8 min-w-[160px] rounded-md border border-border-default bg-surface-default px-2 text-sm text-text-primary"
          aria-label={m.variantLabel ?? 'Grid variant'}
          data-testid="variant-select"
        >
          <option value="">{m.variantPlaceholder ?? '\u2014 Variant \u2014'}</option>
          {isEmpty ? (
            <>
              <option value="" disabled>
                {m.variantsEmptyHintLabel ?? 'Henuz kayitli varyant yok'}
              </option>
              <option value={CREATE_NEW_VALUE} data-testid="variant-create-new-option">
                {`+ ${m.variantsCreateNewLabel ?? 'Yeni Varyant Olustur'}`}
              </option>
            </>
          ) : (
            <>
              {personalVariants.length > 0 && (
                <optgroup label={m.personalVariantsTitle ?? 'Kisisel'}>
                  {personalVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.isUserDefault ? ' \u2605' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {globalVariants.length > 0 && (
                <optgroup label={m.globalVariantsTitle ?? 'Paylasilan'}>
                  {globalVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.isGlobalDefault ? ' \u2605' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          )}
        </select>

        {activeId && (
          <button
            type="button"
            className="h-8 rounded-md bg-surface-muted px-2 text-xs font-medium text-text-secondary hover:bg-surface-raised"
            onClick={() => handleSave(activeId)}
            disabled={pendingAction === `save-${activeId}`}
            title={m.saveTitle ?? 'Save current state to variant'}
          >
            <IconSave size={14} />
          </button>
        )}

        {/*
          PR-0.5e (Codex 019e2de0 §5) — unsaved-layout dirty indicator +
          "Kaydedilmiş görünüme dön" reset. Only rendered when the draft
          layer is enabled AND a draft currently exists. The subtle
          warning chip sits next to the variant controls; the reset
          button next to it discards the draft and reverts to the
          variant/default base layout.
        */}
        {draftEnabled && draftDirty && (
          <div
            className="flex items-center gap-1.5"
            data-component="variant-layout-draft-indicator"
            data-testid="variant-layout-draft-indicator"
          >
            <span
              className="inline-flex h-8 items-center gap-1 rounded-md bg-state-warning-bg px-2 text-[11px] font-medium text-state-warning-text"
              title={m.draftDirtyLabel ?? 'Kaydedilmemiş görünüm değişiklikleri'}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-state-warning-text"
              />
              {m.draftDirtyLabel ?? 'Kaydedilmemiş görünüm değişiklikleri'}
            </span>
            <button
              type="button"
              className="h-8 rounded-md bg-surface-muted px-2 text-xs font-medium text-text-secondary hover:bg-surface-raised"
              onClick={handleResetDraft}
              title={m.draftResetTitle ?? 'Kaydedilmiş görünüme dön'}
              data-testid="variant-layout-draft-reset"
            >
              {m.draftResetLabel ?? 'Görünüme dön'}
            </button>
          </div>
        )}

        <button
          ref={toggleRef}
          type="button"
          className={
            isEmpty
              ? 'flex h-8 items-center gap-1 rounded-md bg-action-primary px-2.5 text-xs font-medium text-text-inverse hover:brightness-110'
              : 'h-8 rounded-md bg-surface-muted px-2 text-xs font-medium text-text-secondary hover:bg-surface-raised'
          }
          onClick={() => setShowManager(!showManager)}
          title={m.variantModalTitle ?? 'Manage variants'}
          aria-label={m.variantModalTitle ?? 'Varyantları yönet'}
          data-testid="variant-manage-toggle"
        >
          <IconSettings size={14} />
          {isEmpty ? <span>{m.variantNewButtonLabel ?? 'Olustur'}</span> : null}
        </button>
      </div>

      {/* Variant manager panel — portal to body to avoid overflow clipping */}
      {showManager &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={managerRef}
            className="fixed z-[9999] w-96 max-h-[70vh] overflow-y-auto rounded-lg border border-border-default bg-surface-default shadow-lg"
            data-component="variant-manager"
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            style={{
              top: toggleRef.current ? toggleRef.current.getBoundingClientRect().bottom + 4 : 200,
              left: toggleRef.current
                ? Math.min(
                    toggleRef.current.getBoundingClientRect().right - 384, // 384 = w-96
                    window.innerWidth - 400,
                  )
                : 100,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
              <h3 className="text-sm font-semibold text-text-primary">
                {m.variantModalTitle ?? 'Varyantlar'}
              </h3>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded-xs text-text-disabled hover:text-text-primary"
                onClick={() => setShowManager(false)}
                title={m.closeVariantManagerLabel ?? 'Kapat'}
              >
                <IconClose size={12} />
              </button>
            </div>

            {/* Create form — always creates personal */}
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
              <input
                type="text"
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                placeholder={m.variantNamePlaceholder ?? 'Varyant adi'}
                className="h-7 flex-1 rounded-xs border border-border-default bg-surface-default px-2 text-xs outline-hidden focus:border-action-primary"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleCreate();
                }}
                onKeyUp={(e) => e.stopPropagation()}
                onInput={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                className="h-7 rounded-xs bg-action-primary px-3 text-xs font-medium text-text-inverse hover:brightness-110 disabled:opacity-50"
                onClick={handleCreate}
                disabled={pendingAction === 'create'}
              >
                {m.variantNewButtonLabel ?? 'Olustur'}
              </button>
            </div>

            {/* Variant sections */}
            <div className="max-h-80 overflow-y-auto">
              {/* Personal section */}
              <div className="px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
                  {m.personalVariantsTitle ?? 'Kisisel'}
                </div>
                {personalVariants.length === 0 && !loading ? (
                  <p className="py-1 text-xs text-text-disabled">
                    {m.personalVariantsEmptyLabel ?? 'Kisisel varyant yok'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {personalVariants.map((v, i) => renderVariantRow(v, i))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="mx-3 border-t border-border-subtle" />

              {/* Global section */}
              <div className="px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
                  {m.globalVariantsTitle ?? 'Paylasilan'}
                </div>
                {globalVariants.length === 0 && !loading ? (
                  <p className="py-1 text-xs text-text-disabled">
                    {m.globalVariantsEmptyLabel ?? 'Paylasilan varyant yok'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {globalVariants.map((v, i) => renderVariantRow(v, personalVariants.length + i))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

VariantIntegration.displayName = 'VariantIntegration';

/* ------------------------------------------------------------------ */
/*  Action button (tiny, reused in accordion detail)                   */
/* ------------------------------------------------------------------ */

function ActionBtn({
  children,
  onClick,
  disabled,
  variant,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'danger' | 'active';
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-xs px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50',
        variant === 'danger'
          ? 'text-state-error-text hover:bg-state-danger-bg'
          : variant === 'active'
            ? 'bg-state-warning-bg text-state-warning-text hover:bg-[var(--state-warning-bg-hover)]'
            : 'text-text-secondary hover:bg-surface-muted',
      )}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export default VariantIntegration;
