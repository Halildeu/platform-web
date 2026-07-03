/**
 * F3 transkript segment modeli. Konuşmacılar DAİMA takma-ad (S1..Sn);
 * ATS-0013 diarization sözleşmesi: sağlayıcıdan kimlik alınmaz, UI da üretmez.
 * Bu tip 39c-3'te `/api/ats` DTO'suna bağlanacaktır (şimdilik demo veri).
 */
export interface Segment {
  index: number;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
}
