export type IntegrityStatus =
  | 'VERIFIED_BINDING'
  | 'FAILED_BINDING'
  | 'NOT_PRESENT'
  | 'UNSUPPORTED'
  | 'VERIFICATION_ERROR'
  | 'INCONCLUSIVE';

export type IntegrityReasonCode =
  | 'MANIFEST_BINDING_VERIFIED'
  | 'MANIFEST_NOT_PRESENT'
  | 'MANIFEST_SIGNATURE_INVALID'
  | 'ASSET_DIGEST_MISMATCH'
  | 'CLAIM_DIGEST_MISMATCH'
  | 'DIGEST_MISMATCH_UNKNOWN'
  | 'DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT'
  | 'ACCESSIBILITY_TRANSCODE_OBSERVED'
  | 'UNSUPPORTED_MANIFEST_FORMAT'
  | 'VERIFIER_ERROR'
  | 'TRUST_LIST_STALE';

export interface SyntheticIntegrityReasonBinding {
  reasonCode: IntegrityReasonCode;
  evidenceRef: string;
  evidenceDigest: `sha256:${string}`;
  assetSnapshotRef: string;
  assetSnapshotDigest: `sha256:${string}`;
  manifestDigest: `sha256:${string}` | null;
  claimDigest: `sha256:${string}` | null;
  verifierVersionRef: string;
  trustListVersionRef: string;
  policyVersionRef: string;
}

export interface SyntheticCoverageReceipt {
  measurementState: 'SYNTHETIC_ONLY';
  evidenceRef: string;
  evidenceDigest: `sha256:${string}`;
  measurementPolicyVersionRef: string;
}

export interface SyntheticIntegrityReceipt {
  schemaVersion: 'integrity-provenance-screening/v1';
  screeningId: string;
  synthetic: true;
  tenantRef: string;
  scopeRef: string;
  assetRef: string;
  assetSnapshotRef: string;
  assetDigest: `sha256:${string}`;
  assetSnapshotDigest: `sha256:${string}`;
  scopeBindingDigest: `sha256:${string}`;
  scopeBindingAttestationRef: string;
  scopeBindingAttestationDigest: `sha256:${string}`;
  scopeBindingKeyVersionRef: string;
  attestationBoundary: 'CLAIMED_EXTERNAL_REF_CRYPTO_VERIFICATION_OUT_OF_SCOPE';
  manifestPresence: 'PRESENT' | 'NOT_PRESENT' | 'UNKNOWN';
  manifestDigest: `sha256:${string}` | null;
  claimDigest: `sha256:${string}` | null;
  verifierVersionRef: string;
  trustListVersionRef: string;
  policyVersionRef: string;
  timestampAuthorityRef: string;
  verifiedAt: string;
  retentionPolicyRef: string;
  retentionExpiresAt: string;
  deletionMechanism: 'CRYPTO_SHRED';
  status: IntegrityStatus;
  reasonCodes: readonly IntegrityReasonCode[];
  reasonEvidenceBindings: readonly SyntheticIntegrityReasonBinding[];
  coverage: {
    falsePositive: SyntheticCoverageReceipt;
    falseNegative: SyntheticCoverageReceipt;
    uncertainty: SyntheticCoverageReceipt;
    deviceCodec: SyntheticCoverageReceipt;
    accessibility: SyntheticCoverageReceipt;
  };
  humanReviewPathRef: string;
  appealPathRef: string;
  correctionPathRef: string;
  auditLineageRefs: readonly string[];
  screeningOnly: true;
  containsRawMedia: false;
  containsBiometricData: false;
  containsRawPii: false;
  deepfakeConclusion: 'NONE';
  authenticityConclusion: 'NONE';
  identityConclusion: 'NONE';
  deceptionConclusion: 'NONE';
  emotionConclusion: 'NONE';
  personRiskScoreAllowed: false;
  actionAllowed: false;
  adverseActionAllowed: false;
  automaticRejectionAllowed: false;
  mutationAllowed: false;
  verdict: 'NONE';
  humanReviewRequired: true;
  legalGate: 'NOT_MET';
  ownerGate: 'NOT_MET';
  productionEligible: false;
}

