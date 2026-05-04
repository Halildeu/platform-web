'use client';

import React from 'react';
import { cn } from './utils/cn';
import { Spinner } from './components/spinner/Spinner';
import { Text } from './components/text/Text';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChartContainerProps {
  /** Card title displayed in the header. */
  title?: string;
  /** Secondary description below the title. */
  description?: string;
  /** Show a loading spinner instead of children. @default false */
  loading?: boolean;
  /** Error message — replaces children with an error state. */
  error?: string;
  /** Show the empty-data placeholder. @default false */
  empty?: boolean;
  /** Label shown in the empty state. @default "No data available" */
  emptyLabel?: string;
  /** Explicit chart area height (px or CSS string). @default 300 */
  height?: number | string;
  /** Additional class name for the outer wrapper. */
  className?: string;
  /** Action buttons rendered in the header row. */
  actions?: React.ReactNode;
  /** Chart content. */
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChartContainer({
  title,
  description,
  loading = false,
  error,
  empty = false,
  emptyLabel = 'No data available',
  height = 300,
  className,
  actions,
  children,
}: ChartContainerProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-default)]',
        className,
      )}
    >
      {/*
        Header — Faz 21.10 waves 2 & 4: mobile-first padding plus title
        truncation via min-w-0 on the title column.

        Actions slot is mobile-shrinkable (wave 4): on <640px the wrapper
        wraps and lets its child (e.g. a wrapping ChartToolbar or multi-
        button cluster) reflow inside narrow cards. On sm+ we lock the
        wave-2 `shrink-0` behavior so a long title still ellipsizes
        instead of squishing the actions group on tablet/desktop.
      */}
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2 sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            {title && (
              <Text as="div" className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {title}
              </Text>
            )}
            {description && (
              <Text className="truncate text-[11px] text-[var(--text-secondary)]">
                {description}
              </Text>
            )}
          </div>
          {actions && (
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 sm:shrink-0 sm:flex-nowrap sm:gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* ---- body ---- */}
      <div className="relative" style={{ height }}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <svg
              className="h-8 w-8 text-[var(--state-error-text)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <Text className="text-xs text-[var(--text-secondary)]">{error}</Text>
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <svg
              className="h-8 w-8 text-[var(--text-tertiary)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M3 3h18v18H3zM8 12h8M12 8v8" strokeLinecap="round" />
            </svg>
            <Text className="text-xs text-[var(--text-secondary)]">{emptyLabel}</Text>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

ChartContainer.displayName = 'ChartContainer';

export default ChartContainer;
