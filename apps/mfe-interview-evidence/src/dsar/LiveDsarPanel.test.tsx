import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveDsarPanel } from './LiveDsarPanel';
import { AtsContractError } from '../transcripts/liveTranscriptApi';
import type { GuardReadResult, UnresolvedErasureGuard } from './unresolvedGuard';

vi.mock('./liveDsarApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./liveDsarApi')>();
  // classifyDsarError GERÇEK kalır (certainty politikası panel testinde de sınanır).
  return { ...actual, receiveLiveDsar: vi.fn(), executeLiveErasure: vi.fn() };
});
import { executeLiveErasure, receiveLiveDsar } from './liveDsarApi';
const mockIntake = vi.mocked(receiveLiveDsar);
const mockErasure = vi.mocked(executeLiveErasure);

type FakeGuard = UnresolvedErasureGuard & {
  armResult: boolean;
  armCalls: number;
  clearCalls: number;
};

function fakeGuard(initial: GuardReadResult = { kind: 'none' }): FakeGuard {
  const g: FakeGuard = {
    armResult: true,
    armCalls: 0,
    clearCalls: 0,
    read: () => initial,
    arm: () => {
      g.armCalls += 1;
      return g.armResult;
    },
    clear: () => {
      g.clearCalls += 1;
    },
  };
  return g;
}

const renderPanel = (
  over: {
    guard?: FakeGuard;
    transcriptKeys?: string[];
    selected?: string | null;
  } = {},
) => {
  const guard = over.guard ?? fakeGuard();
  const utils = render(
    <LiveDsarPanel
      interviewId="iv-1"
      transcriptKeys={over.transcriptKeys ?? ['tr-a', 'tr-b']}
      selectedTranscriptKey={over.selected === undefined ? 'tr-a' : over.selected}
      guard={guard}
    />,
  );
  return { guard, ...utils };
};

const set = (testId: string, v: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value: v } });

/** intake'i tamamlayıp scope editörüne geçirir. */
const intakeToScope = async (dsarKey = 'dsar-1') => {
  set('dsar-subject-input', 'subj-1');
  set('dsar-reason-input', 'reason-1');
  mockIntake.mockResolvedValueOnce(dsarKey);
  fireEvent.click(screen.getByTestId('dsar-intake-submit'));
  await waitFor(() => expect(screen.getByTestId('dsar-scope-editor')).toBeInTheDocument());
};

/** tr-a seçip teyit kartını açar. */
const openConfirm = () => {
  fireEvent.click(screen.getByTestId('dsar-transcript-tr-a'));
  fireEvent.click(screen.getByTestId('dsar-erasure-step1'));
  expect(screen.getByTestId('dsar-erasure-confirm')).toBeInTheDocument();
};

beforeEach(() => {
  mockIntake.mockReset();
  mockErasure.mockReset();
});

describe('intake — zorunlu opak girdiler + stale-dsarKey invalidation', () => {
  test('subject/reason boşken submit disabled; doluyken trim edilmiş çağrı + dsarKey rozeti', async () => {
    renderPanel();
    expect(screen.getByTestId('dsar-intake-submit')).toBeDisabled();
    set('dsar-subject-input', ' subj-1 ');
    expect(screen.getByTestId('dsar-intake-submit')).toBeDisabled(); // reason hâlâ boş
    set('dsar-reason-input', ' reason-1 ');
    mockIntake.mockResolvedValueOnce('dsar-1');
    fireEvent.click(screen.getByTestId('dsar-intake-submit'));
    await waitFor(() => expect(screen.getByTestId('dsar-key-badge')).toBeInTheDocument());
    expect(mockIntake).toHaveBeenCalledWith('iv-1', 'subj-1', 'reason-1');
  });

  test.each([
    ['subjectRef', 'dsar-subject-input'],
    ['reasonCode', 'dsar-reason-input'],
  ])(
    '%s DEĞİŞİNCE dsarKey + scope yüzeyi invalidate olur (yeni intake gerekir)',
    async (_n, input) => {
      renderPanel();
      await intakeToScope();
      expect(screen.getByTestId('dsar-key-badge')).toBeInTheDocument();
      set(input, 'değişti');
      expect(screen.queryByTestId('dsar-key-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dsar-scope-editor')).not.toBeInTheDocument();
      expect(screen.getByTestId('dsar-intake-form')).toBeInTheDocument();
    },
  );

  test("yeni intake submit BAŞLARKEN eski dsarKey senkron düşer; hata eski key'i GERİ GETİRMEZ", async () => {
    renderPanel();
    await intakeToScope('dsar-A');
    // Girdi değişimi → intake formuna dönüş; yeni submit pending bırakılır:
    set('dsar-subject-input', 'subj-2');
    let reject!: (e: unknown) => void;
    mockIntake.mockImplementationOnce(
      () =>
        new Promise((_res, rej) => {
          reject = rej;
        }),
    );
    fireEvent.click(screen.getByTestId('dsar-intake-submit'));
    expect(screen.queryByTestId('dsar-key-badge')).not.toBeInTheDocument(); // pending'de eski key YOK
    reject({ response: { status: 403, data: { error: 'DENIED' } } });
    await waitFor(() => expect(screen.getByTestId('dsar-error')).toBeInTheDocument());
    expect(screen.queryByTestId('dsar-key-badge')).not.toBeInTheDocument(); // eski key geri gelmedi
    expect(screen.getByText(/ats\.dsar\.write/)).toBeInTheDocument();
  });

  test('intake transport belirsizliği → intake-ambiguous; retry/reset SUNULMAZ', async () => {
    renderPanel();
    set('dsar-subject-input', 's');
    set('dsar-reason-input', 'r');
    mockIntake.mockRejectedValueOnce({ request: {}, message: 'timeout' });
    fireEvent.click(screen.getByTestId('dsar-intake-submit'));
    await waitFor(() => expect(screen.getByTestId('dsar-intake-ambiguous')).toBeInTheDocument());
    expect(screen.getByTestId('dsar-intake-ambiguous')).toHaveTextContent(
      /tekrar gönderim YAPILMADI/,
    );
    expect(screen.queryByTestId('dsar-intake-submit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dsar-new-request')).not.toBeInTheDocument();
  });
});

