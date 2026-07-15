export const CANONICAL_COACHING_CONTRACT_REF =
  'Halildeu/ats@37353c4e9eeda90235d66e24ee22aa30ad148e7a:contracts/coaching/citation-backed-coaching.ts' as const;

export const CANONICAL_COACHING_CONTRACT_SHA256 =
  'sha256:2481f7b92848874f454d591766d374cdebf3584bd687e7755c9320785e43ed17' as const;

export type CoachingEvidenceType =
  | 'interview_response'
  | 'work_sample'
  | 'portfolio'
  | 'reference_check';

export type CoachingEntailment = 'SUPPORTED' | 'NOT_SUPPORTED' | 'INSUFFICIENT';

export type CoachingSuggestionKind =
  | 'RUBRIC_COVERAGE_FOLLOW_UP'
  | 'EVIDENCE_GAP_REVIEW'
  | 'UNSUPPORTED_CLAIM_REVIEW'
  | 'PROCESS_PERSPECTIVE_FOLLOW_UP';

export type CoachingSignalState = 'OBSERVED' | 'NOT_OBSERVED' | 'INSUFFICIENT_EVIDENCE';

export type CoachingSignalKind =
  | 'RUBRIC_COVERAGE'
  | 'EVIDENCE_GAP'
  | 'CONTENT_CONSISTENCY'
  | 'PROCESS_PERSPECTIVE_COVERAGE';

interface CanonicalCoachingEvidence {
  readonly tenantRef: string;
  readonly interviewRef: string;
  readonly evidenceRef: string;
  readonly citationRef: string;
  readonly criterionRef: string;
  readonly evidenceType: CoachingEvidenceType;
  readonly entailment: CoachingEntailment;
  readonly sourceSegmentRefs: readonly string[];
  readonly provenanceRef: string;
  readonly lexicalOnly: true;
}

interface CanonicalCoachingSuggestion {
  readonly suggestionRef: string;
  readonly kind: CoachingSuggestionKind;
  readonly templateRef: string;
  readonly criterionRef: string;
  readonly citationRefs: readonly string[];
}

interface CanonicalCoachingQualitySignal {
  readonly signalRef: string;
  readonly kind: CoachingSignalKind;
  readonly state: CoachingSignalState;
  readonly criterionRef: string;
  readonly citationRefs: readonly string[];
  readonly sessionLevelOnly: true;
}

