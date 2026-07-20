import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

/**
 * 39d-6 canlı READ yüzeyi testleri — liveTranscriptApi modülü mock'lanır
 * (kontrat testi liveTranscriptApi.test.ts'te); burada App'in mod dallanması,
 * state makinesi (loading→ready/error), yetki mesajı, fail-closed config-error
 * ve GEÇ-DÖNEN-CEVAP koruması (seçim değişimi eski cevabı ezmez) doğrulanır.
 */
vi.mock('./transcripts/liveTranscriptApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transcripts/liveTranscriptApi')>();
  return {
    ...actual,
    fetchLiveTranscripts: vi.fn(),
    fetchLiveSegments: vi.fn(),
  };
});

import { fetchLiveSegments, fetchLiveTranscripts } from './transcripts/liveTranscriptApi';

// 39d-7a: canlı panel App testinde stub — onTranscribed köprüsünü tetikleyen düğme
// (panelin kendi state-machine testleri LiveConsentUploadPanel.test.tsx'te).
vi.mock('./ingest/LiveConsentUploadPanel', () => ({
  LiveConsentUploadPanel: ({ onTranscribed }: { onTranscribed: (k: string) => void }) => (
    <button data-testid="mock-live-transcribed" onClick={() => onTranscribed('iv-smoke-1/tr-new')}>
      transkribe-stub
    </button>
  ),
}));

const mockList = vi.mocked(fetchLiveTranscripts);
const mockSegments = vi.mocked(fetchLiveSegments);

type EnvBag = Record<string, string | undefined>;
const g = globalThis as { __env__?: EnvBag };

const LIST = [
  {
    transcriptKey: 'iv-smoke-1/tr-aaa',
    label: 'Canlı tr · 3 segment · tr-aaa',
    origin: 'LIVE' as const,
    segments: [],
    erasure: null,
  },
  {
    transcriptKey: 'iv-smoke-1/tr-bbb',
    label: 'Canlı tr · 1 segment · tr-bbb',
    origin: 'LIVE' as const,
    segments: [],
    erasure: null,
  },
];
const SEGS_A = [{ index: 0, speakerLabel: 'S1', startMs: 0, endMs: 900, text: 'A segmenti' }];
const SEGS_B = [{ index: 0, speakerLabel: 'S2', startMs: 0, endMs: 500, text: 'B segmenti' }];

beforeEach(() => {
  g.__env__ = {
    INTERVIEW_EVIDENCE_DATA_MODE: 'live',
    INTERVIEW_EVIDENCE_INTERVIEW_ID: 'iv-smoke-1',
  };
  mockList.mockReset();
  mockSegments.mockReset();
});

afterEach(() => {
  delete g.__env__;
});

describe('mod dallanması (fail-closed)', () => {
  test('geçersiz mode değeri config-error kartı gösterir (sessiz demo düşüşü YOK)', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: 'lvie' };
    render(<App />);
    expect(screen.getByTestId('data-mode-config-error')).toBeInTheDocument();
    expect(screen.getByText(/lvie/)).toBeInTheDocument();
  });

  test('live + boş interviewId config-error (id hardcode edilmez)', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: 'live' };
    render(<App />);
    expect(screen.getByTestId('data-mode-config-error')).toBeInTheDocument();
    expect(screen.getByText(/INTERVIEW_EVIDENCE_INTERVIEW_ID/)).toBeInTheDocument();
  });

  test('env yokken demo yüzeyi render olur (rıza paneli görünür — 39c-7 davranışı)', () => {
    delete g.__env__;
    render(<App />);
    expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument();
    // Canlı moda özgü rozet YOK:
    expect(screen.queryByTestId('live-mode-badge')).not.toBeInTheDocument();
  });
});

