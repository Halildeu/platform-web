/**
 * PR-D1b.B.3 (Codex thread 019e8074 step 6, 2026-06-01) — pure decision
 * helper for the ReportPage cold-cache rehydration effect.
 *
 * Extracted as a pure function so the decision matrix can be unit-tested
 * without spinning up the full ReportPage component (AG Grid + shell-
 * services + i18n + ~1350 lines of co-dependencies).
 *
 * <p>The matrix:
 *
 * |# | hasMetadataDrivenFilters | getFilterDefinitions   | isInitialState | definitions  | sameAsLast | rehydrate |
 * |--|--------------------------|------------------------|----------------|--------------|------------|-----------|
 * |1 | false / undefined        | any                    | any            | any          | any        | no        |
 * |2 | true                     | undefined              | any            | -            | -          | no        |
 * |3 | true                     | fn → undefined         | any            | undefined    | -          | no        |
 * |4 | true                     | fn → defs              | false (edited) | defs         | any        | no        |
 * |5 | true                     | fn → defs              | true           | defs         | true       | no        |
 * |6 | true                     | fn → defs              | true           | defs         | false      | YES       |
 */

import type { FilterDefinition } from '../../modules/dynamic-report/types';
import type { ReportModule } from '../../modules/types';

export type RehydrationDecision =
  | { rehydrate: false; reason: string }
  | { rehydrate: true; definitions: FilterDefinition[] };

/**
 * Decide whether the post-metadata-resolve rehydration effect should
 * re-run `createInitialFilters` for the given module.
 *
 * @param module                         The active report module.
 * @param isInitialState                 `true` iff the user has NOT
 *                                        edited any filter widget since
 *                                        mount (tracked via the
 *                                        `setFieldValue` wrapper ref).
 * @param lastRehydratedDefinitions      The definition array reference
 *                                        captured at the previous
 *                                        rehydration (or `undefined` on
 *                                        first pass). Used to short-
 *                                        circuit repeat resolves that
 *                                        return the same cached array.
 */
export function decideRehydration<TFilters extends Record<string, unknown>, TRow>(
  module: ReportModule<TFilters, TRow>,
  isInitialState: boolean,
  lastRehydratedDefinitions: unknown,
): RehydrationDecision {
  if (module.hasMetadataDrivenFilters !== true) {
    return { rehydrate: false, reason: 'hasMetadataDrivenFilters is not true' };
  }
  if (typeof module.getFilterDefinitions !== 'function') {
    return { rehydrate: false, reason: 'getFilterDefinitions is not a function' };
  }
  if (!isInitialState) {
    return { rehydrate: false, reason: 'user has edited filters since mount' };
  }
  const definitions = module.getFilterDefinitions();
  if (!definitions) {
    return { rehydrate: false, reason: 'getFilterDefinitions returned undefined' };
  }
  if (definitions === lastRehydratedDefinitions) {
    return { rehydrate: false, reason: 'definitions reference unchanged since last rehydration' };
  }
  return { rehydrate: true, definitions };
}
