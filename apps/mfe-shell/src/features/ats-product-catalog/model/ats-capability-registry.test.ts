import { describe, expect, it } from 'vitest';
import {
  ATS_CAPABILITY_REGISTRY,
  ATS_PRODUCT_HUB_ENTRY,
  ATS_PRODUCT_ROLES,
  INTERVIEW_EVIDENCE_ENTRY,
  resolveAtsCapabilities,
  type AtsCapabilityMode,
  type AtsProductRole,
} from './ats-capability-registry';

describe('ATS capability registry', () => {
  it('keeps every capability bound to the protected hub or its live module', () => {
    expect(new Set(ATS_CAPABILITY_REGISTRY.map((capability) => capability.id)).size).toBe(
      ATS_CAPABILITY_REGISTRY.length,
    );

    for (const capability of ATS_CAPABILITY_REGISTRY) {
      expect([ATS_PRODUCT_HUB_ENTRY.route, INTERVIEW_EVIDENCE_ENTRY.route]).toContain(
        capability.route,
      );
      expect(capability.requiredModule).toBe(
        capability.route === INTERVIEW_EVIDENCE_ENTRY.route
          ? INTERVIEW_EVIDENCE_ENTRY.requiredModule
          : ATS_PRODUCT_HUB_ENTRY.requiredModule,
      );
      expect(capability.targetRoles.length).toBeGreaterThan(0);
      expect(capability.liveDependency.trim()).not.toBe('');
      expect(capability.actionCeiling.trim()).not.toBe('');
    }
  });

  it('separates the ATS product grant from sensitive interview evidence', () => {
    expect(ATS_PRODUCT_HUB_ENTRY.requiredModule).toBe('ATS');
    expect(INTERVIEW_EVIDENCE_ENTRY.requiredModule).toBe('INTERVIEW_EVIDENCE');
  });

  it('includes the gated editable CV-PDF draft without enabling upload or PII processing', () => {
    expect(ATS_CAPABILITY_REGISTRY).toHaveLength(9);
    const cvImport = ATS_CAPABILITY_REGISTRY.find(
      (capability) => capability.id === 'candidate-cv-pdf-import',
    );
    expect(cvImport?.mode).toBe('OWNER_GATED');
    expect(cvImport?.liveDependency).toContain('Halildeu/ats#163');
    expect(cvImport?.actionCeiling).toContain('gerçek CV/PII işlenmez');
    expect(cvImport?.safePreview).toBeNull();
    expect(cvImport?.safeExperience).toEqual({
      kind: 'SYNTHETIC_RESUME_DRAFT',
      actionLabel: 'Sentetik PDF taslak akışını dene',
    });
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
    expect(
      ATS_CAPABILITY_REGISTRY.filter(
        (capability) => capability.safeExperience?.kind === 'SCENARIO_RUNNER',
      ).every(
        (capability) =>
          capability.mode === 'SYNTHETIC_SANDBOX' || capability.mode === 'PROPOSAL_ONLY',
      ),
    ).toBe(true);
  });

  it('keeps agentic screening usable only as a non-mutating proposal exercise', () => {
    const agentic = ATS_CAPABILITY_REGISTRY.find(
      (capability) => capability.id === 'agentic-screening',
    );

    expect(agentic?.mode).toBe('PROPOSAL_ONLY');
    expect(agentic?.safeExperience?.kind).toBe('SCENARIO_RUNNER');
    expect(agentic?.actionCeiling).toContain('otomatik eleme');
    expect(agentic?.safePreview?.boundary).toContain('Mesaj gönderilmez');
  });

  it('promotes only the declared Interview Evidence capability to live read when remote is on', () => {
    const remoteOff = resolveAtsCapabilities(false);
    const remoteOn = resolveAtsCapabilities(true);

    expect(
      remoteOff.find((capability) => capability.id === 'interview-evidence-workspace')?.mode,
    ).toBe('UNAVAILABLE');
    expect(
      remoteOn.find((capability) => capability.id === 'interview-evidence-workspace')?.mode,
    ).toBe('LIVE_READ');
    expect(remoteOn.filter((capability) => capability.mode === 'LIVE_READ')).toHaveLength(1);
    expect(remoteOn.some((capability) => capability.mode === 'LIVE_WRITE')).toBe(false);
    expect(remoteOn.find((capability) => capability.id === 'candidate-cv-pdf-import')?.mode).toBe(
      'OWNER_GATED',
    );
  });
});
