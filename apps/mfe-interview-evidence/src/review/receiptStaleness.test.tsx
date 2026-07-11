import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveCitationPanel } from './LiveCitationPanel';
import { LiveReviewCasePanel } from './LiveReviewCasePanel';
import type { CitationReceiptRef } from './LiveReviewCasePanel';
import type { LiveCitationReceipt } from './liveCitationApi';

/**
 * F4→F5 stale-receipt entegrasyonu (Codex 019f535a 7b-2 blocker): YENİ citation
 * sınaması başladığı ANDA eski receipt geçersizleşir — istek pending'ken
 * "İnceleme başlat" bayat kanıtla vaka AÇAMAZ. App.tsx'teki state-lift bire bir
 * bu harness ile temsil edilir (onReceiptChange → citationReceipt prop).
 */
vi.mock('./liveCitationApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./liveCitationApi')>();
  return { ...actual, requestLiveCitation: vi.fn() };
});
vi.mock('./liveReviewApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./liveReviewApi')>();
  return {
    ...actual,
    fetchLiveReviewCases: vi.fn(),
    openLiveReviewCase: vi.fn(),
    transitionLiveReviewCase: vi.fn(),
    finalizeLiveReviewCase: vi.fn(),
  };
});
import { requestLiveCitation } from './liveCitationApi';
import { fetchLiveReviewCases, openLiveReviewCase } from './liveReviewApi';
const mockCite = vi.mocked(requestLiveCitation);
const mockList = vi.mocked(fetchLiveReviewCases);
const mockOpen = vi.mocked(openLiveReviewCase);

const CIT_1: LiveCitationReceipt = {
  citationKey: 'iv-1/cit-1',
  evidenceId: 'ev-cit-1',
  entailment: 'SUPPORTED',
  resolvedRefCount: 2,
};
const CIT_2: LiveCitationReceipt = {
  citationKey: 'iv-1/cit-2',
  evidenceId: 'ev-cit-2',
  entailment: 'INSUFFICIENT',
  resolvedRefCount: 1,
};

function Harness() {
  // App.tsx ile aynı bağ: receipt yukarı taşınır, review paneli prop'la okur.
  const [receipt, setReceipt] = useState<CitationReceiptRef | null>(null);
  return (
    <>
      <LiveCitationPanel
        interviewId="iv-1"
        transcriptKey="iv-1/tr-a"
        onReceiptChange={setReceipt}
      />
      <LiveReviewCasePanel interviewId="iv-1" transcriptKey="iv-1/tr-a" citationReceipt={receipt} />
    </>
  );
}

const openBtn = () => screen.getByTestId('review-open-case');
const firstReceipt = async () => {
  mockCite.mockResolvedValueOnce(CIT_1);
  fireEvent.change(screen.getByTestId('live-citation-claim-input'), {
    target: { value: 'iddia sabit' },
  });
  fireEvent.click(screen.getByTestId('live-citation-submit'));
  await waitFor(() => expect(openBtn()).toBeEnabled());
};

beforeEach(() => {
  mockCite.mockReset();
  mockList.mockReset();
  mockOpen.mockReset();
  mockList.mockResolvedValue([]); // review listesi boş — panel 'ready'
});

describe('stale-receipt penceresi (F4 pending ↔ F5 open)', () => {
  test('yeni sınama pending iken open ANINDA disabled; ESKİ evidenceId ile open ASLA çağrılmaz; başarı YENİ receipt ile açar', async () => {
    render(<Harness />);
    await waitFor(() => expect(openBtn()).toBeInTheDocument());
    expect(openBtn()).toBeDisabled(); // receipt yok

    await firstReceipt(); // eski receipt kuruldu → open enabled

    // Aynı claim ile YENİ sınama — cevap pending bırakılır:
    let release!: (v: LiveCitationReceipt) => void;
    mockCite.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    // SENKRON: pending penceresinde open kapalı (bayat kanıt penceresi YOK):
    expect(openBtn()).toBeDisabled();
    fireEvent.click(openBtn()); // disabled — handler koşmamalı
    expect(mockOpen).not.toHaveBeenCalled();

    // Yeni sonuç dönünce open YENİ receipt ile açılır:
    release(CIT_2);
    await waitFor(() => expect(openBtn()).toBeEnabled());
    mockOpen.mockResolvedValueOnce('case-9');
    fireEvent.click(openBtn());
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
    expect(mockOpen).toHaveBeenCalledWith('iv-1', ['ev-cit-2'], 'iv-1/cit-2');
    // Eski referanslarla HİÇ çağrılmadı:
    expect(mockOpen).not.toHaveBeenCalledWith('iv-1', ['ev-cit-1'], expect.anything());
  });

  test('yeni sınama HATA ile biterse open disabled KALIR (eski receipt geri gelmez)', async () => {
    render(<Harness />);
    await waitFor(() => expect(openBtn()).toBeInTheDocument());
    await firstReceipt();

    mockCite.mockRejectedValueOnce({ response: { status: 503 } });
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    await waitFor(() => expect(screen.getByTestId('live-citation-error')).toBeInTheDocument());
    expect(openBtn()).toBeDisabled();
    fireEvent.click(openBtn());
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
