import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  fetchLiveReviewCases,
  finalizeLiveReviewCase,
  openLiveReviewCase,
  transitionLiveReviewCase,
} from './liveReviewApi';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';

const httpGet = vi.fn();
const httpPost = vi.fn();

beforeEach(() => {
  httpGet.mockReset();
  httpPost.mockReset();
  __resetShellServicesForTests();
  configureShellServices({
    http: { get: httpGet, post: httpPost } as never,
    auth: { getToken: () => 't', ready: () => Promise.resolve({ ok: true }), getEpoch: () => 0 },
  });
});

describe('fetchLiveReviewCases — READ fail-soft / kontrat fail-closed', () => {
  test('bilinen state known, TANINMAYAN non-empty state unknown olarak döner (liste kırılmaz)', async () => {
    httpGet.mockResolvedValueOnce({
      data: [
        { caseKey: 'case-1', state: 'OPEN' },
        { caseKey: 'case-2', state: 'SOME_FUTURE_STATE' },
      ],
    });
    const cases = await fetchLiveReviewCases('iv-1');
    expect(httpGet).toHaveBeenCalledWith('/ats/v1/interviews/iv-1/review-cases', expect.anything());
    expect(cases[0].state).toEqual({ kind: 'known', value: 'OPEN' });
    expect(cases[1].state).toEqual({ kind: 'unknown', raw: 'SOME_FUTURE_STATE' });
  });

  test.each([
    ['state eksik', [{ caseKey: 'c' }]],
    ['state null', [{ caseKey: 'c', state: null }]],
    ['state boş', [{ caseKey: 'c', state: '  ' }]],
    ['state non-string', [{ caseKey: 'c', state: 7 }]],
    ['caseKey yok', [{ state: 'OPEN' }]],
    ['dizi değil', { bogus: true }],
  ])('malformed liste (%s) → AtsContractError', async (_n, body) => {
    httpGet.mockResolvedValueOnce({ data: body });
    await expect(fetchLiveReviewCases('iv-1')).rejects.toBeInstanceOf(AtsContractError);
  });
});

describe('openLiveReviewCase', () => {
  test('doğru gövde + yalnız 201 {caseKey} kabul', async () => {
    httpPost.mockResolvedValueOnce({ status: 201, data: { caseKey: 'case-9' } });
    const key = await openLiveReviewCase('iv-1', ['ev-1'], 'iv-1/cit-x');
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/review-cases',
      { sourceEvidenceRefs: ['ev-1'], aiOutputVersionRef: 'iv-1/cit-x' },
      expect.anything(),
    );
    expect(key).toBe('case-9');
  });

  test('beklenmeyen 2xx (200) fail-closed', async () => {
    httpPost.mockResolvedValueOnce({ status: 200, data: { caseKey: 'case-9' } });
    await expect(openLiveReviewCase('iv-1', ['ev-1'], 'ref')).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test('boş refs istek atılmadan reddedilir', async () => {
    await expect(openLiveReviewCase('iv-1', [], 'ref')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    await expect(openLiveReviewCase('iv-1', ['  '], 'ref')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    await expect(openLiveReviewCase('iv-1', ['ev-1'], ' ')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    expect(httpPost).not.toHaveBeenCalled();
  });
});

describe('transitionLiveReviewCase', () => {
  test('yalnız 204 kabul; enum-dışı action client-reject (istek yok)', async () => {
    httpPost.mockResolvedValueOnce({ status: 204, data: undefined });
    await transitionLiveReviewCase('iv-1', 'case-1', 'START', { oversightRoleRef: 'role-x' });
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/review-case/transition',
      { caseKey: 'case-1', action: 'START', ref: undefined, oversightRoleRef: 'role-x' },
      expect.anything(),
    );
    await expect(
      transitionLiveReviewCase('iv-1', 'case-1', 'APPROVE' as never),
    ).rejects.toBeInstanceOf(AtsClientValidationError);
    httpPost.mockResolvedValueOnce({ status: 200, data: {} });
    await expect(
      transitionLiveReviewCase('iv-1', 'case-1', 'EDIT', { ref: 'r' }),
    ).rejects.toBeInstanceOf(AtsContractError);
  });
});

describe('finalizeLiveReviewCase — kesin kontrat (Codex şart-6)', () => {
  test('200 {caseKey,evidenceId} + caseKey eşleşmesi', async () => {
    httpPost.mockResolvedValueOnce({
      status: 200,
      data: { caseKey: 'case-1', evidenceId: 'ev-f' },
    });
    const r = await finalizeLiveReviewCase('iv-1', 'case-1', ' decision-A ');
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/review-case/finalize',
      { caseKey: 'case-1', decisionOutcomeRef: 'decision-A' },
      expect.anything(),
    );
    expect(r).toEqual({ caseKey: 'case-1', evidenceId: 'ev-f' });
  });

  test.each([
    ['evidenceId eksik', { status: 200, data: { caseKey: 'case-1' } }],
    ['caseKey boş', { status: 200, data: { caseKey: '', evidenceId: 'ev' } }],
    ['dönen caseKey FARKLI', { status: 200, data: { caseKey: 'case-BAŞKA', evidenceId: 'ev' } }],
    ['beklenmeyen 2xx (201)', { status: 201, data: { caseKey: 'case-1', evidenceId: 'ev' } }],
  ])('bozuk finalize cevabı (%s) → AtsContractError', async (_n, resp) => {
    httpPost.mockResolvedValueOnce(resp);
    await expect(finalizeLiveReviewCase('iv-1', 'case-1', 'd')).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test('boş decisionOutcomeRef istek atılmadan reddedilir', async () => {
    await expect(finalizeLiveReviewCase('iv-1', 'case-1', '   ')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    expect(httpPost).not.toHaveBeenCalled();
  });
});
