import { getShellServices } from '../shell-services';
import type { InterviewEvidenceShellServices } from '../shell-services';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';

export type ScreeningSourceKind = 'TRANSCRIPT_SEGMENT' | 'CITATION_CLAIM';
export type ScreeningCoverage =
  | 'SUPPORTED'
  | 'UNSUPPORTED_LANGUAGE'
  | 'MALFORMED_INPUT'
  | 'POLICY_UNAVAILABLE';
export type ScreeningDisposition = 'CLEAR' | 'REVIEW_REQUIRED' | 'SCREENING_UNAVAILABLE';
export type ProtectedCategory =
  | 'AGE'
  | 'RELIGION_BELIEF'
  | 'ETHNICITY_RACE'
  | 'TRADE_UNION'
  | 'HEALTH_DISABILITY'
  | 'SEX_GENDER_ORIENTATION'
  | 'MARITAL_PARENTAL_STATUS'
  | 'POLITICAL_OPINION'
  | 'PHILOSOPHICAL_BELIEF'
  | 'CRIMINAL_RECORD'
  | 'NATIVE_LANGUAGE_ACCENT'
  | 'ASSOCIATION_MEMBERSHIP'
  | 'PREGNANCY_MATERNITY';
export type ScreeningSignal = 'PROTECTED_ATTRIBUTE_MENTION' | 'QUESTION_LIKE_PROTECTED_MENTION';

export type LiveScreeningRequest =
  | { sourceKind: 'TRANSCRIPT_SEGMENT'; transcriptKey: string; segmentIndex: number }
  | { sourceKind: 'CITATION_CLAIM'; citationKey: string };

export interface LiveScreeningEvidence {
  findingSetRef: string;
  runId: string;
  policyRef: string;
  coverage: ScreeningCoverage;
  disposition: ScreeningDisposition;
  source: {
    kind: ScreeningSourceKind;
    canonicalSourceRef: string;
    segmentIndex: number | null;
  };
  findings: Array<{
    category: ProtectedCategory;
    signal: ScreeningSignal;
    sourceKind: ScreeningSourceKind;
    span: { startInclusive: number; endExclusive: number; segmentIndex: number | null };
  }>;
  evidenceId: string;
  schemaVersion: 'screening_evidence_v1';
  occurredAt: string;
  spanUnit: 'UTF16_CODE_UNIT';
}

export interface LiveScreeningReceipt extends LiveScreeningEvidence {
  replayed: boolean;
}

const SOURCE_KINDS: readonly ScreeningSourceKind[] = ['TRANSCRIPT_SEGMENT', 'CITATION_CLAIM'];
const COVERAGES: readonly ScreeningCoverage[] = [
  'SUPPORTED',
  'UNSUPPORTED_LANGUAGE',
  'MALFORMED_INPUT',
  'POLICY_UNAVAILABLE',
];
const DISPOSITIONS: readonly ScreeningDisposition[] = [
  'CLEAR',
  'REVIEW_REQUIRED',
  'SCREENING_UNAVAILABLE',
];
const CATEGORIES: readonly ProtectedCategory[] = [
  'AGE',
  'RELIGION_BELIEF',
  'ETHNICITY_RACE',
  'TRADE_UNION',
  'HEALTH_DISABILITY',
  'SEX_GENDER_ORIENTATION',
  'MARITAL_PARENTAL_STATUS',
  'POLITICAL_OPINION',
  'PHILOSOPHICAL_BELIEF',
  'CRIMINAL_RECORD',
  'NATIVE_LANGUAGE_ACCENT',
  'ASSOCIATION_MEMBERSHIP',
  'PREGNANCY_MATERNITY',
];
const SIGNALS: readonly ScreeningSignal[] = [
  'PROTECTED_ATTRIBUTE_MENTION',
  'QUESTION_LIKE_PROTECTED_MENTION',
];
const REQUEST_KEY = /^scrq_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FINDING_SET_REF = /^fsr_[0-9a-f]{64}$/;
const RUN_ID = /^psr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const POLICY_REF = /^paspolicy_v[0-9]+$/;
const CANONICAL_REF = /^[A-Za-z0-9._:/-]{1,256}$/;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

async function resolveServices(): Promise<InterviewEvidenceShellServices> {
  const services = getShellServices();
  const ready = await services.auth.ready();
  if (!ready.ok) {
    const error = new Error(ready.error || ready.reason);
    error.name =
      ready.reason === 'unauthenticated'
        ? 'InterviewEvidenceUnauthenticatedError'
        : 'InterviewEvidenceAuthError';
    throw error;
  }
  return services;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  where: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AtsContractError(`${where} object değil`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new AtsContractError(`${where} kapalı şemayla uyumsuz`);
  }
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AtsContractError(`${where} boş/geçersiz`);
  }
  return value;
}

