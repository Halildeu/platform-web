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
 */

export type ViewMode = 'domain' | 'neighborhood';

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Pairs of boxes that intersect (touching edges do not count). */
export function countOverlaps(boxes: Box[]): number {
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) overlaps++;
    }
  }
  return overlaps;
}

/** fcose options per view; the neighbourhood pins its centre so the eye has an anchor. */
export function layoutOptions(viewMode: ViewMode, center: string | null): Record<string, unknown> {
  const neighborhood = viewMode === 'neighborhood';
  return {
    name: 'fcose',
    quality: neighborhood ? 'default' : 'draft',
    animate: true,
    animationDuration: 500,
    randomize: true,
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
