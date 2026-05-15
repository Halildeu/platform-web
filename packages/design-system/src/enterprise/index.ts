'use client';
/* ------------------------------------------------------------------ */
/*  Enterprise Components — DEPRECATED compat surface                   */
/*                                                                      */
/*  Phase 2/3/4 moved these domain-agnostic building blocks to their    */
/*  canonical homes (blocks/, components/, patterns/, utils/). This      */
/*  barrel keeps the legacy `@mfe/design-system/enterprise` import       */
/*  working as a compat shim.                                           */
/*                                                                      */
/*  Every re-export below uses the deprecated-local-alias pattern so     */
/*  the @deprecated JSDoc tag actually propagates to use-sites (a plain  */
/*  `export { X } from` re-export does NOT propagate the tag — verified  */
/*  against TS 5.9.3). Canonical import: `@mfe/design-system`.           */
/*                                                                      */
/*  Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.  */
/* ------------------------------------------------------------------ */

import {
  formatValue as formatValueCanonical,
  getTrendColor as getTrendColorCanonical,
  getTrendIcon as getTrendIconCanonical,
  getToneClasses as getToneClassesCanonical,
} from '../utils/format-helpers';
import type {
  NumberFormat as NumberFormatCanonical,
  FormatOptions as FormatOptionsCanonical,
  TrendDirection as TrendDirectionCanonical,
  TrendInfo as TrendInfoCanonical,
  EnterpriseTone as EnterpriseToneCanonical,
} from '../utils/format-helpers';
import { ExecutiveKPIStrip as ExecutiveKPIStripCanonical } from '../patterns/executive-kpi-strip/ExecutiveKPIStrip';
import { ApprovalWorkflow as ApprovalWorkflowCanonical } from '../blocks/approval-workflow/ApprovalWorkflow';
import { RiskMatrix as RiskMatrixCanonical } from '../blocks/risk-matrix/RiskMatrix';
import { GovernanceBoard as GovernanceBoardCanonical } from '../blocks/governance-board/GovernanceBoard';
import { GanttTimeline as GanttTimelineCanonical } from '../blocks/gantt-timeline/GanttTimeline';
import { ComparisonTable as ComparisonTableCanonical } from '../components/comparison-table/ComparisonTable';
import { BulletChart as BulletChartCanonical } from '../blocks/bullet-chart/BulletChart';
import { MicroChart as MicroChartCanonical } from '../blocks/micro-chart/MicroChart';
import { SankeyDiagram as SankeyDiagramCanonical } from '../blocks/sankey-diagram/SankeyDiagram';
import { DateRangePicker as DateRangePickerCanonical } from '../components/date-range-picker/DateRangePicker';
import { ThemeLayout as ThemeLayoutCanonical } from '../patterns/theme-layout/ThemeLayout';
import { ProcessFlow as ProcessFlowCanonical } from '../blocks/process-flow/ProcessFlow';
import { ValueStream as ValueStreamCanonical } from '../blocks/value-stream/ValueStream';
import { StatusTimeline as StatusTimelineCanonical } from '../blocks/status-timeline/StatusTimeline';
import { NotificationCenter as NotificationCenterCanonical } from '../blocks/notification-center/NotificationCenter';
import type { NotificationCenterLocaleText as NotificationCenterLocaleTextCanonical } from '../blocks/notification-center/NotificationCenter';
import { InlineEdit as InlineEditCanonical } from '../components/inline-edit/InlineEdit';
import { FilterPresets as FilterPresetsCanonical } from '../blocks/filter-presets/FilterPresets';
import type { FilterPresetsLocaleText as FilterPresetsLocaleTextCanonical } from '../blocks/filter-presets/FilterPresets';
import { DataExportDialog as DataExportDialogCanonical } from '../components/data-export-dialog/DataExportDialog';
import type { DataExportDialogLocaleText as DataExportDialogLocaleTextCanonical } from '../components/data-export-dialog/DataExportDialog';
import { ParetoChart as ParetoChartCanonical } from '../blocks/pareto-chart/ParetoChart';
import type {
  ParetoChartProps as ParetoChartPropsCanonical,
  ParetoItem as ParetoItemCanonical,
} from '../blocks/pareto-chart/ParetoChart';
import { HeatmapCalendar as HeatmapCalendarCanonical } from '../blocks/heatmap-calendar/HeatmapCalendar';
import type {
  HeatmapCalendarProps as HeatmapCalendarPropsCanonical,
  HeatmapDay as HeatmapDayCanonical,
} from '../blocks/heatmap-calendar/HeatmapCalendar';
import { OrgChart as OrgChartCanonical } from '../blocks/org-chart/OrgChart';
import type {
  OrgChartProps as OrgChartPropsCanonical,
  OrgChartNode as OrgChartNodeCanonical,
} from '../blocks/org-chart/OrgChart';
import { PivotTable as PivotTableCanonical } from '../blocks/pivot-table/PivotTable';
import type {
  PivotTableProps as PivotTablePropsCanonical,
  PivotValueConfig as PivotValueConfigCanonical,
  PivotCellClickEvent as PivotCellClickEventCanonical,
} from '../blocks/pivot-table/PivotTable';
import { CommentThread as CommentThreadCanonical } from '../blocks/comment-thread/CommentThread';
import type {
  CommentThreadProps as CommentThreadPropsCanonical,
  Comment as CommentCanonical,
} from '../blocks/comment-thread/CommentThread';
import { ActivityFeed as ActivityFeedCanonical } from '../blocks/activity-feed/ActivityFeed';
import type {
  ActivityFeedProps as ActivityFeedPropsCanonical,
  ActivityItem as ActivityItemCanonical,
} from '../blocks/activity-feed/ActivityFeed';
import { BoxPlot as BoxPlotCanonical } from '../blocks/box-plot/BoxPlot';
import type {
  BoxPlotProps as BoxPlotPropsCanonical,
  BoxPlotData as BoxPlotDataCanonical,
} from '../blocks/box-plot/BoxPlot';
import { HistogramChart as HistogramChartCanonical } from '../blocks/histogram-chart/HistogramChart';
import type {
  HistogramChartProps as HistogramChartPropsCanonical,
  HistogramBin as HistogramBinCanonical,
} from '../blocks/histogram-chart/HistogramChart';
import { ControlChart as ControlChartCanonical } from '../blocks/control-chart/ControlChart';
import type {
  ControlChartProps as ControlChartPropsCanonical,
  ControlChartPoint as ControlChartPointCanonical,
} from '../blocks/control-chart/ControlChart';
import { FileUploadZone as FileUploadZoneCanonical } from '../blocks/file-upload-zone/FileUploadZone';
import type {
  FileUploadZoneProps as FileUploadZonePropsCanonical,
  UploadedFile as UploadedFileCanonical,
} from '../blocks/file-upload-zone/FileUploadZone';

