import type { SyntheticDeploymentProfile, SyntheticEvidenceGate } from './types';

/** P5-WEB-01 is a non-executable, synthetic readiness contract. */
export const SYNTHETIC_DEPLOYMENT_PROFILES: readonly SyntheticDeploymentProfile[] = [
  {
    schemaVersion: 'p5.deployment-readiness.v1',
    id: 'MANAGED_CLOUD',
    name: 'Managed Cloud',
    description: 'Platform işletimli bölge; müşteri isolation ve evidence paketi yine zorunlu.',
    status: 'PARTIAL',
    ownerAccepted: false,
    minimumInfrastructure: ['Immutable OCI registry', 'Kubernetes 1.29+', 'Encrypted object store'],
    missingEvidenceSummary: 'Supply-chain imzası, restore provası ve owner acceptance eksik.',
  },
  {
    schemaVersion: 'p5.deployment-readiness.v1',
    id: 'BYO_REGION',
    name: 'BYO Region',
    description: 'Müşteri bulut hesabında ayrılmış bölge; shared-responsibility kanıtı gerekir.',
    status: 'BLOCKED',
    ownerAccepted: false,
    minimumInfrastructure: [
      'Private Kubernetes control plane',
      'Customer KMS/HSM boundary',
      'Private OCI registry',
    ],
    missingEvidenceSummary: 'Account boundary, KMS ownership ve rollback rehearsal kanıtlanmadı.',
  },
  {
    schemaVersion: 'p5.deployment-readiness.v1',
    id: 'SOVEREIGN_ON_PREM',
    name: 'Sovereign On-Prem',
    description: 'Müşteri veri merkezinde bağımsız işletim; offline/air-gap desteği varsayılmaz.',
    status: 'NOT_EVALUATED',
    ownerAccepted: false,
    minimumInfrastructure: [
      'CNCF-conformant Kubernetes',
      'Offline-capable OCI registry',
      'Encrypted backup target',
      'Documented break-glass access',
    ],
    missingEvidenceSummary:
      'Partner discovery ve tüm teknik kanıt kapıları henüz değerlendirilmedi.',
  },
] as const;

export const SYNTHETIC_EVIDENCE_GATES: readonly SyntheticEvidenceGate[] = [
  {
    schemaVersion: 'p5.deployment-evidence.v1',
    id: 'ARTIFACT_IMMUTABILITY',
    name: 'Immutable artifact',
    standard: 'OCI digest / imageID lineage',
    status: 'PARTIAL',
    required: true,
    evidenceVerified: false,
    reason: 'Fixture yalnız gereken kanıt türünü tanımlar; digest doğrulaması çalıştırmaz.',
  },
  {
    schemaVersion: 'p5.deployment-evidence.v1',
    id: 'SUPPLY_CHAIN',
    name: 'Software supply chain',
    standard: 'SPDX/CycloneDX + SLSA provenance + Sigstore',
    status: 'NOT_EVALUATED',
    required: true,
    evidenceVerified: false,
    reason: 'SBOM, provenance ve signature receipt bağlı değil.',
  },
  {
    schemaVersion: 'p5.deployment-evidence.v1',
    id: 'KUBERNETES_COMPATIBILITY',
    name: 'Kubernetes compatibility',
    standard: 'CNCF conformance + policy/resource preflight',
    status: 'PARTIAL',
    required: true,
    evidenceVerified: false,
    reason: 'Sürüm aralığı tanımlı; gerçek cluster preflight sonucu yok.',
  },
  {
    schemaVersion: 'p5.deployment-evidence.v1',
    id: 'RESTORE_REHEARSAL',
    name: 'Backup / restore rehearsal',
    standard: 'Encrypted backup + measured RPO/RTO restore proof',
    status: 'BLOCKED',
    required: true,
    evidenceVerified: false,
    reason: 'Restore provası ve ölçülmüş RPO/RTO receipt bulunmuyor.',
  },
  {
    schemaVersion: 'p5.deployment-evidence.v1',
    id: 'ROLLBACK_REHEARSAL',
    name: 'Atomic rollback rehearsal',
    standard: 'Atomic cutover + 72h rollback window',
    status: 'NOT_EVALUATED',
    required: true,
    evidenceVerified: false,
    reason: 'Cutover/rollback provası yapılmadı; weighted DNS kanıt sayılmaz.',
  },
] as const;
