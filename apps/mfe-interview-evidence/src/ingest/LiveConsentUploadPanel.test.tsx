import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveConsentUploadPanel } from './LiveConsentUploadPanel';

/**
 * 39d-7a checkpoint/retry state-machine testleri (Codex 019f50b7 P0 matrisi):
 * kısmi başarıda zincir kaldığı yerden sürer; İKİNCİ upload ASLA; rıza kapısı
 * backend-persist; GRANTED-dışı seçim checkpoint temizler; çift-tık tek zincir.
 */
vi.mock('../transcripts/liveTranscriptApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transcripts/liveTranscriptApi')>();
  return {
    ...actual,
    putLiveConsent: vi.fn(),
    uploadLiveRecording: vi.fn(),
    transcribeLiveRecording: vi.fn(),
  };
});

import {
  putLiveConsent,
  transcribeLiveRecording,
  uploadLiveRecording,
} from '../transcripts/liveTranscriptApi';

const mockConsent = vi.mocked(putLiveConsent);
const mockUpload = vi.mocked(uploadLiveRecording);
const mockTranscribe = vi.mocked(transcribeLiveRecording);
const onTranscribed = vi.fn();

const RECEIPT = { evidenceId: 'ev-1', objectKey: 'iv-1/rec-abc', ledgerSequence: 3 };

function setup() {
  render(<LiveConsentUploadPanel interviewId="iv-1" onTranscribed={onTranscribed} />);
  fireEvent.change(screen.getByTestId('live-consent-subject-input'), {
    target: { value: 'sub-1' },
  });
  fireEvent.change(screen.getByTestId('live-consent-state-select'), {
    target: { value: 'GRANTED' },
  });
  const file = new File([new Uint8Array(4)], 'k.wav', { type: 'audio/wav' });
  fireEvent.change(screen.getByTestId('live-recording-file-input'), {
    target: { files: [file] },
  });
  return file;
}

const runButton = () => screen.getByTestId('live-chain-run-button');

beforeEach(() => {
  mockConsent.mockReset();
  mockUpload.mockReset();
  mockTranscribe.mockReset();
  onTranscribed.mockReset();
});

describe('mutlu yol + rıza kapısı', () => {
  test('consent(GRANTED) BAŞARILI → upload → transcribe → onTranscribed(key)', async () => {
    mockConsent.mockResolvedValueOnce(undefined);
    mockUpload.mockResolvedValueOnce(RECEIPT);
    mockTranscribe.mockResolvedValueOnce({ transcriptKey: 'iv-1/tr-x', segmentCount: 3 });
    setup();
    fireEvent.click(runButton());
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith('iv-1/tr-x'));
    expect(mockConsent).toHaveBeenCalledWith('iv-1', 'sub-1', 'GRANTED');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).toHaveBeenCalledWith('iv-1', 'iv-1/rec-abc');
    expect(screen.getByTestId('live-ingest-done')).toBeInTheDocument();
  });

  test('GRANTED seçilmeden dosya girişi ve zincir kapalı (fail-closed)', () => {
    render(<LiveConsentUploadPanel interviewId="iv-1" onTranscribed={onTranscribed} />);
    expect(screen.getByTestId('live-recording-file-input')).toBeDisabled();
    expect(runButton()).toBeDisabled();
    expect(screen.getByTestId('live-consent-gate-note')).toBeInTheDocument();
  });

  test('GRANTED-dışı seçim dosya + checkpoint temizler (Codex #3)', async () => {
    mockConsent.mockRejectedValueOnce(new Error('kc down'));
    setup();
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByTestId('live-ingest-error')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('live-consent-state-select'), {
      target: { value: 'DENIED' },
    });
    expect(screen.queryByTestId('live-chain-checkpoint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-ingest-error')).not.toBeInTheDocument();
    expect((screen.getByTestId('live-recording-file-input') as HTMLInputElement).value).toBe('');
  });
});

describe('kısmi-başarı matrisi (Codex P0)', () => {
  test('consent FAIL → upload/transcribe HİÇ çağrılmaz; retry consent-ten sürer', async () => {
    mockConsent.mockRejectedValueOnce(new Error('500'));
    mockConsent.mockResolvedValueOnce(undefined);
    mockUpload.mockResolvedValueOnce(RECEIPT);
    mockTranscribe.mockResolvedValueOnce({ transcriptKey: 'iv-1/tr-x', segmentCount: 3 });
    setup();
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByTestId('live-ingest-error')).toBeInTheDocument());
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
    fireEvent.click(runButton());
    await waitFor(() => expect(onTranscribed).toHaveBeenCalled());
    expect(mockConsent).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  test('upload FAIL → transcribe çağrılmaz; retry CONSENT TEKRARLAMADAN upload-tan sürer', async () => {
    mockConsent.mockResolvedValueOnce(undefined);
    mockUpload.mockRejectedValueOnce(new Error('edge 502'));
    mockUpload.mockResolvedValueOnce(RECEIPT);
    mockTranscribe.mockResolvedValueOnce({ transcriptKey: 'iv-1/tr-x', segmentCount: 3 });
    setup();
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByTestId('live-ingest-error')).toBeInTheDocument());
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-chain-checkpoint').textContent).toContain('rıza kaydedildi');
    fireEvent.click(runButton());
    await waitFor(() => expect(onTranscribed).toHaveBeenCalled());
    expect(mockConsent).toHaveBeenCalledTimes(1); // rıza TEKRAR gönderilmedi
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  test('transcribe FAIL → retry AYNI objectKey ile; İKİNCİ upload ASLA', async () => {
    mockConsent.mockResolvedValueOnce(undefined);
    mockUpload.mockResolvedValueOnce(RECEIPT);
    mockTranscribe.mockRejectedValueOnce(new Error('stub down'));
    mockTranscribe.mockResolvedValueOnce({ transcriptKey: 'iv-1/tr-x', segmentCount: 3 });
    setup();
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByTestId('live-ingest-error')).toBeInTheDocument());
    expect(screen.getByTestId('live-chain-checkpoint').textContent).toContain('ev-1');
    fireEvent.click(runButton());
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith('iv-1/tr-x'));
    expect(mockUpload).toHaveBeenCalledTimes(1); // *** ikinci upload YOK ***
    expect(mockTranscribe).toHaveBeenCalledTimes(2);
    expect(mockTranscribe).toHaveBeenNthCalledWith(2, 'iv-1', 'iv-1/rec-abc'); // aynı key
  });

  test('çift-tık tek zincir üretir (in-flight kilit)', async () => {
    let resolveConsent!: () => void;
    mockConsent.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          resolveConsent = () => res(undefined);
        }),
    );
    mockUpload.mockResolvedValueOnce(RECEIPT);
    mockTranscribe.mockResolvedValueOnce({ transcriptKey: 'iv-1/tr-x', segmentCount: 1 });
    setup();
    fireEvent.click(runButton());
    fireEvent.click(runButton()); // ikinci tık — busy kilidine takılmalı
    resolveConsent();
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledTimes(1));
    expect(mockConsent).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  test('403 yazma yetkisi mesajı (authz) gösterilir', async () => {
    mockConsent.mockRejectedValueOnce({ response: { status: 403 } });
    setup();
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByTestId('live-ingest-error')).toBeInTheDocument());
    expect(screen.getByText(/yazma rolü gerekli/i)).toBeInTheDocument();
  });
});
