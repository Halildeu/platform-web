import { useState } from 'react';
import { Badge, Card, Stack, Text } from '@mfe/design-system';
import { SegmentView } from './segment-view/SegmentView';
import { DEMO_SEGMENTS } from './segment-view/demo-data';
import { ReviewWorkspace } from './review/ReviewWorkspace';
import { ConsentRecordingPanel } from './ingest/ConsentRecordingPanel';
import { DsarPanel } from './dsar/DsarPanel';
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
 * Bileşenler platform design-lab'ından türetilir (Card/Stack/Text/Badge); ayrı bir
 * ATS design-system YOK. shell-auth token + `/api/ats` canlı veri akışı 39d.
 *
 * DÜRÜST SINIR (ATS-0016): bu yüzey sentetik/demo bağlamındadır; gerçek aday verisiyle
 * işleme G0=GO gerektirir (release-gate). Auth shell-managed (ATS-0019: MFE kendi
 * token'ını ÜRETMEZ; legacy standalone OIDC platform MFE'ye taşınmaz).
 */
export default function InterviewEvidenceApp() {
  const [erasure, setErasure] = useState<ErasureReceipt | null>(null);

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
        <ConsentRecordingPanel />
      </Card>

      {erasure ? (
        <Card variant="outlined" padding="md">
          <Stack direction="column" gap={2} data-testid="erasure-receipt">
            <Badge variant="success">Silme tamamlandı — içerik yüzeyleri kaldırıldı</Badge>
            <Text as="p" size="sm">
              DSAR: <code>{erasure.dsarKey}</code> · silinen içerik: {erasure.deletedContentCount} ·
              WORM tombstone: {erasure.tombstoneCount} (bu yüzey üretmez — silme
              privacy-event'leriyle kayıtlı)
            </Text>
            <Text as="p" size="sm" variant="secondary">
              WORM defteri silinmez; kanıt-zinciri bütünlüğü korunur. Tombstone dahil tam-kapsam
              DSAR operasyonel süreçtedir.
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
          <Card variant="outlined" padding="md">
            <Stack direction="column" gap={3}>
              <Text as="h2" size="lg" weight="semibold">
                Transkript segmentleri (F3)
              </Text>
              <SegmentView segments={DEMO_SEGMENTS} />
            </Stack>
          </Card>

          <Card variant="outlined" padding="md">
            <ReviewWorkspace />
          </Card>

          <Card variant="outlined" padding="md">
            <DsarPanel transcriptKey={DEMO_TRANSCRIPT_KEY} onErased={setErasure} />
          </Card>
        </>
      )}
    </Stack>
  );
}
