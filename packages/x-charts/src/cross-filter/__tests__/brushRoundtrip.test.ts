/**
 * brushRoundtrip — end-to-end frontend contract test for the
 * brush → AG Grid filter model → SSRM-style filter application
 * pipeline.
 *
 * Faz 21.11 PR-A2c — Cross-filter rectangle brush parity.
 *
 * Boundary
 *   - Pure JS reducer stands in for AG Grid SSRM
 *     (`applyBrushFilterModel`). The real production path uses
 *     `params.request.filterModel` forwarded to the backend by
 *     `apps/mfe-reporting/src/app/reporting/ReportPage.tsx`;
 *     locking the AG Grid mount itself is out of scope (heavy
 *     in jsdom, and AG Grid's behaviour is locked elsewhere).
 *   - Codex iter-1 §6: renderer parity is asserted at the
 *     payload layer, not after a real ECharts render.
 *
 * The fixture mimics what the design-lab scatter demo emits.
 * The contract this test guards: dragging a rectangle on the
 * chart and pushing the resulting filter into AG Grid yields
 * exactly the rows whose (x, y) coordinates lie inside the
 * rectangle.
 */
import { describe, it, expect } from 'vitest';
import { normalizeBrushSelection, type EChartsBrushSelectedEvent } from '../brushSelection';
import { brushToAgGridFilterModel, applyBrushFilterModel } from '../brushToAgGridFilter';

interface ScatterRow {
  id: number;
  x: number;
  y: number;
}

function makeFixture(count: number): ScatterRow[] {
  // Deterministic 100-row scatter with predictable bounds.
  // Row i has x = i, y = (i * 7) % 60 — coverage from y=0..59.
  const rows: ScatterRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: i, x: i, y: (i * 7) % 60 });
  }
  return rows;
}

function rectEvent(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dataIndex: number[],
): EChartsBrushSelectedEvent {
  return {
    batch: [
      {
        areas: [
          {
            brushType: 'rect',
            coordRange: [
              [x1, x2],
              [y1, y2],
            ],
          },
        ],
        selected: [{ seriesIndex: 0, dataIndex }],
      },
    ],
  };
}

describe('brush → AG Grid roundtrip — rectangle parity', () => {
  it('filters to exactly the rows inside the brushed rectangle', () => {
    const rows = makeFixture(100);

    // Drag (x: 20..50, y: 20..60). Independently pre-compute
    // the expected matching ids so the test ground-truth is
    // not derived from the helper under test.
    const expected = rows
      .filter((r) => r.x >= 20 && r.x <= 50 && r.y >= 20 && r.y <= 60)
      .map((r) => r.id);
    expect(expected.length).toBeGreaterThan(0); // sanity

    // Pretend ECharts told us those same rendered indices.
    const dataIndex = expected; // 1:1 (no downsampling) — id == index by construction.
    const event = rectEvent(20, 20, 50, 60, dataIndex);

    const selection = normalizeBrushSelection(event);
    expect(selection).not.toBeNull();
    expect(selection?.indices).toEqual(expected);

    const model = brushToAgGridFilterModel(selection, { xColId: 'x', yColId: 'y' });
    expect(model).toEqual({
      x: { filterType: 'number', type: 'inRange', filter: 20, filterTo: 50 },
      y: { filterType: 'number', type: 'inRange', filter: 20, filterTo: 60 },
    });

    const filtered = applyBrushFilterModel(rows, model);
    expect(filtered.map((r) => r.id).sort((a, b) => a - b)).toEqual(expected);
  });

  it('valid rectangle that matched zero rendered points still drives the AG Grid filter to zero rows', () => {
    const rows = makeFixture(100);
    // Rectangle is entirely above the y range (y: 100..200);
    // ECharts emits the area but `selected[].dataIndex` is
    // empty.
    const event = rectEvent(20, 100, 50, 200, []);
    const selection = normalizeBrushSelection(event);
    expect(selection?.indices).toEqual([]); // valid-empty
    const model = brushToAgGridFilterModel(selection, { xColId: 'x', yColId: 'y' });
    expect(model).not.toBeNull();
    const filtered = applyBrushFilterModel(rows, model);
    expect(filtered).toHaveLength(0);
  });

  it('clearing the brush (null event → null model) restores all rows', () => {
    const rows = makeFixture(100);
    const selection = normalizeBrushSelection(null);
    const model = brushToAgGridFilterModel(selection, { xColId: 'x', yColId: 'y' });
    expect(model).toBeNull();
    const filtered = applyBrushFilterModel(rows, model);
    expect(filtered).toHaveLength(100);
  });

  it('survives downsampled-chart brush via originalIndex (PR-A2a coupling)', () => {
    // Source dataset = 100 rows. The chart renders only every
    // other row (downsampled), so `dataIndex` reported by
    // ECharts is into the rendered array. `originalIndex`
    // resolves back to the source row id.
    const rows = makeFixture(100);
    const renderedData = rows
      .filter((_, idx) => idx % 2 === 0)
      .map((row, renderedIdx) => ({
        x: row.x,
        y: row.y,
        originalIndex: renderedIdx * 2, // matches the source
      }));

    // Brush (x: 20..50, y: 0..60). ECharts reports rendered
    // indices [10, 11, 12, 13, 14, 15] — i.e. source rows
    // 20, 22, 24, 26, 28, 30. (renderedIdx * 2)
    const event = rectEvent(20, 0, 50, 60, [10, 11, 12, 13, 14, 15]);
    const selection = normalizeBrushSelection(event, { data: renderedData });
    expect(selection?.indices).toEqual([20, 22, 24, 26, 28, 30]);

    const model = brushToAgGridFilterModel(selection, { xColId: 'x', yColId: 'y' });
    const filtered = applyBrushFilterModel(rows, model);
    // Every source row in (x: 20..50, y: 0..60) survives —
    // including the odd-indexed rows the chart never rendered.
    // This is the whole point: the brush filters the SOURCE
    // dataset, not just the visible sample.
    const expectedIds = rows
      .filter((r) => r.x >= 20 && r.x <= 50 && r.y >= 0 && r.y <= 60)
      .map((r) => r.id);
    expect(filtered.map((r) => r.id).sort((a, b) => a - b)).toEqual(expectedIds);
    // Sanity: source slice is wider than the rendered slice.
    expect(expectedIds.length).toBeGreaterThan(6);
  });
});
