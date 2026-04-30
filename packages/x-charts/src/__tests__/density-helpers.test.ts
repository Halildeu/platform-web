/**
 * Faz 21.5-A3 — density-helpers contract.
 *
 * Codex iter-8 madde 2 absorb:
 *   - scaleFontSize: Math.max(10, Math.round(base * multiplier)) — a11y minimum 10px
 *   - scaleSpacing / scalePadding: Math.max(0, Math.round(base * multiplier))
 *   - DENSITY_MULTIPLIERS pinli: comfortable {1.0, 1.0, 1.0}, compact {0.875, 0.75, 0.75}
 *   - resolveDensity priority: explicit > snapshot > 'comfortable'
 */
import { describe, it, expect } from 'vitest';
import {
  DENSITY_MULTIPLIERS,
  MIN_FONT_SIZE_PX,
  scaleFontSize,
  scaleSpacing,
  scalePadding,
  resolveDensity,
} from '../theme/density-helpers';

describe('DENSITY_MULTIPLIERS pin', () => {
  it('comfortable is the identity multiplier (1.0/1.0/1.0)', () => {
    expect(DENSITY_MULTIPLIERS.comfortable).toEqual({
      fontSize: 1.0,
      spacing: 1.0,
      padding: 1.0,
    });
  });

  it('compact reduces fontSize by 12.5%, spacing/padding by 25%', () => {
    expect(DENSITY_MULTIPLIERS.compact).toEqual({
      fontSize: 0.875,
      spacing: 0.75,
      padding: 0.75,
    });
  });

  it('MIN_FONT_SIZE_PX is 10 (a11y readable threshold)', () => {
    expect(MIN_FONT_SIZE_PX).toBe(10);
  });
});

describe('scaleFontSize — a11y clamp at 10px', () => {
  it('comfortable identity preserves base', () => {
    expect(scaleFontSize(11, 1.0)).toBe(11);
    expect(scaleFontSize(16, 1.0)).toBe(16);
    expect(scaleFontSize(13, 1.0)).toBe(13);
  });

  it('compact rounds down to nearest int (Math.round)', () => {
    expect(scaleFontSize(11, 0.875)).toBe(10); // round(9.625) = 10 (clamp triggers)
    expect(scaleFontSize(13, 0.875)).toBe(11); // round(11.375) = 11
    expect(scaleFontSize(16, 0.875)).toBe(14); // round(14.0) = 14
    expect(scaleFontSize(20, 0.875)).toBe(18); // round(17.5) = 18
  });

  it('clamps at MIN_FONT_SIZE_PX (10) regardless of input', () => {
    expect(scaleFontSize(8, 1.0)).toBe(10); // base too small
    expect(scaleFontSize(8, 0.875)).toBe(10); // both reduce + below min
    expect(scaleFontSize(11, 0.5)).toBe(10); // very compact
    expect(scaleFontSize(20, 0.4)).toBe(10); // round(8) → clamp
  });

  it('clamp does not affect already-large fonts', () => {
    expect(scaleFontSize(100, 0.875)).toBe(88);
    expect(scaleFontSize(50, 0.5)).toBe(25);
  });
});

describe('scaleSpacing — floor at 0', () => {
  it('comfortable preserves spacing', () => {
    expect(scaleSpacing(16, 1.0)).toBe(16);
    expect(scaleSpacing(8, 1.0)).toBe(8);
  });

  it('compact reduces spacing', () => {
    expect(scaleSpacing(16, 0.75)).toBe(12);
    expect(scaleSpacing(8, 0.75)).toBe(6);
    expect(scaleSpacing(12, 0.75)).toBe(9);
  });

  it('floors at 0, never negative', () => {
    expect(scaleSpacing(0, 1.0)).toBe(0);
    expect(scaleSpacing(0, 0.75)).toBe(0);
    expect(scaleSpacing(-5, 1.0)).toBe(0);
  });

  it('does NOT clamp at MIN_FONT_SIZE_PX (spacing can legitimately be small)', () => {
    expect(scaleSpacing(4, 0.5)).toBe(2); // 2px valid spacing
    expect(scaleSpacing(8, 0.5)).toBe(4);
  });
});

describe('scalePadding — floor at 0', () => {
  it('comfortable preserves padding', () => {
    expect(scalePadding(24, 1.0)).toBe(24);
    expect(scalePadding(16, 1.0)).toBe(16);
  });

  it('compact reduces padding', () => {
    expect(scalePadding(48, 0.75)).toBe(36);
    expect(scalePadding(60, 0.75)).toBe(45);
    expect(scalePadding(16, 0.75)).toBe(12);
  });

  it('floors at 0', () => {
    expect(scalePadding(0, 1.0)).toBe(0);
    expect(scalePadding(2, 0.1)).toBe(0); // round(0.2) = 0
    expect(scalePadding(-3, 1.0)).toBe(0);
  });
});

describe('resolveDensity — priority explicit > snapshot > default', () => {
  it("explicit 'compact' wins over snapshot 'comfortable'", () => {
    expect(resolveDensity('compact', 'comfortable')).toBe('compact');
  });

  it("explicit 'comfortable' wins over snapshot 'compact'", () => {
    expect(resolveDensity('comfortable', 'compact')).toBe('comfortable');
  });

  it("'auto' falls through to snapshot value (compact)", () => {
    expect(resolveDensity('auto', 'compact')).toBe('compact');
  });

  it("'auto' falls through to snapshot value (comfortable)", () => {
    expect(resolveDensity('auto', 'comfortable')).toBe('comfortable');
  });

  it('undefined preference falls through to snapshot', () => {
    expect(resolveDensity(undefined, 'compact')).toBe('compact');
    expect(resolveDensity(undefined, 'comfortable')).toBe('comfortable');
  });
});
