import { DEMO_SEGMENTS } from '../segment-view/demo-data';
import type { ErasureReceipt } from '../dsar/types';
import type { TranscriptEntry } from './types';

/**
 * DEMO transkript kayıt-defteri (ATS-0016 dürüst sınır: sentetik bağlam; 39d'de
 * `/api/ats` transcript-listing). F-liste invariant'ları kanonik davranışla hizalı:
 * - Kayıt İDEMPOTENT: transcribe idempotent olduğundan aynı transcriptKey'in
 *   yeniden kaydı YENİ girdi üretmez, mevcut girdiyi de EZMEZ.
 * - Silme İÇERİK-DÜZLEMİNİ boşaltır (segments=[]), girdiyi listeden DÜŞÜRMEZ:
 *   pointer + silme makbuzu denetim için görünür kalır (kanonik content-plane
 *   delete + pointer-only kalıntı; WORM defteri bu yüzeyin dışında).
 * - Silme TEK SEFERLİK: silinmiş transkripti yeniden silmek YAPISAL RED
 *   (fail-closed; UI bu yola zaten girmez — savunma katmanı).
 * - INGEST girdilerinin segmenti DÜRÜST YER-TUTUCUDUR (gerçek STT 39d'de);
 *   etiket pointer-only kanıt ref'idir (dosya adı/PII asla girmez).
 * Determinizm: Math.random/Date.now YOK; kimlikler çağrandan gelir.
 */

const DEMO_TRANSCRIPT_KEY = 'tr-demo-1';

function seedEntries(): Map<string, TranscriptEntry> {
  return new Map([
    [
      DEMO_TRANSCRIPT_KEY,
      {
        transcriptKey: DEMO_TRANSCRIPT_KEY,
        label: 'Demo görüşme (S1/S2)',
        origin: 'DEMO' as const,
        // klon: kayıt-defteri girdisi modül-seviyesi demo diziyle nesne paylaşmaz
        segments: DEMO_SEGMENTS.map((s) => ({ ...s })),
        erasure: null,
      },
    ],
  ]);
}

let entries = seedEntries();

/** Test izolasyonu için (yalnız test kullanır). */
export function resetDemoTranscripts(): void {
  entries = seedEntries();
}

/**
 * Kopyalar DERİNDİR (Codex 019f4bfd MINOR): yüzeysel dizi kopyası Segment
 * nesnelerini ve erasure makbuzunu paylaşımlı bırakır — dışarıdan alan
 * mutasyonu kayıt-defterini (dolayısıyla entailment sonucunu) bozabilirdi.
 */
function cloneEntry(e: TranscriptEntry): TranscriptEntry {
  return {
    ...e,
    segments: e.segments.map((s) => ({ ...s })),
    erasure: e.erasure ? { ...e.erasure } : null,
  };
}

/** Liste kopya döner (kayıt-defteri dışarıdan mutasyona kapalı). */
export function listTranscripts(): TranscriptEntry[] {
  return Array.from(entries.values()).map(cloneEntry);
}

export function getTranscript(transcriptKey: string): TranscriptEntry {
  const e = entries.get(transcriptKey);
  if (!e) throw new Error(`Transkript bulunamadı: ${transcriptKey}`);
  return cloneEntry(e);
}

/**
 * INGEST transkriptini kaydeder (idempotent — transcribe idempotent'inin aynası).
 * Segment içeriği dürüst yer-tutucu: gerçek konuşma-metni 39d canlı STT hattında.
 */
export function registerIngestTranscript(transcriptKey: string, evidenceId: string): void {
  if (!transcriptKey.trim()) throw new Error('Transkript anahtarı zorunlu.');
  if (!evidenceId.trim()) throw new Error('Kanıt referansı zorunlu (pointer-only etiket).');
  if (entries.has(transcriptKey)) return; // idempotent: mevcut girdi EZİLMEZ
  entries.set(transcriptKey, {
    transcriptKey,
    label: `Yükleme ${evidenceId.trim()}`,
    origin: 'INGEST',
    segments: [
      {
        index: 0,
        speakerLabel: 'S1',
        startMs: 0,
        endMs: 1000,
        text: `Demo yer-tutucu transkript — yüklenen kanıt ${evidenceId.trim()} için gerçek konuşma metni 39d canlı STT hattında üretilecek (ATS-0016 sentetik sınır).`,
      },
    ],
    erasure: null,
  });
}

/**
 * İçerik-düzlemi silme aynası: segmentler boşalır, girdi + makbuz denetim için
 * kalır. Silinmişi yeniden silmek yapısal RED (tek-seferlik; fail-closed).
 */
export function markErased(transcriptKey: string, receipt: ErasureReceipt): void {
  const e = entries.get(transcriptKey);
  if (!e) throw new Error(`Transkript bulunamadı: ${transcriptKey}`);
  if (e.erasure) {
    throw new Error('Bu transkript zaten silinmiş — içerik yüzeyi tek kez kaldırılır.');
  }
  e.segments = [];
  // giriş de klonlanır: çağıranın elindeki makbuz referansı sonradan mutasyona
  // uğrasa bile kayıt-defteri etkilenmez (Codex 019f4bfd giriş-alias bulgusu)
  e.erasure = { ...receipt };
}
