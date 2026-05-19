// @vitest-environment jsdom
/**
 * resolveCssVarColor unit tests.
 *
 * The canvas renderer cannot read CSS custom properties — consumer-supplied
 * `var(--…)` colors must be resolved to a concrete value before they reach
 * an ECharts color field. These tests pin every branch of that resolution.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  resolveCssVarColor,
  resolveCssVarColors,
  resolveStyleColorFields,
  resolveTreeNodeColors,
} from '../resolveCssVarColor';

/** Remove any inline custom properties set on <html> during a test. */
function clearRootVars(...tokens: string[]): void {
  for (const t of tokens) {
    document.documentElement.style.removeProperty(t);
  }
}

describe('resolveCssVarColor', () => {
  afterEach(() => {
    clearRootVars(
      '--xc-test-primary',
      '--xc-test-accent',
      '--xc-test-empty',
      '--xc-test-chain',
      '--xc-test-inner',
    );
  });

  it('resolves a plain var(--token) to its computed value', () => {
    document.documentElement.style.setProperty('--xc-test-primary', '#1d4ed8');
    expect(resolveCssVarColor('var(--xc-test-primary)')).toBe('#1d4ed8');
  });

  it('resolves var(--token) ignoring surrounding whitespace', () => {
    document.documentElement.style.setProperty('--xc-test-primary', '  #abc123  ');
    // getPropertyValue returns the trimmed value; the resolver also trims.
    expect(resolveCssVarColor('  var( --xc-test-primary )  ')).toBe('#abc123');
  });

  it('uses the resolved token over the fallback when the token is defined', () => {
    document.documentElement.style.setProperty('--xc-test-primary', '#0a0a0a');
    expect(resolveCssVarColor('var(--xc-test-primary, #ffffff)')).toBe('#0a0a0a');
  });

  it('falls back to the literal when the token is undefined', () => {
    // --xc-test-empty is intentionally never set.
    expect(resolveCssVarColor('var(--xc-test-empty, #ec4899)')).toBe('#ec4899');
  });

  it('resolves a nested var() fallback when the outer token is undefined', () => {
    document.documentElement.style.setProperty('--xc-test-accent', '#22c55e');
    expect(resolveCssVarColor('var(--xc-test-empty, var(--xc-test-accent))')).toBe('#22c55e');
  });

  it('resolves a nested var() fallback that itself has a literal fallback', () => {
    // Neither token is defined — the innermost literal fallback wins.
    expect(resolveCssVarColor('var(--xc-test-empty, var(--xc-test-inner, #f59e0b))')).toBe(
      '#f59e0b',
    );
  });

  it('returns the original input for a bare var(--token) with an undefined token', () => {
    // No fallback, token undefined: nothing to resolve to — passthrough.
    expect(resolveCssVarColor('var(--xc-test-empty)')).toBe('var(--xc-test-empty)');
  });

  it('passes through hex colors unchanged', () => {
    expect(resolveCssVarColor('#3b82f6')).toBe('#3b82f6');
  });

  it('passes through rgb / rgba colors unchanged', () => {
    expect(resolveCssVarColor('rgb(59, 130, 246)')).toBe('rgb(59, 130, 246)');
    expect(resolveCssVarColor('rgba(0, 0, 0, 0.18)')).toBe('rgba(0, 0, 0, 0.18)');
  });

  it('passes through named colors unchanged', () => {
    expect(resolveCssVarColor('rebeccapurple')).toBe('rebeccapurple');
  });

  it('passes through an empty string unchanged', () => {
    expect(resolveCssVarColor('')).toBe('');
  });

  it('passes through undefined unchanged', () => {
    expect(resolveCssVarColor(undefined)).toBeUndefined();
  });

  it('passes through non-string values unchanged', () => {
    // Defensive: callers may hand off loosely typed values.
    expect(resolveCssVarColor(null as unknown as string)).toBeNull();
    expect(resolveCssVarColor(42 as unknown as string)).toBe(42);
  });

  it('does not treat a value that merely contains "var(" as a var() expression', () => {
    // The regex is anchored — a literal that is not exactly a var() call
    // must pass through (canvas would reject it, but the resolver does not
    // invent a value).
    expect(resolveCssVarColor('linear-gradient(var(--x), #fff)')).toBe(
      'linear-gradient(var(--x), #fff)',
    );
  });
});

describe('resolveCssVarColors', () => {
  afterEach(() => {
    clearRootVars('--xc-test-primary', '--xc-test-accent');
  });

  it('maps every entry of an array through the resolver', () => {
    document.documentElement.style.setProperty('--xc-test-primary', '#1d4ed8');
    document.documentElement.style.setProperty('--xc-test-accent', '#ec4899');
    expect(
      resolveCssVarColors(['var(--xc-test-primary)', '#000000', 'var(--xc-test-accent)']),
    ).toEqual(['#1d4ed8', '#000000', '#ec4899']);
  });

  it('returns undefined when the input is undefined', () => {
    expect(resolveCssVarColors(undefined)).toBeUndefined();
  });

  it('returns an empty array for an empty array input', () => {
    expect(resolveCssVarColors([])).toEqual([]);
  });

  it('applies the fallback branch per entry', () => {
    expect(resolveCssVarColors(['var(--xc-undefined-tok, #abcdef)'])).toEqual(['#abcdef']);
  });
});

