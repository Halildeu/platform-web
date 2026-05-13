'use client';

/* ------------------------------------------------------------------ */
/*  @mfe/design-system/light — minimal entry for /login + /home shell  */
/*                                                                     */
/*  PERF-INIT-V2 PR-B1b: a slim subpath export that includes ONLY the  */
/*  primitives, tokens, theme, providers, and the `cn` utility. Heavy  */
/*  surfaces (components, patterns, advanced, icons, lib, a11y,        */
/*  performance) are intentionally NOT re-exported here.               */
/*                                                                     */
/*  Why:                                                                */
/*    The root `@mfe/design-system` barrel re-exports everything, so   */
/*    importing a single `Button` pulls the full tree into the chunk   */
/*    graph. Shell `/login` and `/home` widget consumers should switch */
/*    to `@mfe/design-system/light` to keep their initial bundle slim. */
/*                                                                     */
/*  Migration:                                                          */
/*    Before:  import { Button, Card, Badge } from '@mfe/design-system'*/
/*    After:   import { Button, Card, Badge } from '@mfe/design-system/light'
 *                                                                     */
/*  Audit guard (follow-up PR): an eslint-plugin-no-restricted-imports */
/*  rule will ban the root barrel for shell login/home modules so      */
/*  regressions surface at lint time.                                   */
/* ------------------------------------------------------------------ */

export { cn } from './utils';

export * from './tokens';
export * from './theme';
export * from './providers';
export * from './primitives';
