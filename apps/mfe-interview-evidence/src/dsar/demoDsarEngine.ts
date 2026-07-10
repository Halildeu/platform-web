import type { ErasureReceipt, ErasureScope } from './types';

/**
 * DEMO DSAR/erasure motoru (ATS-0016 dürüst sınır: sentetik bağlam; 39d'de
 * `/api/ats`). F10 AKIŞ-İSKELETİ invariant'ları backend kontratıyla birebir
 * (Codex 019f4b50 iter-2):
 * - dsarKey TALEP-BAŞINA BENZERSİZ (kanonik in-memory store gibi artan sayaç;
 *   aynı kişi + aynı gerekçeyle ikinci intake YENİ hukuki taleptir, yeni key alır).
 * - INTAKE-FIRST: silme yalnız kayıtlı bir DSAR talebi üzerinden yürütülür.
 * - RECEIVED → FULFILLED durum modeli; FULFILLED TERMİNALDİR — aynı talebin
 *   ikinci yürütmesi YAPISAL RED (kanonik DsrService semantiği; idempotency
 *   backend'de içerik-delete retry'larına aittir, tamamlanmış komuta değil).
 * - DÜRÜST DAR KAPSAM: bu yüzey YALNIZ görüntülenen transkripti siler; citation/
 *   export/review/tombstone listeleri YAPISAL REDDEDİLİR (sahte genel destek
 *   verilmez — backend review case'i silmez, WITHDRAWN'a geçirir; tombstone
 *   dahil tam-kapsam DSAR operasyonel süreçtedir). tombstoneCount=0.
 * - subjectRef OPAK ref (PII girilmez); kimlik eşlemesi backend/operasyon işi.
 * Determinizm: artan sayaç (Math.random/Date.now YOK); resetDemoDsar sıfırlar.
 */

type DsarState = 'RECEIVED' | 'FULFILLED';

const requests = new Map<string, { state: DsarState }>();
let dsarSeq = 0;

/** Test izolasyonu için (yalnız test kullanır). */
export function resetDemoDsar(): void {
  requests.clear();
  dsarSeq = 0;
}

export function receiveDsar(subjectRef: string, reasonCode: string): string {
  if (!subjectRef.trim()) throw new Error('Kişi referansı zorunlu (opak ref; PII girmeyin).');
  if (!reasonCode.trim()) throw new Error('Gerekçe kodu zorunlu (denetim izi).');
  dsarSeq += 1;
  const dsarKey = `dsar-${String(dsarSeq).padStart(4, '0')}`;
  requests.set(dsarKey, { state: 'RECEIVED' });
  return dsarKey;
}

/**
 * INTAKE-FIRST + FULFILLED-terminal + dar-kapsam yapısal reddi.
 * Başarılı yürütme talebi FULFILLED'a geçirir; ikinci çağrı RED.
 */
export function executeErasure(dsarKey: string, scope: ErasureScope): ErasureReceipt {
  const req = requests.get(dsarKey);
  if (!req) {
    throw new Error('Kayıtlı DSAR talebi yok — silme reddedildi (intake-first).');
  }
  if (req.state === 'FULFILLED') {
    throw new Error('Bu DSAR talebi zaten yürütüldü (FULFILLED terminal — çift-yürütme yasak).');
  }
  if (
    scope.citationKeys.length > 0 ||
    scope.exportArtifactKeys.length > 0 ||
    scope.reviewCaseKeys.length > 0 ||
    scope.tombstoneTargetEvidenceIds.length > 0
  ) {
    throw new Error(
      'Bu demo yüzeyi yalnız görüntülenen transkripti siler — diğer kapsam listeleri reddedilir.',
    );
  }
  if (scope.transcriptKeys.length === 0) {
    throw new Error('Silme kapsamı boş — en az bir transkript anahtarı gerekli.');
  }
  req.state = 'FULFILLED';
  return {
    dsarKey,
    tombstoneCount: 0, // dürüst dar kapsam: bu yüzey WORM tombstone üretmez
    deletedContentCount: scope.transcriptKeys.length,
    caseTransitioned: false,
  };
}
