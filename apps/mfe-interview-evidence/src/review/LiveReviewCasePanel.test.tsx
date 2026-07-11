import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveReviewCasePanel } from './LiveReviewCasePanel';
import type { CitationReceiptRef } from './LiveReviewCasePanel';

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
import {
  fetchLiveReviewCases,
  finalizeLiveReviewCase,
  openLiveReviewCase,
  transitionLiveReviewCase,
} from './liveReviewApi';
const mockList = vi.mocked(fetchLiveReviewCases);
const mockOpen = vi.mocked(openLiveReviewCase);
const mockTransition = vi.mocked(transitionLiveReviewCase);
const mockFinalize = vi.mocked(finalizeLiveReviewCase);

const RECEIPT: CitationReceiptRef = {
  interviewId: 'iv-1',
  transcriptKey: 'iv-1/tr-a',
  evidenceId: 'ev-cit-1',
  citationKey: 'iv-1/cit-1',
};
const CASE_OPEN = { caseKey: 'case-1', state: { kind: 'known', value: 'OPEN' } as const };
const CASE_UNKNOWN = {
  caseKey: 'case-u',
  state: { kind: 'unknown', raw: 'SOME_FUTURE_STATE' } as const,
};

const renderPanel = (receipt: CitationReceiptRef | null = RECEIPT) =>
  render(
    <LiveReviewCasePanel interviewId="iv-1" transcriptKey="iv-1/tr-a" citationReceipt={receipt} />,
  );

const set = (testId: string, v: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value: v } });

beforeEach(() => {
  mockList.mockReset();
  mockOpen.mockReset();
  mockTransition.mockReset();
  mockFinalize.mockReset();
});

describe('LiveReviewCasePanel — F4→F5 bağı + unknown-state', () => {
  test('receipt yoksa/başka bağlama aitse "İnceleme başlat" disabled + ipucu', async () => {
    mockList.mockResolvedValue([]);
    renderPanel(null);
    await waitFor(() => expect(screen.getByTestId('review-open-case')).toBeInTheDocument());
    expect(screen.getByTestId('review-open-case')).toBeDisabled();
    expect(screen.getByTestId('review-open-hint')).toBeInTheDocument();
  });

  test('receipt BAŞKA transkripte aitse open disabled (bağlam eşleşmesi)', async () => {
    mockList.mockResolvedValue([]);
    renderPanel({ ...RECEIPT, transcriptKey: 'iv-1/tr-BAŞKA' });
    await waitFor(() => expect(screen.getByTestId('review-open-case')).toBeDisabled());
  });

  test('geçerli receipt ile open → evidenceId+citationKey ile POST + liste re-fetch', async () => {
    mockList.mockResolvedValueOnce([]).mockResolvedValueOnce([CASE_OPEN]);
    mockOpen.mockResolvedValueOnce('case-1');
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('review-open-case')).toBeEnabled());
    fireEvent.click(screen.getByTestId('review-open-case'));
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
    expect(mockOpen).toHaveBeenCalledWith('iv-1', ['ev-cit-1'], 'iv-1/cit-1');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  test('unknown-state vaka RENDER edilir ama seçilince hiçbir write sunulmaz (fail-closed)', async () => {
    mockList.mockResolvedValue([CASE_UNKNOWN]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('case-state-unknown-case-u')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-u'));
    expect(screen.getByTestId('review-unknown-state-note')).toBeInTheDocument();
    expect(screen.queryByTestId('review-actions')).not.toBeInTheDocument();
  });

  test('FINALIZED vakada write kapalı (terminal-durum notu)', async () => {
    mockList.mockResolvedValue([
      { caseKey: 'case-f', state: { kind: 'known', value: 'FINALIZED' } },
    ]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-f')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-f'));
    expect(screen.getByTestId('review-terminal-state-note')).toBeInTheDocument();
    expect(screen.queryByTestId('review-finalize-block')).not.toBeInTheDocument();
  });
});

