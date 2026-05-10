'use client';

/**
 * AnomalyDetectorsShowcase — Faz 21.11 batch3 follow-up demo route.
 *
 * Single-page showcase of the four `AnomalySummary` detectors that
 * landed in PR-A2b-a11y / PR-Radar / PR-Hierarchical / PR-Sankey:
 *
 *   1. **Flat IQR** (ScatterChart, kind: 'flat')
 *      `computeAnomalySummary` — original Tukey fence on a flat
 *      `(x, y)` series. Fired by Line/Area/Bar/Heatmap/Pie/Funnel/
 *      Waterfall consumers via `anomalySummary` forward.
 *
 *   2. **Per-indicator IQR** (RadarChart, kind: 'radar')
 *      `computeRadarAnomalySummary` — per-spoke fence so cross-
 *      indicator (Latency vs Throughput vs Errors) ranks fairly via
 *      normalised severity.
 *
 *   3. **Tree-walking IQR** (TreemapChart, kind: 'hierarchical')
 *      `computeHierarchicalAnomalySummary` — leaf-only mode by
 *      default; emits `path[]` so the SR formatter renders
 *      drill-down trail (`Q1 > North > NYC`).
 *
 *   4. **Dual-mode IQR** (SankeyChart, kind: 'sankey-edge')
 *      `computeSankeyAnomalySummary` — flow-anomaly mode (default);
 *      emits `source → target` arrows in the SR template.
 *
 * Each card pairs a live chart preview with a "show anomalies" toggle
 * that injects the detector output via `anomalySummary` prop. With
 * the toggle on, the dedicated `chart-aria-live-anomalies` region
 * mounts and SR users hear the domain-aware EN/TR template (verified
 * end-to-end in `charts-anomaly-aria-live.test.tsx`).
 *
 * No API keys, no backend dependency — every fixture is inline so
 * the showcase route can be opened cold by operators / sales /
 * a11y reviewers without any deployment prerequisites.
 *
 * Design notes:
 *
 *   - Read-only demo: no consumer-callback wiring (no `onDataPointClick`
 *     / `onMarkupClick` / etc.). Keeps the page free of cross-filter
 *     state so the focus stays on the announcement contract.
 *
 *   - All 4 detectors are exercised with the SAME UI shell (toggle +
 *     description card), so visual regression of the page is purely
 *     about the four chart wrappers, not bespoke layout per card.
 *
 *   - Kept at <300 LoC including fixture data so the page chunk stays
 *     small (lazy-loaded in `DesignLabRoutes.tsx`).
 */
import React, { useMemo, useState } from 'react';
import {
  ScatterChart,
  RadarChart,
  TreemapChart,
  SankeyChart,
  computeAnomalySummary,
  computeRadarAnomalySummary,
  computeHierarchicalAnomalySummary,
  computeSankeyAnomalySummary,
} from '@mfe/x-charts';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const FLAT_DATA = [
  { x: 1, y: 10 },
  { x: 2, y: 11 },
  { x: 3, y: 12 },
  { x: 4, y: 13 },
  { x: 5, y: 14 },
  { x: 6, y: 15 },
  { x: 7, y: 16 },
  { x: 8, y: 17 },
  { x: 9, y: 18 },
  { x: 10, y: 19 },
  { x: 11, y: 20 },
  { x: 12, y: 21 },
  { x: 13, y: 1500 }, // upper-fence outlier
  { x: 14, y: 22 },
];

const RADAR_INDICATORS = [
  { name: 'Latency', max: 500, unit: 'ms' },
  { name: 'Throughput', max: 100000, unit: 'rps' },
  { name: 'Errors', max: 100, unit: '%' },
];

const RADAR_SERIES = [
  { name: 'Q1', data: [100, 50000, 5] },
  { name: 'Q2', data: [110, 55000, 7] },
  { name: 'Q3', data: [120, 60000, 6] },
  { name: 'Q4', data: [115, 58000, 8] },
  { name: 'Q5', data: [400, 90000, 50] }, // outlier on every indicator
];

