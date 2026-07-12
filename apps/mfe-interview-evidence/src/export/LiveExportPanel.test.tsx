import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveExportPanel } from './LiveExportPanel';
import { parseExportProfile } from './exportProfile';
import type { ExportProfileResolution } from './exportProfile';
import { AtsContractError } from '../transcripts/liveTranscriptApi';
import type { GuardReadResult, UnresolvedErasureGuard } from '../dsar/unresolvedGuard';

vi.mock('./liveExportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./liveExportApi')>();
  // classifyExportError GERÇEK kalır — certainty politikası panelde de sınanır.
  return { ...actual, executeLiveExport: vi.fn() };
});
vi.mock('../review/liveReviewApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../review/liveReviewApi')>();
  return { ...actual, fetchLiveReviewCases: vi.fn() };
});
import { executeLiveExport } from './liveExportApi';
import { fetchLiveReviewCases } from '../review/liveReviewApi';
const mockExport = vi.mocked(executeLiveExport);
const mockList = vi.mocked(fetchLiveReviewCases);

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
const PROFILE_OK = parseExportProfile(JSON.stringify(PROFILE_JSON)) as Extract<
  ExportProfileResolution,
  { kind: 'ok' }
>;

const FINALIZED = { caseKey: 'case-f', state: { kind: 'known', value: 'FINALIZED' } as const };
const EXPORTED = { caseKey: 'case-x', state: { kind: 'known', value: 'EXPORTED' } as const };
const RECEIPT = {
  artifactKey: 'art-1',
  evidenceId: 'ev-1',
  packetDigest: 'b'.repeat(64),
  claimCount: 1,
};

type FakeGuard = UnresolvedErasureGuard & {
  armResult: boolean;
  armCalls: number;
  clearCalls: number;
};
function fakeGuard(read: GuardReadResult = { kind: 'none' }): FakeGuard {
  const g: FakeGuard = {
    armResult: true,
    armCalls: 0,
    clearCalls: 0,
    read: () => read,
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
    profile?: ExportProfileResolution;
    transcriptKey?: string | null;
    suggestion?: {
      interviewId: string;
      transcriptKey: string;
      evidenceId: string;
      citationKey: string;
    } | null;
  } = {},
) => {
  const guard = over.guard ?? fakeGuard();
  const utils = render(
    <LiveExportPanel
      interviewId="iv-1"
      selectedTranscriptKey={over.transcriptKey === undefined ? 'iv-1/tr-a' : over.transcriptKey}
      profileResolution={over.profile ?? PROFILE_OK}
      citationSuggestion={over.suggestion ?? null}
      guard={guard}
    />,
  );
  return { guard, ...utils };
};

const set = (testId: string, v: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value: v } });