export interface CanonicalSyntheticCoachingReceipt {
  readonly schemaVersion: 'citation-backed-coaching/v1';
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly interviewRef: string;
  readonly proposalId: string;
  readonly rubricVersionRef: string;
  readonly criterionRefs: readonly string[];
  readonly aiOutputVersionRef: string;
  readonly humanOversightStandardRef: 'human-oversight:canonical:v1';
  readonly provenanceChainRef: string;
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly evidenceInventory: readonly CanonicalCoachingEvidence[];
  readonly suggestions: readonly CanonicalCoachingSuggestion[];
  readonly qualitySignals: readonly CanonicalCoachingQualitySignal[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly oversightState: 'AI_SUGGESTED';
  readonly proposalOnly: true;
  readonly humanReviewRequired: true;
  readonly humanRationaleRequired: true;
  readonly appealPathRef: string;
  readonly correctionPathRef: string;
  readonly auditLineageRefs: readonly string[];
  readonly actionAllowed: false;
  readonly individualDecisionAllowed: false;
  readonly autoExecute: false;
  readonly batchApproval: false;
  readonly mutationAllowed: false;
  readonly verdict: 'NONE';
  readonly evidenceGate: 'SYNTHETIC_EVIDENCE_ONLY';
  readonly legalGate: 'NOT_MET';
  readonly independentAuditGate: 'NOT_MET';
  readonly ownerGate: 'NOT_MET';
  readonly productionEligible: false;
  readonly proposalDigest: string;
}

interface CoachingPresentationCatalog {
  readonly copyOwner: 'HUMAN_OWNED_STATIC_COPY';
  readonly criterionLabels: Readonly<Record<string, string>>;
  readonly suggestionLabels: Readonly<Record<string, string>>;
  readonly qualitySignalLabels: Readonly<Record<string, string>>;
  readonly sourceExcerpts: Readonly<Record<string, string>>;
}

export interface SyntheticCoachingSourceEnvelope {
  readonly fixtureMode: 'ARCHIVAL_SYNTHETIC';
  readonly contractRef: typeof CANONICAL_COACHING_CONTRACT_REF;
  readonly contractSha256: typeof CANONICAL_COACHING_CONTRACT_SHA256;
  readonly receipt: CanonicalSyntheticCoachingReceipt;
  readonly presentation: CoachingPresentationCatalog;
}

export interface SyntheticCoachingCitation {
  readonly evidenceRef: string;
  readonly citationRef: string;
  readonly criterionRef: string;
  readonly evidenceType: CoachingEvidenceType;
  readonly entailment: CoachingEntailment;
  readonly sourceSegmentRefs: readonly string[];
  readonly sourceExcerpt: string;
  readonly provenanceRef: string;
}

export interface SyntheticCoachingSuggestion {
  readonly suggestionRef: string;
  readonly label: string;
  readonly kind: CoachingSuggestionKind;
  readonly criterionRef: string;
  readonly criterionLabel: string;
  readonly templateRef: string;
  readonly citations: readonly SyntheticCoachingCitation[];
}

export interface SyntheticCoachingSignal {
  readonly signalRef: string;
  readonly label: string;
  readonly state: CoachingSignalState;
  readonly criterionRef: string;
  readonly citationRefs: readonly string[];
  readonly sessionLevelOnly: true;
}

export interface SyntheticCoachingProposal {
  readonly schemaVersion: 'citation-backed-coaching/v1';
  readonly contractRef: typeof CANONICAL_COACHING_CONTRACT_REF;
  readonly contractSha256: typeof CANONICAL_COACHING_CONTRACT_SHA256;
  readonly synthetic: true;
  readonly archivalFixture: true;
  readonly oversightState: 'AI_SUGGESTED';
  readonly proposalOnly: true;
  readonly humanReviewRequired: true;
  readonly humanRationaleRequired: true;
  readonly aiOutputVersionRef: string;
  readonly proposalDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly suggestions: readonly SyntheticCoachingSuggestion[];
  readonly qualitySignals: readonly SyntheticCoachingSignal[];
  readonly appealPathRef: string;
  readonly correctionPathRef: string;
  readonly auditLineageRefs: readonly string[];
  readonly actionAllowed: false;
  readonly individualDecisionAllowed: false;
  readonly autoExecute: false;
  readonly batchApproval: false;
  readonly mutationAllowed: false;
  readonly verdict: 'NONE';
  readonly legalGate: 'NOT_MET';
  readonly independentAuditGate: 'NOT_MET';
  readonly ownerGate: 'NOT_MET';
  readonly productionEligible: false;
}

export type SyntheticCoachingResolution =
  | {
      readonly status: 'VALIDATED';
      readonly proposal: SyntheticCoachingProposal;
      readonly receipt: CanonicalSyntheticCoachingReceipt;
    }
  | { readonly status: 'REJECTED'; readonly reasonCode: string };

const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPAQUE = {
  interview: /^interview_[a-f0-9]{16}$/,
  proposal: /^proposal_[a-f0-9]{16}$/,
  evidence: /^evidence_[a-f0-9]{16}$/,
  citation: /^citation_[a-f0-9]{16}$/,
  criterion: /^criterion_[a-f0-9]{16}$/,
  segment: /^segment_[a-f0-9]{16}$/,
  suggestion: /^suggestion_[a-f0-9]{16}$/,
  signal: /^signal_[a-f0-9]{16}$/,
} as const;

const EVIDENCE_TYPES = new Set<CoachingEvidenceType>([
  'interview_response',
  'work_sample',
  'portfolio',
  'reference_check',
]);
const ENTAILMENTS = new Set<CoachingEntailment>(['SUPPORTED', 'NOT_SUPPORTED', 'INSUFFICIENT']);
const SUGGESTION_KINDS = new Set<CoachingSuggestionKind>([
  'RUBRIC_COVERAGE_FOLLOW_UP',
  'EVIDENCE_GAP_REVIEW',
  'UNSUPPORTED_CLAIM_REVIEW',
  'PROCESS_PERSPECTIVE_FOLLOW_UP',
]);
const SIGNAL_KINDS = new Set<CoachingSignalKind>([
  'RUBRIC_COVERAGE',
  'EVIDENCE_GAP',
  'CONTENT_CONSISTENCY',
  'PROCESS_PERSPECTIVE_COVERAGE',
]);
const SIGNAL_STATES = new Set<CoachingSignalState>([
  'OBSERVED',
  'NOT_OBSERVED',
  'INSUFFICIENT_EVIDENCE',
]);
const EXPECTED_SIGNAL_ENTAILMENT: Readonly<Record<CoachingSignalState, CoachingEntailment>> = {
  OBSERVED: 'SUPPORTED',
  // NOT_OBSERVED is an evidence-backed observation of absence, not missing evidence.
  NOT_OBSERVED: 'SUPPORTED',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT',
};
const TEMPLATE_BY_KIND: Readonly<Record<CoachingSuggestionKind, string>> = {
  RUBRIC_COVERAGE_FOLLOW_UP: 'template:coaching:rubric-coverage-follow-up:v1',
  EVIDENCE_GAP_REVIEW: 'template:coaching:evidence-gap-review:v1',
  UNSUPPORTED_CLAIM_REVIEW: 'template:coaching:unsupported-claim-review:v1',
  PROCESS_PERSPECTIVE_FOLLOW_UP: 'template:coaching:process-perspective-follow-up:v1',
};

export const BANNED_COACHING_FIXTURE_FIELDS = [
  'candidateId',
  'employeeId',
  'personName',
  'freeText',
  'text',
  'content',
  'message',
  'description',
  'summary',
  'feedback',
  'coachingText',
  'suggestionText',
  'transcriptText',
  'audioWaveform',
  'voiceTone',
  'voiceStress',
  'prosody',
  'videoPixel',
  'facial',
  'biometricSignal',
  'protectedAttribute',
  'protectedProxy',
  'affect',
  'emotion',
  'personality',
  'deception',
  'numericScore',
  'rating',
  'ranking',
  'candidateRank',
  'hireDecision',
  'rejectDecision',
  'approvalReceipt',
  'actionReceipt',
] as const;

const FORBIDDEN_KEYS = new Set<string>(BANNED_COACHING_FIXTURE_FIELDS);
const MAX_TTL_MS = 168 * 60 * 60 * 1000;

class CoachingSourceError extends Error {}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new CoachingSourceError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], code: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  invariant(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    code,
  );
}

