import { describe, expect, it } from 'vitest';
import { countOverlaps, layoutOptions } from './graphLayout';

describe('graphLayout (gitops#3650)', () => {
  it('counts intersecting node boxes, not touching ones', () => {
    expect(countOverlaps([])).toBe(0);
    expect(countOverlaps([{ x1: 0, y1: 0, x2: 10, y2: 10 }])).toBe(0);
    expect(countOverlaps([
      { x1: 0, y1: 0, x2: 10, y2: 10 },
      { x1: 10, y1: 0, x2: 20, y2: 10 },   // shares an edge: no overlap
      { x1: 5, y1: 5, x2: 15, y2: 15 },    // overlaps both
    ])).toBe(2);
  });

  it('the neighbourhood pins the selected table at the centre, includes labels and fits with padding', () => {
    const o = layoutOptions('neighborhood', 'VOUCHER_ROW');
    expect(o.name).toBe('fcose');
    expect(o.nodeDimensionsIncludeLabels).toBe(true);
    expect(o.fit).toBe(true);
    expect(o.padding).toBe(40);
    expect(o.fixedNodeConstraint).toEqual([{ nodeId: 'VOUCHER_ROW', position: { x: 0, y: 0 } }]);
    expect(o.nodeSeparation).toBe(100);
  });

  it('the domain map keeps its draft quality and pins nothing', () => {
    const o = layoutOptions('domain', 'VOUCHER_ROW');
    expect(o.quality).toBe('draft');
    expect(o.fixedNodeConstraint).toBeUndefined();
    expect(layoutOptions('neighborhood', null).fixedNodeConstraint).toBeUndefined();
  });
});
