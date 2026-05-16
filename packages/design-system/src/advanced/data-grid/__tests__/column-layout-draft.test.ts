/**
 * column-layout-draft — unit tests (PR-0.5e, Codex thread 019e2de0).
 *
 * Covers the pure draft-persistence module:
 *  - read / write / clear round-trips
 *  - key scoping (gridId + identity + variantId + schemaFingerprint)
 *  - whitelist enforcement (layout fields kept, semantic fields dropped)
 *  - schema-fingerprint discard (stale draft on column add/remove)
 *  - TTL expiry discard
 *  - applyDraftOverColumnState overlay + stale-colId safety
 *
 * Non-depth file (`*.test.ts`) so it runs under the standard
 * `vitest run` — the config excludes `*-depth.test.*`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VARIANT_KEY,
  LAYOUT_DRAFT_NAMESPACE,
  LAYOUT_DRAFT_TTL_MS,
  type DraftScope,
  applyDraftOverColumnState,
  buildDraftKey,
  clearDraft,
  computeSchemaFingerprint,
  isDraftDirty,
  readDraft,
  serializeColumnState,
  writeDraft,
} from '../column-layout-draft';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const FINGERPRINT = computeSchemaFingerprint(['name', 'email', 'role']);

const SCOPE: DraftScope = {
  gridId: 'report-grid-001',
  identity: 'tenant-9:user-42',
  variantId: 'variant-A',
  schemaFingerprint: FINGERPRINT,
};

/** A raw AG Grid `getColumnState()`-style array carrying BOTH whitelisted
 *  layout fields and semantic fields that must NOT be persisted. */
const RAW_COLUMN_STATE = [
  {
    colId: 'name',
    width: 240,
    pinned: 'left' as const,
    hide: false,
    // --- semantic fields — must be stripped ---
    sort: 'asc' as const,
    sortIndex: 0,
    rowGroup: true,
    rowGroupIndex: 0,
    aggFunc: 'sum',
    pivot: true,
    pivotIndex: 1,
    flex: 2,
  },
  { colId: 'email', width: 180, pinned: null, hide: false },
  { colId: 'role', width: 120, pinned: null, hide: true },
];

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  buildDraftKey — scoping                                            */
/* ------------------------------------------------------------------ */

describe('buildDraftKey', () => {
  it('composes the four identity inputs', () => {
    expect(buildDraftKey(SCOPE)).toBe(
      'report-grid-001::tenant-9:user-42::variant-A::' + FINGERPRINT,
    );
  });

  it('substitutes the "default" sentinel when no variant is selected', () => {
    expect(buildDraftKey({ ...SCOPE, variantId: null })).toContain(`::${DEFAULT_VARIANT_KEY}::`);
    expect(buildDraftKey({ ...SCOPE, variantId: undefined })).toContain(
      `::${DEFAULT_VARIANT_KEY}::`,
    );
    expect(buildDraftKey({ ...SCOPE, variantId: '   ' })).toContain(`::${DEFAULT_VARIANT_KEY}::`);
  });

  it('falls back to "anon" when identity is empty', () => {
    expect(buildDraftKey({ ...SCOPE, identity: undefined })).toContain('::anon::');
    expect(buildDraftKey({ ...SCOPE, identity: '' })).toContain('::anon::');
  });

  it('produces distinct keys per (gridId, identity, variant, fingerprint)', () => {
    const base = buildDraftKey(SCOPE);
    expect(buildDraftKey({ ...SCOPE, gridId: 'other' })).not.toBe(base);
    expect(buildDraftKey({ ...SCOPE, identity: 'other-user' })).not.toBe(base);
    expect(buildDraftKey({ ...SCOPE, variantId: 'variant-B' })).not.toBe(base);
    expect(buildDraftKey({ ...SCOPE, schemaFingerprint: 'zzz' })).not.toBe(base);
  });
});

/* ------------------------------------------------------------------ */
/*  serializeColumnState — whitelist                                   */
/* ------------------------------------------------------------------ */

