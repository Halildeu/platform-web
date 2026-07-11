import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AtsContractError,
  fetchLiveSegments,
  fetchLiveTranscripts,
  isAuthnError,
  isAuthzError,
  toTranscriptEntry,
} from './liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';

const httpGet = vi.fn();

function wireShell(ready: { ok: true } | { ok: false; reason: 'unauthenticated' | 'failed' }) {
  configureShellServices({
    // Test http stub — yalnız get kullanılıyor.
    http: { get: httpGet } as never,
    auth: {
      getToken: () => 'test-token',
      ready: () => Promise.resolve(ready),
      getEpoch: () => 0,
    },
  });
}

beforeEach(() => {
  httpGet.mockReset();
  __resetShellServicesForTests();
  wireShell({ ok: true });
});

describe('fetchLiveTranscripts — 39d-4 kanıtlı kontrat', () => {
  test('doğru path + pointer-only TranscriptEntry map', async () => {
    httpGet.mockResolvedValueOnce({
      data: [{ transcriptKey: 'iv-smoke-1/tr-abc12345', language: 'tr', segmentCount: 3 }],
    });
    const entries = await fetchLiveTranscripts('iv-smoke-1');
    expect(httpGet).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-smoke-1/transcripts',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      transcriptKey: 'iv-smoke-1/tr-abc12345',
      origin: 'LIVE',
      segments: [],
      erasure: null,
    });
    expect(entries[0].label).toContain('tr');
    expect(entries[0].label).toContain('3 segment');
  });

  test('FAIL-CLOSED: dizi-olmayan 200 cevabı AtsContractError (sessiz boş liste YOK)', async () => {
    httpGet.mockResolvedValueOnce({ data: { unexpected: 'object' } });
    await expect(fetchLiveTranscripts('iv-1')).rejects.toBeInstanceOf(AtsContractError);
  });

  test('FAIL-CLOSED: bozuk liste satırı AtsContractError (sessiz filtre YOK)', async () => {
    httpGet.mockResolvedValueOnce({
      data: [{ transcriptKey: 'ok-key', language: 'tr', segmentCount: 1 }, { bogus: true }],
    });
    await expect(fetchLiveTranscripts('iv-1')).rejects.toBeInstanceOf(AtsContractError);
  });

  test('gerçekten boş liste [] kabul edilir (kontrat hatası DEĞİL)', async () => {
    httpGet.mockResolvedValueOnce({ data: [] });
    expect(await fetchLiveTranscripts('iv-1')).toEqual([]);
  });

  test('interviewId URL-encode edilir', async () => {
    httpGet.mockResolvedValueOnce({ data: [] });
    await fetchLiveTranscripts('iv/odd id');
    expect(httpGet.mock.calls[0][0]).toBe('/ats/v1/interviews/iv%2Fodd%20id/transcripts');
  });

  test('auth.ready unauthenticated → sınıflandırılmış hata (istek ATILMAZ)', async () => {
    wireShell({ ok: false, reason: 'unauthenticated' });
    await expect(fetchLiveTranscripts('iv-1')).rejects.toMatchObject({
      name: 'InterviewEvidenceUnauthenticatedError',
    });
    expect(httpGet).not.toHaveBeenCalled();
  });
});

describe('fetchLiveSegments', () => {
  test("transcriptKey '/' içerdiği için query-param ile gider; segments passthrough", async () => {
    const segments = [
      { index: 0, speakerLabel: 'S1', startMs: 0, endMs: 900, text: 'test-stub segment' },
    ];
    httpGet.mockResolvedValueOnce({ data: { interviewId: 'iv-1', language: 'tr', segments } });
    const result = await fetchLiveSegments('iv-1', 'iv-1/tr-abc');
    expect(httpGet).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/transcript',
      expect.objectContaining({ params: { key: 'iv-1/tr-abc' } }),
    );
    expect(result).toEqual(segments);
  });

  test('FAIL-CLOSED: segments alanı yoksa AtsContractError (sessiz boş segment YOK)', async () => {
    httpGet.mockResolvedValueOnce({ data: {} });
    await expect(fetchLiveSegments('iv-1', 'k')).rejects.toBeInstanceOf(AtsContractError);
  });

  test('FAIL-CLOSED: bozuk segment satırı AtsContractError', async () => {
    httpGet.mockResolvedValueOnce({
      data: { segments: [{ index: 0, text: 'eksik-alanlar' }] },
    });
    await expect(fetchLiveSegments('iv-1', 'k')).rejects.toBeInstanceOf(AtsContractError);
  });

  test('gerçekten boş segments [] kabul edilir', async () => {
    httpGet.mockResolvedValueOnce({ data: { segments: [] } });
    expect(await fetchLiveSegments('iv-1', 'k')).toEqual([]);
  });
});

describe('authn ≠ authz sınıflandırması (D29 Authn-deny/Authz-deny aynası)', () => {
  test('401 → authn (rol atamak çözmez); 403 → authz (rol-kapısı); kesişim YOK', () => {
    expect(isAuthnError({ response: { status: 401 } })).toBe(true);
    expect(isAuthzError({ response: { status: 401 } })).toBe(false);
    expect(isAuthzError({ response: { status: 403 } })).toBe(true);
    expect(isAuthnError({ response: { status: 403 } })).toBe(false);
    expect(isAuthnError({ response: { status: 500 } })).toBe(false);
    expect(isAuthzError({ response: { status: 500 } })).toBe(false);
    const named = new Error('no session');
    named.name = 'InterviewEvidenceUnauthenticatedError';
    expect(isAuthnError(named)).toBe(true);
    expect(isAuthzError(named)).toBe(false);
    expect(isAuthnError(new Error('boom'))).toBe(false);
  });
});

describe('toTranscriptEntry etiketi', () => {
  test('uzun key kuyruk-kısaltmalı; PII alanı yok (pointer-only meta)', () => {
    const e = toTranscriptEntry({
      transcriptKey: 'iv-smoke-1/tr-0123456789abcdef',
      language: 'tr',
      segmentCount: 2,
    });
    expect(e.label).toContain('…89abcdef');
    expect(Object.keys(e).sort()).toEqual(
      ['erasure', 'label', 'origin', 'segments', 'transcriptKey'].sort(),
    );
  });
});
