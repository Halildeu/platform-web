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
 * fcose starts from random positions and does not guarantee separation. The neighbourhood
 * now starts from deterministic positions (`initialPositions`) with fcose told not to
 * randomize, and once fcose stops, any boxes that still intersect are separated by
 * `resolveOverlaps` before the fit: an iterative push-apart that keeps fcose's shape,
 * followed — only if anything still intersects — by a finite greedy placement that
 * walks each remaining box outward from the pinned centre until it is clear. The
 * reported number is therefore 0 by construction rather than by luck (Codex 01a08f35:
 * the push-apart alone left 9 pairs on 30 identical boxes within its budget).
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
 * Separate intersecting boxes. Returns the shift per node id; the pinned node never
 * moves. Deterministic: pairs are visited in input order and nothing is random.
 *
 * Pass 1 pushes each intersecting pair apart along the axis of least penetration (the
 * partner of the pinned node takes the whole displacement, otherwise 50/50) for up to
 * `maxIterations` sweeps — this keeps fcose's shape for the ordinary residual overlap.
 * Pass 2 runs only if pass 1 left intersections (dense stacks): boxes are placed one by
 * one, ordered by distance from the pinned centre then id, each walked outward along
 * its own direction until it clears everything placed before it. Every step moves a
 * box strictly further out and the placed set is finite, so pass 2 terminates with no
 * intersections left.
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
  if (countOverlaps(current) === 0) return shift;

  // Pass 2: finite greedy placement outward from the pinned centre.
  const centerBox = pinned ? current.find(b => b.id === pinned) : undefined;
  const origin: Point = centerBox
    ? { x: (centerBox.x1 + centerBox.x2) / 2, y: (centerBox.y1 + centerBox.y2) / 2 }
    : { x: 0, y: 0 };
  const centre = (b: Box): Point => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
  const order = [...current].sort((a, b) => {
    if (a.id === pinned) return -1;
    if (b.id === pinned) return 1;
    const da = Math.hypot(centre(a).x - origin.x, centre(a).y - origin.y);
    const db = Math.hypot(centre(b).x - origin.x, centre(b).y - origin.y);
    return da - db || a.id.localeCompare(b.id);
  });
  const placed: NodeBox[] = [];
  order.forEach((b, index) => {
    if (b.id !== pinned) {
      const c = centre(b);
      let dx = c.x - origin.x;
      let dy = c.y - origin.y;
      let length = Math.hypot(dx, dy);
      if (length < 1) {
        // Sitting on the centre: fan out by index so stacked boxes take distinct rays.
        const angle = index * 2.399963; // golden angle, never repeats a direction exactly
        dx = Math.cos(angle); dy = Math.sin(angle); length = 1;
      }
      const step = Math.max(gap, Math.min(b.x2 - b.x1, b.y2 - b.y1) / 2);
      const ux = (dx / length) * step;
      const uy = (dy / length) * step;
      while (placed.some(p => intersects(p, b))) move(b, ux, uy);
    }
    placed.push(b);
  });
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
    // The neighbourhood starts from `initialPositions`, not from random ones, so the
    // same data lays out the same way every time. The domain map keeps randomizing:
    // fcose 2.2 with quality 'draft' skips its CoSE phase and, without the spectral
    // start that randomize:true triggers, throws (Codex 01a08f35) — the draft map
    // would silently fall back to the grid.
    randomize: !neighborhood,
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