describe('serializeColumnState — whitelist enforcement', () => {
  it('keeps only colId / width / pinned / hide', () => {
    const [first] = serializeColumnState(RAW_COLUMN_STATE);
    expect(first).toEqual({ colId: 'name', width: 240, pinned: 'left', hide: false });
  });

  it('drops sort / rowGroup / aggFunc / pivot / flex (semantic fields)', () => {
    const [first] = serializeColumnState(RAW_COLUMN_STATE) as Array<Record<string, unknown>>;
    expect(first.sort).toBeUndefined();
    expect(first.sortIndex).toBeUndefined();
    expect(first.rowGroup).toBeUndefined();
    expect(first.rowGroupIndex).toBeUndefined();
    expect(first.aggFunc).toBeUndefined();
    expect(first.pivot).toBeUndefined();
    expect(first.pivotIndex).toBeUndefined();
    expect(first.flex).toBeUndefined();
  });

  it('preserves column ORDER', () => {
    expect(serializeColumnState(RAW_COLUMN_STATE).map((c) => c.colId)).toEqual([
      'name',
      'email',
      'role',
    ]);
  });

  it('drops entries without a usable colId', () => {
    const result = serializeColumnState([
      { colId: 'ok', width: 100 },
      { width: 100 }, // no colId
      { colId: '', width: 100 }, // empty colId
      { colId: 42, width: 100 }, // non-string colId
      null,
      'garbage',
    ]);
    expect(result.map((c) => c.colId)).toEqual(['ok']);
  });

  it('returns [] for a non-array input', () => {
    expect(serializeColumnState(undefined)).toEqual([]);
    expect(serializeColumnState(null)).toEqual([]);
    expect(serializeColumnState({ colId: 'x' })).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.stringify(RAW_COLUMN_STATE);
    serializeColumnState(RAW_COLUMN_STATE);
    expect(JSON.stringify(RAW_COLUMN_STATE)).toBe(snapshot);
  });

  it('ignores a non-finite width and a bad pinned value', () => {
    const [first] = serializeColumnState([
      { colId: 'x', width: Number.NaN, pinned: 'middle', hide: 'yes' },
    ]) as Array<Record<string, unknown>>;
    expect(first.width).toBeUndefined();
    expect(first.pinned).toBeUndefined();
    expect(first.hide).toBeUndefined();
    expect(first.colId).toBe('x');
  });
});

/* ------------------------------------------------------------------ */
/*  computeSchemaFingerprint                                           */
/* ------------------------------------------------------------------ */

describe('computeSchemaFingerprint', () => {
  it('is order-independent (a pure reorder keeps the same fingerprint)', () => {
    expect(computeSchemaFingerprint(['a', 'b', 'c'])).toBe(
      computeSchemaFingerprint(['c', 'a', 'b']),
    );
  });

  it('changes when a column is added or removed', () => {
    const base = computeSchemaFingerprint(['a', 'b', 'c']);
    expect(computeSchemaFingerprint(['a', 'b', 'c', 'd'])).not.toBe(base);
    expect(computeSchemaFingerprint(['a', 'b'])).not.toBe(base);
  });

  it('ignores nullish / empty entries', () => {
    expect(computeSchemaFingerprint(['a', null, undefined, '', 'b'])).toBe(
      computeSchemaFingerprint(['a', 'b']),
    );
  });

  it('returns a stable sentinel for an empty column set', () => {
    expect(computeSchemaFingerprint([])).toBe('0');
    expect(computeSchemaFingerprint([null, undefined])).toBe('0');
  });
});

/* ------------------------------------------------------------------ */
/*  write / read / clear round-trip                                    */
/* ------------------------------------------------------------------ */

describe('writeDraft / readDraft / clearDraft', () => {
  it('writes a draft and reads it back whitelist-serialized', () => {
    const written = writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(written).not.toBeNull();
    const read = readDraft(SCOPE);
    expect(read).not.toBeNull();
    expect(read!.columns).toEqual([
      { colId: 'name', width: 240, pinned: 'left', hide: false },
      { colId: 'email', width: 180, pinned: null, hide: false },
      { colId: 'role', width: 120, pinned: null, hide: true },
    ]);
    expect(read!.schemaFingerprint).toBe(FINGERPRINT);
  });

  it('returns null when no draft exists for the scope', () => {
    expect(readDraft(SCOPE)).toBeNull();
  });

  it('persists under the grid-layout-draft namespace', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE)).not.toBeNull();
    // Variant namespaces are untouched.
    expect(window.localStorage.getItem('grid-variants')).toBeNull();
  });

  it('clearDraft removes the draft (idempotent)', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(readDraft(SCOPE)).not.toBeNull();
    clearDraft(SCOPE);
    expect(readDraft(SCOPE)).toBeNull();
    // Second clear is a harmless no-op.
    expect(() => clearDraft(SCOPE)).not.toThrow();
  });

  it('a write with an empty serialized column list clears instead of storing', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(readDraft(SCOPE)).not.toBeNull();
    // No entry has a usable colId → serializes to [] → treated as "no draft".
    const result = writeDraft(SCOPE, [{ width: 100 }, 'garbage']);
    expect(result).toBeNull();
    expect(readDraft(SCOPE)).toBeNull();
  });

  it('isDraftDirty reflects draft presence', () => {
    expect(isDraftDirty(SCOPE)).toBe(false);
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(isDraftDirty(SCOPE)).toBe(true);
    clearDraft(SCOPE);
    expect(isDraftDirty(SCOPE)).toBe(false);
  });

  it('the write whitelist also strips semantic fields from storage', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    const raw = window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE)!;
    // sort / rowGroup / aggFunc / pivot never reach the persisted JSON.
    expect(raw).not.toContain('rowGroup');
    expect(raw).not.toContain('aggFunc');
    expect(raw).not.toContain('pivotIndex');
    expect(raw).not.toContain('"sort"');
  });
});