function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    invariant(!FORBIDDEN_KEYS.has(key), `FORBIDDEN_FIELD:${key}`);
    assertNoForbiddenKeys(child);
  }
}

function refValid(value: unknown): value is string {
  return typeof value === 'string' && REF.test(value);
}

function nonEmptyUnique(values: unknown, max: number): values is string[] {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.length <= max &&
    values.every((value) => typeof value === 'string') &&
    new Set(values).size === values.length
  );
}

function assertPresentationMap(
  value: unknown,
  refs: readonly string[],
  code: string,
  excerpt = false,
): asserts value is Record<string, string> {
  invariant(isRecord(value), code);
  const keys = Object.keys(value).sort();
  const expected = [...refs].sort();
  invariant(
    keys.length === expected.length && keys.every((key, index) => key === expected[index]),
    code,
  );
  for (const entry of Object.values(value)) {
    invariant(typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 500, code);
    if (excerpt) invariant(entry.startsWith('Sentetik segment:'), `${code}:NOT_SYNTHETIC`);
  }
}

export function resolveSyntheticCoachingSource(source: unknown): SyntheticCoachingResolution {
  try {
    assertNoForbiddenKeys(source);
    invariant(isRecord(source), 'SOURCE_NOT_OBJECT');
    assertExactKeys(
      source,
      ['fixtureMode', 'contractRef', 'contractSha256', 'receipt', 'presentation'],
      'SOURCE_UNKNOWN_OR_MISSING_FIELD',
    );
    invariant(source.fixtureMode === 'ARCHIVAL_SYNTHETIC', 'FIXTURE_MODE_INVALID');
    invariant(source.contractRef === CANONICAL_COACHING_CONTRACT_REF, 'CONTRACT_REF_MISMATCH');
    invariant(
      source.contractSha256 === CANONICAL_COACHING_CONTRACT_SHA256,
      'CONTRACT_DIGEST_MISMATCH',
    );

    invariant(isRecord(source.receipt), 'RECEIPT_NOT_OBJECT');
    const receipt = source.receipt as unknown as CanonicalSyntheticCoachingReceipt;
    assertExactKeys(
      source.receipt,
      [
        'schemaVersion',
        'synthetic',
        'tenantRef',
        'interviewRef',
        'proposalId',
        'rubricVersionRef',
        'criterionRefs',
        'aiOutputVersionRef',
        'humanOversightStandardRef',
        'provenanceChainRef',
        'containsRawPii',
        'containsRawProtectedAttributes',
        'evidenceInventory',
        'suggestions',
        'qualitySignals',
        'createdAt',
        'expiresAt',
        'oversightState',
        'proposalOnly',
        'humanReviewRequired',
        'humanRationaleRequired',
        'appealPathRef',
        'correctionPathRef',
        'auditLineageRefs',
        'actionAllowed',
        'individualDecisionAllowed',
        'autoExecute',
        'batchApproval',
        'mutationAllowed',
        'verdict',
        'evidenceGate',
        'legalGate',
        'independentAuditGate',
        'ownerGate',
        'productionEligible',
        'proposalDigest',
      ],
      'RECEIPT_UNKNOWN_OR_MISSING_FIELD',
    );

    invariant(receipt.schemaVersion === 'citation-backed-coaching/v1', 'SCHEMA_VERSION_INVALID');
    invariant(receipt.synthetic === true, 'SYNTHETIC_ONLY');
    invariant(refValid(receipt.tenantRef), 'TENANT_REF_INVALID');
    invariant(OPAQUE.interview.test(receipt.interviewRef), 'INTERVIEW_REF_INVALID');
    invariant(OPAQUE.proposal.test(receipt.proposalId), 'PROPOSAL_REF_INVALID');
    invariant(refValid(receipt.rubricVersionRef), 'RUBRIC_REF_INVALID');
    invariant(
      nonEmptyUnique(receipt.criterionRefs, 50) &&
        receipt.criterionRefs.every((ref) => OPAQUE.criterion.test(ref)),
      'CRITERION_REFS_INVALID',
    );
    invariant(refValid(receipt.aiOutputVersionRef), 'AI_OUTPUT_REF_INVALID');
    invariant(
      receipt.humanOversightStandardRef === 'human-oversight:canonical:v1',
      'HUMAN_OVERSIGHT_STANDARD_INVALID',
    );
    invariant(refValid(receipt.provenanceChainRef), 'PROVENANCE_CHAIN_INVALID');
    invariant(receipt.containsRawPii === false, 'RAW_PII_DISALLOWED');
    invariant(
      receipt.containsRawProtectedAttributes === false,
      'RAW_PROTECTED_ATTRIBUTES_DISALLOWED',
    );
    invariant(receipt.oversightState === 'AI_SUGGESTED', 'OVERSIGHT_STATE_INVALID');
    invariant(receipt.proposalOnly === true, 'PROPOSAL_ONLY_REQUIRED');
    invariant(
      receipt.humanReviewRequired === true && receipt.humanRationaleRequired === true,
      'HUMAN_REVIEW_REQUIRED',
    );
    invariant(
      receipt.actionAllowed === false && receipt.individualDecisionAllowed === false,
      'ACTION_DISALLOWED',
    );
    invariant(
      receipt.autoExecute === false &&
        receipt.batchApproval === false &&
        receipt.mutationAllowed === false,
      'AUTOMATION_DISALLOWED',
    );
    invariant(receipt.verdict === 'NONE', 'VERDICT_DISALLOWED');
    invariant(receipt.evidenceGate === 'SYNTHETIC_EVIDENCE_ONLY', 'EVIDENCE_GATE_INVALID');
    invariant(
      receipt.legalGate === 'NOT_MET' &&
        receipt.independentAuditGate === 'NOT_MET' &&
        receipt.ownerGate === 'NOT_MET',
      'ACCEPTANCE_GATE_INVALID',
    );
    invariant(receipt.productionEligible === false, 'PRODUCTION_DISALLOWED');
    invariant(refValid(receipt.appealPathRef), 'APPEAL_REF_INVALID');
    invariant(refValid(receipt.correctionPathRef), 'CORRECTION_REF_INVALID');
    invariant(
      nonEmptyUnique(receipt.auditLineageRefs, 10) && receipt.auditLineageRefs.every(refValid),
      'AUDIT_LINEAGE_INVALID',
    );
    invariant(DIGEST.test(receipt.proposalDigest), 'PROPOSAL_DIGEST_INVALID');

    const createdAt = Date.parse(receipt.createdAt);
    const expiresAt = Date.parse(receipt.expiresAt);
    invariant(
      Number.isFinite(createdAt) &&
        Number.isFinite(expiresAt) &&
        receipt.createdAt.endsWith('Z') &&
        receipt.expiresAt.endsWith('Z') &&
        expiresAt > createdAt &&
        expiresAt - createdAt <= MAX_TTL_MS,
      'ARCHIVAL_TTL_INVALID',
    );

    invariant(
      Array.isArray(source.receipt.evidenceInventory) &&
        receipt.evidenceInventory.length > 0 &&
        receipt.evidenceInventory.length <= 50,
      'EVIDENCE_COUNT_INVALID',
    );
    const evidenceByCitation = new Map<string, CanonicalCoachingEvidence>();
    const evidenceRefs = new Set<string>();
    for (const evidence of receipt.evidenceInventory) {
      const rawEvidence: unknown = evidence;
      invariant(isRecord(rawEvidence), 'EVIDENCE_NOT_OBJECT');
      assertExactKeys(
        rawEvidence,
        [
          'tenantRef',
          'interviewRef',
          'evidenceRef',
          'citationRef',
          'criterionRef',
          'evidenceType',
          'entailment',
          'sourceSegmentRefs',
          'provenanceRef',
          'lexicalOnly',
        ],
        'EVIDENCE_UNKNOWN_OR_MISSING_FIELD',
      );
      invariant(evidence.tenantRef === receipt.tenantRef, 'EVIDENCE_TENANT_MISMATCH');
      invariant(evidence.interviewRef === receipt.interviewRef, 'EVIDENCE_INTERVIEW_MISMATCH');
      invariant(OPAQUE.evidence.test(evidence.evidenceRef), 'EVIDENCE_REF_INVALID');
      invariant(OPAQUE.citation.test(evidence.citationRef), 'CITATION_REF_INVALID');
      invariant(OPAQUE.criterion.test(evidence.criterionRef), 'EVIDENCE_CRITERION_INVALID');
      invariant(
        receipt.criterionRefs.includes(evidence.criterionRef),
        'EVIDENCE_CRITERION_UNKNOWN',
      );
      invariant(EVIDENCE_TYPES.has(evidence.evidenceType), 'EVIDENCE_TYPE_INVALID');
      invariant(ENTAILMENTS.has(evidence.entailment), 'ENTAILMENT_INVALID');
      invariant(
        nonEmptyUnique(evidence.sourceSegmentRefs, 10) &&
          evidence.sourceSegmentRefs.every((ref) => OPAQUE.segment.test(ref)),
        'SOURCE_SEGMENT_REFS_INVALID',
      );
      invariant(refValid(evidence.provenanceRef), 'PROVENANCE_REF_INVALID');
      invariant(evidence.lexicalOnly === true, 'LEXICAL_ONLY_REQUIRED');
      invariant(!evidenceByCitation.has(evidence.citationRef), 'CITATION_REF_DUPLICATE');
      invariant(!evidenceRefs.has(evidence.evidenceRef), 'EVIDENCE_REF_DUPLICATE');
      evidenceByCitation.set(evidence.citationRef, evidence);
      evidenceRefs.add(evidence.evidenceRef);
    }

    invariant(
      Array.isArray(source.receipt.suggestions) &&
        receipt.suggestions.length > 0 &&
        receipt.suggestions.length <= 20,
      'SUGGESTION_COUNT_INVALID',
    );
    const suggestionRefs = new Set<string>();
    for (const suggestion of receipt.suggestions) {
      const rawSuggestion: unknown = suggestion;
      invariant(isRecord(rawSuggestion), 'SUGGESTION_NOT_OBJECT');
      assertExactKeys(
        rawSuggestion,
        ['suggestionRef', 'kind', 'templateRef', 'criterionRef', 'citationRefs'],
        'SUGGESTION_UNKNOWN_OR_MISSING_FIELD',
      );
      invariant(OPAQUE.suggestion.test(suggestion.suggestionRef), 'SUGGESTION_REF_INVALID');
      invariant(SUGGESTION_KINDS.has(suggestion.kind), 'SUGGESTION_KIND_INVALID');
      invariant(
        suggestion.templateRef === TEMPLATE_BY_KIND[suggestion.kind],
        'TEMPLATE_REF_INVALID',
      );
      invariant(
        receipt.criterionRefs.includes(suggestion.criterionRef),
        'SUGGESTION_CRITERION_UNKNOWN',
      );
      invariant(nonEmptyUnique(suggestion.citationRefs, 10), 'SUGGESTION_CITATIONS_INVALID');
      for (const citationRef of suggestion.citationRefs) {
        const evidence = evidenceByCitation.get(citationRef);
        invariant(evidence?.entailment === 'SUPPORTED', 'SUGGESTION_CITATION_NOT_SUPPORTED');
        invariant(
          evidence.criterionRef === suggestion.criterionRef,
          'SUGGESTION_CRITERION_MISMATCH',
        );
      }
      invariant(!suggestionRefs.has(suggestion.suggestionRef), 'SUGGESTION_REF_DUPLICATE');
      suggestionRefs.add(suggestion.suggestionRef);
    }

    invariant(
      Array.isArray(source.receipt.qualitySignals) &&
        receipt.qualitySignals.length > 0 &&
        receipt.qualitySignals.length <= 20,
      'QUALITY_SIGNAL_COUNT_INVALID',
    );
    const signalRefs = new Set<string>();
    for (const signal of receipt.qualitySignals) {
      const rawSignal: unknown = signal;
      invariant(isRecord(rawSignal), 'QUALITY_SIGNAL_NOT_OBJECT');
      assertExactKeys(
        rawSignal,
        ['signalRef', 'kind', 'state', 'criterionRef', 'citationRefs', 'sessionLevelOnly'],
        'QUALITY_SIGNAL_UNKNOWN_OR_MISSING_FIELD',
      );
      invariant(OPAQUE.signal.test(signal.signalRef), 'QUALITY_SIGNAL_REF_INVALID');
      invariant(SIGNAL_KINDS.has(signal.kind), 'QUALITY_SIGNAL_KIND_INVALID');
      invariant(SIGNAL_STATES.has(signal.state), 'QUALITY_SIGNAL_STATE_INVALID');
      invariant(
        receipt.criterionRefs.includes(signal.criterionRef),
        'QUALITY_SIGNAL_CRITERION_UNKNOWN',
      );
      invariant(signal.sessionLevelOnly === true, 'SESSION_LEVEL_ONLY_REQUIRED');
      invariant(nonEmptyUnique(signal.citationRefs, 10), 'QUALITY_SIGNAL_CITATIONS_INVALID');
      for (const citationRef of signal.citationRefs) {
        const evidence = evidenceByCitation.get(citationRef);
        invariant(evidence, 'QUALITY_SIGNAL_CITATION_UNKNOWN');
        invariant(
          evidence.criterionRef === signal.criterionRef,
          'QUALITY_SIGNAL_CRITERION_MISMATCH',
        );
        invariant(
          evidence.entailment === EXPECTED_SIGNAL_ENTAILMENT[signal.state],
          'QUALITY_SIGNAL_ENTAILMENT_INVALID',
        );
      }
      invariant(!signalRefs.has(signal.signalRef), 'QUALITY_SIGNAL_REF_DUPLICATE');
      signalRefs.add(signal.signalRef);
    }

    invariant(isRecord(source.presentation), 'PRESENTATION_NOT_OBJECT');
    assertExactKeys(
      source.presentation,
      ['copyOwner', 'criterionLabels', 'suggestionLabels', 'qualitySignalLabels', 'sourceExcerpts'],
      'PRESENTATION_UNKNOWN_OR_MISSING_FIELD',
    );
    const presentation = source.presentation as unknown as CoachingPresentationCatalog;
    invariant(presentation.copyOwner === 'HUMAN_OWNED_STATIC_COPY', 'PRESENTATION_OWNER_INVALID');
    assertPresentationMap(
      presentation.criterionLabels,
      receipt.criterionRefs,
      'CRITERION_LABELS_INVALID',
    );
    assertPresentationMap(
      presentation.suggestionLabels,
      receipt.suggestions.map((item) => item.suggestionRef),
      'SUGGESTION_LABELS_INVALID',
    );
    assertPresentationMap(
      presentation.qualitySignalLabels,
      receipt.qualitySignals.map((item) => item.signalRef),
      'QUALITY_SIGNAL_LABELS_INVALID',
    );
    assertPresentationMap(
      presentation.sourceExcerpts,
      receipt.evidenceInventory.map((item) => item.citationRef),
      'SOURCE_EXCERPTS_INVALID',
      true,
    );

    const toCitation = (evidence: CanonicalCoachingEvidence): SyntheticCoachingCitation => ({
      evidenceRef: evidence.evidenceRef,
      citationRef: evidence.citationRef,
      criterionRef: evidence.criterionRef,
      evidenceType: evidence.evidenceType,
      entailment: evidence.entailment,
      sourceSegmentRefs: evidence.sourceSegmentRefs,
      sourceExcerpt: presentation.sourceExcerpts[evidence.citationRef]!,
      provenanceRef: evidence.provenanceRef,
    });

    return {
      status: 'VALIDATED',
      receipt,
      proposal: {
        schemaVersion: receipt.schemaVersion,
        contractRef: CANONICAL_COACHING_CONTRACT_REF,
        contractSha256: CANONICAL_COACHING_CONTRACT_SHA256,
        synthetic: true,
        archivalFixture: true,
        oversightState: receipt.oversightState,
        proposalOnly: receipt.proposalOnly,
        humanReviewRequired: receipt.humanReviewRequired,
        humanRationaleRequired: receipt.humanRationaleRequired,
        aiOutputVersionRef: receipt.aiOutputVersionRef,
        proposalDigest: receipt.proposalDigest,
        createdAt: receipt.createdAt,
        expiresAt: receipt.expiresAt,
        suggestions: receipt.suggestions.map((suggestion) => ({
          suggestionRef: suggestion.suggestionRef,
          label: presentation.suggestionLabels[suggestion.suggestionRef]!,
          kind: suggestion.kind,
          criterionRef: suggestion.criterionRef,
          criterionLabel: presentation.criterionLabels[suggestion.criterionRef]!,
          templateRef: suggestion.templateRef,
          citations: suggestion.citationRefs.map((citationRef) =>
            toCitation(evidenceByCitation.get(citationRef)!),
          ),
        })),
        qualitySignals: receipt.qualitySignals.map((signal) => ({
          signalRef: signal.signalRef,
          label: presentation.qualitySignalLabels[signal.signalRef]!,
          state: signal.state,
          criterionRef: signal.criterionRef,
          citationRefs: signal.citationRefs,
          sessionLevelOnly: signal.sessionLevelOnly,
        })),
        appealPathRef: receipt.appealPathRef,
        correctionPathRef: receipt.correctionPathRef,
        auditLineageRefs: receipt.auditLineageRefs,
        actionAllowed: false,
        individualDecisionAllowed: false,
        autoExecute: false,
        batchApproval: false,
        mutationAllowed: false,
        verdict: 'NONE',
        legalGate: 'NOT_MET',
        independentAuditGate: 'NOT_MET',
        ownerGate: 'NOT_MET',
        productionEligible: false,
      },
    };
  } catch (error) {
    return {
      status: 'REJECTED',
      reasonCode: error instanceof CoachingSourceError ? error.message : 'SOURCE_VALIDATION_FAILED',
    };
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function calculateCanonicalCoachingDigest(
  receipt: CanonicalSyntheticCoachingReceipt,
): Promise<string | null> {
  const { proposalDigest: _proposalDigest, ...unsigned } = receipt;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(canonical(unsigned));
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

export async function verifyCanonicalCoachingDigest(
  receipt: CanonicalSyntheticCoachingReceipt,
): Promise<boolean> {
  return (await calculateCanonicalCoachingDigest(receipt)) === receipt.proposalDigest;
}

export const SYNTHETIC_COACHING_SOURCE: SyntheticCoachingSourceEnvelope = {
  fixtureMode: 'ARCHIVAL_SYNTHETIC',
  contractRef: CANONICAL_COACHING_CONTRACT_REF,
  contractSha256: CANONICAL_COACHING_CONTRACT_SHA256,
  receipt: {
    schemaVersion: 'citation-backed-coaching/v1',
    synthetic: true,
    tenantRef: 'tenant:synthetic:alpha',
    interviewRef: 'interview_1111111111111111',
    proposalId: 'proposal_2222222222222222',
    rubricVersionRef: 'rubric:structured-interview:v7',
    criterionRefs: ['criterion_aaaaaaaaaaaaaaaa', 'criterion_bbbbbbbbbbbbbbbb'],
    aiOutputVersionRef: 'ai-output:coaching:synthetic:v3',
    humanOversightStandardRef: 'human-oversight:canonical:v1',
    provenanceChainRef: 'provenance:coaching:synthetic:v1',
    containsRawPii: false,
    containsRawProtectedAttributes: false,
    evidenceInventory: [
      {
        tenantRef: 'tenant:synthetic:alpha',
        interviewRef: 'interview_1111111111111111',
        evidenceRef: 'evidence_aaaaaaaaaaaaaaaa',
        citationRef: 'citation_aaaaaaaaaaaaaaaa',
        criterionRef: 'criterion_aaaaaaaaaaaaaaaa',
        evidenceType: 'interview_response',
        entailment: 'SUPPORTED',
        sourceSegmentRefs: ['segment_aaaaaaaaaaaaaaaa'],
        provenanceRef: 'provenance:citation:a:v1',
        lexicalOnly: true,
      },
      {
        tenantRef: 'tenant:synthetic:alpha',
        interviewRef: 'interview_1111111111111111',
        evidenceRef: 'evidence_bbbbbbbbbbbbbbbb',
        citationRef: 'citation_bbbbbbbbbbbbbbbb',
        criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
        evidenceType: 'work_sample',
        entailment: 'SUPPORTED',
        sourceSegmentRefs: ['segment_bbbbbbbbbbbbbbbb'],
        provenanceRef: 'provenance:citation:b:v1',
        lexicalOnly: true,
      },
      {
        tenantRef: 'tenant:synthetic:alpha',
        interviewRef: 'interview_1111111111111111',
        evidenceRef: 'evidence_cccccccccccccccc',
        citationRef: 'citation_cccccccccccccccc',
        criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
        evidenceType: 'portfolio',
        entailment: 'INSUFFICIENT',
        sourceSegmentRefs: ['segment_cccccccccccccccc'],
        provenanceRef: 'provenance:citation:c:v1',
        lexicalOnly: true,
      },
    ],
    suggestions: [
      {
        suggestionRef: 'suggestion_aaaaaaaaaaaaaaaa',
        kind: 'RUBRIC_COVERAGE_FOLLOW_UP',
        templateRef: 'template:coaching:rubric-coverage-follow-up:v1',
        criterionRef: 'criterion_aaaaaaaaaaaaaaaa',
        citationRefs: ['citation_aaaaaaaaaaaaaaaa'],
      },
      {
        suggestionRef: 'suggestion_bbbbbbbbbbbbbbbb',
        kind: 'EVIDENCE_GAP_REVIEW',
        templateRef: 'template:coaching:evidence-gap-review:v1',
        criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
        citationRefs: ['citation_bbbbbbbbbbbbbbbb'],
      },
    ],
    qualitySignals: [
      {
        signalRef: 'signal_aaaaaaaaaaaaaaaa',
        kind: 'RUBRIC_COVERAGE',
        state: 'OBSERVED',
        criterionRef: 'criterion_aaaaaaaaaaaaaaaa',
        citationRefs: ['citation_aaaaaaaaaaaaaaaa'],
        sessionLevelOnly: true,
      },
      {
        signalRef: 'signal_bbbbbbbbbbbbbbbb',
        kind: 'EVIDENCE_GAP',
        state: 'INSUFFICIENT_EVIDENCE',
        criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
        citationRefs: ['citation_cccccccccccccccc'],
        sessionLevelOnly: true,
      },
    ],
    createdAt: '2026-07-13T11:00:00Z',
    expiresAt: '2026-07-14T11:00:00Z',
    oversightState: 'AI_SUGGESTED',
    proposalOnly: true,
    humanReviewRequired: true,
    humanRationaleRequired: true,
    appealPathRef: 'appeal:coaching:synthetic:v1',
    correctionPathRef: 'correction-path:coaching:synthetic:v1',
    auditLineageRefs: ['audit:coaching:synthetic:v1'],
    actionAllowed: false,
    individualDecisionAllowed: false,
    autoExecute: false,
    batchApproval: false,
    mutationAllowed: false,
    verdict: 'NONE',
    evidenceGate: 'SYNTHETIC_EVIDENCE_ONLY',
    legalGate: 'NOT_MET',
    independentAuditGate: 'NOT_MET',
    ownerGate: 'NOT_MET',
    productionEligible: false,
    proposalDigest: 'sha256:7a8eaa981ee2fdf412a5139abedb71853ee958c477391b3e75dae1e343e5c380',
  },
  presentation: {
    copyOwner: 'HUMAN_OWNED_STATIC_COPY',
    criterionLabels: {
      criterion_aaaaaaaaaaaaaaaa: 'Sistem tasarımında trade-off açıklığı',
      criterion_bbbbbbbbbbbbbbbb: 'Rollback ve incident öğrenimi',
    },
    suggestionLabels: {
      suggestion_aaaaaaaaaaaaaaaa: 'Kriter kapsamını kanıta bağlı takip sorusuyla netleştir',
      suggestion_bbbbbbbbbbbbbbbb: 'Eksik kanıt alanını insan incelemesinde görünür tut',
    },
    qualitySignalLabels: {
      signal_aaaaaaaaaaaaaaaa: 'Rubric kapsamı',
      signal_bbbbbbbbbbbbbbbb: 'Süreç perspektifi kapsamı',
    },
    sourceExcerpts: {
      citation_aaaaaaaaaaaaaaaa:
        'Sentetik segment: Tasarım seçeneğinin gecikme, maliyet ve geri dönüş etkileri birlikte açıklandı.',
      citation_bbbbbbbbbbbbbbbb:
        'Sentetik segment: Çalışma örneği rollback adımlarını içeriyor; ölçülen kurtarma süresi belirtilmemiş.',
      citation_cccccccccccccccc:
        'Sentetik segment: Portfolyo kaydı süreç perspektifi için yeterli ve doğrulanabilir ayrıntı içermiyor.',
    },
  },
};
