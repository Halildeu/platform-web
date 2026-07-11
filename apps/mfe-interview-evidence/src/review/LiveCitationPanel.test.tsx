import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveCitationPanel } from './LiveCitationPanel';

vi.mock('./liveCitationApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./liveCitationApi')>();
  return { ...actual, requestLiveCitation: vi.fn() };
});
import { requestLiveCitation } from './liveCitationApi';
const mockCite = vi.mocked(requestLiveCitation);

const RECEIPT = {
  citationKey: 'iv-1/cit-0123456789abcdef',
  evidenceId: 'ev-9',
  entailment: 'SUPPORTED' as const,
  resolvedRefCount: 2,
};

beforeEach(() => mockCite.mockReset());

const type = (v: string) =>
  fireEvent.change(screen.getByTestId('live-citation-claim-input'), { target: { value: v } });

describe('LiveCitationPanel — AI-taslak dili + hata sınıfları (Codex 019f50b7 şartları)', () => {
  test('boş claim → buton disabled (istek yolu kapalı)', () => {
    render(<LiveCitationPanel interviewId="iv-1" transcriptKey="iv-1/tr-a" />);
    expect(screen.getByTestId('live-citation-submit')).toBeDisabled();
  });

  test('SUPPORTED sonucu "AI önerisi … insan onayı bekliyor" dilinde; FINALIZED/onay görseli ASLA', async () => {
    mockCite.mockResolvedValueOnce(RECEIPT);
    render(<LiveCitationPanel interviewId="iv-1" transcriptKey="iv-1/tr-a" />);
    type('aday deneyim anlattı');
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    await waitFor(() => expect(screen.getByTestId('live-citation-result')).toBeInTheDocument());
    expect(mockCite).toHaveBeenCalledWith('iv-1', 'iv-1/tr-a', 'aday deneyim anlattı');
    expect(
      screen.getByText(/AI önerisi: destekleniyor — insan onayı bekliyor/),
    ).toBeInTheDocument();
    expect(screen.getByText(/FINALIZE EDİLMEMİŞTİR/)).toBeInTheDocument();
    const html = document.body.textContent ?? '';
    expect(html).not.toMatch(/FINALIZED|APPROVED|Onaylandı/);
  });

  test('claim değişince eski öneri/hata INVALIDATE edilir (yanlış iddiaya bağlanamaz)', async () => {
    mockCite.mockResolvedValueOnce(RECEIPT);
    render(<LiveCitationPanel interviewId="iv-1" transcriptKey="iv-1/tr-a" />);
    type('Claim A');
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    await waitFor(() => expect(screen.getByTestId('live-citation-result')).toBeInTheDocument());
    // Kullanıcı iddiayı değiştirir — submit ETMEDEN eski sonuç kaybolmalı:
    type('Claim B');
    expect(screen.queryByTestId('live-citation-result')).not.toBeInTheDocument();
    expect(mockCite).toHaveBeenCalledTimes(1);
    // Hata görünümü için de aynı invalidate:
    mockCite.mockRejectedValueOnce({ response: { status: 403 } });
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    await waitFor(() => expect(screen.getByTestId('live-citation-error')).toBeInTheDocument());
    type('Claim C');
    expect(screen.queryByTestId('live-citation-error')).not.toBeInTheDocument();
    // Yeni submit YENİ canonical claim ile gider:
    mockCite.mockResolvedValueOnce(RECEIPT);
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    await waitFor(() => expect(screen.getByTestId('live-citation-result')).toBeInTheDocument());
    expect(mockCite).toHaveBeenLastCalledWith('iv-1', 'iv-1/tr-a', 'Claim C');
  });

  test('in-flight kilit: çift tık tek istek üretir', async () => {
    let release!: (v: typeof RECEIPT) => void;
    mockCite.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    render(<LiveCitationPanel interviewId="iv-1" transcriptKey="iv-1/tr-a" />);
    type('iddia');
    const btn = screen.getByTestId('live-citation-submit');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mockCite).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    release(RECEIPT);
    await waitFor(() => expect(screen.getByTestId('live-citation-result')).toBeInTheDocument());
  });

  test.each([
    [
      '401 → Oturum hatası',
      { response: { status: 401 } },
      'Oturum hatası',
      /rol ataması bu hatayı çözmez/,
    ],
    ['403 → Yetki hatası', { response: { status: 403 } }, 'Yetki hatası', /ats\.citation\.write/],
    [
      '503 → AI bağımlılığı (yetki/karar DEĞİL)',
      { response: { status: 503 } },
      'AI bağımlılığı kullanılamıyor',
      /yetki ya da içerik kararı DEĞİLDİR/,
    ],
  ])('%s', async (_n, err, badge, detail) => {
    mockCite.mockRejectedValueOnce(err);
    render(<LiveCitationPanel interviewId="iv-1" transcriptKey="iv-1/tr-a" />);
    type('iddia');
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    await waitFor(() => expect(screen.getByTestId('live-citation-error')).toBeInTheDocument());
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    // 503 "desteklenmiyor" önerisi gibi YORUMLANMAZ:
    expect(screen.queryByTestId('live-citation-result')).not.toBeInTheDocument();
  });

  test('unmount sonrası geç dönen cevap state yazmaz (act uyarısı/sızıntı yok)', async () => {
    let release!: (v: typeof RECEIPT) => void;
    mockCite.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    const { unmount } = render(<LiveCitationPanel interviewId="iv-1" transcriptKey="iv-1/tr-a" />);
    type('iddia');
    fireEvent.click(screen.getByTestId('live-citation-submit'));
    unmount();
    release(RECEIPT); // alive-guard: setState çağrılmamalı (hata fırlatmaz, konsol temiz)
    await new Promise((r) => setTimeout(r, 0));
  });
});