export interface SyntheticIntegrityProvenanceSurface {
  receipts: readonly SyntheticIntegrityReceipt[];
}

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;

const coverage = {
  falsePositive: {
    measurementState: 'SYNTHETIC_ONLY',
    evidenceRef: 'coverage_1111111111111111',
    evidenceDigest: digest('1'),
    measurementPolicyVersionRef: 'coverage-policy:false-positive:synthetic-v1',
  },
  falseNegative: {
    measurementState: 'SYNTHETIC_ONLY',
    evidenceRef: 'coverage_2222222222222222',
    evidenceDigest: digest('2'),
    measurementPolicyVersionRef: 'coverage-policy:false-negative:synthetic-v1',
  },
  uncertainty: {
    measurementState: 'SYNTHETIC_ONLY',
    evidenceRef: 'coverage_3333333333333333',
    evidenceDigest: digest('3'),
    measurementPolicyVersionRef: 'coverage-policy:uncertainty:synthetic-v1',
  },
  deviceCodec: {
    measurementState: 'SYNTHETIC_ONLY',
    evidenceRef: 'coverage_4444444444444444',
    evidenceDigest: digest('4'),
    measurementPolicyVersionRef: 'coverage-policy:device-codec:synthetic-v1',
  },
  accessibility: {
    measurementState: 'SYNTHETIC_ONLY',
    evidenceRef: 'coverage_5555555555555555',
    evidenceDigest: digest('5'),
    measurementPolicyVersionRef: 'coverage-policy:accessibility:synthetic-v1',
  },
} as const;

const common = {
  schemaVersion: 'integrity-provenance-screening/v1',
  synthetic: true,
  tenantRef: 'tenant_aaaaaaaaaaaaaaaa',
  scopeRef: 'scope_bbbbbbbbbbbbbbbb',
  verifierVersionRef: 'verifier:c2pa:synthetic-v1',
  trustListVersionRef: 'trust-list:c2pa:2026-07-13',
  policyVersionRef: 'policy:integrity:synthetic-v1',
  timestampAuthorityRef: 'timestamp:server:synthetic-v1',
  retentionPolicyRef: 'retention:integrity:synthetic-v1',
  deletionMechanism: 'CRYPTO_SHRED',
  coverage,
  humanReviewPathRef: 'route_1111111111111111',
  appealPathRef: 'route_2222222222222222',
  correctionPathRef: 'route_3333333333333333',
  screeningOnly: true,
  containsRawMedia: false,
  containsBiometricData: false,
  containsRawPii: false,
  deepfakeConclusion: 'NONE',
  authenticityConclusion: 'NONE',
  identityConclusion: 'NONE',
  deceptionConclusion: 'NONE',
  emotionConclusion: 'NONE',
  personRiskScoreAllowed: false,
  actionAllowed: false,
  adverseActionAllowed: false,
  automaticRejectionAllowed: false,
  mutationAllowed: false,
  verdict: 'NONE',
  humanReviewRequired: true,
  legalGate: 'NOT_MET',
  ownerGate: 'NOT_MET',
  productionEligible: false,
  attestationBoundary: 'CLAIMED_EXTERNAL_REF_CRYPTO_VERIFICATION_OUT_OF_SCOPE',
} as const;

