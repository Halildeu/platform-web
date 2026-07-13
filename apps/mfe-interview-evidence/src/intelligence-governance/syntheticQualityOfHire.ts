export type QualityOfHireWindowDays = 90 | 180;

export type QualityOfHireOutcomeKind =
  | 'RETENTION'
  | 'RAMP_MILESTONE'
  | 'STRUCTURED_MANAGER_OUTCOME'
  | 'NEW_HIRE_EXPERIENCE';

export interface QualityOfHireWilsonIntervalV1 {
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: 0.95;
  readonly method: 'WILSON_SCORE';
}

export interface QualityOfHireDimensionResultV1 {
  readonly kind: QualityOfHireOutcomeKind;
  readonly outcomeCategoryRef: string;
  readonly visibility: 'VISIBLE' | 'SUPPRESSED_INSUFFICIENT_DATA';
  readonly eligibleCount: number | null;
  readonly observedCount: number | null;
  readonly missingCount: number | null;
  readonly censoredCount: number | null;
  readonly outcomeCategoryCount: number | null;
  readonly missingnessRate: number | null;
  readonly outcomeCategoryRate: number | null;
  readonly uncertaintyInterval: QualityOfHireWilsonIntervalV1 | null;
}

export interface QualityOfHireObservationWindowResultV1 {
  readonly windowDays: QualityOfHireWindowDays;
  readonly dimensions: readonly QualityOfHireDimensionResultV1[];
}

export interface SyntheticQualityOfHireEvidenceReceiptV1 {
  readonly schemaVersion: 'quality-of-hire-evidence/v1';
  readonly intelligenceEvaluationAuthority: 'intelligence-evaluation/v1';
  readonly capabilityRef: 'capability:qoh:v1';
  readonly synthetic: true;
  readonly aggregateOnly: true;
  readonly outputMode: 'AGGREGATE_RESEARCH_EVIDENCE';
  readonly tenantRef: `tenant_${string}`;
  readonly cohortRef: `cohort_${string}`;
  readonly measurementPlanRef: string;
  readonly measurementPlanVersionRef: string;
  readonly preregistrationDigest: `sha256:${string}`;
  readonly cohortDefinitionRef: string;
  readonly cohortDefinitionVersionRef: string;
  readonly comparisonProtocol: {
    readonly kind: 'NONE' | 'PREREGISTERED_DESCRIPTIVE_BASELINE';
    readonly protocolRef: string;
    readonly baselineRef: string | null;
    readonly preregistered: true;
    readonly causalClaimAllowed: false;
  };
  readonly dataCutoffAt: string;
  readonly minimumStatisticalSampleSize: number;
  readonly minimumDisclosureSampleSize: number;
  readonly maximumMissingnessRate: number;
  readonly missingnessPlanRef: string;
  readonly confounderPlanRefs: readonly string[];
  readonly uncertaintyMethod: 'WILSON_SCORE_95';
  readonly groundTruthStatus: 'CONTESTABLE_HUMAN_REPORTED_OUTCOME';
  readonly lineage: {
    readonly hiringEvidenceAggregateRef: string;
    readonly hrisOutcomeSnapshotRef: string;
    readonly structuredHumanOutcomeReceiptRef: string;
    readonly newHireExperienceReceiptRef: string;
    readonly linkageProtocolRef: string;
    readonly linkageUsesDestroyableHmac: true;
    readonly sourceSchemaVersionRefs: readonly string[];
    readonly provenanceChainRef: string;
  };
  readonly governance: {
    readonly purposeRef: string;
    readonly legalBasisReviewRef: string;
    readonly retentionPolicyRef: string;
    readonly accessPolicyRef: string;
    readonly suppressionPolicyRef: string;
    readonly differencingControlRef: string;
    readonly queryBudgetPolicyRef: string;
    readonly erasurePropagationRef: string;
    readonly correctionPathRef: string;
    readonly appealPathRef: string;
    readonly auditPolicyRef: string;
    readonly humanOversightStandardRef: 'human-oversight:canonical:v1';
  };
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly containsRawEmployeePerformanceData: false;
  readonly containsPersonLevelOutcome: false;
  readonly causalClaimAllowed: false;
  readonly candidateRankingAllowed: false;
  readonly retrospectiveCandidateRankingAllowed: false;
  readonly retrospectiveCandidateScoringAllowed: false;
  readonly automatedEmploymentDecisionAllowed: false;
  readonly modelTrainingUseAllowed: false;
  readonly selectionModelOptimizationAllowed: false;
  readonly protectedAttributeOptimizationAllowed: false;
  readonly proxyFeatureOptimizationAllowed: false;
  readonly employeePerformanceActionAllowed: false;
  readonly internalMobilityRankingAllowed: false;
  readonly singleCompositeQohScore: 'DISALLOWED';
  readonly humanReviewRequired: true;
  readonly humanActionAllowed: false;
  readonly correctionReasonRef: string | null;
  readonly supersedesReceiptDigest: `sha256:${string}` | null;
  readonly correctionStatus: 'ORIGINAL' | 'SUPERSEDING_SYNTHETIC_CORRECTION';
  readonly status: 'SYNTHETIC_DESCRIPTIVE_ASSOCIATION' | 'INSUFFICIENT_DATA';
  readonly insufficiencyReasons: readonly (
    | 'STATISTICAL_SAMPLE_BELOW_MINIMUM'
    | 'DISCLOSURE_SAMPLE_BELOW_MINIMUM'
    | 'MISSINGNESS_ABOVE_MAXIMUM'
  )[];
  readonly observationWindows: readonly QualityOfHireObservationWindowResultV1[];
  readonly correlationOnly: true;
  readonly causalConclusion: 'NONE';
  readonly complianceConclusion: 'NONE';
  readonly evidenceGate: 'SYNTHETIC_EVIDENCE_ONLY';
  readonly legalGate: 'NOT_MET';
  readonly independentAuditGate: 'NOT_MET';
  readonly customerControllerGate: 'NOT_MET';
  readonly ownerGate: 'NOT_MET';
  readonly realDataAccepted: false;
  readonly realActivationAllowed: false;
  readonly productionEligible: false;
  readonly receiptDigest: `sha256:${string}`;
}

