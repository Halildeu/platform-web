import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Stack, Text } from '@mfe/design-system';
import {
  fetchLiveReviewCases,
  finalizeLiveReviewCase,
  openLiveReviewCase,
  transitionLiveReviewCase,
} from './liveReviewApi';
import type { LiveReviewCaseSummary, TransitionAction } from './liveReviewApi';
import {
  AtsClientValidationError,
  isAuthnError,
  isAuthzError,
} from '../transcripts/liveTranscriptApi';

/**
 * 39d-7b-2 canlı insan-onay/finalize paneli (F5) — Codex 019f535a şartlı-onaylı plan:
 * - READ fail-soft / WRITE fail-closed: tanınmayan state listede ham gösterilir
 *   ("Doğrulanmamış durum") ama o vakada TÜM mutasyonlar kapalı; istemci
 *   bilinmeyen state'in geçişlerini TAHMİN ETMEZ.
 * - FINALIZE iki-adımlı onay {interviewId, caseKey, decisionOutcomeRef} bağlamına
 *   bağlı; bağlam/girdi/seçim/hata değişiminde teyit sıfırlanır; istek ikinci-tık
 *   anındaki doğrulanmış değerlerle gider.
 * - RECONCILIATION modu: mutasyon backend'ce kabul edildi ama liste yenilenemedi →
 *   local state TAHMİN EDİLMEZ, komut otomatik TEKRAR EDİLMEZ, aksiyonlar liste
 *   yenilenene dek kilitli. Network/timeout belirsizliğinde (cevapsız POST) aynı
 *   mod: "sonucu doğrulanamadı" — non-idempotent POST'lar otomatik retry edilmez.
 * - F4→F5 bağı: "İnceleme başlat" YALNIZ bu interview+transkript için üretilmiş
 *   güncel citation receipt'iyle mümkün (sourceEvidenceRefs=[evidenceId],
 *   aiOutputVersionRef=citationKey).
 */
export interface CitationReceiptRef {
  interviewId: string;
  transcriptKey: string;
  evidenceId: string;
  citationKey: string;
}

type Busy = null | 'open' | `transition:${TransitionAction}` | 'finalize' | 'list';

type ListState =
  | { phase: 'loading' }
  | { phase: 'ready'; cases: LiveReviewCaseSummary[] }
  | { phase: 'error'; kind: ErrKind; detail: string }
  | { phase: 'reconcile'; notice: string };

type ErrKind = 'authn' | 'authz' | 'validation' | 'generic';

function classify(error: unknown): { kind: ErrKind; detail: string } {
  if (error instanceof AtsClientValidationError) {
    return { kind: 'validation', detail: error.message };
  }
  if (isAuthnError(error)) {
    return {
      kind: 'authn',
      detail: 'Oturum doğrulanamadı — yeniden giriş gerekebilir; rol ataması bu hatayı çözmez.',
    };
  }
  if (isAuthzError(error)) {
    return {
      kind: 'authz',
      detail:
        'Bu işlem için yetkiniz yok (ats.review.write / ats.review.read rolleri — rol-kapısı fail-closed).',
    };
  }
  // Review çağrıları AI'ya gitmez — 5xx dahil generic-backend sınıfı.
  return { kind: 'generic', detail: error instanceof Error ? error.message : 'Beklenmeyen hata' };
}

/** Cevapsız POST (network/timeout) — backend işlemi UYGULAMIŞ olabilir; retry YASAK. */
function isAmbiguousNetworkError(error: unknown): boolean {
  const e = error as { response?: unknown; request?: unknown } | null;
  return !!e && typeof e === 'object' && 'request' in e && !e.response;
}

const KNOWN_STATE_BADGE: Record<string, 'info' | 'warning' | 'success' | 'muted'> = {
  OPEN: 'info',
  IN_REVIEW: 'warning',
  FINALIZED: 'success',
  EXPORTED: 'muted',
};

