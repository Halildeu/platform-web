'use client';

import React from 'react';
import { cn } from './utils/cn';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Column count axis. Either:
 * - Single literal (1-4) → mobile-first responsive cascade (sm:2, lg:3...)
 * - Per-breakpoint map (Faz 21.10) → opt-in viewport-tailored grid:
 *   `{ sm: 1, md: 2, lg: 3 }`
 *
 * The literal form is the default; consumers that need finer-grained
 * control over each breakpoint pass the object form. Both forms emit
 * Tailwind grid-cols-* classes at compile time.
 */
export type ChartDashboardColumns =
  | 1
  | 2
  | 3
  | 4
  | {
      /** Mobile (>=640px). @default 1 */
      sm?: 1 | 2 | 3 | 4;
      /** Tablet (>=768px). @default — derived from `sm` */
      md?: 1 | 2 | 3 | 4;
      /** Desktop (>=1024px). @default — derived from `md` or `sm` */
      lg?: 1 | 2 | 3 | 4;
    };

export interface ChartDashboardProps {
  /** Dashboard grid content (ChartDashboard.Item elements). */
  children: React.ReactNode;
  /**
   * Number of columns. Pass a literal (`3`) for the mobile-first
   * cascade or an object (`{ sm: 1, md: 2, lg: 3 }`) for explicit
   * per-breakpoint control.
   * @default 3
   */
  columns?: ChartDashboardColumns;
  /** Gap size between items. @default "md" */
  gap?: 'sm' | 'md' | 'lg';
  /** Additional class name. */
  className?: string;
}

export interface ChartDashboardItemProps {
  /** Number of columns to span. @default 1 */
  span?: 1 | 2 | 3 | 4;
  /** Number of rows to span. @default 1 */
  rowSpan?: 1 | 2;
  /** Item content. */
  children: React.ReactNode;
  /** Additional class name. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const GAP_MAP: Record<string, string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

const COL_MAP: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * Faz 21.10: per-breakpoint column class table. Each breakpoint maps to
 * its Tailwind class — the helper below combines them into a single
 * className. We hard-code the prefix so Tailwind's JIT statically
 * detects each variant.
 */
const SM_COL_MAP: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};
const MD_COL_MAP: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};
const LG_COL_MAP: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

/**
 * Resolve `columns` (literal | object) into the Tailwind class string
 * the grid container uses. The object form starts at the smallest
 * provided breakpoint and lets later breakpoints take over.
 */
function resolveColumnsClassName(columns: ChartDashboardColumns): string {
  if (typeof columns === 'number') {
    return COL_MAP[columns];
  }
  // Object form. Start with mobile baseline (`grid-cols-1`) so very
  // narrow viewports always have a sensible default; then layer the
  // sm/md/lg overrides the consumer asked for.
  const base = `grid-cols-${columns.sm ?? 1}`;
  const sm = columns.sm ? SM_COL_MAP[columns.sm] : '';
  const md = columns.md ? MD_COL_MAP[columns.md] : '';
  const lg = columns.lg ? LG_COL_MAP[columns.lg] : '';
  return [base, sm, md, lg].filter(Boolean).join(' ');
}

const SPAN_MAP: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 sm:col-span-2',
  3: 'col-span-1 sm:col-span-2 lg:col-span-3',
  4: 'col-span-1 sm:col-span-2 lg:col-span-4',
};

const ROW_SPAN_MAP: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
};

/* ------------------------------------------------------------------ */
/*  ChartDashboardItem                                                 */
/* ------------------------------------------------------------------ */

function ChartDashboardItem({
  span = 1,
  rowSpan = 1,
  children,
  className,
}: ChartDashboardItemProps) {
  return (
    <div
      className={cn(
        SPAN_MAP[span],
        ROW_SPAN_MAP[rowSpan],
        'min-w-0', // prevent overflow
        className,
      )}
      data-testid="chart-dashboard-item"
    >
      {children}
    </div>
  );
}

ChartDashboardItem.displayName = 'ChartDashboardItem';

/* ------------------------------------------------------------------ */
/*  ChartDashboard                                                     */
/* ------------------------------------------------------------------ */

export function ChartDashboard({
  children,
  columns = 3,
  gap = 'md',
  className,
}: ChartDashboardProps) {
  return (
    <div
      className={cn(
        'grid text-text-primary',
        resolveColumnsClassName(columns),
        GAP_MAP[gap],
        className,
      )}
      data-testid="chart-dashboard"
    >
      {children}
    </div>
  );
}

ChartDashboard.displayName = 'ChartDashboard';

/** Sub-component for individual dashboard grid items. */
ChartDashboard.Item = ChartDashboardItem;

export default ChartDashboard;
