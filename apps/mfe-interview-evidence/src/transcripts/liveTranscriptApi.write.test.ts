import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AtsClientValidationError,
  AtsContractError,
  MAX_UPLOAD_BYTES,
  putLiveConsent,
  sanitizeUploadFilename,
  transcribeLiveRecording,
  uploadLiveRecording,
} from './liveTranscriptApi';
import { __resetShellServicesForTests, configureShellServices } from '../shell-services';

const httpPut = vi.fn();
const httpPost = vi.fn();

beforeEach(() => {
  httpPut.mockReset();
  httpPost.mockReset();
  __resetShellServicesForTests();
  configureShellServices({
    http: { put: httpPut, post: httpPost } as never,
    auth: {
      getToken: () => 'tok',
      ready: () => Promise.resolve({ ok: true }),
      getEpoch: () => 0,
    },
  });
});

const audioFile = (over: Partial<{ name: string; type: string; size: number }> = {}) => {
  const f = new File([new Uint8Array(over.size ?? 4)], over.name ?? 'kayit.wav', {
    type: over.type ?? 'audio/wav',
  });
  return f;
};

describe('putLiveConsent — backend-persist rıza kapısı', () => {
  test('PUT doğru path + body; boş subjectRef istek atılmadan reddedilir', async () => {
    httpPut.mockResolvedValueOnce({ status: 204 });
    await putLiveConsent('iv-1', ' sub-1 ', 'GRANTED');
    expect(httpPut).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/recording-consent',
      { subjectRef: 'sub-1', state: 'GRANTED' },
      expect.anything(),
    );
    await expect(putLiveConsent('iv-1', '   ', 'GRANTED')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    expect(httpPut).toHaveBeenCalledTimes(1);
  });
});

describe('uploadLiveRecording — fail-closed ön-doğrulama + RAW kontrat', () => {
  test('boş MIME REDDEDİLİR (audio/wav fallback YOK); audio/* dışı reddedilir', async () => {
    await expect(uploadLiveRecording('iv-1', audioFile({ type: '' }))).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    await expect(
      uploadLiveRecording('iv-1', audioFile({ type: 'video/mp4' })),
    ).rejects.toBeInstanceOf(AtsClientValidationError);
    expect(httpPost).not.toHaveBeenCalled();
  });

  test('boş dosya ve 25MiB üstü reddedilir (istek yok)', async () => {
    await expect(uploadLiveRecording('iv-1', audioFile({ size: 0 }))).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    const big = audioFile();
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await expect(uploadLiveRecording('iv-1', big)).rejects.toBeInstanceOf(AtsClientValidationError);
    expect(httpPost).not.toHaveBeenCalled();
  });

  test('RAW body + Content-Type=file.type + sanitize edilmiş X-ATS-Filename', async () => {
    httpPost.mockResolvedValueOnce({
      data: { evidenceId: 'ev-1', objectKey: 'iv-1/rec-abc', ledgerSequence: 7 },
    });
    const f = audioFile({ name: 'klasor/mulakat kaydi.wav' });
    const receipt = await uploadLiveRecording('iv-1', f);
    const [url, body, cfg] = httpPost.mock.calls[0];
    expect(url).toBe('/ats/v1/interviews/iv-1/recordings');
    expect(body).toBe(f); // RAW body — multipart/FormData DEĞİL
    expect(cfg.headers['Content-Type']).toBe('audio/wav');
    expect(cfg.headers['X-ATS-Filename']).toBe('mulakat kaydi.wav'); // path-strip
    expect(receipt).toEqual({ evidenceId: 'ev-1', objectKey: 'iv-1/rec-abc', ledgerSequence: 7 });
  });

  test('FAIL-CLOSED kontrat: 2xx + eksik evidenceId/objectKey → AtsContractError', async () => {
    httpPost.mockResolvedValueOnce({ data: { evidenceId: 'ev-1' } });
    await expect(uploadLiveRecording('iv-1', audioFile())).rejects.toBeInstanceOf(AtsContractError);
  });

  test('FAIL-CLOSED kontrat: ledgerSequence eksik/bozuk null-a DÜŞÜRÜLMEZ → AtsContractError', async () => {
    httpPost.mockResolvedValueOnce({ data: { evidenceId: 'ev-1', objectKey: 'k' } }); // eksik
    await expect(uploadLiveRecording('iv-1', audioFile())).rejects.toBeInstanceOf(AtsContractError);
    httpPost.mockResolvedValueOnce({
      data: { evidenceId: 'ev-1', objectKey: 'k', ledgerSequence: '7' }, // bozuk tip
    });
    await expect(uploadLiveRecording('iv-1', audioFile())).rejects.toBeInstanceOf(AtsContractError);
  });
});

describe('sanitizeUploadFilename', () => {
  test('path-strip + control-char/CRLF reddi + 120 sınırı', () => {
    expect(sanitizeUploadFilename('a/b\\c.wav')).toBe('c.wav');
    expect(() => sanitizeUploadFilename('kotu\r\nheader.wav')).toThrow(AtsClientValidationError);
    expect(() => sanitizeUploadFilename('nul\u0000.wav')).toThrow(AtsClientValidationError);
    expect(() => sanitizeUploadFilename('   ')).toThrow(AtsClientValidationError);
    expect(sanitizeUploadFilename('x'.repeat(200) + '.wav')).toHaveLength(120);
  });
});

describe('transcribeLiveRecording — aynı-objectKey retry sözleşmesinin API yarısı', () => {
  test('POST {sourceObjectKey}; boş key istek atılmadan reddedilir; kontrat transcriptKey ister', async () => {
    httpPost.mockResolvedValueOnce({ data: { transcriptKey: 'iv-1/tr-x', segmentCount: 3 } });
    const r = await transcribeLiveRecording('iv-1', 'iv-1/rec-abc');
    expect(httpPost).toHaveBeenCalledWith(
      '/ats/v1/interviews/iv-1/transcribe',
      { sourceObjectKey: 'iv-1/rec-abc' },
      expect.anything(),
    );
    expect(r).toEqual({ transcriptKey: 'iv-1/tr-x', segmentCount: 3 });

    await expect(transcribeLiveRecording('iv-1', '  ')).rejects.toBeInstanceOf(
      AtsClientValidationError,
    );
    httpPost.mockResolvedValueOnce({ data: {} });
    await expect(transcribeLiveRecording('iv-1', 'k')).rejects.toBeInstanceOf(AtsContractError);
  });

  test('FAIL-CLOSED: segmentCount eksikse 0-a DÜŞÜRÜLMEZ → AtsContractError; explicit 0 kabul', async () => {
    httpPost.mockResolvedValueOnce({ data: { transcriptKey: 'iv-1/tr-x' } }); // segmentCount yok
    await expect(transcribeLiveRecording('iv-1', 'k')).rejects.toBeInstanceOf(AtsContractError);
    httpPost.mockResolvedValueOnce({ data: { transcriptKey: 'iv-1/tr-x', segmentCount: 0 } });
    expect(await transcribeLiveRecording('iv-1', 'k')).toEqual({
      transcriptKey: 'iv-1/tr-x',
      segmentCount: 0,
    });
  });
});
