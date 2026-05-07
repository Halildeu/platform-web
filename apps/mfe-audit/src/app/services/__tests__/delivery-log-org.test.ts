import { describe, expect, it } from 'vitest';
import { DEFAULT_ORG_FALLBACK, resolveDeliveryLogOrgId } from '../delivery-log-org';

/**
 * Faz 23.5 PR6 FE — org-resolution helper unit tests.
 *
 * Codex thread `019e0289` iter-2 AGREE absorb pinned three behaviours:
 *  - Whitelist priority (org_id wins over tenant_id wins over allowed_orgs).
 *  - Single-element allowed_orgs is a match; multi-element returns null
 *    (we never silently default in a multi-org world).
 *  - Default fallback only fires when no other field is populated.
 */
describe('resolveDeliveryLogOrgId', () => {
  it('falls back to default when the user is null', () => {
    expect(resolveDeliveryLogOrgId(null)).toBe(DEFAULT_ORG_FALLBACK);
    expect(resolveDeliveryLogOrgId(undefined)).toBe(DEFAULT_ORG_FALLBACK);
  });

  it('falls back to default when the user is not an object', () => {
    expect(resolveDeliveryLogOrgId('hello')).toBe(DEFAULT_ORG_FALLBACK);
    expect(resolveDeliveryLogOrgId(42)).toBe(DEFAULT_ORG_FALLBACK);
  });

  it('reads org_id when present', () => {
    expect(resolveDeliveryLogOrgId({ org_id: 'tenant-a' })).toBe('tenant-a');
  });

  it('reads orgId / organizationId / tenant_id / tenantId fallbacks in order', () => {
    expect(resolveDeliveryLogOrgId({ orgId: 'tenant-b' })).toBe('tenant-b');
    expect(resolveDeliveryLogOrgId({ organizationId: 'tenant-c' })).toBe('tenant-c');
    expect(resolveDeliveryLogOrgId({ tenant_id: 'tenant-d' })).toBe('tenant-d');
    expect(resolveDeliveryLogOrgId({ tenantId: 'tenant-e' })).toBe('tenant-e');
  });

  it('prefers org_id over later whitelist entries', () => {
    expect(
      resolveDeliveryLogOrgId({
        org_id: 'tenant-priority',
        tenant_id: 'tenant-secondary',
        allowed_orgs: ['tenant-tertiary'],
      }),
    ).toBe('tenant-priority');
  });

  it('uses single-element allowed_orgs as the org id', () => {
    expect(resolveDeliveryLogOrgId({ allowed_orgs: ['tenant-x'] })).toBe('tenant-x');
    expect(resolveDeliveryLogOrgId({ allowedOrgs: ['tenant-y'] })).toBe('tenant-y');
  });

  it('returns null when allowed_orgs has multiple entries (no UI selector in v1)', () => {
    expect(resolveDeliveryLogOrgId({ allowed_orgs: ['tenant-x', 'tenant-y'] })).toBeNull();
    expect(resolveDeliveryLogOrgId({ allowedOrgs: ['t1', 't2', 't3'] })).toBeNull();
  });

  it('ignores blank strings', () => {
    expect(resolveDeliveryLogOrgId({ org_id: '   ' })).toBe(DEFAULT_ORG_FALLBACK);
    expect(resolveDeliveryLogOrgId({ allowed_orgs: ['', 'tenant-y'] })).toBe('tenant-y');
  });

  it('trims whitespace around values before returning them', () => {
    // Codex post-impl P3: a shell-user shaped as { org_id: ' tenant-a ' }
    // would otherwise send a leading-space header value and earn a
    // misleading 403.
    expect(resolveDeliveryLogOrgId({ org_id: '  tenant-a  ' })).toBe('tenant-a');
    expect(resolveDeliveryLogOrgId({ allowed_orgs: [' tenant-z\n'] })).toBe('tenant-z');
  });

  it('falls back to default when no whitelist field matches', () => {
    expect(resolveDeliveryLogOrgId({ unrelated: 'value' })).toBe(DEFAULT_ORG_FALLBACK);
    expect(resolveDeliveryLogOrgId({ allowed_orgs: [] })).toBe(DEFAULT_ORG_FALLBACK);
  });
});
