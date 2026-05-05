/**
 * CSSOM Harness API
 * -----------------
 * Token-aware, theme-aware matchers for *.cssom.test files. These run in
 * the Vitest browser provider (Chromium) where resolved CSS variables and
 * real cascade are available.
 *
 * Do NOT import this from *.unit.test or *.contract.test files; the lint
 * rule `test-environment/no-cssom-in-jsdom-tests` will warn. jsdom does
 * not resolve CSS variables, and mocked values defeat the purpose of
 * these matchers.
 *
 * See `docs/architecture/frontend/adr-test-environment-strategy.md` §L3.
 */

export type CssVarName = `--${string}`;

export interface ExpectTokenOptions {
  /**
   * If set, normalizes color values to a canonical form before comparing.
   * Useful when Chromium reports `rgb(0, 0, 0)` while the token source
   * declares `#000`. Default: 'auto' (normalizes when the property looks
   * color-typed).
   */
  normalize?: 'auto' | 'color' | 'none';
  /**
   * Allow the resolved value to be empty when the token is intentionally
   * unset for the active theme (e.g. a token only defined under
   * `data-theme=dark`). Default: false.
   */
  allowEmpty?: boolean;
}

const isColorProperty = (prop: string): boolean =>
  /color$|background|border-color|outline-color|fill|stroke/i.test(prop);

const normalizeColor = (value: string): string => {
  // Chromium reports `rgb(R, G, B)` and `rgba(R, G, B, A)`. Strip whitespace
  // and lowercase to make comparison forgiving without parsing.
  return value.replace(/\s+/g, '').toLowerCase();
};

const normalize = (prop: string, value: string, mode: ExpectTokenOptions['normalize']): string => {
  if (mode === 'none') return value;
  if (mode === 'color' || (mode === 'auto' && isColorProperty(prop))) {
    return normalizeColor(value);
  }
  return value.trim();
};

const camelToKebab = (prop: string): string => prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const resolveCssVar = (name: CssVarName): string => {
  const root = document.documentElement;
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  return v;
};

/**
 * Resolves the CSS variable for the given token name and asserts that the
 * element's computed style for the property matches it.
 *
 * Implementation note: instead of comparing the raw token string to the
 * resolved style (which fails because Chromium normalizes `oklch(21.01% ... deg)`
 * to `oklch(0.2101 ... )`, percentage→fraction and stripping `deg`), we
 * stamp the token value into a sibling reference element's inline style
 * and compare the two computed values. Chromium normalizes both the
 * same way, so format drift is no longer a source of false negatives.
 *
 * @example
 *   expectToken(button, 'backgroundColor', 'action-primary');
 */
export function expectToken(
  el: Element,
  property: keyof CSSStyleDeclaration | string,
  tokenName: string,
  options: ExpectTokenOptions = {},
): void {
  const { normalize: mode = 'auto', allowEmpty = false } = options;
  const cssProp = camelToKebab(String(property));
  const tokenVar = `--${tokenName}` as CssVarName;
  const rawTokenValue = resolveCssVar(tokenVar);

  if (!rawTokenValue) {
    if (allowEmpty) return;
    throw new Error(
      `expectToken: CSS variable ${tokenVar} resolved to empty string on :root. ` +
        `Either the token is undefined for the active theme or Tailwind layer build did not load. ` +
        `Run the Tailwind layer sentinel test to diagnose.`,
    );
  }

  // Stamp the token value onto a reference node and let Chromium normalize
  // both `el` and the reference identically.
  const ref = document.createElement('div');
  ref.style.setProperty(cssProp, `var(${tokenVar})`);
  ref.style.position = 'absolute';
  ref.style.visibility = 'hidden';
  ref.style.pointerEvents = 'none';
  document.body.appendChild(ref);
  try {
    const computed = getComputedStyle(el).getPropertyValue(cssProp);
    const refComputed = getComputedStyle(ref).getPropertyValue(cssProp);

    const got = normalize(cssProp, computed, mode);
    const want = normalize(cssProp, refComputed, mode);

    if (got !== want) {
      throw new Error(
        `expectToken: ${cssProp} on element does not match token ${tokenVar}.\n` +
          `  expected (token resolved by Chromium): ${want}\n` +
          `  received (computed style on element):  ${got}\n` +
          `  raw token value at :root: ${rawTokenValue}`,
      );
    }
  } finally {
    ref.remove();
  }
}

export type ThemeName = 'light' | 'dark' | string;

/**
 * Toggles `data-mode` on `documentElement`, runs the callback, and
 * restores the previous mode. The callback may be sync or async.
 *
 * `data-mode` is the repo-wide attribute that drives the Tailwind 4
 * `@custom-variant dark` declared in `apps/mfe-shell/src/index.css`. It
 * is NOT `data-theme` — the older convention is not used here.
 *
 * The harness reads the previous attribute value from the document, so
 * nesting works for matrix tests that switch theme multiple times in one
 * render.
 */
export async function withTheme<T>(theme: ThemeName, fn: () => T | Promise<T>): Promise<T> {
  const root = document.documentElement;
  const previous = root.getAttribute('data-mode');
  root.setAttribute('data-mode', theme);
  try {
    return await fn();
  } finally {
    if (previous === null) {
      root.removeAttribute('data-mode');
    } else {
      root.setAttribute('data-mode', previous);
    }
  }
}

/**
 * Asserts that the element exposes a non-empty focus indicator after the
 * `:focus-visible` style applies. Reads either `box-shadow` or `outline`;
 * different design system primitives use different ring strategies.
 *
 * Caller must have already focused the element (e.g. via user-event
 * keyboard tab) before invoking. The assertion runs against the current
 * computed style, not a snapshot.
 */
export function expectFocusRing(el: Element): void {
  const style = getComputedStyle(el);
  const boxShadow = style.boxShadow;
  const outlineStyle = style.outlineStyle;
  const outlineWidth = style.outlineWidth;

  const hasBoxShadow = boxShadow && boxShadow !== 'none';
  const hasOutline =
    outlineStyle && outlineStyle !== 'none' && outlineWidth && outlineWidth !== '0px';

  if (!hasBoxShadow && !hasOutline) {
    throw new Error(
      `expectFocusRing: no visible focus indicator on element.\n` +
        `  box-shadow:     ${boxShadow}\n` +
        `  outline-style:  ${outlineStyle}\n` +
        `  outline-width:  ${outlineWidth}\n` +
        `Did the element receive focus before the assertion?`,
    );
  }
}

/**
 * Diagnostic-only: returns the resolved value of a CSS variable on the
 * document root. Useful for debugging matchers; not for assertion.
 */
export function getResolvedToken(tokenName: string): string {
  return resolveCssVar(`--${tokenName}` as CssVarName);
}