/* ── Shared types & utilities — moved to ../utils/format-helpers (Phase 3) ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { formatValue } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const formatValue = formatValueCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { getTrendColor } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const getTrendColor = getTrendColorCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { getTrendIcon } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const getTrendIcon = getTrendIconCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { getToneClasses } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const getToneClasses = getToneClassesCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { NumberFormat } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type NumberFormat = NumberFormatCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { FormatOptions } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type FormatOptions = FormatOptionsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { TrendDirection } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type TrendDirection = TrendDirectionCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { TrendInfo } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type TrendInfo = TrendInfoCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { EnterpriseTone } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type EnterpriseTone = EnterpriseToneCanonical;

/* ── KPI & Metrics ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ExecutiveKPIStrip } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ExecutiveKPIStrip = ExecutiveKPIStripCanonical;

/* ── Workflow & Approvals ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ApprovalWorkflow } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ApprovalWorkflow = ApprovalWorkflowCanonical;

/* ── Risk & Governance ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { RiskMatrix } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const RiskMatrix = RiskMatrixCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { GovernanceBoard } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const GovernanceBoard = GovernanceBoardCanonical;

/* ── Project & Timeline ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { GanttTimeline } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const GanttTimeline = GanttTimelineCanonical;

/* ── Financial & Analytics ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ComparisonTable } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ComparisonTable = ComparisonTableCanonical;

/* ── Visualization ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { BulletChart } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const BulletChart = BulletChartCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { MicroChart } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const MicroChart = MicroChartCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { SankeyDiagram } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const SankeyDiagram = SankeyDiagramCanonical;

/* ── Date & Time ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { DateRangePicker } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const DateRangePicker = DateRangePickerCanonical;

/* ── Layout ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ThemeLayout } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ThemeLayout = ThemeLayoutCanonical;

/* ── Process & Flow ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ProcessFlow } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ProcessFlow = ProcessFlowCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ValueStream } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ValueStream = ValueStreamCanonical;

/* ── Status & Timeline ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { StatusTimeline } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const StatusTimeline = StatusTimelineCanonical;

/* ── Notifications ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { NotificationCenter } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const NotificationCenter = NotificationCenterCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { NotificationCenterLocaleText } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type NotificationCenterLocaleText = NotificationCenterLocaleTextCanonical;

/* ── Editing ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { InlineEdit } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const InlineEdit = InlineEditCanonical;

/* ── Filters ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { FilterPresets } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const FilterPresets = FilterPresetsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { FilterPresetsLocaleText } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type FilterPresetsLocaleText = FilterPresetsLocaleTextCanonical;

/* ── Export ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { DataExportDialog } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const DataExportDialog = DataExportDialogCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { DataExportDialogLocaleText } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type DataExportDialogLocaleText = DataExportDialogLocaleTextCanonical;

/* ── Pareto Chart ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ParetoChart } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ParetoChart = ParetoChartCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { ParetoChartProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type ParetoChartProps = ParetoChartPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { ParetoItem } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type ParetoItem = ParetoItemCanonical;

/* ── Heatmap Calendar ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { HeatmapCalendar } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const HeatmapCalendar = HeatmapCalendarCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { HeatmapCalendarProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type HeatmapCalendarProps = HeatmapCalendarPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { HeatmapDay } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type HeatmapDay = HeatmapDayCanonical;

/* ── Organization Chart ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { OrgChart } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const OrgChart = OrgChartCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { OrgChartProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type OrgChartProps = OrgChartPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { OrgChartNode } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type OrgChartNode = OrgChartNodeCanonical;

/* ── Pivot Table ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { PivotTable } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const PivotTable = PivotTableCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { PivotTableProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type PivotTableProps = PivotTablePropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { PivotValueConfig } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type PivotValueConfig = PivotValueConfigCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { PivotCellClickEvent } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type PivotCellClickEvent = PivotCellClickEventCanonical;

/* ── Comment Thread ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { CommentThread } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const CommentThread = CommentThreadCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { CommentThreadProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type CommentThreadProps = CommentThreadPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { Comment } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type Comment = CommentCanonical;

/* ── Activity Feed ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ActivityFeed } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ActivityFeed = ActivityFeedCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { ActivityFeedProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type ActivityFeedProps = ActivityFeedPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { ActivityItem } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type ActivityItem = ActivityItemCanonical;

/* ── Box Plot ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { BoxPlot } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const BoxPlot = BoxPlotCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { BoxPlotProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type BoxPlotProps = BoxPlotPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { BoxPlotData } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type BoxPlotData = BoxPlotDataCanonical;

/* ── Histogram Chart ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { HistogramChart } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const HistogramChart = HistogramChartCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { HistogramChartProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type HistogramChartProps = HistogramChartPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { HistogramBin } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type HistogramBin = HistogramBinCanonical;

/* ── Control Chart ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { ControlChart } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const ControlChart = ControlChartCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { ControlChartProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type ControlChartProps = ControlChartPropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { ControlChartPoint } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type ControlChartPoint = ControlChartPointCanonical;

/* ── File Upload ── */
/**
 * @deprecated Taşındı. Yeni import:
 * `import { FileUploadZone } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export const FileUploadZone = FileUploadZoneCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { FileUploadZoneProps } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type FileUploadZoneProps = FileUploadZonePropsCanonical;
/**
 * @deprecated Taşındı. Yeni import:
 * `import type { UploadedFile } from '@mfe/design-system';`
 * Compat yüzeyi Phase 5'te, 2026-08-15'ten önce olmayacak şekilde kaldırılacak.
 */
