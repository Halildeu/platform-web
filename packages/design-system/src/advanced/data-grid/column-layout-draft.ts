/**
 * column-layout-draft — local "working-layout draft" persistence for the
 * reporting grid (PR-0.5e, Codex thread 019e2de0).
 *
 * ## Why this module exists
 *
 * AG Grid column layout (`width`, `pinned`, column order) is persisted to
 * the backend ONLY when the user explicitly saves a named "variant"
 * (see {@link ./VariantIntegration.tsx}). If the user resizes or pins a
 * column and reloads the page WITHOUT clicking "Kaydet", the change is
 * lost — a UX gap.
 *
 * The fix decided in Codex thread 019e2de0 is NOT to auto-save into the
 * backend variant. The variant system stays the single source of truth
 * for named saved views. Instead this module adds a **local
 * working-layout draft** layer on top:
 *
 *   colDef defaults → selected/default variant (applyVariantState) →
 *   THEN the local draft overlay applied last
 *
 * so the draft is the user's last working surface while the variant
 * remains the base truth.
 *
 * ## Whitelist contract (Codex 019e2de0 §4)
 *
 * The auto-draft persists ONLY layout fields: `colId`, `width`,
 * `pinned`, column order (implicit in array order) and optionally
 * `hide`. It MUST NOT persist `sort`, `filter`, `rowGroup` /
 * `rowGroupIndex`, `aggFunc`, `pivot` / `pivotIndex` — those change
 * report semantics and stay variant-only (explicit save).
 *
 * ## Key scoping (Codex 019e2de0 §2)
 *
 * The localStorage key is scoped by `reportId/gridId` + user/tenant
 * identity + the currently-selected variant id (or `'default'` when
 * none) + a schema fingerprint, so a transient layout draft on
 * variant A never bleeds into variant B and a stale draft from an
 * older column schema is discarded.
 *
 * The namespacing / TTL conventions mirror
 * {@link ../../lib/grid-variants/variants.api.ts} (the `grid-variants`
 * and `grid-variants-preferences` namespaces, the 5-min TTL pattern and
 * per-gridId keys). This module adds a new `grid-layout-draft`
 * namespace.
 *
 * All public functions are pure with respect to their inputs and only
 * touch `window.localStorage` — no React, no AG Grid imports — so the
 * module stays unit-testable in isolation.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * localStorage namespace for layout drafts. Sits alongside the
 * `grid-variants` / `grid-variants-preferences` namespaces owned by
 * {@link ../../lib/grid-variants/variants.api.ts}.
 */
export const LAYOUT_DRAFT_NAMESPACE = 'grid-layout-draft';

/**
 * Draft TTL — mirrors the 5-minute `GLOBAL_CACHE_TTL_MS` cadence used by
 * the grid-variants cache. A draft older than this is treated as stale
 * and discarded on read. The intent is "this is my CURRENT working
 * layout"; a draft left untouched for longer is unlikely to still
 * reflect what the user wants on the next visit.
 */
export const LAYOUT_DRAFT_TTL_MS = 5 * 60 * 1000;

/**
 * Sentinel used in the storage key when no variant is selected — keeps
 * the "no variant" draft isolated from any named variant's draft.
 */
export const DEFAULT_VARIANT_KEY = 'default';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * The whitelisted subset of an AG Grid `ColumnState` entry that a draft
 * is allowed to persist. `colId` identifies the column; `width` /
 * `pinned` / `hide` are layout fields; column ORDER is carried
 * implicitly by the array index.
 */
export interface DraftColumnState {
  colId: string;
  width?: number;
  /** AG Grid pinned value: `'left'` | `'right'` | `null` (not pinned). */
  pinned?: 'left' | 'right' | null;
  hide?: boolean;
}

/**
 * Persisted draft envelope. `schemaFingerprint` lets {@link readDraft}
 * discard the whole draft when the grid's column schema changed since
 * the draft was written; `updatedAt` drives the TTL check.
 */
export interface LayoutDraft {
  /** Whitelisted column layout — order is significant. */
  columns: DraftColumnState[];
  /** Stable hash of the column field/colId set the draft was built for. */
  schemaFingerprint: string;
  /** `Date.now()` at write time — drives the {@link LAYOUT_DRAFT_TTL_MS} check. */
  updatedAt: number;
}

