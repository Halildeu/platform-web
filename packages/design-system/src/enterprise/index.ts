'use client';
/* ------------------------------------------------------------------ */
/*  Enterprise Components — domain-agnostic building blocks             */
/*  for executive dashboards, governance, and business intelligence.    */
/* ------------------------------------------------------------------ */

// Shared types & utilities
export { formatValue, getTrendColor, getTrendIcon, getToneClasses } from './types';
export type {
  NumberFormat,
  FormatOptions,
  TrendDirection,
  TrendInfo,
  EnterpriseTone,
} from './types';

// KPI & Metrics
// ExecutiveKPIStrip moved to ../patterns/executive-kpi-strip/ (Phase 3 adopt).
// Compat shim re-export — `import { ExecutiveKPIStrip } from '@mfe/design-system/enterprise'`
// continues to work. Prefer the canonical pattern import going forward.
export { ExecutiveKPIStrip } from '../patterns/executive-kpi-strip/ExecutiveKPIStrip';

// Workflow & Approvals
// ApprovalWorkflow moved to ../blocks/approval-workflow/ (Phase 4). Compat shim.
export { ApprovalWorkflow } from '../blocks/approval-workflow/ApprovalWorkflow';

// Risk & Governance
// RiskMatrix moved to ../blocks/risk-matrix/ (Phase 4). Compat shim.
export { RiskMatrix } from '../blocks/risk-matrix/RiskMatrix';
// GovernanceBoard moved to ../blocks/governance-board/ (Phase 4). Compat shim.
export { GovernanceBoard } from '../blocks/governance-board/GovernanceBoard';

// Project & Timeline
// GanttTimeline moved to ../blocks/gantt-timeline/ (Phase 2a). Compat shim.
export { GanttTimeline } from '../blocks/gantt-timeline/GanttTimeline';

// Financial & Analytics
// AgingBuckets: removed — niche single-purpose finance widget (Phase 1b triage)
// FunnelChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)
// ComparisonTable moved to ../components/comparison-table/ (Phase 3 adopt). Compat shim.
export { ComparisonTable } from '../components/comparison-table/ComparisonTable';

// HR & Training
// TrainingTracker: removed — domain-specific HR widget, not on generic DS surface (Phase 1b triage)

// Visualization
// BulletChart moved to ../blocks/bullet-chart/ (Phase 2b). Compat shim.
export { BulletChart } from '../blocks/bullet-chart/BulletChart';
// MicroChart moved to ../blocks/micro-chart/ (Phase 2b). Compat shim.
export { MicroChart } from '../blocks/micro-chart/MicroChart';
// TreemapChart, RadarChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)
// SankeyDiagram moved to ../blocks/sankey-diagram/ (Phase 2c). Compat shim.
export { SankeyDiagram } from '../blocks/sankey-diagram/SankeyDiagram';

// Date & Time
// DateRangePicker moved to ../components/date-range-picker/ (Phase 3 adopt). Compat shim.
export { DateRangePicker } from '../components/date-range-picker/DateRangePicker';

// Layout
// ThemeLayout moved to ../patterns/theme-layout/ (Phase 4 — layout pattern). Compat shim.
export { ThemeLayout } from '../patterns/theme-layout/ThemeLayout';

// Process & Flow
// ProcessFlow moved to ../blocks/process-flow/ (Phase 2a). Compat shim.
export { ProcessFlow } from '../blocks/process-flow/ProcessFlow';
export { FlowBuilder } from './FlowBuilder';
export type { FlowBuilderProps, FlowNode, FlowEdge, FlowNodeType } from './FlowBuilder';
// ValueStream moved to ../blocks/value-stream/ (Phase 2c). Compat shim.
export { ValueStream } from '../blocks/value-stream/ValueStream';

// Status & Timeline
// StatusTimeline moved to ../blocks/status-timeline/ (Phase 2a). Compat shim.
export { StatusTimeline } from '../blocks/status-timeline/StatusTimeline';

// Notifications
// NotificationCenter moved to ../blocks/notification-center/ (Phase 2a). Compat shim.
export { NotificationCenter } from '../blocks/notification-center/NotificationCenter';
export type { NotificationCenterLocaleText } from '../blocks/notification-center/NotificationCenter';

// Editing
// InlineEdit moved to ../components/inline-edit/ (Phase 3 adopt). Compat shim.
export { InlineEdit } from '../components/inline-edit/InlineEdit';

// EmptyStateBuilder: removed — simple pattern, blocks/empty-state covers it (Phase 1b triage)