function nonNegativeInt(value: unknown, where: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new AtsContractError(`${where} non-negative safe integer değil`);
  }
  return value as number;
}

function nullableSegmentIndex(value: unknown, where: string): number | null {
  return value === null ? null : nonNegativeInt(value, where);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AtsContractError(`${where} kapalı küme dışında`);
  }
  return value as T;
}

/** 2xx gövdesini unknown/missing alanlar ve çekirdek invariant'ları için fail-closed doğrular. */
export function decodeScreeningEvidence(raw: unknown): LiveScreeningEvidence {
  const d = exactObject(
    raw,
    [
      'findingSetRef',
      'runId',
      'policyRef',
      'coverage',
      'disposition',
      'source',
      'findings',
      'evidenceId',
      'schemaVersion',
      'occurredAt',
      'spanUnit',
    ],
    'screening cevabı',
  );
  const findingSetRef = nonEmpty(d.findingSetRef, 'findingSetRef');
  const runId = nonEmpty(d.runId, 'runId');
  const policyRef = nonEmpty(d.policyRef, 'policyRef');
  if (!FINDING_SET_REF.test(findingSetRef) || !RUN_ID.test(runId) || !POLICY_REF.test(policyRef)) {
    throw new AtsContractError('screening opak ref biçimlerinden biri geçersiz');
  }
  const coverage = enumValue(d.coverage, COVERAGES, 'coverage');
  const disposition = enumValue(d.disposition, DISPOSITIONS, 'disposition');
  const sourceRaw = exactObject(
    d.source,
    ['kind', 'canonicalSourceRef', 'segmentIndex'],
    'screening.source',
  );
  const sourceKind = enumValue(sourceRaw.kind, SOURCE_KINDS, 'source.kind');
  const canonicalSourceRef = nonEmpty(sourceRaw.canonicalSourceRef, 'source.canonicalSourceRef');
  if (!CANONICAL_REF.test(canonicalSourceRef)) {
    throw new AtsContractError('source.canonicalSourceRef güvenli opak ref değil');
  }
  const sourceSegmentIndex = nullableSegmentIndex(sourceRaw.segmentIndex, 'source.segmentIndex');
  if (
    (sourceKind === 'TRANSCRIPT_SEGMENT' && sourceSegmentIndex === null) ||
    (sourceKind === 'CITATION_CLAIM' && sourceSegmentIndex !== null)
  ) {
    throw new AtsContractError('source kind/segmentIndex bağı tutarsız');
  }
  if (!Array.isArray(d.findings)) throw new AtsContractError('findings dizi değil');
  const findings = d.findings.map((rawFinding, index) => {
    const finding = exactObject(
      rawFinding,
      ['category', 'signal', 'sourceKind', 'span'],
      `findings[${index}]`,
    );
    const findingSourceKind = enumValue(
      finding.sourceKind,
      SOURCE_KINDS,
      `findings[${index}].sourceKind`,
    );
    const span = exactObject(
      finding.span,
      ['startInclusive', 'endExclusive', 'segmentIndex'],
      `findings[${index}].span`,
    );
    const startInclusive = nonNegativeInt(span.startInclusive, `findings[${index}].span.start`);
    const endExclusive = nonNegativeInt(span.endExclusive, `findings[${index}].span.end`);
    const segmentIndex = nullableSegmentIndex(
      span.segmentIndex,
      `findings[${index}].span.segmentIndex`,
    );
    if (
      endExclusive <= startInclusive ||
      findingSourceKind !== sourceKind ||
      segmentIndex !== sourceSegmentIndex
    ) {
      throw new AtsContractError(`findings[${index}] kaynak/span bağı tutarsız`);
    }
    return {
      category: enumValue(finding.category, CATEGORIES, `findings[${index}].category`),
      signal: enumValue(finding.signal, SIGNALS, `findings[${index}].signal`),
      sourceKind: findingSourceKind,
      span: { startInclusive, endExclusive, segmentIndex },
    };
  });
  const expectedDisposition: ScreeningDisposition =
    coverage !== 'SUPPORTED'
      ? 'SCREENING_UNAVAILABLE'
      : findings.length === 0
        ? 'CLEAR'
        : 'REVIEW_REQUIRED';
  if (disposition !== expectedDisposition || (coverage !== 'SUPPORTED' && findings.length > 0)) {
    throw new AtsContractError('coverage/findings/disposition invariantı tutarsız');
  }
  const evidenceId = nonEmpty(d.evidenceId, 'evidenceId');
  const occurredAt = nonEmpty(d.occurredAt, 'occurredAt');
  if (
    d.schemaVersion !== 'screening_evidence_v1' ||
    d.spanUnit !== 'UTF16_CODE_UNIT' ||
    !OFFSET_DATE_TIME.test(occurredAt) ||
    Number.isNaN(Date.parse(occurredAt))
  ) {
    throw new AtsContractError('schemaVersion/spanUnit/occurredAt sözleşmesi geçersiz');
  }
  return {
    findingSetRef,
    runId,
    policyRef,
    coverage,
    disposition,
    source: { kind: sourceKind, canonicalSourceRef, segmentIndex: sourceSegmentIndex },
    findings,
    evidenceId,
    schemaVersion: 'screening_evidence_v1',
    occurredAt,
    spanUnit: 'UTF16_CODE_UNIT',
  };
}