describe('erasure — frozen-snapshot teyit + outcome-aware guard', () => {
  test("hiçbir transcript önceden seçili değil; boş kapsam step1'de client-reddedilir", async () => {
    renderPanel();
    await intakeToScope();
    (['tr-a', 'tr-b'] as const).forEach((k) =>
      expect(screen.getByTestId(`dsar-transcript-${k}`)).not.toBeChecked(),
    );
    fireEvent.click(screen.getByTestId('dsar-erasure-step1'));
    expect(screen.getByTestId('dsar-error')).toHaveTextContent(/Silme kapsamı boş/);
    expect(screen.queryByTestId('dsar-erasure-confirm')).not.toBeInTheDocument();
  });

  test('teyit kartı donmuş kapsamı + parmak izini gösterir; scope girdisi değişince teyit KAPANIR', async () => {
    renderPanel();
    await intakeToScope();
    openConfirm();
    expect(screen.getByTestId('dsar-erasure-confirm')).toHaveTextContent(/Transkript: 1/);
    expect(screen.getByTestId('dsar-erasure-confirm')).toHaveTextContent(/parmak izi/);
    set('dsar-citation-refs-input', 'cit-1');
    expect(screen.queryByTestId('dsar-erasure-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('dsar-scope-editor')).toBeInTheDocument();
  });

  test('transcript checkbox değişimi de teyidi kapatır', async () => {
    renderPanel();
    await intakeToScope();
    openConfirm();
    fireEvent.click(screen.getByTestId('dsar-transcript-tr-b'));
    expect(screen.queryByTestId('dsar-erasure-confirm')).not.toBeInTheDocument();
  });

  test('arm=false → POST GÖNDERİLMEZ + güvenli engel mesajı (fail-closed)', async () => {
    const guard = fakeGuard();
    guard.armResult = false;
    renderPanel({ guard });
    await intakeToScope();
    openConfirm();
    fireEvent.click(screen.getByTestId('dsar-erasure-step2'));
    expect(guard.armCalls).toBe(1);
    expect(mockErasure).not.toHaveBeenCalled();
    expect(screen.getByTestId('dsar-error')).toHaveTextContent(/tekrar-koruması oluşturulamadığı/);
    expect(screen.getByTestId('dsar-error')).toHaveTextContent(/BAŞLATILMADI/);
  });

  test('başarı: frozen snapshot ile TEK POST → guard.clear → kilitli receipt → "Yeni DSAR" tam reset (clear TEKRAR çağrılmaz)', async () => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await intakeToScope();
    openConfirm();
    mockErasure.mockResolvedValueOnce({
      dsarKey: 'dsar-1',
      tombstoneCount: 2,
      deletedContentCount: 1,
      caseTransitioned: false,
    });
    const step2 = screen.getByTestId('dsar-erasure-step2');
    fireEvent.click(step2);
    fireEvent.click(step2); // çift-tık tek POST
    await waitFor(() => expect(screen.getByTestId('dsar-completed-receipt')).toBeInTheDocument());
    expect(mockErasure).toHaveBeenCalledTimes(1);
    expect(mockErasure).toHaveBeenCalledWith('iv-1', 'dsar-1', {
      transcriptKeys: ['tr-a'],
      citationKeys: [],
      exportArtifactKeys: [],
      reviewCaseKeys: [],
      tombstoneTargetEvidenceIds: [],
    });
    expect(guard.armCalls).toBe(1);
    expect(guard.clearCalls).toBe(1);
    const receipt = screen.getByTestId('dsar-completed-receipt');
    // Dürüst copy: yalnız gönderilen kapsam; caseTransitioned=false hata DEĞİL:
    expect(receipt).toHaveTextContent(/Gönderilen kapsam için silme yürütüldü/);
    expect(receipt).toHaveTextContent(/raporlanmadı \(terminal vaka state/);
    expect(receipt).toHaveTextContent(/tombstone kayıtları eklendi/); // tombstoneCount=2 > 0
    expect(receipt).toHaveTextContent(/tüm\s+verilerinin silindiği anlamına GELMEZ/);
    // Tam reset — unresolved marker'a dokunulmaz (clear sayısı değişmez):
    fireEvent.click(screen.getByTestId('dsar-new-request'));
    expect(screen.getByTestId('dsar-intake-form')).toBeInTheDocument();
    expect(screen.getByTestId('dsar-subject-input')).toHaveValue('');
    expect(guard.clearCalls).toBe(1);
  });

  test('tombstoneCount=0 iken "tombstone eklendi" DENMEZ', async () => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await intakeToScope();
    openConfirm();
    mockErasure.mockResolvedValueOnce({
      dsarKey: 'dsar-1',
      tombstoneCount: 0,
      deletedContentCount: 1,
      caseTransitioned: true,
    });
    fireEvent.click(screen.getByTestId('dsar-erasure-step2'));
    await waitFor(() => expect(screen.getByTestId('dsar-completed-receipt')).toBeInTheDocument());
    expect(screen.getByTestId('dsar-completed-receipt')).not.toHaveTextContent(
      /tombstone kayıtları eklendi/,
    );
    expect(screen.getByTestId('dsar-completed-receipt')).toHaveTextContent(
      /en az bir uygun vaka geçişi uygulandı/,
    );
  });

  test('403 (kesin uygulanmadı) → guard temizlenir + scope-editing + erasure.execute mesajı', async () => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await intakeToScope();
    openConfirm();
    mockErasure.mockRejectedValueOnce({ response: { status: 403, data: { error: 'DENIED' } } });
    fireEvent.click(screen.getByTestId('dsar-erasure-step2'));
    await waitFor(() => expect(screen.getByTestId('dsar-error')).toBeInTheDocument());
    expect(guard.clearCalls).toBe(1);
    expect(screen.getByTestId('dsar-scope-editor')).toBeInTheDocument();
    expect(screen.getByText(/ats\.erasure\.execute/)).toBeInTheDocument();
    expect(screen.queryByTestId('dsar-erasure-ambiguous')).not.toBeInTheDocument();
  });

  test.each([
    ['bilinmeyen 500', { response: { status: 500 } }],
    [
      'backend 400 (kısmî-yürütme noktası olabilir)',
      { response: { status: 400, data: { error: 'INVALID' } } },
    ],
    ['transport kesintisi', { request: {}, message: 'timeout' }],
    ['malformed-200 (kontrat)', new AtsContractError('bozuk receipt')],
  ])('erasure %s → guard KORUNUR + erasure-ambiguous (retry/"Yeni DSAR" YOK)', async (_n, err) => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await intakeToScope();
    openConfirm();
    mockErasure.mockRejectedValueOnce(err);
    fireEvent.click(screen.getByTestId('dsar-erasure-step2'));
    await waitFor(() => expect(screen.getByTestId('dsar-erasure-ambiguous')).toBeInTheDocument());
    expect(guard.clearCalls).toBe(0); // guard KALIR
    expect(screen.getByTestId('dsar-erasure-ambiguous')).toHaveTextContent(
      /OTOMATİK TEKRARLANMADI/,
    );
    expect(screen.queryByTestId('dsar-erasure-step2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dsar-new-request')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dsar-intake-form')).not.toBeInTheDocument();
  });
});

