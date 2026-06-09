import { describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import {
  _reconcileColumnStateWithGrid,
  _reconcileWithLiveColumns,
  type LiveGridColumn,
  type VariantColumnState,
} from '../VariantIntegration';

/**
 * AG-043 (#799) — column-state reconcile.
 *
 * The device grid persists AG Grid column state under the localStorage
 * `grid-variants` key. A variant saved before `active_user` shipped has no
 * entry for it; `applyColumnState({ applyOrder: true })` would tail the unknown
 * column and leave visibility to `defaultState` alone, so existing users don't
 * see it where the colDef put it (right after `agent_version`). These tests pin
 * the order-preserving merge that fixes it.
 */

const colId = (entry: VariantColumnState[number]): string | undefined => {
  if (!entry || typeof entry !== 'object') return undefined;
  const id = (entry as { colId?: unknown }).colId;
  return typeof id === 'string' ? id : undefined;
};
const ids = (state: VariantColumnState): (string | undefined)[] => state.map(colId);
const entryFor = (state: VariantColumnState, id: string): Record<string, unknown> | undefined =>
  state.find((e) => colId(e) === id) as Record<string, unknown> | undefined;

// Live device-grid column set in natural colDef order. `active_user` sits
// between `agent_version` and `domain_name`, exactly as the colDef declares it.
const LIVE: LiveGridColumn[] = [
  { colId: 'hostname', hide: false },
  { colId: 'os_type', hide: false },
  { colId: 'agent_version', hide: false },
  { colId: 'active_user', hide: false },
  { colId: 'domain_name', hide: false },
  { colId: 'status', hide: false },
  { colId: 'prohibited_status', hide: true }, // a hide:true-by-default column
];

// A variant saved before AG-043 — every column EXCEPT active_user, in default
// order, carrying user widths so we can prove they survive the merge.
const SAVED_PRE_AG043: VariantColumnState = [
  { colId: 'hostname', hide: false, width: 220 },
  { colId: 'os_type', hide: false, width: 160 },
  { colId: 'agent_version', hide: false, width: 140 },
  { colId: 'domain_name', hide: false, width: 150 },
  { colId: 'status', hide: false, width: 120 },
  { colId: 'prohibited_status', hide: true, width: 130 },
] as VariantColumnState;

describe('_reconcileColumnStateWithGrid', () => {
  it('inserts a new column at its natural colDef position (active_user after agent_version)', () => {
    const merged = _reconcileColumnStateWithGrid(SAVED_PRE_AG043, LIVE);
    expect(ids(merged)).toEqual([
      'hostname',
      'os_type',
      'agent_version',
      'active_user', // spliced in right after agent_version
      'domain_name',
      'status',
      'prohibited_status',
    ]);
  });

  it('makes the new default-visible column visible (hide:false from colDef)', () => {
    const merged = _reconcileColumnStateWithGrid(SAVED_PRE_AG043, LIVE);
    expect(entryFor(merged, 'active_user')).toEqual({ colId: 'active_user', hide: false });
  });

  it('preserves the user saved width/visibility of pre-existing columns', () => {
    const merged = _reconcileColumnStateWithGrid(SAVED_PRE_AG043, LIVE);
    expect(entryFor(merged, 'hostname')).toEqual({ colId: 'hostname', hide: false, width: 220 });
    expect(entryFor(merged, 'agent_version')).toEqual({
      colId: 'agent_version',
      hide: false,
      width: 140,
    });
  });

  it('honours a colDef hide:true default for a newly-added hidden column', () => {
    // saved state knows none of the diagnostic columns; one of them defaults hidden
    const saved: VariantColumnState = [
      { colId: 'hostname', hide: false },
      { colId: 'agent_version', hide: false },
    ] as VariantColumnState;
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false },
      { colId: 'agent_version', hide: false },
      { colId: 'diag_hidden', hide: true },
    ];
    const merged = _reconcileColumnStateWithGrid(saved, live);
    expect(entryFor(merged, 'diag_hidden')).toEqual({ colId: 'diag_hidden', hide: true });
  });

  it('preserves a user-reordered saved layout and anchors the new column to its left neighbour', () => {
    // user moved status to the front; active_user must still land after agent_version
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false },
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
      { colId: 'active_user', hide: false }, // the only new column here
      { colId: 'domain_name', hide: false },
      { colId: 'status', hide: false },
    ];
    const reordered: VariantColumnState = [
      { colId: 'status', hide: false },
      { colId: 'hostname', hide: false },
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
      { colId: 'domain_name', hide: false },
    ] as VariantColumnState;
    const merged = _reconcileColumnStateWithGrid(reordered, live);
    expect(ids(merged)).toEqual([
      'status',
      'hostname',
      'os_type',
      'agent_version',
      'active_user',
      'domain_name',
    ]);
  });

  it('inserts a new leading column (natural index 0) at the front', () => {
    const saved: VariantColumnState = [
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
    ] as VariantColumnState;
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false }, // new, natural position 0
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
    ];
    const merged = _reconcileColumnStateWithGrid(saved, live);
    expect(ids(merged)).toEqual(['hostname', 'os_type', 'agent_version']);
  });

  it('keeps two adjacent new columns in natural order relative to each other', () => {
    const saved: VariantColumnState = [
      { colId: 'hostname', hide: false },
      { colId: 'status', hide: false },
    ] as VariantColumnState;
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false },
      { colId: 'agent_version', hide: false }, // new
      { colId: 'active_user', hide: false }, // new, immediately after
      { colId: 'status', hide: false },
    ];
    const merged = _reconcileColumnStateWithGrid(saved, live);
    expect(ids(merged)).toEqual(['hostname', 'agent_version', 'active_user', 'status']);
  });

  it('is a no-op (returns saved state) when nothing is missing', () => {
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false },
      { colId: 'agent_version', hide: false },
    ];
    const saved: VariantColumnState = [
      { colId: 'hostname', hide: false, width: 200 },
      { colId: 'agent_version', hide: false, width: 140 },
    ] as VariantColumnState;
    const merged = _reconcileColumnStateWithGrid(saved, live);
    expect(merged).toBe(saved); // identity — no allocation on the hot path
  });

  it('returns saved state unchanged when the grid exposes no live columns', () => {
    const merged = _reconcileColumnStateWithGrid(SAVED_PRE_AG043, []);
    expect(merged).toBe(SAVED_PRE_AG043);
  });

  it('passes stale saved colIds (columns no longer in the grid) through untouched', () => {
    // full pre-AG-043 set + a stale legacy col → only active_user is genuinely new
    const saved: VariantColumnState = [
      { colId: 'hostname', hide: false },
      { colId: 'removed_legacy_col', hide: false }, // not in live anymore
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
      { colId: 'domain_name', hide: false },
      { colId: 'status', hide: false },
      { colId: 'prohibited_status', hide: true },
    ] as VariantColumnState;
    const merged = _reconcileColumnStateWithGrid(saved, LIVE);
    // stale col is preserved in place; active_user still merged after agent_version
    expect(ids(merged)).toEqual([
      'hostname',
      'removed_legacy_col',
      'os_type',
      'agent_version',
      'active_user',
      'domain_name',
      'status',
      'prohibited_status',
    ]);
  });

  it('does not mutate the input saved-state array', () => {
    const saved: VariantColumnState = [
      { colId: 'hostname', hide: false },
      { colId: 'agent_version', hide: false },
    ] as VariantColumnState;
    const snapshot = ids(saved);
    _reconcileColumnStateWithGrid(saved, LIVE);
    expect(ids(saved)).toEqual(snapshot); // original untouched
  });

  // Codex review finding 1 — a user-reordered layout anchors the new column
  // after the RIGHT-MOST natural predecessor the user kept, not blindly after
  // its colDef neighbour. It must never jump ahead of a natural predecessor.
  it('anchors after the right-most kept natural predecessor in a reordered layout', () => {
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false },
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
      { colId: 'active_user', hide: false }, // new
      { colId: 'domain_name', hide: false },
    ];
    // user pulled agent_version to the front; hostname/os_type follow
    const saved: VariantColumnState = [
      { colId: 'agent_version', hide: false },
      { colId: 'hostname', hide: false },
      { colId: 'os_type', hide: false },
      { colId: 'domain_name', hide: false },
    ] as VariantColumnState;
    const merged = _reconcileColumnStateWithGrid(saved, live);
    // active_user lands after os_type (right-most of its kept predecessors),
    // i.e. it never sits before agent_version/hostname/os_type
    expect(ids(merged)).toEqual([
      'agent_version',
      'hostname',
      'os_type',
      'active_user',
      'domain_name',
    ]);
  });

  // Codex review finding 2 — a saved special column (selection checkbox /
  // auto-group) that getColumns() does not report must stay pinned-left; a new
  // leading primary column inserts AFTER it, never before it.
  it('keeps a leading special column (selection/auto-group) ahead of a new leading primary', () => {
    const saved: VariantColumnState = [
      { colId: 'ag-Grid-SelectionColumn', hide: false }, // not a colDef column
      { colId: 'os_type', hide: false },
    ] as VariantColumnState;
    const live: LiveGridColumn[] = [
      { colId: 'hostname', hide: false }, // new, natural position 0
      { colId: 'os_type', hide: false },
    ];
    const merged = _reconcileColumnStateWithGrid(saved, live);
    expect(ids(merged)).toEqual(['ag-Grid-SelectionColumn', 'hostname', 'os_type']);
  });

  // Codex review finding 4 — a malformed (null) saved entry must not crash the
  // insert scan; it passes through and the new column still merges correctly.
  it('tolerates a malformed null saved entry without crashing', () => {
    const saved = [
      null,
      { colId: 'hostname', hide: false },
      { colId: 'os_type', hide: false },
      { colId: 'agent_version', hide: false },
      { colId: 'domain_name', hide: false },
      { colId: 'status', hide: false },
      { colId: 'prohibited_status', hide: true },
    ] as unknown as VariantColumnState;
    const merged = _reconcileColumnStateWithGrid(saved, LIVE);
    const colIds = merged.map(colId); // drops the null silently
    expect(colIds).toContain('active_user');
    // active_user still anchored immediately after agent_version
    expect(colIds.indexOf('active_user')).toBe(colIds.indexOf('agent_version') + 1);
  });
});

