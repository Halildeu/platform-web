import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  classifyExportError,
  executeLiveExport,
  exportGuardKey,
  fetchExportReceipt,
} from './liveExportApi';
import type { ExportRequestContext } from './liveExportApi';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';
import { parseExportProfile } from './exportProfile';

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

const PROFILE_JSON = {
  version: 1,
  binding: { interviewId: 'iv-1' },
  generatorVersionRef: 'gen-1',
  locale: 'tr-TR',
  timezone: 'Europe/Istanbul',
  aiAssistanceDisclosureRef: 'disc-1',
  rubricVersionRef: 'rubric-v1',
  redactionPolicyRef: 'rp-1',
  redactionRunRef: 'rr-1',
  retentionPolicyRef: 'ret-1',
  signatureRef: 'sig-1',
  schemaDigest: 'a'.repeat(64),
  criteria: [{ criterionId: 'crit-1', jobRelatednessRationaleRef: 'jr-1' }],
};

function profile() {
  const r = parseExportProfile(JSON.stringify(PROFILE_JSON));
  if (r.kind !== 'ok') throw new Error('fixture profili geçersiz');
  return r.profile;
}

const ctx = (over: Partial<ExportRequestContext> = {}): ExportRequestContext => ({
  profile: profile(),
  consentRefs: ['consent-1'],
  wormChainRefs: ['worm-1'],
  citationCriterion: { 'iv-1/cit-1': 'crit-1' },
  ...over,
});

const OK_RECEIPT = {
  artifactKey: 'art-1',
  evidenceId: 'ev-x',
  packetDigest: 'b'.repeat(64),
  claimCount: 1,
};

describe('exportGuardKey — tuple-safe (opak kimlik collision yok)', () => {
  test('(":"li kimlikler) ayrışır; slash/space/unicode/case korunur', () => {
    expect(exportGuardKey('a:b', 'c')).not.toBe(exportGuardKey('a', 'b:c'));
    expect(exportGuardKey('a/b', 'c')).not.toBe(exportGuardKey('a', 'b/c'));
    expect(exportGuardKey('a b', 'c')).not.toBe(exportGuardKey('a', 'b c'));
    expect(exportGuardKey('Ş', 'c')).not.toBe(exportGuardKey('ş', 'c'));
    expect(exportGuardKey('iv-1', 'case-1')).toBe(exportGuardKey('iv-1', 'case-1'));
  });
});

