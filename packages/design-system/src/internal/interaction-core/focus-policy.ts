/* ------------------------------------------------------------------ */
/*  Focus Policy — Centralized focus ring management                   */
/*                                                                     */
/*  Provides consistent focus ring styling and focus management         */
/*  policies across all interactive components.                         */
/*                                                                     */
/*  Faz 1.2 — Focus Policy                                             */
/* ------------------------------------------------------------------ */

/* ---- Focus Strategy ---- */

/**
 * Focus strategy determines how a component handles focus visibility.
 *
 * - "ring" — Standard focus ring (default for buttons, inputs)
 * - "outline" — Thin outline (for compact controls)
 * - "inset" — Inset focus indicator (for filled components)
 * - "none" — No visible focus (only for non-interactive decorative elements)
 */
export type FocusStrategy = 'ring' | 'outline' | 'inset' | 'none';

/* ---- Focus Ring Class Generators ---- */

const FOCUS_RING_CLASSES: Record<FocusStrategy, string> = {
  ring: [
    'focus-visible:outline-hidden',
    'focus-visible:ring-2',
    'focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_30%,transparent)]',
    'focus-visible:ring-offset-2',
  ].join(' '),

  outline: [
    'focus-visible:outline-hidden',
    'focus-visible:ring-1',
    'focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_50%,transparent)]',
    'focus-visible:ring-offset-1',
  ].join(' '),

  inset: [
    'focus-visible:outline-hidden',
    'focus-visible:ring-2',
    'focus-visible:ring-inset',
    'focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_40%,transparent)]',
  ].join(' '),

  none: 'focus-visible:outline-hidden',
};

/**
 * Returns the appropriate Tailwind focus ring classes for a given strategy.
 *
 * @example
 * ```tsx
 * <button className={cn("...", focusRingClass("ring"))}>
 *   Click me
 * </button>
 * ```
 */
export function focusRingClass(strategy: FocusStrategy = 'ring'): string {
  return FOCUS_RING_CLASSES[strategy];
}

/**
 * Returns focus ring classes with a custom color override.
 *
 * @example
 * ```tsx
 * <button className={cn("...", focusRingClassWithColor("ring", "var(--state-error-text)"))}>
 *   Delete
 * </button>
 * ```
 */
