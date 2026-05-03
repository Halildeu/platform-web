/**
 * Local className helper for chart-level access state.
 *
 * Mirror of the design-system `accessStyles` Tailwind helper, scoped to
 * chart-specific styling rules. We keep this local instead of importing
 * from the design-system package because CONTRACT v2.2 §9 forbids the
 * runtime dependency edge from `@mfe/x-charts` into the DS package
 * (the contract enforces this via a literal repository grep — see §9).
 *
 * Style choices (Codex iter-2 PR-E2 plan AGREE):
 * - `disabled` → `opacity-50 pointer-events-none` (visible-but-faded,
 *   interaction blocked; pointer-events on the INNER wrapper so the
 *   outer wrapper can still receive `title` hover for the access reason)
 * - `readonly` → `''` (NO opacity reduction — readonly content must be
 *   readable; interaction blocking is handled by `guardChartCallback`)
 * - `full` / `hidden` → `''` (full = identity transform, hidden = null
 *   at the gate level so this helper is not invoked)
 */
import type { AccessLevel } from '@mfe/shared-types';

export function chartAccessClassName(state: AccessLevel): string {
  if (state === 'disabled') return 'opacity-50 pointer-events-none';
  return '';
}
