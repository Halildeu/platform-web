import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import { SegmentView } from './segment-view/SegmentView';
import { ReviewWorkspace } from './review/ReviewWorkspace';
import { ConsentRecordingPanel } from './ingest/ConsentRecordingPanel';
import { DsarPanel } from './dsar/DsarPanel';
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

type LiveListState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: 'authz' | 'generic'; detail: string }
  | { phase: 'ready'; transcripts: TranscriptEntry[] };

type LiveSegmentsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; kind: 'authz' | 'generic'; detail: string }
  | { phase: 'ready'; segments: Segment[] };

/** Canlı segment cache anahtarı — interviewId + transcriptKey (Codex 39d-6 iter). */
const segCacheKey = (interviewId: string, transcriptKey: string) =>
  `${interviewId} ${transcriptKey}`;

function classifyError(error: unknown): { kind: 'authz' | 'generic'; detail: string } {
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

  useEffect(() => {
    if (!interviewId) return;
    let cancelled = false;
    setList({ phase: 'loading' });
    setSegments({ phase: 'idle' });
    fetchLiveTranscripts(interviewId).then(
      (transcripts) => {
        if (cancelled) return;
        setList({ phase: 'ready', transcripts });
        setSelectedKey((prev) =>
          prev && transcripts.some((t) => t.transcriptKey === prev)
            ? prev
            : (transcripts[0]?.transcriptKey ?? ''),
        );
      },
      (error) => {
        if (cancelled) return;
        setList({ phase: 'error', ...classifyError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [interviewId, reloadNonce]);

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
            <Badge variant="error">
              {list.kind === 'authz' ? 'Yetki hatası' : 'Canlı veri okunamadı'}
            </Badge>
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
          <Card variant="outlined" padding="md">
            {list.transcripts.length === 0 ? (
              <Text as="p" size="sm" data-testid="live-list-empty">
                Bu mülakat için transkript yok. (Yazma yüzeyleri canlı modda 39d-7'de bağlanır; tam
                akışı demo modunda deneyebilirsiniz.)
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
                      {segments.kind === 'authz' ? 'Yetki hatası' : 'Segmentler okunamadı'}
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

          <Card variant="outlined" padding="md">
            <Stack direction="column" gap={2} data-testid="live-write-surfaces-note">
              <Badge variant="info">Okuma modu (39d-6)</Badge>
              <Text as="p" size="sm" variant="secondary">
                Rıza/kayıt, inceleme (F4/F5) ve DSAR (F10) yazma yüzeyleri canlı modda 39d-7'de
                bağlanır. Demo motorlar canlı transkript anahtarlarını tanımadığı için burada
                gösterilmezler (yanıltıcı karışım yerine dürüst sınır). Tam ürün akışı demo modunda
                çalışır durumda.
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
