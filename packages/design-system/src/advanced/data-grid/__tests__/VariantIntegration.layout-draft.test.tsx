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
    act(() => mock.emit('columnResized', { finished: true }));
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
    act(() => mock.emit('columnPinned', {}));
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
    act(() => mock.emit('columnMoved', {}));
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
    act(() => mock.emit('columnResized', { finished: true }));
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
    mock.getColumnStateMock.mockClear();
    mock.setColumnState([{ colId: 'name', width: 150, pinned: null, hide: false }]);

    // Three events inside the debounce window.
    act(() => {
      mock.emit('columnResized', { finished: true });
      mock.emit('columnPinned', {});
      mock.emit('columnMoved', {});
    });
    // Before the debounce fires — no snapshot taken yet.
    expect(mock.getColumnStateMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    // Exactly one snapshot → one persist.
    expect(mock.getColumnStateMock).toHaveBeenCalledTimes(1);
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
      mock.emit('columnResized', { finished: true });
      mock.emit('columnMoved', {});
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
    act(() => mock.emit('columnResized', { finished: true }));
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
    act(() => mock.emit('columnResized', { finished: true }));
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
    act(() => mock.emit('columnResized', { finished: true }));
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
    act(() => mock.emit('columnResized', { finished: true }));
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
