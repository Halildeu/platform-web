import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { ProtectedAttributeScreeningPanel } from './ProtectedAttributeScreeningPanel';

vi.mock('./liveScreeningApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./liveScreeningApi')>();
  return {
    ...actual,
    createScreeningRequestKey: vi.fn(() => 'scrq_00000000-0000-4000-8000-000000000001'),
    requestLiveScreening: vi.fn(),
    fetchLiveScreening: vi.fn(),
  };
});

import {
  createScreeningRequestKey,
  fetchLiveScreening,
  requestLiveScreening,
} from './liveScreeningApi';

const mockKey = vi.mocked(createScreeningRequestKey);
const mockRequest = vi.mocked(requestLiveScreening);
const mockFetch = vi.mocked(fetchLiveScreening);
const FSR = `fsr_${'a'.repeat(64)}`;
const OTHER_FSR = `fsr_${'b'.repeat(64)}`;
const EVIDENCE = {
  findingSetRef: FSR,
  runId: 'psr_00000000-0000-4000-8000-000000000001',
  policyRef: 'paspolicy_v1',
  coverage: 'SUPPORTED' as const,
  disposition: 'REVIEW_REQUIRED' as const,
  source: { kind: 'TRANSCRIPT_SEGMENT' as const, canonicalSourceRef: 'iv-1/tr-a', segmentIndex: 0 },
  findings: [
    {
      category: 'AGE' as const,
      signal: 'QUESTION_LIKE_PROTECTED_MENTION' as const,
      sourceKind: 'TRANSCRIPT_SEGMENT' as const,
      span: { startInclusive: 0, endExclusive: 3, segmentIndex: 0 },
    },
  ],
  evidenceId: 'ev-1',
  schemaVersion: 'screening_evidence_v1' as const,
  occurredAt: '2026-07-15T09:00:00Z',
  spanUnit: 'UTF16_CODE_UNIT' as const,
};
const RECEIPT = { ...EVIDENCE, replayed: false };
const SEGMENTS = [
  { index: 0, speakerLabel: 'S1', startMs: 0, endMs: 900, text: 'Hassas ham segment metni' },
  { index: 1, speakerLabel: 'S2', startMs: 900, endMs: 1400, text: 'İkinci segment' },
];

function renderPanel(citationKey?: string) {
  return render(
    <main>
      <h1>Mülakat kanıt platformu</h1>
      <ProtectedAttributeScreeningPanel
        interviewId="iv-1"
        transcriptKey="iv-1/tr-a"
        segments={SEGMENTS}
        citationReceipt={
          citationKey
            ? {
                interviewId: 'iv-1',
                transcriptKey: 'iv-1/tr-a',
                evidenceId: 'ev-cit',
                citationKey,
              }
            : null
        }
      />
    </main>,
  );
}

beforeEach(() => {
  mockKey.mockClear();
  mockRequest.mockReset();
  mockFetch.mockReset();
});

