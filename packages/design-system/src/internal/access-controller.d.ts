import type React from 'react';
// Source-of-truth in @mfe/shared-types/access (Faz 21.4 PR-E1). Kept
// in sync with access-controller.ts re-exports.
export {
  type AccessLevel,
  type AccessControlledProps,
  type AccessResolution,
  resolveAccessState,
  shouldBlockInteraction,
} from '@mfe/shared-types';

import type { AccessControlledProps, AccessLevel } from '@mfe/shared-types';
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
export declare function accessStyles(access: AccessLevel): string;
/** @deprecated Use `accessStyles` instead. */
export declare const _accessStyles: typeof accessStyles;
/** @deprecated Use `AccessControlledProps` instead. */
export type _AccessControlledProps = AccessControlledProps;
export declare const withAccessGuard: <E extends React.SyntheticEvent = React.SyntheticEvent>(
  state: AccessLevel,
  handler?: ((event: E) => void | Promise<void>) | (() => void | Promise<void>),
  externallyDisabled?: boolean,
) => (event: E) => void;
