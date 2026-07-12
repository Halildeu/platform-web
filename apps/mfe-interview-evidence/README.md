# mfe-interview-evidence

ATS Mülakat Kanıt Platformu MFE'si (ATS-0019 platform-web pivotu). Canlı mod
(`INTERVIEW_EVIDENCE_DATA_MODE=live`) F1→F10 ürün hattını `/api/ats/v1`
üzerinden sürer: rıza → kayıt yükleme → transkripsiyon → kanıt-alıntı (F4) →
insan onayı/finalize (F5) → kanıt-paketi export (F7) → DSAR/silme (F10).

## Export profili (39d-7d — `INTERVIEW_EVIDENCE_EXPORT_PROFILE`)

F7 export context'inin **deployment-owned** kısmı runtime env'den gelir (JSON;
`window.__env__` öncelikli, `VITE_*` build-arg fallback). Şema:
[`src/export/exportProfile.ts`](src/export/exportProfile.ts) `ExportProfileV1`:

- `version: 1` (zorunlu; başka değer config-error)
- `binding.interviewId` (**zorunlu**) — panel mevcut mülakatla EXACT eşleşme
  ister; uyuşmazlıkta export **fail-closed kapalı** (yanlış mülakata yanlış
  rubric/policy ile export yapısal engellenir). Opsiyonel: `vacancyRef`,
  `tenantRef`.
- 9 zorunlu ref: `generatorVersionRef`, `locale`, `timezone`,
  `aiAssistanceDisclosureRef`, `rubricVersionRef`, `redactionPolicyRef`,
  `redactionRunRef`, `retentionPolicyRef`, `signatureRef` (trim-boş olamaz).
- `schemaDigest`: lowercase 64-hex (backend `ExportService.validateContext`
  regex'iyle birebir — yalnız FORMAT doğrulanır).
- `criteria[]` (≥1): `{criterionId, jobRelatednessRationaleRef}`; duplicate
  `criterionId` REJECT (sessiz dedupe yok).
- Strict parser: kök/binding/criterion nesnelerinde **bilinmeyen alan REJECT**
  (typo görünür olur); boyut sınırları (raw ≤32KB, string ≤500, criteria ≤100);
  hata mesajları profil DEĞERLERİNİ yankılamaz.

Kaynak: [`scripts/deploy/build-single-domain.mjs`](../../scripts/deploy/build-single-domain.mjs)
STAGE spread'i (testai — `iv-smoke-1` binding'li **sentetik** profil).
Vaka-spesifik pointer'lar (`consentRefs`, `wormChainRefs`, `citationKeys`,
`citationCriterion` eşlemesi) profile KONMAZ — kullanıcı girer.

**Güvenlik sınırı**: `window.__env__` kullanıcı-görünür ve değiştirilebilirdir.
Profil SECRET TAŞIMAZ (yalnız opak pointer). Frontend doğrulaması güvenli-UX/
kontrat-preflight'tır, **authority DEĞİLDİR** — backend tüm pointer ve policy
binding'lerini yeniden doğrular. Production backlog: multi-interview profil
registry'si / backend profil endpoint'i.

## 3-katman single-export güvenliği (F7)

1. **Frontend** ([`src/export/LiveExportPanel.tsx`](src/export/LiveExportPanel.tsx)):
   frozen-confirmation (ikinci tık canlı inputları yeniden OKUMAZ) + in-flight
   kilit + per-case session guard + 4-durum reconciliation. Session guard
   **best-effort aynı-sekme duplicate-submit azaltmasıdır**; cross-tab/
   multi-user/doğrudan-API invariant'ı DEĞİLDİR.
2. **Backend service** (`ExportService`): validateContext + citation/criterion
   zinciri + artifact-rollback compensation + FINALIZED→EXPORTED state-machine
   (yalnız FINALIZED export edilir; EXPORTED terminal — tek-export).
3. **Database (asıl invariant)**: `worm_ledger UNIQUE(tenant_id,
idempotency_key)` + deterministik export key → aynı case için **en fazla
   BİR ledger-bağlı etkili export**; eşzamanlı yarışta kaybeden isteğin
   artifact'i telafi-silinir (23505 + içerik-eşleşme kontrolü).

### Ambiguous sonuç davranışı