/**
 * The four identity inputs that scope a draft to one
 * report/grid + user/tenant + variant + column-schema combination.
 */
export interface DraftScope {
  /** `reportId` / `gridId` — the grid instance. */
  gridId: string;
  /**
   * User/tenant identity discriminator. The design-system component is
   * identity-agnostic, so the consumer supplies this (e.g. a
   * `tenantId:userId` string). Falls back to `'anon'` when empty so a
   * key is always well-formed.
   */
  identity?: string;
  /** Currently-selected variant id, or `null`/`undefined` when none. */
  variantId?: string | null;
  /** Stable hash of the current column field set — see {@link computeSchemaFingerprint}. */
  schemaFingerprint: string;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const hasBrowserEnv = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/*
 * Whitelist note: a draft may carry ONLY `colId`, `width`, `pinned` and
 * `hide` (plus the implicit array-order). Everything else (`sort`,
 * `sortIndex`, `rowGroup`, `rowGroupIndex`, `aggFunc`, `pivot`,
 * `pivotIndex`, `flex`, …) is intentionally excluded — those fields
 * change report semantics and belong to the variant. The whitelist is
 * enforced field-by-field in {@link toDraftColumn} below (each field
 * needs its own type coercion, so a generic key loop is not used).
 */

/**
 * Persisted shape under {@link LAYOUT_DRAFT_NAMESPACE}: a flat map of
 * scoped-key → draft. One namespace holds every grid's drafts, matching
 * the `{ [gridId]: … }` layout used by the grid-variants cache.
 */
type PersistedDrafts = Record<string, LayoutDraft | undefined>;

/**
 * Build the scoped localStorage *sub-key* for a draft. Composed of the
 * four identity inputs joined by `::` so distinct scopes can never
 * collide. The whole map lives under {@link LAYOUT_DRAFT_NAMESPACE}.
 *
 * Exported for unit tests + so a consumer can pre-compute / inspect the
 * key; not needed for normal read/write/clear use.
 */
export const buildDraftKey = (scope: DraftScope): string => {
  const identity =
    scope.identity && scope.identity.trim().length > 0 ? scope.identity.trim() : 'anon';
  const variant =
    scope.variantId && String(scope.variantId).trim().length > 0
      ? String(scope.variantId).trim()
      : DEFAULT_VARIANT_KEY;
  return `${scope.gridId}::${identity}::${variant}::${scope.schemaFingerprint}`;
};

const readAllDrafts = (): PersistedDrafts => {
  if (!hasBrowserEnv()) return {};
  try {
    const raw = window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as PersistedDrafts;
  } catch {
    // Corrupt JSON — treat as empty rather than throwing into the grid.
    return {};
  }
};

const writeAllDrafts = (drafts: PersistedDrafts): void => {
  if (!hasBrowserEnv()) return;
  try {
    window.localStorage.setItem(LAYOUT_DRAFT_NAMESPACE, JSON.stringify(drafts));
  } catch {
    // Quota exceeded / storage disabled — silently degrade. The draft
    // layer is a convenience overlay; the variant remains authoritative.
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPinnedValue = (value: unknown): value is 'left' | 'right' | null =>
  value === 'left' || value === 'right' || value === null;

/**
 * Coerce a single arbitrary `ColumnState`-ish entry into a
 * {@link DraftColumnState}, keeping ONLY whitelisted keys. Returns
 * `null` for entries without a usable `colId` (they can't be matched
 * back to a column on restore).
 */
const toDraftColumn = (entry: unknown): DraftColumnState | null => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const colId = record.colId;
  if (typeof colId !== 'string' || colId.length === 0) return null;

  const draftColumn: DraftColumnState = { colId };
  if (isFiniteNumber(record.width)) {
    draftColumn.width = record.width;
  }
  if (isPinnedValue(record.pinned)) {
    draftColumn.pinned = record.pinned;
  }
  if (typeof record.hide === 'boolean') {
    draftColumn.hide = record.hide;
  }
  return draftColumn;
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Whitelist-serialize a raw AG Grid `getColumnState()` array into the
 * draft column shape. Drops every non-whitelisted field (`sort`,
 * `rowGroup`, `aggFunc`, `pivot`, …) and every entry without a `colId`.
 *
 * Column ORDER is preserved — the array index IS the persisted order.
 *
 * Pure: does not mutate the input.
 *
 * @param columnState raw `gridApi.getColumnState()` output (or anything
 *   array-shaped — non-arrays yield `[]`).
 */
export const serializeColumnState = (columnState: unknown): DraftColumnState[] => {
  if (!Array.isArray(columnState)) return [];
  const result: DraftColumnState[] = [];
  for (const entry of columnState) {
    const draftColumn = toDraftColumn(entry);
    if (draftColumn) {
      result.push(draftColumn);
    }
  }
  return result;
};

/**
 * Compute a stable schema fingerprint from a set of column identifiers
 * (field names or colIds). Order-independent — the same column set
 * always hashes to the same string regardless of the order it is
 * passed in — so a pure column REORDER does not invalidate the draft
 * (reorder is itself a layout change the draft wants to keep), while
 * ADDING or REMOVING a column DOES change the fingerprint and discards
 * the stale draft.
 *
 * Uses the well-known djb2 string hash rendered as base-36. Not a
 * cryptographic hash — collision risk is irrelevant here because the
 * fingerprint only gates "is this draft still for the same columns".
 *
 * @param colIds column field names / colIds; nullish/empty entries are ignored.
 */
export const computeSchemaFingerprint = (
  colIds: ReadonlyArray<string | null | undefined>,
): string => {
  const normalized = colIds
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice()
    .sort();
  if (normalized.length === 0) return '0';
  const joined = normalized.join('');
  // djb2
  let hash = 5381;
  for (let i = 0; i < joined.length; i += 1) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) | 0;
  }
  // >>> 0 → unsigned, base-36 keeps the key short.
  return `${(hash >>> 0).toString(36)}.${normalized.length.toString(36)}`;
};

/**
 * Read the layout draft for a given scope.
 *
 * Returns `null` when:
 *  - there is no draft for the scope,
 *  - the stored draft's `schemaFingerprint` does not match the current
 *    scope (column schema changed → draft discarded, and the stale
 *    entry is also purged from storage as a side effect),
 *  - the draft is older than {@link LAYOUT_DRAFT_TTL_MS} (also purged),
 *  - the stored payload is structurally invalid.
 *
 * @param scope identity inputs — see {@link DraftScope}.
 */
export const readDraft = (scope: DraftScope): LayoutDraft | null => {
  if (!hasBrowserEnv()) return null;
  const key = buildDraftKey(scope);
  const drafts = readAllDrafts();
  const stored = drafts[key];
  if (!stored || typeof stored !== 'object') return null;

  // Structural validation — defensive against hand-edited / corrupt storage.
  if (!Array.isArray(stored.columns) || typeof stored.schemaFingerprint !== 'string') {
    clearDraft(scope);
    return null;
  }

  // Schema-fingerprint guard: the column set changed since the draft was
  // written → the draft can no longer be trusted, discard it entirely.
  if (stored.schemaFingerprint !== scope.schemaFingerprint) {
    clearDraft(scope);
    return null;
  }

  // TTL guard.
  if (!isFiniteNumber(stored.updatedAt) || Date.now() - stored.updatedAt > LAYOUT_DRAFT_TTL_MS) {
    clearDraft(scope);
    return null;
  }

  // Re-serialize through the whitelist so any field that should never
  // have been persisted (older module version, hand-edited storage) is
  // stripped before the caller sees it.
  return {
    columns: serializeColumnState(stored.columns),
    schemaFingerprint: stored.schemaFingerprint,
    updatedAt: stored.updatedAt,
  };
};

/**
 * Write (create or replace) the layout draft for a scope.
 *
 * The `columnState` is whitelist-serialized via
 * {@link serializeColumnState} before it is stored — callers can pass a
 * raw `gridApi.getColumnState()` array and trust that `sort` / `filter`
 * / grouping / pivot fields never reach storage.
 *
 * A write with an empty serialized column list is treated as
 * "no draft" and {@link clearDraft}s the scope instead — this keeps an
 * effectively-empty draft from masquerading as a dirty state.
 *
 * @param scope identity inputs — see {@link DraftScope}.
 * @param columnState raw AG Grid column state (or pre-serialized draft columns).
 * @returns the persisted {@link LayoutDraft}, or `null` when nothing was stored.
 */
export const writeDraft = (scope: DraftScope, columnState: unknown): LayoutDraft | null => {
  if (!hasBrowserEnv()) return null;
  const columns = serializeColumnState(columnState);
  if (columns.length === 0) {
    clearDraft(scope);
    return null;
  }
  const draft: LayoutDraft = {
    columns,
    schemaFingerprint: scope.schemaFingerprint,
    updatedAt: Date.now(),
  };
  const drafts = readAllDrafts();
  drafts[buildDraftKey(scope)] = draft;
  writeAllDrafts(drafts);
  return draft;
};

/**
 * Delete the layout draft for a scope. Idempotent — a no-op when no
 * draft exists. This is the "Kaydedilmiş görünüme dön" (reset) path and
 * is also called by the explicit "Kaydet" flow to clear the dirty
 * state once the layout has been promoted into the variant.
 *
 * @param scope identity inputs — see {@link DraftScope}.
 */
export const clearDraft = (scope: DraftScope): void => {
  if (!hasBrowserEnv()) return;
  const key = buildDraftKey(scope);
  const drafts = readAllDrafts();
  if (key in drafts) {
    delete drafts[key];
    writeAllDrafts(drafts);
  }
};

/**
 * Whether a (valid, non-stale, schema-matching) draft currently exists
 * for the scope — i.e. whether the grid has unsaved layout changes.
 * Drives the "Kaydedilmemiş görünüm değişiklikleri" dirty indicator.
 *
 * @param scope identity inputs — see {@link DraftScope}.
 */
export const isDraftDirty = (scope: DraftScope): boolean => readDraft(scope) !== null;

/**
 * Apply a draft's whitelisted columns over a base AG Grid column state,
 * producing the column state to feed into `applyColumnState`.
 *
 * Stale/capability safety (Codex 019e2de0 §7):
 *  - Draft entries whose `colId` is NOT present in `baseColumnState`
 *    are ignored (unknown column — schema drift the fingerprint guard
 *    didn't catch, or a capability-stripped column).
 *  - Only the whitelisted layout fields are merged onto each base
 *    entry; every other base field is preserved untouched.
 *  - The RESULT ORDER follows the draft order for columns the draft
 *    knows about, with any base columns the draft does not mention
 *    appended afterwards in their original relative order. This is what
 *    makes a persisted column REORDER take effect.
 *  - `width` is passed through verbatim — AG Grid itself normalizes it
 *    to the colDef min/max when `applyColumnState` runs.
 *
 * Pure: neither argument is mutated.
 *
 * @param baseColumnState the variant-applied (or colDef-default) column state.
 * @param draft the draft to overlay; `null` returns a copy of the base.
 */
export const applyDraftOverColumnState = <T extends { colId?: string | null }>(
  baseColumnState: ReadonlyArray<T>,
  draft: LayoutDraft | null,
): T[] => {
  const base = Array.isArray(baseColumnState) ? baseColumnState : [];
  if (!draft || !Array.isArray(draft.columns) || draft.columns.length === 0) {
    return base.map((entry) => ({ ...entry }));
  }

  const baseByColId = new Map<string, T>();
  for (const entry of base) {
    if (entry && typeof entry.colId === 'string') {
      baseByColId.set(entry.colId, entry);
    }
  }

  const ordered: T[] = [];
  const consumed = new Set<string>();

  // 1. Draft-known columns first, in draft order, with layout fields merged.
  for (const draftColumn of draft.columns) {
    const baseEntry = baseByColId.get(draftColumn.colId);
    if (!baseEntry || consumed.has(draftColumn.colId)) {
      // Unknown colId → ignore (Codex §7 stale-safety).
      continue;
    }
    consumed.add(draftColumn.colId);
    const merged: T = { ...baseEntry };
    const writable = merged as Record<string, unknown>;
    if (draftColumn.width !== undefined) {
      writable.width = draftColumn.width;
    }
    if (draftColumn.pinned !== undefined) {
      writable.pinned = draftColumn.pinned;
    }
    if (draftColumn.hide !== undefined) {
      writable.hide = draftColumn.hide;
    }
    ordered.push(merged);
  }

  // 2. Any base column the draft did not mention, original relative order.
  for (const entry of base) {
    if (entry && typeof entry.colId === 'string' && consumed.has(entry.colId)) {
      continue;
    }
    ordered.push({ ...entry });
  }

  return ordered;
};