describe('resolveStyleColorFields', () => {
  afterEach(() => {
    clearRootVars('--xc-test-fill', '--xc-test-border', '--xc-test-bg', '--xc-test-shadow');
  });

  it('resolves the color field', () => {
    document.documentElement.style.setProperty('--xc-test-fill', '#1d4ed8');
    expect(resolveStyleColorFields({ color: 'var(--xc-test-fill)' })).toEqual({ color: '#1d4ed8' });
  });

  it('resolves the borderColor field', () => {
    document.documentElement.style.setProperty('--xc-test-border', '#22c55e');
    expect(resolveStyleColorFields({ borderColor: 'var(--xc-test-border)' })).toEqual({
      borderColor: '#22c55e',
    });
  });

  it('resolves the backgroundColor field', () => {
    document.documentElement.style.setProperty('--xc-test-bg', '#fffbeb');
    expect(resolveStyleColorFields({ backgroundColor: 'var(--xc-test-bg)' })).toEqual({
      backgroundColor: '#fffbeb',
    });
  });

  it('resolves the shadowColor field', () => {
    document.documentElement.style.setProperty('--xc-test-shadow', 'rgba(0,0,0,0.2)');
    expect(resolveStyleColorFields({ shadowColor: 'var(--xc-test-shadow)' })).toEqual({
      shadowColor: 'rgba(0,0,0,0.2)',
    });
  });

  it('resolves all four color fields on the same style object', () => {
    document.documentElement.style.setProperty('--xc-test-fill', '#1d4ed8');
    document.documentElement.style.setProperty('--xc-test-border', '#22c55e');
    document.documentElement.style.setProperty('--xc-test-bg', '#fffbeb');
    document.documentElement.style.setProperty('--xc-test-shadow', 'rgba(0,0,0,0.3)');
    expect(
      resolveStyleColorFields({
        color: 'var(--xc-test-fill)',
        borderColor: 'var(--xc-test-border)',
        backgroundColor: 'var(--xc-test-bg)',
        shadowColor: 'var(--xc-test-shadow)',
      }),
    ).toEqual({
      color: '#1d4ed8',
      borderColor: '#22c55e',
      backgroundColor: '#fffbeb',
      shadowColor: 'rgba(0,0,0,0.3)',
    });
  });

  it('falls back to the literal when a token is undefined', () => {
    // --xc-test-fill intentionally never set.
    expect(resolveStyleColorFields({ color: 'var(--xc-test-fill, #ec4899)' })).toEqual({
      color: '#ec4899',
    });
  });

  it('copies non-color fields verbatim and leaves hex colors untouched', () => {
    expect(
      resolveStyleColorFields({
        color: '#3b82f6',
        borderWidth: 2,
        opacity: 0.6,
        show: true,
      }),
    ).toEqual({ color: '#3b82f6', borderWidth: 2, opacity: 0.6, show: true });
  });

  it('leaves a style object with no color fields structurally equal', () => {
    expect(resolveStyleColorFields({ borderWidth: 1, fontSize: 11 })).toEqual({
      borderWidth: 1,
      fontSize: 11,
    });
  });

  it('ignores non-string color fields (defensive)', () => {
    // A consumer could hand off a loosely-typed numeric/null color.
    const input = { color: 42 as unknown as string, borderColor: null as unknown as string };
    expect(resolveStyleColorFields(input)).toEqual({ color: 42, borderColor: null });
  });

  it('passes undefined through unchanged', () => {
    expect(resolveStyleColorFields(undefined)).toBeUndefined();
  });

  it('does not mutate the input style object (non-mutating clone)', () => {
    document.documentElement.style.setProperty('--xc-test-fill', '#1d4ed8');
    const input = { color: 'var(--xc-test-fill)', borderWidth: 2 };
    const out = resolveStyleColorFields(input);
    expect(input.color).toBe('var(--xc-test-fill)');
    expect(out).not.toBe(input);
  });
});

