export type SyntheticOntologySourceKind = 'ESCO' | 'ONET' | 'HR_OPEN' | 'CUSTOM' | 'DERIVED';

export interface SyntheticOntologyConcept {
  readonly conceptRef: string;
  readonly labelRef: string;
  readonly labelLocale: 'tr-TR' | 'en-US';
  readonly deprecated: boolean;
}

export interface SyntheticOntologyEdge {
  readonly edgeRef: string;
  readonly sourceConceptRef: string;
  readonly targetConceptRef: string;
  readonly kind: 'BROADER' | 'NARROWER' | 'RELATED' | 'EQUIVALENT';
}

export interface SyntheticOntologyRelease {
  readonly schemaVersion: 'versioned-skills-ontology/v1';
  readonly releaseRef: string;
  readonly releaseVersion: string;
  readonly sourceKind: SyntheticOntologySourceKind;
  readonly sourceUriRef: string;
  readonly sourceVersion: string;
  readonly licenseKind: 'CC_BY_4_0' | 'PUBLIC_DOMAIN' | 'PROPRIETARY' | 'CUSTOM_LICENSE';
  readonly licenseRef: string;
  readonly provenanceChainRef: string;
  readonly supersedesReleaseRef: string;
  readonly supersedesReleaseDigest: string;
  readonly releaseDigest: string;
  readonly createdAt: string;
  readonly immutable: true;
  readonly digestAlgorithm: 'SHA-256';
  readonly concepts: readonly SyntheticOntologyConcept[];
  readonly edges: readonly SyntheticOntologyEdge[];
}

export interface SyntheticSkillEvidence {
  readonly evidenceRef: string;
  readonly citationRef: string;
  readonly subjectRef: string;
  readonly conceptRef: string;
  readonly ontologyReleaseRef: string;
  readonly ontologyReleaseVersion: string;
  readonly ontologyReleaseDigest: string;
  readonly evidenceType: 'interview_response' | 'work_sample' | 'portfolio' | 'reference_check';
  readonly entailment: 'SUPPORTED';
  readonly sourceSegmentRef: string;
  readonly provenanceRef: string;
}

export interface SyntheticSkillMappingProposal {
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly subjectRef: string;
  readonly oversightState: 'AI_SUGGESTED';
  readonly proposalOnly: true;
  readonly silentInferenceAllowed: false;
  readonly evidenceInventory: readonly SyntheticSkillEvidence[];
  readonly actionAllowed: false;
  readonly mutationAllowed: false;
  readonly productionEligible: false;
}

export interface SyntheticRediscoveryMatch {
  readonly matchRef: string;
  readonly subjectRef: string;
  readonly conceptRef: string;
  readonly sourceProposalId: string;
  readonly sourceProposalDigest: string;
  readonly evidenceRef: string;
  readonly citationRef: string;
  readonly ontologyReleaseRef: string;
  readonly ontologyReleaseVersion: string;
  readonly ontologyReleaseDigest: string;
  readonly evidenceEntailment: 'SUPPORTED';
  readonly traceStatus: 'TRACE_CURRENT' | 'TRACE_INVALIDATED_BY_TOMBSTONE';
}

export interface SyntheticTalentRediscoveryProposal {
  readonly rediscoveryId: string;
  readonly proposalDigest: string;
  readonly oversightState: 'AI_SUGGESTED';
  readonly proposalOnly: true;
  readonly unordered: true;
  readonly displayOrder: 'UNSPECIFIED';
  readonly consentReceiptRef: string;
  readonly processingPurposeRef: string;
  readonly optOutCheckedAt: string;
  readonly optedOut: false;
  readonly expiresAt: string;
  readonly appealPathRef: string;
  readonly correctionPathRef: string;
  readonly tombstonePathRef: string;
  readonly matches: readonly SyntheticRediscoveryMatch[];
  readonly actionAllowed: false;
  readonly mutationAllowed: false;
  readonly productionEligible: false;
  readonly realSubjectAccepted: false;
  readonly realRediscoveryActivated: false;
  readonly fullAtsAccepted: false;
}

