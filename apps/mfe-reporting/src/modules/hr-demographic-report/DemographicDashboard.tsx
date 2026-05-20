import React, { useEffect, useMemo, useState } from 'react';
import { getSummary, getLiveKPIs, getLiveCharts } from './api';
import type { DemographicSummary } from './types';
// PR-X14 (Codex 019e26a9 plan-time AGREE): canonical İkamet Şehri
// visualisation replaces the duplicate "Lokasyon Dagilimi" PieChart
// widgets. GeoMap + bubble overlay + drill-down drawer.
import { LocationGeoMap } from './LocationGeoMap';
import {
  PieChart as XPieChart,
  BarChart as XBarChart,
  TreemapChart as XTreemapChart,
  ChartContainer as XChartContainer,
  KPICard as XKPICard,
  type KPICardTrend,
  // 2026-05-13 — PR-X11 completes the bespoke-SVG → x-charts migration.
  // GaugeChart replaces big-number divs; LineChart replaces the Maas
  // Farki Trendi polyline; BarChart now backs BulletChart (showBackground +
  // LineMarkup), ProgressBar (showBackground) and StackedBar (stacked
  // multi-series). PR-X1 + PR-X11 wrapper extensions
  // (stacked/showBackground/valueAxisMin/valueAxisMax) made the internal
  // swaps possible without changing call-site APIs.
  GaugeChart as XGaugeChart,
  LineChart as XLineChart,
  // PR#3 (Codex thread 019e3f75): AgePyramidChart drops its hand-rolled
  // negate-one-series BarChart shim for the canonical PopulationPyramid
  // wrapper — the 29th @mfe/x-charts wrapper (diverging horizontal bar).
  PopulationPyramid as XPopulationPyramid,
  // Codex thread 019e4301 Campaign 4 PR#3 (AGREE_WITH_REVISIONS):
  // Genel DEI gauge migrates from the bespoke local <Gauge> to the
  // canonical LiquidFillChart wrapper — the 33rd @mfe/x-charts wrapper
  // (lazy-loaded echarts-liquidfill, fillRatio 0-1 with wave animation).
  // Mapping: value={summary.deiScore / 100} — 0-100 score normalised
  // to the wrapper's 0-1 fillRatio contract (clampFillRatio guards
  // overflow). Backend schema unchanged.
  LiquidFillChart as XLiquidFillChart,
} from '@mfe/x-charts';

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const SERIES_COLORS = [
  'var(--action-primary)',
  'var(--state-success-text)',
  'var(--state-warning-text)',
  'var(--state-error-text)',
  'var(--accent-primary)',
  'var(--state-info-text)',
  'var(--accent-soft)',
  'var(--state-success-border)',
  'var(--state-warning-border)',
  'var(--accent-focus)',
];

