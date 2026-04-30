/**
 * Faz 21.5-A2 — accent-palettes contract.
 *
 * Codex iter-13+14 AGREE matrix:
 *   - 7 accent × 10 distinct hex colors
 *   - 'light' palette === legacy DEFAULT_PALETTE (zero-diff backward compat)
 *   - normalizeAccent: 'neutral' alias → 'light', invalid → 'light' fallback
 *   - figma.tokens.json semantic.theme.palette[name].colorPrimary === ACCENT_PALETTES[name][0]
 *     (with 'light' override since legacy chart palette uses '#3b82f6' instead of figma '#1677ff')
 */
import { describe, it, expect } from 'vitest';
import {
  ACCENT_PALETTES,
  normalizeAccent,
  isValidAccent,
  type ChartAccentName,
} from '../theme/accent-palettes';

const ACCENT_NAMES: ChartAccentName[] = [
  'light',
  'dark',
  'emerald',
  'graphite',
  'ocean',
  'sunset',
  'violet',
];

describe('ACCENT_PALETTES structure', () => {
  it('contains all 7 expected accent names', () => {
    expect(Object.keys(ACCENT_PALETTES).sort()).toEqual([...ACCENT_NAMES].sort());
  });

  it('every accent palette has 10 colors', () => {
    for (const name of ACCENT_NAMES) {
      expect(ACCENT_PALETTES[name].length, `${name} palette must have 10 colors`).toBe(10);
    }
  });

  it('every color is a valid 7-char hex', () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const name of ACCENT_NAMES) {
      ACCENT_PALETTES[name].forEach((color, i) => {
        expect(color, `${name}[${i}]=${color} must match #RRGGBB`).toMatch(hexRegex);
      });
    }
  });

  it('every palette has unique colors (no duplicates within an accent)', () => {
    for (const name of ACCENT_NAMES) {
      const palette = ACCENT_PALETTES[name];
      const unique = new Set(palette);
      expect(unique.size, `${name} palette has duplicate colors`).toBe(palette.length);
    }
  });
});

describe('ACCENT_PALETTES backward compatibility', () => {
  it('light palette[0] === "#3b82f6" (legacy DEFAULT_PALETTE primary)', () => {
    expect(ACCENT_PALETTES.light[0]).toBe('#3b82f6');
  });

  it('light palette is identical to legacy chart wrapper DEFAULT_PALETTE', () => {
    const LEGACY_DEFAULT_PALETTE = [
      '#3b82f6',
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#06b6d4',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
      '#6366f1',
    ];
    expect(ACCENT_PALETTES.light).toEqual(LEGACY_DEFAULT_PALETTE);
  });
});

describe('ACCENT_PALETTES figma.tokens.json colorPrimary alignment', () => {
  // Note: 'light' is intentionally chart-specific ('#3b82f6') vs figma ('#1677ff')
  // for backward compatibility. Other accents start with figma colorPrimary.
  it('emerald palette[0] === figma colorPrimary "#16a34a"', () => {
    expect(ACCENT_PALETTES.emerald[0]).toBe('#16a34a');
  });

  it('ocean palette[0] === figma colorPrimary "#0ea5e9"', () => {
    expect(ACCENT_PALETTES.ocean[0]).toBe('#0ea5e9');
  });

  it('violet palette[0] === figma colorPrimary "#722ed1"', () => {
    expect(ACCENT_PALETTES.violet[0]).toBe('#722ed1');
  });

  it('sunset palette[0] === figma colorPrimary "#f97316"', () => {
    expect(ACCENT_PALETTES.sunset[0]).toBe('#f97316');
  });
});

describe('isValidAccent', () => {
  it('returns true for all 7 accent names', () => {
    for (const name of ACCENT_NAMES) {
      expect(isValidAccent(name)).toBe(true);
    }
  });

  it('returns false for invalid values', () => {
    expect(isValidAccent('neutral')).toBe(false); // alias is normalized, not valid as-is
    expect(isValidAccent('rocketspeed')).toBe(false);
    expect(isValidAccent('')).toBe(false);
    expect(isValidAccent('LIGHT')).toBe(false); // case-sensitive
  });
});

describe('normalizeAccent', () => {
  it('returns canonical names unchanged', () => {
    for (const name of ACCENT_NAMES) {
      expect(normalizeAccent(name)).toBe(name);
    }
  });

  it("'neutral' alias normalized to 'light'", () => {
    expect(normalizeAccent('neutral')).toBe('light');
  });

  it('case-insensitive (lowercases input)', () => {
    expect(normalizeAccent('LIGHT')).toBe('light');
    expect(normalizeAccent('Emerald')).toBe('emerald');
    expect(normalizeAccent('OCEAN')).toBe('ocean');
    expect(normalizeAccent('Neutral')).toBe('light'); // alias case-insensitive
  });

  it('trim whitespace', () => {
    expect(normalizeAccent('  emerald  ')).toBe('emerald');
    expect(normalizeAccent('\tneutral\n')).toBe('light');
  });

  it('null/undefined/empty → "light"', () => {
    expect(normalizeAccent(null)).toBe('light');
    expect(normalizeAccent(undefined)).toBe('light');
    expect(normalizeAccent('')).toBe('light');
    expect(normalizeAccent('   ')).toBe('light');
  });

  it('invalid value → "light" (default fallback)', () => {
    expect(normalizeAccent('rocketspeed')).toBe('light');
    expect(normalizeAccent('rainbow')).toBe('light');
    expect(normalizeAccent('123')).toBe('light');
  });
});