export interface SyntheticSkillsOntologySurface {
  readonly release: SyntheticOntologyRelease;
  readonly mappingProposal: SyntheticSkillMappingProposal;
  readonly rediscoveryProposal: SyntheticTalentRediscoveryProposal;
}

export const SYNTHETIC_SKILL_LABEL_REGISTRY: Readonly<Record<string, string>> = {
  'label:esco:distributed-systems': 'Dağıtık sistemler',
  'label:esco:incident-recovery': 'Olay müdahalesi ve geri dönüş',
  'label:esco:technical-communication': 'Teknik iletişim',
};

export const SYNTHETIC_SKILL_CITATION_REGISTRY: Readonly<Record<string, string>> = {
  citation_aaaaaaaaaaaaaaaa:
    'Sentetik segment: Aday olmayan opaque subject, gecikme ve dayanıklılık trade-offlarını kaynak segmentlerle ilişkilendirdi.',
  citation_bbbbbbbbbbbbbbbb:
    'Sentetik çalışma örneği: Rollback adımları ve kurtarma doğrulaması açıkça belgelendi.',
};

const releaseRef = 'release_2222222222222222';
const releaseVersion = 'ontology:skills:v2';
const releaseDigest = `sha256:${'2'.repeat(64)}`;
const proposalId = 'proposal_2222222222222222';
const proposalDigest = `sha256:${'4'.repeat(64)}`;
const subjectRef = 'subject_1111111111111111';

