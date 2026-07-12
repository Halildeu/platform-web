import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import { SegmentView } from './segment-view/SegmentView';
import { ReviewWorkspace } from './review/ReviewWorkspace';
import { ConsentRecordingPanel } from './ingest/ConsentRecordingPanel';
import { LiveConsentUploadPanel } from './ingest/LiveConsentUploadPanel';
import { LiveCitationPanel } from './review/LiveCitationPanel';
import { LiveReviewCasePanel } from './review/LiveReviewCasePanel';
import type { CitationReceiptRef } from './review/LiveReviewCasePanel';
import { DsarPanel } from './dsar/DsarPanel';
import { LiveDsarPanel } from './dsar/LiveDsarPanel';
import { TranscriptList } from './transcripts/TranscriptList';
import {
  listTranscripts,
  markErased,
  registerIngestTranscript,
} from './transcripts/demoTranscriptRegistry';
import { resolveDataMode, resolveLiveInterviewId } from './config/dataMode';
import {
  fetchLiveSegments,
  fetchLiveTranscripts,
  isAuthnError,
  isAuthzError,
} from './transcripts/liveTranscriptApi';
import type { Segment } from './segment-view/types';
import type { TranscriptEntry } from './transcripts/types';
import type { ErasureReceipt } from './dsar/types';

const DEMO_TRANSCRIPT_KEY = 'tr-demo-1';

/**
 * ATS Interview-Evidence — platform-web MFE ürün yüzeyi (ATS-0019 pivot).
 *
 * 39c-2b: `@mfe/design-system` reuse'lu F3 Segment View (placeholder → gerçek ekran).
 * 39c-4: F4/F5 İnceleme çalışma-alanı (demo motor; kanıt-kapısı + 3 insan-yolu +
 * no-auto-finalize + FINALIZED→EXPORTED invariant'ları üründekiyle birebir).
 * 39c-5: F1/F2 Rıza + kayıt yükleme (açık-rıza UX + RIZA-KAPISI fail-closed) —
 * ürün akış sırasına göre EN ÜSTTE (Rıza → kayıt → transkript → inceleme).
 * 39c-6: F10 DSAR/silme — silme sonrası İÇERİK YÜZEYLERİ (transkript + inceleme +
 * DSAR paneli) KALDIRILIR, yerine silme-makbuzu kartı gelir (kanonik davranış).
 * 39c-7: F-liste — vaka/transkript liste-seçim: yüklemeden üretilen transkript
 * listeye düşer, seçim F3/F4-F5/F10 yüzeylerini SEÇİLİ transkripte bağlar
 * (`key=` remount: transkript değişimi bağlam değişimidir). Silme TRANSKRİPT-
 * BAŞINA: silinen girdi denetim için listede kalır (SİLİNDİ), seçilirse makbuz
 * görünür; DİĞER transkriptler etkilenmez.
 * 39d-6: CANLI READ — `INTERVIEW_EVIDENCE_DATA_MODE=live` (runtime window.__env__
 * öncelikli) iken transkript listesi + segmentler shell-token'lı shared-http ile
 * `/api/ats/v1`'den okunur (Bearer/auth-ready/refresh shell'den; ATS-0019: MFE
 * kendi token'ını ÜRETMEZ). Yazma yüzeyleri (rıza/inceleme/DSAR) canlı modda
 * 39d-7'ye kadar GİZLİ (demo motorlar canlı key'leri tanımaz — dürüst sınır).
 * Default 'demo': davranış 39c-7 ile birebir.
 *
 * DÜRÜST SINIR (ATS-0016): demo yüzeyi sentetik bağlamdadır; canlı mod testai
 * stage'inde SENTETİK fixture interview'una (D29 smoke seed) bağlanır. Gerçek
 * aday verisiyle işleme G0=GO gerektirir (release-gate). Auth shell-managed
 * (ATS-0019: legacy standalone OIDC platform MFE'ye taşınmaz).
 */
