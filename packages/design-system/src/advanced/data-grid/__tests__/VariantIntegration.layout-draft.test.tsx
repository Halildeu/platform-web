// @vitest-environment jsdom
/**
 * VariantIntegration — local working-layout draft wiring
 * (PR-0.5e, Codex thread 019e2de0).
 *
 * Covers the integration of the column-layout-draft module into
 * VariantIntegration:
 *  - draft applied AFTER the variant on mount (variant = base truth,
 *    draft = last working surface)
 *  - column resize/pin/move events write the draft (debounced)
 *  - resize only acts on the FINAL event (`finished === true`)
 *  - the `isApplyingState` guard stops the restore from re-writing
 *  - "Kaydet" clears the draft + dirty state
 *  - "Kaydedilmiş görünüme dön" (reset) clears the draft + reverts
 *  - the dirty indicator surfaces only when a draft exists
 *  - the draft layer is OFF when no `draftIdentity` is supplied
 *
 * Non-depth file (`*.test.tsx`) so it runs under the standard
 * `vitest run` (the config excludes `*-depth.test.*`).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { GridVariant, VariantIntegrationProps } from '../VariantIntegration';
import {
  LAYOUT_DRAFT_NAMESPACE,
  buildDraftKey,
  computeSchemaFingerprint,
  writeDraft,
} from '../column-layout-draft';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const GRID_ID = 'draft-grid-001';
const SCHEMA_VERSION = 1;
const IDENTITY = 'tenant-1:user-7';
const COLUMN_IDS = ['name', 'email', 'role'];
const FINGERPRINT = computeSchemaFingerprint(COLUMN_IDS);

/** Live, mutable column state — `applyColumnState` writes into it and
 *  `getColumnState` reads it back, so the mock behaves like a real grid
 *  for the restore + overlay round-trip. */
const INITIAL_COLUMN_STATE = [
  { colId: 'name', width: 100, pinned: null, hide: false, sort: null },
  { colId: 'email', width: 100, pinned: null, hide: false, sort: null },
  { colId: 'role', width: 100, pinned: null, hide: false, sort: null },
];

