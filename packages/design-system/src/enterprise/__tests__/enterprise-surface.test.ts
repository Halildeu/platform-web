/**
 * Enterprise Surface Guard — Phase 5
 *
 * Phase 2/3/4 moved every domain-agnostic building block out of `enterprise/`;
 * Phase 5 removed the deprecated compat shims. The `enterprise/` barrel now
 * contains ONLY genuine domain-specific residents: FlowBuilder and FineKinney.
 *
 * This guard fails if:
 *  - a moved-component compat shim regresses back into the enterprise barrel
 *    (Object.keys would show more than the two residents), or
 *  - FlowBuilder / FineKinney stop being reachable from the canonical
 *    `@mfe/design-system` root barrel.
 */
import { describe, it, expect } from 'vitest';
import * as enterprise from '../index';
import * as root from '../../index';

describe('enterprise surface (Phase 5)', () => {
  it('the enterprise/ barrel exports only FlowBuilder and FineKinney', () => {
    // Types are erased at runtime; Object.keys yields the value exports only.
    expect(Object.keys(enterprise).sort()).toEqual(['FineKinney', 'FlowBuilder']);
  });

  it('FlowBuilder and FineKinney are reachable from the @mfe/design-system root barrel', () => {
    const r = root as Record<string, unknown>;
    expect(typeof r.FlowBuilder).toBe('function');
    expect(typeof r.FineKinney).toBe('function');
  });

  it('the root barrel re-exports the same residents as the enterprise barrel', () => {
    const r = root as Record<string, unknown>;
    const e = enterprise as Record<string, unknown>;
    expect(r.FlowBuilder).toBe(e.FlowBuilder);
    expect(r.FineKinney).toBe(e.FineKinney);
  });
});