export function LiveReviewCasePanel({
  interviewId,
  transcriptKey,
  citationReceipt,
}: {
  interviewId: string;
  transcriptKey: string;
  citationReceipt: CitationReceiptRef | null;
}) {
  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [selectedCaseKey, setSelectedCaseKey] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<{ kind: ErrKind; detail: string } | null>(null);
  const [oversightRoleRef, setOversightRoleRef] = useState('');
  const [actionRef, setActionRef] = useState('');
  const [decisionRef, setDecisionRef] = useState('');
  // Teyit {interviewId, caseKey, decisionOutcomeRef} üçlüsüne bağlı (Codex şart-1).
  const [finalizeConfirm, setFinalizeConfirm] = useState<{
    caseKey: string;
    decisionOutcomeRef: string;
  } | null>(null);
  const alive = useRef(true);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Receipt geçerliliği: BU interview + BU transkript için üretilmiş olmalı (Codex şart-3).
  const receiptValid =
    !!citationReceipt &&
    citationReceipt.interviewId === interviewId &&
    citationReceipt.transcriptKey === transcriptKey;

  // Bağlam değişimlerinde teyit + hata sıfırlanır (interviewId/receipt prop'la değişebilir;
  // transcriptKey değişimi zaten key= remount'tur).
  useEffect(() => {
    setFinalizeConfirm(null);
    setActionError(null);
  }, [interviewId, citationReceipt]);

  const refetchList = async (): Promise<boolean> => {
    try {
      const cases = await fetchLiveReviewCases(interviewId);
      if (!alive.current) return true;
      setList({ phase: 'ready', cases });
      setSelectedCaseKey((prev) => (cases.some((c) => c.caseKey === prev) ? prev : ''));
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setList({ phase: 'loading' });
    fetchLiveReviewCases(interviewId).then(
      (cases) => {
        if (cancelled || !alive.current) return;
        setList({ phase: 'ready', cases });
      },
      (error) => {
        if (cancelled || !alive.current) return;
        setList({ phase: 'error', ...classify(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  // Teyit adımı açılınca focus taşınır (klavye erişilebilirliği).
  useEffect(() => {
    if (finalizeConfirm) confirmRef.current?.focus();
  }, [finalizeConfirm]);

  const cases = list.phase === 'ready' ? list.cases : [];
  const selected = cases.find((c) => c.caseKey === selectedCaseKey) ?? null;
  const selectedWritable =
    selected?.state.kind === 'known' &&
    (selected.state.value === 'OPEN' || selected.state.value === 'IN_REVIEW');
  const locked = busy !== null || list.phase === 'reconcile';

  /**
   * Ortak mutasyon zarfı: OK → liste re-fetch (backend authority); re-fetch FAIL →
   * reconciliation (komut TEKRARLANMAZ). Cevapsız POST → "sonucu doğrulanamadı"
   * reconciliation (otomatik retry YASAK). Hata → teyit sıfırlanır, ilk adıma dönülür.
   */
  const mutate = async (kind: Exclude<Busy, null | 'list'>, fn: () => Promise<unknown>) => {
    if (locked) return;
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
      if (!alive.current) return;
      setFinalizeConfirm(null);
      const ok = await refetchList();
      if (!alive.current) return;
      if (!ok) {
        setList({
          phase: 'reconcile',
          notice:
            'İşlem backend tarafından kabul edildi ancak güncel vaka durumu alınamadı. Komut TEKRAR EDİLMEDİ — listeyi yenileyin.',
        });
      }
    } catch (error) {
      if (!alive.current) return;
      setFinalizeConfirm(null); // hata sonrası teyit modunda KALINMAZ (Codex şart-b)
      if (isAmbiguousNetworkError(error)) {
        setList({
          phase: 'reconcile',
          notice:
            'İsteğin sonucu doğrulanamadı (bağlantı kesildi) — backend işlemi uygulamış olabilir. Otomatik tekrar YAPILMADI; listeyi yenileyip güncel durumu görün.',
        });
      } else {
        setActionError(classify(error));
      }
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const reloadList = async () => {
    if (busy) return;
    setBusy('list');
    setList({ phase: 'loading' });
    const ok = await refetchList();
    if (alive.current) {
      if (!ok) setList({ phase: 'error', kind: 'generic', detail: 'Liste yenilenemedi.' });
      setBusy(null);
    }
  };

  const stateBadge = (s: LiveReviewCaseSummary) =>
    s.state.kind === 'known' ? (
      <Badge variant={KNOWN_STATE_BADGE[s.state.value] ?? 'info'}>{s.state.value}</Badge>
    ) : (
      <Badge variant="warning" data-testid={`case-state-unknown-${s.caseKey}`}>
        {s.state.raw} — Doğrulanmamış durum; bu istemci sürümü işlem yapamaz
      </Badge>
    );

  const keyTail = (k: string) => (k.length > 14 ? `…${k.slice(-10)}` : k);

  return (
    <Stack direction="column" gap={3} data-testid="live-review-panel">
      <Text as="h2" size="lg" weight="semibold">
        İnsan incelemesi (F5 — canlı)
      </Text>
      <Text as="p" size="sm" variant="secondary">
        Karar İNSANINDIR: AI taslağı ancak insan adımlarıyla (başlat → düzelt/onayla/ret + gerekçe)
        işlenir ve tek-FINALIZED-girişi ile kapanır (no-auto-finalize). Referans alanları OPAKTIR —
        karar metni ya da aday PII'si girmeyin.
      </Text>

      {list.phase === 'loading' && (
        <Text as="p" size="sm" data-testid="review-list-loading">
          Vaka listesi yükleniyor…
        </Text>
      )}

      {list.phase === 'error' && (
        <Stack direction="column" gap={2} data-testid="review-list-error">
          <Badge variant="error">
            {list.kind === 'authn'
              ? 'Oturum hatası'
              : list.kind === 'authz'
                ? 'Yetki hatası'
                : 'Liste okunamadı'}
          </Badge>
          <Text as="p" size="sm">
            {list.detail}
          </Text>
          {list.kind === 'generic' && (
            <div>
              <Button variant="ghost" onClick={reloadList} disabled={busy !== null}>
                Yeniden dene
              </Button>
            </div>
          )}
        </Stack>
      )}

      {list.phase === 'reconcile' && (
        <Stack direction="column" gap={2} data-testid="review-reconcile-notice">
          <Badge variant="warning">Durum doğrulanmalı</Badge>
          <Text as="p" size="sm">
            {list.notice}
          </Text>
          <div>
            <Button
              data-testid="review-reload-list"
              variant="primary"
              onClick={reloadList}
              disabled={busy !== null}
            >
              Listeyi yeniden yükle
            </Button>
          </div>
        </Stack>
      )}

      {list.phase === 'ready' && (
        <>
          <Stack direction="column" gap={2}>
            <div>
              <Button
                data-testid="review-open-case"
                variant="secondary"
                disabled={locked || !receiptValid}
                onClick={() =>
                  citationReceipt &&
                  mutate('open', () =>
                    openLiveReviewCase(
                      interviewId,
                      [citationReceipt.evidenceId],
                      citationReceipt.citationKey,
                    ),
                  )
                }
              >
                {busy === 'open' ? 'Açılıyor…' : 'İnceleme başlat (son kanıt-alıntıdan)'}
              </Button>
            </div>
            {!receiptValid && (
              <Text as="p" size="sm" variant="secondary" data-testid="review-open-hint">
                Önce bu transkript için kanıt-alıntı üretin — inceleme vakası o kanıta bağlanır (F4
                → F5).
              </Text>
            )}
          </Stack>

          {cases.length === 0 ? (
            <Text as="p" size="sm" data-testid="review-list-empty">
              Bu mülakat için inceleme vakası yok.
            </Text>
          ) : (
            <ul
              data-testid="review-case-list"
              style={{ display: 'grid', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}
            >
              {cases.map((c) => (
                <li
                  key={c.caseKey}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Button
                    variant={c.caseKey === selectedCaseKey ? 'primary' : 'ghost'}
                    aria-pressed={c.caseKey === selectedCaseKey}
                    data-testid={`review-case-select-${c.caseKey}`}
                    disabled={locked}
                    onClick={() => {
                      setSelectedCaseKey(c.caseKey);
                      setFinalizeConfirm(null); // seçim değişimi teyidi sıfırlar
                      setActionError(null);
                    }}
                  >
                    <code>{keyTail(c.caseKey)}</code>
                  </Button>
                  {stateBadge(c)}
                </li>
              ))}
            </ul>
          )}

          {selected && selected.state.kind === 'unknown' && (
            <Text as="p" size="sm" variant="secondary" data-testid="review-unknown-state-note">
              Bu vakanın durumu bu istemci sürümünce tanınmıyor; izin verilen geçişler
              bilinmediğinden hiçbir işlem sunulmuyor (fail-closed).
            </Text>
          )}

          {selected && selected.state.kind === 'known' && !selectedWritable && (
            <Text as="p" size="sm" variant="secondary" data-testid="review-terminal-state-note">
              Vaka {selected.state.value} durumunda — insan-adımı/finalize kapalı (tek-FINALIZED
              girişi; export bu yüzeyin parçası değil).
            </Text>
          )}

          {selected && selectedWritable && (
            <Stack direction="column" gap={3} data-testid="review-actions">
              <Stack direction="column" gap={2}>
                <label htmlFor="review-oversight-ref">
                  <Text as="span" size="sm">
                    Gözetim rol referansı (START için; opak)
                  </Text>
                </label>
                <input
                  id="review-oversight-ref"
                  data-testid="review-oversight-input"
                  value={oversightRoleRef}
                  disabled={locked}
                  onChange={(e) => setOversightRoleRef(e.target.value)}
                  placeholder="örn. role-hiring-lead"
                />
                <div>
                  <Button
                    data-testid="review-action-START"
                    variant="secondary"
                    disabled={locked || !oversightRoleRef.trim()}
                    onClick={() =>
                      mutate('transition:START', () =>
                        transitionLiveReviewCase(interviewId, selected.caseKey, 'START', {
                          oversightRoleRef: oversightRoleRef.trim(),
                        }),
                      )
                    }
                  >
                    İncelemeyi başlat (START)
                  </Button>
                </div>
              </Stack>

              <Stack direction="column" gap={2}>
                <label htmlFor="review-action-ref">
                  <Text as="span" size="sm">
                    Adım referansı (EDIT/REJECT/RATIONALE için; opak)
                  </Text>
                </label>
                <input
                  id="review-action-ref"
                  data-testid="review-actionref-input"
                  value={actionRef}
                  disabled={locked}
                  onChange={(e) => setActionRef(e.target.value)}
                  placeholder="örn. change-2026-0712-01"
                />
                <Stack direction="row" gap={2} style={{ flexWrap: 'wrap' }}>
                  {(['EDIT', 'REVIEWED_NO_CHANGE', 'REJECT', 'RATIONALE'] as const).map((a) => (
                    <Button
                      key={a}
                      data-testid={`review-action-${a}`}
                      variant="ghost"
                      disabled={locked || (a !== 'REVIEWED_NO_CHANGE' && !actionRef.trim())}
                      onClick={() =>
                        mutate(`transition:${a}`, () =>
                          transitionLiveReviewCase(interviewId, selected.caseKey, a, {
                            ref: a === 'REVIEWED_NO_CHANGE' ? undefined : actionRef.trim(),
                          }),
                        )
                      }
                    >
                      {a}
                    </Button>
                  ))}
                </Stack>
              </Stack>

              <Stack direction="column" gap={2} data-testid="review-finalize-block">
                <label htmlFor="review-decision-ref">
                  <Text as="span" size="sm">
                    Karar sonucu referansı (opak — zorunlu)
                  </Text>
                </label>
                <input
                  id="review-decision-ref"
                  data-testid="review-decision-input"
                  value={decisionRef}
                  disabled={locked}
                  onChange={(e) => {
                    setDecisionRef(e.target.value);
                    setFinalizeConfirm(null); // ref değişimi teyidi sıfırlar (Codex şart-1)
                  }}
                  placeholder="örn. decision-2026-0712-A"
                />
                {!finalizeConfirm && (
                  <div>
                    <Button
                      data-testid="review-finalize-step1"
                      variant="secondary"
                      disabled={locked || !decisionRef.trim()}
                      onClick={() =>
                        setFinalizeConfirm({
                          caseKey: selected.caseKey,
                          decisionOutcomeRef: decisionRef.trim(),
                        })
                      }
                    >
                      Finalize et…
                    </Button>
                  </div>
                )}
                {finalizeConfirm && (
                  <Stack direction="column" gap={2} data-testid="review-finalize-confirm">
                    <Badge variant="warning">Geri alınamaz işlem</Badge>
                    <Text as="p" size="sm">
                      Vaka <code>{keyTail(finalizeConfirm.caseKey)}</code>, karar referansı{' '}
                      <code>{finalizeConfirm.decisionOutcomeRef}</code> ile KALICI olarak finalize
                      edilecek. Vaka için TEK FINALIZED girişi oluşturulabilir; export bu işlemin
                      parçası değildir.
                    </Text>
                    <Stack direction="row" gap={2}>
                      <Button
                        ref={confirmRef}
                        data-testid="review-finalize-step2"
                        variant="primary"
                        aria-label="Seçili inceleme vakasını kalıcı olarak finalize et"
                        disabled={locked}
                        onClick={() =>
                          mutate('finalize', () =>
                            finalizeLiveReviewCase(
                              interviewId,
                              finalizeConfirm.caseKey,
                              finalizeConfirm.decisionOutcomeRef,
                            ),
                          )
                        }
                      >
                        {busy === 'finalize' ? 'Finalize ediliyor…' : 'Kalıcı olarak finalize et'}
                      </Button>
                      <Button
                        data-testid="review-finalize-cancel"
                        variant="ghost"
                        disabled={locked}
                        onClick={() => setFinalizeConfirm(null)}
                      >
                        Vazgeç
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </Stack>
          )}
        </>
      )}

      {actionError && (
        <Stack direction="column" gap={2} data-testid="review-action-error">
          <Badge variant="error">
            {actionError.kind === 'authn' && 'Oturum hatası'}
            {actionError.kind === 'authz' && 'Yetki hatası'}
            {actionError.kind === 'validation' && 'Geçersiz girdi'}
            {actionError.kind === 'generic' && 'İşlem başarısız'}
          </Badge>
          <Text as="p" size="sm">
            {actionError.detail}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
