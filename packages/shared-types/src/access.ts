/**
 * Cross-package access-control vocabulary.
 *
 * Migrated from `@mfe/design-system/internal/access-controller` (Faz 21.4
 * PR-E1 contract-debt closure). Hosting these in `@mfe/shared-types`
 * keeps the surface available to packages that cannot import the design
 * system at runtime — notably `@mfe/x-charts`, where CONTRACT v2.2 §9
 * forbids the dependency edge `x-charts → design-system`.
 *
 * Event-agnostic primitives only. The DOM-specific helper
 * `withAccessGuard(state, handler)` (which calls `event.preventDefault()`
 * + `event.stopPropagation()` on a `React.SyntheticEvent`) stays in
 * `@mfe/design-system` because it depends on React. Tailwind class
 * utility `accessStyles()` also stays in DS — packages that need
 * a class string compute their own minimal helper.
 */

/**
 * Four-state access ladder shared across all UI surfaces in the
 * platform. Aligned with the Zanzibar permission ladder produced by
 * `@mfe/auth/useZanzibarAccess`:
 *
 * | Level     | UI behaviour                                                          |
 * | --------- | --------------------------------------------------------------------- |
 * | `full`    | Default. All interactivity enabled, identity transform.               |
 * | `readonly`| Visible, non-interactive. Click/brush/zoom/edit no-op.                |
 * | `disabled`| Visible, faded, non-interactive. Optional `accessReason` is exposed.  |
 * | `hidden`  | Component returns `null`. Layout space collapses.                     |
 */
export type AccessLevel = 'full' | 'readonly' | 'disabled' | 'hidden';

/**
 * Opt-in props every access-controlled component accepts. Defaulting
 * `access` to `'full'` (or `undefined`) MUST be the identity transform —
 * existing consumers see pixel-perfect identical output.
 */
export type AccessControlledProps = {
  access?: AccessLevel;
  accessReason?: string;
};

/**
 * Resolved state with cheap boolean discriminators. The boolean fields
 * are convenience shorthand only; the canonical source of truth is
 * `state`.
 */
export type AccessResolution = {
  state: AccessLevel;
  isHidden: boolean;
  isReadonly: boolean;
  isDisabled: boolean;
};

/**
 * Resolve a raw `access` prop into a structured resolution. `undefined`
 * collapses to `'full'` so consumers can pass `props.access` directly
 * without a fallback expression.
 */
export const resolveAccessState = (access?: AccessLevel): AccessResolution => {
  const state: AccessLevel = access ?? 'full';
  return {
    state,
    isHidden: state === 'hidden',
    isReadonly: state === 'readonly',
    isDisabled: state === 'disabled',
  };
};

/**
 * Pure predicate — `true` when interactivity should be suppressed.
 * Caller decides what "suppress" means (skip handler, return undefined,
 * call `preventDefault`, etc.); this helper does not depend on the DOM.
 */
export const shouldBlockInteraction = (
  state: AccessLevel,
  externallyDisabled?: boolean,
): boolean => {
  if (externallyDisabled) {
    return true;
  }
  return state === 'readonly' || state === 'disabled';
};
