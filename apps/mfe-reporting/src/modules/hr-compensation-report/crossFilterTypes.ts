export type CrossFilter = {
  sourceId: string;
  dimension: string;
  value: string | number;
  displayLabel: string;
};

export type ChartFilterMapping = {
  dimension: string;
  valueField: string;
};

/**
 * Maps chart IDs to their cross-filter dimension.
 * Charts not listed here do not participate as cross-filter sources
 * (e.g., time-series or waterfall charts).
 */
export const CHART_FILTER_MAP: Record<string, ChartFilterMapping> = {
  'dept-salary-comparison': { dimension: 'department', valueField: 'label' },
  'gender-salary-comparison': { dimension: 'department', valueField: 'label' },
  'education-salary-premium': { dimension: 'education', valueField: 'label' },
  'collar-type-salary': { dimension: 'collarType', valueField: 'label' },
  'company-payroll-pie': { dimension: 'company', valueField: 'label' },
  'dept-percentile-radar': { dimension: 'department', valueField: 'label' },
};

/** KPI IDs that support click-to-filter */
export const KPI_FILTER_MAP: Record<string, string> = {
  'gender-pay-gap': 'gender',
  'collar-overtime': 'collarType',
};

// Faz 21.8 PR-X5: `toggleCrossFilter` removed.
// CompensationDashboard now drives the toggle through the
// `@mfe/x-charts` cross-filter store (Faz 21.8 PR-X4a). The bespoke
// helper had no remaining callers — see `CompensationDashboard.tsx`
// `toggleStoreFilter` for the equivalent store-driven path.