describe('executeLiveExport — client validasyonları (istek atılmadan)', () => {
  test.each([
    ['citationKeys boş', ['iv-1', 'case-1', [], ctx()]],
    ['consentRefs boş', ['iv-1', 'case-1', ['c1'], ctx({ consentRefs: [] })]],
    ['wormChainRefs boş', ['iv-1', 'case-1', ['c1'], ctx({ wormChainRefs: [] })]],
    ['caseKey boş', ['iv-1', '  ', ['c1'], ctx()]],
  ])('%s → AtsClientValidationError + POST yok', async (_n, args) => {
    const [iv, ck, keys, c] = args as [string, string, string[], ExportRequestContext];
    await expect(executeLiveExport(iv, ck, keys, c)).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    expect(httpPost).not.toHaveBeenCalled();
  });

  test('profil binding uyuşmazlığı → reject (yanlış mülakata export yapısal engelli)', async () => {
    await expect(
      executeLiveExport('iv-BAŞKA', 'case-1', ['iv-1/cit-1'], ctx()),
    ).rejects.toBeInstanceOf(AtsClientValidationError);
    expect(httpPost).not.toHaveBeenCalled();
  });

  test('mapping exact-coverage: eksik/fazla eşleme + profil-dışı kriter reject', async () => {
    await expect(
      executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1', 'iv-1/cit-2'], ctx()),
    ).rejects.toBeInstanceOf(AtsClientValidationError); // cit-2 eşlenmemiş
    await expect(
      executeLiveExport(
        'iv-1',
        'case-1',
        ['iv-1/cit-1'],
        ctx({
          citationCriterion: { 'iv-1/cit-1': 'crit-1', 'iv-1/cit-FAZLA': 'crit-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(AtsClientValidationError); // fazladan mapping
    await expect(
      executeLiveExport(
        'iv-1',
        'case-1',
        ['iv-1/cit-1'],
        ctx({
          citationCriterion: { 'iv-1/cit-1': 'crit-YOK' },
        }),
      ),
    ).rejects.toBeInstanceOf(AtsClientValidationError); // profil-dışı kriter
    expect(httpPost).not.toHaveBeenCalled();
  });

  test('__proto__ citation-key normal veri anahtarı olarak serialize edilir (prototype-safe)', async () => {
    httpPost.mockResolvedValueOnce({ status: 201, data: OK_RECEIPT });
    const weird = ctx({ citationCriterion: { ['__proto__']: 'crit-1' } });
    await executeLiveExport('iv-1', 'case-1', ['__proto__'], weird);
    const body = httpPost.mock.calls[0][1] as {
      citationKeys: string[];
      context: { citationCriterion: Record<string, string> };
    };
    expect(body.citationKeys).toEqual(['__proto__']);
    // own enumerable property olarak JSON'a girer; global prototype KİRLENMEZ:
    expect(JSON.stringify(body.context.citationCriterion)).toBe('{"__proto__":"crit-1"}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call({}, '__proto__')).toBe(false);
  });

  test('başarı: 14-alan context profil+kullanıcı girdilerinden; dedupe-sorted citationKeys; strict receipt', async () => {
    httpPost.mockResolvedValueOnce({ status: 201, data: OK_RECEIPT });
    const r = await executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1', 'iv-1/cit-1'], ctx());
    expect(r).toEqual({ ...OK_RECEIPT, replayed: false });
    const [url, body] = httpPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/ats/v1/interviews/iv-1/export');
    expect(body.citationKeys).toEqual(['iv-1/cit-1']); // dedupe
    const c = body.context as Record<string, unknown>;
    expect(c.schemaDigest).toBe('a'.repeat(64));
    expect(c.consentRefs).toEqual(['consent-1']);
    expect(c.wormChainRefs).toEqual(['worm-1']);
    expect(c.criteria).toEqual([{ criterionId: 'crit-1', jobRelatednessRationaleRef: 'jr-1' }]);
  });

  test.each([
    ['beklenmeyen 2xx (200)', { status: 200, data: OK_RECEIPT }],
    ['artifactKey boş', { status: 201, data: { ...OK_RECEIPT, artifactKey: ' ' } }],
    ['evidenceId eksik', { status: 201, data: { ...OK_RECEIPT, evidenceId: undefined } }],
    ['packetDigest 63-hex', { status: 201, data: { ...OK_RECEIPT, packetDigest: 'b'.repeat(63) } }],
    [
      'packetDigest uppercase',
      { status: 201, data: { ...OK_RECEIPT, packetDigest: 'B'.repeat(64) } },
    ],
    [
      'claimCount 0 (kaynak-invariant ihlali)',
      { status: 201, data: { ...OK_RECEIPT, claimCount: 0 } },
    ],
    ['claimCount float', { status: 201, data: { ...OK_RECEIPT, claimCount: 1.5 } }],
  ])('bozuk export cevabı (%s) → AtsContractError', async (_n, resp) => {
    httpPost.mockResolvedValueOnce(resp);
    await expect(executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1'], ctx())).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });
});

describe('classifyExportError — certainty (kaynak-kanıtlı)', () => {
  test('401+UNAUTHENTICATED / 403+DENIED → not-applied (filter-chain); DENIED mesajı ats.export.write', () => {
    const a = classifyExportError({
      response: { status: 401, data: { error: 'UNAUTHENTICATED' } },
    });
    expect([a.kind, a.certainty]).toEqual(['authn', 'not-applied']);
    const z = classifyExportError({ response: { status: 403, data: { error: 'DENIED' } } });
    expect([z.kind, z.certainty]).toEqual(['authz', 'not-applied']);
    expect(z.detail).toMatch(/ats\.export\.write/);
  });

  test('404+NOT_FOUND → not-applied (ExportService NOT_FOUND yalnız put-öncesi find noktalarında)', () => {
    const c = classifyExportError({
      response: { status: 404, data: { error: 'NOT_FOUND', reason: 'vaka yok' } },
    });
    expect([c.kind, c.certainty]).toEqual(['not-found', 'not-applied']);
    expect(c.detail).toMatch(/teknik ayrıntı: vaka yok/);
  });

  test('400+INVALID → validation + sanitized-reason GÖRÜNÜR ama certainty UNRESOLVED (markExported-fail post-side-effect)', () => {
    const c = classifyExportError({
      response: {
        status: 400,
        data: { error: 'INVALID', reason: 'yalnız FINALIZED vaka export edilir' },
      },
    });
    expect(c.kind).toBe('validation');
    expect(c.detail).toMatch(/FINALIZED/);
    expect(c.certainty).toBe('unresolved');
  });

  test('TSV → kapsam mesajı + unresolved; reason yankılanmaz', () => {
    const c = classifyExportError({
      response: { status: 403, data: { error: 'TENANT_SCOPE_VIOLATION', reason: 'GIZLI' } },
    });
    expect(c.kind).toBe('tenant-scope');
    expect(c.certainty).toBe('unresolved');
    expect(c.detail).not.toMatch(/GIZLI/);
  });

  test.each([
    [401, 'DENIED'],
    [403, 'INVALID'],
    [403, null],
    [404, 'INVALID'],
    [503, 'NOT_CONFIGURED'],
    [500, null],
  ] as [number, string | null][])(
    'MISMATCH/5xx %i+%s → generic + unresolved + reason yankılanmaz',
    (status, code) => {
      const c = classifyExportError({
        response: { status, data: code ? { error: code, reason: 'SIZINTI' } : undefined },
      });
      expect(c.kind).toBe('generic');
      expect(c.certainty).toBe('unresolved');
      expect(c.detail).not.toMatch(/SIZINTI/);
    },
  );

  test('AtsContractError (malformed-201) + transport → unresolved; client-validation → not-applied', () => {
    expect(classifyExportError(new AtsContractError('x')).certainty).toBe('unresolved');
    expect(classifyExportError({ request: {} }).certainty).toBe('unresolved');
    expect(classifyExportError(new AtsClientValidationError('x')).certainty).toBe('not-applied');
  });
});
describe('fetchExportReceipt — 39d-8b makbuz-kurtarma exact-matrisi', () => {
  const RECOVERED = {
    caseKey: 'case-1',
    caseState: 'EXPORTED',
    transitionStatus: 'COMPLETED',
    artifactKey: 'iv-1/pkt-1',
    evidenceId: 'ev-9',
    packetDigest: 'c'.repeat(64),
    claimCount: 2,
    ledgerRecordedAt: '2026-07-12T10:00:00Z',
  };

  test('200 EXPORTED+COMPLETED (şekil-tam) → completed + kimlikler birebir', async () => {
    httpGet.mockResolvedValueOnce({ status: 200, data: RECOVERED });
    const r = await fetchExportReceipt('iv-1', 'case-1');
    expect(r.kind).toBe('completed');
    if (r.kind !== 'completed') throw new Error('unreachable');
    expect(r.receipt).toEqual({
      caseKey: 'case-1',
      artifactKey: 'iv-1/pkt-1',
      evidenceId: 'ev-9',
      packetDigest: 'c'.repeat(64),
      claimCount: 2,
      ledgerRecordedAt: '2026-07-12T10:00:00Z',
    });
    const url = httpGet.mock.calls[0][0] as string;
    expect(url).toBe('/ats/v1/interviews/iv-1/export/receipt?caseKey=case-1');
  });

  test("caseKey '/' içerir → query-param encode edilir", async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: { ...RECOVERED, caseKey: 'iv-1/case-7' },
    });
    const r = await fetchExportReceipt('iv-1', 'iv-1/case-7');
    expect(r.kind).toBe('completed');
    expect(httpGet.mock.calls[0][0]).toBe(
      '/ats/v1/interviews/iv-1/export/receipt?caseKey=iv-1%2Fcase-7',
    );
  });

  test('200 FINALIZED+INCOMPLETE → incomplete-r4 (retry açılmaz sinyali)', async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: { ...RECOVERED, caseState: 'FINALIZED', transitionStatus: 'INCOMPLETE' },
    });
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('incomplete-r4');
  });

  test('exact 404+NOT_FOUND → not-found-unresolved (kilit çözmez; Codex 8b blocker-1)', async () => {
    httpGet.mockRejectedValueOnce({ response: { status: 404, data: { error: 'NOT_FOUND' } } });
    const r = await fetchExportReceipt('iv-1', 'case-1');
    expect(r.kind).toBe('not-found-unresolved');
    if (r.kind !== 'not-found-unresolved') throw new Error('unreachable');
    expect(r.detail).toMatch(/KANITLAMAZ/);
  });

  test.each([
    ['tarih-only', '2026-07-12'],
    ['boşluklu yerel biçim', '2026-07-12 10:00:00'],
    ["offset'li (Z değil)", '2026-07-12T10:00:00+03:00'],
  ])('ledgerRecordedAt gevşek biçim (%s) → unresolved (Instant-pin)', async (_n, ts) => {
    httpGet.mockResolvedValueOnce({ status: 200, data: { ...RECOVERED, ledgerRecordedAt: ts } });
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('unresolved');
  });

  test('ledgerRecordedAt fractional-Z kabul edilir', async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: { ...RECOVERED, ledgerRecordedAt: '2026-07-12T10:00:00.123456789Z' },
    });
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('completed');
  });

  test('401+UNAUTHENTICATED → authn; 403+DENIED → authz (read-scope mesajı)', async () => {
    httpGet.mockRejectedValueOnce({
      response: { status: 401, data: { error: 'UNAUTHENTICATED' } },
    });
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('authn');
    httpGet.mockRejectedValueOnce({ response: { status: 403, data: { error: 'DENIED' } } });
    const z = await fetchExportReceipt('iv-1', 'case-1');
    expect(z.kind).toBe('authz');
    if (z.kind !== 'authz') throw new Error('unreachable');
    expect(z.detail).toMatch(/ats\.export\.read/);
  });

  test('400+INVALID (bütünlük ihlali) → unresolved + sanitized-reason; NO-EXPORT DEĞİL', async () => {
    httpGet.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'INVALID', reason: 'ledger uyuşmuyor' } },
    });
    const r = await fetchExportReceipt('iv-1', 'case-1');
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') throw new Error('unreachable');
    expect(r.detail).toMatch(/operasyonel inceleme/);
    expect(r.detail).toMatch(/ledger uyuşmuyor/);
  });

  test.each([
    ['gövdesiz 403 (eski backend)', { response: { status: 403 } }],
    ['404 kodsuz', { response: { status: 404, data: {} } }],
    ['503', { response: { status: 503, data: { error: 'NOT_CONFIGURED' } } }],
    ['transport (response yok)', { request: {} }],
  ])('%s → unresolved (kilit korunur)', async (_n, err) => {
    httpGet.mockRejectedValueOnce(err);
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('unresolved');
  });

  test.each([
    ['caseKey yankısı farklı', { ...RECOVERED, caseKey: 'case-BAŞKA' }],
    ['digest 63-hex', { ...RECOVERED, packetDigest: 'c'.repeat(63) }],
    ['claimCount string', { ...RECOVERED, claimCount: '2' }],
    ['claimCount 0', { ...RECOVERED, claimCount: 0 }],
    ['ledgerRecordedAt bozuk', { ...RECOVERED, ledgerRecordedAt: 'dün' }],
    [
      'bilinmeyen durum-kombinasyonu',
      { ...RECOVERED, caseState: 'EXPORTED', transitionStatus: 'INCOMPLETE' },
    ],
    ['artifactKey boş', { ...RECOVERED, artifactKey: ' ' }],
  ])('200 ama %s → unresolved (makbuz uydurulmaz)', async (_n, data) => {
    httpGet.mockResolvedValueOnce({ status: 200, data });
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('unresolved');
  });

  test('oturum hazır değil (unauthenticated) → authn; istek atılmaz', async () => {
    __resetShellServicesForTests();
    configureShellServices({
      http: { get: httpGet, post: httpPost } as never,
      auth: {
        getToken: () => null,
        ready: () => Promise.resolve({ ok: false, reason: 'unauthenticated', error: 'yok' }),
        getEpoch: () => 0,
      },
    });
    expect((await fetchExportReceipt('iv-1', 'case-1')).kind).toBe('authn');
    expect(httpGet).not.toHaveBeenCalled();
  });
});
describe('executeLiveExport — 39d-13 replay kabulü (200+X-ATS-Replay zorunlu-header)', () => {
  test('200 + x-ats-replay:true → replayed:true makbuz', async () => {
    httpPost.mockResolvedValueOnce({
      status: 200,
      data: OK_RECEIPT,
      headers: { 'x-ats-replay': 'true' },
    });
    const r = await executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1'], ctx());
    expect(r.replayed).toBe(true);
    expect(r.artifactKey).toBe('art-1');
  });

  test("201 normal üretim → replayed:false; header'lı-201 çelişki → ContractError", async () => {
    httpPost.mockResolvedValueOnce({ status: 201, data: OK_RECEIPT, headers: {} });
    expect((await executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1'], ctx())).replayed).toBe(false);
    httpPost.mockResolvedValueOnce({
      status: 201,
      data: OK_RECEIPT,
      headers: { 'x-ats-replay': 'true' },
    });
    await expect(executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1'], ctx())).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test("200 header'sız / header!=true → ContractError (unresolved sınıfı)", async () => {
    httpPost.mockResolvedValueOnce({ status: 200, data: OK_RECEIPT, headers: {} });
    await expect(executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1'], ctx())).rejects.toBeInstanceOf(
      AtsContractError,
    );
    httpPost.mockResolvedValueOnce({
      status: 200,
      data: OK_RECEIPT,
      headers: { 'x-ats-replay': 'FALSE' },
    });
    await expect(executeLiveExport('iv-1', 'case-1', ['iv-1/cit-1'], ctx())).rejects.toBeInstanceOf(
      AtsContractError,
    );
  });

  test('exact 409+UNSUPPORTED_IN_GATE → r4-in-progress + unresolved + reason yankısız', () => {
    const c = classifyExportError({
      response: { status: 409, data: { error: 'UNSUPPORTED_IN_GATE', reason: 'GIZLI' } },
    });
    expect([c.kind, c.certainty]).toEqual(['r4-in-progress', 'unresolved']);
    expect(c.detail).not.toMatch(/GIZLI/);
  });
});
