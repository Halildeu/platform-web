export type DeploymentProfileId = 'MANAGED_CLOUD' | 'BYO_REGION' | 'SOVEREIGN_ON_PREM';

export type ReadinessStatus = 'NOT_EVALUATED' | 'PARTIAL' | 'BLOCKED' | 'VERIFIED';

export type EvidenceGateId =
  | 'ARTIFACT_IMMUTABILITY'
  | 'SUPPLY_CHAIN'
  | 'KUBERNETES_COMPATIBILITY'
  | 'RESTORE_REHEARSAL'
  | 'ROLLBACK_REHEARSAL';

export interface SyntheticDeploymentProfile {
  schemaVersion: 'p5.deployment-readiness.v1';
  id: DeploymentProfileId;
  name: string;
  description: string;
  status: ReadinessStatus;
  ownerAccepted: false;
  minimumInfrastructure: readonly string[];
  missingEvidenceSummary: string;
}

export interface SyntheticEvidenceGate {
  schemaVersion: 'p5.deployment-evidence.v1';
  id: EvidenceGateId;
  name: string;
  standard: string;
  status: ReadinessStatus;
  required: true;
  evidenceVerified: false;
  reason: string;
}
