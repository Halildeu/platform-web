import type { Segment } from '../segment-view/types';
import type { ErasureReceipt } from '../dsar/types';

/**
 * F-liste (vaka/transkript liste-seçim) tipleri — ATS kanonik "transcript
 * liste/seçim" ürün yüzeyinin (standalone slice-22/23) platform-web karşılığı.
 * 39d'de `/api/ats` transcript-listing DTO'suna bağlanır; şimdilik demo kayıt-defteri.
 */
export type TranscriptOrigin = 'DEMO' | 'INGEST' | 'LIVE';

export interface TranscriptEntry {
  transcriptKey: string;
  /** PII içermeyen etiket (demo etiketi veya pointer-only kanıt ref'i). */
  label: string;
  origin: TranscriptOrigin;
  /** İçerik düzlemi: silme sonrası BOŞALTILIR (pointer + makbuz kalır). */
  segments: Segment[];
  /** Doluysa transkript silinmiştir; içerik yüzeyleri açılamaz. */
  erasure: ErasureReceipt | null;
}
