/**
 * computeHierarchicalAnomalySummary — Faz 21.11 batch3 sequential
 * PR-Hierarchical (Treemap + Sunburst).
 *
 * Tree-walking IQR detector for hierarchical charts (Treemap, Sunburst).
 * Emits `AnomalySummary[]` payload tagged with `kind: 'hierarchical'`
 * so the `ChartAriaLive` default formatter picks the hierarchy-aware
 * EN/TR template (added in batch3 contract — Codex thread `019e10a5`
 * iter-2).
 *
 * Design notes (Codex thread `019e1100` PR-Hierarchical iter-1):
 *
 *   - **Leaf-only detection by default**: only nodes WITHOUT `children`
 *     contribute to the IQR fence. Inner nodes are aggregations (their
 *     value is the sum of their leaves) so flagging them double-counts
 *     the same anomaly. Treemap consumers who want inner-node detection
 *     can flip `mode: 'all-nodes'`.
 *
 *   - **Single global IQR**: all leaves contribute to one fence. This
 *     is the simplest defensible default; per-parent IQR (siblings as
 *     the comparison set) is a future iter when consumers ask for it
 *     (often less useful in practice — a small subtree of "outliers"
 *     all sharing the same parent rank highly with global IQR but each
 *     looks normal under per-parent).
 *
 *   - **<4 finite leaves → []**: Tukey's fence is statistically
 *     meaningless on tiny samples. Honest skip.
 *
 *   - **Severity normalisation**: `rawFenceDistance / axisScale` where
 *     `axisScale = max(|finiteLeafValues|) ?? 1`. Hierarchical charts
 *     don't have a `max` axis declaration like radar, so observed
 *     magnitude is the only available scale.
 *
 *   - **Path & depth metadata**: every emitted anomaly carries its
 *     full root→leaf path array + depth. The default formatter renders
 *     `path.join(' > ')` (e.g. `"Q1 > North > NYC"`) so SR users hear
 *     the drill-down trail without having to navigate the chart.
 *
 *   - **Stable id format**: `${idPrefix}-${path.join('-')}` (path is
 *     already unique by construction within a single tree). Re-detection
 *     across renders with stable input produces the same id, so
 *     `anomalySignature` dedupe in `ChartAriaLive` works correctly.
 */
import type { AnomalySummary, AnomalySeverityBucket } from './computeAnomalyOverlay';

/** Single hierarchical node (Treemap / Sunburst leaf or inner node). */
export interface HierarchicalAnomalyNode {
  /** Display name for the node. Used as `AnomalySummary.x`. */
  name: string;
  /**
   * Numeric value at this node. Inner nodes typically aggregate their
   * children's values; leaves carry their own measure. Non-finite
   * (`undefined`, `NaN`, `Infinity`) values are skipped.
   */
  value?: number;
  /** Nested children. When omitted/empty the node is a leaf. */
  children?: ReadonlyArray<HierarchicalAnomalyNode>;
}

export interface ComputeHierarchicalAnomalySummaryOptions {
  /** Hierarchical tree(s). Multiple roots are walked independently. */
  data: ReadonlyArray<HierarchicalAnomalyNode>;
  /**
   * Tukey IQR fence multiplier. @default 1.5 — matches the flat
   * `computeAnomalySummary` precedent and the broader IQR convention.
   */
  k?: number;
  /**
   * Top-fraction of detected anomalies that earn `severityBucket:
   * 'high'`. Matches `ComputeAnomalySummaryOptions.severityHighFraction`
   * (Codex iter-1 precedent uyumu — NOT `maxAnomalyFraction`).
   * @default 0.25
   */
  severityHighFraction?: number;
  /**
   * Detection mode — which nodes contribute to the IQR fence and the
   * emitted anomaly list:
   *   - `'leaf-only'` (default): leaves only (children empty/missing).
   *     Inner-node aggregation values are EXCLUDED so the same anomaly
   *     isn't reported twice (once at the leaf, once at the parent's
   *     sum).
   *   - `'all-nodes'`: every node contributes. Useful when consumers
   *     want to flag "this aggregation drifted high" independent of
   *     leaf detail.
   * @default 'leaf-only'
   */
  mode?: 'leaf-only' | 'all-nodes';
  /**
   * Id prefix for `${idPrefix}-${path.join('-')}` ids.
   * @default `'hierarchy-anomaly'`
   */
  idPrefix?: string;
  /**
   * Optional formatter for `formattedY`. Falls back to
   * `value.toFixed(2)` to match the flat detector default.
   */
  valueFormatter?: (value: number) => string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_FORMATTER = (v: number): string => v.toFixed(2);

/**
 * Linear-interpolation quantile (matches numpy / Pandas type 7).
 * Caller MUST pass the array sorted ascending.
 */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sortedAsc.length) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface CollectedNode {
  path: string[];
  depth: number;
  value: number;
  isLeaf: boolean;
}

