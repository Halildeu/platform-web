import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Stack, Text } from '@mfe/design-system';
import { classifyExportError, executeLiveExport, fetchExportReceipt } from './liveExportApi';
import { isAuthnError, isAuthzError } from '../transcripts/liveTranscriptApi';
import type {
  ClassifiedExportError,
  LiveExportReceipt,
  RecoveredExportReceipt,
} from './liveExportApi';
import type { ExportProfileResolution, ExportProfileV1 } from './exportProfile';
import { fetchLiveReviewCases } from '../review/liveReviewApi';
import type { LiveReviewCaseSummary } from '../review/liveReviewApi';
import type { CitationReceiptRef } from '../review/LiveReviewCasePanel';
import { parseOpaqueRefs, canonicalizeRefs } from '../dsar/opaqueRefs';
import { createSessionUnresolvedGuard } from '../dsar/unresolvedGuard';
import type { UnresolvedErasureGuard } from '../dsar/unresolvedGuard';

/**
 * 39d-7d canlı export paneli (F7) — Codex 019f535a 3-iter plan-AGREE.
 *
 * 3-KATMAN GÜVENLİK MODELİ (README/PR-body'de de):
 *   1. Frontend: frozen confirmation + in-flight kilit + session guard +
 *      4-durum reconciliation (bu dosya).
 *   2. Backend service: validateContext + compensation + FINALIZED/EXPORTED
 *      state-machine.
 *   3. Database: worm_ledger UNIQUE(tenant_id, idempotency_key) → aynı case
 *      için en fazla BİR ledger-bağlı etkili export (asıl invariant BURADA).
 *
 * Guard BEST-EFFORT duplicate-submit azaltmasıdır (aynı sekme); cross-tab/
 * multi-user invariant DEĞİLDİR — o DB-UNIQUE'tedir. Non-idempotent POST
 * OTOMATİK RETRY EDİLMEZ. Ambiguous'tan çıkış İKİ authoritative oracle ile:
 *   a) review-cases GET: EXPORTED görünürse export GERÇEKLEŞMİŞTİR ama
 *      receipt kimlikleri bu yüzeyde yok (reconciled-exported); FINALIZED
 *      görünmesi 'uygulanmadı' KANITLAMAZ (R4) — retry açılmaz.
 *   b) 39d-8b makbuz-kurtarma GET (WORM-ledger): COMPLETED → kimlikler
 *      KURTARILIR (uydurma yok); exact 404+NOT_FOUND → ledger-kaydı yok =
 *      etkili export YOK (tek negatif-oracle; R4'te bile ledger satırı var
 *      olduğundan 200 INCOMPLETE dönerdi) → kilit çözülür, retry açılır;
 *      INCOMPLETE (R4) → kilit korunur, runbook repair.
 */
type PanelPhase =
  | { phase: 'editing' }
  | { phase: 'confirming'; confirmation: FrozenExportConfirmation }
  | { phase: 'submitting'; confirmation: FrozenExportConfirmation }
  | { phase: 'ambiguous'; confirmation: FrozenExportConfirmation }
  | { phase: 'reconciled-exported'; caseKey: string }
  | { phase: 'completed'; receipt: LiveExportReceipt }
  | { phase: 'recovered-receipt'; receipt: RecoveredExportReceipt }
  | { phase: 'blocked-unresolved'; malformed: boolean };

interface FrozenExportConfirmation {
  interviewId: string;
  caseKey: string;
  citationKeys: string[];
  consentRefs: string[];
  wormChainRefs: string[];
  citationCriterion: [string, string][];
  profile: ExportProfileV1;
}

type ListState =
  | { phase: 'loading' }
  | { phase: 'ready'; cases: LiveReviewCaseSummary[] }
  | { phase: 'error'; kind: 'authn' | 'authz' | 'generic'; detail: string };

/** Review-list GET hataları (reconciliation dahil): ats.export.write yeterli
 *  DEĞİLDİR — liste ats.review.read ister; kullanıcı doğru yönlendirilir. */
