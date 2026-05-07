// @vitest-environment jsdom
/**
 * RolesGrid responsive column visibility (PR #237 propagation).
 *
 * Asserts the declarative `ROLES_COLUMN_META` configuration matches
 * the column priority spelled out in the file header:
 *   - mobile (<sm):  name (essential)
 *   - tablet (md+):  + memberCount
 *
 * The `customColumnDefs` viewport gating (policies hideBelow:768,
 * lastModifiedAt hideBelow:1024, roleActions always) lives inside
 * the component and is wired through `useViewportWidth` —
 * rendered-grid testing for that path is intentionally out of
 * scope for this PR; the design-system already exercises the
 * underlying viewport contract via its own hook tests. This file
 * only fences the declarative-meta tier so future column
 * additions can't silently regress the mobile layout. Codex
 * iter-1 nit (thread 019e0329) prompted the wording correction —
 * there is no pre-existing RolesGrid integration suite.
 */
import { describe, expect, it } from 'vitest';
import { ROLES_COLUMN_META } from './RolesGrid.ui';

const byField = Object.fromEntries(ROLES_COLUMN_META.map((meta) => [meta.field, meta]));

describe('RolesGrid — responsive column tagging', () => {
  it('marks name as essential (visible on mobile)', () => {
    expect(byField.name?.essential).toBe(true);
  });

  it('hides memberCount below md (tablet+)', () => {
    expect(byField.memberCount?.responsive?.hideBelow).toBe('md');
  });

  it('keeps the original 2-column meta set intact', () => {
    const fields = ROLES_COLUMN_META.map((m) => m.field).sort();
    expect(fields).toEqual(['memberCount', 'name'].sort());
  });

  it('uses bold-text columnType for name', () => {
    expect(byField.name?.columnType).toBe('bold-text');
  });

  it('uses number columnType for memberCount', () => {
    expect(byField.memberCount?.columnType).toBe('number');
  });
});