Non-idempotent export POST'u **otomatik retry edilmez**. Transport kesintisi /
malformed-201 / bilinmeyen-5xx / kontrat-dışı status×code → guard KORUNUR +
ambiguous kilit. Çıkış İKİ authoritative oracle ile:

**(a) `review-cases` GET'i:**

- Vaka **EXPORTED** görünür → export gerçekleşmiştir; makbuz kimlikleri bu
  yüzeyde yok — **makbuz UYDURULMAZ** (`reconciled-exported`); kimlikler
  (b)-oracle ile kurtarılabilir.
- Vaka hâlâ **FINALIZED** görünür → ilk isteğin uygulanmadığını **KANITLAMAZ**
  (bkz. R4) — retry açılmaz.
- 400+INVALID cevabı `reason` gösterir ama guard'ı TEMİZLEMEZ (markExported-
  fail 400'ü post-side-effect dönebilir).

**(b) makbuz-kurtarma GET'i (39d-8b — `GET /export/receipt?caseKey=`,
`ats.export.read` yeter; idempotent → tekrar denenebilir):**

- 200 **EXPORTED+COMPLETED** (şekil-tam + caseKey yankısı) → kimlikler
  WORM-ledger'dan **KURTARILIR** (uydurma yok); kilit çözülür.
- exact **404+NOT_FOUND** → **kilit KORUNUR** (negatif-oracle DEĞİLDİR):
  backend bu 404'ü vaka-yok/tenant-scope/store-non-OK durumlarıyla düzler,
  in-flight ilk POST'la yarışabilir ve R1 öksüz-artifact'i dışlamaz — POST
  retry açılmaz; yalnız makbuz sorgusu tekrar denenebilir. Retry-unlock,
  quiescence/terminal-status veren bir backend kontratı prerequisite'ine
  bağlıdır.
- 200 **FINALIZED+INCOMPLETE** (R4) → tamamlanmamış export; kilit KORUNUR,
  operasyonel repair.
- 400+INVALID (bütünlük ihlali), gövdesiz-403 (eski backend), 5xx, malformed-200,
  mismatch → **unresolved**; kilit korunur. Canlı aktivasyon backend
  #103-pin'ine bağlıdır (pin öncesi buton dürüst "sonuçsuz" gösterir).

### Bilinen residual'lar (backend backlog)

- **R1**: ledger-conflict sonrası artifact telafi-DELETE'i başarısız olursa
  ledger-bağsız **öksüz artifact** kalabilir (packet lineage dışı; başarı
  sayılmaz) — operasyonel temizlik gerekir.
- **R2**: ~~receipt-recovery endpoint'i YOK~~ **kod düzeyinde kapandı**
  (ats#103 backend + 39d-8b FE makbuz-kurtarma); canlı kapanış backend pin +
  FE deployment + login-gated functional acceptance SONRASINDA. 404-üzerinden
  güvenli-retry AYRI bir recovery/status problemi olarak açık.
- **R3**: same-receipt replay YOK — ikinci istek deterministic-conflict alır
  (payload'lar artifact-ref nedeniyle hiç birebir olamaz).
- **R4**: artifact+ledger yazılıp `markExported` başarısız olabilir (400) —
  vaka FINALIZED kalır; operasyonel repair gerekir. Bu yüzden frontend hiçbir
  400/5xx'i "uygulanmadı" saymaz.

UI referans **biçimini/boşluğunu** doğrular; bir referansın gerçek WORM-lineage
üyeliği backend kontratıdır.

## Diğer canlı yüzey kontratları

- Veri modu / interview scope: [`src/config/dataMode.ts`](src/config/dataMode.ts)
  (fail-closed; geçersiz değer sessizce demo'ya düşmez).
- DSAR/erasure (F10) outcome-certainty modeli:
  [`src/dsar/liveDsarApi.ts`](src/dsar/liveDsarApi.ts) — erasure'da
  "uygulanmadı" yalnız filter-chain 401/403; diğer her sonuç unresolved-guard.
- İnsan-onay/finalize (F5): [`src/review/liveReviewApi.ts`](src/review/liveReviewApi.ts)
  — READ fail-soft / WRITE fail-closed; iki-adım finalize.

Lokal dev zinciri için repo-kökündeki dev-chain dokümanına bakın.