export default function InterviewEvidenceApp() {
  const resolution = useMemo(() => resolveDataMode(), []);
  if (resolution.kind === 'config-error') {
    return <ConfigErrorCard reason={resolution.reason} />;
  }
  if (resolution.mode === 'live') {
    return <LiveReadApp />;
  }
  return <DemoApp />;
}

/** Fail-closed config hatası: geçersiz mode sessizce demo'ya DÜŞMEZ (Codex 39d-6 iter). */
function ConfigErrorCard({ reason }: { reason: string }) {
  return (
    <Stack direction="column" gap={3} style={{ padding: '1.5rem', maxWidth: 860 }}>
      <Text as="h1" size="2xl" weight="bold">
        Mülakat Kanıt Platformu
      </Text>
      <Card variant="outlined" padding="md">
        <Stack direction="column" gap={2} data-testid="data-mode-config-error">
          <Badge variant="error">Yapılandırma hatası</Badge>
          <Text as="p" size="sm">
            {reason}
          </Text>
          <Text as="p" size="sm" variant="secondary">
            Yüzey fail-closed: geçersiz veri-modu değeri sessizce demo moduna düşürülmez; deployment
            yapılandırması düzeltilmelidir.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}

type LiveErrorKind = 'authn' | 'authz' | 'generic';

type LiveListState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: LiveErrorKind; detail: string }
  | { phase: 'ready'; transcripts: TranscriptEntry[] };

type LiveSegmentsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; kind: LiveErrorKind; detail: string }
  | { phase: 'ready'; segments: Segment[] };

const LIVE_ERROR_BADGE: Record<LiveErrorKind, string> = {
  authn: 'Oturum hatası',
  authz: 'Yetki hatası',
  generic: 'Canlı veri okunamadı',
};

/** Canlı segment cache anahtarı — interviewId + transcriptKey (Codex 39d-6 iter). */
const segCacheKey = (interviewId: string, transcriptKey: string) =>
  `${interviewId} ${transcriptKey}`;

/**
 * D29 Authn-deny ≠ Authz-deny aynası (Codex 019f50b7 post-impl P1): 401/oturum-yok
 * rol atamakla ÇÖZÜLMEZ — "yeniden giriş" yüzeyi; yalnız 403 rol-kapısıdır.
 * Kontrat hatası (AtsContractError) generic'e düşer (retry'lı hata kartı).
 */
function classifyError(error: unknown): { kind: LiveErrorKind; detail: string } {
  if (isAuthnError(error)) {
    return {
      kind: 'authn',
      detail:
        'Oturum doğrulanamadı (401/audience) — sayfayı yenileyip yeniden giriş yapmayı deneyin; rol ataması bu hatayı çözmez.',
    };
  }
  if (isAuthzError(error)) {
    return {
      kind: 'authz',
      detail: 'Bu yüzey için yetkiniz yok (ats-api rol ataması gerekli — rol-kapısı fail-closed).',
    };
  }
  return {
    kind: 'generic',
    detail: error instanceof Error ? error.message : 'Beklenmeyen hata',
  };
}

/**
 * 39d-6 canlı READ yüzeyi: liste + seçim + F3 segmentler `/api/ats/v1`'den.
 * Geç dönen cevap koruması: fetch sonuçları yalnız istek hâlâ güncelse state'e
 * yazılır (cleanup `cancelled` bayrağı — seçim/scope değişimi eski cevabı düşürür).
 */
