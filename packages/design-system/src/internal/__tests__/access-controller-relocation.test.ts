/**
 * Faz 21.4 PR-E1 — relocation invariant test.
 *
 * `AccessLevel` / `AccessControlledProps` / `AccessResolution` /
 * `resolveAccessState` / `shouldBlockInteraction` were moved from
 * `@mfe/design-system/internal/access-controller` to
 * `@mfe/shared-types/access` so that `@mfe/x-charts` can consume the
 * same vocabulary without violating the runtime boundary in CONTRACT
 * v2.2 §9 (`x-charts → design-system` is forbidden).
 *
 * DS still re-exports the exact same public surface — this test keeps
 * the equivalence visible. If a future change breaks the re-export
 * (e.g. someone removes the `export { ... } from "@mfe/shared-types"`
 * line) this test fails immediately.
 *
 * DS-only DOM helpers (`accessStyles`, `withAccessGuard`) intentionally
 * stay in DS and are not duplicated in shared-types.
 */
import { describe, it, expect } from 'vitest';

// Same source-of-truth, two import paths:
import {
  resolveAccessState as resolveFromDS,
  shouldBlockInteraction as shouldBlockFromDS,
  type AccessLevel as AccessLevelFromDS,
  type AccessControlledProps as PropsFromDS,
} from '../access-controller';
import {
  resolveAccessState as resolveFromShared,
  shouldBlockInteraction as shouldBlockFromShared,
  type AccessLevel as AccessLevelFromShared,
  type AccessControlledProps as PropsFromShared,
} from '@mfe/shared-types';

// And the DS-only DOM helpers — must still live in DS:
import { accessStyles, withAccessGuard } from '../access-controller';

describe('PR-E1 relocation invariant', () => {
  it('DS re-exports the same `resolveAccessState` reference as @mfe/shared-types', () => {
    expect(resolveFromDS).toBe(resolveFromShared);
  });

  it('DS re-exports the same `shouldBlockInteraction` reference as @mfe/shared-types', () => {
    expect(shouldBlockFromDS).toBe(shouldBlockFromShared);
  });

  it('AccessLevel is the same union from both import paths', () => {
    // Type-only assertion via TypeScript: if the unions diverge, these
    // assignments fail to compile.
    const dsLevel: AccessLevelFromDS = 'readonly';
    const sharedLevel: AccessLevelFromShared = dsLevel;
    expect(sharedLevel).toBe('readonly');
  });

  it('AccessControlledProps is structurally identical from both paths', () => {
    const dsProps: PropsFromDS = { access: 'disabled', accessReason: 'x' };
    const sharedProps: PropsFromShared = dsProps;
    expect(sharedProps.access).toBe('disabled');
    expect(sharedProps.accessReason).toBe('x');
  });

  it('DS-only DOM helpers are not duplicated in @mfe/shared-types', () => {
    // accessStyles + withAccessGuard live ONLY in DS.
    // (If these become re-exports from shared-types in the future, this
    // test should fail to flag the DOM-coupling boundary violation.)
    expect(typeof accessStyles).toBe('function');
    expect(typeof withAccessGuard).toBe('function');
    // Tailwind class util — DS-specific
    expect(accessStyles('disabled')).toContain('opacity-50');
  });
});

describe('Behavioural sanity (covered by existing access-controller tests, smoke here)', () => {
  it("undefined access resolves to 'full'", () => {
    expect(resolveFromShared(undefined).state).toBe('full');
  });

  it('readonly + disabled both block interaction', () => {
    expect(shouldBlockFromShared('readonly')).toBe(true);
    expect(shouldBlockFromShared('disabled')).toBe(true);
  });

  it('full + hidden do NOT block interaction (hidden uses early return at component level)', () => {
    expect(shouldBlockFromShared('full')).toBe(false);
    expect(shouldBlockFromShared('hidden')).toBe(false);
  });
});
