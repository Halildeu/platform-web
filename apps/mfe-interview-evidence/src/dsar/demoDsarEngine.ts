import type { ErasureReceipt, ErasureScope } from './types';

/**
 * DEMO DSAR/erasure motoru (ATS-0016 dürüst sınır: sentetik bağlam; 39d'de
 * `/api/ats`). F10 AKIŞ-İSKELETİ invariant'ları backend kontratıyla birebir:
 * - INTAKE-FIRST: silme yalnız kayıtlı bir DSAR talebi (dsarKey) üzerinden
 *   yürütülür; talepsiz silme yapısal RED.
 * - Idempotent replay: aynı dsarKey için ikinci executeErasure AYNI makbuzu
 *   döndürür (yeni silme işi üretmez — retry güvenli).
 * - DÜRÜST DAR KAPSAM: bu yüzey WORM tombstone ÜRETMEZ (tombstoneCount=0;
 *   WORM silinmez, silme privacy-event'leriyle kayıtlanır); tombstone dahil
 *   tam-kapsam DSAR operasyonel süreçtedir.
 * - subjectRef OPAK ref (PII girilmez); kimlik eşlemesi backend/operasyon işi.
 * Determinizm: dsarKey FNV-1a'dan türetilir (Math.random/Date.now YOK).
 */

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

const requests = new Map<string, { subjectRef: string; reasonCode: string }>();
const receipts = new Map<string, ErasureReceipt>();

/** Test izolasyonu için (yalnız test kullanır). */
export function resetDemoDsar(): void {
  requests.clear();
  receipts.clear();
}

export function receiveDsar(subjectRef: string, reasonCode: string): string {
  if (!subjectRef.trim()) throw new Error('Kişi referansı zorunlu (opak ref; PII girmeyin).');
  if (!reasonCode.trim()) throw new Error('Gerekçe kodu zorunlu (denetim izi).');
  const dsarKey = `dsar-${fnv(`${subjectRef.trim()}|${reasonCode.trim()}`)}`;
  requests.set(dsarKey, { subjectRef: subjectRef.trim(), reasonCode: reasonCode.trim() });
  return dsarKey;
}

/** INTAKE-FIRST + idempotent replay; dar kapsam (tombstone üretmez). */
export function executeErasure(dsarKey: string, scope: ErasureScope): ErasureReceipt {
  if (!requests.has(dsarKey)) {
    throw new Error('Kayıtlı DSAR talebi yok — silme reddedildi (intake-first).');
  }
  const existing = receipts.get(dsarKey);
  if (existing) return existing;
  const deletedContentCount =
    scope.transcriptKeys.length +
    scope.citationKeys.length +
    scope.exportArtifactKeys.length +
    scope.reviewCaseKeys.length;
  if (deletedContentCount === 0) {
    throw new Error('Silme kapsamı boş — en az bir içerik anahtarı gerekli.');
  }
  const receipt: ErasureReceipt = {
    dsarKey,
    tombstoneCount: 0, // dürüst dar kapsam: bu yüzey WORM tombstone üretmez
    deletedContentCount,
    caseTransitioned: false,
  };
  receipts.set(dsarKey, receipt);
  return receipt;
}