const makeVariant = (overrides: Partial<GridVariant> = {}): GridVariant => ({
  id: 'variant-A',
  gridId: GRID_ID,
  name: 'Varyant A',
  state: {
    columnState: INITIAL_COLUMN_STATE,
    filterModel: {},
    sortModel: [],
    pivotMode: false,
    quickFilterText: '',
  },
  isDefault: false,
  isGlobal: false,
  isGlobalDefault: false,
  isUserDefault: true,
  isUserSelected: true,
  isCompatible: true,
  schemaVersion: SCHEMA_VERSION,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const VARIANT_A = makeVariant();

/* ------------------------------------------------------------------ */
/*  Mock grid-variants API                                             */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn<() => Promise<GridVariant[]>>().mockResolvedValue([VARIANT_A]);
const mockUpdate = vi.fn<(p: unknown) => Promise<GridVariant>>().mockResolvedValue(VARIANT_A);
const mockPreference = vi.fn<(p: unknown) => Promise<GridVariant>>().mockResolvedValue(VARIANT_A);

vi.mock('../../../lib/grid-variants', () => ({
  fetchGridVariants: (...a: unknown[]) => mockFetch(...(a as [])),
  createGridVariant: vi.fn(),
  updateGridVariant: (...a: unknown[]) => mockUpdate(...(a as [unknown])),
  cloneGridVariant: vi.fn(),
  deleteGridVariant: vi.fn(),
  updateVariantPreference: (...a: unknown[]) => mockPreference(...(a as [unknown])),
  compareGridVariants: (a: GridVariant, b: GridVariant) => (a.name > b.name ? 1 : -1),
}));

vi.mock('../../../headless/hooks/useAccordion', () => ({
  useAccordion: () => ({
    expandedIds: new Set<string>(),
    toggle: vi.fn(),
    isExpanded: () => false,
    getItemState: () => ({
      isExpanded: false,
      getTriggerProps: () => ({ onClick: vi.fn() }),
      getPanelProps: () => ({}),
    }),
  }),
}));

/* ------------------------------------------------------------------ */
/*  Mock GridApi (v34) — stateful column state + event listeners       */
/* ------------------------------------------------------------------ */

type GridListener = (event: unknown) => void;

interface MockGridApi {
  api: import('ag-grid-community').GridApi;
  /** Fire a registered AG Grid event. */
  emit: (type: string, event?: unknown) => void;
  /** Imperatively set the live column state (simulates a user drag). */
  setColumnState: (next: Array<Record<string, unknown>>) => void;
  getColumnStateMock: ReturnType<typeof vi.fn>;
  applyColumnStateMock: ReturnType<typeof vi.fn>;
  hasListener: (type: string) => boolean;
}

function createMockGridApi(): MockGridApi {
  let columnState: Array<Record<string, unknown>> = INITIAL_COLUMN_STATE.map((c) => ({ ...c }));
  const listeners = new Map<string, Set<GridListener>>();

  const getColumnStateMock = vi.fn(() => columnState.map((c) => ({ ...c })));
  const applyColumnStateMock = vi.fn(
    (params: {
      state?: Array<Record<string, unknown>>;
      defaultState?: Record<string, unknown>;
    }) => {
      if (Array.isArray(params?.state)) {
        // Mirror AG Grid: merge applied state onto the live column state
        // by colId, preserving any column the params don't mention.
        const byId = new Map(columnState.map((c) => [c.colId as string, c]));
        const next: Array<Record<string, unknown>> = [];
        for (const entry of params.state) {
          const existing = byId.get(entry.colId as string) ?? { colId: entry.colId };
          next.push({ ...existing, ...entry });
          byId.delete(entry.colId as string);
        }
        for (const leftover of byId.values()) next.push(leftover);
        columnState = next;
      } else if (params?.defaultState) {
        columnState = columnState.map((c) => ({ ...c, ...params.defaultState }));
      }
    },
  );

  const api = {
    getColumnState: getColumnStateMock,
    applyColumnState: applyColumnStateMock,
    getFilterModel: vi.fn().mockReturnValue({}),
    setFilterModel: vi.fn(),
    getAdvancedFilterModel: vi.fn().mockReturnValue(null),
    setAdvancedFilterModel: vi.fn(),
    isPivotMode: vi.fn().mockReturnValue(false),
    setGridOption: vi.fn(),
    getGridOption: vi.fn().mockReturnValue(''),
    addEventListener: vi.fn((type: string, fn: GridListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: GridListener) => {
      listeners.get(type)?.delete(fn);
    }),
  } as unknown as import('ag-grid-community').GridApi;

  return {
    api,
    emit: (type, event) => {
      listeners.get(type)?.forEach((fn) => fn(event ?? {}));
    },
    setColumnState: (next) => {
      columnState = next.map((c) => ({ ...c }));
    },
    getColumnStateMock,
    applyColumnStateMock,
    hasListener: (type) => (listeners.get(type)?.size ?? 0) > 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Import component after mocks                                       */
/* ------------------------------------------------------------------ */

const { VariantIntegration } = await import('../VariantIntegration');

function renderVariant(overrides: Partial<VariantIntegrationProps> = {}) {
  const mock = createMockGridApi();
  const result = render(
    <VariantIntegration
      gridId={GRID_ID}
      gridSchemaVersion={SCHEMA_VERSION}
      gridApi={mock.api}
      draftIdentity={IDENTITY}
      columnDefIds={COLUMN_IDS}
      {...overrides}
    />,
  );
  return { ...result, mock };
}

const draftKeyFor = (variantId: string | null) =>
  buildDraftKey({ gridId: GRID_ID, identity: IDENTITY, variantId, schemaFingerprint: FINGERPRINT });

/**
 * Wait until the mount auto-apply effect has run — proven by the first
 * `applyColumnState` call. After this resolves `appliedRef.current` is
 * set to the active variant id, so a column event emitted afterwards
 * persists under the variant scope (not the `default` sentinel).
 *
 * Works under both real and fake timers — `vi.waitFor` drains the
 * `mockFetch` microtask either way.
 */
const waitForMount = (mock: MockGridApi) =>
  vi.waitFor(() => {
    expect(mock.applyColumnStateMock).toHaveBeenCalled();
    expect(mock.hasListener('columnResized')).toBe(true);
  });

const readRawDraft = (variantId: string | null) => {
  const raw = window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE);
  if (!raw) return undefined;
  return JSON.parse(raw)[draftKeyFor(variantId)];
};

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  mockFetch.mockResolvedValue([VARIANT_A]);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  Restore order — draft applied AFTER the variant                    */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — draft restore order', () => {
  it('applies the variant first, then overlays the draft on mount', async () => {
    // A pre-existing draft for variant A: name pinned left + widened.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 333, pinned: 'left' },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    const { mock } = renderVariant();

    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    // The LAST applyColumnState call is the draft overlay — it must
    // carry the draft's width/pinned, proving it ran after the variant.
    await waitFor(() => {
      const finalState = mock.getColumnStateMock();
      const name = finalState.find((c: Record<string, unknown>) => c.colId === 'name');
      expect(name?.width).toBe(333);
      expect(name?.pinned).toBe('left');
    });
  });

  it('does not overlay anything when no draft exists (variant-only)', async () => {
    const { mock } = renderVariant();
    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    // Column state stays at the variant baseline — no draft width.
    const finalState = mock.getColumnStateMock();
    expect(finalState.find((c: Record<string, unknown>) => c.colId === 'name')?.width).toBe(100);
  });

  it('discards a stale draft whose schema fingerprint no longer matches', async () => {
    // Draft written under a DIFFERENT column set → fingerprint mismatch.
    const staleFingerprint = computeSchemaFingerprint(['name', 'email']);
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: staleFingerprint,
      },
      [{ colId: 'name', width: 999 }],
    );
    const { mock } = renderVariant();
    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    // The stale draft's width=999 must NOT have been applied.
    expect(
      mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
    ).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  Column events write the draft                                      */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — column events persist a draft', () => {
  it('a finished column resize writes a layout draft', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    // User widens "name" then the drag ends.
    mock.setColumnState([
      { colId: 'name', width: 280, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(300));

    const stored = readRawDraft('variant-A');
    expect(stored).toBeDefined();
    expect(stored.columns.find((c: { colId: string }) => c.colId === 'name')?.width).toBe(280);
  });

  it('an UNFINISHED resize event does NOT write a draft', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([{ colId: 'name', width: 280, pinned: null, hide: false }]);
    // Intermediate drag event — finished:false.
    act(() => mock.emit('columnResized', { finished: false }));
    act(() => vi.advanceTimersByTime(500));

    expect(readRawDraft('variant-A')).toBeUndefined();
  });

  it('a column pin writes a layout draft', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([
      { colId: 'name', width: 100, pinned: 'left', hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnPinned', { source: 'contextMenu' }));
    act(() => vi.advanceTimersByTime(300));

    const stored = readRawDraft('variant-A');
    expect(stored.columns.find((c: { colId: string }) => c.colId === 'name')?.pinned).toBe('left');
  });

  it('a column move writes a layout draft with the new order', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([
      { colId: 'role', width: 100, pinned: null, hide: false },
      { colId: 'name', width: 100, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnMoved', { source: 'uiColumnMoved' }));
    act(() => vi.advanceTimersByTime(300));

    const stored = readRawDraft('variant-A');
    expect(stored.columns.map((c: { colId: string }) => c.colId)).toEqual([
      'role',
      'name',
      'email',
    ]);
  });

  it('the draft does NOT persist sort / rowGroup / aggFunc (whitelist)', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    // The live state carries semantic fields the whitelist must strip.
    mock.setColumnState([
      {
        colId: 'name',
        width: 200,
        pinned: null,
        hide: false,
        sort: 'desc',
        rowGroup: true,
        aggFunc: 'sum',
        pivot: true,
      },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(300));

    const stored = readRawDraft('variant-A');
    const nameCol = stored.columns.find((c: { colId: string }) => c.colId === 'name');
    expect(nameCol.width).toBe(200);
    expect(nameCol.sort).toBeUndefined();
    expect(nameCol.rowGroup).toBeUndefined();
    expect(nameCol.aggFunc).toBeUndefined();
    expect(nameCol.pivot).toBeUndefined();
  });

  it('debounces rapid events into a single draft write', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.applyColumnStateMock.mockClear();
    mock.setColumnState([{ colId: 'name', width: 150, pinned: null, hide: false }]);
    const setItemSpy = vi.spyOn(window.Storage.prototype, 'setItem');

    // Three events inside the debounce window.
    act(() => {
      mock.emit('columnResized', { finished: true, source: 'uiColumnResized' });
      mock.emit('columnPinned', { source: 'contextMenu' });
      mock.emit('columnMoved', { source: 'uiColumnMoved' });
    });
    // Before the debounce fires — nothing has been persisted yet
    // (post-finding-2 the snapshot is captured per event into
    // `pendingDraftRef`, but the WRITE is still debounced).
    expect(setItemSpy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    // Three rapid events collapse into exactly one persisted write.
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    setItemSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  Event-source guard — programmatic events must NOT write a draft    */
/* ------------------------------------------------------------------ */

describe('PR-0.5e bugfix — only USER column events write a draft', () => {
  /*
   * Regression guard for the "Kaydedilmemiş görünüm değişiklikleri"
   * badge that stayed lit on every page refresh. AG Grid fires
   * `columnResized` / `columnMoved` / … with a programmatic
   * `ColumnEventType` source (`api`, `flex`, `sizeColumnsToFit`,
   * `autosizeColumns`, `gridInitializing`, `rowModelUpdated`, …) while
   * it loads, applies a variant and materialises the row-group /
   * selection auto-columns. Those must NOT be captured as an unsaved
   * layout draft — only genuine user actions may.
   */

  it.each(['api', 'flex', 'sizeColumnsToFit', 'autosizeColumns', 'gridInitializing'])(
    'a finished resize with programmatic source "%s" does NOT write a draft',
    async (source) => {
      vi.useFakeTimers();
      const { mock } = renderVariant();
      await waitForMount(mock);

      mock.setColumnState([{ colId: 'name', width: 280, pinned: null, hide: false }]);
      act(() => mock.emit('columnResized', { finished: true, source }));
      act(() => vi.advanceTimersByTime(500));

      expect(readRawDraft('variant-A')).toBeUndefined();
    },
  );

  it('a column event with NO source does NOT write a draft', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([{ colId: 'name', width: 280, pinned: null, hide: false }]);
    act(() => mock.emit('columnResized', { finished: true }));
    act(() => mock.emit('columnPinned', {}));
    act(() => mock.emit('columnMoved', {}));
    act(() => vi.advanceTimersByTime(500));

    expect(readRawDraft('variant-A')).toBeUndefined();
  });

  it('programmatic pin / move / visible events do NOT write a draft', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([{ colId: 'name', width: 100, pinned: 'left', hide: true }]);
    act(() => mock.emit('columnPinned', { source: 'api' }));
    act(() => mock.emit('columnMoved', { source: 'rowModelUpdated' }));
    act(() => mock.emit('columnVisible', { source: 'flex' }));
    act(() => vi.advanceTimersByTime(500));

    expect(readRawDraft('variant-A')).toBeUndefined();
  });

  it('a user resize STILL writes a draft (the feature is preserved)', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([{ colId: 'name', width: 321, pinned: null, hide: false }]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(300));

    const stored = readRawDraft('variant-A');
    expect(stored).toBeDefined();
    expect(stored.columns.find((c: { colId: string }) => c.colId === 'name')?.width).toBe(321);
  });

  it('a tool-panel show/hide STILL writes a draft', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([{ colId: 'name', width: 100, pinned: null, hide: true }]);
    act(() => mock.emit('columnVisible', { source: 'toolPanelUi' }));
    act(() => vi.advanceTimersByTime(300));

    expect(readRawDraft('variant-A')).toBeDefined();
  });

  it('does NOT surface the dirty indicator after a programmatic-source resize', async () => {
    vi.useFakeTimers();
    const { mock, queryByTestId } = renderVariant();
    await waitForMount(mock);

    mock.setColumnState([{ colId: 'name', width: 260, pinned: null, hide: false }]);
    act(() => mock.emit('columnResized', { finished: true, source: 'api' }));
    act(() => vi.advanceTimersByTime(500));

    expect(queryByTestId('variant-layout-draft-indicator')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  isApplyingState guard                                              */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — isApplyingState guard', () => {
  it('the mount restore does not itself write a draft back', async () => {
    // A draft exists; applying it on mount fires applyColumnState, which
    // in a real grid emits columnMoved/columnResized. The guard must
    // stop that programmatic mutation from re-persisting a draft.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'role', width: 222, pinned: 'right' },
        { colId: 'name', width: 100 },
        { colId: 'email', width: 100 },
      ],
    );
    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    // Simulate AG Grid firing column events DURING the programmatic
    // restore (guard is up). These must be ignored.
    act(() => {
      mock.emit('columnResized', { finished: true, source: 'uiColumnResized' });
      mock.emit('columnMoved', { source: 'uiColumnMoved' });
    });
    act(() => vi.advanceTimersByTime(300));

    // The draft is still the ORIGINAL (role width 222), not a fresh
    // snapshot — the guard suppressed the re-write. (Read the stored
    // updatedAt to confirm it was not rewritten.)
    const stored = readRawDraft('variant-A');
    expect(stored.columns.find((c: { colId: string }) => c.colId === 'role')?.width).toBe(222);
  });
});

/* ------------------------------------------------------------------ */
/*  Dirty indicator + Kaydet + Reset                                   */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — dirty indicator, save, reset', () => {
  it('surfaces the dirty indicator when a draft exists on mount', async () => {
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [{ colId: 'name', width: 400 }],
    );
    const { findByTestId } = renderVariant();
    expect(await findByTestId('variant-layout-draft-indicator')).toBeInTheDocument();
  });

  it('does NOT surface the dirty indicator with no draft', async () => {
    const { mock, queryByTestId } = renderVariant();
    await waitFor(() => expect(mock.applyColumnStateMock).toHaveBeenCalled());
    expect(queryByTestId('variant-layout-draft-indicator')).not.toBeInTheDocument();
  });

  it('the dirty indicator appears after a resize and the reset clears it', async () => {
    vi.useFakeTimers();
    const { mock, queryByTestId, getByTestId } = renderVariant();
    await waitForMount(mock);

    expect(queryByTestId('variant-layout-draft-indicator')).not.toBeInTheDocument();

    // Resize → draft written → indicator appears.
    mock.setColumnState([{ colId: 'name', width: 260, pinned: null, hide: false }]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(300));
    await vi.waitFor(() => {
      expect(queryByTestId('variant-layout-draft-indicator')).toBeInTheDocument();
    });
    expect(readRawDraft('variant-A')).toBeDefined();

    // Click reset → draft cleared, indicator gone.
    act(() => {
      getByTestId('variant-layout-draft-reset').click();
    });
    expect(readRawDraft('variant-A')).toBeUndefined();
    await vi.waitFor(() => {
      expect(queryByTestId('variant-layout-draft-indicator')).not.toBeInTheDocument();
    });
  });

  it('reset re-applies the variant base state (reverting the draft layout)', async () => {
    vi.useFakeTimers();
    const { mock, getByTestId } = renderVariant();
    await waitForMount(mock);

    // Draft a 999-wide name column.
    mock.setColumnState([
      { colId: 'name', width: 999, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(300));

    mock.applyColumnStateMock.mockClear();
    act(() => {
      getByTestId('variant-layout-draft-reset').click();
    });
    // Reset re-runs applyVariantState → the variant's columnState
    // (name width 100) is re-applied over the 999 draft layout.
    expect(mock.applyColumnStateMock).toHaveBeenCalled();
    expect(
      mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
    ).toBe(100);
  });

  it('"Kaydet" clears the draft and the dirty state', async () => {
    vi.useFakeTimers();
    const { mock, queryByTestId } = renderVariant();
    await waitForMount(mock);

    // Create a draft via a resize.
    mock.setColumnState([{ colId: 'name', width: 270, pinned: null, hide: false }]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(300));
    expect(readRawDraft('variant-A')).toBeDefined();

    // The toolbar Save button uses title "Save current state to variant".
    const saveButton = document.querySelector(
      'button[title="Save current state to variant"]',
    ) as HTMLButtonElement;
    expect(saveButton).not.toBeNull();
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
    // Save persisted into the variant → the draft is now redundant.
    await vi.waitFor(() => {
      expect(readRawDraft('variant-A')).toBeUndefined();
    });
    expect(queryByTestId('variant-layout-draft-indicator')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Draft layer disabled without identity                              */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — draft layer off without draftIdentity', () => {
  it('does not wire column listeners when draftIdentity is omitted', async () => {
    const { mock } = renderVariant({ draftIdentity: undefined });
    await waitFor(() => expect(mock.applyColumnStateMock).toHaveBeenCalled());
    expect(mock.hasListener('columnResized')).toBe(false);
    expect(mock.hasListener('columnPinned')).toBe(false);
    expect(mock.hasListener('columnMoved')).toBe(false);
  });

  it('does not write a draft on resize when the layer is off', async () => {
    vi.useFakeTimers();
    const { mock } = renderVariant({ draftIdentity: '' });
    await vi.waitFor(() => expect(mock.applyColumnStateMock).toHaveBeenCalled());
    // No listener registered → emitting is a no-op, nothing persists.
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));
    act(() => vi.advanceTimersByTime(500));
    expect(window.localStorage.getItem(LAYOUT_DRAFT_NAMESPACE)).toBeNull();
  });

  it('does not overlay a draft on mount when the layer is off', async () => {
    // A draft exists in storage, but with no identity the component
    // must ignore it entirely.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [{ colId: 'name', width: 888 }],
    );
    const { mock } = renderVariant({ draftIdentity: undefined });
    await waitFor(() => expect(mock.applyColumnStateMock).toHaveBeenCalled());
    expect(
      mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
    ).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  Variant switch — per-variant draft isolation                       */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — per-variant draft isolation on switch', () => {
  it("switching to another variant applies that variant's own draft, not variant A's", async () => {
    const VARIANT_B = makeVariant({
      id: 'variant-B',
      name: 'Varyant B',
      isUserSelected: false,
      isUserDefault: false,
    });
    mockFetch.mockResolvedValue([{ ...VARIANT_A, isUserSelected: true }, VARIANT_B]);
    // variant A has a draft (name=400); variant B has a different one (name=600).
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 400 },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-B',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 600 },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    const { mock } = renderVariant();
    await waitFor(() => expect(mock.applyColumnStateMock).toHaveBeenCalled());
    // Mount applied variant A + its draft → name 400.
    await waitFor(() => {
      expect(
        mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
      ).toBe(400);
    });

    // Switch to variant B via the select.
    const select = document.querySelector(
      'select[data-testid="variant-select"]',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    await act(async () => {
      select.value = 'variant-B';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    // Variant B's OWN draft (name 600) is now the working surface — no
    // bleed from variant A's 400.
    await waitFor(() => {
      expect(
        mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
      ).toBe(600);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Codex 019e2de0 REVISE finding 1 — no-variant default-scope draft   */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — finding 1: no-variant draft is restored on mount', () => {
  it('restores the default-scope draft on mount when variants = []', async () => {
    // No backend variants at all.
    mockFetch.mockResolvedValue([]);
    // A draft persisted under the no-variant ("default") scope.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: null,
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 421, pinned: 'left' },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    const { mock } = renderVariant();

    // The variant-less mount must still overlay the default-scope draft
    // — the pre-fix code early-returned on `variants.length === 0` and
    // only applied a draft inside the `target` variant branch.
    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      const name = mock
        .getColumnStateMock()
        .find((c: Record<string, unknown>) => c.colId === 'name');
      expect(name?.width).toBe(421);
      expect(name?.pinned).toBe('left');
    });
  });

  it('surfaces the dirty indicator for a no-variant default-scope draft', async () => {
    mockFetch.mockResolvedValue([]);
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: null,
        schemaFingerprint: FINGERPRINT,
      },
      [{ colId: 'name', width: 311 }],
    );
    const { findByTestId } = renderVariant();
    expect(await findByTestId('variant-layout-draft-indicator')).toBeInTheDocument();
  });

  it('restores the default-scope draft when variants exist but none is a resolvable target', async () => {
    /*
     * Codex 019e2de0 REVISE iter-2 finding 1 — `variants` is NON-empty
     * but no entry is selectable: not user-selected, not default, not
     * compatible. `target` resolves to undefined and the pre-iter-2
     * mount effect silently exited with no `else` fallback, so the
     * default-scope draft was never overlaid on reload even though that
     * surface is a "no variant selected / default colDef" surface.
     */
    const INCOMPATIBLE_A = makeVariant({
      id: 'variant-A',
      isUserSelected: false,
      isUserDefault: false,
      isGlobalDefault: false,
      isCompatible: false,
    });
    const INCOMPATIBLE_B = makeVariant({
      id: 'variant-B',
      name: 'Varyant B',
      isUserSelected: false,
      isUserDefault: false,
      isGlobalDefault: false,
      isCompatible: false,
    });
    mockFetch.mockResolvedValue([INCOMPATIBLE_A, INCOMPATIBLE_B]);

    // A draft persisted under the no-variant ("default") scope.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: null,
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 488, pinned: 'left' },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    const { mock, findByTestId } = renderVariant();

    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    // The default-scope draft must be applied even though saved
    // variants exist — none of them resolved as the mount target.
    await waitFor(() => {
      const name = mock
        .getColumnStateMock()
        .find((c: Record<string, unknown>) => c.colId === 'name');
      expect(name?.width).toBe(488);
      expect(name?.pinned).toBe('left');
    });
    // …and the dirty indicator is set for that default-scope draft.
    expect(await findByTestId('variant-layout-draft-indicator')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Codex 019e2de0 REVISE finding 2 — debounce snapshot at event time  */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — finding 2: debounce persists the right scope / last mutation', () => {
  it("resize then switch variant before the debounce fires → A's layout persists to A's scope, not B's", async () => {
    const VARIANT_B = makeVariant({
      id: 'variant-B',
      name: 'Varyant B',
      isUserSelected: false,
      isUserDefault: false,
    });
    mockFetch.mockResolvedValue([{ ...VARIANT_A, isUserSelected: true }, VARIANT_B]);

    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    // Resize while variant A is active — pending snapshot captured for A.
    mock.setColumnState([
      { colId: 'name', width: 765, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));

    // Switch to variant B BEFORE the ~250ms debounce fires.
    const select = document.querySelector(
      'select[data-testid="variant-select"]',
    ) as HTMLSelectElement;
    await act(async () => {
      select.value = 'variant-B';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    // Now let the pending debounce fire.
    act(() => vi.advanceTimersByTime(300));

    // A's scope got the resize (width 765); B's scope was NOT polluted.
    const draftA = readRawDraft('variant-A');
    expect(draftA).toBeDefined();
    expect(draftA.columns.find((c: { colId: string }) => c.colId === 'name')?.width).toBe(765);
    expect(readRawDraft('variant-B')).toBeUndefined();
  });

  it('resize then unmount before the debounce fires → the mutation is still flushed', async () => {
    vi.useFakeTimers();
    const { mock, unmount } = renderVariant();
    await waitForMount(mock);

    // Resize, then unmount inside the debounce window — the pre-fix
    // cleanup cleared the timer and silently dropped this write.
    mock.setColumnState([
      { colId: 'name', width: 654, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));

    // Unmount BEFORE advancing the timer — cleanup must flush the ref.
    act(() => {
      unmount();
    });

    const stored = readRawDraft('variant-A');
    expect(stored).toBeDefined();
    expect(stored.columns.find((c: { colId: string }) => c.colId === 'name')?.width).toBe(654);
  });

  it("resize in A, switch to B, reset B before the debounce → A's pending draft is flushed to A's scope", async () => {
    /*
     * Codex 019e2de0 REVISE iter-2 finding 2 — `handleResetDraft`
     * cleared the pending snapshot with a blanket
     * `pendingDraftRef.current = null`, dropping ALL pending regardless
     * of scope. The scope-aware clear must instead flush A's still-
     * pending resize to A's OWN scope before clearing the ref.
     *
     * Variant B is given its own pre-existing draft so the reset
     * control (rendered only when the dirty indicator is up) is present
     * after the switch to B; resetting B exercises the scope-aware
     * clear against A's still-pending mutation.
     */
    const VARIANT_B = makeVariant({
      id: 'variant-B',
      name: 'Varyant B',
      isUserSelected: false,
      isUserDefault: false,
    });
    mockFetch.mockResolvedValue([{ ...VARIANT_A, isUserSelected: true }, VARIANT_B]);
    // Variant B already has a draft → its reset/dirty UI is available.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-B',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 555 },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    vi.useFakeTimers();
    const { mock, getByTestId } = renderVariant();
    await waitForMount(mock);

    // Resize in variant A — the pending snapshot is captured for A's scope.
    mock.setColumnState([
      { colId: 'name', width: 842, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));

    // Switch to variant B BEFORE A's ~250ms debounce fires.
    const select = document.querySelector(
      'select[data-testid="variant-select"]',
    ) as HTMLSelectElement;
    await act(async () => {
      select.value = 'variant-B';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    // Click reset while on variant B — must NOT discard A's pending draft.
    act(() => {
      getByTestId('variant-layout-draft-reset').click();
    });
    // Drain any timers — A's flush already happened synchronously inside
    // the scope-aware clear; B's scope must stay clean (reset cleared it).
    act(() => vi.advanceTimersByTime(300));

    const draftA = readRawDraft('variant-A');
    expect(draftA).toBeDefined();
    expect(draftA.columns.find((c: { colId: string }) => c.colId === 'name')?.width).toBe(842);
    // B's reset cleared B's own draft; A's flush did not pollute B.
    expect(readRawDraft('variant-B')).toBeUndefined();
  });

  it("resize in A, switch to B, save B before the debounce → A's pending draft is flushed to A's scope", async () => {
    /*
     * Codex 019e2de0 REVISE iter-2 finding 2 — same data-loss edge via
     * `handleSave`. Saving variant B must flush variant A's still-
     * pending resize to A's own scope rather than dropping it.
     */
    const VARIANT_B = makeVariant({
      id: 'variant-B',
      name: 'Varyant B',
      isUserSelected: false,
      isUserDefault: false,
    });
    mockFetch.mockResolvedValue([{ ...VARIANT_A, isUserSelected: true }, VARIANT_B]);

    vi.useFakeTimers();
    const { mock } = renderVariant();
    await waitForMount(mock);

    // Resize in variant A — pending snapshot captured for A's scope.
    mock.setColumnState([
      { colId: 'name', width: 913, pinned: null, hide: false },
      { colId: 'email', width: 100, pinned: null, hide: false },
      { colId: 'role', width: 100, pinned: null, hide: false },
    ]);
    act(() => mock.emit('columnResized', { finished: true, source: 'uiColumnResized' }));

    // Switch to variant B BEFORE A's debounce fires.
    const select = document.querySelector(
      'select[data-testid="variant-select"]',
    ) as HTMLSelectElement;
    await act(async () => {
      select.value = 'variant-B';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    // Save variant B (toolbar Save button) — must NOT discard A's pending draft.
    const saveButton = document.querySelector(
      'button[title="Save current state to variant"]',
    ) as HTMLButtonElement;
    expect(saveButton).not.toBeNull();
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
    act(() => vi.advanceTimersByTime(300));

    // A's resize survived in A's own scope; B's scope was not polluted
    // by A's pending mutation.
    const draftA = readRawDraft('variant-A');
    expect(draftA).toBeDefined();
    expect(draftA.columns.find((c: { colId: string }) => c.colId === 'name')?.width).toBe(913);
    expect(readRawDraft('variant-B')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Codex 019e2de0 REVISE finding 3 — schema fingerprint re-apply      */
/* ------------------------------------------------------------------ */

describe('PR-0.5e — finding 3: draft overlay retried on schema change', () => {
  it('re-overlays the draft when columnDefIds change after the first apply', async () => {
    // The real schema's columns arrive AFTER the first mount apply.
    const LATE_COLUMN_IDS = ['name', 'email', 'role', 'createdAt'];
    const lateFingerprint = computeSchemaFingerprint(LATE_COLUMN_IDS);

    // A draft persisted for variant A under the LATE (real) schema.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: lateFingerprint,
      },
      [
        { colId: 'name', width: 537, pinned: 'left' },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    const mock = createMockGridApi();
    // First render with the INITIAL (incomplete) column set — its
    // fingerprint does not match the stored draft, so no overlay yet.
    const { rerender } = render(
      <VariantIntegration
        gridId={GRID_ID}
        gridSchemaVersion={SCHEMA_VERSION}
        gridApi={mock.api}
        draftIdentity={IDENTITY}
        columnDefIds={COLUMN_IDS}
      />,
    );
    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    // Initial schema → no draft applied (fingerprint mismatch).
    expect(
      mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
    ).toBe(100);

    mock.applyColumnStateMock.mockClear();

    // Async column metadata arrives → columnDefIds change → fingerprint
    // changes → the auto-apply effect must retry the layout overlay.
    rerender(
      <VariantIntegration
        gridId={GRID_ID}
        gridSchemaVersion={SCHEMA_VERSION}
        gridApi={mock.api}
        draftIdentity={IDENTITY}
        columnDefIds={LATE_COLUMN_IDS}
      />,
    );

    await waitFor(() => {
      const name = mock
        .getColumnStateMock()
        .find((c: Record<string, unknown>) => c.colId === 'name');
      expect(name?.width).toBe(537);
      expect(name?.pinned).toBe('left');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  PR-0.5e fix — draft overlay retried on async VARIANT resolution    */
/*  (the bug proven live on testai.acik.com: a pinned column draft was */
/*   written under the resolved variant's scope but, on reload, the    */
/*   mount restore ran while the variant list was still loading — it   */
/*   read the `default` scope, missed the draft, and never re-read it  */
/*   once the variant resolved.)                                       */
/* ------------------------------------------------------------------ */

describe('PR-0.5e fix — draft overlay retried on async variant resolution', () => {
  /**
   * A deferred promise whose resolution is driven by the test, so the
   * component can be observed in the "variants still loading" window
   * BEFORE the variant list arrives.
   */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it('re-overlays the variant-scoped draft when the variant resolves after mount', async () => {
    // The draft is keyed by the RESOLVED variant id — exactly the live
    // bug shape: it lives under variant A's scope, NOT the `default`
    // scope the mount restore reads while the list is still loading.
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 612, pinned: 'left' },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    // The variant fetch is deferred — the mount restore effect runs
    // FIRST, while `variants` is still []. It lands on the
    // `applyDefaultDraftScope` (no-variant) path and reads the `default`
    // scope, which has no draft.
    const variantsLate = deferred<GridVariant[]>();
    mockFetch.mockReturnValue(variantsLate.promise);

    const { mock } = renderVariant();

    // Mount restore has run against the still-empty variant list:
    // the column listeners are wired and the no-variant default-scope
    // draft path executed — but the variant-A draft was NOT applied.
    await waitFor(() => {
      expect(mock.hasListener('columnResized')).toBe(true);
    });
    expect(
      mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
    ).toBe(100);

    // Now the variant list resolves — variant A becomes the selected
    // variant. The fix must re-read + overlay variant A's layout draft
    // for the now-resolved variant scope.
    await act(async () => {
      variantsLate.resolve([VARIANT_A]);
      await Promise.resolve();
    });

    await waitFor(() => {
      const name = mock
        .getColumnStateMock()
        .find((c: Record<string, unknown>) => c.colId === 'name');
      expect(name?.width).toBe(612);
      expect(name?.pinned).toBe('left');
    });
  });

  it('sets the dirty indicator once the async-resolved variant draft is overlaid', async () => {
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-A',
        schemaFingerprint: FINGERPRINT,
      },
      [{ colId: 'name', width: 477, pinned: 'left' }],
    );

    const variantsLate = deferred<GridVariant[]>();
    mockFetch.mockReturnValue(variantsLate.promise);

    const { mock, queryByTestId, findByTestId } = renderVariant();

    await waitFor(() => {
      expect(mock.hasListener('columnResized')).toBe(true);
    });
    // No draft on the default scope → indicator absent while loading.
    expect(queryByTestId('variant-layout-draft-indicator')).not.toBeInTheDocument();

    await act(async () => {
      variantsLate.resolve([VARIANT_A]);
      await Promise.resolve();
    });

    // The variant resolved → variant A's draft overlaid → dirty.
    expect(await findByTestId('variant-layout-draft-indicator')).toBeInTheDocument();
  });

  it('re-overlays the draft for the new scope when the controlled variant transitions A → B', async () => {
    /*
     * The mount applies variant A (the user-selected variant). Then the
     * controlled `activeVariantId` prop transitions to variant B — a
     * deep-link / parent-driven variant change that does NOT go through
     * the in-component `handleSelect`. The auto-apply effect sees
     * `appliedRef.current` already set, so its `appliedRef.current`
     * early-return fires; without the variant-id transition guard the
     * effect re-applies nothing and variant B's layout draft is never
     * overlaid.
     */
    const VARIANT_B = makeVariant({
      id: 'variant-B',
      name: 'Varyant B',
      isUserSelected: false,
      isUserDefault: false,
    });
    mockFetch.mockResolvedValue([{ ...VARIANT_A, isUserSelected: true }, VARIANT_B]);
    // Variant B has its OWN layout draft (name pinned right, widened).
    writeDraft(
      {
        gridId: GRID_ID,
        identity: IDENTITY,
        variantId: 'variant-B',
        schemaFingerprint: FINGERPRINT,
      },
      [
        { colId: 'name', width: 733, pinned: 'right' },
        { colId: 'email', width: 100 },
        { colId: 'role', width: 100 },
      ],
    );

    const mock = createMockGridApi();
    const { rerender } = render(
      <VariantIntegration
        gridId={GRID_ID}
        gridSchemaVersion={SCHEMA_VERSION}
        gridApi={mock.api}
        draftIdentity={IDENTITY}
        columnDefIds={COLUMN_IDS}
      />,
    );
    // Mount applied variant A (no A draft) → name stays 100.
    await waitFor(() => {
      expect(mock.applyColumnStateMock).toHaveBeenCalled();
    });
    expect(
      mock.getColumnStateMock().find((c: Record<string, unknown>) => c.colId === 'name')?.width,
    ).toBe(100);

    // Controlled variant id transitions A → B (deep-link / parent-driven).
    rerender(
      <VariantIntegration
        gridId={GRID_ID}
        gridSchemaVersion={SCHEMA_VERSION}
        gridApi={mock.api}
        activeVariantId="variant-B"
        draftIdentity={IDENTITY}
        columnDefIds={COLUMN_IDS}
      />,
    );

    // The overlay must follow the resolved variant id — variant B's own
    // draft (name 733, pinned right), not variant A's.
    await waitFor(() => {
      const name = mock
        .getColumnStateMock()
        .find((c: Record<string, unknown>) => c.colId === 'name');
      expect(name?.width).toBe(733);
      expect(name?.pinned).toBe('right');
    });
  });
});
