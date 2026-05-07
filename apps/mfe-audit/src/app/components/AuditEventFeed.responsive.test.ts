// @vitest-environment jsdom
/**
 * AuditEventFeed responsive column visibility (PR #237 propagation).
 *
 * Asserts the declarative `auditColumnMeta` configuration matches the
 * column priority spelled out in the file header:
 *   - mobile (<sm):  timestamp + userEmail + action (essential)
 *   - tablet (md+):  + service
 *   - desktop (lg+): + level + correlationId
 *
 * The actual viewport observation lives inside
 * `useResponsiveColumnDefs` (covered by its own tests in
 * `packages/design-system/src/advanced/data-grid/__tests__`); this
 * suite only fences the audit-specific tagging so future edits to the
 * column list don't silently regress the mobile layout.
 */
import { describe, expect, it } from 'vitest';
import { auditColumnMeta } from './AuditEventFeed';

const byField = Object.fromEntries(auditColumnMeta.map((meta) => [meta.field, meta]));

describe('AuditEventFeed — responsive column tagging', () => {
  it('marks timestamp, userEmail, and action as essential (visible on mobile)', () => {
    expect(byField.timestamp?.essential).toBe(true);
    expect(byField.userEmail?.essential).toBe(true);
    // `action` was promoted to essential after Codex review on PR
    // #292 (thread 019e0317) — without it the mobile feed loses
    // the "what happened" column that audit triage hangs on.
    expect(byField.action?.essential).toBe(true);
  });

  it('hides service below md (tablet+)', () => {
    expect(byField.service?.responsive?.hideBelow).toBe('md');
  });

  it('hides level and correlationId below lg (desktop+)', () => {
    expect(byField.level?.responsive?.hideBelow).toBe('lg');
    expect(byField.correlationId?.responsive?.hideBelow).toBe('lg');
  });

  it('keeps the original 6-column set intact', () => {
    const fields = auditColumnMeta.map((m) => m.field).sort();
    expect(fields).toEqual(
      ['action', 'correlationId', 'level', 'service', 'timestamp', 'userEmail'].sort(),
    );
  });

  it('uses the date columnType with datetime format for timestamp', () => {
    const ts = byField.timestamp;
    expect(ts?.columnType).toBe('date');
    if (ts?.columnType === 'date') {
      expect(ts.format).toBe('datetime');
    }
  });
});
