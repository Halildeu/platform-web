/**
 * Faz 21.4 PR-F1 — chart contrast contract gate (CONTRACT §8 contrast).
 *
 * Asserts WCAG AA 4.5:1 contrast for TEXT/CONTROL elements emitted by
 * each `buildDesignLab...Theme` builder. Series palette colors are
 * NOT gated here — series differentiation is achieved by spacing,
 * borders, markers, legends, labels and decal patterns; tightening
 * adjacent palette ratios to a numerical threshold is a visual-design
 * change, not a CI wiring change (PR-F1 scope).
 *
 * Out of scope (explicitly):
 * - Series palette adjacent-color ratio (would fail current paletes;
 *   visual-design PR territory).
 * - High-contrast palette numerical 4.5:1 series ratio (current HC
 *   palette doesn't satisfy; visual-design PR territory).
 * - `nameTextStyle` (axis name, uses `textTertiary` token by design;
 *   ~2.54:1 on white. Tightening is a token-level redesign).
 * - Decal pattern + HC structural fallback (covered by
 *   `chart-theme-decal.test.tsx` — runs in same CI job).
 *
 * In scope (HARD GATE):
 * 7 text/control color × 5 themes = 35 assertions plus 2 HC palette
 * differentiation invariants.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDesignLabEChartsTheme,
  buildDesignLabEChartsDarkTheme,
  buildDesignLabEChartsHighContrastTheme,
  buildDesignLabEChartsPrintTheme,
} from '../theme';

/* ------------------------------------------------------------------ */
/*  WCAG contrast helper (sRGB + relative luminance)                  */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.replace(/^#/, '');
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split('')
          .map((c) => c + c)
          .join('')
      : trimmed;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return [r, g, b];
}

function srgbChannel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function getContrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

/* ------------------------------------------------------------------ */
/*  Theme shape access (drift-safe, type-loose)                       */
/* ------------------------------------------------------------------ */

/**
 * Walks a hex-color value out of a deeply nested theme object.
 * Throws with a useful path when the shape drifts so a builder
 * refactor surfaces here loudly instead of as a vague TS error.
 */
function readThemeColor(theme: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => {
    if (!node || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, theme);

  if (typeof value !== 'string' || !value.startsWith('#')) {
    throw new Error(`Expected hex color at theme path '${path}', got ${String(value)}`);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  Theme cases — explicit surface fallback                           */
/* ------------------------------------------------------------------ */
/*
 * Theme builders emit `backgroundColor: 'transparent'` at the root, so
 * tests must pass the surface color the chart will actually be drawn
 * onto. These five surfaces match the design tokens consumed by
 * mfe-shell + Storybook + Design Lab.
 */

interface ThemeCase {
  name: string;
  build: () => Record<string, unknown>;
  surface: string;
}

const THEME_CASES: ThemeCase[] = [
  {
    name: 'light',
    build: () => buildDesignLabEChartsTheme() as Record<string, unknown>,
    surface: '#ffffff',
  },
  {
    name: 'dark',
    build: () => buildDesignLabEChartsDarkTheme() as Record<string, unknown>,
    surface: '#1f2937',
  },
  {
    name: 'hc-light',
    build: () =>
      buildDesignLabEChartsHighContrastTheme({
        dark: false,
      }) as Record<string, unknown>,
    surface: '#ffffff',
  },
  {
    name: 'hc-dark',
    build: () =>
      buildDesignLabEChartsHighContrastTheme({
        dark: true,
      }) as Record<string, unknown>,
    surface: '#000000',
  },
  {
    name: 'print',
    build: () =>
      buildDesignLabEChartsPrintTheme({
        useDecalPatterns: true,
      }) as Record<string, unknown>,
    surface: '#ffffff',
  },
];

/* ------------------------------------------------------------------ */
/*  Tests — 7 text/control × 5 themes = 35 assertions                 */
/* ------------------------------------------------------------------ */

describe('chart-contrast contract — text/control WCAG AA 4.5:1', () => {
  describe.each(THEME_CASES)('$name theme', ({ build, surface }) => {
    it('textStyle.color on surface ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'textStyle.color');
      expect(getContrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('title.textStyle.color on surface ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'title.textStyle.color');
      expect(getContrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('title.subtextStyle.color on surface ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'title.subtextStyle.color');
      expect(getContrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('legend.textStyle.color on surface ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'legend.textStyle.color');
      expect(getContrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('tooltip text on tooltip background ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'tooltip.textStyle.color');
      const bg = readThemeColor(theme, 'tooltip.backgroundColor');
      expect(getContrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('categoryAxis.axisLabel.color on surface ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'categoryAxis.axisLabel.color');
      expect(getContrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('valueAxis.axisLabel.color on surface ≥ 4.5:1', () => {
      const theme = build();
      const fg = readThemeColor(theme, 'valueAxis.axisLabel.color');
      expect(getContrastRatio(fg, surface)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  HC palette differentiation (CONTRACT §1.1 fallback)               */
/* ------------------------------------------------------------------ */

describe('chart-contrast contract — HC palette differentiation', () => {
  it('HC light palette differs from default light palette', () => {
    const hc = buildDesignLabEChartsHighContrastTheme({
      dark: false,
    }) as Record<string, unknown>;
    const def = buildDesignLabEChartsTheme() as Record<string, unknown>;
    expect(hc.color).not.toEqual(def.color);
  });

  it('HC dark palette differs from default dark palette', () => {
    const hc = buildDesignLabEChartsHighContrastTheme({
      dark: true,
    }) as Record<string, unknown>;
    const def = buildDesignLabEChartsDarkTheme() as Record<string, unknown>;
    expect(hc.color).not.toEqual(def.color);
  });
});

/* ------------------------------------------------------------------ */
/*  Helper sanity (math is correct)                                   */
/* ------------------------------------------------------------------ */

describe('chart-contrast helper sanity', () => {
  it('white on black is ~21:1', () => {
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('black on white is ~21:1', () => {
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('mid-gray on white is ~4.5:1 (#767676)', () => {
    expect(getContrastRatio('#767676', '#ffffff')).toBeCloseTo(4.5, 0);
  });

  it('readThemeColor surfaces drift with useful path', () => {
    expect(() => readThemeColor({ a: { b: 'not-a-color' } }, 'a.b')).toThrow(
      /Expected hex color at theme path 'a.b'/,
    );
  });
});
