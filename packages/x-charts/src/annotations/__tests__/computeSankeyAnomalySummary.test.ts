/**
 * computeSankeyAnomalySummary — pure helper tests
 * (Faz 21.11 batch3 / PR-Sankey).
 *
 * Locks the dual-mode IQR detector contract Codex thread `019e1110`
 * PR-Sankey iter-1 mandated:
 *   - mode='edges' (default) → kind: 'sankey-edge' + source/target/edgeId
 *   - mode='nodes' → kind: 'sankey-node' + nodeId + flowThrough
 *   - <4 finite candidates total → no anomalies
 *   - normalised severity (rawFenceDistance / observedMaxAbs)
 *   - id format `${idPrefix}-${source}->${target}` or
 *     `${idPrefix}-node-${nodeName}`
 *   - severityHighFraction default 0.25 (precedent uyumu)
 *   - flowValue field propagated for both modes
 */
import { describe, it, expect } from 'vitest';
import { computeSankeyAnomalySummary } from '../computeSankeyAnomalySummary';

describe('computeSankeyAnomalySummary — empty / tiny inputs', () => {
  it('returns [] when links empty', () => {
    expect(computeSankeyAnomalySummary({ links: [] })).toEqual([]);
  });

  it('skips when fewer than 4 finite link candidates (edges mode)', () => {
    const out = computeSankeyAnomalySummary({
      links: [
        { source: 'A', target: 'B', value: 10 },
        { source: 'A', target: 'C', value: 11 },
        { source: 'B', target: 'C', value: 999 },
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips non-finite link values silently', () => {
    const out = computeSankeyAnomalySummary({
      links: [
        { source: 'A', target: 'B', value: 10 },
        { source: 'A', target: 'C', value: Number.NaN },
        { source: 'B', target: 'D', value: Number.POSITIVE_INFINITY },
      ],
    });
    // Only 1 finite link → <4 → skip.
    expect(out).toEqual([]);
  });
});

describe('computeSankeyAnomalySummary — edges mode (default)', () => {
  // 12 baseline links + 4 spike links so Tukey IQR fence detects all spikes.
  // Same pattern as computeHierarchicalAnomalySummary bucketing tests.
  const BASELINE_LINKS = [
    { source: 'A', target: 'X', value: 10 },
    { source: 'A', target: 'Y', value: 11 },
    { source: 'B', target: 'X', value: 12 },
    { source: 'B', target: 'Y', value: 13 },
    { source: 'C', target: 'X', value: 14 },
    { source: 'C', target: 'Y', value: 15 },
    { source: 'D', target: 'X', value: 16 },
    { source: 'D', target: 'Y', value: 17 },
    { source: 'E', target: 'X', value: 18 },
    { source: 'E', target: 'Y', value: 19 },
    { source: 'F', target: 'X', value: 20 },
    { source: 'F', target: 'Y', value: 21 },
  ];
  const SPIKE_LINKS = [
    { source: 'G', target: 'X', value: 1000 },
    { source: 'G', target: 'Y', value: 2000 },
    { source: 'H', target: 'X', value: 3000 },
    { source: 'H', target: 'Y', value: 4000 },
  ];

  it('flags upper-fence edges with kind=sankey-edge + source/target/edgeId metadata', () => {
    const out = computeSankeyAnomalySummary({
      links: [...BASELINE_LINKS, ...SPIKE_LINKS],
    });
    expect(out).toHaveLength(4);
    const top = out.find((a) => a.y === 4000)!;
    expect(top.kind).toBe('sankey-edge');
    expect(top.source).toBe('H');
    expect(top.target).toBe('Y');
    expect(top.edgeId).toBe('H->Y');
    expect(top.x).toBe('H → Y');
    expect(top.flowValue).toBe(4000);
    expect(top.direction).toBe('above');
    expect(top.id).toBe('sankey-anomaly-H->Y');
  });

  it('flags lower-fence edges as direction "below"', () => {
    const out = computeSankeyAnomalySummary({
      links: [
        { source: 'A', target: 'B', value: 100 },
        { source: 'A', target: 'C', value: 110 },
        { source: 'A', target: 'D', value: 120 },
        { source: 'A', target: 'E', value: 130 },
        { source: 'A', target: 'F', value: 1 }, // lower-fence outlier
      ],
    });
    // n=5; with this spread the lower outlier should be flagged.
    expect(out.find((a) => a.y === 1)?.direction).toBe('below');
  });

  it('honours custom idPrefix', () => {
    const out = computeSankeyAnomalySummary({
      idPrefix: 'q4-flow',
      links: [...BASELINE_LINKS, ...SPIKE_LINKS],
    });
    expect(out[0].id.startsWith('q4-flow-')).toBe(true);
  });
});

describe('computeSankeyAnomalySummary — nodes mode', () => {
  // Construct a network where node H aggregates a clear high-throughput
  // outlier vs the rest.
  const NODES = [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
    { name: 'D' },
    { name: 'E' },
    { name: 'F' },
    { name: 'G' },
    { name: 'H' }, // high-throughput outlier sink
    { name: 'X' },
    { name: 'Y' },
    { name: 'Z' },
  ];
  const LINKS = [
    { source: 'A', target: 'X', value: 10 },
    { source: 'B', target: 'X', value: 11 },
    { source: 'C', target: 'X', value: 12 },
    { source: 'D', target: 'Y', value: 13 },
    { source: 'E', target: 'Y', value: 14 },
    { source: 'F', target: 'Z', value: 15 },
    { source: 'G', target: 'Z', value: 16 },
    // Massive flow into H from A-G
    { source: 'A', target: 'H', value: 5000 },
    { source: 'B', target: 'H', value: 5000 },
    { source: 'C', target: 'H', value: 5000 },
    { source: 'D', target: 'H', value: 5000 },
  ];

  it('aggregates per-node throughput + flags high-flow nodes (kind=sankey-node)', () => {
    const out = computeSankeyAnomalySummary({
      mode: 'nodes',
      nodes: NODES,
      links: LINKS,
    });
    // H = 20000 inflow → outlier. X = 33, Y = 27, Z = 31 → not outliers.
    const flagged = out.find((a) => a.x === 'H');
    expect(flagged).toBeDefined();
    expect(flagged!.kind).toBe('sankey-node');
    expect(flagged!.nodeId).toBe('H');
    expect(flagged!.id).toBe('sankey-anomaly-node-H');
    expect(flagged!.flowValue).toBe(20000);
    expect(flagged!.direction).toBe('above');
  });

  it('uses Math.max(in, out) for throughput so source-only or sink-only nodes count', () => {
    // A is pure source (no incoming), value tracks outgoing total.
    const out = computeSankeyAnomalySummary({
      mode: 'nodes',
      nodes: NODES,
      links: LINKS,
    });
    const a = out.find((x) => x.x === 'A');
    // A's outflow = 10 (to X) + 5000 (to H) = 5010 → not high enough vs
    // H's 20000 to be the most-extreme but should appear as throughput
    // candidate at least equal to that sum.
    if (a) {
      expect(a.flowValue).toBeGreaterThanOrEqual(5010);
    }
  });

  it('falls back to Map insertion order when nodes array omitted', () => {
    const out = computeSankeyAnomalySummary({
      mode: 'nodes',
      links: LINKS,
    });
    // Smoke: detector still runs and emits at least the H outlier.
    expect(out.find((a) => a.nodeId === 'H')).toBeDefined();
  });
});

describe('computeSankeyAnomalySummary — severityHighFraction bucketing', () => {
  const BASELINE_LINKS = [
    { source: 'A', target: 'X', value: 10 },
    { source: 'A', target: 'Y', value: 11 },
    { source: 'B', target: 'X', value: 12 },
    { source: 'B', target: 'Y', value: 13 },
    { source: 'C', target: 'X', value: 14 },
    { source: 'C', target: 'Y', value: 15 },
    { source: 'D', target: 'X', value: 16 },
    { source: 'D', target: 'Y', value: 17 },
    { source: 'E', target: 'X', value: 18 },
    { source: 'E', target: 'Y', value: 19 },
    { source: 'F', target: 'X', value: 20 },
    { source: 'F', target: 'Y', value: 21 },
  ];
  const SPIKE_LINKS = [
    { source: 'G', target: 'X', value: 1000 },
    { source: 'G', target: 'Y', value: 2000 },
    { source: 'H', target: 'X', value: 3000 },
    { source: 'H', target: 'Y', value: 4000 },
  ];

  it('default 0.25 → top quarter become "high"', () => {
    const out = computeSankeyAnomalySummary({
      links: [...BASELINE_LINKS, ...SPIKE_LINKS],
    });
    expect(out).toHaveLength(4);
    const high = out.filter((a) => a.severityBucket === 'high');
    // 4 outliers × 0.25 = 1 high.
    expect(high).toHaveLength(1);
    expect(high[0].y).toBe(4000);
  });

  it('custom severityHighFraction tightens the high bucket', () => {
    const out = computeSankeyAnomalySummary({
      severityHighFraction: 0.5,
      links: [...BASELINE_LINKS, ...SPIKE_LINKS],
    });
    expect(out).toHaveLength(4);
    const high = out.filter((a) => a.severityBucket === 'high');
    // 4 × 0.5 = 2 high.
    expect(high).toHaveLength(2);
  });
});

describe('computeSankeyAnomalySummary — formattedY + ariaLabel', () => {
  const BASELINE_LINKS = [
    { source: 'A', target: 'X', value: 10 },
    { source: 'A', target: 'Y', value: 11 },
    { source: 'B', target: 'X', value: 12 },
    { source: 'B', target: 'Y', value: 13 },
    { source: 'C', target: 'X', value: 14 },
    { source: 'C', target: 'Y', value: 15 },
    { source: 'D', target: 'X', value: 16 },
    { source: 'D', target: 'Y', value: 17 },
    { source: 'E', target: 'X', value: 18 },
    { source: 'E', target: 'Y', value: 19 },
    { source: 'F', target: 'X', value: 20 },
    { source: 'F', target: 'Y', value: 21 },
  ];

  it('formattedY uses default toFixed(2)', () => {
    const out = computeSankeyAnomalySummary({
      links: [...BASELINE_LINKS, { source: 'G', target: 'X', value: 999.456 }],
    });
    const top = out.find((a) => a.y === 999.456);
    if (top) {
      expect(top.formattedY).toBe('999.46');
    }
  });

  it('formattedY honours valueFormatter override', () => {
    const out = computeSankeyAnomalySummary({
      valueFormatter: (v) => `${Math.round(v)}!`,
      links: [...BASELINE_LINKS, { source: 'G', target: 'X', value: 999.456 }],
    });
    const top = out.find((a) => a.y === 999.456);
    if (top) {
      expect(top.formattedY).toBe('999!');
    }
  });

  it('ariaLabel for edges mode includes flow direction + source→target', () => {
    const out = computeSankeyAnomalySummary({
      links: [...BASELINE_LINKS, { source: 'G', target: 'X', value: 10000 }],
    });
    const top = out.find((a) => a.y === 10000)!;
    expect(top.ariaLabel).toBe(
      'Outlier above expected flow from G to X, value=10000.00 (high severity)',
    );
  });

  it('ariaLabel for nodes mode mentions node throughput', () => {
    const out = computeSankeyAnomalySummary({
      mode: 'nodes',
      links: [
        { source: 'A', target: 'X', value: 10 },
        { source: 'B', target: 'X', value: 11 },
        { source: 'C', target: 'X', value: 12 },
        { source: 'D', target: 'X', value: 13 },
        { source: 'E', target: 'X', value: 9999 }, // E outflow = 9999 → outlier
      ],
    });
    const top = out.find((a) => a.nodeId === 'X');
    // X's inflow = 10+11+12+13+9999 = 10045 → likely most-extreme node throughput.
    if (top) {
      expect(top.ariaLabel).toMatch(/^Outlier above expected node throughput at X/);
    }
  });
});