/* ------------------------------------------------------------------ */
/*  Key scoping isolation                                              */
/* ------------------------------------------------------------------ */

describe('draft scoping — no cross-bleed', () => {
  it('a draft on variant A is not visible under variant B', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(readDraft({ ...SCOPE, variantId: 'variant-B' })).toBeNull();
  });

  it('a draft for one user is not visible to another user', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(readDraft({ ...SCOPE, identity: 'tenant-9:user-99' })).toBeNull();
  });

  it('a draft for one grid is not visible to another grid', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(readDraft({ ...SCOPE, gridId: 'other-grid' })).toBeNull();
  });

  it('the no-variant (default) draft is isolated from a named-variant draft', () => {
    const defaultScope: DraftScope = { ...SCOPE, variantId: null };
    writeDraft(defaultScope, RAW_COLUMN_STATE);
    expect(readDraft(SCOPE)).toBeNull(); // named variant A — separate
    expect(readDraft(defaultScope)).not.toBeNull();
  });

  it('drafts for distinct scopes coexist in the same namespace', () => {
    const scopeB: DraftScope = { ...SCOPE, variantId: 'variant-B' };
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    writeDraft(scopeB, [{ colId: 'email', width: 999 }]);
    expect(readDraft(SCOPE)!.columns).toHaveLength(3);
    expect(readDraft(scopeB)!.columns).toEqual([{ colId: 'email', width: 999 }]);
  });
});

/* ------------------------------------------------------------------ */
/*  Schema-fingerprint discard                                         */
/* ------------------------------------------------------------------ */

