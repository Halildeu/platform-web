import { describe, expect, it } from 'vitest';
import {
  ATS_CAPABILITY_REGISTRY,
  ATS_PRODUCT_ENTRY,
  ATS_PRODUCT_ROLES,
  type AtsCapabilityMode,
  type AtsProductRole,
} from './ats-capability-registry';

describe('ATS capability registry', () => {
  it('keeps every capability bound to one protected product entry', () => {
    expect(new Set(ATS_CAPABILITY_REGISTRY.map((capability) => capability.id)).size).toBe(
      ATS_CAPABILITY_REGISTRY.length,
    );

    for (const capability of ATS_CAPABILITY_REGISTRY) {
      expect(capability.route).toBe(ATS_PRODUCT_ENTRY.route);
      expect(capability.requiredModule).toBe(ATS_PRODUCT_ENTRY.requiredModule);
      expect(capability.targetRoles.length).toBeGreaterThan(0);
      expect(capability.liveDependency.trim()).not.toBe('');
      expect(capability.actionCeiling.trim()).not.toBe('');
    }
  });

  it('makes the required product-role matrix discoverable', () => {
    for (const role of [
      'CANDIDATE',
      'RECRUITER',
      'HIRING_MANAGER',
      'INTERVIEWER',
      'AUDITOR',
      'ADMIN',
    ] as const) {
      expect(ATS_PRODUCT_ROLES[role]).toBeTruthy();
      expect(
        ATS_CAPABILITY_REGISTRY.some((capability) =>
          (capability.targetRoles as readonly AtsProductRole[]).includes(role),
        ),
      ).toBe(true);
    }
  });

  it('never exposes a live write capability while the remote is unavailable', () => {
    expect(
      ATS_CAPABILITY_REGISTRY.some(
        (capability) => (capability.mode as AtsCapabilityMode) === 'LIVE_WRITE',
      ),
    ).toBe(false);
    expect(
      ATS_CAPABILITY_REGISTRY.filter((capability) => capability.safePreview !== null).every(
        (capability) =>
          capability.mode === 'SYNTHETIC_SANDBOX' || capability.mode === 'PROPOSAL_ONLY',
      ),
    ).toBe(true);
  });
});
