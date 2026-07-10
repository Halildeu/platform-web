import type { ConsentState, IngestReceipt, TranscribeReceipt } from './types';

/**
 * DEMO rıza + ingest motoru (ATS-0016 dürüst sınır: sentetik bağlam; 39d'de
 * `/api/ats`). F1/F2 AKIŞ-İSKELETİ invariant'larını backend kontratıyla aynı
 * uygular:
 * - RIZA-KAPISI (fail-closed): yükleme YALNIZ güncel beyan GRANTED ise kabul
 *   edilir; beyansız / DENIED / WITHDRAWN durumda yapısal RED (UI bypass edemez).
 * - subjectRef OPAK ref'tir (PII girilmez — UI da söyler); son beyan geçerlidir
 *   (WITHDRAWN sonrası yükleme yeniden reddedilir).
 * - Yükleme allowlist + boyut sınırı minyatürü (audio/*, ≤ 100 MB demo sınırı);
 *   makbuz POINTER-ONLY (objectKey/evidenceId/seq — içerik yok).
 * - transcribe idempotent: aynı objectKey için hep AYNI transcriptKey.
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
const transcribed = new Map<string, string>();

/** Test izolasyonu için (yalnız test kullanır). */
export function resetDemoIngest(): void {
  currentConsent = null;
  ledgerSeq = 0;
  transcribed.clear();
}

export function putConsent(subjectRef: string, state: ConsentState): void {
  if (!subjectRef.trim()) throw new Error('Kişi referansı zorunlu (opak ref; PII girmeyin).');
  currentConsent = { subjectRef: subjectRef.trim(), state };
}

export function getConsent(): ConsentState | null {
  return currentConsent?.state ?? null;
}

const ALLOWED_PREFIX = 'audio/';
const MAX_BYTES = 100 * 1024 * 1024;

/** RIZA-KAPISI: yalnız güncel beyan GRANTED ise makbuz üretilir (fail-closed). */
export function uploadRecording(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): IngestReceipt {
  if (!currentConsent) {
    throw new Error('Rıza beyanı yok — yükleme reddedildi (rıza-kapısı, fail-closed).');
  }
  if (currentConsent.state !== 'GRANTED') {
    throw new Error(`Rıza durumu ${currentConsent.state} — yükleme reddedildi (yalnız GRANTED).`);
  }
  if (!mimeType.startsWith(ALLOWED_PREFIX)) {
    throw new Error('Yalnız ses dosyaları kabul edilir (kapalı allowlist).');
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    throw new Error('Dosya boyutu sınır dışı (demo sınırı 100 MB).');
  }
  ledgerSeq += 1;
  const objectKey = `rec-${fnv(`${fileName}|${sizeBytes}`)}`;
  return { objectKey, evidenceId: `ev-${fnv(objectKey)}`, ledgerSequence: ledgerSeq };
}

/** Idempotent: aynı objectKey → aynı transcriptKey (çift-transcribe yeni iş üretmez). */
export function transcribeRecording(objectKey: string): TranscribeReceipt {
  const existing = transcribed.get(objectKey);
  if (existing) return { transcriptKey: existing };
  const transcriptKey = `tr-${fnv(objectKey)}`;
  transcribed.set(objectKey, transcriptKey);
  return { transcriptKey };
}