describe('remount kilidi + transcript prop dinamiği', () => {
  test('geçerli unresolved marker → panel kilitli (intake bile açılmaz)', () => {
    renderPanel({
      guard: fakeGuard({
        kind: 'unresolved',
        record: { version: 1, dsarKey: 'dsar-x', scopeFingerprint: 'f', startedAt: 't' },
      }),
    });
    expect(screen.getByTestId('dsar-blocked-unresolved')).toBeInTheDocument();
    expect(screen.queryByTestId('dsar-intake-form')).not.toBeInTheDocument();
  });

  test('malformed marker da fail-closed kilitler (sessizce yok sayılmaz)', () => {
    renderPanel({ guard: fakeGuard({ kind: 'malformed' }) });
    expect(screen.getByTestId('dsar-blocked-unresolved')).toHaveTextContent(
      /güvenlik kaydı doğrulanamadı/,
    );
  });

  test('prop listesinden düşen transcript seçimi budanır + teyit kapanır', async () => {
    const guard = fakeGuard();
    const view = renderPanel({ guard });
    await intakeToScope();
    openConfirm(); // tr-a seçili + teyit açık
    view.rerender(
      <LiveDsarPanel
        interviewId="iv-1"
        transcriptKeys={['tr-b']}
        selectedTranscriptKey={null}
        guard={guard}
      />,
    );
    expect(screen.queryByTestId('dsar-erasure-confirm')).not.toBeInTheDocument();
    // tr-a listede yok; boş kapsamla step1 artık reddedilir:
    fireEvent.click(screen.getByTestId('dsar-erasure-step1'));
    expect(screen.getByTestId('dsar-error')).toHaveTextContent(/Silme kapsamı boş/);
  });
});