export const SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE: SyntheticIntegrityProvenanceSurface = {
  receipts: [
    buildReceipt({
      screeningId: 'screening_1111111111111111',
      assetRef: 'asset_1111111111111111',
      assetSnapshotRef: 'snapshot_1111111111111111',
      assetDigest: digest('a'),
      scopeBindingDigest: digest('6'),
      scopeBindingAttestationRef: 'attestation_1111111111111111',
      scopeBindingKeyVersionRef: 'key:scope-binding:synthetic-v1',
      manifestPresence: 'PRESENT',
      manifestDigest: digest('b'),
      claimDigest: digest('c'),
      verifiedAt: '2026-07-13T11:50:00.000Z',
      retentionExpiresAt: '2026-07-20T11:50:00.000Z',
      status: 'VERIFIED_BINDING',
      reasonCodes: ['MANIFEST_BINDING_VERIFIED'],
      evidenceSeed: '6',
      auditLineageRefs: ['audit_1111111111111111'],
    }),
    buildReceipt({
      screeningId: 'screening_2222222222222222',
      assetRef: 'asset_2222222222222222',
      assetSnapshotRef: 'snapshot_2222222222222222',
      assetDigest: digest('d'),
      scopeBindingDigest: digest('7'),
      scopeBindingAttestationRef: 'attestation_2222222222222222',
      scopeBindingKeyVersionRef: 'key:scope-binding:synthetic-v1',
      manifestPresence: 'NOT_PRESENT',
      manifestDigest: null,
      claimDigest: null,
      verifiedAt: '2026-07-13T11:51:00.000Z',
      retentionExpiresAt: '2026-07-20T11:51:00.000Z',
      status: 'NOT_PRESENT',
      reasonCodes: ['MANIFEST_NOT_PRESENT'],
      evidenceSeed: '7',
      auditLineageRefs: ['audit_2222222222222222'],
    }),
    buildReceipt({
      screeningId: 'screening_3333333333333333',
      assetRef: 'asset_3333333333333333',
      assetSnapshotRef: 'snapshot_3333333333333333',
      assetDigest: digest('e'),
      scopeBindingDigest: digest('8'),
      scopeBindingAttestationRef: 'attestation_3333333333333333',
      scopeBindingKeyVersionRef: 'key:scope-binding:synthetic-v1',
      manifestPresence: 'PRESENT',
      manifestDigest: digest('f'),
      claimDigest: digest('0'),
      verifiedAt: '2026-07-13T11:52:00.000Z',
      retentionExpiresAt: '2026-07-20T11:52:00.000Z',
      status: 'FAILED_BINDING',
      reasonCodes: [
        'ACCESSIBILITY_TRANSCODE_OBSERVED',
        'ASSET_DIGEST_MISMATCH',
        'DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT',
      ],
      evidenceSeed: '8',
      auditLineageRefs: ['audit_3333333333333333'],
    }),
    buildReceipt({
      screeningId: 'screening_4444444444444444',
      assetRef: 'asset_4444444444444444',
      assetSnapshotRef: 'snapshot_4444444444444444',
      assetDigest: digest('9'),
      scopeBindingDigest: digest('9'),
      scopeBindingAttestationRef: 'attestation_4444444444444444',
      scopeBindingKeyVersionRef: 'key:scope-binding:synthetic-v1',
      manifestPresence: 'UNKNOWN',
      manifestDigest: null,
      claimDigest: null,
      verifiedAt: '2026-07-13T11:53:00.000Z',
      retentionExpiresAt: '2026-07-20T11:53:00.000Z',
      status: 'INCONCLUSIVE',
      reasonCodes: ['TRUST_LIST_STALE'],
      evidenceSeed: '9',
      auditLineageRefs: ['audit_4444444444444444'],
    }),
  ],
};

function buildReceipt(input: {
  screeningId: string;
  assetRef: string;
  assetSnapshotRef: string;
  assetDigest: `sha256:${string}`;
  scopeBindingDigest: `sha256:${string}`;
  scopeBindingAttestationRef: string;
  scopeBindingKeyVersionRef: string;
  manifestPresence: SyntheticIntegrityReceipt['manifestPresence'];
  manifestDigest: `sha256:${string}` | null;
  claimDigest: `sha256:${string}` | null;
  verifiedAt: string;
  retentionExpiresAt: string;
  status: IntegrityStatus;
  reasonCodes: readonly IntegrityReasonCode[];
  evidenceSeed: string;
  auditLineageRefs: readonly string[];
}): SyntheticIntegrityReceipt {
  return {
    ...common,
    ...input,
    assetSnapshotDigest: input.assetDigest,
    scopeBindingAttestationDigest: input.scopeBindingDigest,
    reasonEvidenceBindings: input.reasonCodes.map((reasonCode, index) => ({
      reasonCode,
      evidenceRef: `evidence_${input.evidenceSeed.repeat(15)}${index}`,
      evidenceDigest:
        `sha256:${input.evidenceSeed.repeat(63)}${index.toString(16)}` as `sha256:${string}`,
      assetSnapshotRef: input.assetSnapshotRef,
      assetSnapshotDigest: input.assetDigest,
      manifestDigest: input.manifestDigest,
      claimDigest: input.claimDigest,
      verifierVersionRef: common.verifierVersionRef,
      trustListVersionRef: common.trustListVersionRef,
      policyVersionRef: common.policyVersionRef,
    })),
  };
}

