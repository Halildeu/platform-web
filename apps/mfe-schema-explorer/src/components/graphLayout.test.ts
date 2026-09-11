import { describe, expect, it } from 'vitest';
import { countOverlaps, initialPositions, layoutOptions, resolveOverlaps } from './graphLayout';

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

describe('graphLayout determinism (gitops#3650, 2026-09-11)', () => {
  it('starts from the same positions every time: centre at the origin, the rest on a ring in id order', () => {
    const a = initialPositions(['B_TABLE', 'A_TABLE', 'VOUCHER_ROW', 'C_TABLE'], 'VOUCHER_ROW');
    const b = initialPositions(['C_TABLE', 'VOUCHER_ROW', 'A_TABLE', 'B_TABLE'], 'VOUCHER_ROW');
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    expect(a.get('VOUCHER_ROW')).toEqual({ x: 0, y: 0 });
    const ring = ['A_TABLE', 'B_TABLE', 'C_TABLE'].map(id => a.get(id)!);
    for (const p of ring) expect(Math.round(Math.hypot(p.x, p.y))).toBe(220);
    expect(new Set(ring.map(p => `${p.x},${p.y}`)).size).toBe(3);
  });

  it('lays a domain map (no centre) on a grid', () => {
    const p = initialPositions(['D', 'B', 'A', 'C'], null);
    expect(p.get('A')).toEqual({ x: 0, y: 0 });
    expect(p.get('B')).toEqual({ x: 180, y: 0 });
    expect(p.get('C')).toEqual({ x: 0, y: 90 });
    expect(p.get('D')).toEqual({ x: 180, y: 90 });
  });

  it('fcose no longer randomizes the start', () => {
    expect(layoutOptions('neighborhood', 'VOUCHER_ROW').randomize).toBe(false);
    expect(layoutOptions('domain', null).randomize).toBe(false);
  });

  const apply = (boxes: { id: string; x1: number; y1: number; x2: number; y2: number }[], shifts: Map<string, { x: number; y: number }>) =>
    boxes.map(b => { const s = shifts.get(b.id)!; return { ...b, x1: b.x1 + s.x, x2: b.x2 + s.x, y1: b.y1 + s.y, y2: b.y2 + s.y }; });

  it('pushes intersecting boxes apart until none intersect, moving the pinned centre never', () => {
    const boxes = [
      { id: 'VOUCHER_ROW', x1: -40, y1: -12, x2: 40, y2: 12 },
      { id: 'CODE_A', x1: 30, y1: -10, x2: 90, y2: 10 },       // overlaps the centre on x
      { id: 'CODE_B', x1: 35, y1: 5, x2: 95, y2: 25 },         // overlaps CODE_A and the centre
      { id: 'FAR', x1: 300, y1: 300, x2: 360, y2: 320 },       // untouched
    ];
    const shifts = resolveOverlaps(boxes, 'VOUCHER_ROW');
    expect(shifts.get('VOUCHER_ROW')).toEqual({ x: 0, y: 0 });
    expect(shifts.get('FAR')).toEqual({ x: 0, y: 0 });
    expect(countOverlaps(apply(boxes, shifts))).toBe(0);
  });

  it('is a no-op on a separated layout and deterministic on a crowded one', () => {
    const apart = [
      { id: 'A', x1: 0, y1: 0, x2: 10, y2: 10 },
      { id: 'B', x1: 20, y1: 0, x2: 30, y2: 10 },
    ];
    expect([...resolveOverlaps(apart, null).values()]).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);

    // Twelve boxes stacked on one spot: the pass must still separate them all.
    const crowded = Array.from({ length: 12 }, (_, i) => ({ id: `N${i}`, x1: i, y1: -i, x2: 80 + i, y2: 20 - i }));
    const first = resolveOverlaps(crowded, null);
    const second = resolveOverlaps(crowded, null);
    expect(countOverlaps(apply(crowded, first))).toBe(0);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});