const TREEMAP_DATA = [
  {
    name: 'Q1 Sales',
    children: [
      {
        name: 'North',
        children: [
          { name: 'NYC', value: 120 },
          { name: 'BOS', value: 80 },
          { name: 'PHL', value: 90 },
          { name: 'DC', value: 110 },
        ],
      },
      {
        name: 'South',
        children: [
          { name: 'ATL', value: 100 },
          { name: 'MIA', value: 95 },
          { name: 'NOL', value: 9999 }, // upper-fence outlier (drill-down)
          { name: 'HOU', value: 105 },
        ],
      },
      {
        name: 'West',
        children: [
          { name: 'LAX', value: 130 },
          { name: 'SFO', value: 140 },
          { name: 'SEA', value: 115 },
          { name: 'DEN', value: 125 },
        ],
      },
    ],
  },
];

const SANKEY_NODES = [
  { name: 'Trial' },
  { name: 'Free' },
  { name: 'Pro' },
  { name: 'Enterprise' },
  { name: 'Churned' },
];

const SANKEY_LINKS = [
  { source: 'Trial', target: 'Free', value: 1000 },
  { source: 'Trial', target: 'Pro', value: 200 },
  { source: 'Trial', target: 'Churned', value: 800 },
  { source: 'Free', target: 'Pro', value: 150 },
  { source: 'Free', target: 'Enterprise', value: 9999 }, // edge outlier
  { source: 'Free', target: 'Churned', value: 250 },
  { source: 'Pro', target: 'Enterprise', value: 50 },
  { source: 'Pro', target: 'Churned', value: 30 },
  { source: 'Enterprise', target: 'Churned', value: 10 },
];

/* ------------------------------------------------------------------ */
/*  UI shell                                                           */
/* ------------------------------------------------------------------ */

interface DetectorCardProps {
  title: string;
  kind: string;
  description: string;
  fixtureSummary: string;
  detectorOutputCount: number;
  showAnomalies: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}

