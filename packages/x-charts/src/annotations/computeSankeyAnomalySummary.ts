/**
 * computeSankeyAnomalySummary — Faz 21.11 batch3 sequential PR-Sankey.
 *
 * IQR detector for Sankey flow charts. Two detection modes:
 *
 *   - `'edges'` (default): every link is a candidate; outliers are
 *     unusually-thick OR unusually-thin flows. Emits `kind: 'sankey-edge'`
 *     payload with `source` + `target` + `edgeId` + `flowValue`
 *     metadata so the ChartAriaLive default formatter renders
 *     `source → target` arrows.
 *
 *   - `'nodes'`: per-node aggregated throughput (max of incoming /
 *     outgoing flow). Outliers are nodes with unusually-large flow
 *     volume. Emits `kind: 'sankey-node'` payload with `nodeId` +
 *     `flowValue` metadata.
 *
 * Both modes share the same Tukey IQR fence semantics (k=1.5 default,
 * <4 finite candidates skip, normalised severity by observed maxAbs).
 *
 * Design notes (Codex thread `019e1110` PR-Sankey iter-1):
 *
 *   - **Edges mode default**: Sankey's primary visual surface IS the
 *     flow ribbon — anomalous flows are what consumers care about.
 *     Node-mode is opt-in for "which nodes saw the most volume" reads.
 *
 *   - **Throughput aggregation (nodes mode)**: `flowThrough = max(
 *     totalIn, totalOut)`. This matches the existing `useChartA11y`
 *     a11y-table value for sankey nodes (`outFlow > 0 ? outFlow :
 *     inFlow`) so the SR table + the anomaly announcement agree.
 *
 *   - **`<4 finite candidates → []`**: Tukey fence statistically
 *     meaningless on tiny samples. Honest skip.
 *
 *   - **Severity normalisation**: `rawFenceDistance / observedMaxAbs`.
 *     No per-axis `max` declaration on Sankey, so observed magnitude
 *     is the only available scale.
 *
 *   - **Stable id format**:
 *       - edges mode: `${idPrefix}-${source}->${target}`
 *       - nodes mode: `${idPrefix}-node-${nodeName}`
 *     Both deterministic per-input so `anomalySignature` dedupe in
 *     ChartAriaLive works.
 *
 *   - **`x` field semantics**:
 *       - edges mode: `x = "${source} → ${target}"` (formatter falls
 *         back to this when `source/target` aren't both present)
 *       - nodes mode: `x = nodeName`
 */
import type { AnomalySummary, AnomalySeverityBucket } from './computeAnomalyOverlay';

/** Sankey node entry (mirrors `SankeyChart`'s `SankeyNode`). */
export interface SankeyAnomalyNode {
  /** Unique node name. */
  name: string;
}

/** Sankey link entry (mirrors `SankeyChart`'s `SankeyLink`). */
export interface SankeyAnomalyLink {
  /** Source node name (must match a `SankeyAnomalyNode.name`). */
  source: string;
  /** Target node name (must match a `SankeyAnomalyNode.name`). */
  target: string;
  /** Flow value. Non-finite (`NaN`, `Infinity`) entries skipped. */
  value: number;
}