describe('finalize iki-adım onay (Codex şart-1)', () => {
  const selectOpenCase = async () => {
    mockList.mockResolvedValue([CASE_OPEN]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-1'));
  };

  test('decisionOutcomeRef boşsa İLK adım bile disabled; doluysa teyit açılır ve üçlü gösterilir', async () => {
    await selectOpenCase();
    expect(screen.getByTestId('review-finalize-step1')).toBeDisabled();
    set('review-decision-input', ' decision-A ');
    fireEvent.click(screen.getByTestId('review-finalize-step1'));
    const confirm = screen.getByTestId('review-finalize-confirm');
    expect(confirm).toHaveTextContent('decision-A');
    expect(confirm).toHaveTextContent(/Geri alınamaz/);
    expect(confirm).toHaveTextContent(/TEK FINALIZED girişi/);
    expect(confirm).toHaveTextContent(/export bu işlemin parçası değildir/);
    // Erişilebilir ad (klavye/focus: teyit butonu odaklanır):
    const step2 = screen.getByLabelText('Seçili inceleme vakasını kalıcı olarak finalize et');
    expect(step2).toHaveFocus();
  });

  test('decisionOutcomeRef DEĞİŞİNCE teyit sıfırlanır; ikinci tık İKİNCİ-TIK-ANI değerleriyle gider', async () => {
    await selectOpenCase();
    set('review-decision-input', 'decision-A');
    fireEvent.click(screen.getByTestId('review-finalize-step1'));
    expect(screen.getByTestId('review-finalize-confirm')).toBeInTheDocument();
    set('review-decision-input', 'decision-B');
    expect(screen.queryByTestId('review-finalize-confirm')).not.toBeInTheDocument();
    // Yeni teyit + gönderim yeni değerle:
    mockFinalize.mockResolvedValueOnce({ caseKey: 'case-1', evidenceId: 'ev-f' });
    fireEvent.click(screen.getByTestId('review-finalize-step1'));
    fireEvent.click(screen.getByTestId('review-finalize-step2'));
    await waitFor(() => expect(mockFinalize).toHaveBeenCalledWith('iv-1', 'case-1', 'decision-B'));
  });

  test('vaka seçimi değişince teyit sıfırlanır', async () => {
    mockList.mockResolvedValue([
      CASE_OPEN,
      { caseKey: 'case-2', state: { kind: 'known', value: 'IN_REVIEW' } },
    ]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-1'));
    set('review-decision-input', 'decision-A');
    fireEvent.click(screen.getByTestId('review-finalize-step1'));
    expect(screen.getByTestId('review-finalize-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('review-case-select-case-2'));
    expect(screen.queryByTestId('review-finalize-confirm')).not.toBeInTheDocument();
  });

  test('finalize hatasında teyit modunda KALINMAZ (ilk adıma dönüş) + double-click tek POST', async () => {
    await selectOpenCase();
    set('review-decision-input', 'decision-A');
    fireEvent.click(screen.getByTestId('review-finalize-step1'));
    let reject!: (e: unknown) => void;
    mockFinalize.mockImplementationOnce(
      () =>
        new Promise((_res, rej) => {
          reject = rej;
        }),
    );
    const step2 = screen.getByTestId('review-finalize-step2');
    fireEvent.click(step2);
    fireEvent.click(step2);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    reject({ response: { status: 403 } });
    await waitFor(() => expect(screen.getByTestId('review-action-error')).toBeInTheDocument());
    expect(screen.getByText('Yetki hatası')).toBeInTheDocument();
    expect(screen.queryByTestId('review-finalize-confirm')).not.toBeInTheDocument();
  });
});

describe('reconciliation modu (Codex şart-4/5)', () => {
  test('mutasyon OK + liste re-fetch FAIL → komut TEKRARLANMAZ; aksiyonlar kilitli; "yeniden yükle" çıkışı', async () => {
    mockList.mockResolvedValueOnce([CASE_OPEN]); // ilk yükleme
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-1'));
    set('review-oversight-input', 'role-x');
    mockTransition.mockResolvedValueOnce(undefined);
    mockList.mockRejectedValueOnce(new Error('liste kesildi')); // re-fetch FAIL
    fireEvent.click(screen.getByTestId('review-action-START'));
    await waitFor(() => expect(screen.getByTestId('review-reconcile-notice')).toBeInTheDocument());
    expect(screen.getByTestId('review-reconcile-notice')).toHaveTextContent(/TEKRAR EDİLMEDİ/);
    expect(mockTransition).toHaveBeenCalledTimes(1); // otomatik retry YOK
    // Aksiyon yüzeyi kilitli (liste 'ready' değil):
    expect(screen.queryByTestId('review-actions')).not.toBeInTheDocument();
    // Çıkış: listeyi yeniden yükle → normal moda dönüş
    mockList.mockResolvedValueOnce([
      { caseKey: 'case-1', state: { kind: 'known', value: 'IN_REVIEW' } },
    ]);
    fireEvent.click(screen.getByTestId('review-reload-list'));
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
  });

  test('cevapsız finalize (network belirsizliği) → "sonucu doğrulanamadı" reconciliation; otomatik POST retry YOK', async () => {
    mockList.mockResolvedValueOnce([CASE_OPEN]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-1'));
    set('review-decision-input', 'decision-A');
    fireEvent.click(screen.getByTestId('review-finalize-step1'));
    mockFinalize.mockRejectedValueOnce({ request: {}, message: 'timeout' }); // response YOK
    fireEvent.click(screen.getByTestId('review-finalize-step2'));
    await waitFor(() => expect(screen.getByTestId('review-reconcile-notice')).toBeInTheDocument());
    expect(screen.getByTestId('review-reconcile-notice')).toHaveTextContent(/doğrulanamadı/);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    // Finalize kontrolü artık görünmüyor (duplicate-finalize sunulmaz):
    expect(screen.queryByTestId('review-finalize-step2')).not.toBeInTheDocument();
  });
});

describe('hata sınıfları + kilitler', () => {
  test('liste 401 → Oturum hatası; 403 → Yetki hatası (ats.review mesajı)', async () => {
    mockList.mockRejectedValueOnce({ response: { status: 401 } });
    const { unmount } = renderPanel();
    await waitFor(() => expect(screen.getByTestId('review-list-error')).toBeInTheDocument());
    expect(screen.getByText('Oturum hatası')).toBeInTheDocument();
    unmount();
    mockList.mockRejectedValueOnce({ response: { status: 403 } });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('review-list-error')).toBeInTheDocument());
    expect(screen.getByText(/ats\.review/)).toBeInTheDocument();
  });

  test('transition in-flight iken TÜM mutasyonlar kilitli (open + finalize dahil)', async () => {
    mockList.mockResolvedValueOnce([CASE_OPEN]);
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('review-case-select-case-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('review-case-select-case-1'));
    set('review-oversight-input', 'role-x');
    let release!: () => void;
    mockTransition.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          release = () => res();
        }),
    );
    fireEvent.click(screen.getByTestId('review-action-START'));
    expect(screen.getByTestId('review-open-case')).toBeDisabled();
    expect(screen.getByTestId('review-action-EDIT')).toBeDisabled();
    expect(screen.getByTestId('review-finalize-step1')).toBeDisabled();
    fireEvent.click(screen.getByTestId('review-action-START'));
    expect(mockTransition).toHaveBeenCalledTimes(1);
    mockList.mockResolvedValueOnce([CASE_OPEN]);
    release();
    await waitFor(() => expect(screen.getByTestId('review-open-case')).toBeEnabled());
  });
});
