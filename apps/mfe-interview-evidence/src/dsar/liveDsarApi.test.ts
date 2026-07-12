import { beforeEach, describe, expect, test, vi } from 'vitest';
import { classifyDsarError, executeLiveErasure, receiveLiveDsar } from './liveDsarApi';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';
import { canonicalizeScope } from './opaqueRefs';

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

const SCOPE = canonicalizeScope({
  transcriptKeys: ['tr-1'],
  citationKeys: [],
  exportArtifactKeys: [],
  reviewCaseKeys: [],
  tombstoneTargetEvidenceIds: [],
});

describe('receiveLiveDsar — yalnız 201 {dsarKey}; subjectRef + reasonCode ZORUNLU', () => {
  test('doğru gövde (trim edilmiş) + ham dsarKey döner', async () => {
    httpPost.mockResolvedValueOnce({ status: 201, data: { dsarKey: 'dsar-9' } });
    const key = await receiveLiveDsar('iv-1', ' subj-1 ', ' reason-1 ');
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/dsar',
      { subjectRef: 'subj-1', reasonCode: 'reason-1' },
      expect.anything(),
    );
    expect(key).toBe('dsar-9');
  });

  test.each([
    ['subjectRef boş', ['iv-1', '  ', 'r']],
    ['reasonCode boş (backend DsrService de zorunlu tutar)', ['iv-1', 's', '  ']],
    ['interviewId boş', ['  ', 's', 'r']],
  ])('%s → istek atılmadan client-reject', async (_n, args) => {
    await expect(
      receiveLiveDsar(args[0] as string, args[1] as string, args[2] as string),
    ).rejects.toBeInstanceOf(AtsClientValidationError);
    expect(httpPost).not.toHaveBeenCalled();
  });

  test.each([
    ['beklenmeyen 2xx (200)', { status: 200, data: { dsarKey: 'x' } }],
    ['dsarKey eksik', { status: 201, data: {} }],
    ['dsarKey whitespace', { status: 201, data: { dsarKey: '  ' } }],
    ['dsarKey non-string', { status: 201, data: { dsarKey: 7 } }],
  ])('bozuk intake cevabı (%s) → AtsContractError', async (_n, resp) => {
    httpPost.mockResolvedValueOnce(resp);
    await expect(receiveLiveDsar('iv-1', 's', 'r')).rejects.toBeInstanceOf(AtsContractError);
  });
});

describe('executeLiveErasure — strict 200 receipt + dsarKey eşleşmesi', () => {
  const OK = {
    dsarKey: 'dsar-1',
    tombstoneCount: 2,
    deletedContentCount: 1,
    caseTransitioned: false,
  };

  test('5 alan HER ZAMAN array gönderilir; geçerli receipt döner', async () => {
    httpPost.mockResolvedValueOnce({ status: 200, data: OK });
    const r = await executeLiveErasure('iv-1', 'dsar-1', SCOPE);
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/dsar/erasure',
      {
        dsarKey: 'dsar-1',
        scope: {
          transcriptKeys: ['tr-1'],
          citationKeys: [],
          exportArtifactKeys: [],
          reviewCaseKeys: [],
          tombstoneTargetEvidenceIds: [],
        },
      },
      expect.anything(),
    );
    expect(r).toEqual(OK);
  });

  test('boş scope istek atılmadan reddedilir', async () => {
    await expect(
      executeLiveErasure(
        'iv-1',
        'dsar-1',
        canonicalizeScope({
          transcriptKeys: [],
          citationKeys: [],
          exportArtifactKeys: [],
          reviewCaseKeys: [],
          tombstoneTargetEvidenceIds: [],
        }),
      ),
    ).rejects.toBeInstanceOf(AtsClientValidationError);
    expect(httpPost).not.toHaveBeenCalled();
  });

  test.each([
    ['beklenmeyen 2xx (201)', { status: 201, data: OK }],
    ['dsarKey MISMATCH', { status: 200, data: { ...OK, dsarKey: 'BAŞKA' } }],
    ['tombstoneCount float', { status: 200, data: { ...OK, tombstoneCount: 1.5 } }],
    ['tombstoneCount negatif', { status: 200, data: { ...OK, tombstoneCount: -1 } }],
    [
      'deletedContentCount numeric-string',
      { status: 200, data: { ...OK, deletedContentCount: '1' } },
    ],
    ['deletedContentCount NaN', { status: 200, data: { ...OK, deletedContentCount: NaN } }],
    ['caseTransitioned non-boolean', { status: 200, data: { ...OK, caseTransitioned: 'yes' } }],
    ['body eksik', { status: 200, data: undefined }],
  ])('bozuk erasure cevabı (%s) → AtsContractError', async (_n, resp) => {
    httpPost.mockResolvedValueOnce(resp);
    await expect(executeLiveErasure('iv-1', 'dsar-1', SCOPE)).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });
});