// Filters
// FilterPresets moved to ../blocks/filter-presets/ (Phase 2c). Compat shim.
export { FilterPresets } from '../blocks/filter-presets/FilterPresets';
export type { FilterPresetsLocaleText } from '../blocks/filter-presets/FilterPresets';

// Export
// DataExportDialog moved to ../components/data-export-dialog/ (Phase 3 follow-up adopt). Compat shim.
export { DataExportDialog } from '../components/data-export-dialog/DataExportDialog';
export type { DataExportDialogLocaleText } from '../components/data-export-dialog/DataExportDialog';

// Fine-Kinney Risk Assessment
// FineKinney moved to ./domain/turkey-isg/ (Codex peer review opsiyon c —
// Türkçe ISG regülasyon spesifik domain). Compat shim — eski import surface
// korunuyor; canonical path: `enterprise/domain/turkey-isg/`.
export { FineKinney } from './domain/turkey-isg/FineKinney';
export type { FineKinneyProps, FineKinneyRisk } from './domain/turkey-isg/FineKinney';

// WaterfallChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)

// Pareto Chart
// ParetoChart moved to ../blocks/pareto-chart/ (Phase 2b). Compat shim.
export { ParetoChart } from '../blocks/pareto-chart/ParetoChart';
export type { ParetoChartProps, ParetoItem } from '../blocks/pareto-chart/ParetoChart';

// Heatmap Calendar
// HeatmapCalendar moved to ../blocks/heatmap-calendar/ (Phase 2c). Compat shim.
export { HeatmapCalendar } from '../blocks/heatmap-calendar/HeatmapCalendar';
export type { HeatmapCalendarProps, HeatmapDay } from '../blocks/heatmap-calendar/HeatmapCalendar';

// Organization Chart
// OrgChart moved to ../blocks/org-chart/ (Phase 2c). Compat shim.
export { OrgChart } from '../blocks/org-chart/OrgChart';
export type { OrgChartProps, OrgChartNode } from '../blocks/org-chart/OrgChart';

// GaugeChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)

// Pivot Table
// PivotTable moved to ../blocks/pivot-table/ (Phase 2c). Compat shim.
export { PivotTable } from '../blocks/pivot-table/PivotTable';
export type {
  PivotTableProps,
  PivotValueConfig,
  PivotCellClickEvent,
} from '../blocks/pivot-table/PivotTable';

// Comment Thread
// CommentThread moved to ../blocks/comment-thread/ (Phase 2c). Compat shim.
export { CommentThread } from '../blocks/comment-thread/CommentThread';
export type { CommentThreadProps, Comment } from '../blocks/comment-thread/CommentThread';

// Activity Feed
// ActivityFeed moved to ../blocks/activity-feed/ (Phase 2a). Compat shim.
export { ActivityFeed } from '../blocks/activity-feed/ActivityFeed';
export type { ActivityFeedProps, ActivityItem } from '../blocks/activity-feed/ActivityFeed';

// Box Plot
// BoxPlot moved to ../blocks/box-plot/ (Phase 2b). Compat shim.
export { BoxPlot } from '../blocks/box-plot/BoxPlot';
export type { BoxPlotProps, BoxPlotData } from '../blocks/box-plot/BoxPlot';

// Histogram Chart
// HistogramChart moved to ../blocks/histogram-chart/ (Phase 2b). Compat shim.
export { HistogramChart } from '../blocks/histogram-chart/HistogramChart';
export type { HistogramChartProps, HistogramBin } from '../blocks/histogram-chart/HistogramChart';

// Control Chart
// ControlChart moved to ../blocks/control-chart/ (Phase 2b). Compat shim.
export { ControlChart } from '../blocks/control-chart/ControlChart';
export type { ControlChartProps, ControlChartPoint } from '../blocks/control-chart/ControlChart';

// SWOTMatrix: removed — 4-quadrant grid is a simple pattern (Phase 1b triage)
// DecisionMatrix: removed — overlap with SWOTMatrix, weighted-score grid is simple pattern (Phase 1b triage)

// File Upload
// FileUploadZone moved to ../blocks/file-upload-zone/ (Phase 2c). Compat shim.
export { FileUploadZone } from '../blocks/file-upload-zone/FileUploadZone';
export type { FileUploadZoneProps, UploadedFile } from '../blocks/file-upload-zone/FileUploadZone';

// MetricComparisonCard: removed — overlap with ExecutiveKPIStrip (Phase 1b triage)
