import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_CLAIM_LENGTH, requestLiveCitation } from './liveCitationApi';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';

const httpPost = vi.fn();

beforeEach(() => {
  httpPost.mockReset();
  __resetShellServicesForTests();
  configureShellServices({
    http: { post: httpPost } as never,
    auth: { getToken: () => 't', ready: () => Promise.resolve({ ok: true }), getEpoch: () => 0 },
  });
});

const RECEIPT = {
  citationKey: 'iv-1/cit-abc',
  evidenceId: 'ev-1',
  entailment: 'SUPPORTED',
  resolvedRefCount: 2,
};

describe('requestLiveCitation — kontrat (CitationApiController kaynak-kanıtlı)', () => {
  test('doğru path + gövde {transcriptKey, claim}; claim trim edilir', async () => {
    httpPost.mockResolvedValueOnce({ data: RECEIPT });
    const r = await requestLiveCitation('iv-1', 'iv-1/tr-x', '  iddia metni  ');
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/citations',
      { transcriptKey: 'iv-1/tr-x', claim: 'iddia metni' },
      expect.anything(),
    );
    expect(r).toEqual(RECEIPT);
  });

  test('boş claim + uzunluk sınırı İSTEK ATILMADAN reddedilir (fail-closed)', async () => {
    await expect(requestLiveCitation('iv-1', 'k', '   ')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    await expect(
      requestLiveCitation('iv-1', 'k', 'x'.repeat(MAX_CLAIM_LENGTH + 1)),
    ).rejects.toBeInstanceOf(AtsClientValidationError);
    await expect(requestLiveCitation('iv-1', '  ', 'iddia')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    expect(httpPost).not.toHaveBeenCalled();
  });

  test('BİLİNMEYEN entailment sessizce öneriye dönüşmez → AtsContractError', async () => {
    httpPost.mockResolvedValueOnce({ data: { ...RECEIPT, entailment: 'MAYBE' } });
    await expect(requestLiveCitation('iv-1', 'k', 'iddia')).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test.each([
    ['citationKey yok', { ...RECEIPT, citationKey: '' }],
    ['evidenceId yok', { ...RECEIPT, evidenceId: undefined }],
    ['refCount negatif', { ...RECEIPT, resolvedRefCount: -1 }],
    ['refCount string', { ...RECEIPT, resolvedRefCount: '2' }],
    ['refCount kesirli 1.5', { ...RECEIPT, resolvedRefCount: 1.5 }],
    ['refCount NaN', { ...RECEIPT, resolvedRefCount: NaN }],
    ['refCount Infinity', { ...RECEIPT, resolvedRefCount: Infinity }],
    ['refCount unsafe-integer', { ...RECEIPT, resolvedRefCount: Number.MAX_SAFE_INTEGER + 1 }],
  ])('bozuk 201 gövdesi (%s) → AtsContractError', async (_n, body) => {
    httpPost.mockResolvedValueOnce({ data: body });
    await expect(requestLiveCitation('iv-1', 'k', 'iddia')).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test('auth.ready unauthenticated → istek ATILMAZ', async () => {
    __resetShellServicesForTests();
    configureShellServices({
      http: { post: httpPost } as never,
      auth: {
        getToken: () => null,
        ready: () => Promise.resolve({ ok: false, reason: 'unauthenticated' }),
        getEpoch: () => 0,
      },
    });
    await expect(requestLiveCitation('iv-1', 'k', 'iddia')).rejects.toMatchObject({
      name: 'InterviewEvidenceUnauthenticatedError',
    });
    expect(httpPost).not.toHaveBeenCalled();
  });
});
