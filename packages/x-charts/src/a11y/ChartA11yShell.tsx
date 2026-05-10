/**
 * ChartA11yShell — internal helper component that wraps a chart's
 * canvas-bearing `<div>` with the visually-hidden data table, the
 * aria-live region, and the `useChartA11y` containerProps.
 *
 * Codex iter-7 hibrit pattern PR-B2: every x-charts wrapper composes
 * `useChartA11y` (default-on a11y) and passes the result into this
 * shell. The shell is the SINGLE source of the markup; chart wrappers
 * stay focused on their data adaptation + ECharts option building.
 *
 * Usage:
 *   ```tsx
 *   const a11y = useChartA11y({ chartType: 'bar', data, ... });
 *   return (
 *     <ChartA11yShell
 *       a11y={a11y}
 *       className={className}
 *       height={height}
 *       testId="bar-chart"
 *       setRefs={setRefs}
 *     />
 *   );
 *   ```
 */
import React from 'react';
import { cn } from '../utils/cn';
import type { UseChartA11yResult } from './useChartA11y';
import { ChartAriaLive, type AnomalyAnnouncementFormatter } from './ChartAriaLive';
import type { AnomalySummary } from '../annotations/computeAnomalyOverlay';
import { useChartsLocale } from '../i18n/locale-store';

const VISUALLY_HIDDEN_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export interface ChartA11yShellProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children'
> {
  /** Result of useChartA11y(...) — drives all a11y plumbing. */
  a11y: UseChartA11yResult;
  /** Height of the chart canvas div. */
  height: number | string;
  /** data-testid for the chart canvas div (kept stable for downstream tests). */
  testId: string;
  /** ref callback that the chart wrapper passes (echarts container + forwarded ref). */
  setRefs: (node: HTMLDivElement | null) => void;
  /**
   * Extra children rendered inside the chart container (e.g. PieChart's
   * donut innerLabel overlay). Default: empty.
   */
  children?: React.ReactNode;
  /**
   * Faz 21.11 PR-A2b-a11y — anomaly summary list. When supplied,
   * the shell forwards it to `ChartAriaLive` which fires a
   * polite, debounced SR announcement summarising the outliers
   * ("3 outliers detected, ..."). Codex iter-1 §C: ChartA11yShell
   * is the single live-region owner; chart wrappers shouldn't
   * mount a second `ChartAriaLive`.
   */
  anomalySummary?: AnomalySummary[];
  /**
   * Optional override of the anomaly announcement template.
   * Forwarded as-is to `ChartAriaLive.formatAnomalyAnnouncement`.
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

export const ChartA11yShell: React.FC<ChartA11yShellProps> = ({
  a11y,
  className,
  height,
  testId,
  setRefs,
  children,
  anomalySummary,
  formatAnomalyAnnouncement,
  ...rest
}) => {
  const tablePayload = a11y.renderHiddenDataTable();
  const locale = useChartsLocale();
  const hasAnomalies = Array.isArray(anomalySummary) && anomalySummary.length > 0;
  return (
    <div className={cn('relative w-full', className)} {...rest}>
      <table id={tablePayload.id} style={VISUALLY_HIDDEN_STYLE}>
        <caption>{tablePayload.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{tablePayload.headers[0]}</th>
            <th scope="col">{tablePayload.headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {tablePayload.rows.map((row, idx) => (
            <tr key={idx}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Faz 21.11 PR-A2b-a11y — single live-region owner. The
          shell mounts `ChartAriaLive` ONLY when an anomaly stream
          is supplied (otherwise the inline live region below stays
          the only region — preserves byte-identical SR behaviour
          for charts that don't opt into anomaly announcements).
          When `anomalySummary` IS supplied, the shell defers the
          base `liveMessage` to `ChartAriaLive` too so we don't
          double-stamp the DOM with two `<div role="status">`
          regions for the same chart. */}
      {hasAnomalies ? (
        <ChartAriaLive
          message={a11y.liveMessage}
          anomalies={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
          locale={locale}
        />
      ) : (
        <div
          id={a11y.liveRegionId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={VISUALLY_HIDDEN_STYLE}
        >
          {a11y.liveMessage}
        </div>
      )}

      <div
        ref={setRefs}
        style={{ height, width: '100%', position: 'relative' }}
        data-testid={testId}
        {...a11y.containerProps}
      >
        {children}
      </div>
    </div>
  );
};