function collectNodes(
  data: ReadonlyArray<HierarchicalAnomalyNode>,
  mode: 'leaf-only' | 'all-nodes',
): CollectedNode[] {
  const out: CollectedNode[] = [];
  function walk(node: HierarchicalAnomalyNode, parentPath: string[]): void {
    const path = [...parentPath, node.name];
    const isLeaf = !node.children || node.children.length === 0;
    const include = mode === 'all-nodes' || isLeaf;
    if (include && isFiniteNumber(node.value)) {
      out.push({ path, depth: path.length - 1, value: node.value, isLeaf });
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        walk(child, path);
      }
    }
  }
  for (const root of data) {
    walk(root, []);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                         */
/* ------------------------------------------------------------------ */

/**
 * Detect outliers across a hierarchical chart (Treemap, Sunburst).
 * Returns an `AnomalySummary[]` payload that `ChartAriaLive` will
 * announce via the `'hierarchical'` template branch.
 */
export function computeHierarchicalAnomalySummary(
  options: ComputeHierarchicalAnomalySummaryOptions,
): AnomalySummary[] {
  const {
    data,
    k = 1.5,
    severityHighFraction = 0.25,
    mode = 'leaf-only',
    idPrefix = 'hierarchy-anomaly',
    valueFormatter,
  } = options;

  if (!Array.isArray(data) || data.length === 0) return [];

  const fmt = valueFormatter ?? DEFAULT_FORMATTER;
  const collected = collectNodes(data, mode);

  // Codex iter-1: <4 finite values → fence statistically meaningless.
  if (collected.length < 4) return [];

  const sortedValues = [...collected.map((c) => c.value)].sort((a, b) => a - b);
  const q1 = quantile(sortedValues, 0.25);
  const q3 = quantile(sortedValues, 0.75);
  const iqr = q3 - q1;
  const upperFence = q3 + k * iqr;
  const lowerFence = q1 - k * iqr;

  // Codex iter-1: severity normalisation scale. Hierarchical charts
  // don't have a per-axis `max` declaration; use observed magnitude.
  const observedMaxAbs = Math.max(...sortedValues.map(Math.abs));
  const axisScale = isFiniteNumber(observedMaxAbs) && observedMaxAbs > 0 ? observedMaxAbs : 1;

  const out: AnomalySummary[] = [];
  for (const { path, depth, value } of collected) {
    let direction: AnomalySummary['direction'];
    let rawFenceDistance: number;
    if (value > upperFence) {
      direction = 'above';
      rawFenceDistance = value - upperFence;
    } else if (value < lowerFence) {
      direction = 'below';
      rawFenceDistance = lowerFence - value;
    } else {
      continue;
    }

    const severity = rawFenceDistance / axisScale;
    const formattedY = fmt(value);
    const leafName = path[path.length - 1];

    const ariaLabelParts: string[] = [
      `Outlier ${direction} expected at ${path.join(' > ')}`,
      `value=${formattedY}`,
    ];

    out.push({
      id: `${idPrefix}-${path.join('-')}`,
      kind: 'hierarchical',
      x: leafName,
      y: value,
      formattedY,
      direction,
      severity,
      // Placeholder — overwritten below.
      severityBucket: 'medium' as AnomalySeverityBucket,
      ariaLabel: `${ariaLabelParts.join(', ')} (medium severity)`,
      path,
      depth,
    });
  }

  if (out.length === 0) return out;

  // Severity bucket second pass — top `severityHighFraction` of
  // detected anomalies (by `severity`) earn `'high'`; rest stay
  // `'medium'`. Single-anomaly batch always gets `'high'` (cap=1
  // by `Math.max(1, ceil(...))`).
  const sortedBySeverity = [...out].sort((a, b) => b.severity - a.severity);
  const cap = Math.max(1, Math.ceil(sortedBySeverity.length * severityHighFraction));
  const highIds = new Set(sortedBySeverity.slice(0, cap).map((a) => a.id));
  for (const a of out) {
    const bucket: AnomalySeverityBucket = highIds.has(a.id) ? 'high' : 'medium';
    a.severityBucket = bucket;
    // Refresh ariaLabel with the resolved bucket.
    a.ariaLabel = a.ariaLabel.replace(/\((?:medium|high) severity\)$/, `(${bucket} severity)`);
  }

  return out;
}
