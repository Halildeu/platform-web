/**
 * resolveCssVarColor — CSS custom-property color resolution for the canvas renderer
 *
 * x-charts renders with the ECharts **canvas** renderer. A canvas 2D
 * `fillStyle` silently ignores CSS custom-property strings such as
 * `'var(--action-primary)'` — CSS variables resolve only in CSS/SVG, never
 * inside a canvas 2D context. When a consumer passes a `var(--…)` color
 * straight through to `itemStyle.color` (or an equivalent ECharts color
 * field), the series renders an undifferentiated dark fallback with NO
 * console error.
 *
 * This utility resolves consumer-supplied `var(--token[, fallback])` color
 * strings to their concrete computed value *before* the value reaches an
 * ECharts color field. Already-resolved values (hex / rgb / named colors)
 * and `effectivePalette` / `DEFAULT_*` palette constants pass through
 * untouched — those are never CSS-var strings.
 *
 * SSR-safe: with no DOM (`typeof document === 'undefined'`) or no
 * `getComputedStyle`, the input is returned unchanged so the
 * `@mfe/x-charts/ssr` subpath never crashes.
 *
 * Tree-shakeable: pure functions, no top-level side effects.
 */

/*
 * The base ESLint `no-redeclare` rule does not understand TypeScript
 * function-overload signatures and flags each overload as a redeclaration.
 * The repo's flat config enables the JS-recommended rule but not the
 * TS-aware `@typescript-eslint/no-redeclare`, so the overloads below
 * (deliberate — they give call sites precise `string -> string` vs
 * `string | undefined -> string | undefined` narrowing) are disabled here.
 */
/* eslint-disable no-redeclare */

/**
 * Matches a single CSS `var()` expression, capturing the token name and an
 * optional fallback. The fallback capture (`[\s\S]+?`) is *lazy*, but the
 * anchored final `\)$` still forces it to consume the entire fallback
 * expression — including a nested `var()` / `rgba()`. So for
 * `var(--a, var(--b, #fff))` group 2 is the whole `var(--b, #fff)`.
 */
const VAR_EXPRESSION = /^var\(\s*(--[^,)]+?)\s*(?:,\s*([\s\S]+?)\s*)?\)$/;

/**
 * Resolve a single CSS custom property by token name (e.g. `--action-primary`).
 * Returns the trimmed computed value, or an empty string when the token is
 * undefined or the DOM is unavailable.
 */
function readCssVar(token: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return '';
  }
  const root = document.documentElement;
  if (!root) return '';
  return getComputedStyle(root).getPropertyValue(token).trim();
}

/**
 * Resolve a consumer-supplied color string.
 *
 * - `var(--token)` → the computed value of `--token`. If the token resolves
 *   empty (undefined) and there is no fallback, the input is returned
 *   unchanged (passing a bare `var()` to canvas is already broken — but we
 *   do not invent a color).
 * - `var(--token, fallback)` → the token's computed value, or — when empty —
 *   the fallback. The fallback is itself resolved recursively, so it may be
 *   a nested `var()` or a literal color.
 * - Non-`var()` input (hex, rgb, hsl, named color) → returned unchanged.
 * - Non-string / empty / `undefined` input → returned unchanged.
 * - No DOM (SSR) → returned unchanged.
 *
 * @param color a consumer-supplied color string. `undefined` passes through
 *   as `undefined` so optional per-series `color?: string` fields can be
 *   normalized in a single call.
 */
export function resolveCssVarColor(color: string): string;
export function resolveCssVarColor(color: string | undefined): string | undefined;
export function resolveCssVarColor(color: string | undefined): string | undefined {
  if (typeof color !== 'string' || color.length === 0) {
    return color;
  }

  // SSR true-passthrough guard. Without a DOM, `readCssVar` can only ever
  // return `''`, so a `var(--token, fallback)` input would otherwise resolve
  // to its (recursively-resolved) fallback — NOT a passthrough, contradicting
  // the documented "no DOM → input returned unchanged" contract. Bailing out
  // *before* the regex parse keeps SSR a genuine no-op; the client re-runs
  // the resolver against a live DOM on hydration.
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return color;
  }

  const trimmed = color.trim();
  const match = VAR_EXPRESSION.exec(trimmed);
  if (!match) {
    // Not a var() expression — hex / rgb / named color. Pass through.
    return color;
  }

  const [, token, fallback] = match;
  const resolved = readCssVar(token);
  if (resolved.length > 0) {
    // The token may itself resolve to a `var()` chain in some token systems.
    return resolveCssVarColor(resolved);
  }

  if (fallback !== undefined) {
    // Recursively resolve the fallback — it can be a nested var() or literal.
    return resolveCssVarColor(fallback);
  }

  // Bare `var(--token)` with an undefined token and no fallback: nothing
  // useful to resolve to — return the original input unchanged.
  return color;
}

/**
 * List variant of {@link resolveCssVarColor}. Maps each entry through the
 * resolver. `undefined` input passes through as `undefined` so a wrapper can
 * normalize an optional `colors?: string[]` prop in a single call.
 *
 * @param colors an optional array of consumer-supplied color strings.
 */
export function resolveCssVarColors(colors: string[]): string[];
export function resolveCssVarColors(colors: string[] | undefined): string[] | undefined;
export function resolveCssVarColors(colors: string[] | undefined): string[] | undefined {
  if (colors === undefined) return undefined;
  return colors.map((c) => resolveCssVarColor(c));
}

