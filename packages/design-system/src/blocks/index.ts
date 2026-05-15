export type { BlockMeta, BlockRegistry } from './types';
export {
  blockRegistry,
  getAllBlocks,
  getBlocksByCategory,
  searchBlocks,
  getBlock,
} from './registry';

/* Phase 2a (2026-05-14) — moved from enterprise/ dashboard/event blocks */
export { ActivityFeed } from './activity-feed';
export { NotificationCenter } from './notification-center';
export { StatusTimeline } from './status-timeline';
export { GanttTimeline } from './gantt-timeline';
export { ProcessFlow } from './process-flow';

/* Phase 2b (2026-05-15) — moved from enterprise/ chart-adjacent blocks */
export { BulletChart } from './bullet-chart';
export { MicroChart } from './micro-chart';
export { BoxPlot } from './box-plot';
export { HistogramChart } from './histogram-chart';
export { ControlChart } from './control-chart';
export { ParetoChart } from './pareto-chart';

/* Phase 2c (2026-05-15) — moved from enterprise/ workspace blocks */
export { SankeyDiagram } from './sankey-diagram';
export { HeatmapCalendar } from './heatmap-calendar';
export { OrgChart } from './org-chart';
export { PivotTable } from './pivot-table';
export { CommentThread } from './comment-thread';
export { FileUploadZone } from './file-upload-zone';
export { FilterPresets } from './filter-presets';
export { ValueStream } from './value-stream';