describe('canlı liste + segment akışı', () => {
  test('loading → liste → ilk transkript otomatik seçilir → segmentler render', async () => {
    mockList.mockResolvedValueOnce(LIST);
    mockSegments.mockResolvedValueOnce(SEGS_A);
    render(<App />);
    expect(screen.getByTestId('live-list-loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument());
    expect(screen.getByTestId('live-mode-badge')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('A segmenti')).toBeInTheDocument());
    expect(mockSegments).toHaveBeenCalledWith('iv-smoke-1', 'iv-smoke-1/tr-aaa');
    expect(screen.getByTestId('protected-screening-panel')).toBeInTheDocument();
    // Yazma yüzeyleri canlı modda gizli — dürüst sınır kartı var:
    expect(screen.getByTestId('live-write-surfaces-note')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-state-select')).not.toBeInTheDocument();
  });

  test('boş liste dürüst boş-durum mesajı gösterir', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('live-list-empty')).toBeInTheDocument());
    expect(mockSegments).not.toHaveBeenCalled();
  });

  test('403 → AUTHZ: rol-kapısı mesajı (401 metni DEĞİL)', async () => {
    mockList.mockRejectedValueOnce({ response: { status: 403 } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('live-list-error')).toBeInTheDocument());
    expect(screen.getByText('Yetki hatası')).toBeInTheDocument();
    expect(screen.getByText(/yetkiniz yok/i)).toBeInTheDocument();
    // Yetki hatasında retry düğmesi YOK (tekrar denemek yetki getirmez):
    expect(screen.queryByText('Yeniden dene')).not.toBeInTheDocument();
  });

  test('401 → AUTHN: oturum mesajı — rol mesajıyla KARIŞMAZ (D29 Authn≠Authz aynası)', async () => {
    mockList.mockRejectedValueOnce({ response: { status: 401 } });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('live-list-error')).toBeInTheDocument());
    expect(screen.getByText('Oturum hatası')).toBeInTheDocument();
    expect(screen.getByText(/rol ataması bu hatayı çözmez/i)).toBeInTheDocument();
    expect(screen.queryByText(/yetkiniz yok/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Yeniden dene')).not.toBeInTheDocument();
  });

  test('generic hata → retry düğmesi yeniden fetch tetikler', async () => {
    mockList.mockRejectedValueOnce(new Error('bağlantı koptu'));
    mockList.mockResolvedValueOnce(LIST);
    mockSegments.mockResolvedValue(SEGS_A);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('live-list-error')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Yeniden dene'));
    await waitFor(() => expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument());
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  test('GEÇ DÖNEN CEVAP KORUMASI: A yavaş, B hızlı — B seçiliyken A cevabı ezemez', async () => {
    mockList.mockResolvedValueOnce(LIST);
    let resolveA!: (v: typeof SEGS_A) => void;
    const slowA = new Promise<typeof SEGS_A>((res) => {
      resolveA = res;
    });
    mockSegments.mockImplementation((_iv, key) =>
      key === 'iv-smoke-1/tr-aaa' ? slowA : Promise.resolve(SEGS_B),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument());
    // A otomatik seçildi (fetch'i asılı); kullanıcı B'ye geçer:
    fireEvent.click(screen.getByTestId('transcript-select-iv-smoke-1/tr-bbb'));
    await waitFor(() => expect(screen.getByText('B segmenti')).toBeInTheDocument());
    // A'nın geç cevabı şimdi gelir — B'nin yüzeyini EZMEMELİ:
    resolveA(SEGS_A);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('B segmenti')).toBeInTheDocument();
    expect(screen.queryByText('A segmenti')).not.toBeInTheDocument();
  });

  test('segment cache: aynı transkripte dönüş yeni fetch atmaz', async () => {
    mockList.mockResolvedValueOnce(LIST);
    mockSegments.mockImplementation((_iv, key) =>
      Promise.resolve(key === 'iv-smoke-1/tr-aaa' ? SEGS_A : SEGS_B),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText('A segmenti')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('transcript-select-iv-smoke-1/tr-bbb'));
    await waitFor(() => expect(screen.getByText('B segmenti')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('transcript-select-iv-smoke-1/tr-aaa'));
    await waitFor(() => expect(screen.getByText('A segmenti')).toBeInTheDocument());
    expect(mockSegments).toHaveBeenCalledTimes(2); // A + B; cache'ten dönüş 3. çağrı üretmedi
  });

  test('transcribe sonrası re-fetch: dönen key listede VARSA hedef-seçilir (39d-7a)', async () => {
    const NEW = {
      transcriptKey: 'iv-smoke-1/tr-new',
      label: 'Canlı tr · 2 segment · tr-new',
      origin: 'LIVE' as const,
      segments: [],
      erasure: null,
    };
    mockList.mockResolvedValueOnce(LIST);
    mockList.mockResolvedValueOnce([...LIST, NEW]);
    mockSegments.mockResolvedValue(SEGS_A);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-live-transcribed'));
    await waitFor(() =>
      expect(screen.getByTestId('transcript-select-iv-smoke-1/tr-new')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(mockList).toHaveBeenCalledTimes(2); // optimistik ekleme YOK — tam re-fetch
  });

  test('transcribe sonrası re-fetch: dönen key listede YOKSA consistency hatası (sessiz ilk-seçim YOK)', async () => {
    mockList.mockResolvedValueOnce(LIST);
    mockList.mockResolvedValueOnce(LIST); // yeni key GELMEDİ
    mockSegments.mockResolvedValue(SEGS_A);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-live-transcribed'));
    await waitFor(() => expect(screen.getByTestId('live-list-error')).toBeInTheDocument());
    expect(screen.getByText(/Tutarlılık hatası/)).toBeInTheDocument();
    expect(screen.getByText(/tr-new/)).toBeInTheDocument();
  });

  test('consistency retry HEDEFI UNUTMAZ: hata → Yeniden dene → hedef gelir → hedef seçilir', async () => {
    const NEW = {
      transcriptKey: 'iv-smoke-1/tr-new',
      label: 'Canlı tr · 2 segment · tr-new',
      origin: 'LIVE' as const,
      segments: [],
      erasure: null,
    };
    mockList.mockResolvedValueOnce(LIST); // ilk yükleme
    mockList.mockResolvedValueOnce(LIST); // transcribe sonrası: hedef HENÜZ yok → consistency error
    mockList.mockResolvedValueOnce([...LIST, NEW]); // retry: hedef geldi
    mockSegments.mockResolvedValue(SEGS_A);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('transcript-list-panel')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-live-transcribed'));
    await waitFor(() => expect(screen.getByText(/Tutarlılık hatası/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Yeniden dene'));
    await waitFor(() =>
      expect(screen.getByTestId('transcript-select-iv-smoke-1/tr-new')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    ); // sessizce ilk transkripte DÜŞMEDİ — hedef korundu (Codex 39d-7a P1)
  });
});