/* ------------------------------------------------------------------ */
/*  _reconcileWithLiveColumns — GridApi adapter                        */
/* ------------------------------------------------------------------ */

type FakeColDef = { hide?: boolean; initialHide?: boolean };
const fakeColumn = (colId: string, colDef: FakeColDef = {}) => ({
  getColId: () => colId,
  getColDef: () => colDef,
});
// Minimal GridApi stub exposing only getColumns — enough for the adapter.
const fakeApi = (cols: ReturnType<typeof fakeColumn>[] | null): GridApi =>
  ({ getColumns: () => cols }) as unknown as GridApi;

describe('_reconcileWithLiveColumns', () => {
  const SAVED: VariantColumnState = [
    { colId: 'hostname', hide: false },
    { colId: 'agent_version', hide: false },
  ] as VariantColumnState;

  it('falls back to the raw saved state when getColumns is absent (partial mock)', () => {
    const api = {} as unknown as GridApi;
    expect(_reconcileWithLiveColumns(api, SAVED)).toBe(SAVED);
  });

  it('falls back to the raw saved state when getColumns returns null (grid not ready)', () => {
    expect(_reconcileWithLiveColumns(fakeApi(null), SAVED)).toBe(SAVED);
  });

  it('merges a new default-visible column read off the live GridApi', () => {
    const api = fakeApi([
      fakeColumn('hostname'),
      fakeColumn('agent_version'),
      fakeColumn('active_user'), // no hide → visible
    ]);
    const merged = _reconcileWithLiveColumns(api, SAVED);
    expect(merged.map(colId)).toEqual(['hostname', 'agent_version', 'active_user']);
    expect(merged.find((e) => colId(e) === 'active_user')).toEqual({
      colId: 'active_user',
      hide: false,
    });
  });

  // Codex review finding 3 — AG Grid resolves default visibility as
  // `hide ?? initialHide`; a colDef with only initialHide:true must insert hidden.
  it('honours colDef initialHide:true for a newly-added column', () => {
    const api = fakeApi([
      fakeColumn('hostname'),
      fakeColumn('diag_hidden', { initialHide: true }), // hidden by default
    ]);
    const merged = _reconcileWithLiveColumns(api, [
      { colId: 'hostname', hide: false },
    ] as VariantColumnState);
    expect(merged.find((e) => colId(e) === 'diag_hidden')).toEqual({
      colId: 'diag_hidden',
      hide: true,
    });
  });

  it('lets an explicit hide:false win over initialHide:true (hide ?? initialHide)', () => {
    const api = fakeApi([
      fakeColumn('hostname'),
      fakeColumn('forced_visible', { hide: false, initialHide: true }),
    ]);
    const merged = _reconcileWithLiveColumns(api, [
      { colId: 'hostname', hide: false },
    ] as VariantColumnState);
    expect(merged.find((e) => colId(e) === 'forced_visible')).toEqual({
      colId: 'forced_visible',
      hide: false,
    });
  });
});
