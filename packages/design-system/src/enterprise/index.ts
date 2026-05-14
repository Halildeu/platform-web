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
export { ExecutiveKPIStrip } from './ExecutiveKPIStrip';

// Workflow & Approvals
export { ApprovalWorkflow } from './ApprovalWorkflow';

// Risk & Governance
export { RiskMatrix } from './RiskMatrix';
export { GovernanceBoard } from './GovernanceBoard';

// Project & Timeline
export { GanttTimeline } from './GanttTimeline';

// Financial & Analytics
export { AgingBuckets } from './AgingBuckets';
// FunnelChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)
export { ComparisonTable } from './ComparisonTable';

// HR & Training
export { TrainingTracker } from './TrainingTracker';

// Visualization
export { BulletChart } from './BulletChart';
export { MicroChart } from './MicroChart';
// TreemapChart, RadarChart: removed — canonical surface is `@mfe/x-charts` (Phase 1a triage)
export { SankeyDiagram } from './SankeyDiagram';

// Date & Time
export { DateRangePicker } from './DateRangePicker';

// Layout
export { ThemeLayout } from './ThemeLayout';

// Process & Flow
export { ProcessFlow } from './ProcessFlow';
export { FlowBuilder } from './FlowBuilder';
export type { FlowBuilderProps, FlowNode, FlowEdge, FlowNodeType } from './FlowBuilder';
export { ValueStream } from './ValueStream';

// Status & Timeline
export { StatusTimeline } from './StatusTimeline';

// Notifications
export { NotificationCenter } from './NotificationCenter';
export type { NotificationCenterLocaleText } from './NotificationCenter';

// Editing
export { InlineEdit } from './InlineEdit';

// Empty States
export { EmptyStateBuilder } from './EmptyStateBuilder';
export type { EmptyStateBuilderLocaleText } from './EmptyStateBuilder';

// Filters
export { FilterPresets } from './FilterPresets';
export type { FilterPresetsLocaleText } from './FilterPresets';

// Export
export { DataExportDialog } from './DataExportDialog';
export type { DataExportDialogLocaleText } from './DataExportDialog';

// Fine-Kinney Risk Assessment
export { FineKinney } from './FineKinney';
export type { FineKinneyProps, FineKinneyRisk } from './FineKinney';

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
export { ActivityFeed } from './ActivityFeed';
export type { ActivityFeedProps, ActivityItem } from './ActivityFeed';

// Box Plot
export { BoxPlot } from './BoxPlot';
export type { BoxPlotProps, BoxPlotData } from './BoxPlot';

// Histogram Chart
export { HistogramChart } from './HistogramChart';
export type { HistogramChartProps, HistogramBin } from './HistogramChart';

// Control Chart
export { ControlChart } from './ControlChart';
export type { ControlChartProps, ControlChartPoint } from './ControlChart';

// SWOT Matrix
export { SWOTMatrix } from './SWOTMatrix';
export type { SWOTMatrixProps, SWOTItem, SWOTQuadrant } from './SWOTMatrix';

// Decision Matrix
export { DecisionMatrix } from './DecisionMatrix';
export type {
  DecisionMatrixProps,
  DecisionOption,
  DecisionCriterion,
  DecisionScore,
} from './DecisionMatrix';

// File Upload
export { FileUploadZone } from './FileUploadZone';
export type { FileUploadZoneProps, UploadedFile } from './FileUploadZone';

// Metric Comparison
export { MetricComparisonCard } from './MetricComparisonCard';
export type { MetricComparisonCardProps } from './MetricComparisonCard';
