export type IntelligenceCapabilityId =
  | 'QUALITY_OF_HIRE'
  | 'FAIRNESS_EVIDENCE'
  | 'INTERVIEWER_COACHING'
  | 'SKILLS_ONTOLOGY'
  | 'DEEPFAKE_PROVENANCE'
  | 'INTERNAL_MOBILITY'
  | 'AGENTIC_WORKFLOW';

export type IntelligenceCapabilityStatus =
  | 'RESEARCH_ONLY'
  | 'EVIDENCE_REQUIRED'
  | 'BLOCKED'
  | 'PROPOSAL_ONLY'
  | 'DISALLOWED';

export interface SyntheticMeasurementContract {
  metric: string;
  cohort: string;
  groundTruth: string;
  guardrail: string;
}

export interface SyntheticIntelligenceCapability {
  schemaVersion: 'p6.intelligence-governance.v1';
  id: IntelligenceCapabilityId;
  name: string;
  description: string;
  status: IntelligenceCapabilityStatus;
  standard: string;
  allowedUse: string;
  prohibitedUse: string;
  measurement: SyntheticMeasurementContract;
  fullAtsAccepted: false;
  evidenceVerified: false;
  humanApproved: false;
  /** Compile-time hard bans: these decision/ranking fields cannot enter the proposal fixture. */
  affectScore?: never;
  sentimentScore?: never;
  personalityProfile?: never;
  rankingScore?: never;
  candidateRank?: never;
}

export interface IntelligenceHardBan {
  id: string;
  label: string;
  reason: string;
}

export interface SyntheticApprovalCheckpoint {
  id: 'MEASUREMENT_PLAN' | 'INDEPENDENT_EVIDENCE' | 'HUMAN_REVIEW' | 'DOWNSTREAM_MUTATION';
  label: string;
  status: 'PENDING' | 'BLOCKED';
  humanApproved: false;
  reason: string;
}
