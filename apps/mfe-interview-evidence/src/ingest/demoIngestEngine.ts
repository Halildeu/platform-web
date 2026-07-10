import type { ConsentState, IngestReceipt, TranscribeReceipt } from './types';

/**
 * DEMO rıza + ingest motoru (ATS-0016 dürüst sınır: sentetik bağlam; 39d'de
 * `/api/ats` + interview-context scope'una bağlanır — tek `currentConsent`
 * burada sabit tek demo-mülakat bağlamıdır, kanonik scope tenant+interview'dur).
 * F1/F2 AKIŞ-İSKELETİ invariant'ları backend kontratıyla birebir (Codex 019f4b50):
 * - RIZA-KAPISI fail-closed + HER İŞLEME ADIMINDA yeniden kontrol: yükleme DE
 *   transkripsiyon DA yalnız güncel beyan GRANTED ise çalışır (GRANTED → upload →
 *   WITHDRAWN → transcribe RED). WITHDRAWN terminal değildir; yeni GRANTED yeni
 *   hukuki beyandır.
 * - Yükleme kimliği İÇERİK-HASH'idir (dosya adı ASLA anahtara girmez — PII
 *   hijyeni); aynı-içerik retry AYNI makbuzu (aynı ledgerSequence) döndürür
 *   (idempotent yazım replay'i), yeni içerik yeni defter sırası alır.
 * - Kapalı EXACT-SET allowlist (kanonik UploadRequest ile aynı 6 tip) + boyut
 *   sınırı; makbuz POINTER-ONLY (objectKey/evidenceId/seq — içerik yok).
 * - transcribe idempotent: aynı objectKey → aynı transcriptKey.
 * Determinizm: kimlikler FNV-1a'dan türetilir (Math.random/Date.now YOK).
 */

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

let currentConsent: { subjectRef: string; state: ConsentState } | null = null;
let ledgerSeq = 0;
const receipts = new Map<string, IngestReceipt>();
const transcribed = new Map<string, string>();

/** Test izolasyonu için (yalnız test kullanır). */
export function resetDemoIngest(): void {
  currentConsent = null;
  ledgerSeq = 0;
  receipts.clear();
  transcribed.clear();
}

export function putConsent(subjectRef: string, state: ConsentState): void {
  if (!subjectRef.trim()) throw new Error('Kişi referansı zorunlu (opak ref; PII girmeyin).');
  currentConsent = { subjectRef: subjectRef.trim(), state };
}

export function getConsent(): ConsentState | null {
  return currentConsent?.state ?? null;
}

/** Her işleme adımının ortak kapısı (fail-closed; kanonik gate re-run). */
function requireGrantedConsent(step: string): void {
  if (!currentConsent) {
    throw new Error(`Rıza beyanı yok — ${step} reddedildi (rıza-kapısı, fail-closed).`);
  }
  if (currentConsent.state !== 'GRANTED') {
    throw new Error(`Rıza durumu ${currentConsent.state} — ${step} reddedildi (yalnız GRANTED).`);
  }
}

/** Kanonik UploadRequest.ALLOWED_CONTENT_TYPES ile aynı kapalı exact-set. */
const ALLOWED_CONTENT_TYPES = new Set([
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * RIZA-KAPISI + içerik-hash kimliği: `contentHash` = dosya BAYTLARININ
 * SHA-256'sı (panel hesaplar; dosya adı anahtara girmez). Aynı içerik retry'ı
 * AYNI makbuzu döndürür (defter sırası dahil — idempotent yazım replay'i).
 */
export function uploadRecording(
  contentHash: string,
  mimeType: string,
  sizeBytes: number,
): IngestReceipt {
  requireGrantedConsent('yükleme');
  if (!ALLOWED_CONTENT_TYPES.has(mimeType)) {
    throw new Error('İçerik tipi kapalı allowlist dışında (kanonik 6 tip).');
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    throw new Error('Dosya boyutu sınır dışı (demo sınırı 100 MB).');
  }
  if (!contentHash.trim()) throw new Error('İçerik hash zorunlu (kimlik = içerik).');
  const existing = receipts.get(contentHash);
  if (existing) return existing;
  ledgerSeq += 1;
  const objectKey = `rec-${fnv(contentHash)}`;
  const receipt: IngestReceipt = {
    objectKey,
    evidenceId: `ev-${fnv(objectKey)}`,
    ledgerSequence: ledgerSeq,
  };
  receipts.set(contentHash, receipt);
  return receipt;
}

/**
 * Transkripsiyon ANINDA rıza-kapısı YENİDEN çalışır (kanonik TranscriptionService
 * semantiği): GRANTED → upload → WITHDRAWN → transcribe RED. Idempotent: aynı
 * objectKey → aynı transcriptKey.
 */
export function transcribeRecording(objectKey: string): TranscribeReceipt {
  requireGrantedConsent('transkripsiyon');
  const existing = transcribed.get(objectKey);
  if (existing) return { transcriptKey: existing };
  const transcriptKey = `tr-${fnv(objectKey)}`;
  transcribed.set(objectKey, transcriptKey);
  return { transcriptKey };
}
