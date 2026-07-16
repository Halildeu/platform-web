import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_PORTAL_ENTRY,
  RECRUITER_CANDIDATES,
  RECRUITER_DISABLED_ACTIONS,
  RECRUITER_POSITIONS,
  RECRUITER_WORKSPACE_ENTRY,
} from './ats-portal-registry';

describe('ATS portal registry', () => {
  it('keeps candidate and recruiter routes explicitly separated', () => {
    expect(CANDIDATE_PORTAL_ENTRY.route).toBe('/candidate');
    expect(CANDIDATE_PORTAL_ENTRY.mode).toBe('SYNTHETIC_SANDBOX');
    expect(RECRUITER_WORKSPACE_ENTRY.route).toBe('/admin/ats/recruiter');
    expect(RECRUITER_WORKSPACE_ENTRY.requiredModule).toBe('INTERVIEW_EVIDENCE');
    expect(RECRUITER_WORKSPACE_ENTRY.mode).toBe('PROPOSAL_ONLY');
  });

  it('uses only synthetic candidate aliases tied to declared positions', () => {
    const positionIds = new Set(RECRUITER_POSITIONS.map((position) => position.id));

    expect(RECRUITER_CANDIDATES.length).toBeGreaterThan(0);
    for (const candidate of RECRUITER_CANDIDATES) {
      expect(candidate.alias).toMatch(/^Aday DEMO-[0-9]+$/);
      expect(positionIds.has(candidate.positionId)).toBe(true);
      expect(candidate.evidenceReady).toBeLessThanOrEqual(candidate.evidenceTotal);
    }
  });

  it('declares decision and communication actions as disabled surface labels', () => {
    expect(RECRUITER_DISABLED_ACTIONS).toEqual([
      'Adaya mesaj gönder',
      'Adayı reddet',
      'Teklif gönder',
    ]);
  });
});
