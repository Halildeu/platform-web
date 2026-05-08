/**
 * CrossFilterChart — Wrapper that auto-wires any chart to the cross-filter bus
 *
 * Instead of modifying each chart's internals, this wrapper:
 * 1. Intercepts onDataPointClick → emits cross-filter
 * 2. Receives incoming filters → renders filter indicator
 * 3. Provides clear button for own filters
 *
 * Usage:
 * ```tsx
 * <CrossFilterProvider>
 *   <CrossFilterChart chartId="revenue" emitFields={["category"]}>
 *     <BarChart data={data} />
 *   </CrossFilterChart>
 * </CrossFilterProvider>
 * ```
 */
import React, { cloneElement, isValidElement, useCallback } from 'react';
import { useChartCrossFilter } from './useChartCrossFilter';
import type { UseChartCrossFilterOptions } from './useChartCrossFilter';

export interface CrossFilterChartProps extends UseChartCrossFilterOptions {
  children: React.ReactElement;
  /** Show filter indicator badge. @default true */
  showIndicator?: boolean;
  /** Additional class name for wrapper. */
  className?: string;
}

export function CrossFilterChart({
  chartId,
  emitFields = [],
  enabled = true,
  showIndicator = true,
  className,
  children,
}: CrossFilterChartProps) {
  // `activeFilters` is part of the hook return shape but never read
  // inside this component; dropped from the destructure (Codex
  // iter-1 thread 019e08a2 — preferred deletion over `_activeFilters`
  // rename since the hook return shape isn't affected either way).
  const { onChartClick, isFiltered, filterCount, clearOwnFilter } = useChartCrossFilter({
    chartId,
    emitFields,
    enabled,
  });

  // Signature matches the cloneElement target prop type
  // (`onDataPointClick?: (e: unknown) => void`). Chart adapters that
  // pair with this wrapper emit `{ datum }` payloads (Bar/Line/Pie
  // honour the `ChartClickEvent` contract); raw ECharts/Funnel/Radar/
  // Waterfall events do NOT, and routing those into the cross-filter
  // bus would silently emit empty filters because `datum[field]` is
  // `undefined`. Codex iter-1 review (thread 019e08a2) flagged a
  // permissive `?? {}` fallback as too quiet for an auto-wiring
  // wrapper, so we type-guard explicitly: only forward events that
  // carry a `datum` object, drop the rest.
  const handleClick = useCallback(
    (event: unknown) => {
      const datum = (event as { datum?: unknown } | null)?.datum;
      if (datum == null || typeof datum !== 'object') {
        return;
      }
      onChartClick(datum as Record<string, unknown>);
    },
    [onChartClick],
  );

  // Clone child chart and inject onDataPointClick
  //
  // The fall-through `(children.props as Record<string, unknown>).onDataPointClick`
  // is `unknown`, which TS no longer accepts as `((e: unknown) => void) | undefined`
  // since the cloneElement overload tightening. We narrow to the matching
  // function shape (or `undefined`) at the call site so the overload resolves.
  // Behaviour is unchanged: when `enabled` is false we forward whatever the
  // child already had on its `onDataPointClick` prop.
  const passthroughOnDataPointClick = isValidElement(children)
    ? ((children.props as Record<string, unknown>).onDataPointClick as
        | ((e: unknown) => void)
        | undefined)
    : undefined;
  const chart = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ onDataPointClick?: (e: unknown) => void }>, {
        onDataPointClick: enabled ? handleClick : passthroughOnDataPointClick,
      })
    : children;

  return (
    <div className={className} style={{ position: 'relative' }}>
      {chart}
      {showIndicator && isFiltered && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            background: 'var(--surface-raised, #f3f4f6)',
            color: 'var(--text-secondary, #6b7280)',
            border: '1px solid var(--border-subtle, #e5e7eb)',
          }}
          data-testid="cross-filter-indicator"
        >
          <span>{filterCount} filtre aktif</span>
          <button
            onClick={clearOwnFilter}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 13,
              lineHeight: 1,
              color: 'var(--text-secondary, #6b7280)',
            }}
            aria-label="Filtreleri temizle"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

CrossFilterChart.displayName = 'CrossFilterChart';

export default CrossFilterChart;
