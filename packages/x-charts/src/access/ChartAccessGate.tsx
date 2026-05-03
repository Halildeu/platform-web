/**
 * Hook-order-safe outer access gate for chart wrappers.
 *
 * The 13 canonical chart wrappers each call multiple hooks
 * (`useChartTheme`, `useEChartsRenderer`, `useChartA11y`, ...) inside
 * their render body. Adding `if (state === 'hidden') return null;` to
 * those bodies would change the hook count between renders when a
 * consumer flips `access` from `'full'` to `'hidden'` at runtime,
 * violating React's Rules of Hooks.
 *
 * Resolution: outer gate component + inner chart split. Each chart's
 * public wrapper (`BarChart`, `LineChart`, ...) destructures `access`
 * + `accessReason` and renders `<ChartAccessGate>` around the inner
 * implementation (`BarChartInner`, ...). The gate decides DOM tree
 * BEFORE any chart hooks run, so transitioning between access states
 * never breaks hook ordering.
 *
 * Identity-transform invariant (CONTRACT v2.2 §1.1):
 * - `access === 'full'`              → render `{children}` directly (NO wrapper)
 * - `access === 'readonly'` no reason → render `{children}` directly
 * - `access === 'readonly'` w/ reason → minimal `<div title>` wrapper, NO CSS
 * - `access === 'disabled'`          → 2-layer wrapper:
 *     outer keeps `title` + `aria-disabled` so hover/SR works
 *     inner gets `opacity-50 pointer-events-none` so interaction blocks
 *   plus an optional `<ChartAriaLive>` re-announces the reason
 * - `access === 'hidden'`            → return `null`, layout collapses
 *
 * Default `access === undefined` collapses to `'full'` via
 * `resolveAccessState` and follows the zero-DOM path. This preserves
 * the pixel-perfect identity transform for existing consumers
 * (CONTRACT v2.2 §1.1, §9, PR-E1).
 */
import type { ReactNode } from 'react';
import { resolveAccessState } from '@mfe/shared-types';
import type { AccessControlledProps } from '@mfe/shared-types';

import { ChartAriaLive } from '../a11y/ChartAriaLive';
import { chartAccessClassName } from './chartAccessClassName';

export interface ChartAccessGateProps extends AccessControlledProps {
  children: ReactNode;
}

export function ChartAccessGate({
  access,
  accessReason,
  children,
}: ChartAccessGateProps): JSX.Element | null {
  const { state } = resolveAccessState(access);

  // hidden → null (collapse layout space)
  if (state === 'hidden') return null;

  // full → identity transform, NO wrapper DOM
  if (state === 'full') return <>{children}</>;

  // readonly → identity DOM unless we need a title hover
  if (state === 'readonly') {
    if (!accessReason) return <>{children}</>;
    return (
      <div data-access-state="readonly" title={accessReason}>
        {children}
      </div>
    );
  }

  // disabled → 2-layer wrapper. Outer keeps interaction surface for
  // `title` hover and a11y; inner blocks pointer-events, fades, AND
  // applies the HTML5 `inert` attribute so keyboard/focus interaction
  // is also blocked (PR-E2 must-fix #2). `inert` is a boolean global
  // attribute that removes the element + descendants from sequential
  // focus and from all user interaction (clicks, keyboard, hover).
  // Browser support: Chrome 102+, Firefox 112+, Safari 15.5+ — all
  // current platform targets.
  //
  // Note: we set `inert` via `inert=""` (empty string is the standard
  // boolean-attribute form). React's HTMLAttributes type accepts it.
  return (
    <div data-access-state="disabled" aria-disabled="true" title={accessReason}>
      <div className={chartAccessClassName('disabled')} inert={'' as never}>
        {children}
      </div>
      {accessReason ? <ChartAriaLive message={accessReason} /> : null}
    </div>
  );
}
