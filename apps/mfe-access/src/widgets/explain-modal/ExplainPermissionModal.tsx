/**
 * Backward-compat re-export. P1.9 moved the implementation to `@mfe/auth` so
 * both mfe-access (RoleDrawer per-permission "Why?" buttons) and mfe-shell
 * (UnauthorizedPage "Why can't I access?" — AC-0320 Senaryo 4) can share the
 * same modal, including the scope picker, without duplicating logic.
 *
 * Faz 21.8 PR-X8 — import path changed from `@mfe/auth` (root) to
 * `@mfe/auth/ui` to break the auth ↔ design-system circular cycle in MF
 * loadShare chunks. See `packages/auth/src/index.ts` for full root cause.
 *
 * New code should import directly from `@mfe/auth/ui`.
 */
export { ExplainPermissionModal, ExplainPermissionModal as default } from '@mfe/auth/ui';
export type { ExplainPermissionModalProps } from '@mfe/auth/ui';