export interface QualityOfHireReceiptValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly status: 'DESCRIPTIVE_ASSOCIATION_ONLY' | 'SMALL_COHORT_SUPPRESSED' | 'TRACE_FAIL_CLOSED';
}

export const BANNED_QUALITY_OF_HIRE_SURFACE_FIELDS = [
  'candidateId',
  'employeeId',
  'personId',
  'personName',
  'email',
  'phone',
  'rawPerformanceText',
  'performanceScore',
  'candidateScore',
  'candidateRank',
  'rankingScore',
  'protectedAttribute',
  'protectedGroup',
  'trainingLabel',
  'rawAttribute',
  'rawPii',
  'rawEmployeePerformance',
  'qohScore',
  'compositeScore',
  'singleScore',
  'numericScore',
  'modelTrainingPayload',
  'rawMetricValue',
  'hireDecision',
  'rejectDecision',
  'autoDecision',
] as const;

const REQUIRED_WINDOWS: readonly QualityOfHireWindowDays[] = [90, 180];
const REQUIRED_DIMENSIONS: readonly QualityOfHireOutcomeKind[] = [
  'RETENTION',
  'RAMP_MILESTONE',
  'STRUCTURED_MANAGER_OUTCOME',
  'NEW_HIRE_EXPERIENCE',
];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const OPAQUE_TENANT_REF = /^tenant_[a-f0-9]{16}$/;
const OPAQUE_COHORT_REF = /^cohort_[a-f0-9]{16}$/;
const OPAQUE_OUTCOME_CATEGORY_REF = /^category_[a-f0-9]{16}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/;
const MAX_COUNT = 10_000_000;
const MAX_REF_LIST_LENGTH = 20;
const TOLERANCE = 0.000001;
const RECEIPT_KEYS = [
  'schemaVersion',
  'intelligenceEvaluationAuthority',
  'capabilityRef',
  'synthetic',
  'aggregateOnly',
  'outputMode',
  'tenantRef',
  'cohortRef',
  'measurementPlanRef',
  'measurementPlanVersionRef',
  'preregistrationDigest',
  'cohortDefinitionRef',
  'cohortDefinitionVersionRef',
  'comparisonProtocol',
  'dataCutoffAt',
  'minimumStatisticalSampleSize',
  'minimumDisclosureSampleSize',
  'maximumMissingnessRate',
  'missingnessPlanRef',
  'confounderPlanRefs',
  'uncertaintyMethod',
  'groundTruthStatus',
  'lineage',
  'governance',
  'containsRawPii',
  'containsRawProtectedAttributes',
  'containsRawEmployeePerformanceData',
  'containsPersonLevelOutcome',
  'causalClaimAllowed',
  'candidateRankingAllowed',
  'retrospectiveCandidateRankingAllowed',
  'retrospectiveCandidateScoringAllowed',
  'automatedEmploymentDecisionAllowed',
  'modelTrainingUseAllowed',
  'selectionModelOptimizationAllowed',
  'protectedAttributeOptimizationAllowed',
  'proxyFeatureOptimizationAllowed',
  'employeePerformanceActionAllowed',
  'internalMobilityRankingAllowed',
  'singleCompositeQohScore',
  'humanReviewRequired',
  'humanActionAllowed',
  'correctionReasonRef',
  'supersedesReceiptDigest',
  'correctionStatus',
  'status',
  'insufficiencyReasons',
  'observationWindows',
  'correlationOnly',
  'causalConclusion',
  'complianceConclusion',
  'evidenceGate',
  'legalGate',
  'independentAuditGate',
  'customerControllerGate',
  'ownerGate',
  'realDataAccepted',
  'realActivationAllowed',
  'productionEligible',
  'receiptDigest',
] as const;
const COMPARISON_KEYS = [
  'kind',
  'protocolRef',
  'baselineRef',
  'preregistered',
  'causalClaimAllowed',
] as const;
const LINEAGE_KEYS = [
  'hiringEvidenceAggregateRef',
  'hrisOutcomeSnapshotRef',
  'structuredHumanOutcomeReceiptRef',
  'newHireExperienceReceiptRef',
  'linkageProtocolRef',
  'linkageUsesDestroyableHmac',
  'sourceSchemaVersionRefs',
  'provenanceChainRef',
] as const;
const GOVERNANCE_KEYS = [
  'purposeRef',
  'legalBasisReviewRef',
  'retentionPolicyRef',
  'accessPolicyRef',
  'suppressionPolicyRef',
  'differencingControlRef',
  'queryBudgetPolicyRef',
  'erasurePropagationRef',
  'correctionPathRef',
  'appealPathRef',
  'auditPolicyRef',
  'humanOversightStandardRef',
] as const;
const WINDOW_KEYS = ['windowDays', 'dimensions'] as const;
const DIMENSION_KEYS = [
  'kind',
  'outcomeCategoryRef',
  'visibility',
  'eligibleCount',
  'observedCount',
  'missingCount',
  'censoredCount',
  'outcomeCategoryCount',
  'missingnessRate',
  'outcomeCategoryRate',
  'uncertaintyInterval',
] as const;
const INTERVAL_KEYS = ['lower', 'upper', 'confidenceLevel', 'method'] as const;
const INSUFFICIENCY_REASONS = [
  'STATISTICAL_SAMPLE_BELOW_MINIMUM',
  'DISCLOSURE_SAMPLE_BELOW_MINIMUM',
  'MISSINGNESS_ABOVE_MAXIMUM',
] as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(message: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bytes = new TextEncoder().encode(message);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const words = new Uint32Array(64);
  const rotateRight = (value: number, shift: number) => (value >>> shift) | (value << (32 - shift));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15] ?? 0;
      const second = words[index - 2] ?? 0;
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e ?? 0, 6) ^ rotateRight(e ?? 0, 11) ^ rotateRight(e ?? 0, 25);
      const choice = ((e ?? 0) & (f ?? 0)) ^ (~(e ?? 0) & (g ?? 0));
      const temporary1 =
        ((h ?? 0) + sum1 + choice + (constants[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a ?? 0, 2) ^ rotateRight(a ?? 0, 13) ^ rotateRight(a ?? 0, 22);
      const majority = ((a ?? 0) & (b ?? 0)) ^ ((a ?? 0) & (c ?? 0)) ^ ((b ?? 0) & (c ?? 0));
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = ((d ?? 0) + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = ((state[0] ?? 0) + (a ?? 0)) >>> 0;
    state[1] = ((state[1] ?? 0) + (b ?? 0)) >>> 0;
    state[2] = ((state[2] ?? 0) + (c ?? 0)) >>> 0;
    state[3] = ((state[3] ?? 0) + (d ?? 0)) >>> 0;
    state[4] = ((state[4] ?? 0) + (e ?? 0)) >>> 0;
    state[5] = ((state[5] ?? 0) + (f ?? 0)) >>> 0;
    state[6] = ((state[6] ?? 0) + (g ?? 0)) >>> 0;
    state[7] = ((state[7] ?? 0) + (h ?? 0)) >>> 0;
  }

  return state.map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function computeSyntheticQualityOfHireReceiptDigest(
  receipt: Omit<SyntheticQualityOfHireEvidenceReceiptV1, 'receiptDigest'>,
): `sha256:${string}` {
  return `sha256:${sha256Hex(canonical(receipt))}`;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function wilson95(selected: number, population: number): QualityOfHireWilsonIntervalV1 {
  const z = 1.959963984540054;
  const zSquared = z * z;
  const observed = selected / population;
  const denominator = 1 + zSquared / population;
  const center = (observed + zSquared / (2 * population)) / denominator;
  const margin =
    (z * Math.sqrt((observed * (1 - observed) + zSquared / (4 * population)) / population)) /
    denominator;
  return {
    lower: round(Math.max(0, center - margin)),
    upper: round(Math.min(1, center + margin)),
    confidenceLevel: 0.95,
    method: 'WILSON_SCORE',
  };
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= TOLERANCE;
}

function isCanonicalRefList(values: readonly string[]): boolean {
  if (
    values.length < 1 ||
    values.length > MAX_REF_LIST_LENGTH ||
    new Set(values).size !== values.length ||
    values.some((value) => !REF.test(value))
  ) {
    return false;
  }
  const sorted = [...values].sort();
  return values.every((value, index) => value === sorted[index]);
}

function containsForbiddenField(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = containsForbiddenField(item);
      if (match) return match;
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    if ((BANNED_QUALITY_OF_HIRE_SURFACE_FIELDS as readonly string[]).includes(key)) return key;
    const match = containsForbiddenField(nested);
    if (match) return match;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateExactKeys(
  value: object,
  allowed: readonly string[],
  code: string,
  issues: string[],
): void {
  const keys = Object.keys(value);
  const allowedSet = new Set(allowed);
  const unexpected = keys.filter((key) => !allowedSet.has(key));
  const missing = allowed.filter((key) => !keys.includes(key));
  if (unexpected.length > 0 || missing.length > 0) {
    issues.push(
      `${code}:unexpected=${unexpected.sort().join(',') || 'none'}:missing=${missing.sort().join(',') || 'none'}`,
    );
  }
}

export function validateSyntheticQualityOfHireReceipt(
  receipt: SyntheticQualityOfHireEvidenceReceiptV1,
): QualityOfHireReceiptValidation {
  const issues: string[] = [];
  if (!isRecord(receipt)) {
    return { valid: false, issues: ['RECEIPT_OBJECT_REQUIRED'], status: 'TRACE_FAIL_CLOSED' };
  }
  validateExactKeys(receipt, RECEIPT_KEYS, 'RECEIPT_KEY_SET_INVALID', issues);
  if (
    !isRecord(receipt.comparisonProtocol) ||
    !isRecord(receipt.lineage) ||
    !isRecord(receipt.governance) ||
    !Array.isArray(receipt.observationWindows) ||
    !Array.isArray(receipt.insufficiencyReasons) ||
    !Array.isArray(receipt.confounderPlanRefs) ||
    !Array.isArray(receipt.lineage.sourceSchemaVersionRefs)
  ) {
    return {
      valid: false,
      issues: [...issues, 'RECEIPT_NESTED_SHAPE_INVALID'],
      status: 'TRACE_FAIL_CLOSED',
    };
  }
  validateExactKeys(
    receipt.comparisonProtocol,
    COMPARISON_KEYS,
    'COMPARISON_KEY_SET_INVALID',
    issues,
  );
  validateExactKeys(receipt.lineage, LINEAGE_KEYS, 'LINEAGE_KEY_SET_INVALID', issues);
  validateExactKeys(receipt.governance, GOVERNANCE_KEYS, 'GOVERNANCE_KEY_SET_INVALID', issues);
  if (
    receipt.schemaVersion !== 'quality-of-hire-evidence/v1' ||
    receipt.intelligenceEvaluationAuthority !== 'intelligence-evaluation/v1' ||
    receipt.capabilityRef !== 'capability:qoh:v1' ||
    receipt.outputMode !== 'AGGREGATE_RESEARCH_EVIDENCE'
  ) {
    issues.push('AUTHORITY_BINDING_MISMATCH');
  }
  const forbiddenField = containsForbiddenField(receipt);
  if (forbiddenField) issues.push(`FORBIDDEN_FIELD:${forbiddenField}`);

  if (
    !OPAQUE_TENANT_REF.test(receipt.tenantRef) ||
    !OPAQUE_COHORT_REF.test(receipt.cohortRef) ||
    !TIMESTAMP.test(receipt.dataCutoffAt) ||
    !Number.isFinite(Date.parse(receipt.dataCutoffAt)) ||
    !DIGEST.test(receipt.preregistrationDigest)
  ) {
    issues.push('RECEIPT_IDENTITY_OR_TIME_INVALID');
  }
  if (
    !Number.isInteger(receipt.minimumStatisticalSampleSize) ||
    receipt.minimumStatisticalSampleSize < 1 ||
    receipt.minimumStatisticalSampleSize > MAX_COUNT ||
    !Number.isInteger(receipt.minimumDisclosureSampleSize) ||
    receipt.minimumDisclosureSampleSize < 1 ||
    receipt.minimumDisclosureSampleSize > MAX_COUNT ||
    !Number.isFinite(receipt.maximumMissingnessRate) ||
    receipt.maximumMissingnessRate < 0 ||
    receipt.maximumMissingnessRate > 1
  ) {
    issues.push('MEASUREMENT_THRESHOLD_INVALID');
  }

  const structurallyValidWindows = receipt.observationWindows.filter(
    (window) => isRecord(window) && Array.isArray(window.dimensions),
  );
  const windowSet = new Set(structurallyValidWindows.map((window) => window.windowDays));
  if (
    receipt.observationWindows.length !== REQUIRED_WINDOWS.length ||
    structurallyValidWindows.length !== receipt.observationWindows.length ||
    windowSet.size !== REQUIRED_WINDOWS.length ||
    !REQUIRED_WINDOWS.every((window) => windowSet.has(window))
  ) {
    issues.push('WINDOW_SET_INVALID');
  }
  if (
    structurallyValidWindows.length === receipt.observationWindows.length &&
    receipt.observationWindows.length === REQUIRED_WINDOWS.length &&
    !structurallyValidWindows.every(
      (window, index) => window.windowDays === REQUIRED_WINDOWS[index],
    )
  ) {
    issues.push('QOH_RECEIPT_WINDOW_ORDER_INVALID');
  }

  for (const window of receipt.observationWindows) {
    if (!isRecord(window) || !Array.isArray(window.dimensions)) {
      issues.push('WINDOW_SHAPE_INVALID');
      continue;
    }
    validateExactKeys(window, WINDOW_KEYS, `WINDOW_KEY_SET_INVALID:${window.windowDays}`, issues);
    const structurallyValidDimensions = window.dimensions.filter((dimension) =>
      isRecord(dimension),
    );
    const dimensionSet = new Set(structurallyValidDimensions.map((dimension) => dimension.kind));
    if (
      window.dimensions.length !== REQUIRED_DIMENSIONS.length ||
      structurallyValidDimensions.length !== window.dimensions.length ||
      dimensionSet.size !== REQUIRED_DIMENSIONS.length ||
      !REQUIRED_DIMENSIONS.every((dimension) => dimensionSet.has(dimension))
    ) {
      issues.push(`DIMENSION_SET_INVALID:${window.windowDays}`);
    }
    if (
      structurallyValidDimensions.length === window.dimensions.length &&
      window.dimensions.length === REQUIRED_DIMENSIONS.length &&
      !structurallyValidDimensions.every(
        (dimension, index) => dimension.kind === REQUIRED_DIMENSIONS[index],
      )
    ) {
      issues.push(`QOH_RECEIPT_DIMENSION_ORDER_INVALID:${window.windowDays}`);
    }
    for (const dimension of window.dimensions) {
      if (!isRecord(dimension)) {
        issues.push(`DIMENSION_SHAPE_INVALID:${window.windowDays}`);
        continue;
      }
      validateExactKeys(
        dimension,
        DIMENSION_KEYS,
        `DIMENSION_KEY_SET_INVALID:${window.windowDays}:${dimension.kind}`,
        issues,
      );
      if (!OPAQUE_OUTCOME_CATEGORY_REF.test(dimension.outcomeCategoryRef)) {
        issues.push(`OUTCOME_CATEGORY_REF_NOT_OPAQUE:${window.windowDays}:${dimension.kind}`);
      }
      if (receipt.status === 'INSUFFICIENT_DATA') {
        const aggregateValues = [
          dimension.eligibleCount,
          dimension.observedCount,
          dimension.missingCount,
          dimension.censoredCount,
          dimension.outcomeCategoryCount,
          dimension.missingnessRate,
          dimension.outcomeCategoryRate,
          dimension.uncertaintyInterval,
        ];
        if (
          dimension.visibility !== 'SUPPRESSED_INSUFFICIENT_DATA' ||
          aggregateValues.some((value) => value !== null)
        ) {
          issues.push(`SUPPRESSION_LEAK:${window.windowDays}:${dimension.kind}`);
        }
        continue;
      }

      if (
        dimension.visibility !== 'VISIBLE' ||
        dimension.eligibleCount === null ||
        dimension.observedCount === null ||
        dimension.missingCount === null ||
        dimension.censoredCount === null ||
        dimension.outcomeCategoryCount === null ||
        dimension.missingnessRate === null ||
        dimension.outcomeCategoryRate === null ||
        dimension.uncertaintyInterval === null
      ) {
        issues.push(`VISIBLE_AGGREGATE_INCOMPLETE:${window.windowDays}:${dimension.kind}`);
        continue;
      }
      const counts = [
        dimension.eligibleCount,
        dimension.observedCount,
        dimension.missingCount,
        dimension.censoredCount,
        dimension.outcomeCategoryCount,
      ];
      if (
        counts.some((value) => !Number.isInteger(value) || value < 0 || value > MAX_COUNT) ||
        dimension.observedCount + dimension.missingCount + dimension.censoredCount !==
          dimension.eligibleCount ||
        dimension.outcomeCategoryCount > dimension.observedCount ||
        dimension.observedCount === 0 ||
        dimension.eligibleCount === 0
      ) {
        issues.push(`DIMENSION_AGGREGATE_INVALID:${window.windowDays}:${dimension.kind}`);
        continue;
      }
      const expectedRate = round(dimension.outcomeCategoryCount / dimension.observedCount);
      const expectedMissingness = round(dimension.missingCount / dimension.eligibleCount);
      const expectedInterval = wilson95(dimension.outcomeCategoryCount, dimension.observedCount);
      validateExactKeys(
        dimension.uncertaintyInterval,
        INTERVAL_KEYS,
        `INTERVAL_KEY_SET_INVALID:${window.windowDays}:${dimension.kind}`,
        issues,
      );
      if (
        !approximatelyEqual(dimension.outcomeCategoryRate, expectedRate) ||
        !approximatelyEqual(dimension.missingnessRate, expectedMissingness) ||
        dimension.uncertaintyInterval.method !== expectedInterval.method ||
        dimension.uncertaintyInterval.confidenceLevel !== expectedInterval.confidenceLevel ||
        !approximatelyEqual(dimension.uncertaintyInterval.lower, expectedInterval.lower) ||
        !approximatelyEqual(dimension.uncertaintyInterval.upper, expectedInterval.upper)
      ) {
        issues.push(`DERIVED_STATISTIC_MISMATCH:${window.windowDays}:${dimension.kind}`);
      }
      if (
        dimension.observedCount < receipt.minimumStatisticalSampleSize ||
        dimension.observedCount < receipt.minimumDisclosureSampleSize ||
        [
          dimension.outcomeCategoryCount,
          dimension.observedCount - dimension.outcomeCategoryCount,
          dimension.missingCount,
          dimension.censoredCount,
        ].some((count) => count > 0 && count < receipt.minimumDisclosureSampleSize) ||
        expectedMissingness > receipt.maximumMissingnessRate
      ) {
        issues.push(`STATUS_THRESHOLD_MISMATCH:${window.windowDays}:${dimension.kind}`);
      }
    }
  }

  if (
    receipt.synthetic !== true ||
    receipt.aggregateOnly !== true ||
    receipt.containsPersonLevelOutcome !== false ||
    receipt.containsRawEmployeePerformanceData !== false ||
    receipt.containsRawPii !== false ||
    receipt.containsRawProtectedAttributes !== false
  ) {
    issues.push('PRIVACY_BOUNDARY_BYPASS');
  }
  if (
    receipt.singleCompositeQohScore !== 'DISALLOWED' ||
    receipt.humanReviewRequired !== true ||
    receipt.correlationOnly !== true ||
    receipt.causalConclusion !== 'NONE' ||
    receipt.complianceConclusion !== 'NONE' ||
    receipt.groundTruthStatus !== 'CONTESTABLE_HUMAN_REPORTED_OUTCOME' ||
    receipt.uncertaintyMethod !== 'WILSON_SCORE_95' ||
    receipt.causalClaimAllowed !== false ||
    receipt.candidateRankingAllowed !== false ||
    receipt.retrospectiveCandidateRankingAllowed !== false ||
    receipt.retrospectiveCandidateScoringAllowed !== false ||
    receipt.selectionModelOptimizationAllowed !== false ||
    receipt.modelTrainingUseAllowed !== false ||
    receipt.protectedAttributeOptimizationAllowed !== false ||
    receipt.proxyFeatureOptimizationAllowed !== false ||
    receipt.employeePerformanceActionAllowed !== false ||
    receipt.internalMobilityRankingAllowed !== false ||
    receipt.automatedEmploymentDecisionAllowed !== false ||
    receipt.humanActionAllowed !== false
  ) {
    issues.push('ACTION_OR_FEEDBACK_BYPASS');
  }
  if (
    (receipt.comparisonProtocol.kind !== 'NONE' &&
      receipt.comparisonProtocol.kind !== 'PREREGISTERED_DESCRIPTIVE_BASELINE') ||
    receipt.comparisonProtocol.preregistered !== true ||
    receipt.comparisonProtocol.causalClaimAllowed !== false ||
    (receipt.comparisonProtocol.kind === 'NONE' &&
      receipt.comparisonProtocol.baselineRef !== null) ||
    (receipt.comparisonProtocol.kind === 'PREREGISTERED_DESCRIPTIVE_BASELINE' &&
      (receipt.comparisonProtocol.baselineRef === null ||
        !REF.test(receipt.comparisonProtocol.baselineRef)))
  ) {
    issues.push('COMPARISON_PROTOCOL_BYPASS');
  }
  if (
    receipt.evidenceGate !== 'SYNTHETIC_EVIDENCE_ONLY' ||
    receipt.legalGate !== 'NOT_MET' ||
    receipt.independentAuditGate !== 'NOT_MET' ||
    receipt.customerControllerGate !== 'NOT_MET' ||
    receipt.ownerGate !== 'NOT_MET' ||
    receipt.realDataAccepted !== false ||
    receipt.realActivationAllowed !== false ||
    receipt.productionEligible !== false
  ) {
    issues.push('ACTIVATION_GATE_BYPASS');
  }
  if (
    !receipt.measurementPlanRef ||
    !receipt.lineage.hiringEvidenceAggregateRef ||
    !receipt.lineage.linkageProtocolRef ||
    receipt.lineage.linkageUsesDestroyableHmac !== true ||
    !receipt.governance.suppressionPolicyRef ||
    !receipt.governance.differencingControlRef ||
    !receipt.governance.queryBudgetPolicyRef ||
    !receipt.governance.correctionPathRef ||
    !receipt.governance.appealPathRef ||
    !receipt.governance.retentionPolicyRef ||
    !receipt.governance.accessPolicyRef ||
    receipt.governance.humanOversightStandardRef !== 'human-oversight:canonical:v1'
  ) {
    issues.push('GOVERNANCE_LINEAGE_INCOMPLETE');
  }
  if (!isCanonicalRefList(receipt.confounderPlanRefs)) {
    issues.push('QOH_CONFOUNDER_REFS_NOT_CANONICAL');
  }
  if (!isCanonicalRefList(receipt.lineage.sourceSchemaVersionRefs)) {
    issues.push('QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL');
  }
  const refs = [
    receipt.measurementPlanRef,
    receipt.measurementPlanVersionRef,
    receipt.cohortDefinitionRef,
    receipt.cohortDefinitionVersionRef,
    receipt.comparisonProtocol.protocolRef,
    receipt.missingnessPlanRef,
    ...receipt.confounderPlanRefs,
    receipt.lineage.hiringEvidenceAggregateRef,
    receipt.lineage.hrisOutcomeSnapshotRef,
    receipt.lineage.structuredHumanOutcomeReceiptRef,
    receipt.lineage.newHireExperienceReceiptRef,
    receipt.lineage.linkageProtocolRef,
    ...receipt.lineage.sourceSchemaVersionRefs,
    receipt.lineage.provenanceChainRef,
    ...Object.values(receipt.governance),
  ];
  if (
    refs.some((ref) => !REF.test(ref)) ||
    new Set(receipt.confounderPlanRefs).size !== receipt.confounderPlanRefs.length ||
    new Set(receipt.lineage.sourceSchemaVersionRefs).size !==
      receipt.lineage.sourceSchemaVersionRefs.length
  ) {
    issues.push('REFERENCE_FORMAT_OR_UNIQUENESS_INVALID');
  }
  const hasCorrectionReason = receipt.correctionReasonRef !== null;
  const hasSupersededReceipt = receipt.supersedesReceiptDigest !== null;
  if (
    hasCorrectionReason !== hasSupersededReceipt ||
    (receipt.correctionReasonRef !== null && !REF.test(receipt.correctionReasonRef)) ||
    (receipt.supersedesReceiptDigest !== null && !DIGEST.test(receipt.supersedesReceiptDigest)) ||
    (hasSupersededReceipt && receipt.correctionStatus !== 'SUPERSEDING_SYNTHETIC_CORRECTION') ||
    (!hasSupersededReceipt && receipt.correctionStatus !== 'ORIGINAL') ||
    receipt.supersedesReceiptDigest === receipt.receiptDigest
  ) {
    issues.push('CORRECTION_SUPERSESSION_INVALID');
  }
  if (hasCorrectionReason || hasSupersededReceipt || receipt.correctionStatus !== 'ORIGINAL') {
    issues.push('CORRECTION_TRUSTED_PREVIOUS_RECEIPT_REQUIRED');
  }
  if (
    (receipt.status !== 'SYNTHETIC_DESCRIPTIVE_ASSOCIATION' &&
      receipt.status !== 'INSUFFICIENT_DATA') ||
    (receipt.status === 'SYNTHETIC_DESCRIPTIVE_ASSOCIATION' &&
      receipt.insufficiencyReasons.length !== 0) ||
    (receipt.status === 'INSUFFICIENT_DATA' && receipt.insufficiencyReasons.length === 0) ||
    new Set(receipt.insufficiencyReasons).size !== receipt.insufficiencyReasons.length ||
    receipt.insufficiencyReasons.some(
      (reason) => !(INSUFFICIENCY_REASONS as readonly string[]).includes(reason),
    )
  ) {
    issues.push('STATUS_REASON_MISMATCH');
  }
  if (!DIGEST.test(receipt.receiptDigest)) {
    issues.push('RECEIPT_DIGEST_INVALID');
  } else {
    const { receiptDigest, ...unsigned } = receipt;
    if (computeSyntheticQualityOfHireReceiptDigest(unsigned) !== receiptDigest) {
      issues.push('QOH_RECEIPT_DIGEST_MISMATCH');
    }
  }

  if (issues.length > 0) return { valid: false, issues, status: 'TRACE_FAIL_CLOSED' };
  if (receipt.status === 'INSUFFICIENT_DATA') {
    return { valid: true, issues: [], status: 'SMALL_COHORT_SUPPRESSED' };
  }
  return { valid: true, issues: [], status: 'DESCRIPTIVE_ASSOCIATION_ONLY' };
}

export const SYNTHETIC_QUALITY_OF_HIRE_RECEIPT = {
  schemaVersion: 'quality-of-hire-evidence/v1',
  intelligenceEvaluationAuthority: 'intelligence-evaluation/v1',
  capabilityRef: 'capability:qoh:v1',
  synthetic: true,
  aggregateOnly: true,
  outputMode: 'AGGREGATE_RESEARCH_EVIDENCE',
  tenantRef: 'tenant_aaaaaaaaaaaaaaaa',
  cohortRef: 'cohort_bbbbbbbbbbbbbbbb',
  measurementPlanRef: 'measurement-plan:qoh:synthetic:v1',
  measurementPlanVersionRef: 'measurement-plan-version:qoh:synthetic:v1',
  preregistrationDigest: `sha256:${'1'.repeat(64)}`,
  cohortDefinitionRef: 'cohort-definition:qoh:synthetic:v1',
  cohortDefinitionVersionRef: 'cohort-definition-version:qoh:synthetic:v1',
  comparisonProtocol: {
    kind: 'NONE',
    protocolRef: 'comparison-protocol:qoh:none:v1',
    baselineRef: null,
    preregistered: true,
    causalClaimAllowed: false,
  },
  dataCutoffAt: '2026-07-13T12:00:00Z',
  minimumStatisticalSampleSize: 30,
  minimumDisclosureSampleSize: 20,
  maximumMissingnessRate: 0.1,
  missingnessPlanRef: 'missingness:qoh:synthetic:v1',
  confounderPlanRefs: [
    'confounder:qoh:hire-period:v1',
    'confounder:qoh:location:v1',
    'confounder:qoh:manager-context:v1',
    'confounder:qoh:role-family:v1',
  ],
  uncertaintyMethod: 'WILSON_SCORE_95',
  groundTruthStatus: 'CONTESTABLE_HUMAN_REPORTED_OUTCOME',
  lineage: {
    hiringEvidenceAggregateRef: 'evidence-aggregate:hiring:synthetic:v1',
    hrisOutcomeSnapshotRef: 'hris-outcome-snapshot:synthetic:v1',
    structuredHumanOutcomeReceiptRef: 'human-outcome-receipt:synthetic:v1',
    newHireExperienceReceiptRef: 'new-hire-experience-receipt:synthetic:v1',
    linkageProtocolRef: 'linkage-protocol:destroyable-hmac:v1',
    linkageUsesDestroyableHmac: true,
    sourceSchemaVersionRefs: ['schema:hiring-evidence:v1', 'schema:hris-outcome:v1'],
    provenanceChainRef: 'provenance:qoh:synthetic:v1',
  },
  governance: {
    purposeRef: 'purpose:qoh:research-only:v1',
    legalBasisReviewRef: 'legal-review:qoh:not-met:v1',
    retentionPolicyRef: 'retention:qoh:synthetic:v1',
    accessPolicyRef: 'access:qoh:aggregate-only:v1',
    suppressionPolicyRef: 'suppression:qoh:small-cohort:v1',
    differencingControlRef: 'differencing-control:qoh:synthetic:v1',
    queryBudgetPolicyRef: 'query-budget:qoh:synthetic:v1',
    erasurePropagationRef: 'erasure:qoh:propagation:v1',
    correctionPathRef: 'correction:qoh:synthetic:v1',
    appealPathRef: 'appeal:qoh:synthetic:v1',
    auditPolicyRef: 'audit-policy:qoh:synthetic:v1',
    humanOversightStandardRef: 'human-oversight:canonical:v1',
  },
  containsRawPii: false,
  containsRawProtectedAttributes: false,
  containsRawEmployeePerformanceData: false,
  containsPersonLevelOutcome: false,
  causalClaimAllowed: false,
  candidateRankingAllowed: false,
  retrospectiveCandidateRankingAllowed: false,
  retrospectiveCandidateScoringAllowed: false,
  automatedEmploymentDecisionAllowed: false,
  modelTrainingUseAllowed: false,
  selectionModelOptimizationAllowed: false,
  protectedAttributeOptimizationAllowed: false,
  proxyFeatureOptimizationAllowed: false,
  employeePerformanceActionAllowed: false,
  internalMobilityRankingAllowed: false,
  singleCompositeQohScore: 'DISALLOWED',
  humanReviewRequired: true,
  humanActionAllowed: false,
  correctionReasonRef: null,
  supersedesReceiptDigest: null,
  correctionStatus: 'ORIGINAL',
  status: 'SYNTHETIC_DESCRIPTIVE_ASSOCIATION',
  insufficiencyReasons: [],
  observationWindows: ([90, 180] as const).map((windowDays) => ({
    windowDays,
    dimensions: (
      ['RETENTION', 'RAMP_MILESTONE', 'STRUCTURED_MANAGER_OUTCOME', 'NEW_HIRE_EXPERIENCE'] as const
    ).map((kind, index) => ({
      kind,
      outcomeCategoryRef: `category_${String(index + 1).repeat(16)}`,
      visibility: 'VISIBLE' as const,
      eligibleCount: 200,
      observedCount: 160,
      missingCount: 20,
      censoredCount: 20,
      outcomeCategoryCount: 100,
      missingnessRate: 0.1,
      outcomeCategoryRate: 0.625,
      uncertaintyInterval: {
        lower: 0.547882,
        upper: 0.696257,
        confidenceLevel: 0.95 as const,
        method: 'WILSON_SCORE' as const,
      },
    })),
  })),
  correlationOnly: true,
  causalConclusion: 'NONE',
  complianceConclusion: 'NONE',
  evidenceGate: 'SYNTHETIC_EVIDENCE_ONLY',
  legalGate: 'NOT_MET',
  independentAuditGate: 'NOT_MET',
  customerControllerGate: 'NOT_MET',
  ownerGate: 'NOT_MET',
  realDataAccepted: false,
  realActivationAllowed: false,
  productionEligible: false,
  receiptDigest: 'sha256:b554cc5e38989be32e69841d554276272d7e72d1aeebf8cb30316e19610c6855',
} as const satisfies SyntheticQualityOfHireEvidenceReceiptV1;