// ---------------------------------------------------------------------------
// KPI Card \u2014 thin shim around `@mfe/x-charts/KPICard`
//
// Faz 21.10 wave 2 mobile-first padding (`p-3 sm:p-5`), the wave 7
// truncate + accessible click states, the dark-mode-aware Text
// component, and the auto-generated `aria-label` "{title}: {value},
// trend {direction} {value}" all live in the x-charts component. The
// previous standalone div with hard-coded inline `style` (lines 30-75
// before this PR) bypassed every one of them.
//
// We wrap the x-charts KPICard in a `flex-1 min-w-[140px]` outer div
// so the dashboard's outer flex strip layout (lines ~1132 below) keeps
// the same six-card distribution. Call sites stay unchanged: the
// shim still accepts `{ label, value, trend?: number, trendLabel? }`
// and translates them into the x-charts `KPICardProps` shape.
//
// Trend mapping: a numeric `trend` (-N..+N) becomes a structured
// `KPICardTrend` ({ direction, value: "+N%", positive }) so the
// x-charts rendering picks the same arrow + color semantics as the
// previous inline implementation.
//
// `trendLabel` ("gecen aya gore" by default) used to sit inline
// next to the trend chip; x-charts has no equivalent slot for it,
// so it now flows through `subtitle` (rendered below the value).
// Net UX delta is minimal \u2014 the label still appears for trended
// KPIs, just on a separate line.
// ---------------------------------------------------------------------------
const KPICard: React.FC<{
  label: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
}> = ({ label, value, trend, trendLabel = 'gecen aya gore' }) => {
  const trendObj: KPICardTrend | undefined =
    trend !== undefined
      ? {
          direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat',
          value: `${trend > 0 ? '+' : ''}${trend}%`,
          // Codex iter-1 (thread 019e0330) — `positive: trend >= 0`
          // promoted `trend === 0` (flat) to success-green; the
          // x-charts KPICard reads `trend.positive` first when
          // picking the chip color, so `0%` appeared green even
          // though `direction === 'flat'`. Legacy parity wants flat
          // muted, so we leave `positive` undefined when flat and
          // let the component fall through to `direction === 'up'`
          // (false here), which then routes flat to the
          // `text-secondary` branch. Up=green / down=red parity
          // with the previous inline implementation is preserved.
          positive: trend > 0 ? true : trend < 0 ? false : undefined,
        }
      : undefined;

  return (
    <div className="flex-1 min-w-[140px]">
      <XKPICard
        title={label}
        value={value}
        subtitle={trend !== undefined ? trendLabel : undefined}
        trend={trendObj}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chart Card wrapper — thin shim around `@mfe/x-charts/ChartContainer`
//
// Faz 21.10 wave 1-7 mobile primitives (header padding `px-3 py-2 sm:px-5
// sm:py-3`, title truncate with min-w-0, wave 4 actions slot mobile
// shrink/wrap, wave 7 ChartLegend gap if children include a legend) live
// in the x-charts component. The previous standalone div with hard-coded
// inline `style={{ padding: 20, borderRadius: 12, ... }}` bypassed every
// one of them.
//
// We still need the `span` prop to drive `gridColumn` — the dashboard
// section uses inline grids with explicit column counts, and ChartContainer
// itself doesn't accept `span`. The shim therefore wraps the
// ChartContainer in a span-aware grid item so the call sites
// (`<ChartCard span={2}>...</ChartCard>`) remain unchanged.
// ---------------------------------------------------------------------------
const ChartCard: React.FC<{
  title: string;
  children: React.ReactNode;
  span?: number;
}> = ({ title, children, span = 1 }) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <XChartContainer title={title}>{children}</XChartContainer>
  </div>
);

// ---------------------------------------------------------------------------
// SVG Legend
// ---------------------------------------------------------------------------
function Legend({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {items.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: d.color,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts — x-charts wrappers (replaced SVG implementations)
// ---------------------------------------------------------------------------

function PieChartLocal({
  data,
  size: _size = 180,
}: {
  data: Array<{ label: string; value: number }>;
  size?: number;
}) {
  if (!data.length || data.every((d) => d.value === 0)) return null;
  return (
    <div>
      <XPieChart data={data} donut showLegend size="sm" />
    </div>
  );
}

function VerticalBarChartLocal({ data }: { data: Array<{ label: string; value: number }> }) {
  if (!data.length) return null;
  return <XBarChart data={data} size="sm" showValues />;
}

function HorizontalBarChartLocal({ data }: { data: Array<{ label: string; value: number }> }) {
  if (!data.length) return null;
  return <XBarChart data={data} orientation="horizontal" size="sm" />;
}

function TreemapLocal({ data }: { data: Array<{ label: string; value: number }> }) {
  if (!data.length) return null;
  return <XTreemapChart data={data} size="sm" />;
}

// Gauge widget — Phase 1 migration to `@mfe/x-charts/GaugeChart`.
//
// The previous `GaugeLocal` was a static <div> that printed the value +
// label; it never rendered a dial / progress arc, defeating the
// "gauge" semantic. Wrapping `XGaugeChart` here keeps the existing
// call sites' shape (`<Gauge value=… target=… label=… unit?=… />`)
// intact while gaining:
//   - half-circle dial with progress arc + tick marks
//   - threshold-coloured zones around `target`
//   - decal patterns + theme + density signals (auto)
//   - a11y data table + aria-live + ChartA11yShell mount
//
// `target` is mapped to the warning↔success threshold boundary so the
// dial visually communicates "below target = red/orange, at-target =
// green". `unit` is appended to the formatted value (e.g. "95/100").
function GaugeLocal({
  value,
  label,
  target,
  unit,
  max,
  direction = 'higher-better',
}: {
  value: number;
  label: string;
  target?: number;
  unit?: string;
  /**
   * Optional explicit max. When omitted we derive a sensible ceiling
   * from the `unit` (`/100` → 100) or fall back to `target * 2` so
   * the dial doesn't compress at very small values.
   */
  max?: number;
  /**
   * Semantic direction of the metric.
   *
   * - `'higher-better'` (default): the threshold ramp paints red ≤ 50%
   *   of target, amber ≤ target, green ≤ max. Use for promotion rate,
   *   manager %, DEI score, training completion, etc.
   * - `'lower-better'`: the ramp inverts so low values are green and
   *   high values are red. Use for absenteeism rate, attrition rate,
   *   defect %, complaint count, etc.
   *
   * Cross-AI peer review on PR #412 flagged the missing `direction`
   * semantic — without it, the `Devamsizlik Orani` (absenteeism)
   * gauge painted green at 18% (bad) and red at 1% (excellent).
   */
  direction?: 'higher-better' | 'lower-better';
}) {
  const derivedMax = max ?? (unit && unit.includes('100') ? 100 : Math.max((target ?? 10) * 2, 20));
  const safeTarget = target ?? Math.round(derivedMax * 0.7);
  const halfTarget = Math.round(safeTarget * 0.5);
  const errColor = 'var(--state-error, #ef4444)';
  const warnColor = 'var(--state-warning, #f59e0b)';
  const okColor = 'var(--state-success, #10b981)';
  // `XGaugeChart` requires thresholds in ascending order with each
  // entry's `value` defining the upper bound of its colour band.
  //
  // higher-better:  [0, halfTarget) red  → [halfTarget, target) amber → [target, max] green
  // lower-better:   [0, target)     green → [target, max-band) amber  → [max-band, max] red
  // The mid-band ceiling for the lower-better case is the midpoint
  // between `target` and `derivedMax` so the amber zone has visible
  // width even when target sits close to the dial bottom (e.g.
  // absenteeism target=3, derivedMax=20 → amber zone 3 → 11).
  const lowerMidCeiling = Math.round((safeTarget + derivedMax) / 2);
  const thresholds =
    direction === 'lower-better'
      ? [
          { value: safeTarget, color: okColor },
          { value: lowerMidCeiling, color: warnColor },
          { value: derivedMax, color: errColor },
        ]
      : [
          { value: halfTarget, color: errColor },
          { value: safeTarget, color: warnColor },
          { value: derivedMax, color: okColor },
        ];
  const fmt = (v: number): string => (unit ? `${v}${unit}` : `${v}`);
  return (
    <XGaugeChart
      value={value}
      max={derivedMax}
      title={label}
      size="sm"
      thresholds={thresholds}
      valueFormatter={fmt}
      showAxisLabel={false}
    />
  );
}

// Legacy SVG PieChart (preserved for reference, replaced by PieChartLocal above)
function _LegacyPieChart({
  data,
  size = 180,
}: {
  data: Array<{ label: string; value: number }>;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const innerR = r * 0.55;
  let currentAngle = -Math.PI / 2;

  const colored = data.map((d, i) => ({
    ...d,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  return (
    <div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, display: 'block', margin: '0 auto' }}
      >
        {colored.map((d, i) => {
          const angle = (d.value / total) * 2 * Math.PI;
          const x1 = cx + r * Math.cos(currentAngle);
          const y1 = cy + r * Math.sin(currentAngle);
          currentAngle += angle;
          const x2 = cx + r * Math.cos(currentAngle);
          const y2 = cy + r * Math.sin(currentAngle);
          const large = angle > Math.PI ? 1 : 0;
          return (
            <path
              key={i}
              d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
              fill={d.color}
              stroke="var(--surface-default)"
              strokeWidth="2"
            >
              <title>
                {d.label}: {d.value} ({((d.value / total) * 100).toFixed(1)}%)
              </title>
            </path>
          );
        })}
        {/* Donut hole */}
        <circle cx={cx} cy={cy} r={innerR} fill="var(--surface-default)" />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
          Toplam
        </text>
      </svg>
      <Legend items={colored} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical Bar Chart
// ---------------------------------------------------------------------------
function _LegacyVerticalBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barAreaLeft = 35;
  const barAreaTop = 10;
  const barAreaWidth = 260;
  const barAreaHeight = 150;
  const barWidth = Math.min(32, (barAreaWidth / data.length) * 0.6);
  const gap = (barAreaWidth - barWidth * data.length) / (data.length + 1);
  const svgWidth = barAreaLeft + barAreaWidth + 10;
  const svgHeight = barAreaTop + barAreaHeight + 30;

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = barAreaTop + barAreaHeight * (1 - frac);
        return (
          <g key={i}>
            <line
              x1={barAreaLeft}
              y1={y}
              x2={barAreaLeft + barAreaWidth}
              y2={y}
              stroke="var(--border-subtle)"
              strokeWidth="0.5"
            />
            <text
              x={barAreaLeft - 4}
              y={y + 3}
              textAnchor="end"
              fontSize="8"
              fill="var(--text-secondary)"
            >
              {Math.round(maxVal * frac)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * barAreaHeight;
        const x = barAreaLeft + gap + i * (barWidth + gap);
        const y = barAreaTop + barAreaHeight - barH;
        const color = SERIES_COLORS[i % SERIES_COLORS.length];
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={color} opacity={0.85}>
              <title>
                {d.label}: {d.value}
              </title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="var(--text-primary)"
            >
              {d.value}
            </text>
            <text
              x={x + barWidth / 2}
              y={barAreaTop + barAreaHeight + 12}
              textAnchor="middle"
              fontSize="8"
              fill="var(--text-secondary)"
            >
              {d.label.length > 7 ? d.label.slice(0, 6) + '\u2026' : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal Bar Chart (legacy SVG)
// ---------------------------------------------------------------------------
function _LegacyHorizontalBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barHeight = 24;
  const gap = 6;
  const labelWidth = 90;
  const chartWidth = 220;
  const height = data.length * (barHeight + gap) + 4;

  return (
    <svg
      viewBox={`0 0 ${labelWidth + chartWidth + 50} ${height}`}
      width="100%"
      style={{ display: 'block' }}
    >
      {data.map((d, i) => {
        const y = i * (barHeight + gap);
        const w = (d.value / maxVal) * chartWidth;
        const color = SERIES_COLORS[i % SERIES_COLORS.length];
        return (
          <g key={i}>
            <text
              x={labelWidth - 8}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-secondary)"
            >
              {d.label.length > 14 ? d.label.slice(0, 13) + '\u2026' : d.label}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={w}
              height={barHeight}
              rx={4}
              fill={color}
              opacity={0.85}
            >
              <title>
                {d.label}: {d.value}
              </title>
            </rect>
            <text
              x={labelWidth + w + 6}
              y={y + barHeight / 2 + 4}
              fontSize="10"
              fontWeight="600"
              fill="var(--text-primary)"
            >
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Treemap (legacy SVG)
// ---------------------------------------------------------------------------
function _LegacyTreemap({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const width = 320;
  const height = 200;

  // Simple squarified-ish layout: split into rows
  const rects: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    item: (typeof sorted)[0];
    color: string;
  }> = [];
  let remainingItems = [...sorted];
  let currentY = 0;
  let remainingHeight = height;
  let remainingTotal = total;

  while (remainingItems.length > 0) {
    // Take items for this row: fill until row fraction > 0.3 or all remaining
    let rowTotal = 0;
    const rowItems: typeof sorted = [];
    const targetRowFraction = Math.min(0.5, remainingItems.length <= 2 ? 1 : 0.4);

    for (const item of remainingItems) {
      rowItems.push(item);
      rowTotal += item.value;
      if (rowTotal / remainingTotal >= targetRowFraction && remainingItems.length > rowItems.length)
        break;
    }

    remainingItems = remainingItems.slice(rowItems.length);
    const rowFraction = rowTotal / remainingTotal;
    const rowHeight = Math.max(36, remainingHeight * rowFraction);
    remainingTotal -= rowTotal;
    remainingHeight -= rowHeight;

    let currentX = 0;
    for (let j = 0; j < rowItems.length; j++) {
      const item = rowItems[j];
      const itemFraction = item.value / rowTotal;
      const itemWidth = width * itemFraction;
      rects.push({
        x: currentX,
        y: currentY,
        w: itemWidth,
        h: rowHeight,
        item,
        color: SERIES_COLORS[rects.length % SERIES_COLORS.length],
      });
      currentX += itemWidth;
    }
    currentY += rowHeight;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }}>
      {rects.map((r, i) => (
        <g key={i}>
          <rect
            x={r.x + 1}
            y={r.y + 1}
            width={Math.max(0, r.w - 2)}
            height={Math.max(0, r.h - 2)}
            rx={4}
            fill={r.color}
            opacity={0.85}
          >
            <title>
              {r.item.label}: {r.item.value} ({((r.item.value / total) * 100).toFixed(1)}%)
            </title>
          </rect>
          {r.w > 40 && r.h > 28 && (
            <>
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2 - 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="var(--surface-default)"
              >
                {r.item.label.length > Math.floor(r.w / 7)
                  ? r.item.label.slice(0, Math.floor(r.w / 7) - 1) + '\u2026'
                  : r.item.label}
              </text>
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2 + 10}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(255,255,255,0.85)"
              >
                {r.item.value} ({Math.round((r.item.value / total) * 100)}%)
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Gauge (legacy SVG semi-circle)
// ---------------------------------------------------------------------------
function _LegacyGauge({
  value,
  target,
  label,
  unit = '%',
}: {
  value: number;
  target: number;
  label: string;
  unit?: string;
}) {
  const cx = 80;
  const cy = 72;
  const r = 55;
  const maxAngle = Math.PI;
  const ratio = Math.min(value / 100, 1);
  const valueAngle = ratio * maxAngle;
  const targetRatio = Math.min(target / 100, 1);

  const color =
    value >= target
      ? 'var(--state-success-text)'
      : value >= target * 0.7
        ? 'var(--state-warning-text)'
        : 'var(--state-error-text)';

  // Arc path helper
  const arc = (startAngle: number, endAngle: number) => {
    const x1 = cx + r * Math.cos(Math.PI + startAngle);
    const y1 = cy - r * Math.sin(Math.PI + startAngle);
    const x2 = cx + r * Math.cos(Math.PI + endAngle);
    const y2 = cy - r * Math.sin(Math.PI + endAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}`;
  };

  // Target needle
  const needleAngle = Math.PI + targetRatio * maxAngle;
  const needleX = cx + (r + 6) * Math.cos(needleAngle);
  const needleY = cy - (r + 6) * Math.sin(needleAngle);

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <svg
        viewBox="0 0 160 90"
        width="100%"
        style={{ maxWidth: 160, display: 'block', margin: '0 auto' }}
      >
        {/* Background arc */}
        <path
          d={arc(0, maxAngle)}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Value arc */}
        {valueAngle > 0.01 && (
          <path
            d={arc(0, valueAngle)}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        {/* Target marker */}
        <circle cx={needleX} cy={needleY} r="3" fill="var(--text-primary)" />
        {/* Value text */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {value}
          <tspan fontSize="10" fill="var(--text-secondary)">
            {unit}
          </tspan>
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">
          Hedef: {target}
          {unit}
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked Horizontal Bar — PR-X11 migration.
// ECharts native pattern: multi-series horizontal bar with `stack: 'name'`
// shared key (enabled by PR-X1 BarChart `stacked` prop). Each segment
// becomes its own series so the legend / decal / a11y data table all
// work uniformly.
// ---------------------------------------------------------------------------
function StackedBar({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  // ECharts stacked-bar shape: ONE row whose fields are segments. The
  // segment labels move to `series[i].name`; the row label is just a
  // placeholder (we hide the category axis since there's only one row).
  const stackedRow = data.reduce(
    (acc, d, i) => {
      acc[`seg_${i}`] = d.value;
      return acc;
    },
    { label: 'Distribution' } as Record<string, string | number>,
  );

  const seriesDef = data.map((d, i) => ({
    field: `seg_${i}`,
    name: d.label,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  return (
    <XBarChart
      data={[stackedRow] as unknown as Array<{ label: string; value: number }>}
      series={seriesDef}
      orientation="horizontal"
      stacked
      size="sm"
      showLegend
      showValues
      valueFormatter={(v) => `${Math.round((v / total) * 100)}%`}
    />
  );
}

// ---------------------------------------------------------------------------
// Bullet Chart
// ---------------------------------------------------------------------------
function BulletChart({
  label,
  actual,
  target,
  max,
  unit = '%',
  direction = 'higher-better',
}: {
  label: string;
  actual: number;
  target: number;
  max: number;
  unit?: string;
  /**
   * Semantic direction of the metric — mirrors the same prop on
   * `GaugeLocal` (Phase 2a). Default `'higher-better'` keeps the
   * existing colour ramp (green when actual ≥ target). Set to
   * `'lower-better'` for metrics where smaller is better — voluntary
   * turnover, involuntary turnover, gender pay gap. Without it the
   * 3 lower-better call sites currently paint green at high values
   * (terrible) and red at low values (excellent).
   */
  direction?: 'higher-better' | 'lower-better';
}) {
  // For higher-better: green at/above target, amber within 30% below, red further below.
  // For lower-better: green at/below target, amber within (target + 30% of remaining max),
  // red further above. The lower-better amber upper bound uses
  // `target + (max - target) * 0.3` instead of `target * 1.3` so it
  // stays well-defined when target=0 (e.g. Cinsiyet Maas Farki gauge,
  // where 0% pay gap is ideal). With target=0 max=20 the amber band
  // becomes (0, 6] instead of degenerating to empty.
  const okColor = 'var(--state-success-text)';
  const warnColor = 'var(--state-warning-text)';
  const errColor = 'var(--state-error-text)';
  const lowerWarnUpper = target + (max - target) * 0.3;
  const color =
    direction === 'lower-better'
      ? actual <= target
        ? okColor
        : actual <= lowerWarnUpper
          ? warnColor
          : errColor
      : actual >= target
        ? okColor
        : actual >= target * 0.7
          ? warnColor
          : errColor;

  // PR-X11 migration: replace SVG body with XBarChart + showBackground +
  // LineMarkup at target. Header row stays HTML for the label/value
  // composition — wrapper alone can't reproduce the "label left, value/
  // target right" inline header in a single instance.
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {actual}
          {unit}
          <span
            style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}
          >
            / {target}
            {unit}
          </span>
        </span>
      </div>
      <XBarChart
        data={[{ label: '', value: actual, color }]}
        orientation="horizontal"
        showBackground
        size="sm"
        valueAxisMax={max}
        markups={[
          {
            type: 'line',
            axis: 'x',
            value: target,
            color: 'var(--text-primary)',
            width: 2,
          },
        ]}
        valueFormatter={(v) => `${v}${unit}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartEmpty — honest "no data" placeholder for a live-wired chart whose
// backend query returned zero rows (Codex 019e3c78: empty live data must
// read as "Veri yok", not a [MOCK] label and not a fabricated number).
// ---------------------------------------------------------------------------
function ChartEmpty({ variant = 'empty' }: { variant?: 'empty' | 'loading' | 'missing' }) {
  // Codex 019e3c78: "id /charts response'unda yok" (config/deploy drift) ≠
  // "id var, 0 satır" (gerçek veri yok) ≠ henüz yükleniyor.
  const text =
    variant === 'loading'
      ? 'Yükleniyor…'
      : variant === 'missing'
        ? 'Grafik bu sürümde mevcut değil'
        : 'Veri yok';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shannon diversity index (normalized 0-100)
// ---------------------------------------------------------------------------
function computeDiversityIndex(dist: Array<{ label: string; value: number }>): number {
  const total = dist.reduce((s, d) => s + d.value, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const d of dist) {
    if (d.value > 0) {
      const p = d.value / total;
      entropy -= p * Math.log2(p);
    }
  }
  const maxEntropy = Math.log2(dist.length || 1);
  return maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
const DashboardSection: React.FC<{
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--text-secondary)',
            padding: '2px 8px',
          }}
        >
          {open ? 'Grafikleri Gizle \u25B2' : 'Grafikleri Goster \u25BC'}
        </button>
      </div>
      {open && children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Age Pyramid Chart — PR#3 (Codex thread 019e3f75).
// Renders the canonical `PopulationPyramid` wrapper (the 29th @mfe/x-charts
// wrapper). The previous PR-X11 shim hand-built a pyramid on `BarChart` by
// negating one series (`male: -d.male`) + a `Math.abs` axis formatter;
// `PopulationPyramid` owns that render contract end-to-end — `left` /
// `right` are passed UNSIGNED and the wrapper negates the left series for
// rendering while un-negating tooltip / axis labels / bar labels / a11y
// table internally. The symmetric `[-max, +max]` value domain is also
// wrapper-owned, so the manual `maxVal` / `valueAxisMin` / `valueAxisMax`
// wiring is dropped.
//
// PR#4: no explicit `colors` prop. The wrapper is accent-driven and
// resolves its `effectivePalette` to real hex internally. A `colors`
// prop of raw `var(--…)` strings does NOT resolve on the ECharts canvas
// renderer — canvas `fillStyle` ignores CSS custom properties, so both
// series collapse to one undifferentiated dark fallback (the shim hit
// the same constraint). Letting the wrapper own the palette keeps the
// two genders visually distinct + theme-aware.
// ---------------------------------------------------------------------------
function AgePyramidChart({
  data,
}: {
  data: Array<{ ageGroup: string; male: number; female: number }>;
}) {
  // `ageGroup` → category row; `male` / `female` → UNSIGNED left / right
  // measures (the wrapper negates the left series internally).
  const pyramidData = data.map((d) => ({
    ageBand: d.ageGroup,
    left: d.male,
    right: d.female,
  }));

  return (
    <XPopulationPyramid
      data={pyramidData}
      leftLabel="Erkek"
      rightLabel="Kadin"
      size="md"
      showLegend
    />
  );
}

// ---------------------------------------------------------------------------
// Aliases: map old SVG function names → x-charts wrappers
// ---------------------------------------------------------------------------
const PieChart = PieChartLocal;
const VerticalBarChart = VerticalBarChartLocal;
const HorizontalBarChart = HorizontalBarChartLocal;
const Treemap = TreemapLocal;
const Gauge = GaugeLocal;

// ---------------------------------------------------------------------------
// SalaryTrendChart — x-charts XLineChart wrapper (Phase 1 migration).
// Replaces the previous hand-rolled <svg><polyline> "Maas Farki Trendi" chart
// so the quarterly pay-gap series renders through the same ECharts pipeline
// (theme, decal, a11y, tooltip) as the other dashboards.
// `useMemo` keeps series/labels reference-stable across parent re-renders,
// avoiding the same setOption flood we hit with the 3D wrappers (PR #410).
// ---------------------------------------------------------------------------
function SalaryTrendChart({
  trendData,
}: {
  trendData: Array<{ label: string; value: number }> | null;
}) {
  const { series, labels } = useMemo(() => {
    const trendPoints: Array<{ label: string; gap: number }> = [];
    if (trendData && trendData.length > 0) {
      for (const row of trendData) {
        const maleAvg = (row as Record<string, unknown>).male_avg as number | null;
        const femaleAvg = (row as Record<string, unknown>).female_avg as number | null;
        if (maleAvg && femaleAvg && maleAvg > 0) {
          trendPoints.push({
            label: row.label,
            gap: Math.round(((maleAvg - femaleAvg) / maleAvg) * 1000) / 10,
          });
        }
      }
    }
    // Codex 019e3c78: no hardcoded mock series — empty trendData renders an
    // empty trend (honest "no data") rather than a fabricated gap curve.
    const points = trendPoints.map((p) => p.gap);
    const lbls = trendPoints.map((p) => p.label);
    return {
      series: [
        {
          name: 'Maas Farki %',
          data: points,
          color: 'var(--state-warning-text, #f59e0b)',
        },
      ],
      labels: lbls,
    };
  }, [trendData]);

  const fmt = React.useCallback((v: number) => `%${v}`, []);

  return (
    <XLineChart
      series={series}
      labels={labels}
      size="sm"
      showDots
      showGrid
      valueFormatter={fmt}
      description="Ceyrekler bazinda cinsiyet maas farki yuzdesi"
    />
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 24, marginBottom: 8 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--text-primary)',
          borderBottom: '2px solid var(--border-subtle)',
          paddingBottom: 8,
          margin: 0,
        }}
      >
        {children}
      </h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
const DemographicDashboard: React.FC = () => {
  const summary = useMemo<DemographicSummary>(() => getSummary(), []);
  const diversityIndex = useMemo(
    () => computeDiversityIndex(summary.generationDistribution),
    [summary.generationDistribution],
  );

  // ── Canlı Workcube verisi ──
  const [liveKPIs, setLiveKPIs] = useState<Array<{
    id: string;
    title: string;
    value: number | null;
    formattedValue: string;
    trend?: { direction: string; percentage: number } | null;
  }> | null>(null);
  const [liveCharts, setLiveCharts] = useState<Array<{
    id: string;
    title: string;
    chartType: string;
    data: Array<{ label: string; value: number }>;
  }> | null>(null);
  const [dataSource, setDataSource] = useState<'loading' | 'live' | 'mock'>('loading');

  useEffect(() => {
    let active = true;
    Promise.all([getLiveKPIs(), getLiveCharts()])
      .then(([kpis, charts]) => {
        if (!active) return;
        if (kpis && charts) {
          setLiveKPIs(kpis);
          setLiveCharts(charts);
          setDataSource('live');
        } else {
          setDataSource('mock');
        }
      })
      .catch(() => {
        if (active) setDataSource('mock');
      });
    return () => {
      active = false;
    };
  }, []);

  // Helper: canlı chart verisini al, yoksa mock summary'den düş
  const getChartData = (chartId: string): Array<{ label: string; value: number }> | null => {
    if (liveCharts) {
      const chart = liveCharts.find((c) => c.id === chartId);
      if (chart && chart.data && chart.data.length > 0) return chart.data;
    }
    return null;
  };

  // Helper: chart id canlı /charts response'unda VAR mı (rows boş olsa da).
  // Codex 019e3c78: "id response'ta yok" (config/deploy drift) ile "id var
  // ama 0 satır" (gerçek 'Veri yok') durumlarını ayırmak için.
  const hasLiveChart = (chartId: string): boolean =>
    !!liveCharts && liveCharts.some((c) => c.id === chartId);

  // Helper: canlıya bağlı bir chart kartının gövdesini render eder — veri
  // varsa chart, yoksa loading / config-drift / "Veri yok" empty-state.
  const renderLiveChart = (
    chartId: string,
    render: (data: Array<{ label: string; value: number }>) => React.ReactNode,
  ): React.ReactNode => {
    const data = getChartData(chartId);
    if (data) return render(data);
    if (dataSource === 'loading') return <ChartEmpty variant="loading" />;
    if (!hasLiveChart(chartId)) return <ChartEmpty variant="missing" />;
    return <ChartEmpty variant="empty" />;
  };

  // Helper: chart başlığına [MOCK] etiketi ekle — canlı veri yoksa
  const chartTitle = (title: string, chartId?: string): string => {
    if (chartId && getChartData(chartId)) return title;
    if (!chartId) return `${title} [MOCK]`;
    return `${title} [MOCK]`;
  };

  // Helper: canlı KPI değerini al
  const getKPIValue = (kpiId: string): { value: string; trend?: number } | null => {
    if (liveKPIs) {
      const kpi = liveKPIs.find((k) => k.id === kpiId);
      if (kpi)
        return {
          value: kpi.formattedValue,
          trend: kpi.trend
            ? kpi.trend.direction === 'down'
              ? -kpi.trend.percentage
              : kpi.trend.percentage
            : undefined,
        };
    }
    return null;
  };

  // Trends: canlı veriden veya mock
  const trends = {
    headcount: getKPIValue('headcount')?.trend ?? 2.3,
    genderRatio: getKPIValue('female-ratio')?.trend ?? 1.2,
    avgAge: getKPIValue('avg-age')?.trend ?? -0.4,
    tenure: getKPIValue('avg-tenure')?.trend ?? 0.8,
    turnover: -1.5,
    dei: 3.1,
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Data source indicator */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            background:
              dataSource === 'live'
                ? 'var(--state-success-bg)'
                : dataSource === 'mock'
                  ? 'var(--state-warning-bg)'
                  : 'var(--surface-muted)',
            color:
              dataSource === 'live'
                ? 'var(--state-success-text)'
                : dataSource === 'mock'
                  ? 'var(--state-warning-text)'
                  : 'var(--text-secondary)',
            fontWeight: 600,
          }}
        >
          {dataSource === 'live'
            ? '● Canlı Veri (Workcube SQL)'
            : dataSource === 'mock'
              ? '○ Mock Veri'
              : '◌ Yükleniyor...'}
        </span>
      </div>
      {/* ── KPI Strip ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <KPICard
          label="Toplam Calisan"
          value={getKPIValue('headcount')?.value ?? summary.totalHeadcount}
          trend={trends.headcount}
        />
        <KPICard
          label="Kadin / Erkek"
          value={
            getKPIValue('female-ratio')?.value ??
            `${summary.genderRatio.female}/${summary.genderRatio.male}%`
          }
          trend={trends.genderRatio}
        />
        <KPICard
          label="Ortalama Yas"
          value={getKPIValue('avg-age')?.value ?? summary.avgAge.toFixed(1)}
          trend={trends.avgAge}
        />
        <KPICard
          label="Ort. Kidem"
          value={
            getKPIValue('avg-tenure')?.value
              ? `${getKPIValue('avg-tenure')!.value} yil`
              : `${summary.avgTenure.toFixed(1)} yil`
          }
          trend={trends.tenure}
        />
        <KPICard label="Devir Hizi" value={`${summary.turnoverRate}%`} trend={trends.turnover} />
        <KPICard label="DEI Skoru" value={`${summary.deiScore}/100`} trend={trends.dei} />
      </div>

      <DashboardSection>
        {/* ── ROW 1: Cinsiyet / Yas Grubu / Egitim ────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <ChartCard title={chartTitle('Cinsiyet Dagilimi', 'gender-distribution')}>
            <PieChart data={getChartData('gender-distribution') ?? summary.genderDistribution} />
          </ChartCard>
          <ChartCard title={chartTitle('Yas Grubu Dagilimi', 'age-distribution')}>
            <VerticalBarChart data={getChartData('age-distribution') ?? summary.ageGroups} />
          </ChartCard>
          <ChartCard title={chartTitle('Egitim Seviyesi', 'education-distribution')}>
            <HorizontalBarChart
              data={getChartData('education-distribution') ?? summary.educationLevels}
            />
          </ChartCard>
        </div>

        {/* ── ROW 2: Departman / Kidem / Istihdam ─────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <ChartCard title={chartTitle('Departman Dagilimi', 'dept-headcount')}>
            <Treemap data={getChartData('dept-headcount') ?? summary.departments} />
          </ChartCard>
          <ChartCard title={chartTitle('Kidem Dagilimi', 'tenure-distribution')}>
            <VerticalBarChart
              data={getChartData('tenure-distribution') ?? summary.tenureDistribution}
            />
          </ChartCard>
          <ChartCard title={chartTitle('Istihdam Turu', 'duty-type')}>
            <PieChart data={getChartData('duty-type') ?? summary.employmentTypes} />
          </ChartCard>
        </div>

        {/* ── ROW 3: DEI Gauges / Nesil ───────────────────────── */}
        {/* PR-X14 (Codex 019e26a9 plan-time AGREE): "Lokasyon
            Dagilimi" duplicate card removed from this row. The
            canonical İkamet Şehri visualisation now lives in the
            APQC HC-2 / Organizasyonel row below as <LocationGeoMap />
            (GeoMap + bubble overlay + drill-down drawer). Grid
            collapses from 3 columns to 2 (Codex iter-2 must-fix #1). */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <ChartCard title={chartTitle('DEI Gostergeleri', 'female-manager-ratio')}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              <Gauge
                value={(() => {
                  const fmData = getChartData('female-manager-ratio');
                  if (fmData) {
                    const mgr = fmData.find((d) => d.label === 'Yonetici')?.value ?? 0;
                    const total = fmData.reduce((s, d) => s + d.value, 0);
                    return total > 0 ? Math.round((mgr / total) * 100) : 0;
                  }
                  return summary.femaleManagerRate;
                })()}
                target={50}
                label="Kadin Yonetici %"
              />
              <Gauge
                value={(() => {
                  const disData = getChartData('disability-employment');
                  if (disData) {
                    const disabled = disData.find((d) => d.label === 'Engelli')?.value ?? 0;
                    const total = disData.reduce((s, d) => s + d.value, 0);
                    return total > 0 ? Math.round((disabled / total) * 1000) / 10 : 0;
                  }
                  return Math.round(summary.disabilityRate * 10);
                })()}
                target={30}
                label="Engelli Istihdam"
                unit="/100"
              />
              <Gauge
                value={(() => {
                  const genData = getChartData('generation-distribution');
                  return genData ? computeDiversityIndex(genData) : diversityIndex;
                })()}
                target={70}
                label="Nesil Cesitliligi"
                unit="/100"
              />
              {/* Codex thread 019e4301 Campaign 4 PR#3 AGREE: Genel DEI
                  gauge migrates from local <Gauge> to LiquidFillChart.
                  value={summary.deiScore / 100} normalises the 0-100
                  backend score to the wrapper's fillRatio 0-1 contract;
                  the title carries the label and the value formatter
                  emits the legacy "/100" unit suffix for parity.
                  size="sm" matches the surrounding gauges' height
                  contract (CHART_CANVAS_HEIGHT.sm=200) so the DEI
                  Göstergeleri 2×2 grid keeps a uniform cell height
                  (Codex iter-8 P2 layout-parity fix). */}
              <XLiquidFillChart
                value={summary.deiScore / 100}
                title="Genel DEI"
                valueFormatter={(v) => `${Math.round(v * 100)}/100`}
                size="sm"
              />
            </div>
          </ChartCard>
          <ChartCard title={chartTitle('Nesil Dagilimi', 'generation-distribution')}>
            <StackedBar
              data={getChartData('generation-distribution') ?? summary.generationDistribution}
            />
            <div style={{ marginTop: 12 }}>
              <HorizontalBarChart
                data={getChartData('generation-distribution') ?? summary.generationDistribution}
              />
            </div>
          </ChartCard>
          {/* PR-X14: previous "Lokasyon Dagilimi" PieChart removed —
              canonical İkamet Şehri lives in the HC-2 row below. */}
        </div>

        {/* ── ROW 4: Yönetici / Çalışan Oranları ──────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <ChartCard title={chartTitle('Yonetici / Calisan Oranlari', 'manager-ratio')}>
            <BulletChart
              label="Kadin Yonetici Orani"
              actual={(() => {
                const fmData = getChartData('female-manager-ratio');
                if (fmData) {
                  const mgr = fmData.find((d) => d.label === 'Yonetici')?.value ?? 0;
                  const total = fmData.reduce((s, d) => s + d.value, 0);
                  return total > 0 ? Math.round((mgr / total) * 100) : 0;
                }
                return summary.femaleManagerRate;
              })()}
              target={50}
              max={100}
            />
            <BulletChart
              label="Engelli Istihdam Orani"
              actual={(() => {
                const disData = getChartData('disability-employment');
                if (disData) {
                  const disabled = disData.find((d) => d.label === 'Engelli')?.value ?? 0;
                  const total = disData.reduce((s, d) => s + d.value, 0);
                  return total > 0 ? Math.round((disabled / total) * 1000) / 10 : 0;
                }
                return summary.disabilityRate;
              })()}
              target={3}
              max={10}
            />
            <BulletChart
              label="Yonetici Orani"
              actual={(() => {
                const mrData = getChartData('manager-ratio');
                if (mrData) {
                  const mgr = mrData.find((d) => d.label === 'Yonetici')?.value ?? 0;
                  const total = mrData.reduce((s, d) => s + d.value, 0);
                  return total > 0 ? Math.round((mgr / total) * 1000) / 10 : 0;
                }
                return summary.managerRatio;
              })()}
              target={15}
              max={30}
            />
          </ChartCard>
        </div>

        {/* ── ROW 5: Medeni Durum / Askerlik / Engel Durumu ────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SectionHeader>Temel Demografik (APQC HC-1)</SectionHeader>
          <ChartCard title={chartTitle('Medeni Durum', 'marital-status')}>
            <PieChart data={getChartData('marital-status') ?? summary.maritalStatusDistribution} />
          </ChartCard>
          <ChartCard title={chartTitle('Askerlik Durumu (Erkek)', 'military-status')}>
            <VerticalBarChart
              data={getChartData('military-status') ?? summary.militaryStatusDistribution}
            />
          </ChartCard>
          <ChartCard title={chartTitle('Engel Durumu', 'disability-distribution')}>
            <PieChart
              data={getChartData('disability-distribution') ?? summary.disabilityDistribution}
            />
          </ChartCard>
        </div>

        {/* ── ROW 6: Lokasyon / Pozisyon Seviyesi / Yas Piramidi ─ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SectionHeader>Organizasyonel (APQC HC-2)</SectionHeader>
          {/* PR-X14 (Codex 019e26a9 plan-time iter-3 AGREE):
              Canonical İkamet Şehri visualisation. Replaces the
              prior PieChart (72-slice unreadable). GeoMap + bubble
              overlay + DetailDrawer drill-down. The Row 3 duplicate
              card has also been removed for single-source-of-truth.
              See `LocationGeoMap.tsx` + `geo/` + `utils/location-to-geomap.ts`. */}
          <ChartCard title={chartTitle('Ikamet Sehri', 'location-distribution')}>
            <LocationGeoMap
              data={getChartData('location-distribution') ?? summary.locationDistribution}
              title="İkamet Şehri"
              description="Personelin TR illeri bazında dağılımı (Belirtilmemiş ayrı badge'de)"
            />
          </ChartCard>
          <ChartCard title={chartTitle('Pozisyon Seviyesi', 'position-level')}>
            <VerticalBarChart
              data={getChartData('position-level') ?? summary.positionLevelDistribution}
            />
          </ChartCard>
          <ChartCard title={chartTitle('Yas Piramidi (Erkek / Kadin)', 'age-pyramid-male')}>
            <AgePyramidChart
              data={(() => {
                const maleData = getChartData('age-pyramid-male');
                const femaleData = getChartData('age-pyramid-female');
                if (maleData && femaleData) {
                  // Merge live data into pyramid format
                  const groups = Array.from(
                    new Set([...maleData.map((d) => d.label), ...femaleData.map((d) => d.label)]),
                  ).sort();
                  return groups.map((g) => ({
                    ageGroup: g,
                    male: maleData.find((d) => d.label === g)?.value ?? 0,
                    female: femaleData.find((d) => d.label === g)?.value ?? 0,
                  }));
                }
                return summary.agePyramid;
              })()}
            />
          </ChartCard>
        </div>

        {/* ── ROW 7: Isgucu Dinamikleri ────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SectionHeader>Isgucu Dinamikleri (APQC HC-4)</SectionHeader>
          <ChartCard title={chartTitle('Devamsizlik & Ise Alim', 'new-hires-12m')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Gauge
                value={summary.absenteeismRate}
                target={3}
                label="Devamsizlik Orani"
                direction="lower-better"
              />
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  Yeni Ise Alim (12 ay)
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {(() => {
                    const hireData = getChartData('new-hires-12m');
                    if (hireData && hireData.length > 0) return hireData[0].value;
                    return summary.timeToFillDays;
                  })()}
                </div>
              </div>
            </div>
          </ChartCard>
          <ChartCard title={chartTitle('Ic Transfer & Terfi', 'internal-transfers')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  Ic Transfer (Son 1 Yil)
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {(() => {
                    const trData = getChartData('internal-transfers');
                    if (trData && trData.length > 0) return trData[0].value;
                    return Math.round(summary.internalTransferRate);
                  })()}
                </div>
              </div>
              <Gauge value={summary.promotionRate} target={8} label="Terfi Orani" />
            </div>
          </ChartCard>
          <ChartCard title={chartTitle('Ayrilma Oranlari', 'turnover-reasons')}>
            {(() => {
              const reasonData = getChartData('turnover-reasons');
              if (reasonData && reasonData.length > 0) {
                return <HorizontalBarChart data={reasonData} />;
              }
              return (
                <>
                  <BulletChart
                    label="Gonullu Ayrilma"
                    actual={summary.voluntaryTurnoverRate}
                    target={8}
                    max={20}
                    direction="lower-better"
                  />
                  <BulletChart
                    label="Zorunlu Ayrilma"
                    actual={summary.involuntaryTurnoverRate}
                    target={2}
                    max={10}
                    direction="lower-better"
                  />
                </>
              );
            })()}
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              Kontrol Araligi:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {(() => {
                  const mrData = getChartData('manager-ratio');
                  if (mrData) {
                    const mgr = mrData.find((d) => d.label === 'Yonetici')?.value ?? 0;
                    const total = mrData.reduce((s, d) => s + d.value, 0);
                    return mgr > 0 ? Math.round((total / mgr) * 10) / 10 : 0;
                  }
                  return summary.spanOfControl;
                })()}
              </strong>{' '}
              calisan/yonetici
            </div>
          </ChartCard>
        </div>

        {/* ── ROW 8: Etik & Uyum ──────────────────────────────── */}
        {/* Codex 019e3b64/019e3c78: wired to live Workcube dashboard charts.
            The Veri Gizliliği Uyumu / İhbar Hattı Başvuru / Davranış Kuralları
            Onayı / Anti-Yolsuzluk Belgesi metrics were removed — no Workcube
            source. Empty live data renders an explicit "Veri yok" state. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SectionHeader>Etik & Uyum</SectionHeader>
          <ChartCard title="Etik Egitim Katilimi">
            {renderLiveChart('ethics-training-attendance', (d) => (
              <VerticalBarChart data={d} />
            ))}
          </ChartCard>
          <ChartCard title="Disiplin Islemleri">
            {renderLiveChart('disciplinary-actions', (d) => (
              <VerticalBarChart data={d} />
            ))}
          </ChartCard>
        </div>

        {/* ── ROW 9: Maas Esitligi ──────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SectionHeader>Maas & Esitlik</SectionHeader>
          <ChartCard title="Cinsiyet Maas Karsilastirma">
            {renderLiveChart('salary-by-gender', (d) => (
              <HorizontalBarChart data={d} />
            ))}
          </ChartCard>
          <ChartCard title="Maas Farki">
            {renderLiveChart('salary-by-gender', (salData) => {
              const male = salData.find((d) => d.label === 'Erkek')?.value ?? 0;
              const female =
                salData.find((d) => d.label === 'Kadın' || d.label === 'Kadin')?.value ?? 0;
              const gap = male > 0 ? Math.round(((male - female) / male) * 1000) / 10 : 0;
              return (
                <>
                  <BulletChart
                    label="Cinsiyet Maas Farki"
                    actual={gap}
                    target={0}
                    max={20}
                    direction="lower-better"
                  />
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Hedef: <strong>%0</strong> fark &mdash; mevcut fark{' '}
                    <strong style={{ color: 'var(--state-warning-text)' }}>%{gap}</strong>
                  </div>
                </>
              );
            })}
          </ChartCard>
          <ChartCard title="Maas Farki Trendi">
            {renderLiveChart('salary-gender-trend', (d) => (
              <SalaryTrendChart trendData={d} />
            ))}
          </ChartCard>
        </div>
      </DashboardSection>
    </div>
  );
};

export default DemographicDashboard;
