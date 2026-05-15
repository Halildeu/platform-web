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
export { ApprovalWorkflow } from './ApprovalWorkflow';

// Risk & Governance
export { RiskMatrix } from './RiskMatrix';
export { GovernanceBoard } from './GovernanceBoard';

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
export { BulletChart } from './BulletChart';
export { MicroChart } from './MicroChart';
// TreemapChart, RadarChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)
export { SankeyDiagram } from './SankeyDiagram';

// Date & Time
// DateRangePicker moved to ../components/date-range-picker/ (Phase 3 adopt). Compat shim.
export { DateRangePicker } from '../components/date-range-picker/DateRangePicker';

// Layout
export { ThemeLayout } from './ThemeLayout';

// Process & Flow
// ProcessFlow moved to ../blocks/process-flow/ (Phase 2a). Compat shim.
export { ProcessFlow } from '../blocks/process-flow/ProcessFlow';
export { FlowBuilder } from './FlowBuilder';
export type { FlowBuilderProps, FlowNode, FlowEdge, FlowNodeType } from './FlowBuilder';
export { ValueStream } from './ValueStream';

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
export { FilterPresets } from './FilterPresets';
export type { FilterPresetsLocaleText } from './FilterPresets';

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
export { ParetoChart } from './ParetoChart';
export type { ParetoChartProps, ParetoItem } from './ParetoChart';

// Heatmap Calendar
export { HeatmapCalendar } from './HeatmapCalendar';
export type { HeatmapCalendarProps, HeatmapDay } from './HeatmapCalendar';

// Organization Chart
export { OrgChart } from './OrgChart';
export type { OrgChartProps, OrgChartNode } from './OrgChart';

// GaugeChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)

// Pivot Table
export { PivotTable } from './PivotTable';
export type { PivotTableProps, PivotValueConfig, PivotCellClickEvent } from './PivotTable';

// Comment Thread
export { CommentThread } from './CommentThread';
export type { CommentThreadProps, Comment } from './CommentThread';

// Activity Feed
// ActivityFeed moved to ../blocks/activity-feed/ (Phase 2a). Compat shim.
export { ActivityFeed } from '../blocks/activity-feed/ActivityFeed';
export type { ActivityFeedProps, ActivityItem } from '../blocks/activity-feed/ActivityFeed';

// Box Plot
export { BoxPlot } from './BoxPlot';
export type { BoxPlotProps, BoxPlotData } from './BoxPlot';

// Histogram Chart
export { HistogramChart } from './HistogramChart';
export type { HistogramChartProps, HistogramBin } from './HistogramChart';

// Control Chart
export { ControlChart } from './ControlChart';
export type { ControlChartProps, ControlChartPoint } from './ControlChart';

// SWOTMatrix: removed — 4-quadrant grid is a simple pattern (Phase 1b triage)
// DecisionMatrix: removed — overlap with SWOTMatrix, weighted-score grid is simple pattern (Phase 1b triage)

// File Upload
export { FileUploadZone } from './FileUploadZone';
export type { FileUploadZoneProps, UploadedFile } from './FileUploadZone';

// MetricComparisonCard: removed — overlap with ExecutiveKPIStrip (Phase 1b triage)
