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
}

export const ChartA11yShell: React.FC<ChartA11yShellProps> = ({
  a11y,
  className,
  height,
  testId,
  setRefs,
  children,
  ...rest
}) => {
  const tablePayload = a11y.renderHiddenDataTable();
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

      <div
        id={a11y.liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={VISUALLY_HIDDEN_STYLE}
      >
        {a11y.liveMessage}
      </div>

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
