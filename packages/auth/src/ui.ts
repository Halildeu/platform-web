/**
 * @mfe/auth/ui — UI surface that depends on `@mfe/design-system`.
 *
 * Faz 21.8 PR-X8 — separated from the root barrel to break the
 * `@mfe/auth` ↔ `@mfe/design-system` circular dependency in MF
 * `loadShare` chunks. The root `@mfe/auth` package is the MF-shared
 * singleton (containing PermissionProvider + hooks + types). When the
 * root barrel re-exported `ExplainPermissionModal`, every consumer
 * pulled the modal's static `@mfe/design-system` import into the auth
 * bundle, creating a generated cycle:
 *
 *   auth loadShare → auth root bundle → design-system loadShare
 *                                        → auth loadShare (back-edge)
 *
 * The cycle silently deadlocked `hostAutoInit()` after the MF plugin
 * 1.14.2 → 1.15.1 upgrade (PR-X7). See PR #182.
 *
 * Consumers that need the modal import it from this subpath instead of
 * the root, keeping the auth shared singleton free of design-system.
 */

export { ExplainPermissionModal } from './ExplainPermissionModal';
export type { ExplainPermissionModalProps } from './ExplainPermissionModal';
