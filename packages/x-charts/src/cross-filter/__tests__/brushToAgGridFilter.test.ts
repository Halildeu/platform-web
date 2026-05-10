/**
 * brushToAgGridFilterModel — lock the BrushSelection → AG Grid
 * v34.3.1 simple `IFilterModel` contract.
 *
 * Faz 21.11 PR-A2c — Cross-filter rectangle brush parity.
 *
 * Test strategy (Codex iter-1 §5)
 *   - Lock simple per-column `inRange` shape (NO advanced
 *     filter, NO `combinedSimpleModels`).
 *   - Lock open-ended axis collapse to
 *     `greaterThanOrEqual` / `lessThanOrEqual`.
 *   - Lock both-axes-null → empty model `{}` (semantically
 *     "no axis filter applied"; consumer keeps any other
 *     column filters intact).
 *   - Lock null selection → null filter model (clear). Codex
 *     iter-1 §1 separation respected.
 *   - Lock zero-width rectangle (from === to) emits a single-
 *     point inRange (still meaningful — equals filter).
 *   - Lock pure-reducer `applyBrushFilterModel` so the round-
 *     trip test can call it without an AG Grid mount.
 */
import { describe, it, expect } from 'vitest';
import {
  brushToAgGridFilterModel,
  mergeBrushFilterModel,
  applyBrushFilterModel,
  type AgGridBrushFilterModel,
} from '../brushToAgGridFilter';
import type { BrushSelection } from '../brushSelection';

const OPTS = { xColId: 'x', yColId: 'y' } as const;

function rect(
  x1: number | null,
  y1: number | null,
  x2: number | null,
  y2: number | null,
): BrushSelection {
  return {
    from: { x: x1, y: y1 },
    to: { x: x2, y: y2 },
    indices: [],
    kind: 'rect',
  };
}

describe('brushToAgGridFilterModel — clear vs valid-empty', () => {
  it('returns null when selection is null (clear filter signal)', () => {
    expect(brushToAgGridFilterModel(null, OPTS)).toBeNull();
  });

  it('returns an empty {} model when both axes are fully open', () => {
    // Pathological but possible — caller passes a selection
    // whose every bound is null (other helpers in the chain
    // produced one). Adapter emits {} so the consumer can
    // call `gridApi.setFilterModel({})` to clear without
    // triggering an undefined-shape error.
    const model = brushToAgGridFilterModel(rect(null, null, null, null), OPTS);
    expect(model).toEqual({});
  });

  it('returns a real filter model even when the selection has zero matched rows', () => {
    const sel: BrushSelection = {
      from: { x: 10, y: 5 },
      to: { x: 30, y: 50 },
      indices: [],
      kind: 'rect',
    };
    const model = brushToAgGridFilterModel(sel, OPTS);
    // Indices count is irrelevant — the bounds drive the
    // filter, not the rendered hit list.
    expect(model).toEqual({
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    });
  });
});

describe('brushToAgGridFilterModel — axis variants', () => {
  it('emits per-column inRange on both axes for a closed rectangle', () => {
    const model = brushToAgGridFilterModel(rect(10, 5, 30, 50), OPTS);
    expect(model).toEqual({
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    });
  });

  it('emits only the x column when y is fully open', () => {
    const model = brushToAgGridFilterModel(rect(10, null, 30, null), OPTS);
    expect(model).toEqual({
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
    });
  });

  it('emits greaterThanOrEqual when only the lower bound is set', () => {
    const model = brushToAgGridFilterModel(rect(10, null, null, null), OPTS);
    expect(model).toEqual({
      x: { filterType: 'number', type: 'greaterThanOrEqual', filter: 10 },
    });
  });

  it('emits lessThanOrEqual when only the upper bound is set', () => {
    const model = brushToAgGridFilterModel(rect(null, null, 30, null), OPTS);
    expect(model).toEqual({
      x: { filterType: 'number', type: 'lessThanOrEqual', filter: 30 },
    });
  });

  it('emits a single-point inRange when from === to (equals semantics)', () => {
    const model = brushToAgGridFilterModel(rect(10, 5, 10, 5), OPTS);
    expect(model).toEqual({
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 10 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 5 },
    });
  });

  it('honours custom column ids', () => {
    const model = brushToAgGridFilterModel(rect(10, 5, 30, 50), {
      xColId: 'salary',
      yColId: 'tenureYears',
    });
    expect(Object.keys(model ?? {})).toEqual(['salary', 'tenureYears']);
  });

  it('does NOT emit advanced-filter shape (Codex §5)', () => {
    const model = brushToAgGridFilterModel(rect(10, 5, 30, 50), OPTS);
    // Sanity: no `filterType: 'join'` / `combinedSimpleModels`
    // / `conditions` keys leaking in.
    expect(model).not.toHaveProperty('filterType');
    expect(model).not.toHaveProperty('conditions');
    expect(model).not.toHaveProperty('operator');
  });
});