function LiveReadApp() {
  const interviewId = useMemo(() => resolveLiveInterviewId(), []);
  const [list, setList] = useState<LiveListState>({ phase: 'loading' });
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [segments, setSegments] = useState<LiveSegmentsState>({ phase: 'idle' });
  const segCache = useRef(new Map<string, Segment[]>());
  const [reloadNonce, setReloadNonce] = useState(0);
  // 39d-7b-2: güncel citation receipt'i (F4→F5 bağı); citation invalidate'inde null.
  const [citationReceipt, setCitationReceipt] = useState<CitationReceiptRef | null>(null);
  // 39d-7a: transcribe sonrası hedef seçim — refresh'te bulunamazsa
  // CONSISTENCY hatası (sessizce ilk transkripte GEÇİLMEZ; Codex #6).
  const pendingTargetKey = useRef<string | null>(null);

  useEffect(() => {
    if (!interviewId) return;
    let cancelled = false;
    setList({ phase: 'loading' });
    setSegments({ phase: 'idle' });
    fetchLiveTranscripts(interviewId).then(
      (transcripts) => {
        if (cancelled) return;
        const target = pendingTargetKey.current;
        if (target && !transcripts.some((t) => t.transcriptKey === target)) {
          // Hedef ref KORUNUR (Codex 39d-7a P1): "Yeniden dene" sonrası hedef
          // gelirse seçilebilsin — sessiz ilk-seçime düşülmesin.
          setList({
            phase: 'error',
            kind: 'generic',
            detail: `Tutarlılık hatası: üretilen transkript (${target}) liste re-fetch'inde bulunamadı — backend listing/kontrat incelenmeli.`,
          });
          return;
        }
        if (target) pendingTargetKey.current = null; // yalnız hedef bulununca temizle
        setList({ phase: 'ready', transcripts });
        setSelectedKey((prev) => {
          if (target) return target;
          return prev && transcripts.some((t) => t.transcriptKey === prev)
            ? prev
            : (transcripts[0]?.transcriptKey ?? '');
        });
      },
      (error) => {
        if (cancelled) return;
        // Refresh hatasında yalnız re-fetch tekrarlanır (upload/transcribe DEĞİL).
        setList({ phase: 'error', ...classifyError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [interviewId, reloadNonce]);

  const handleLiveTranscribed = (transcriptKey: string) => {
    pendingTargetKey.current = transcriptKey;
    setReloadNonce((n) => n + 1); // backend-authority tam liste re-fetch (optimistik ekleme YOK)
  };

  useEffect(() => {
    if (!interviewId || !selectedKey) return;
    const cached = segCache.current.get(segCacheKey(interviewId, selectedKey));
    if (cached) {
      setSegments({ phase: 'ready', segments: cached });
      return;
    }
    let cancelled = false;
    setSegments({ phase: 'loading' });
    fetchLiveSegments(interviewId, selectedKey).then(
      (result) => {
        if (cancelled) return;
        segCache.current.set(segCacheKey(interviewId, selectedKey), result);
        setSegments({ phase: 'ready', segments: result });
      },
      (error) => {
        if (cancelled) return;
        setSegments({ phase: 'error', ...classifyError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [interviewId, selectedKey]);

  // Fail-closed: live mod + interview scope yapılandırılmamış (id hardcode edilmez).
  if (!interviewId) {
    return (
      <ConfigErrorCard reason="INTERVIEW_EVIDENCE_INTERVIEW_ID boş: canlı mod için mülakat scope'u yapılandırılmalı (interviews-list endpoint'i 39d-7 backlog)." />
    );
  }

  return (
    <Stack direction="column" gap={4} style={{ padding: '1.5rem', maxWidth: 860 }}>
      <Stack direction="column" gap={2}>
        <Text as="h1" size="2xl" weight="bold">
          Mülakat Kanıt Platformu
        </Text>
        <Text as="p" variant="secondary">
          Bu süreçte yapay zeka YALNIZCA kanıt/alıntı çıkarımında yardımcıdır; kararı insan verir
          (EU AI Act m.50). Ürün hattı: rıza → kayıt → transkript → kanıt-alıntı → insan onayı →
          kanıt-paketi.
        </Text>
        <div>
          <Badge variant="success" data-testid="live-mode-badge">
            Canlı veri — /api/ats ({interviewId}; sentetik stage fixture, gerçek aday verisi değil —
            ATS-0016)
          </Badge>
        </div>
      </Stack>

      {list.phase === 'loading' && (
        <Card variant="outlined" padding="md">
          <Text as="p" size="sm" data-testid="live-list-loading">
            Transkript listesi canlı API'den yükleniyor…
          </Text>
        </Card>
      )}

      {list.phase === 'error' && (
        <Card variant="outlined" padding="md">
          <Stack direction="column" gap={2} data-testid="live-list-error">
            <Badge variant="error">{LIVE_ERROR_BADGE[list.kind]}</Badge>
            <Text as="p" size="sm">
              {list.detail}
            </Text>
            {list.kind === 'generic' && (
              <div>
                <Button variant="ghost" onClick={() => setReloadNonce((n) => n + 1)}>
                  Yeniden dene
                </Button>
              </div>
            )}
          </Stack>
        </Card>
      )}

      {list.phase === 'ready' && (
        <>
          {/* Ürün akış sırası (39c-5 aynası): Rıza → kayıt → transkript. */}
          <Card variant="outlined" padding="md">
            <LiveConsentUploadPanel
              interviewId={interviewId}
              onTranscribed={handleLiveTranscribed}
            />
          </Card>

          <Card variant="outlined" padding="md">
            {list.transcripts.length === 0 ? (
              <Text as="p" size="sm" data-testid="live-list-empty">
                Bu mülakat için transkript yok — yukarıdaki rıza + yükleme zinciriyle üretin.
              </Text>
            ) : (
              <TranscriptList
                transcripts={list.transcripts}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            )}
          </Card>

          {selectedKey && (
            <Card variant="outlined" padding="md">
              <Stack direction="column" gap={3}>
                <Text as="h2" size="lg" weight="semibold">
                  Transkript segmentleri (F3)
                </Text>
                {segments.phase === 'loading' && (
                  <Text as="p" size="sm" data-testid="live-segments-loading">
                    Segmentler yükleniyor…
                  </Text>
                )}
                {segments.phase === 'error' && (
                  <Stack direction="column" gap={2} data-testid="live-segments-error">
                    <Badge variant="error">
                      {segments.kind === 'generic'
                        ? 'Segmentler okunamadı'
                        : LIVE_ERROR_BADGE[segments.kind]}
                    </Badge>
                    <Text as="p" size="sm">
                      {segments.detail}
                    </Text>
                  </Stack>
                )}
                {segments.phase === 'ready' && <SegmentView segments={segments.segments} />}
              </Stack>
            </Card>
          )}

          {selectedKey && (
            <Card variant="outlined" padding="md">
              <LiveCitationPanel
                key={selectedKey}
                interviewId={interviewId}
                transcriptKey={selectedKey}
                onReceiptChange={setCitationReceipt}
              />
            </Card>
          )}

          {selectedKey && (
            <Card variant="outlined" padding="md">
              <LiveReviewCasePanel
                key={selectedKey}
                interviewId={interviewId}
                transcriptKey={selectedKey}
                citationReceipt={citationReceipt}
              />
            </Card>
          )}

          <Card variant="outlined" padding="md">
            <LiveDsarPanel
              key={interviewId}
              interviewId={interviewId}
              transcriptKeys={list.transcripts.map((t) => t.transcriptKey)}
              selectedTranscriptKey={selectedKey || null}
            />
          </Card>

          <Card variant="outlined" padding="md">
            <Stack direction="column" gap={2} data-testid="live-write-surfaces-note">
              <Badge variant="info">
                Canlı yüzeyler: okuma + rıza/yükleme/transkripsiyon (39d-7a) + kanıt-alıntı taslağı
                (39d-7b) + insan incelemesi/finalize (39d-7b-2) + DSAR/silme (39d-7c)
              </Badge>
              <Text as="p" size="sm" variant="secondary">
                Export (F7) canlı bağlanmadı (ayrı güvenlik kapısı); demo motorlar canlı transkript
                anahtarlarını tanımadığı için burada gösterilmezler (yanıltıcı karışım yerine dürüst
                sınır). Tam ürün akışı demo modunda çalışır durumda.
              </Text>
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}

/** 39c-7 demo yüzeyi — davranış DEĞİŞMEDİ (default mod; regresyon yüzeyi yok). */
function DemoApp() {
  const [transcripts, setTranscripts] = useState(() => listTranscripts());
  const [selectedKey, setSelectedKey] = useState(DEMO_TRANSCRIPT_KEY);

  const refresh = () => setTranscripts(listTranscripts());
  const selected = transcripts.find((t) => t.transcriptKey === selectedKey) ?? null;

  const handleTranscribed = (transcriptKey: string, evidenceId: string) => {
    registerIngestTranscript(transcriptKey, evidenceId);
    refresh();
    // Ürün akışı: yeni üretilen transkript seçilir (kullanıcı inceleme hattına akar).
    setSelectedKey(transcriptKey);
  };

  const handleErased = (receipt: ErasureReceipt) => {
    // Silinen transkriptin DsarPanel'i yalnız o seçiliyken render'dadır;
    // kayıt-defteri aynası içerik-düzlemini boşaltır + makbuzu bağlar.
    markErased(selectedKey, receipt);
    refresh();
  };

  return (
    <Stack direction="column" gap={4} style={{ padding: '1.5rem', maxWidth: 860 }}>
      <Stack direction="column" gap={2}>
        <Text as="h1" size="2xl" weight="bold">
          Mülakat Kanıt Platformu
        </Text>
        <Text as="p" variant="secondary">
          Bu süreçte yapay zeka YALNIZCA kanıt/alıntı çıkarımında yardımcıdır; kararı insan verir
          (EU AI Act m.50). Ürün hattı: rıza → kayıt → transkript → kanıt-alıntı → insan onayı →
          kanıt-paketi.
        </Text>
        <div>
          <Badge variant="warning">Demo veri — gerçek aday verisi değil (ATS-0016)</Badge>
        </div>
      </Stack>

      <Card variant="outlined" padding="md">
        <ConsentRecordingPanel onTranscribed={handleTranscribed} />
      </Card>

      <Card variant="outlined" padding="md">
        <TranscriptList
          transcripts={transcripts}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
      </Card>

      {selected?.erasure && (
        <Card variant="outlined" padding="md">
          <Stack direction="column" gap={2} data-testid="erasure-receipt">
            <Badge variant="success">Silme tamamlandı — içerik yüzeyleri kaldırıldı</Badge>
            <Text as="p" size="sm">
              DSAR: <code>{selected.erasure.dsarKey}</code> · silinen içerik:{' '}
              {selected.erasure.deletedContentCount} · WORM tombstone:{' '}
              {selected.erasure.tombstoneCount} (bu yüzey üretmez — silme privacy-event'leriyle
              kayıtlı)
            </Text>
            <Text as="p" size="sm" variant="secondary">
              WORM defteri silinmez; kanıt-zinciri bütünlüğü korunur. Tombstone dahil tam-kapsam
              DSAR operasyonel süreçtedir. Bu transkript denetim için listede kalır; diğer
              transkriptler etkilenmez.
            </Text>
          </Stack>
        </Card>
      )}

      {selected && !selected.erasure && (
        <>
          <Card variant="outlined" padding="md">
            <Stack direction="column" gap={3}>
              <Text as="h2" size="lg" weight="semibold">
                Transkript segmentleri (F3)
              </Text>
              <SegmentView segments={selected.segments} />
            </Stack>
          </Card>

          <Card variant="outlined" padding="md">
            <ReviewWorkspace
              key={selected.transcriptKey}
              transcriptKey={selected.transcriptKey}
              segments={selected.segments}
            />
          </Card>

          <Card variant="outlined" padding="md">
            <DsarPanel
              key={selected.transcriptKey}
              transcriptKey={selected.transcriptKey}
              onErased={handleErased}
            />
          </Card>
        </>
      )}
    </Stack>
  );
}
