/**
 * R16 sonrası Adım 14 — useReportFormatter hook (PR-1).
 *
 * Plan §7 Adım 14 DoD: Türkçe locale-aware formatter hook
 * (currency / date / number / percent) — report ve dashboard modüllerinde
 * birleşik kullanım.
 *
 * Codex 019e2a83 plan-time önerisi: kozmetik dalga 4-itemli (hook + preset
 * + React Query wrapper + canonical grid karar); bu PR ilk hook.
 *
 * Pattern:
 * ```tsx
 * const { formatCurrency, formatDate, formatNumber, formatPercent } = useReportFormatter();
 * formatCurrency(1234.56); // "₺1.234,56"
 * formatDate('2026-05-15', 'long'); // "15 Mayıs 2026"
 * formatNumber(0.1234, 2); // "0,12"
 * formatPercent(0.0567); // "%5,67"
 * ```
 *
 * Locale default: `tr-TR` (Türkçe). React Query cache-friendly — no state.
 */

import { useMemo } from 'react';

export type ReportFormatterOptions = {
  locale?: string;
  currency?: string;
};

export type DateFormat = 'short' | 'medium' | 'long' | 'relative';

export type ReportFormatter = {
  formatCurrency: (value: number | null | undefined, decimals?: number) => string;
  formatDate: (input: string | Date | null | undefined, format?: DateFormat) => string;
  formatNumber: (value: number | null | undefined, decimals?: number) => string;
  formatPercent: (value: number | null | undefined, decimals?: number) => string;
};

const DEFAULT_LOCALE = 'tr-TR';
const DEFAULT_CURRENCY = 'TRY';

/**
 * useReportFormatter — Türkçe locale-aware formatter.
 *
 * @param options Locale + currency overrides (optional).
 * @returns Memoized formatter functions.
 */
export function useReportFormatter(options: ReportFormatterOptions = {}): ReportFormatter {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const currency = options.currency ?? DEFAULT_CURRENCY;

  return useMemo<ReportFormatter>(() => {
    return {
      formatCurrency: (value, decimals = 2) => {
        if (value == null || Number.isNaN(value)) return '—';
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
      },

      formatDate: (input, format = 'short') => {
        if (input == null) return '—';
        const date = typeof input === 'string' ? new Date(input) : input;
        if (Number.isNaN(date.getTime())) return '—';

        if (format === 'relative') {
          const diff = date.getTime() - Date.now();
          const absDiff = Math.abs(diff);
          const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
          if (absDiff < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
          if (absDiff < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
          if (absDiff < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
          if (absDiff < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
          if (absDiff < 31_536_000_000)
            return rtf.format(Math.round(diff / 2_592_000_000), 'month');
          return rtf.format(Math.round(diff / 31_536_000_000), 'year');
        }

        const dateStyle: 'short' | 'medium' | 'long' =
          format === 'long' ? 'long' : format === 'medium' ? 'medium' : 'short';

        return new Intl.DateTimeFormat(locale, { dateStyle }).format(date);
      },

      formatNumber: (value, decimals = 0) => {
        if (value == null || Number.isNaN(value)) return '—';
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
      },

      formatPercent: (value, decimals = 2) => {
        if (value == null || Number.isNaN(value)) return '—';
        return new Intl.NumberFormat(locale, {
          style: 'percent',
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
      },
    };
  }, [locale, currency]);
}
