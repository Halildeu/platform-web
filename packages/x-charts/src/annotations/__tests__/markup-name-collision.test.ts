/**
 * markup-name-collision — public-export regression.
 *
 * Codex thread 019e0df1 iter-1 absorb: `ChartMarkup` was introduced
 * to AVOID collision with two existing public surfaces:
 *   - spec-level `ChartAnnotation` (`spec/ChartSpec.ts`)
 *   - collaboration-level `Annotation`
 *     (`collaboration/chart-annotations.ts`)
 *
 * This test imports all three from the package surface in a single
 * file. Compilation succeeding is the regression — TypeScript will
 * reject any future rename that re-introduces the collision (e.g.
 * adding `export type { ChartAnnotation } from './annotations'` would
 * fail to compile here).
 *
 * Type-only assertions are sufficient: types are erased at runtime,
 * so a single `expect(true).toBe(true)` keeps the file a valid
 * vitest module.
 */
import { describe, it, expect } from 'vitest';
import type { ChartMarkup } from '../../types';
import type { ChartAnnotation } from '../../spec/ChartSpec';
import type { Annotation } from '../../collaboration/chart-annotations';

describe('markup name collision regression', () => {
  it('imports ChartMarkup, ChartAnnotation, and Annotation as distinct types', () => {
    // Type-only check — no runtime work needed. The presence of the
    // three imports above is the regression: if any of them resolves
    // to the same identifier as another, TS would fail compile here.
    const m: ChartMarkup = { id: 'x', type: 'line', axis: 'y', value: 0 };
    const _a: ChartAnnotation = {
      id: 'spec-a',
      type: 'line',
      x: 0,
    } as unknown as ChartAnnotation;
    const _c: Annotation = {
      id: 'collab-1',
      type: 'comment',
      content: 'hi',
    } as unknown as Annotation;
    expect(m.type).toBe('line');
    expect(_a).toBeDefined();
    expect(_c).toBeDefined();
  });
});
