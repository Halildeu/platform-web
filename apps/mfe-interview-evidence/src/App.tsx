/**
 * ATS Interview-Evidence — platform-web MFE ürün yüzeyi (ATS-0019 pivot).
 *
 * 39c-1 iskelet: Module Federation remote + shell mount noktası (`InterviewEvidenceApp`
 * expose). Bu dilim minimal ürün-kimliği yüzeyidir; `@mfe/design-system` reuse'lu
 * Segment View + shell-auth token + `/api/ats` veri akışı sonraki dilimlerde (39c-2/3).
 *
 * DÜRÜST SINIR (ATS-0016): bu yüzey sentetik/demo bağlamındadır; gerçek aday verisiyle
 * işleme G0=GO gerektirir (release-gate). Auth shell-managed olacaktır (ATS-0019: MFE
 * kendi token'ını ÜRETMEZ; legacy standalone OIDC platform MFE'ye taşınmaz).
 */
export default function InterviewEvidenceApp() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Mülakat Kanıt Platformu</h1>
      <p style={{ marginTop: '0.75rem', lineHeight: 1.5 }}>
        Bu süreçte yapay zeka <strong>YALNIZCA</strong> kanıt/alıntı çıkarımında yardımcıdır; kararı
        insan verir <em>(EU AI Act m.50)</em>.
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        Rıza → kayıt → transkript → kanıt-alıntı → insan onayı → kanıt-paketi hattı bu MFE yüzeyine
        (design-system ile) sonraki dilimlerde taşınır.
      </p>
    </main>
  );
}
