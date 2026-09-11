/**
 * Layout policy for the ER graph (gitops#3650).
 *
 * Measured on testai 2026-09-10 (VOUCHER_ROW, 19 outgoing keys): nodes were sized by
 * their reference count, so labels ran past the box and over their neighbours, and the
 * finished layout was never fitted to the canvas, so the outer nodes sat off-screen.
 * Nodes are now sized by their label (fcose is told to include labels when it separates
 * them), the selected table is pinned at the centre of its neighbourhood, and the view
 * is fitted once the layout stops. `countOverlaps` is what the container reports for
 * acceptance (`data-overlaps`), so a regression is a number, not an impression.
 *
 * 2026-09-11: the acceptance run on the merged build still hit 1 overlap out of 2 runs —
 * fcose starts from random positions and does not guarantee separation. The layout now
 * starts from deterministic positions (`initialPositions`) and, once fcose stops, any
 * boxes that still intersect are pushed apart by `resolveOverlaps` before the fit, so
 * the reported number is 0 by construction rather than by luck.
 */

export type ViewMode = 'domain' | 'neighborhood';

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NodeBox extends Box {
  id: string;
}

export interface Point {
  x: number;
  y: number;
}

const intersects = (a: Box, b: Box): boolean => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Pairs of boxes that intersect (touching edges do not count). */
export function countOverlaps(boxes: Box[]): number {
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (intersects(boxes[i], boxes[j])) overlaps++;
    }
  }
  return overlaps;
}

/**
 * Deterministic starting positions so the same neighbourhood lays out the same way on
 * every visit: the pinned centre at the origin, the others on a ring in id order (the
 * ring grows with the node count so labels start apart). Domain maps use a grid.
 */
export function initialPositions(ids: string[], center: string | null): Map<string, Point> {
  const out = new Map<string, Point>();
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  if (center && sorted.includes(center)) {
    out.set(center, { x: 0, y: 0 });
    const ring = sorted.filter(id => id !== center);
    const radius = Math.max(220, ring.length * 28);
    ring.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, ring.length) - Math.PI / 2;
      out.set(id, { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) });
    });
    return out;
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  sorted.forEach((id, i) => out.set(id, { x: (i % columns) * 180, y: Math.floor(i / columns) * 90 }));
  return out;
}

/**
 * Push intersecting boxes apart along the axis of least penetration until none
 * intersect (or the iteration budget runs out). Returns the shift per node id. The
 * pinned node never moves; its partner takes the whole displacement. Deterministic:
 * pairs are visited in input order and nothing is random.
 */
export function resolveOverlaps(boxes: NodeBox[], pinned: string | null, gap = 8, maxIterations = 200): Map<string, Point> {
  const current = boxes.map(b => ({ ...b }));
  const shift = new Map<string, Point>(current.map(b => [b.id, { x: 0, y: 0 }]));
  const move = (b: NodeBox, dx: number, dy: number) => {
    b.x1 += dx; b.x2 += dx; b.y1 += dy; b.y2 += dy;
    const s = shift.get(b.id)!;
    s.x += dx; s.y += dy;
  };
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let moved = false;
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i];
        const b = current[j];
        if (!intersects(a, b)) continue;
        moved = true;
        const overlapX = Math.min(a.x2 - b.x1, b.x2 - a.x1) + gap;
        const overlapY = Math.min(a.y2 - b.y1, b.y2 - a.y1) + gap;
        const shareA = a.id === pinned ? 0 : b.id === pinned ? 1 : 0.5;
        const shareB = 1 - shareA;
        if (overlapX < overlapY) {
          const dir = (a.x1 + a.x2) / 2 <= (b.x1 + b.x2) / 2 ? 1 : -1;
          move(a, -dir * shareA * overlapX, 0);
          move(b, dir * shareB * overlapX, 0);
        } else {
          const dir = (a.y1 + a.y2) / 2 <= (b.y1 + b.y2) / 2 ? 1 : -1;
          move(a, 0, -dir * shareA * overlapY);
          move(b, 0, dir * shareB * overlapY);
        }
      }
    }
    if (!moved) break;
  }
  return shift;
}

/** fcose options per view; the neighbourhood pins its centre so the eye has an anchor. */
export function layoutOptions(viewMode: ViewMode, center: string | null): Record<string, unknown> {
  const neighborhood = viewMode === 'neighborhood';
  return {
    name: 'fcose',
    quality: neighborhood ? 'default' : 'draft',
    animate: true,
    animationDuration: 500,
    // Start from `initialPositions`, not from random ones: the same data lays out the
    // same way every time, so acceptance screenshots are comparable run to run.
    randomize: false,
    fit: true,
    padding: 40,
    nodeDimensionsIncludeLabels: true,
    nodeSeparation: neighborhood ? 100 : 120,
    idealEdgeLength: neighborhood ? 160 : 100,
    nodeRepulsion: neighborhood ? 12000 : 8000,
    numIter: neighborhood ? 1500 : 500,
    ...(neighborhood && center
      ? { fixedNodeConstraint: [{ nodeId: center, position: { x: 0, y: 0 } }] }
      : {}),
  };
}
