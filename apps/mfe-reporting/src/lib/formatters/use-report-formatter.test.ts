// @vitest-environment jsdom
/**
 * Adım 14 PR-1 — useReportFormatter unit tests.
 *
 * Plan §7 Adım 14 DoD: Türkçe locale-aware formatter hook
 * (currency / date / number / percent).
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReportFormatter } from './use-report-formatter';

describe('useReportFormatter', () => {
  describe('formatCurrency', () => {
    it('formats positive number as TRY 2-decimal', () => {
      const { result } = renderHook(() => useReportFormatter());
      const formatted = result.current.formatCurrency(1234.56);
      expect(formatted).toContain('1.234,56');
      expect(formatted).toContain('₺');
    });

    it('handles null/undefined → em-dash', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatCurrency(null)).toBe('—');
      expect(result.current.formatCurrency(undefined)).toBe('—');
      expect(result.current.formatCurrency(Number.NaN)).toBe('—');
    });

    it('accepts custom decimals', () => {
      const { result } = renderHook(() => useReportFormatter());
      const formatted = result.current.formatCurrency(1234.5678, 4);
      expect(formatted).toContain('1.234,5678');
    });

    it('respects custom currency option (USD)', () => {
      const { result } = renderHook(() => useReportFormatter({ currency: 'USD' }));
      const formatted = result.current.formatCurrency(1234.56);
      expect(formatted).toContain('1.234,56');
      // USD symbol appears in some locale; just ensure no TRY chars
      expect(formatted).not.toContain('₺');
    });
  });

  describe('formatDate', () => {
    it('formats ISO date short Turkish', () => {
      const { result } = renderHook(() => useReportFormatter());
      const formatted = result.current.formatDate('2026-05-15');
      // Turkish short: 15.05.2026
      expect(formatted).toMatch(/15\.05\.2026/);
    });

    it('formats long Turkish', () => {
      const { result } = renderHook(() => useReportFormatter());
      const formatted = result.current.formatDate('2026-05-15', 'long');
      // Turkish long: 15 Mayıs 2026 (en azından Mayıs içerir)
      expect(formatted).toContain('Mayıs');
      expect(formatted).toContain('2026');
    });

    it('handles invalid date → em-dash', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatDate('invalid-date')).toBe('—');
      expect(result.current.formatDate(null)).toBe('—');
    });

    it('formats Date object', () => {
      const { result } = renderHook(() => useReportFormatter());
      const formatted = result.current.formatDate(new Date('2026-05-15'));
      expect(formatted).toMatch(/15\.05\.2026/);
    });
  });

  describe('formatNumber', () => {
    it('formats integer (0 decimals default)', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatNumber(1234567)).toBe('1.234.567');
    });

    it('formats with custom decimals', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatNumber(0.123456, 2)).toBe('0,12');
      expect(result.current.formatNumber(0.123456, 4)).toBe('0,1235');
    });

    it('handles null → em-dash', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatNumber(null)).toBe('—');
    });
  });

  describe('formatPercent', () => {
    it('formats decimal as Turkish percent (×100)', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatPercent(0.0567)).toContain('5,67');
      expect(result.current.formatPercent(0.0567)).toContain('%');
    });

    it('handles null → em-dash', () => {
      const { result } = renderHook(() => useReportFormatter());
      expect(result.current.formatPercent(null)).toBe('—');
    });
  });

  describe('locale override', () => {
    it('accepts en-US locale', () => {
      const { result } = renderHook(() => useReportFormatter({ locale: 'en-US', currency: 'USD' }));
      const formatted = result.current.formatNumber(1234567);
      // en-US: 1,234,567
      expect(formatted).toBe('1,234,567');
    });
  });

  describe('memoization', () => {
    it('returns same reference on stable options', () => {
      const { result, rerender } = renderHook(() => useReportFormatter());
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });
  });
});