describe('mergeBrushFilterModel — preserve non-brush column filters (Codex iter-2 §P1.2)', () => {
  it('overlays brush x/y onto an existing model that has another column filter', () => {
    const existing = {
      status: { filterType: 'set', values: ['ACTIVE'] },
      x: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 5 }, // stale brush
    };
    const brush: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    };
    expect(mergeBrushFilterModel(existing, brush, OPTS)).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    });
  });

  it('strips brush columns only when brushModel is null (clear) — preserves the rest', () => {
    const existing = {
      status: { filterType: 'set', values: ['ACTIVE'] },
      x: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 5 },
      y: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 5 },
    };
    expect(mergeBrushFilterModel(existing, null, OPTS)).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
    });
  });

  it('strips brush columns when brushModel is empty {} (both axes open)', () => {
    const existing = {
      status: { filterType: 'set', values: ['ACTIVE'] },
      x: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 5 },
    };
    expect(mergeBrushFilterModel(existing, {}, OPTS)).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
    });
  });

  it('returns null when nothing remains in the merged model', () => {
    expect(mergeBrushFilterModel(null, null, OPTS)).toBeNull();
    expect(mergeBrushFilterModel({}, null, OPTS)).toBeNull();
    expect(mergeBrushFilterModel({}, {}, OPTS)).toBeNull();
    expect(
      mergeBrushFilterModel(
        { x: { filterType: 'number', type: 'inRange', filter: 0 } },
        null,
        OPTS,
      ),
    ).toBeNull();
  });

  it('handles existing === null by treating it as an empty model', () => {
    const brush: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    };
    expect(mergeBrushFilterModel(null, brush, OPTS)).toEqual({
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    });
  });

  it('strips a stale x entry even when the brush only emits a y bound (open-ended brush)', () => {
    const existing = {
      x: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 5 }, // stale brush
      status: { filterType: 'set', values: ['ACTIVE'] },
    };
    const brush: AgGridBrushFilterModel = {
      // Only y bounded (x axis was fully open in the new brush).
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    };
    expect(mergeBrushFilterModel(existing, brush, OPTS)).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
      y: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 50 },
    });
  });

  it('does not leak prototype keys when brushModel is a plain object', () => {
    // Defensive: `for...in` would walk the prototype; we use
    // `Object.prototype.hasOwnProperty.call` so injected
    // proto keys never reach the merged model.
    const proto = { x: { filterType: 'number', type: 'inRange', filter: 999 } };
    const brush = Object.create(proto) as AgGridBrushFilterModel;
    expect(mergeBrushFilterModel({}, brush, OPTS)).toBeNull();
  });
});

describe('applyBrushFilterModel — pure reducer', () => {
  const rows = [
    { x: 5, y: 5 },
    { x: 15, y: 25 },
    { x: 25, y: 35 },
    { x: 35, y: 45 },
    { x: 50, y: 60 },
  ];

  it('returns all rows when model is null (clear)', () => {
    expect(applyBrushFilterModel(rows, null)).toHaveLength(5);
  });

  it('returns all rows when model is empty {} (no axis filter)', () => {
    expect(applyBrushFilterModel(rows, {})).toHaveLength(5);
  });

  it('filters by inRange on a single axis', () => {
    const model: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
    };
    expect(applyBrushFilterModel(rows, model)).toEqual([
      { x: 15, y: 25 },
      { x: 25, y: 35 },
    ]);
  });

  it('AND-combines x and y inRange filters', () => {
    const model: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 30 },
      y: { filterType: 'number', type: 'inRange', filter: 30, filterTo: 100 },
    };
    expect(applyBrushFilterModel(rows, model)).toEqual([{ x: 25, y: 35 }]);
  });

  it('honours greaterThanOrEqual / lessThanOrEqual entries', () => {
    const gte: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'greaterThanOrEqual', filter: 30 },
    };
    expect(applyBrushFilterModel(rows, gte)).toHaveLength(2);
    const lte: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'lessThanOrEqual', filter: 15 },
    };
    expect(applyBrushFilterModel(rows, lte)).toHaveLength(2);
  });

  it('drops rows whose target column is not a finite number', () => {
    const model: AgGridBrushFilterModel = {
      x: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 100 },
    };
    const dirty = [
      { x: 5, y: 5 },
      { x: Number.NaN, y: 5 },
      { x: 'oops' as unknown as number, y: 5 },
    ];
    expect(applyBrushFilterModel(dirty, model)).toEqual([{ x: 5, y: 5 }]);
  });
});