export type UploadedFile = UploadedFileCanonical;

/* ── Flow Builder — stays in enterprise/ as a domain showcase ── */
export { FlowBuilder } from './FlowBuilder';
export type { FlowBuilderProps, FlowNode, FlowEdge, FlowNodeType } from './FlowBuilder';

/* ── Fine-Kinney — Türkiye ISG regülasyon-spesifik domain component ── */
export { FineKinney } from './domain/turkey-isg/FineKinney';
export type { FineKinneyProps, FineKinneyRisk } from './domain/turkey-isg/FineKinney';

/* ── Removed in Phase 1 triage (deleted — no compat shim) ──
 *  AgingBuckets         — niche single-purpose finance widget (Phase 1b)
 *  FunnelChart          — canonical surface is `@mfe/x-charts` (Phase 1a)
 *  TrainingTracker      — domain-specific HR widget, off generic DS surface (Phase 1b)
 *  TreemapChart         — canonical surface is `@mfe/x-charts` (Phase 1a)
 *  RadarChart           — canonical surface is `@mfe/x-charts` (Phase 1a)
 *  WaterfallChart       — canonical surface is `@mfe/x-charts` (Phase 1a)
 *  GaugeChart           — canonical surface is `@mfe/x-charts` (Phase 1a)
 *  EmptyStateBuilder    — simple pattern, blocks/empty-state covers it (Phase 1b)
 *  SWOTMatrix           — 4-quadrant grid is a simple pattern (Phase 1b)
 *  DecisionMatrix       — overlap with SWOTMatrix, weighted-score grid simple (Phase 1b)
 *  MetricComparisonCard — overlap with ExecutiveKPIStrip (Phase 1b)
 */