describe('schema-fingerprint discard', () => {
  it('discards the draft when the column schema changed', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    // Same grid+identity+variant, but a column was added → new fingerprint.
    const driftedFingerprint = computeSchemaFingerprint(['name', 'email', 'role', 'newCol']);
    const driftedScope: DraftScope = { ...SCOPE, schemaFingerprint: driftedFingerprint };
    expect(readDraft(driftedScope)).toBeNull();
  });

  it('a fingerprint mismatch read also purges the stale entry from storage', () => {
    // Hand-write a draft whose stored fingerprint disagrees with the
    // scope (simulates a draft written under an older column schema).
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    const raw = JSON.parse(window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE)!);
    const key = buildDraftKey(SCOPE);
    raw[key].schemaFingerprint = 'stale-fingerprint';
    window.localStorage.setItem(LAYOUT_DRAFT_NAMESPACE, JSON.stringify(raw));

    expect(readDraft(SCOPE)).toBeNull();
    // Purged — the stale key is gone.
    const after = JSON.parse(window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE)!);
    expect(after[key]).toBeUndefined();
  });

  it('a matching fingerprint reads the draft back', () => {
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    // Same column set in a different order → same fingerprint → draft survives.
    const reorderedFingerprint = computeSchemaFingerprint(['role', 'name', 'email']);
    expect(reorderedFingerprint).toBe(FINGERPRINT);
    expect(readDraft({ ...SCOPE, schemaFingerprint: reorderedFingerprint })).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  TTL expiry                                                         */
/* ------------------------------------------------------------------ */

describe('TTL expiry', () => {
  it('discards a draft older than LAYOUT_DRAFT_TTL_MS', () => {
    const t0 = new Date('2026-05-16T10:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    expect(readDraft(SCOPE)).not.toBeNull();

    // Advance just past the TTL.
    vi.setSystemTime(t0 + LAYOUT_DRAFT_TTL_MS + 1);
    expect(readDraft(SCOPE)).toBeNull();
  });

  it('keeps a draft still inside the TTL window', () => {
    const t0 = new Date('2026-05-16T10:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    writeDraft(SCOPE, RAW_COLUMN_STATE);

    vi.setSystemTime(t0 + LAYOUT_DRAFT_TTL_MS - 1000);
    expect(readDraft(SCOPE)).not.toBeNull();
  });

  it('an expired-draft read purges the stale entry', () => {
    const t0 = new Date('2026-05-16T10:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    writeDraft(SCOPE, RAW_COLUMN_STATE);
    const key = buildDraftKey(SCOPE);

    vi.setSystemTime(t0 + LAYOUT_DRAFT_TTL_MS + 5000);
    readDraft(SCOPE);
    const after = JSON.parse(window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE) ?? '{}');
    expect(after[key]).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Corrupt storage resilience                                         */
/* ------------------------------------------------------------------ */

describe('corrupt-storage resilience', () => {
  it('readDraft returns null on non-JSON namespace content', () => {
    window.localStorage.setItem(LAYOUT_DRAFT_NAMESPACE, '{not-json');
    expect(() => readDraft(SCOPE)).not.toThrow();
    expect(readDraft(SCOPE)).toBeNull();
  });

  it('readDraft discards a structurally-invalid stored draft', () => {
    const key = buildDraftKey(SCOPE);
    window.localStorage.setItem(
      LAYOUT_DRAFT_NAMESPACE,
      JSON.stringify({ [key]: { columns: 'not-an-array', schemaFingerprint: FINGERPRINT } }),
    );
    expect(readDraft(SCOPE)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  applyDraftOverColumnState — overlay                                */
/* ------------------------------------------------------------------ */

describe('applyDraftOverColumnState', () => {
  const baseState = [
    { colId: 'name', width: 100, pinned: null, hide: false, sort: 'asc' },
    { colId: 'email', width: 100, pinned: null, hide: false },
    { colId: 'role', width: 100, pinned: null, hide: false },
  ];

  it('returns a copy of the base when the draft is null', () => {
    const result = applyDraftOverColumnState(baseState, null);
    expect(result).toEqual(baseState);
    expect(result).not.toBe(baseState);
    expect(result[0]).not.toBe(baseState[0]);
  });

  it('merges whitelisted layout fields onto matching base columns', () => {
    const draft = writeDraft(SCOPE, [{ colId: 'name', width: 300, pinned: 'left', hide: true }])!;
    const result = applyDraftOverColumnState(baseState, draft);
    const name = result.find((c) => c.colId === 'name')!;
    expect(name.width).toBe(300);
    expect(name.pinned).toBe('left');
    expect(name.hide).toBe(true);
    // Non-layout base fields are preserved untouched.
    expect((name as Record<string, unknown>).sort).toBe('asc');
  });

  it('reorders columns to follow the draft order', () => {
    const draft = writeDraft(SCOPE, [
      { colId: 'role', width: 100 },
      { colId: 'name', width: 100 },
      { colId: 'email', width: 100 },
    ])!;
    const result = applyDraftOverColumnState(baseState, draft);
    expect(result.map((c) => c.colId)).toEqual(['role', 'name', 'email']);
  });

  it('ignores draft entries whose colId is not in the base (stale-safety)', () => {
    const draft = writeDraft(SCOPE, [
      { colId: 'name', width: 555 },
      { colId: 'ghost-column', width: 999 }, // not in base
    ])!;
    const result = applyDraftOverColumnState(baseState, draft);
    expect(result.map((c) => c.colId)).toEqual(['name', 'email', 'role']);
    expect(result.find((c) => c.colId === 'name')!.width).toBe(555);
    expect(result.find((c) => c.colId === 'ghost-column')).toBeUndefined();
  });

  it('appends base columns the draft does not mention, after the draft columns', () => {
    // Draft only knows about "role" — name + email keep their relative order after it.
    const draft = writeDraft(SCOPE, [{ colId: 'role', width: 100 }])!;
    const result = applyDraftOverColumnState(baseState, draft);
    expect(result.map((c) => c.colId)).toEqual(['role', 'name', 'email']);
  });

  it('does not mutate the base array or its entries', () => {
    const snapshot = JSON.stringify(baseState);
    const draft = writeDraft(SCOPE, [{ colId: 'name', width: 777 }])!;
    applyDraftOverColumnState(baseState, draft);
    expect(JSON.stringify(baseState)).toBe(snapshot);
  });
});