describe('classifyDsarError — outcome-certainty (kaynak-kanıtlı daraltılmış küme)', () => {
  test('401 → authn + not-applied (filter-chain, handler öncesi)', () => {
    const c = classifyDsarError({ response: { status: 401 } }, 'erasure');
    expect(c.kind).toBe('authn');
    expect(c.certainty).toBe('not-applied');
  });

  test('403 DENIED → authz + not-applied; mesaj op-aware (intake=dsar.write, erasure=erasure.execute)', () => {
    const i = classifyDsarError({ response: { status: 403, data: { error: 'DENIED' } } }, 'intake');
    expect(i.detail).toMatch(/ats\.dsar\.write/);
    const e = classifyDsarError({ response: { status: 403 } }, 'erasure');
    expect(e.detail).toMatch(/ats\.erasure\.execute/);
    expect(i.certainty).toBe('not-applied');
    expect(e.certainty).toBe('not-applied');
  });

  test('403 TENANT_SCOPE_VIOLATION → rol mesajı DEĞİL kapsam-güvenlik mesajı; reason yankılanmaz', () => {
    const c = classifyDsarError(
      {
        response: {
          status: 403,
          data: { error: 'TENANT_SCOPE_VIOLATION', reason: 'GIZLI-anahtar-tr-99' },
        },
      },
      'erasure',
    );
    expect(c.kind).toBe('tenant-scope');
    expect(c.detail).toMatch(/tenant\/mülakat kapsamına ait değil/);
    expect(c.detail).not.toMatch(/GIZLI-anahtar/);
    expect(c.detail).not.toMatch(/ats\.erasure\.execute/);
  });

  test.each([[400], [404], [409], [422], [500], [502], [503]])(
    'ERASURE %i → unresolved (DsrService kısmî-yürütme noktaları — guard korunmalı)',
    (status) => {
      expect(classifyDsarError({ response: { status } }, 'erasure').certainty).toBe('unresolved');
    },
  );

  test('INTAKE bilinen statüler not-applied; reason yalnız izinli sınıflarda cap+temizlikle', () => {
    const c400 = classifyDsarError(
      {
        response: {
          status: 400,
          data: { error: 'INVALID', reason: `kaba\u0007neden${'x'.repeat(300)}` },
        },
      },
      'intake',
    );
    expect(c400.certainty).toBe('not-applied');
    // 200-char cap + kontrol karakteri temizlendi (BEL -> bosluk):
    expect(c400.detail).toMatch(/teknik ayrıntı: kaba neden/);
    expect(c400.detail.length).toBeLessThan(260);
    // eslint-disable-next-line no-control-regex
    expect(c400.detail).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(classifyDsarError({ response: { status: 404 } }, 'intake').certainty).toBe(
      'not-applied',
    );
    expect(classifyDsarError({ response: { status: 409 } }, 'intake').certainty).toBe(
      'not-applied',
    );
    expect(classifyDsarError({ response: { status: 422 } }, 'intake').certainty).toBe(
      'not-applied',
    );
    expect(classifyDsarError({ response: { status: 503 } }, 'intake').certainty).toBe(
      'not-applied',
    );
  });

  test('INTAKE bilinmeyen 5xx → unresolved (DSAR oluşmuş olabilir, dsarKey yok)', () => {
    expect(classifyDsarError({ response: { status: 500 } }, 'intake').certainty).toBe('unresolved');
  });

  test('transport (request var, response yok) → unresolved (her iki op)', () => {
    expect(classifyDsarError({ request: {}, message: 'timeout' }, 'erasure').certainty).toBe(
      'unresolved',
    );
    expect(classifyDsarError({ request: {} }, 'intake').certainty).toBe('unresolved');
  });

  test('AtsContractError (2xx + bozuk gövde) → unresolved (malformed başarı ≠ sıradan hata)', () => {
    expect(classifyDsarError(new AtsContractError('x'), 'erasure').certainty).toBe('unresolved');
    expect(classifyDsarError(new AtsContractError('x'), 'intake').certainty).toBe('unresolved');
  });

  test('client-validation + shell-authn → not-applied (istek hiç atılmadı)', () => {
    expect(classifyDsarError(new AtsClientValidationError('x'), 'erasure').certainty).toBe(
      'not-applied',
    );
    const authErr = new Error('no session');
    authErr.name = 'InterviewEvidenceUnauthenticatedError';
    const c = classifyDsarError(authErr, 'erasure');
    expect(c.kind).toBe('authn');
    expect(c.certainty).toBe('not-applied');
  });
});