export const SYNTHETIC_SKILLS_ONTOLOGY_SURFACE: SyntheticSkillsOntologySurface = {
  release: {
    schemaVersion: 'versioned-skills-ontology/v1',
    releaseRef,
    releaseVersion,
    sourceKind: 'ESCO',
    sourceUriRef: 'source-uri:esco:api:v1',
    sourceVersion: 'esco:1.2.1',
    licenseKind: 'CC_BY_4_0',
    licenseRef: 'license:cc-by-4.0',
    provenanceChainRef: 'provenance:ontology:esco:1.2.1',
    supersedesReleaseRef: 'release_1111111111111111',
    supersedesReleaseDigest: `sha256:${'1'.repeat(64)}`,
    releaseDigest,
    createdAt: '2026-07-13T10:00:00Z',
    immutable: true,
    digestAlgorithm: 'SHA-256',
    concepts: [
      {
        conceptRef: 'concept_aaaaaaaaaaaaaaaa',
        labelRef: 'label:esco:distributed-systems',
        labelLocale: 'tr-TR',
        deprecated: false,
      },
      {
        conceptRef: 'concept_bbbbbbbbbbbbbbbb',
        labelRef: 'label:esco:incident-recovery',
        labelLocale: 'tr-TR',
        deprecated: false,
      },
      {
        conceptRef: 'concept_cccccccccccccccc',
        labelRef: 'label:esco:technical-communication',
        labelLocale: 'tr-TR',
        deprecated: false,
      },
    ],
    edges: [
      {
        edgeRef: 'edge_aaaaaaaaaaaaaaaa',
        sourceConceptRef: 'concept_aaaaaaaaaaaaaaaa',
        targetConceptRef: 'concept_bbbbbbbbbbbbbbbb',
        kind: 'RELATED',
      },
    ],
  },
  mappingProposal: {
    proposalId,
    proposalDigest,
    subjectRef,
    oversightState: 'AI_SUGGESTED',
    proposalOnly: true,
    silentInferenceAllowed: false,
    evidenceInventory: [
      {
        evidenceRef: 'evidence_aaaaaaaaaaaaaaaa',
        citationRef: 'citation_aaaaaaaaaaaaaaaa',
        subjectRef,
        conceptRef: 'concept_aaaaaaaaaaaaaaaa',
        ontologyReleaseRef: releaseRef,
        ontologyReleaseVersion: releaseVersion,
        ontologyReleaseDigest: releaseDigest,
        evidenceType: 'interview_response',
        entailment: 'SUPPORTED',
        sourceSegmentRef: 'segment_aaaaaaaaaaaaaaaa',
        provenanceRef: 'provenance:skills:evidence:a',
      },
      {
        evidenceRef: 'evidence_bbbbbbbbbbbbbbbb',
        citationRef: 'citation_bbbbbbbbbbbbbbbb',
        subjectRef,
        conceptRef: 'concept_bbbbbbbbbbbbbbbb',
        ontologyReleaseRef: releaseRef,
        ontologyReleaseVersion: releaseVersion,
        ontologyReleaseDigest: releaseDigest,
        evidenceType: 'work_sample',
        entailment: 'SUPPORTED',
        sourceSegmentRef: 'segment_bbbbbbbbbbbbbbbb',
        provenanceRef: 'provenance:skills:evidence:b',
      },
    ],
    actionAllowed: false,
    mutationAllowed: false,
    productionEligible: false,
  },
  rediscoveryProposal: {
    rediscoveryId: 'rediscovery_3333333333333333',
    proposalDigest: `sha256:${'6'.repeat(64)}`,
    oversightState: 'AI_SUGGESTED',
    proposalOnly: true,
    unordered: true,
    displayOrder: 'UNSPECIFIED',
    consentReceiptRef: 'consent:rediscovery:synthetic:v1',
    processingPurposeRef: 'purpose:rediscovery:synthetic:v1',
    optOutCheckedAt: '2026-07-13T11:42:00Z',
    optedOut: false,
    expiresAt: '2026-07-14T11:30:00Z',
    appealPathRef: 'appeal:rediscovery:synthetic:v1',
    correctionPathRef: 'correction-path:rediscovery:synthetic:v1',
    tombstonePathRef: 'tombstone:skills:synthetic:v1',
    matches: [
      {
        matchRef: 'match_4444444444444444',
        subjectRef,
        conceptRef: 'concept_aaaaaaaaaaaaaaaa',
        sourceProposalId: proposalId,
        sourceProposalDigest: proposalDigest,
        evidenceRef: 'evidence_aaaaaaaaaaaaaaaa',
        citationRef: 'citation_aaaaaaaaaaaaaaaa',
        ontologyReleaseRef: releaseRef,
        ontologyReleaseVersion: releaseVersion,
        ontologyReleaseDigest: releaseDigest,
        evidenceEntailment: 'SUPPORTED',
        traceStatus: 'TRACE_CURRENT',
      },
      {
        matchRef: 'match_5555555555555555',
        subjectRef: 'subject_2222222222222222',
        conceptRef: 'concept_bbbbbbbbbbbbbbbb',
        sourceProposalId: 'proposal_5555555555555555',
        sourceProposalDigest: `sha256:${'5'.repeat(64)}`,
        evidenceRef: 'evidence_5555555555555555',
        citationRef: 'citation_5555555555555555',
        ontologyReleaseRef: releaseRef,
        ontologyReleaseVersion: releaseVersion,
        ontologyReleaseDigest: releaseDigest,
        evidenceEntailment: 'SUPPORTED',
        traceStatus: 'TRACE_INVALIDATED_BY_TOMBSTONE',
      },
    ],
    actionAllowed: false,
    mutationAllowed: false,
    productionEligible: false,
    realSubjectAccepted: false,
    realRediscoveryActivated: false,
    fullAtsAccepted: false,
  },
};

export const BANNED_SKILLS_SURFACE_FIELDS = [
  'candidateId',
  'employeeId',
  'personName',
  'protectedAttribute',
  'affect',
  'emotion',
  'personality',
  'deception',
  'numericScore',
  'rating',
  'ranking',
  'candidateRank',
  'confidence',
  'automatedDecision',
  'actionReceipt',
] as const;