function classifyReviewListError(error: unknown): Extract<ListState, { phase: 'error' }> {
  if (isAuthnError(error)) {
    return {
      phase: 'error',
      kind: 'authn',
      detail: 'Oturum doğrulanamadı — yeniden giriş gerekebilir; rol ataması bu hatayı çözmez.',
    };
  }
  if (isAuthzError(error)) {
    return {
      phase: 'error',
      kind: 'authz',
      detail: 'Vaka listesini görüntülemek için ats.review.read yetkisi gerekli.',
    };
  }
  return { phase: 'error', kind: 'generic', detail: 'Vaka listesi okunamadı.' };
}

/** Null-prototype own-property map — panel yolu da API yoluyla AYNI güvenlikte
 *  (__proto__/constructor/prototype normal veri anahtarı; Codex 7d blocker-2). */
function mappingFromEntries(
  entries: readonly (readonly [string, string])[],
): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  for (const [key, value] of entries) {
    Object.defineProperty(result, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

const ERR_BADGE: Record<ClassifiedExportError['kind'], string> = {
  authn: 'Oturum hatası',
  authz: 'Yetki hatası',
  'tenant-scope': 'Kapsam güvenlik engeli',
  validation: 'Geçersiz istek',
  'not-found': 'Bulunamadı',
  generic: 'İşlem başarısız',
};

const guardId = (interviewId: string, caseKey: string) =>
  `${encodeURIComponent(interviewId)}:${encodeURIComponent(caseKey)}`;

export function LiveExportPanel({
  interviewId,
  selectedTranscriptKey,
  profileResolution,
  citationSuggestion,
  guard,
}: {
  interviewId: string;
  /** Öneri yalnız GÖRÜNTÜLENEN transkriptin receipt'i için (stale-transcript önerisi yok). */
  selectedTranscriptKey: string | null;
  profileResolution: ExportProfileResolution;
  /** 7b receipt'i — INSUFFICIENT önerilmez (App filtreler); transcript eşleşmesi burada. */
  citationSuggestion: CitationReceiptRef | null;
  guard?: UnresolvedErasureGuard;
}) {
  const guardRef = useRef<UnresolvedErasureGuard>(
    guard ?? createSessionUnresolvedGuard(undefined, 'ats.export.unresolved'),
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const profile = profileResolution.kind === 'ok' ? profileResolution.profile : null;
  const profileBindingOk = !!profile && profile.binding.interviewId === interviewId;

  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [selectedCaseKey, setSelectedCaseKey] = useState('');
  const [citationText, setCitationText] = useState('');
  const [consentText, setConsentText] = useState('');
  const [wormText, setWormText] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [state, setState] = useState<PanelPhase>({ phase: 'editing' });
  const [error, setError] = useState<ClassifiedExportError | null>(null);
  const [staleListNote, setStaleListNote] = useState(false);
  const [receiptNote, setReceiptNote] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const busy = state.phase === 'submitting';

  const reloadCases = async (): Promise<boolean> => {
    try {
      const cases = await fetchLiveReviewCases(interviewId);
      if (!alive.current) return true;
      setList({ phase: 'ready', cases });
      return true;
    } catch (error) {
      if (alive.current) {
        setList(classifyReviewListError(error));
      }
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setList({ phase: 'loading' });
    fetchLiveReviewCases(interviewId).then(
      (cases) => {
        if (!cancelled && alive.current) setList({ phase: 'ready', cases });
      },
      (error) => {
        if (!cancelled && alive.current) {
          setList(classifyReviewListError(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  useEffect(() => {
    if (state.phase === 'confirming') confirmRef.current?.focus();
  }, [state.phase]);

  const citationKeys = useMemo(() => parseOpaqueRefs(citationText), [citationText]);

  // Citation listesi değişince stale mapping budanır (Codex şartı).
  useEffect(() => {
    setMapping((prev) => {
      const next: Record<string, string> = {};
      for (const k of citationKeys) {
        if (Object.prototype.hasOwnProperty.call(prev, k)) next[k] = prev[k];
      }
      return next;
    });
    setState((s) => (s.phase === 'confirming' ? { phase: 'editing' } : s));
    setError(null);
  }, [JSON.stringify(citationKeys)]);

  const inputsChanged = () => {
    setError(null);
    setState((s) => (s.phase === 'confirming' ? { phase: 'editing' } : s));
  };

  const selectCase = (caseKey: string) => {
    if (caseKey !== selectedCaseKey) {
      // Case-spesifik pointer'lar başka vakaya TAŞINMAZ (Codex 7d şartı):
      setCitationText('');
      setConsentText('');
      setWormText('');
      setMapping({});
      setStaleListNote(false);
    }
    setSelectedCaseKey(caseKey);
    setError(null);
    setReceiptNote(null);
    setState((s) => (s.phase === 'confirming' ? { phase: 'editing' } : s));
    // Remount-kilidi: seçilen case için unresolved/malformed marker → blocked.
    const read = guardRef.current.read(guardId(interviewId, caseKey));
    if (read.kind === 'unresolved') setState({ phase: 'blocked-unresolved', malformed: false });
    if (read.kind === 'malformed') setState({ phase: 'blocked-unresolved', malformed: true });
  };

  const openConfirmation = () => {
    if (!profile || !profileBindingOk || busy) return;
    setError(null);
    const consentRefs = canonicalizeRefs(parseOpaqueRefs(consentText));
    const wormChainRefs = canonicalizeRefs(parseOpaqueRefs(wormText));
    const sortedCitations = canonicalizeRefs(citationKeys);
    if (!selectedCaseKey) {
      setError({
        kind: 'validation',
        detail: 'FINALIZED bir inceleme vakası seçin.',
        certainty: 'not-applied',
      });
      return;
    }
    if (sortedCitations.length === 0 || consentRefs.length === 0 || wormChainRefs.length === 0) {
      setError({
        kind: 'validation',
        detail:
          'En az bir kanıt-alıntı + bir rıza referansı + bir WORM zincir referansı zorunlu (kanıtsız/rızasız packet üretilmez).',
        certainty: 'not-applied',
      });
      return;
    }
    const unmapped = sortedCitations.filter(
      (k) => !Object.prototype.hasOwnProperty.call(mapping, k) || !mapping[k],
    );
    if (unmapped.length > 0) {
      setError({
        kind: 'validation',
        detail: 'Her kanıt-alıntı bir rubric kriterine eşlenmeli (eşlenmemiş alıntı var).',
        certainty: 'not-applied',
      });
      return;
    }
    setState({
      phase: 'confirming',
      confirmation: {
        interviewId,
        caseKey: selectedCaseKey,
        citationKeys: sortedCitations,
        consentRefs,
        wormChainRefs,
        citationCriterion: sortedCitations.map((k) => [k, mapping[k]] as [string, string]),
        profile,
      },
    });
  };

  const executeConfirmed = (confirmation: FrozenExportConfirmation) => {
    if (busy) return;
    setError(null);
    const key = guardId(confirmation.interviewId, confirmation.caseKey);
    const armed = guardRef.current.arm(key, {
      version: 1,
      dsarKey: confirmation.caseKey, // V1 kayıt şekli reuse — alan opak case ref'i taşır
      scopeFingerprint: String(confirmation.citationKeys.length),
      startedAt: new Date().toISOString(),
    });
    if (!armed) {
      setState({ phase: 'editing' });
      setError({
        kind: 'generic',
        detail:
          'Güvenli tekrar-koruması oluşturulamadığı için export BAŞLATILMADI. Tarayıcı depolama erişimini kontrol edin.',
        certainty: 'not-applied',
      });
      return;
    }
    setState({ phase: 'submitting', confirmation });
    const mappingObj = mappingFromEntries(confirmation.citationCriterion);
    // İkinci tık FROZEN snapshot'ı gönderir — canlı inputlar yeniden okunmaz.
    executeLiveExport(confirmation.interviewId, confirmation.caseKey, confirmation.citationKeys, {
      profile: confirmation.profile,
      consentRefs: confirmation.consentRefs,
      wormChainRefs: confirmation.wormChainRefs,
      citationCriterion: mappingObj,
    }).then(
      (receipt) => {
        if (!alive.current) return;
        guardRef.current.clear(key); // yalnız kesin-201+valid-receipt
        setState({ phase: 'completed', receipt });
        // Authoritative liste tazelenir; başarısızlığı receipt'i GÖLGELEMEZ
        // (success-with-stale-list ayrı not — Codex şartı).
        reloadCases().then((ok) => {
          if (alive.current && !ok) setStaleListNote(true);
        });
      },
      (err) => {
        if (!alive.current) return;
        const classified = classifyExportError(err);
        if (classified.certainty === 'not-applied') {
          guardRef.current.clear(key);
          setState({ phase: 'editing' });
          setError(classified);
        } else {
          // Guard KORUNUR — export uygulanmış olabilir (R1/R4 dahil).
          setState({ phase: 'ambiguous', confirmation });
        }
      },
    );
  };

  /**
   * 39d-8b makbuz-kurtarma (R2): WORM-ledger'a bağlı ikinci oracle.
   * - completed → makbuz kimlikleri KURTARILDI (uydurma yok) + kilit çözülür.
   * - no-export (exact 404+NOT_FOUND) → ledger'da kayıt YOK = etkili export
   *   yok (negatif-oracle; R4'te bile ledger satırı vardır → 200 INCOMPLETE
   *   dönerdi) → kilit çözülür, yeniden deneme açılır.
   * - incomplete-r4 → tamamlanmamış export; kilit KORUNUR (runbook repair).
   * - authn/authz/unresolved → sonuç hakkında bilgi VERMEZ; kilit korunur.
   * GET idempotent → tekrar denenebilir (POST'un aksine).
   */
  const recoverReceipt = async (caseKey: string) => {
    if (receiptBusy) return;
    setReceiptNote(null);
    setReceiptBusy(true);
    const result = await fetchExportReceipt(interviewId, caseKey);
    setReceiptBusy(false);
    if (!alive.current) return;
    if (result.kind === 'completed') {
      guardRef.current.clear(guardId(interviewId, caseKey));
      setError(null);
      setState({ phase: 'recovered-receipt', receipt: result.receipt });
      reloadCases().then((ok) => {
        if (alive.current && !ok) setStaleListNote(true);
      });
      return;
    }
    if (result.kind === 'no-export') {
      guardRef.current.clear(guardId(interviewId, caseKey));
      setState({ phase: 'editing' });
      setError({
        kind: 'not-found',
        detail:
          'Kanıt-defterinde (WORM) bu vaka için export kaydı yok — önceki deneme etkili olmamış. Yeniden deneyebilirsiniz.',
        certainty: 'not-applied',
      });
      return;
    }
    if (result.kind === 'incomplete-r4') {
      setReceiptNote(
        'Makbuz bulundu ama export geçişi TAMAMLANMAMIŞ (R4): kanıt-defteri kaydı var, vaka EXPORTED değil. ' +
          'Operasyonel inceleme/onarım gerekir; yeniden deneme AÇILMAZ.',
      );
      return;
    }
    setReceiptNote(result.detail);
  };

  /** Ambiguous'tan çıkışın diğer yolu: authoritative review-cases GET'i (POST retry ASLA). */
  const reconcile = async (confirmation: FrozenExportConfirmation) => {
    let cases: LiveReviewCaseSummary[];
    try {
      cases = await fetchLiveReviewCases(interviewId);
    } catch (error) {
      // GET hatası — ambiguous kalır; yalnız GET yeniden denenebilir (POST asla).
      if (alive.current) setList(classifyReviewListError(error));
      return;
    }
    if (!alive.current) return;
    setList({ phase: 'ready', cases });
    const found = cases.find((c) => c.caseKey === confirmation.caseKey);
    if (found && found.state.kind === 'known' && found.state.value === 'EXPORTED') {
      // Export GERÇEKLEŞMİŞ — ama receipt kimlikleri bu yüzeyde YOK; uydurulmaz.
      guardRef.current.clear(guardId(confirmation.interviewId, confirmation.caseKey));
      setState({ phase: 'reconciled-exported', caseKey: confirmation.caseKey });
    }
    // FINALIZED/unknown/missing → 'uygulanmadı' KANITI DEĞİL (R4) — ambiguous kalır.
  };

  const keyTail = (k: string) => (k.length > 18 ? `…${k.slice(-12)}` : k);

  /** Makbuz-kurtarma bloğu — blocked/ambiguous/reconciled kartlarında ortak. */
  const receiptRecovery = (caseKey: string) => (
    <>
      {receiptNote && (
        <Stack direction="column" gap={1} data-testid="export-receipt-note">
          <Badge variant="warning">Makbuz sorgusu sonuçsuz</Badge>
          <Text as="p" size="sm">
            {receiptNote}
          </Text>
        </Stack>
      )}
      <div>
        <Button
          data-testid="export-receipt-recover"
          variant="secondary"
          disabled={receiptBusy}
          onClick={() => recoverReceipt(caseKey)}
        >
          Makbuzu getir (kanıt-defteri)
        </Button>
      </div>
    </>
  );

  const cases = list.phase === 'ready' ? list.cases : [];
  const finalized = cases.filter((c) => c.state.kind === 'known' && c.state.value === 'FINALIZED');
  const exported = cases.filter((c) => c.state.kind === 'known' && c.state.value === 'EXPORTED');

  return (
    <Stack direction="column" gap={3} data-testid="live-export-panel">
      <Text as="h2" size="lg" weight="semibold">
        Kanıt paketi export (F7 — canlı)
      </Text>
      <Text as="p" size="sm" variant="secondary">
        YALNIZ FINALIZED vaka export edilir; başarı vakayı EXPORTED terminal durumuna taşır
        (tek-export — DB-zorlanır). Paket POINTER-ONLY'dir: claim metni/karar gövdesi içermez.
        Alanlara aday adı/e-postası ya da içerik YAZMAYIN — yalnız opak referans.
      </Text>

      {profileResolution.kind === 'missing' && (
        <Stack direction="column" gap={2} data-testid="export-profile-missing">
          <Badge variant="warning">Export profili yapılandırılmamış</Badge>
          <Text as="p" size="sm">
            INTERVIEW_EVIDENCE_EXPORT_PROFILE deployment ortamında tanımlı değil — export yüzeyi
            fail-closed kapalı (profil olmadan packet context'i üretilemez).
          </Text>
        </Stack>
      )}
      {profileResolution.kind === 'config-error' && (
        <Stack direction="column" gap={2} data-testid="export-profile-error">
          <Badge variant="error">Profil yapılandırma hatası</Badge>
          <Text as="p" size="sm">
            {profileResolution.reason} — export fail-closed kapalı; deployment yapılandırması
            düzeltilmeli (profil içeriği güvenlik gereği gösterilmez).
          </Text>
        </Stack>
      )}
      {profile && !profileBindingOk && (
        <Stack direction="column" gap={2} data-testid="export-profile-binding-mismatch">
          <Badge variant="error">Profil bu mülakata ait değil</Badge>
          <Text as="p" size="sm">
            Export profili başka bir mülakat için bağlanmış (binding uyuşmazlığı) — yanlış
            rubric/policy ile export yapısal olarak engellendi (fail-closed).
          </Text>
        </Stack>
      )}

      {profile && profileBindingOk && (
        <>
          {state.phase === 'blocked-unresolved' && (
            <Stack direction="column" gap={2} data-testid="export-blocked-unresolved">
              <Badge variant="warning">Önceki export işleminin sonucu doğrulanamadı</Badge>
              <Text as="p" size="sm">
                {state.malformed
                  ? 'Önceki işlemin güvenlik kaydı doğrulanamadı (bozuk işaret).'
                  : 'Bu vaka için sonucu doğrulanamamış bir export kaydı var.'}{' '}
                Sonuç doğrulanmadan yeni export başlatılamaz — makbuzu kanıt-defterinden
                sorgulayarak durumu çözebilirsiniz.
              </Text>
              {selectedCaseKey && receiptRecovery(selectedCaseKey)}
            </Stack>
          )}

          {state.phase === 'reconciled-exported' && (
            <Stack direction="column" gap={2} data-testid="export-reconciled-exported">
              <Badge variant="success">Vaka EXPORTED durumunda</Badge>
              <Text as="p" size="sm">
                Export işlemi gerçekleşmiş görünüyor (<code>{keyTail(state.caseKey)}</code>); ancak
                ilk yanıt alınamadığı için artifact makbuz kimlikleri bu yüzeyde doğrulanamıyor.
                Yeni export GÖNDERİLMEDİ; makbuz kimlikleri kanıt-defterinden kurtarılabilir.
              </Text>
              {receiptRecovery(state.caseKey)}
            </Stack>
          )}

          {state.phase === 'ambiguous' && (
            <Stack direction="column" gap={2} data-testid="export-ambiguous">
              <Badge variant="warning">Export sonucunun doğrulanması mümkün olmadı</Badge>
              <Text as="p" size="sm">
                İşlem uygulanmış olabilir (artifact + kanıt-defteri kaydı yazılmış olabilir).
                OTOMATİK TEKRARLANMADI; vakanın hâlâ FINALIZED görünmesi ilk isteğin uygulanmadığını
                KANITLAMAZ. Güncel durumu authoritative listeden doğrulayın.
              </Text>
              {list.phase === 'error' && (
                <Stack direction="column" gap={1} data-testid="export-reconcile-error">
                  <Badge variant="error">
                    {list.kind === 'authn'
                      ? 'Oturum hatası'
                      : list.kind === 'authz'
                        ? 'Yetki hatası'
                        : 'Vaka durumu okunamadı'}
                  </Badge>
                  <Text as="p" size="sm">
                    {list.detail}
                  </Text>
                </Stack>
              )}
              <div>
                <Button
                  data-testid="export-reconcile"
                  variant="primary"
                  onClick={() => reconcile(state.confirmation)}
                >
                  Vaka durumunu yeniden doğrula
                </Button>
              </div>
              {receiptRecovery(state.confirmation.caseKey)}
            </Stack>
          )}

          {state.phase === 'recovered-receipt' && (
            <Stack direction="column" gap={2} data-testid="export-recovered-receipt">
              <Badge variant="success">Makbuz kanıt-defterinden kurtarıldı — vaka EXPORTED</Badge>
              <Text as="p" size="sm">
                Artifact: <code>{keyTail(state.receipt.artifactKey)}</code> · kanıt:{' '}
                <code>{keyTail(state.receipt.evidenceId)}</code> · packet digest:{' '}
                <code>{keyTail(state.receipt.packetDigest)}</code> · claim sayısı:{' '}
                {state.receipt.claimCount} · defter kaydı: {state.receipt.ledgerRecordedAt}
              </Text>
              <Text as="p" size="sm" variant="secondary">
                Kimlikler UYDURULMADI — WORM kanıt-defterindeki export kaydından salt-okuma
                kurtarıldı. Bu vaka için ikinci export üretilmez (tek-export).
              </Text>
              {staleListNote && (
                <Text as="p" size="sm" variant="secondary" data-testid="export-stale-list-note">
                  Not: makbuz kurtarıldı ancak güncel vaka listesi yenilenemedi — liste eski durumu
                  gösterebilir (makbuz geçerlidir).
                </Text>
              )}
            </Stack>
          )}

          {state.phase === 'completed' && (
            <Stack direction="column" gap={2} data-testid="export-completed-receipt">
              <Badge variant="success">Kanıt paketi üretildi — vaka EXPORTED</Badge>
              <Text as="p" size="sm">
                Artifact: <code>{keyTail(state.receipt.artifactKey)}</code> · kanıt:{' '}
                <code>{keyTail(state.receipt.evidenceId)}</code> · packet digest:{' '}
                <code>{keyTail(state.receipt.packetDigest)}</code> · claim sayısı:{' '}
                {state.receipt.claimCount}
              </Text>
              <Text as="p" size="sm" variant="secondary">
                Paket pointer-only'dir (claim metni içermez); kanıt-defteri (WORM) kaydına bağlandı.
                Bu vaka için ikinci export üretilmez (tek-export).
              </Text>
              {staleListNote && (
                <Text as="p" size="sm" variant="secondary" data-testid="export-stale-list-note">
                  Not: makbuz alındı ancak güncel vaka listesi yenilenemedi — liste eski durumu
                  gösterebilir (makbuz geçerlidir).
                </Text>
              )}
            </Stack>
          )}

          {(state.phase === 'editing' ||
            state.phase === 'confirming' ||
            state.phase === 'submitting') && (
            <>
              {list.phase === 'loading' && (
                <Text as="p" size="sm" data-testid="export-list-loading">
                  Vaka listesi yükleniyor…
                </Text>
              )}
              {list.phase === 'error' && (
                <Stack direction="column" gap={2} data-testid="export-list-error">
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
                  <div>
                    <Button variant="ghost" onClick={() => reloadCases()}>
                      Yeniden dene
                    </Button>
                  </div>
                </Stack>
              )}
              {list.phase === 'ready' && (
                <Stack direction="column" gap={2}>
                  {finalized.length === 0 ? (
                    <Text as="p" size="sm" data-testid="export-no-finalized">
                      Export edilebilir (FINALIZED) vaka yok — önce insan incelemesini finalize edin
                      (F5).
                    </Text>
                  ) : (
                    <Stack direction="column" gap={1} data-testid="export-case-select">
                      <Text as="span" size="sm">
                        FINALIZED vaka seçin:
                      </Text>
                      {finalized.map((c) => (
                        <div key={c.caseKey}>
                          <Button
                            variant={c.caseKey === selectedCaseKey ? 'primary' : 'ghost'}
                            aria-pressed={c.caseKey === selectedCaseKey}
                            data-testid={`export-case-${c.caseKey}`}
                            disabled={busy}
                            onClick={() => selectCase(c.caseKey)}
                          >
                            <code>{keyTail(c.caseKey)}</code>
                          </Button>
                        </div>
                      ))}
                    </Stack>
                  )}
                  {exported.length > 0 && (
                    <Text as="p" size="sm" variant="secondary" data-testid="export-exported-note">
                      EXPORTED (terminal — yeniden export edilemez):{' '}
                      {exported.map((c) => keyTail(c.caseKey)).join(', ')}
                    </Text>
                  )}
                </Stack>
              )}

              <Stack direction="column" gap={1}>
                <label htmlFor="export-citations">
                  <Text as="span" size="sm">
                    Kanıt-alıntı anahtarları (her satıra bir opak referans; zorunlu)
                  </Text>
                </label>
                <textarea
                  id="export-citations"
                  data-testid="export-citations-input"
                  value={citationText}
                  rows={2}
                  disabled={busy}
                  onChange={(e) => {
                    setCitationText(e.target.value);
                    inputsChanged();
                  }}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {citationSuggestion &&
                  citationSuggestion.interviewId === interviewId &&
                  citationSuggestion.transcriptKey === selectedTranscriptKey && (
                    <div>
                      <Button
                        variant="ghost"
                        data-testid="export-citation-suggest"
                        disabled={busy || citationKeys.includes(citationSuggestion.citationKey)}
                        onClick={() => {
                          setCitationText((prev) =>
                            prev.trim()
                              ? `${prev.replace(/\n+$/, '')}\n${citationSuggestion.citationKey}`
                              : citationSuggestion.citationKey,
                          );
                          inputsChanged();
                        }}
                      >
                        Son kanıt-alıntıyı ekle ({keyTail(citationSuggestion.citationKey)})
                      </Button>
                    </div>
                  )}
              </Stack>

              {citationKeys.length > 0 && (
                <Stack direction="column" gap={1} data-testid="export-mapping">
                  <Text as="span" size="sm">
                    Her alıntıyı bir rubric kriterine eşleyin (iş-ilişkililik zinciri):
                  </Text>
                  {citationKeys.map((k) => (
                    <label
                      key={k}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <code>{keyTail(k)}</code>
                      <select
                        data-testid={`export-criterion-${k}`}
                        value={mapping[k] ?? ''}
                        disabled={busy}
                        onChange={(e) => {
                          setMapping((prev) => ({ ...prev, [k]: e.target.value }));
                          inputsChanged();
                        }}
                      >
                        <option value="">— kriter seçin —</option>
                        {profile.criteria.map((c) => (
                          <option key={c.criterionId} value={c.criterionId}>
                            {c.criterionId}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </Stack>
              )}

              {(
                [
                  ['export-consents', 'Rıza referansları (zorunlu)', consentText, setConsentText],
                  ['export-worms', 'WORM zincir referansları (zorunlu)', wormText, setWormText],
                ] as const
              ).map(([id, label, value, set]) => (
                <Stack key={id} direction="column" gap={1}>
                  <label htmlFor={id}>
                    <Text as="span" size="sm">
                      {label} — her satıra bir opak referans; ad/e-posta/içerik yapıştırmayın
                    </Text>
                  </label>
                  <textarea
                    id={id}
                    data-testid={`${id}-input`}
                    value={value}
                    rows={2}
                    disabled={busy}
                    onChange={(e) => {
                      set(e.target.value);
                      inputsChanged();
                    }}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </Stack>
              ))}

              {state.phase === 'editing' && (
                <div>
                  <Button
                    data-testid="export-step1"
                    variant="secondary"
                    disabled={busy}
                    onClick={openConfirmation}
                  >
                    Export kapsamını onayla…
                  </Button>
                </div>
              )}
              {(state.phase === 'confirming' || state.phase === 'submitting') && (
                <Stack direction="column" gap={2} data-testid="export-confirm">
                  <Badge variant="warning">Geri alınamaz durum geçişi</Badge>
                  <Text as="p" size="sm">
                    Vaka <code>{keyTail(state.confirmation.caseKey)}</code> için{' '}
                    {state.confirmation.citationKeys.length} kanıt-alıntı,{' '}
                    {state.confirmation.consentRefs.length} rıza ve{' '}
                    {state.confirmation.wormChainRefs.length} WORM referansıyla DONMUŞ kapsam export
                    edilecek; vaka EXPORTED terminal durumuna geçer (tek-export). UI referans
                    biçimini doğrular — gerçek WORM-lineage üyeliği backend kontratıdır.
                  </Text>
                  <Stack direction="row" gap={2}>
                    <Button
                      ref={confirmRef}
                      data-testid="export-step2"
                      variant="primary"
                      aria-label="Donmuş kapsamla kanıt paketini kalıcı olarak üret"
                      disabled={busy}
                      onClick={() => executeConfirmed(state.confirmation)}
                    >
                      {busy ? 'Export yürütülüyor…' : 'Kanıt paketini üret'}
                    </Button>
                    <Button
                      data-testid="export-cancel"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setState({ phase: 'editing' })}
                    >
                      Vazgeç
                    </Button>
                  </Stack>
                </Stack>
              )}
            </>
          )}
        </>
      )}

      {error && (
        <Stack direction="column" gap={2} data-testid="export-error">
          <Badge variant="error">{ERR_BADGE[error.kind]}</Badge>
          <Text as="p" size="sm">
            {error.detail}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
