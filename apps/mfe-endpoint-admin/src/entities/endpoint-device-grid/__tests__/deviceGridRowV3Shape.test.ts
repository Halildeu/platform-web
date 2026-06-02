import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DeviceGridRow } from '../types';

/**
 * WEB-015 v2-a (Codex 019e87aa AGREE) — contract pin for the v3 row shape.
 *
 * <p>The backend `DeviceGridColumns` registry was bumped to SCHEMA_VERSION = 3
 * with 5 new colIds appended to raw-export order:
 * <ul>
 *   <li>prohibited_status (NO_EVALUATION | OK)</li>
 *   <li>prohibited_decision (COMPLIANT | NON_COMPLIANT | UNAUTHORIZED | UNKNOWN | null)</li>
 *   <li>prohibited_findings_count (number | null; <strong>0 !== null</strong>)</li>
 *   <li>app_control_wdac_mode (OFF | AUDIT | ENFORCE | UNKNOWN | null)</li>
 *   <li>app_control_app_id_svc_state (RUNNING | STOPPED | DISABLED | UNKNOWN | null)</li>
 * </ul>
 *
 * The TS row interface must accept these 5 keys without complaint, AND must
 * keep them OPTIONAL-VALUE-NULL (LEFT JOIN on no-snapshot supplies SQL NULL,
 * NOT a synthetic UNKNOWN — Codex 019e87aa guardrail #3).
 */
describe('DeviceGridRow v3 shape (WEB-015 v2-a)', () => {
  // Codex 019e87aa iter-2 P2 must_fix: the row interface has an index
  // signature `[key: string]: unknown`, so deleting an explicit v3 field
  // would silently degrade its type to `unknown` and the value-level
  // assignments below would still compile. Pin the EXACT property types
  // here so an accidental removal fails compilation immediately.
  it('pins the exact property types of every v3 field (defeats index-signature drift)', () => {
    expectTypeOf<DeviceGridRow['prohibited_status']>().toEqualTypeOf<string | null>();
    expectTypeOf<DeviceGridRow['prohibited_decision']>().toEqualTypeOf<string | null>();
    expectTypeOf<DeviceGridRow['prohibited_findings_count']>().toEqualTypeOf<number | null>();
    expectTypeOf<DeviceGridRow['app_control_wdac_mode']>().toEqualTypeOf<string | null>();
    expectTypeOf<DeviceGridRow['app_control_app_id_svc_state']>().toEqualTypeOf<string | null>();
  });

  it('compiles with all 5 new fields populated', () => {
    const row: DeviceGridRow = {
      device_id: 'd1',
      hostname: 'h1',
      display_name: null,
      os_type: 'WINDOWS',
      os_version: null,
      agent_version: null,
      domain_name: null,
      status: 'ONLINE',
      last_seen_at: null,
      health_supported: null,
      health_probe_complete: null,
      health_any_low_disk: null,
      health_memory_used_percent: null,
      health_memory_high_pressure: null,
      health_uptime_days: null,
      health_long_uptime_warning: null,
      health_collected_at: null,
      outdated_supported: null,
      outdated_probe_complete: null,
      outdated_upgrade_count: null,
      outdated_upgrade_truncated: null,
      outdated_collected_at: null,
      // v2-a fields populated.
      prohibited_status: 'OK',
      prohibited_decision: 'COMPLIANT',
      prohibited_findings_count: 0,
      app_control_wdac_mode: 'ENFORCE',
      app_control_app_id_svc_state: 'RUNNING',
    };
    expect(row.prohibited_status).toBe('OK');
    expect(row.prohibited_findings_count).toBe(0);
    expect(row.app_control_wdac_mode).toBe('ENFORCE');
  });

  it('compiles with all 5 new fields null (no evaluation + no app-control snapshot)', () => {
    const row: DeviceGridRow = {
      device_id: 'd2',
      hostname: 'h2',
      display_name: null,
      os_type: 'WINDOWS',
      os_version: null,
      agent_version: null,
      domain_name: null,
      status: 'OFFLINE',
      last_seen_at: null,
      health_supported: null,
      health_probe_complete: null,
      health_any_low_disk: null,
      health_memory_used_percent: null,
      health_memory_high_pressure: null,
      health_uptime_days: null,
      health_long_uptime_warning: null,
      health_collected_at: null,
      outdated_supported: null,
      outdated_probe_complete: null,
      outdated_upgrade_count: null,
      outdated_upgrade_truncated: null,
      outdated_collected_at: null,
      // LEFT JOIN no-snapshot path.
      prohibited_status: null,
      prohibited_decision: null,
      prohibited_findings_count: null,
      app_control_wdac_mode: null,
      app_control_app_id_svc_state: null,
    };
    expect(row.prohibited_status).toBeNull();
    expect(row.prohibited_findings_count).toBeNull();
  });

  it('treats 0 and null prohibited_findings_count as distinct (Codex guardrail #5)', () => {
    // The whole point of preserving NULL vs 0 in the wire shape is that the
    // page-level formatter renders them differently: 0 ⇒ "0" (real "no
    // prohibited installs"), null ⇒ "—" (no evaluation row). If the type
    // ever collapses null to 0, this regression check fails.
    const zero: DeviceGridRow['prohibited_findings_count'] = 0;
    const none: DeviceGridRow['prohibited_findings_count'] = null;
    expect(zero).not.toBe(none);
    expect(zero).toBe(0);
    expect(none).toBeNull();
  });

  it('expresses NO_EVALUATION as the explicit domain value, NOT a synthetic UNKNOWN', () => {
    // Codex 019e87aa guardrail #3: backend `LEFT JOIN pe → pe.id IS NULL`
    // resolves to the explicit string 'NO_EVALUATION' via CASE expression,
    // NOT to NULL. The web row must also surface that string verbatim — a
    // tire (—) is reserved for null/missing.
    const row: Pick<DeviceGridRow, 'prohibited_status'> = { prohibited_status: 'NO_EVALUATION' };
    expect(row.prohibited_status).toBe('NO_EVALUATION');
    expect(row.prohibited_status).not.toBeNull();
  });
});
