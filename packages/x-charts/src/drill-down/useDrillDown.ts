/**
 * useDrillDown — Drill-down state machine hook
 *
 * Consumes ChartSpec drill_down levels. On chart click, pushes to store.
 * Computes current level, breadcrumbs, and chart_type overrides.
 *
 * @see feature_execution_contract (P2 DoD #5, #6)
 */
import { useCallback, useMemo } from 'react';
import { useCrossFilter } from '../cross-filter/useCrossFilterStore';
import type { DrillLevel } from '../cross-filter/types';

export interface DrillDownLevelSpec {
  /** Data field for this drill level. */
  field: string;
  /** Human-readable label (e.g., "Region", "City"). */
  label?: string;
  /** Chart type override at this level. */
  chartType?: string;
}

export interface UseDrillDownOptions {
  /** Drill-down level definitions from ChartSpec. */
  levels: DrillDownLevelSpec[];
  /** Root label for breadcrumb. @default "All" */
  rootLabel?: string;
}

export interface BreadcrumbItem {
  /** Display label. */
  label: string;
  /** Index in drillPath (-1 for root). */
  index: number;
  /** Whether this is the current (last) item. */
  isCurrent: boolean;
}

export interface UseDrillDownReturn {
  /** Current drill depth (0 = root). */
  currentDepth: number;
  /** Current drill level spec (undefined at root). */
  currentLevel: DrillDownLevelSpec | undefined;
  /** Chart type override for current level (undefined = use default). */
  chartTypeOverride: string | undefined;
  /** Whether we can drill deeper. */
  canDrillDeeper: boolean;
  /** Breadcrumb items for navigation. */
  breadcrumbs: BreadcrumbItem[];
  /** Drill into a value at the next level. */
  drillDown: (value: unknown, label?: string) => void;
  /** Go up one level. */
  drillUp: () => void;
  /** Return to root. */
  drillToRoot: () => void;
  /** Navigate to a specific breadcrumb. */
  drillTo: (index: number) => void;
  /** Current drill path from store. */
  drillPath: DrillLevel[];
  /**
   * Undo the most recent change (filter set/remove/clear OR drill action).
   * Mirrors the cross-filter store's `undo()`. Faz 21.8 PR-X2: previously
   * present in the store but not exposed here.
   */
  undo: () => void;
  /**
   * Re-apply the most recently undone change. Restores both filter and
   * drill state from the history future stack.
   */
  redo: () => void;
  /** Whether `undo()` will have any effect (past stack non-empty). */
  canUndo: boolean;
  /** Whether `redo()` will have any effect (future stack non-empty). */
  canRedo: boolean;
}

export function useDrillDown(options: UseDrillDownOptions): UseDrillDownReturn {
  const { levels, rootLabel = 'All' } = options;

  const drillPath = useCrossFilter((s) => s.drillPath);
  const storeDrillDown = useCrossFilter((s) => s.drillDown);
  const storeDrillUp = useCrossFilter((s) => s.drillUp);
  const storeDrillToRoot = useCrossFilter((s) => s.drillToRoot);
  const storeDrillTo = useCrossFilter((s) => s.drillTo);
  // Faz 21.8 PR-X2: surface the existing cross-filter store undo/redo
  // through the drill-down hook so consumers can implement Back/Forward UX
  // without subscribing to the whole store. `canUndo`/`canRedo` track the
  // store's `past`/`future` stack lengths.
  const storeUndo = useCrossFilter((s) => s.undo);
  const storeRedo = useCrossFilter((s) => s.redo);
  const canUndo = useCrossFilter((s) => s.past.length > 0);
  const canRedo = useCrossFilter((s) => s.future.length > 0);

  const currentDepth = drillPath.length;
  const currentLevel = currentDepth > 0 ? levels[currentDepth - 1] : undefined;
  const nextLevel = levels[currentDepth];
  const canDrillDeeper = currentDepth < levels.length;
  const chartTypeOverride = currentLevel?.chartType;

  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [
      { label: rootLabel, index: -1, isCurrent: currentDepth === 0 },
    ];
    for (let i = 0; i < drillPath.length; i++) {
      items.push({
        label: drillPath[i].label,
        index: i,
        isCurrent: i === drillPath.length - 1,
      });
    }
    return items;
  }, [drillPath, currentDepth, rootLabel]);

  const drillDown = useCallback(
    (value: unknown, label?: string) => {
      if (!nextLevel) return;
      storeDrillDown({
        field: nextLevel.field,
        value,
        label: label ?? String(value),
        chartType: nextLevel.chartType,
      });
    },
    [nextLevel, storeDrillDown],
  );

  const drillUp = useCallback(() => storeDrillUp(), [storeDrillUp]);
  const drillToRoot = useCallback(() => storeDrillToRoot(), [storeDrillToRoot]);
  const drillTo = useCallback(
    (index: number) => {
      if (index < 0) storeDrillToRoot();
      else storeDrillTo(index);
    },
    [storeDrillTo, storeDrillToRoot],
  );

  const undo = useCallback(() => storeUndo(), [storeUndo]);
  const redo = useCallback(() => storeRedo(), [storeRedo]);

  return {
    currentDepth,
    currentLevel,
    chartTypeOverride,
    canDrillDeeper,
    breadcrumbs,
    drillDown,
    drillUp,
    drillToRoot,
    drillTo,
    drillPath,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