export const INTEGRITY_STATUS_LABELS: Record<IntegrityStatus, string> = {
  VERIFIED_BINDING: 'PROVENANCE BINDING DOĞRULANDI',
  FAILED_BINDING: 'BINDING UYUŞMAZLIĞI · İNCELEME GEREKLİ',
  NOT_PRESENT: 'MANIFEST BULUNAMADI',
  UNSUPPORTED: 'MANIFEST FORMATI DESTEKLENMİYOR',
  VERIFICATION_ERROR: 'DOĞRULAMA HATASI',
  INCONCLUSIVE: 'SONUÇLANDIRILAMADI',
};

export const INTEGRITY_STATUS_BOUNDARIES: Record<IntegrityStatus, string> = {
  VERIFIED_BINDING:
    'Yalnız manifest ile asset snapshot bağının doğrulandığını gösterir; içerik doğruluğu veya kimlik doğrulaması değildir.',
  FAILED_BINDING:
    'Digest uyuşmazlığı yalnız provenance inceleme sinyalidir; neden veya kişi hakkında hüküm üretmez.',
  NOT_PRESENT: 'Yalnız manifest bulunamadığını gösterir; içerik üzerinde hüküm üretmez.',
  UNSUPPORTED:
    'Manifest formatı bu verifier sürümünde çözümlenemedi; içerik veya kişi sonucu üretilemez.',
  VERIFICATION_ERROR:
    'Verifier receipt üretmedi; screening evidence kullanılamaz ve insan incelemesi gerekir.',
  INCONCLUSIVE: 'Trust-list freshness kanıtı yetersizdir; screening sonucu kullanılamaz.',
};

export const INTEGRITY_REASON_LABELS: Record<IntegrityReasonCode, string> = {
  MANIFEST_BINDING_VERIFIED: 'Manifest–snapshot binding evidence',
  MANIFEST_NOT_PRESENT: 'Manifest discovery evidence',
  MANIFEST_SIGNATURE_INVALID: 'Manifest signature validation evidence',
  ASSET_DIGEST_MISMATCH: 'Asset digest mismatch evidence',
  CLAIM_DIGEST_MISMATCH: 'Claim digest mismatch evidence',
  DIGEST_MISMATCH_UNKNOWN: 'Digest mismatch evidence · cause unknown',
  DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT: 'Digest mismatch with transcode context',
  ACCESSIBILITY_TRANSCODE_OBSERVED: 'Accessibility transcode context receipt',
  UNSUPPORTED_MANIFEST_FORMAT: 'Unsupported manifest-format evidence',
  VERIFIER_ERROR: 'Verifier error evidence',
  TRUST_LIST_STALE: 'Trust-list freshness evidence',
};

export const COVERAGE_LABELS = {
  falsePositive: 'False-positive coverage',
  falseNegative: 'False-negative coverage',
  uncertainty: 'Uncertainty coverage',
  deviceCodec: 'Device / codec coverage',
  accessibility: 'Accessibility coverage',
} as const;

export const BANNED_INTEGRITY_SURFACE_FIELDS = [
  'riskScore',
  'confidenceScore',
  'fraudLabel',
  'deepfakeDetected',
  'rejectDecision',
  'adverseDecision',
  'rawMedia',
  'faceEmbedding',
  'voiceprint',
  'livenessTemplate',
  'emotion',
  'deception',
] as const;