describe('resolveCssVarColor — SSR (no DOM)', () => {
  // The resolver's documented contract is "no DOM → input returned
  // unchanged". `vi.stubGlobal('document', undefined)` makes
  // `typeof document === 'undefined'` true, simulating a server render.
  // The explicit guard at the TOP of resolveCssVarColor must bail out
  // BEFORE the regex parse — otherwise a `var(--x, fallback)` input
  // would resolve to its fallback (readCssVar returns '' with no DOM),
  // which is NOT a passthrough. The client re-resolves on hydration.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a var(--token, #fallback) input UNCHANGED with no DOM', () => {
    vi.stubGlobal('document', undefined);
    // With a DOM this would resolve to '#ffffff' (the fallback). The
    // SSR guard makes it a true passthrough instead.
    expect(resolveCssVarColor('var(--brand, #ffffff)')).toBe('var(--brand, #ffffff)');
  });

  it('returns a plain var(--token) input UNCHANGED with no DOM', () => {
    vi.stubGlobal('document', undefined);
    expect(resolveCssVarColor('var(--xc-test-primary)')).toBe('var(--xc-test-primary)');
  });

  it('still passes hex / undefined through unchanged with no DOM', () => {
    vi.stubGlobal('document', undefined);
    expect(resolveCssVarColor('#3b82f6')).toBe('#3b82f6');
    expect(resolveCssVarColor(undefined)).toBeUndefined();
  });
});

describe('resolveTreeNodeColors', () => {
  afterEach(() => {
    clearRootVars(
      '--xc-test-primary',
      '--xc-test-accent',
      '--xc-test-border',
      '--xc-test-shadow',
      '--xc-test-bg',
    );
  });

  it('resolves itemStyle.color in a flat node list', () => {
    document.documentElement.style.setProperty('--xc-test-primary', '#1d4ed8');
    const out = resolveTreeNodeColors([
      { name: 'a', itemStyle: { color: 'var(--xc-test-primary)' } },
    ] as Array<{ name: string; itemStyle?: { color?: string; borderColor?: string } }>);
    expect(out?.[0].itemStyle?.color).toBe('#1d4ed8');
  });

  it('resolves itemStyle.borderColor (Sunburst index-signature path)', () => {
    document.documentElement.style.setProperty('--xc-test-border', '#22c55e');
    const out = resolveTreeNodeColors([
      { name: 'a', itemStyle: { borderColor: 'var(--xc-test-border)' } },
    ] as Array<{ name: string; itemStyle?: { color?: string; borderColor?: string } }>);
    expect(out?.[0].itemStyle?.borderColor).toBe('#22c55e');
  });

  it('resolves both color and borderColor on the same node', () => {
    document.documentElement.style.setProperty('--xc-test-primary', '#1d4ed8');
    document.documentElement.style.setProperty('--xc-test-border', '#22c55e');
    const out = resolveTreeNodeColors([
      {
        name: 'a',
        itemStyle: { color: 'var(--xc-test-primary)', borderColor: 'var(--xc-test-border)' },
      },
    ] as Array<{ name: string; itemStyle?: { color?: string; borderColor?: string } }>);
    expect(out?.[0].itemStyle).toEqual({ color: '#1d4ed8', borderColor: '#22c55e' });
  });

  it('recurses into children, resolving nested itemStyle colors', () => {
    document.documentElement.style.setProperty('--xc-test-accent', '#ec4899');
    const out = resolveTreeNodeColors([
      {
        name: 'root',
        children: [{ name: 'child', itemStyle: { color: 'var(--xc-test-accent)' } }],
      },
    ] as Array<{
      name: string;
      itemStyle?: { color?: string; borderColor?: string };
      children?: Array<{ name: string; itemStyle?: { color?: string; borderColor?: string } }>;
    }>);
    expect(out?.[0].children?.[0].itemStyle?.color).toBe('#ec4899');
  });

  it('resolves shadowColor / backgroundColor on a node and its child (all four fields)', () => {
    // SunburstNode.itemStyle has an open index signature, so a consumer can
    // pass shadowColor / backgroundColor on a data node — resolveTreeNodeColors
    // delegates each node's itemStyle to resolveStyleColorFields, which covers
    // all four color fields, not just color + borderColor.
    document.documentElement.style.setProperty('--xc-test-shadow', 'rgba(0,0,0,0.4)');
    document.documentElement.style.setProperty('--xc-test-bg', '#fffbeb');
    const out = resolveTreeNodeColors([
      {
        name: 'root',
        itemStyle: { shadowColor: 'var(--xc-test-shadow)' },
        children: [{ name: 'child', itemStyle: { backgroundColor: 'var(--xc-test-bg)' } }],
      },
    ] as Array<{
      name: string;
      itemStyle?: { color?: string; [key: string]: unknown };
      children?: Array<{ name: string; itemStyle?: { color?: string; [key: string]: unknown } }>;
    }>);
    expect(out?.[0].itemStyle?.shadowColor).toBe('rgba(0,0,0,0.4)');
    expect(out?.[0].children?.[0].itemStyle?.backgroundColor).toBe('#fffbeb');
  });

  it('leaves nodes without an itemStyle structurally intact (non-mutating clone)', () => {
    const input = [{ name: 'plain' }];
    const out = resolveTreeNodeColors(input);
    expect(out?.[0]).toEqual({ name: 'plain' });
    expect(out?.[0]).not.toBe(input[0]);
  });

  it('returns undefined when the input is undefined', () => {
    expect(resolveTreeNodeColors(undefined)).toBeUndefined();
  });
});
