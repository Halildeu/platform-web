/**
 * Blocks Public Surface Guard — Phase 4.6
 *
 * Phase 2 & 4 moved 22 domain-agnostic building blocks from `enterprise/` into
 * `blocks/`. Phase 4.6 wired `blocks/` into the canonical public surface:
 *   - root barrel:   `export * from "./blocks"`  (src/index.ts)
 *   - deep import:   `@mfe/design-system/blocks`  (package.json exports)
 *
 * The component-docs catalog documents every block with
 * `importStatement: "import { X } from '@mfe/design-system'"` — so the root
 * barrel MUST re-export each block. This guard fails if that wiring regresses
 * (e.g. a new block added to blocks/index.ts but the root re-export removed,
 * or a block dropped from the blocks barrel).
 *
 * Type-surface coverage: the `import type` block below is checked by
 * `tsc --noEmit` — if any Props type stops being reachable from the root
 * barrel, the typecheck fails.
 */
import { describe, it, expect } from 'vitest';
import * as root from '../index';
import * as blocks from '../blocks';

// ── Type smoke — every block's primary Props type must reach the root barrel.
//    A missing type breaks `tsc --noEmit` (test files are in tsconfig include).
import type {
  ActivityFeedProps,
  NotificationCenterProps,
  StatusTimelineProps,
  GanttTimelineProps,
  ProcessFlowProps,
  BulletChartProps,
  MicroChartProps,
  BoxPlotProps,
  HistogramChartProps,
  ControlChartProps,
  ParetoChartProps,
  SankeyDiagramProps,
  HeatmapCalendarProps,
  OrgChartProps,
  PivotTableProps,
  CommentThreadProps,
  FileUploadZoneProps,
  FilterPresetsProps,
  ValueStreamProps,
  RiskMatrixProps,
  GovernanceBoardProps,
  ApprovalWorkflowProps,
} from '../index';

// Reference every imported type so `noUnusedLocals` / verbatim checks keep
// them live — a tuple type that only compiles if all 22 are exported.
type _BlockPropsSurface = [
  ActivityFeedProps,
  NotificationCenterProps,
  StatusTimelineProps,
  GanttTimelineProps,
  ProcessFlowProps,
  BulletChartProps,
  MicroChartProps,
  BoxPlotProps,
  HistogramChartProps,
  ControlChartProps,
  ParetoChartProps,
  SankeyDiagramProps,
  HeatmapCalendarProps,
  OrgChartProps,
  PivotTableProps,
  CommentThreadProps,
  FileUploadZoneProps,
  FilterPresetsProps,
  ValueStreamProps,
  RiskMatrixProps,
  GovernanceBoardProps,
  ApprovalWorkflowProps,
];

// The declaration alone forces tsc to resolve _BlockPropsSurface — and thus
// every imported block Props type. `_`-prefix exempts it from no-unused-vars.
const _typeSurfaceCheck = (_: _BlockPropsSurface): void => void 0;

/** The 22 components moved into blocks/ across Phase 2 & 4. */
const MOVED_BLOCK_COMPONENTS = [
  // Phase 2a
  'ActivityFeed',
  'NotificationCenter',
  'StatusTimeline',
  'GanttTimeline',
  'ProcessFlow',
  // Phase 2b
  'BulletChart',
  'MicroChart',
  'BoxPlot',
  'HistogramChart',
  'ControlChart',
  'ParetoChart',
  // Phase 2c
  'SankeyDiagram',
  'HeatmapCalendar',
  'OrgChart',
  'PivotTable',
  'CommentThread',
  'FileUploadZone',
  'FilterPresets',
  'ValueStream',
  // Phase 4
  'RiskMatrix',
  'GovernanceBoard',
  'ApprovalWorkflow',
] as const;

describe('blocks public surface (Phase 4.6 wiring)', () => {
  it('root barrel re-exports every runtime value from the blocks barrel', () => {
    const rootRecord = root as Record<string, unknown>;
    const blocksRecord = blocks as Record<string, unknown>;
    const missing: string[] = [];
    const mismatched: string[] = [];

    for (const key of Object.keys(blocksRecord)) {
      if (!(key in rootRecord)) {
        missing.push(key);
      } else if (rootRecord[key] !== blocksRecord[key]) {
        mismatched.push(key);
      }
    }

    expect(missing, `root barrel is missing blocks exports: ${missing.join(', ')}`).toEqual([]);
    expect(
      mismatched,
      `root barrel re-exports a different reference for: ${mismatched.join(', ')}`,
    ).toEqual([]);
  });

  it('all 22 moved block components are callable React components on the root barrel', () => {
    const rootRecord = root as Record<string, unknown>;
    for (const name of MOVED_BLOCK_COMPONENTS) {
      expect(typeof rootRecord[name], `${name} must be exported from @mfe/design-system`).toBe(
        'function',
      );
    }
  });

  it('all 22 moved block components are also reachable via the blocks deep import', () => {
    const blocksRecord = blocks as Record<string, unknown>;
    for (const name of MOVED_BLOCK_COMPONENTS) {
      expect(typeof blocksRecord[name], `${name} must be exported from blocks/`).toBe('function');
    }
  });

  it('format-helper utilities are exported from the root barrel', () => {
    const rootRecord = root as Record<string, unknown>;
    for (const name of ['formatValue', 'getTrendColor', 'getTrendIcon', 'getToneClasses']) {
      expect(typeof rootRecord[name], `${name} must be exported from @mfe/design-system`).toBe(
        'function',
      );
    }
  });
});
