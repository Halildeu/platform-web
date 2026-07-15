import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createScreeningRequestKey,
  decodeScreeningEvidence,
  fetchLiveScreening,
  requestLiveScreening,
} from './liveScreeningApi';
import { AtsContractError } from '../transcripts/liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';

const httpPost = vi.fn();
const httpGet = vi.fn();
const FSR = `fsr_${'a'.repeat(64)}`;
const EVIDENCE = {
  findingSetRef: FSR,
  runId: 'psr_00000000-0000-4000-8000-000000000001',
  policyRef: 'paspolicy_v1',
  coverage: 'SUPPORTED',
  disposition: 'REVIEW_REQUIRED',
  source: {
    kind: 'TRANSCRIPT_SEGMENT',
    canonicalSourceRef: 'iv-1/tr-a',
    segmentIndex: 0,
  },
  findings: [
    {
      category: 'AGE',
      signal: 'QUESTION_LIKE_PROTECTED_MENTION',
      sourceKind: 'TRANSCRIPT_SEGMENT',
      span: { startInclusive: 0, endExclusive: 3, segmentIndex: 0 },
    },
  ],
  evidenceId: 'ev-screen-1',
  schemaVersion: 'screening_evidence_v1',
  occurredAt: '2026-07-15T09:00:00Z',
  spanUnit: 'UTF16_CODE_UNIT',
};

beforeEach(() => {
  httpPost.mockReset();
  httpGet.mockReset();
  __resetShellServicesForTests();
  configureShellServices({
    http: { post: httpPost, get: httpGet } as never,
    auth: { getToken: () => 't', ready: () => Promise.resolve({ ok: true }), getEpoch: () => 0 },
  });
});

describe('screening API — pointer-only request + replay sözleşmesi', () => {
  test('201 + X-ATS-Replay:false yeni kanıt; ham metin requestte yok', async () => {
    httpPost.mockResolvedValueOnce({
      status: 201,
      headers: { 'x-ats-replay': 'false' },
      data: EVIDENCE,
    });
    const request = {
      sourceKind: 'TRANSCRIPT_SEGMENT' as const,
      transcriptKey: 'iv-1/tr-a',
      segmentIndex: 0,
    };
    const key = 'scrq_00000000-0000-4000-8000-000000000001';
    const result = await requestLiveScreening('iv-1', request, key);
    expect(result.replayed).toBe(false);
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/screenings',
      request,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-ATS-Idempotency-Key': key }),
      }),
    );
    expect(JSON.stringify(httpPost.mock.calls[0]?.[1])).not.toMatch(/text|claim|Kaç yaş/i);
  });

  test('200 yalnız replay:true ile kabul edilir; 201/200 header çelişkileri fail-closed', async () => {
    const request = { sourceKind: 'CITATION_CLAIM' as const, citationKey: 'iv-1/cit-a' };
    const citationEvidence = {
      ...EVIDENCE,
      source: { kind: 'CITATION_CLAIM', canonicalSourceRef: 'iv-1/cit-a', segmentIndex: null },
      findings: EVIDENCE.findings.map((finding) => ({
        ...finding,
        sourceKind: 'CITATION_CLAIM',
        span: { ...finding.span, segmentIndex: null },
      })),
    };
    const key = 'scrq_00000000-0000-4000-8000-000000000002';
    httpPost.mockResolvedValueOnce({
      status: 200,
      headers: { 'x-ats-replay': 'true' },
      data: citationEvidence,
    });
    expect((await requestLiveScreening('iv-1', request, key)).replayed).toBe(true);
    httpPost.mockResolvedValueOnce({ status: 200, headers: {}, data: citationEvidence });
    await expect(requestLiveScreening('iv-1', request, key)).rejects.toBeInstanceOf(
      AtsContractError,
    );
    httpPost.mockResolvedValueOnce({
      status: 201,
      headers: { 'x-ats-replay': 'true' },
      data: citationEvidence,
    });
    await expect(requestLiveScreening('iv-1', request, key)).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test('2xx evidence gönderilen pointer ile bire bir bağlı değilse sonuç gösterilmez', async () => {
    httpPost.mockResolvedValueOnce({
      status: 201,
      headers: { 'x-ats-replay': 'false' },
      data: { ...EVIDENCE, source: { ...EVIDENCE.source, canonicalSourceRef: 'iv-1/tr-b' } },
    });
    await expect(
      requestLiveScreening(
        'iv-1',
        { sourceKind: 'TRANSCRIPT_SEGMENT', transcriptKey: 'iv-1/tr-a', segmentIndex: 0 },
        'scrq_00000000-0000-4000-8000-000000000003',
      ),
    ).rejects.toBeInstanceOf(AtsContractError);
  });

  test('GET exact path + kapalı decoder', async () => {
    httpGet.mockResolvedValueOnce({ status: 200, data: EVIDENCE });
    expect((await fetchLiveScreening('iv-1', FSR)).findingSetRef).toBe(FSR);
    expect(httpGet).toHaveBeenCalledWith(
      `/ats/v1/interviews/iv-1/screenings/${FSR}`,
      expect.anything(),
    );
  });
});

describe('screening decoder — strict schema ve çekirdek invariantları', () => {
  test('geçerli evidence kabul edilir', () => {
    expect(decodeScreeningEvidence(EVIDENCE).findings).toHaveLength(1);
  });

  test.each([
    ['unknown top-level', { ...EVIDENCE, score: 0.9 }],
    ['missing spanUnit', { ...EVIDENCE, spanUnit: undefined }],
    [
      'bilinmeyen kategori',
      { ...EVIDENCE, findings: [{ ...EVIDENCE.findings[0], category: 'MAYBE' }] },
    ],
    ['CLEAR ama bulgulu', { ...EVIDENCE, disposition: 'CLEAR' }],
    ['desteksiz coverage ama REVIEW_REQUIRED', { ...EVIDENCE, coverage: 'POLICY_UNAVAILABLE' }],
    [
      'source/finding segment bağı ayrışık',
      {
        ...EVIDENCE,
        findings: [
          { ...EVIDENCE.findings[0], span: { ...EVIDENCE.findings[0].span, segmentIndex: 1 } },
        ],
      },
    ],
    ['yanlış span unit', { ...EVIDENCE, spanUnit: 'CODEPOINT' }],
    ['gevşek tarih stringi', { ...EVIDENCE, occurredAt: '0' }],
  ])('%s → AtsContractError', (_name, value) => {
    expect(() => decodeScreeningEvidence(value)).toThrow(AtsContractError);
  });

  test('CLEAR yalnız SUPPORTED + boş findings ile kabul edilir', () => {
    const clear = decodeScreeningEvidence({ ...EVIDENCE, findings: [], disposition: 'CLEAR' });
    expect(clear.disposition).toBe('CLEAR');
  });

  test('istemci anahtarı sistem üretimli UUIDv4 ve PII taşımıyor', () => {
    expect(createScreeningRequestKey()).toMatch(
      /^scrq_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