/** FINALIZED vaka + tüm girdilerle teyide gelir. */
const fillAndConfirm = async () => {
  await waitFor(() => expect(screen.getByTestId('export-case-case-f')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('export-case-case-f'));
  set('export-citations-input', 'iv-1/cit-1');
  fireEvent.change(screen.getByTestId('export-criterion-iv-1/cit-1'), {
    target: { value: 'crit-1' },
  });
  set('export-consents-input', 'consent-1');
  set('export-worms-input', 'worm-1');
  fireEvent.click(screen.getByTestId('export-step1'));
  expect(screen.getByTestId('export-confirm')).toBeInTheDocument();
};

beforeEach(() => {
  mockExport.mockReset();
  mockList.mockReset();
  mockList.mockResolvedValue([FINALIZED, EXPORTED]);
});

describe('profil fail-closed kapıları', () => {
  test('missing → görünür kart + form YOK; config-error → reason gösterilir ama profil JSON değil', async () => {
    const { unmount } = renderPanel({ profile: { kind: 'missing' } });
    expect(screen.getByTestId('export-profile-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('export-step1')).not.toBeInTheDocument();
    unmount();
    renderPanel({
      profile: { kind: 'config-error', reason: 'Export profili geçersiz: version 1 olmalı' },
    });
    expect(screen.getByTestId('export-profile-error')).toHaveTextContent(/version 1 olmalı/);
    expect(screen.queryByTestId('export-step1')).not.toBeInTheDocument();
  });

  test('binding uyuşmazlığı → export yapısal kapalı (yanlış rubric/policy engeli)', () => {
    const other = parseExportProfile(
      JSON.stringify({ ...PROFILE_JSON, binding: { interviewId: 'iv-BAŞKA' } }),
    ) as Extract<ExportProfileResolution, { kind: 'ok' }>;
    renderPanel({ profile: other });
    expect(screen.getByTestId('export-profile-binding-mismatch')).toBeInTheDocument();
    expect(screen.queryByTestId('export-step1')).not.toBeInTheDocument();
  });
});

describe('vaka seçimi + girdi zorunlulukları', () => {
  test('yalnız FINALIZED seçilebilir; EXPORTED terminal-notu görünür-seçilemez', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('export-case-case-f')).toBeInTheDocument());
    expect(screen.queryByTestId('export-case-case-x')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-exported-note')).toHaveTextContent(/case-x/);
  });

  test('vaka/citation/consent/worm/mapping eksikken step1 client-reddedilir (POST yok)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('export-case-case-f')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('export-step1'));
    expect(screen.getByTestId('export-error')).toHaveTextContent(/FINALIZED bir inceleme vakası/);
    fireEvent.click(screen.getByTestId('export-case-case-f'));
    fireEvent.click(screen.getByTestId('export-step1'));
    expect(screen.getByTestId('export-error')).toHaveTextContent(/En az bir kanıt-alıntı/);
    set('export-citations-input', 'iv-1/cit-1');
    set('export-consents-input', 'consent-1');
    set('export-worms-input', 'worm-1');
    fireEvent.click(screen.getByTestId('export-step1'));
    expect(screen.getByTestId('export-error')).toHaveTextContent(/kriterine eşlenmeli/);
    expect(mockExport).not.toHaveBeenCalled();
  });

  test('citation listesi değişince stale mapping budanır + teyit kapanır', async () => {
    renderPanel();
    await fillAndConfirm();
    set('export-citations-input', 'iv-1/cit-2'); // liste değişti
    expect(screen.queryByTestId('export-confirm')).not.toBeInTheDocument();
    // cit-1 mapping'i budandı; cit-2 eşlenmemiş → step1 reddeder:
    fireEvent.click(screen.getByTestId('export-step1'));
    expect(screen.getByTestId('export-error')).toHaveTextContent(/eşlenmeli/);
  });

  test("7b receipt önerisi yalnız aynı interview+transcript; tıkla → textarea'ya eklenir", async () => {
    const SUG = {
      interviewId: 'iv-1',
      transcriptKey: 'iv-1/tr-a',
      evidenceId: 'ev-c',
      citationKey: 'iv-1/cit-9',
    };
    const first = renderPanel({ suggestion: SUG });
    await waitFor(() => expect(screen.getByTestId('export-citation-suggest')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('export-citation-suggest'));
    expect(screen.getByTestId('export-citations-input')).toHaveValue('iv-1/cit-9');
    first.unmount();
    // Görüntülenen transkript FARKLI → stale-transcript önerisi GÖRÜNMEZ (Codex 7d blocker-3):
    renderPanel({ suggestion: SUG, transcriptKey: 'iv-1/tr-BAŞKA' });
    await waitFor(() => expect(screen.getByTestId('export-citations-input')).toBeInTheDocument());
    expect(screen.queryByTestId('export-citation-suggest')).not.toBeInTheDocument();
  });

  test('transcriptKey null → öneri yok (yalnız interview eşleşmesi YETMEZ)', async () => {
    renderPanel({
      transcriptKey: null,
      suggestion: {
        interviewId: 'iv-1',
        transcriptKey: 'iv-1/tr-a',
        evidenceId: 'ev-c',
        citationKey: 'iv-1/cit-9',
      },
    });
    await waitFor(() => expect(screen.getByTestId('export-citations-input')).toBeInTheDocument());
    expect(screen.queryByTestId('export-citation-suggest')).not.toBeInTheDocument();
  });

  test('vaka değişince case-spesifik girdiler (citation/mapping/consent/worm) TAŞINMAZ', async () => {
    mockList.mockResolvedValue([
      FINALIZED,
      { caseKey: 'case-g', state: { kind: 'known', value: 'FINALIZED' } },
    ]);
    renderPanel();
    await fillAndConfirm(); // case-f + tüm girdiler + teyit açık
    fireEvent.click(screen.getByTestId('export-case-case-g'));
    expect(screen.queryByTestId('export-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-citations-input')).toHaveValue('');
    expect(screen.getByTestId('export-consents-input')).toHaveValue('');
    expect(screen.getByTestId('export-worms-input')).toHaveValue('');
    // Eski scope ile step-1 açılamaz:
    fireEvent.click(screen.getByTestId('export-step1'));
    expect(screen.getByTestId('export-error')).toHaveTextContent(/En az bir kanıt-alıntı/);
  });

  test('panel yolundan __proto__ mapping: frozen tuple → API context own-property (prototype-safe)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('export-case-case-f')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('export-case-case-f'));
    set('export-citations-input', '__proto__');
    fireEvent.change(screen.getByTestId('export-criterion-__proto__'), {
      target: { value: 'crit-1' },
    });
    set('export-consents-input', 'consent-1');
    set('export-worms-input', 'worm-1');
    fireEvent.click(screen.getByTestId('export-step1'));
    mockExport.mockResolvedValueOnce(RECEIPT);
    fireEvent.click(screen.getByTestId('export-step2'));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    const ctx = mockExport.mock.calls[0][3];
    expect(Object.prototype.hasOwnProperty.call(ctx.citationCriterion, '__proto__')).toBe(true);
    expect(ctx.citationCriterion['__proto__']).toBe('crit-1');
    expect(JSON.stringify(ctx.citationCriterion)).toBe('{"__proto__":"crit-1"}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('frozen-confirm + guard + certainty', () => {
  test('başarı: arm→POST(frozen)→clear→completed receipt; liste tazelenir', async () => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await fillAndConfirm();
    mockExport.mockResolvedValueOnce(RECEIPT);
    mockList.mockResolvedValueOnce([
      EXPORTED,
      { ...FINALIZED, state: { kind: 'known', value: 'EXPORTED' } },
    ]);
    const step2 = screen.getByTestId('export-step2');
    fireEvent.click(step2);
    fireEvent.click(step2); // çift-tık tek POST
    await waitFor(() => expect(screen.getByTestId('export-completed-receipt')).toBeInTheDocument());
    expect(mockExport).toHaveBeenCalledTimes(1);
    const [iv, ck, keys, ctx] = mockExport.mock.calls[0];
    expect([iv, ck]).toEqual(['iv-1', 'case-f']);
    expect(keys).toEqual(['iv-1/cit-1']);
    expect(ctx.citationCriterion).toEqual({ 'iv-1/cit-1': 'crit-1' });
    expect(guard.armCalls).toBe(1);
    expect(guard.clearCalls).toBe(1);
    expect(screen.getByTestId('export-completed-receipt')).toHaveTextContent(/tek-export/);
  });

  test('valid receipt + liste-refetch FAIL → receipt KORUNUR + stale-list notu (success-with-stale-list)', async () => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await fillAndConfirm();
    mockExport.mockResolvedValueOnce(RECEIPT);
    mockList.mockRejectedValueOnce(new Error('liste kesildi'));
    fireEvent.click(screen.getByTestId('export-step2'));
    await waitFor(() => expect(screen.getByTestId('export-completed-receipt')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('export-stale-list-note')).toBeInTheDocument());
    expect(guard.clearCalls).toBe(1);
  });

  test('arm=false → POST GÖNDERİLMEZ (fail-closed engel mesajı)', async () => {
    const guard = fakeGuard();
    guard.armResult = false;
    renderPanel({ guard });
    await fillAndConfirm();
    fireEvent.click(screen.getByTestId('export-step2'));
    expect(mockExport).not.toHaveBeenCalled();
    expect(screen.getByTestId('export-error')).toHaveTextContent(/BAŞLATILMADI/);
  });

  test('403+DENIED (kesin uygulanmadı) → guard temizlenir + editing + ats.export.write', async () => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await fillAndConfirm();
    mockExport.mockRejectedValueOnce({ response: { status: 403, data: { error: 'DENIED' } } });
    fireEvent.click(screen.getByTestId('export-step2'));
    await waitFor(() => expect(screen.getByTestId('export-error')).toBeInTheDocument());
    expect(guard.clearCalls).toBe(1);
    expect(screen.getByText(/ats\.export\.write/)).toBeInTheDocument();
    expect(screen.queryByTestId('export-ambiguous')).not.toBeInTheDocument();
  });

  test.each([
    [
      '400+INVALID (post-side-effect olabilir)',
      { response: { status: 400, data: { error: 'INVALID', reason: 'x' } } },
    ],
    ['bilinmeyen 500', { response: { status: 500 } }],
    ['transport', { request: {}, message: 'timeout' }],
    ['malformed-201 (kontrat)', new AtsContractError('bozuk')],
  ])('%s → guard KORUNUR + ambiguous (retry YOK)', async (_n, err) => {
    const guard = fakeGuard();
    renderPanel({ guard });
    await fillAndConfirm();
    mockExport.mockRejectedValueOnce(err);
    fireEvent.click(screen.getByTestId('export-step2'));
    await waitFor(() => expect(screen.getByTestId('export-ambiguous')).toBeInTheDocument());
    expect(guard.clearCalls).toBe(0);
    expect(screen.queryByTestId('export-step2')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-ambiguous')).toHaveTextContent(/KANITLAMAZ/);
  });
});

describe('reconciliation 4-durum (POST retry ASLA)', () => {
  const toAmbiguous = async (guard: FakeGuard) => {
    renderPanel({ guard });
    await fillAndConfirm();
    mockExport.mockRejectedValueOnce({ response: { status: 500 } });
    fireEvent.click(screen.getByTestId('export-step2'));
    await waitFor(() => expect(screen.getByTestId('export-ambiguous')).toBeInTheDocument());
  };

  test('EXPORTED görünür → reconciled-exported; receipt UYDURULMAZ; guard temizlenir', async () => {
    const guard = fakeGuard();
    await toAmbiguous(guard);
    mockList.mockResolvedValueOnce([
      { caseKey: 'case-f', state: { kind: 'known', value: 'EXPORTED' } },
    ]);
    fireEvent.click(screen.getByTestId('export-reconcile'));
    await waitFor(() =>
      expect(screen.getByTestId('export-reconciled-exported')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('export-reconciled-exported')).toHaveTextContent(/doğrulanamıyor/);
    expect(screen.queryByTestId('export-completed-receipt')).not.toBeInTheDocument();
    expect(guard.clearCalls).toBe(1);
    expect(mockExport).toHaveBeenCalledTimes(1); // retry YOK
  });

  test('hâlâ FINALIZED → ambiguous KALIR (R4: uygulanmadı kanıtı değil); guard korunur', async () => {
    const guard = fakeGuard();
    await toAmbiguous(guard);
    mockList.mockResolvedValueOnce([FINALIZED]);
    fireEvent.click(screen.getByTestId('export-reconcile'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('export-ambiguous')).toBeInTheDocument();
    expect(guard.clearCalls).toBe(0);
    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  test.each([
    [401, 'Oturum hatası'],
    [403, 'Yetki hatası'],
  ])(
    'reconcile GET %i → GÖRÜNÜR sınıflı mesaj (ambiguous kartında) + guard korunur + retry yok',
    async (status, badge) => {
      const detail = status === 401 ? /yeniden giriş/ : /ats\.review\.read/;
      const guard = fakeGuard();
      await toAmbiguous(guard);
      mockList.mockRejectedValueOnce({ response: { status } });
      fireEvent.click(screen.getByTestId('export-reconcile'));
      // Gerçek DOM: hata AMBIGUOUS kartının içinde kullanıcıya GÖRÜNÜR (Codex final-blocker):
      await waitFor(() => expect(screen.getByTestId('export-reconcile-error')).toBeInTheDocument());
      expect(screen.getByText(badge)).toBeInTheDocument();
      expect(screen.getByText(detail)).toBeInTheDocument();
      expect(screen.getByTestId('export-ambiguous')).toBeInTheDocument();
      expect(guard.clearCalls).toBe(0);
      expect(mockExport).toHaveBeenCalledTimes(1);
      // Sonraki BAŞARILI reconciliation hata kartını temizler + terminal geçiş:
      mockList.mockResolvedValueOnce([
        { caseKey: 'case-f', state: { kind: 'known', value: 'EXPORTED' } },
      ]);
      fireEvent.click(screen.getByTestId('export-reconcile'));
      await waitFor(() =>
        expect(screen.getByTestId('export-reconciled-exported')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('export-reconcile-error')).not.toBeInTheDocument();
      expect(mockExport).toHaveBeenCalledTimes(1); // POST retry hiç olmadı
    },
  );

  test('initial liste 403 → ats.review.read yönlendirmesi (export.write yeterli değil)', async () => {
    mockList.mockReset();
    mockList.mockRejectedValueOnce({ response: { status: 403 } });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('export-list-error')).toBeInTheDocument());
    expect(screen.getByText('Yetki hatası')).toBeInTheDocument();
    expect(screen.getByText(/ats\.review\.read/)).toBeInTheDocument();
  });

  test('vaka listede YOK → ambiguous kalır; GET hatası → yalnız GET yeniden denenebilir', async () => {
    const guard = fakeGuard();
    await toAmbiguous(guard);
    mockList.mockResolvedValueOnce([]); // missing
    fireEvent.click(screen.getByTestId('export-reconcile'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('export-ambiguous')).toBeInTheDocument();
    mockList.mockRejectedValueOnce({ response: { status: 401 } }); // GET hatası
    fireEvent.click(screen.getByTestId('export-reconcile'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('export-ambiguous')).toBeInTheDocument();
    expect(guard.clearCalls).toBe(0);
    expect(mockExport).toHaveBeenCalledTimes(1);
  });
});

describe('remount kilidi', () => {
  test.each([
    [
      'geçerli unresolved marker',
      {
        kind: 'unresolved' as const,
        record: { version: 1 as const, dsarKey: 'case-f', scopeFingerprint: 'f', startedAt: 't' },
      },
    ],
    ['malformed marker (fail-closed)', { kind: 'malformed' as const }],
  ])('%s → seçilen vaka için export kilitli', async (_n, read) => {
    renderPanel({ guard: fakeGuard(read as GuardReadResult) });
    await waitFor(() => expect(screen.getByTestId('export-case-case-f')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('export-case-case-f'));
    expect(screen.getByTestId('export-blocked-unresolved')).toBeInTheDocument();
    expect(screen.queryByTestId('export-step1')).not.toBeInTheDocument();
  });
});