export function focusRingClassWithColor(strategy: FocusStrategy, color: string): string {
  if (strategy === 'none') return 'focus-visible:outline-hidden';

  const ringWidth = strategy === 'outline' ? '1' : '2';
  const offset = strategy === 'outline' ? '1' : strategy === 'inset' ? '' : '2';
  const inset = strategy === 'inset' ? 'focus-visible:ring-inset' : '';
  const opacity = strategy === 'outline' ? '50' : strategy === 'inset' ? '40' : '30';

  return [
    'focus-visible:outline-hidden',
    `focus-visible:ring-${ringWidth}`,
    inset,
    `focus-visible:ring-[color-mix(in_oklab,${color}_${opacity}%,transparent)]`,
    offset ? `focus-visible:ring-offset-${offset}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Lookup table for `has-[:focus-visible]:` ring variants. Literal class
 * strings (not template-built) so Tailwind's content scanner can detect
 * them — template-literal-built strings like `\`...:ring-${n}\`` are
 * tokenized as fragments and never compiled into the CSS output.
 */
const HAS_FOCUS_VISIBLE_RING_CLASSES: Record<FocusStrategy, string> = {
  ring: [
    'has-[:focus-visible]:outline-hidden',
    'has-[:focus-visible]:ring-2',
    'has-[:focus-visible]:ring-[color-mix(in_oklab,var(--focus-ring)_30%,transparent)]',
    'has-[:focus-visible]:ring-offset-2',
  ].join(' '),

  outline: [
    'has-[:focus-visible]:outline-hidden',
    'has-[:focus-visible]:ring-1',
    'has-[:focus-visible]:ring-[color-mix(in_oklab,var(--focus-ring)_50%,transparent)]',
    'has-[:focus-visible]:ring-offset-1',
  ].join(' '),

  inset: [
    'has-[:focus-visible]:outline-hidden',
    'has-[:focus-visible]:ring-2',
    'has-[:focus-visible]:ring-inset',
    'has-[:focus-visible]:ring-[color-mix(in_oklab,var(--focus-ring)_40%,transparent)]',
  ].join(' '),

  none: 'has-[:focus-visible]:outline-hidden',
};

/**
 * Lookup table for `peer-focus-visible:` ring variants. Same literal-
 * string pattern as above for Tailwind content scanner compatibility.
 */
const PEER_FOCUS_VISIBLE_RING_CLASSES: Record<FocusStrategy, string> = {
  ring: [
    'peer-focus-visible:outline-hidden',
    'peer-focus-visible:ring-2',
    'peer-focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_30%,transparent)]',
    'peer-focus-visible:ring-offset-2',
  ].join(' '),

  outline: [
    'peer-focus-visible:outline-hidden',
    'peer-focus-visible:ring-1',
    'peer-focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_50%,transparent)]',
    'peer-focus-visible:ring-offset-1',
  ].join(' '),

  inset: [
    'peer-focus-visible:outline-hidden',
    'peer-focus-visible:ring-2',
    'peer-focus-visible:ring-inset',
    'peer-focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_40%,transparent)]',
  ].join(' '),

  none: 'peer-focus-visible:outline-hidden',
};

/**
 * `:has(:focus-visible)` variant of {@link focusRingClass}. The ring
 * renders on the element when ANY descendant matches `:focus-visible`.
 * Used when the visible touch target is a wrapper (e.g. `<label>`
 * containing an `sr-only` input — Switch, Toggle).
 *
 * Why not `focus-within:`? `:focus-within` matches when ANY descendant
 * has focus (including mouse-induced focus). `:has(:focus-visible)`
 * matches only when a descendant is in the keyboard-focus visible
 * state — which is what users actually want for an accessibility
 * indicator. Mouse clicks on a checkbox/switch label do NOT trigger
 * `:focus-visible` on the inner input (Chrome heuristic), so this
 * rule correctly stays off for mouse interaction and lights up for
 * keyboard navigation.
 *
 * @example
 * ```tsx
 * // Switch: visible target is <label>, focus goes to sr-only <input>.
 * <label className={cn("...", hasFocusVisibleRingClass("ring"))}>
 *   <input className="sr-only" />
 *   <span>track</span>
 * </label>
 * ```
 */
export function hasFocusVisibleRingClass(strategy: FocusStrategy = 'ring'): string {
  return HAS_FOCUS_VISIBLE_RING_CLASSES[strategy];
}

/**
 * `peer-focus-visible:` variant of {@link focusRingClass}. The ring
 * renders on the element when its immediate previous sibling
 * (marked `peer`) has focus-visible. Used for the sr-only input +
 * visual proxy pattern (Checkbox, Radio).
 *
 * Required HTML shape:
 * ```tsx
 * <input className="peer sr-only" />
 * <span className={peerFocusVisibleRingClass("ring")}>{visual}</span>
 * ```
 *
 * Tailwind's `peer` variant requires the input to be a *previous*
 * sibling of the element with `peer-*:` classes; if you reorder them
 * the ring won't fire. The `peer` class on the input is mandatory.
 */
export function peerFocusVisibleRingClass(strategy: FocusStrategy = 'ring'): string {
  return PEER_FOCUS_VISIBLE_RING_CLASSES[strategy];
}

/* ---- Focus Management Utilities ---- */

/**
 * Determines the recommended focus strategy for a component type.
 */
export function defaultFocusStrategy(
  componentType: 'button' | 'input' | 'toggle' | 'link' | 'card' | 'tab' | 'menu-item',
): FocusStrategy {
  switch (componentType) {
    case 'button':
    case 'input':
    case 'toggle':
      return 'ring';
    case 'link':
    case 'tab':
    case 'menu-item':
      return 'outline';
    case 'card':
      return 'ring';
    default:
      return 'ring';
  }
}

/**
 * Focus trap sentinel value. Components that implement focus trapping
 * should use this to mark the component as a focus boundary.
 */
export const FOCUS_TRAP_ATTR = 'data-focus-trap' as const;

/**
 * Returns true if the current interaction mode is keyboard-driven.
 * Uses the :focus-visible heuristic.
 */
export function isKeyboardInteraction(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(':focus-visible') !== null;
}
