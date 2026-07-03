import type { Segment } from './types';

/**
 * DÜRÜST SINIR (ATS-0016): sentetik/demo veri — gerçek aday verisi DEĞİL. Bu MFE
 * yüzeyi release-gate (UI görünürlüğü) kapsamındadır; gerçek aday verisiyle işleme
 * G0=GO gerektirir. 39c-3'te bu demo seti `/api/ats` canlı transkriptiyle değişecek.
 * Konuşmacılar takma-ad (S1/S2; ATS-0013 diarization — kimlik yok).
 */
export const DEMO_SEGMENTS: Segment[] = [
  {
    index: 0,
    speakerLabel: 'S1',
    startMs: 0,
    endMs: 4200,
    text: 'Merhaba, bugünkü görüşmeye katıldığınız için teşekkürler.',
  },
  {
    index: 1,
    speakerLabel: 'S2',
    startMs: 4200,
    endMs: 9800,
    text: 'Rica ederim, burada olmaktan memnuniyet duyuyorum.',
  },
  {
    index: 2,
    speakerLabel: 'S1',
    startMs: 9800,
    endMs: 16500,
    text: 'Önceki projenizde üstlendiğiniz rolü kısaca anlatır mısınız?',
  },
  {
    index: 3,
    speakerLabel: 'S2',
    startMs: 16500,
    endMs: 25000,
    text: 'Ekibin teknik liderliğini yürüttüm; mimari kararlar ve kod incelemesinden sorumluydum.',
  },
];
