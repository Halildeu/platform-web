import { Badge, Card, Stack, Text } from '@mfe/design-system';
import { SegmentView } from './segment-view/SegmentView';
import { DEMO_SEGMENTS } from './segment-view/demo-data';
import { ReviewWorkspace } from './review/ReviewWorkspace';
import { ConsentRecordingPanel } from './ingest/ConsentRecordingPanel';

/**
 * ATS Interview-Evidence — platform-web MFE ürün yüzeyi (ATS-0019 pivot).
 *
 * 39c-2b: `@mfe/design-system` reuse'lu F3 Segment View (placeholder → gerçek ekran).
 * 39c-4: F4/F5 İnceleme çalışma-alanı (demo motor; kanıt-kapısı + 3 insan-yolu +
 * no-auto-finalize + FINALIZED→EXPORTED invariant'ları üründekiyle birebir).
 * 39c-5: F1/F2 Rıza + kayıt yükleme (açık-rıza UX + RIZA-KAPISI fail-closed) —
 * ürün akış sırasına göre EN ÜSTTE (Rıza → kayıt → transkript → inceleme).
 * Bileşenler platform design-lab'ından türetilir (Card/Stack/Text/Badge); ayrı bir
 * ATS design-system YOK. shell-auth token + `/api/ats` canlı veri akışı 39d.
 *
 * DÜRÜST SINIR (ATS-0016): bu yüzey sentetik/demo bağlamındadır; gerçek aday verisiyle
 * işleme G0=GO gerektirir (release-gate). Auth shell-managed (ATS-0019: MFE kendi
 * token'ını ÜRETMEZ; legacy standalone OIDC platform MFE'ye taşınmaz).
 */
export default function InterviewEvidenceApp() {
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
    </Stack>
  );
}
