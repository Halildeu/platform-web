import { describe, it, expect } from 'vitest';

import { formatValue, getTrendColor, getTrendIcon, getToneClasses } from '../format-helpers';
import type { EnterpriseTone } from '../format-helpers';

// --- Utility Tests ---
describe('Enterprise utilities', () => {
  it('formatValue handles currency', () => {
    const result = formatValue(1500, { format: 'currency', currency: 'TRY', locale: 'tr-TR' });
    expect(result).toContain('1.500');
  });

  it('formatValue handles percent', () => {
    const result = formatValue(75, { format: 'percent' });
    expect(result).toContain('75');
  });

  it('formatValue handles compact', () => {
    const result = formatValue(1500000, { format: 'compact', locale: 'en-US' });
    expect(result).toContain('M');
  });

  it('formatValue handles duration', () => {
    expect(formatValue(90, { format: 'duration' })).toBe('1h 30m');
    expect(formatValue(45, { format: 'duration' })).toBe('45m');
  });

  it('getTrendColor returns correct colors', () => {
    expect(getTrendColor('up')).toContain('success');
    expect(getTrendColor('down')).toContain('error');
    expect(getTrendColor('flat')).toContain('secondary');
  });

  it('getTrendIcon returns arrow chars', () => {
    expect(getTrendIcon('up')).toBe('↑');
    expect(getTrendIcon('down')).toBe('↓');
    expect(getTrendIcon('flat')).toBe('→');
  });

  it('getToneClasses returns bg/text/border', () => {
    const classes = getToneClasses('danger');
    expect(classes.bg).toContain('error');
    expect(classes.text).toContain('error');
  });
});

// =====================================================================
// 1. Enterprise types — utility function branches
// =====================================================================

describe('formatValue — all format branches', () => {
  it('returns plain number with default format', () => {
    const result = formatValue(42, {});
    expect(result).toContain('42');
  });

  it('handles currency with custom currency and decimals', () => {
    const result = formatValue(1234.5, {
      format: 'currency',
      currency: 'USD',
      locale: 'en-US',
      decimals: 2,
    });
    expect(result).toContain('1,234.50');
  });

  it('handles percent format', () => {
    const result = formatValue(42.5, { format: 'percent', locale: 'en-US', decimals: 1 });
    // 42.5 / 100 = 0.425 → 42.5%
    expect(result).toContain('42.5');
    expect(result).toContain('%');
  });

  it('handles compact format', () => {
    const result = formatValue(1500000, { format: 'compact', locale: 'en-US', decimals: 1 });
    expect(result).toBeTruthy();
  });

  it('handles duration with hours', () => {
    expect(formatValue(90, { format: 'duration' })).toBe('1h 30m');
  });

  it('handles duration without hours', () => {
    expect(formatValue(25, { format: 'duration' })).toBe('25m');
  });

  it('handles duration for 0 minutes', () => {
    expect(formatValue(0, { format: 'duration' })).toBe('0m');
  });

  it('handles number with custom decimals', () => {
    const result = formatValue(3.14159, { format: 'number', locale: 'en-US', decimals: 2 });
    expect(result).toContain('3.14');
  });
});

describe('getTrendColor — invert branches', () => {
  it('returns success for up when not inverted', () => {
    expect(getTrendColor('up', false)).toContain('success');
  });

  it('returns error for up when inverted', () => {
    expect(getTrendColor('up', true)).toContain('error');
  });

  it('returns success for down when inverted', () => {
    expect(getTrendColor('down', true)).toContain('success');
  });

  it('returns error for down when not inverted', () => {
    expect(getTrendColor('down', false)).toContain('error');
  });

  it('returns secondary for flat regardless of invert', () => {
    expect(getTrendColor('flat', false)).toContain('secondary');
    expect(getTrendColor('flat', true)).toContain('secondary');
  });
});

describe('getTrendIcon — all directions', () => {
  it('returns correct arrows', () => {
    expect(getTrendIcon('up')).toBe('↑');
    expect(getTrendIcon('down')).toBe('↓');
    expect(getTrendIcon('flat')).toBe('→');
  });
});

describe('getToneClasses — all tones', () => {
  const tones: EnterpriseTone[] = ['default', 'success', 'warning', 'danger', 'info'];

  tones.forEach((tone) => {
    it(`returns bg, text, border for ${tone}`, () => {
      const classes = getToneClasses(tone);
      expect(classes).toHaveProperty('bg');
      expect(classes).toHaveProperty('text');
      expect(classes).toHaveProperty('border');
      expect(typeof classes.bg).toBe('string');
      expect(typeof classes.text).toBe('string');
      expect(typeof classes.border).toBe('string');
    });
  });
});
