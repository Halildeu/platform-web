import type React from 'react';

// Source-of-truth for these primitives moved to `@mfe/shared-types/access`
// in Faz 21.4 PR-E1 so that packages forbidden from importing
// `@mfe/design-system` at runtime (notably `@mfe/x-charts` per CONTRACT
// v2.2 §9) can share the same vocabulary. DS continues to re-export
// the exact same surface — no consumer change required.
export {
  type AccessLevel,
  type AccessControlledProps,
  type AccessResolution,
  resolveAccessState,
  shouldBlockInteraction,
} from '@mfe/shared-types';

import type { AccessControlledProps, AccessLevel } from '@mfe/shared-types';
import { shouldBlockInteraction } from '@mfe/shared-types';

/**
 * Returns Tailwind utility class strings for a given access level.
 *
 * @example
 * ```tsx
 * <div className={cn("...", accessStyles(access))}>
 *   Content
 * </div>
 * ```
 */
export function accessStyles(access: AccessLevel): string {
  switch (access) {
    case 'disabled':
      return 'cursor-not-allowed opacity-50 pointer-events-none';
    case 'readonly':
      return 'cursor-default opacity-70';
    case 'hidden':
      return 'invisible';
    default:
      return '';
  }
}

/** @deprecated Use `accessStyles` instead. */
export const _accessStyles = accessStyles;

/** @deprecated Use `AccessControlledProps` instead. */
export type _AccessControlledProps = AccessControlledProps;

export const withAccessGuard = <E extends React.SyntheticEvent = React.SyntheticEvent>(
  state: AccessLevel,
  handler?: ((event: E) => void | Promise<void>) | (() => void | Promise<void>),
  externallyDisabled?: boolean,
) => {
  return (event: E) => {
    if (shouldBlockInteraction(state, externallyDisabled)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    (handler as ((event: E) => void | Promise<void>) | undefined)?.(event);
  };
};