export interface ComputeSankeyAnomalySummaryOptions {
  /** Sankey nodes — only required for `mode: 'nodes'`. Optional otherwise. */
  nodes?: ReadonlyArray<SankeyAnomalyNode>;
  /** Sankey links — required for both modes. */
  links: ReadonlyArray<SankeyAnomalyLink>;
  /**
   * Detection mode:
   *   - `'edges'` (default): every link is a candidate (kind: 'sankey-edge')
   *   - `'nodes'`: per-node aggregated throughput (kind: 'sankey-node')
   * @default 'edges'
   */
  mode?: 'edges' | 'nodes';
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
   * Id prefix.
   * @default `'sankey-anomaly'`
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

interface FenceParams {
  upperFence: number;
  lowerFence: number;
  axisScale: number;
}

function computeFence(values: number[], k: number): FenceParams | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const upperFence = q3 + k * iqr;
  const lowerFence = q1 - k * iqr;
  const observedMaxAbs = Math.max(...sorted.map(Math.abs));
  const axisScale = isFiniteNumber(observedMaxAbs) && observedMaxAbs > 0 ? observedMaxAbs : 1;
  return { upperFence, lowerFence, axisScale };
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                         */
/* ------------------------------------------------------------------ */

/**
 * Detect outliers in a Sankey flow chart. Returns `AnomalySummary[]`
 * payload that `ChartAriaLive` will announce via the `'sankey-edge'`
 * or `'sankey-node'` template branch (kind discriminator).
 */
export function computeSankeyAnomalySummary(
  options: ComputeSankeyAnomalySummaryOptions,
): AnomalySummary[] {
  const {
    nodes,
    links,
    mode = 'edges',
    k = 1.5,
    severityHighFraction = 0.25,
    idPrefix = 'sankey-anomaly',
    valueFormatter,
  } = options;

  if (!Array.isArray(links) || links.length === 0) return [];
  const fmt = valueFormatter ?? DEFAULT_FORMATTER;

  const candidates: Array<{
    id: string;
    x: string;
    value: number;
    kind: 'sankey-edge' | 'sankey-node';
    source?: string;
    target?: string;
    edgeId?: string;
    nodeId?: string;
  }> = [];

  if (mode === 'edges') {
    for (const link of links) {
      if (!isFiniteNumber(link.value)) continue;
      const edgeId = `${link.source}->${link.target}`;
      candidates.push({
        id: `${idPrefix}-${edgeId}`,
        x: `${link.source} → ${link.target}`,
        value: link.value,
        kind: 'sankey-edge',
        source: link.source,
        target: link.target,
        edgeId,
      });
    }
  } else {
    // mode === 'nodes': aggregate per-node throughput (max of in/out).
    // Mirrors `useChartA11y` sankey value: `outFlow > 0 ? outFlow : inFlow`.
    const totals = new Map<string, { in: number; out: number }>();
    const ensure = (name: string) => {
      if (!totals.has(name)) totals.set(name, { in: 0, out: 0 });
      return totals.get(name)!;
    };
    for (const link of links) {
      if (!isFiniteNumber(link.value)) continue;
      ensure(link.source).out += link.value;
      ensure(link.target).in += link.value;
    }
    // Iterate in nodes-array order when supplied (stable id ordering);
    // fall back to Map insertion order otherwise.
    const nodeNames = nodes && nodes.length > 0 ? nodes.map((n) => n.name) : [...totals.keys()];
    for (const name of nodeNames) {
      const t = totals.get(name);
      if (!t) continue;
      const flowThrough = Math.max(t.in, t.out);
      if (!isFiniteNumber(flowThrough) || flowThrough <= 0) continue;
      candidates.push({
        id: `${idPrefix}-node-${name}`,
        x: name,
        value: flowThrough,
        kind: 'sankey-node',
        nodeId: name,
      });
    }
  }

  if (candidates.length < 4) return [];

  const fence = computeFence(
    candidates.map((c) => c.value),
    k,
  );
  if (!fence) return [];

  const out: AnomalySummary[] = [];
  for (const cand of candidates) {
    let direction: AnomalySummary['direction'];
    let rawFenceDistance: number;
    if (cand.value > fence.upperFence) {
      direction = 'above';
      rawFenceDistance = cand.value - fence.upperFence;
    } else if (cand.value < fence.lowerFence) {
      direction = 'below';
      rawFenceDistance = fence.lowerFence - cand.value;
    } else {
      continue;
    }

    const severity = rawFenceDistance / fence.axisScale;
    const formattedY = fmt(cand.value);

    let ariaLabelHead: string;
    if (cand.kind === 'sankey-edge') {
      ariaLabelHead = `Outlier ${direction} expected flow from ${cand.source} to ${cand.target}`;
    } else {
      ariaLabelHead = `Outlier ${direction} expected node throughput at ${cand.nodeId}`;
    }

    out.push({
      id: cand.id,
      kind: cand.kind,
      x: cand.x,
      y: cand.value,
      formattedY,
      direction,
      severity,
      // Placeholder — overwritten below.
      severityBucket: 'medium' as AnomalySeverityBucket,
      ariaLabel: `${ariaLabelHead}, value=${formattedY} (medium severity)`,
      source: cand.source,
      target: cand.target,
      edgeId: cand.edgeId,
      nodeId: cand.nodeId,
      flowValue: cand.value,
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