export function createScreeningRequestKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new AtsClientValidationError('Güvenli istek kimliği üretilemedi; tarama başlatılmadı.');
  }
  const key = `scrq_${globalThis.crypto.randomUUID()}`;
  if (!REQUEST_KEY.test(key)) {
    throw new AtsClientValidationError('Güvenli istek kimliği biçimi doğrulanamadı.');
  }
  return key;
}

export async function requestLiveScreening(
  interviewId: string,
  request: LiveScreeningRequest,
  idempotencyKey: string,
): Promise<LiveScreeningReceipt> {
  if (!interviewId.trim()) throw new AtsClientValidationError('interviewId zorunlu.');
  if (!REQUEST_KEY.test(idempotencyKey)) {
    throw new AtsClientValidationError('Screening istek kimliği geçersiz.');
  }
  if (
    (request.sourceKind === 'TRANSCRIPT_SEGMENT' &&
      (!request.transcriptKey.trim() ||
        !Number.isSafeInteger(request.segmentIndex) ||
        request.segmentIndex < 0)) ||
    (request.sourceKind === 'CITATION_CLAIM' && !request.citationKey.trim())
  ) {
    throw new AtsClientValidationError('Screening kaynak referansı geçersiz.');
  }
  const services = await resolveServices();
  const response = await services.http.post<unknown>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/screenings`,
    request,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-ATS-Idempotency-Key': idempotencyKey,
      },
    },
  );
  const replayHeader = String(
    (response as { headers?: Record<string, unknown> }).headers?.['x-ats-replay'] ?? '',
  )
    .trim()
    .toLowerCase();
  if (
    (response.status !== 201 && response.status !== 200) ||
    (response.status === 201 && replayHeader !== 'false') ||
    (response.status === 200 && replayHeader !== 'true')
  ) {
    throw new AtsContractError('screening 201/200 replay header sözleşmesi geçersiz');
  }
  const evidence = decodeScreeningEvidence(response.data);
  const expectedSourceRef =
    request.sourceKind === 'TRANSCRIPT_SEGMENT' ? request.transcriptKey : request.citationKey;
  const expectedSegmentIndex =
    request.sourceKind === 'TRANSCRIPT_SEGMENT' ? request.segmentIndex : null;
  if (
    evidence.source.kind !== request.sourceKind ||
    evidence.source.canonicalSourceRef !== expectedSourceRef ||
    evidence.source.segmentIndex !== expectedSegmentIndex
  ) {
    throw new AtsContractError(
      'screening cevabı gönderilen canonical source pointer ile bağlı değil',
    );
  }
  return { ...evidence, replayed: response.status === 200 };
}

export async function fetchLiveScreening(
  interviewId: string,
  findingSetRef: string,
): Promise<LiveScreeningEvidence> {
  if (!interviewId.trim()) throw new AtsClientValidationError('interviewId zorunlu.');
  if (!FINDING_SET_REF.test(findingSetRef)) {
    throw new AtsClientValidationError('Bulgu-kümesi referansı fsr_<64-hex> biçiminde olmalı.');
  }
  const services = await resolveServices();
  const response = await services.http.get<unknown>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/screenings/${encodeURIComponent(findingSetRef)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (response.status !== 200) throw new AtsContractError('screening GET 200 dönmedi');
  return decodeScreeningEvidence(response.data);
}