describe('ProtectedAttributeScreeningPanel — ürün akışı', () => {
  test('segment taraması yalnız pointer gönderir; karar-desteği dili ve UTF-16 aralığı görünür', async () => {
    mockRequest.mockResolvedValueOnce(RECEIPT);
    renderPanel();
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() => expect(screen.getByTestId('screening-result')).toBeInTheDocument());
    expect(mockRequest).toHaveBeenCalledWith(
      'iv-1',
      { sourceKind: 'TRANSCRIPT_SEGMENT', transcriptKey: 'iv-1/tr-a', segmentIndex: 0 },
      'scrq_00000000-0000-4000-8000-000000000001',
    );
    expect(JSON.stringify(mockRequest.mock.calls[0]?.[1])).not.toContain(
      'Hassas ham segment metni',
    );
    expect(screen.getByText(/İnsan uyum incelemesi gerekli/)).toBeInTheDocument();
    expect(screen.getByText(/UTF‑16 aralığı/)).toBeInTheDocument();
    expect(screen.getByText(/aday kararı, puan, güven skoru/i)).toBeInTheDocument();
  });

  test('citation seçeneği receipt yokken kapalı; receipt varken yalnız citationKey gönderir', async () => {
    const first = renderPanel();
    expect(screen.getByRole('radio', { name: /Son kanıt-alıntı iddiası/ })).toBeDisabled();
    first.unmount();
    mockRequest.mockResolvedValueOnce(RECEIPT);
    renderPanel('iv-1/cit-a');
    fireEvent.click(screen.getByRole('radio', { name: /Son kanıt-alıntı iddiası/ }));
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0]?.[1]).toEqual({
      sourceKind: 'CITATION_CLAIM',
      citationKey: 'iv-1/cit-a',
    });
  });

  test('başka interview/transkripte ait citation receipt kaynak olarak kullanılamaz', () => {
    render(
      <ProtectedAttributeScreeningPanel
        interviewId="iv-1"
        transcriptKey="iv-1/tr-a"
        segments={SEGMENTS}
        citationReceipt={{
          interviewId: 'iv-1',
          transcriptKey: 'iv-1/tr-BASKA',
          evidenceId: 'ev-cit',
          citationKey: 'iv-1/cit-baska',
        }}
      />,
    );
    expect(screen.getByRole('radio', { name: /Son kanıt-alıntı iddiası/ })).toBeDisabled();
  });

  test('200 replay sonucu yeni kanıt üretilmediğini görünür biçimde söyler', async () => {
    mockRequest.mockResolvedValueOnce({ ...RECEIPT, replayed: true });
    renderPanel();
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('screening-replay-status')).toHaveTextContent(
        'Doğrulanmış tekrar — yeni kanıt yok',
      ),
    );
  });

  test('503 sonrası tekrar aynı idempotency key kullanır; yeni evidence üretme riski eklemez', async () => {
    mockRequest.mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValueOnce(RECEIPT);
    renderPanel();
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() => expect(screen.getByTestId('screening-write-error')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(mockKey).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0]?.[2]).toBe(mockRequest.mock.calls[1]?.[2]);
  });

  test('write 403 yalnız yazmayı kilitler; read yetkisi ayrı ve kullanılabilir kalır', async () => {
    mockRequest.mockRejectedValueOnce({ response: { status: 403 } });
    mockFetch.mockResolvedValueOnce(EVIDENCE);
    renderPanel();
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() => expect(screen.getByTestId('screening-submit')).toBeDisabled());
    expect(screen.getByText('Yetki hatası')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('screening-read-ref'), { target: { value: FSR } });
    fireEvent.click(screen.getByTestId('screening-read'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('iv-1', FSR));
    expect(screen.getByTestId('screening-read')).not.toBeDisabled();
  });

  test('read 403 yalnız okumayı kilitler; write yolu açık kalır', async () => {
    mockFetch.mockRejectedValueOnce({ response: { status: 403 } });
    renderPanel();
    fireEvent.change(screen.getByTestId('screening-read-ref'), { target: { value: FSR } });
    fireEvent.click(screen.getByTestId('screening-read'));
    await waitFor(() => expect(screen.getByTestId('screening-read')).toBeDisabled());
    expect(screen.getByTestId('screening-submit')).not.toBeDisabled();
  });

  test('yeni write receipt read inputunu güncellerken eski GET sonucunu ekranda bırakmaz', async () => {
    mockFetch.mockResolvedValueOnce(EVIDENCE);
    mockRequest.mockResolvedValueOnce({ ...RECEIPT, findingSetRef: OTHER_FSR });
    renderPanel();
    fireEvent.change(screen.getByTestId('screening-read-ref'), { target: { value: FSR } });
    fireEvent.click(screen.getByTestId('screening-read'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Kayıtlı tarama kanıtı' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('screening-submit'));
    await waitFor(() => expect(screen.getByTestId('screening-read-ref')).toHaveValue(OTHER_FSR));
    expect(
      screen.queryByRole('heading', { name: 'Kayıtlı tarama kanıtı' }),
    ).not.toBeInTheDocument();
  });

  test('GET 503 mesajı yazma idempotency anahtarı varmış gibi konuşmaz', async () => {
    mockFetch.mockRejectedValueOnce({ response: { status: 503 } });
    renderPanel();
    fireEvent.change(screen.getByTestId('screening-read-ref'), { target: { value: FSR } });
    fireEvent.click(screen.getByTestId('screening-read'));
    await waitFor(() => expect(screen.getByTestId('screening-read-error')).toBeInTheDocument());
    expect(screen.getByText(/kayıtlı kanıtı yeniden okuyabilirsiniz/i)).toBeInTheDocument();
    expect(screen.queryByText(/istek kimliği/i)).not.toBeInTheDocument();
  });

  test('klavyeyle tarama başlatılır ve sonuç başlığına odak taşınır', async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValueOnce(RECEIPT);
    renderPanel();
    const submit = screen.getByTestId('screening-submit');
    submit.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Tarama sonucu' })).toHaveFocus(),
    );
  });

  test('otomatik WCAG taramasında ihlal üretmez', async () => {
    const { container } = renderPanel('iv-1/cit-a');
    const result = await axe.run(container);
    expect(result.violations).toEqual([]);
  });
});