/**
 * Resolve every CSS-var color field on a single ECharts style object
 * (`itemStyle` / `lineStyle` / `areaStyle` / `label` / `backgroundStyle`).
 *
 * ECharts style objects expose several named color fields — `color`,
 * `borderColor`, `backgroundColor`, `shadowColor` — any of which a
 * consumer can set to a `var(--token)` string the canvas renderer
 * silently ignores (drawing a dark fallback with no console error).
 * This helper passes each of those four fields through
 * {@link resolveCssVarColor} when it is present and string-typed; every
 * other field (numbers, nested objects, absent keys) is copied
 * verbatim.
 *
 * Used for the public color surfaces where the style object reaches an
 * ECharts color field with NO intermediate normalization — Sankey
 * `SankeyNode.itemStyle`, Sunburst `levels[].itemStyle` /
 * `levels[].label`, Globe `regions[].itemStyle`, and the
 * `useChartAnnotations` markPoint / markLine fragments. Those style
 * objects are typed loosely (`Record<string, unknown>` or a
 * `{ color?: string; [key: string]: unknown }` index signature) so a
 * consumer can pass `borderColor` / `shadowColor` etc. that the narrow
 * {@link resolveTreeNodeColors} contract does not cover.
 *
 * Non-mutating: a new object is always returned (the input style object
 * is never touched). `undefined` input passes through as `undefined` so
 * an optional `itemStyle?` field can be normalized in a single call.
 *
 * The return type is the input type `T`, so the resolved style object
 * drops straight back into its ECharts option slot without a cast.
 *
 * @param style a consumer-supplied ECharts style object, or `undefined`.
 */
export function resolveStyleColorFields<T extends Record<string, unknown>>(style: T): T;
export function resolveStyleColorFields<T extends Record<string, unknown> | undefined>(style: T): T;
export function resolveStyleColorFields<T extends Record<string, unknown> | undefined>(
  style: T,
): T {
  if (!style) return style;
  return {
    ...style,
    ...(typeof style.color === 'string' ? { color: resolveCssVarColor(style.color) } : {}),
    ...(typeof style.borderColor === 'string'
      ? { borderColor: resolveCssVarColor(style.borderColor) }
      : {}),
    ...(typeof style.backgroundColor === 'string'
      ? { backgroundColor: resolveCssVarColor(style.backgroundColor) }
      : {}),
    ...(typeof style.shadowColor === 'string'
      ? { shadowColor: resolveCssVarColor(style.shadowColor) }
      : {}),
  } as T;
}

/**
 * Minimal shape of a hierarchical chart node carrying optional per-node
 * `itemStyle.color` / `itemStyle.borderColor`. Tree / Treemap / Sunburst
 * wrappers share this contract. The constraint is intentionally narrow — only
 * the fields the resolver reads — and carries NO index signature, so a
 * concrete node type (e.g. `SunburstNode`, whose own `itemStyle` DOES have an
 * index signature) still satisfies `T extends TreeColorNode`.
 *
 * `borderColor` is included because `SunburstNode.itemStyle` is typed
 * `{ color?: string; [key: string]: unknown }` — its index signature lets a
 * consumer pass `itemStyle: { borderColor: 'var(--token)' }`, which would
 * otherwise reach the canvas un-normalized. `TreeNode` / `TreemapNode` only
 * expose `color`, so for those node types resolving `borderColor` is simply a
 * no-op (the `typeof === 'string'` guard skips an absent field).
 */
export interface TreeColorNode {
  itemStyle?: { color?: string; borderColor?: string };
  children?: readonly TreeColorNode[];
}

/**
 * Recursively resolve consumer-supplied `var(--token)` colors in a tree of
 * chart nodes. Each node's `itemStyle.color` and `itemStyle.borderColor` is
 * passed through {@link resolveCssVarColor}; children are walked depth-first.
 * Nodes that carry no resolvable color field are returned structurally
 * unchanged (a new object is still produced so the input tree is never
 * mutated).
 *
 * Used by tree-shaped wrappers (Tree / Treemap / Sunburst) where the consumer
 * color lives in nested `itemStyle` rather than a flat `colors` prop — the
 * canvas renderer cannot read CSS custom properties at any depth. `TreeNode` /
 * `TreemapNode` only expose `itemStyle.color`; `SunburstNode.itemStyle` has an
 * index signature so a consumer can also pass `borderColor` — both are
 * normalized here, and the `borderColor` branch is a harmless no-op for the
 * node types that never set it.
 *
 * The return type is the input node type `T`, so the resolved tree drops
 * straight back into an ECharts `series.data` slot without a cast.
 *
 * @param nodes the consumer tree node array (mapped non-mutatively).
 */
export function resolveTreeNodeColors<T extends TreeColorNode>(nodes: T[]): T[];
export function resolveTreeNodeColors<T extends TreeColorNode>(
  nodes: T[] | undefined,
): T[] | undefined;
export function resolveTreeNodeColors<T extends TreeColorNode>(
  nodes: T[] | undefined,
): T[] | undefined {
  if (nodes === undefined) return undefined;
  return nodes.map((node) => {
    const next: T = { ...node };
    const hasColor = node.itemStyle && typeof node.itemStyle.color === 'string';
    const hasBorderColor = node.itemStyle && typeof node.itemStyle.borderColor === 'string';
    if (hasColor || hasBorderColor) {
      next.itemStyle = {
        ...node.itemStyle,
        ...(hasColor ? { color: resolveCssVarColor(node.itemStyle!.color) } : {}),
        ...(hasBorderColor ? { borderColor: resolveCssVarColor(node.itemStyle!.borderColor) } : {}),
      };
    }
    if (Array.isArray(node.children)) {
      // The recursion preserves the concrete child node type via `T`'s
      // `children` member; the cast bridges the structural `TreeColorNode`
      // recursion result back to that concrete type.
      next.children = resolveTreeNodeColors(node.children as T[]) as T['children'];
    }
    return next;
  });
}
