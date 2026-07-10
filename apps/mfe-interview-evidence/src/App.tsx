import { useState } from 'react';
import { Badge, Card, Stack, Text } from '@mfe/design-system';
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
 * Bileşenler platform design-lab'ından türetilir (Card/Stack/Text/Badge); ayrı bir
 * ATS design-system YOK. shell-auth token + `/api/ats` canlı veri akışı 39d.
 *
 * DÜRÜST SINIR (ATS-0016): bu yüzey sentetik/demo bağlamındadır; gerçek aday verisiyle
 * işleme G0=GO gerektirir (release-gate). Auth shell-managed (ATS-0019: MFE kendi
 * token'ını ÜRETMEZ; legacy standalone OIDC platform MFE'ye taşınmaz).
 */
export default function InterviewEvidenceApp() {
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
