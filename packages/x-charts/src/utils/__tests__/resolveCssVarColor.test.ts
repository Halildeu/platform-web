// @vitest-environment jsdom
/**
 * resolveCssVarColor unit tests.
 *
 * The canvas renderer cannot read CSS custom properties — consumer-supplied
 * `var(--…)` colors must be resolved to a concrete value before they reach
 * an ECharts color field. These tests pin every branch of that resolution.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { resolveCssVarColor, resolveCssVarColors } from '../resolveCssVarColor';

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