function DetectorCard(props: DetectorCardProps): React.ReactElement {
  const {
    title,
    kind,
    description,
    fixtureSummary,
    detectorOutputCount,
    showAnomalies,
    onToggle,
    testId,
    children,
  } = props;
  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-4"
    >
      <header className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            <code>{kind}</code> · {fixtureSummary}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={showAnomalies}
          data-testid={`${testId}-toggle`}
          className="rounded border border-[var(--color-border-subtle)] px-3 py-1 text-xs"
        >
          {showAnomalies
            ? `Hide anomalies (${detectorOutputCount})`
            : `Show anomalies (${detectorOutputCount})`}
        </button>
      </header>
      <p className="mb-3 text-xs text-[var(--color-text-secondary)]">{description}</p>
      <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2">
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AnomalyDetectorsShowcase(): React.ReactElement {
  const [flatOn, setFlatOn] = useState(false);
  const [radarOn, setRadarOn] = useState(false);
  const [hierOn, setHierOn] = useState(false);
  const [sankeyOn, setSankeyOn] = useState(false);

  const flatAnomalies = useMemo(() => computeAnomalySummary({ data: FLAT_DATA }), []);
  const radarAnomalies = useMemo(
    () =>
      computeRadarAnomalySummary({
        indicators: RADAR_INDICATORS,
        series: RADAR_SERIES,
      }),
    [],
  );
  const hierAnomalies = useMemo(
    () => computeHierarchicalAnomalySummary({ data: TREEMAP_DATA }),
    [],
  );
  const sankeyAnomalies = useMemo(
    () => computeSankeyAnomalySummary({ links: SANKEY_LINKS, nodes: SANKEY_NODES }),
    [],
  );

  return (
    <main
      data-testid="anomaly-detectors-showcase"
      className="mx-auto max-w-6xl space-y-4 px-4 py-6"
    >
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Anomaly Detectors Showcase
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Faz 21.11 batch3 sequential epic — four detectors emitting <code>AnomalySummary[]</code>{' '}
          with <code>kind</code>-discriminated payloads. Toggle each card to inject the detector
          output via <code>anomalySummary</code>; ChartA11yShell mounts a dedicated polite live
          region and the default formatter renders the domain-aware EN/TR template.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetectorCard
          title="Flat IQR (Scatter)"
          kind="kind: 'flat'"
          description="Tukey fence on a flat (x, y) series. Used by Line/Area/Bar/Heatmap/Pie/Funnel/Waterfall via anomalySummary forward."
          fixtureSummary="14 points, 1 spike at x=13"
          detectorOutputCount={flatAnomalies.length}
          showAnomalies={flatOn}
          onToggle={() => setFlatOn((v) => !v)}
          testId="anomaly-card-flat"
        >
          <ScatterChart data={FLAT_DATA} anomalySummary={flatOn ? flatAnomalies : undefined} />
        </DetectorCard>

        <DetectorCard
          title="Per-indicator IQR (Radar)"
          kind="kind: 'radar'"
          description="Per-spoke Tukey fence so cross-indicator severity (Latency ms vs Throughput rps vs Errors %) ranks via normalised severity."
          fixtureSummary="3 indicators × 5 quarters; Q5 outlier on every indicator"
          detectorOutputCount={radarAnomalies.length}
          showAnomalies={radarOn}
          onToggle={() => setRadarOn((v) => !v)}
          testId="anomaly-card-radar"
        >
          <RadarChart
            indicators={RADAR_INDICATORS}
            series={RADAR_SERIES}
            anomalySummary={radarOn ? radarAnomalies : undefined}
          />
        </DetectorCard>

        <DetectorCard
          title="Tree-walking IQR (Treemap)"
          kind="kind: 'hierarchical'"
          description="Leaf-only IQR; emits path[] so SR users hear the drill-down trail (Q1 > South > NOL)."
          fixtureSummary="Q1 Sales tree, NOL outlier in South region"
          detectorOutputCount={hierAnomalies.length}
          showAnomalies={hierOn}
          onToggle={() => setHierOn((v) => !v)}
          testId="anomaly-card-hierarchical"
        >
          <TreemapChart data={TREEMAP_DATA} anomalySummary={hierOn ? hierAnomalies : undefined} />
        </DetectorCard>

        <DetectorCard
          title="Dual-mode IQR (Sankey)"
          kind="kind: 'sankey-edge'"
          description="Flow-anomaly mode (default). Emits source → target arrows; nodes mode (opt-in) aggregates per-node throughput."
          fixtureSummary="Subscription funnel; Free → Enterprise edge outlier"
          detectorOutputCount={sankeyAnomalies.length}
          showAnomalies={sankeyOn}
          onToggle={() => setSankeyOn((v) => !v)}
          testId="anomaly-card-sankey"
        >
          <SankeyChart
            nodes={SANKEY_NODES}
            links={SANKEY_LINKS}
            anomalySummary={sankeyOn ? sankeyAnomalies : undefined}
          />
        </DetectorCard>
      </div>

      <footer className="text-xs text-[var(--color-text-secondary)]">
        <p>
          Each card&apos;s &quot;Show anomalies&quot; toggle wires <code>anomalySummary</code>{' '}
          through the wrapper&apos;s <code>ChartA11yShell</code>; SR users hear the domain-aware
          EN/TR template (e.g.{' '}
          <em>
            &quot;1 hierarchy anomaly detected. Most extreme: Q1 &gt; South &gt; NOL, value
            9999.00&quot;
          </em>
          ). Pair with VoiceOver / NVDA to verify announcement contract.
        </p>
      </footer>
    </main>
  );
}
