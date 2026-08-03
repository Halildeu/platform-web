import type { TranscriptSegment } from './meeting-workbench';

/**
 * Akıcı transkript akışı (Faz 24 RT revizyonu — gitops#3419).
 *
 * Sektör konvansiyonu (Speechmatics/Deepgram/Azure — platform-k8s-gitops
 * docs/faz24-realtime-stt-industry-survey.md §7): commit edilmiş parçalar
 * cümle-sonu noktalama KESİNLEŞENE kadar aynı görsel paragrafta akar; süre
 * doldu diye satır kırılmaz. Paragraf sınırı yalnız: (a) konuşmacı değişimi,
 * (b) cümle-sonu noktalama. Kuyruktaki draft/stabilizing segmentler canlı
 * hipotezdir; ayrı satır değil, akışın sonunda soluk stilde yerinde
 * güncellenerek gösterilir (partial replace-in-place).
 *
 * Alıntı deep-link'leri (#segment-{id}) korunur: render katmanı her segmenti
 * kendi <span id> çapası içinde akıtır — bu modül yalnız gruplamayı üretir.
 */

export interface FlowGroup {
  /** İlk segment id'sinden türetilen kararlı anahtar. */
  id: string;
  speaker: string;
  startedAtMs: number;
  /** Cümle-sınırlı paragraflar; her paragraf segment listesi taşır. */
  paragraphs: TranscriptSegment[][];
  /** Grubun sonundaki commit edilmemiş canlı kuyruk segmentleri. */
  tail: TranscriptSegment[];
}

const SENTENCE_TERMINATOR = /[.!?…]["'”’»)\]]*$/u;

export function endsWithSentenceTerminator(text: string): boolean {
  return SENTENCE_TERMINATOR.test(text.trim());
}

function isCommitted(segment: TranscriptSegment): boolean {
  return segment.status === 'final' || segment.status === 'revised';
}

/**
 * Girdi SIRALI olmalı (orderTranscriptSegments). Konuşmacı değişince yeni
 * grup açılır; grup içinde paragraflar yalnız cümle-sonu noktalamada kapanır.
 * Yalnız SON grubun kuyruğu canlı kabul edilir — aradaki draft'lar (REST
 * fallback pencereleri) içerik kaybetmemek için akışa katılır.
 */
export function buildTranscriptFlow(segments: readonly TranscriptSegment[]): FlowGroup[] {
  const groups: FlowGroup[] = [];

  for (const segment of segments) {
    if (!segment.text.trim()) {
      continue;
    }
    const active = groups.at(-1);
    if (!active || active.speaker !== segment.speaker) {
      groups.push({
        id: `flow:${segment.id}`,
        speaker: segment.speaker,
        startedAtMs: segment.startedAtMs,
        paragraphs: [[segment]],
        tail: [],
      });
      continue;
    }
    const lastParagraph = active.paragraphs.at(-1);
    const lastSegment = lastParagraph?.at(-1);
    if (lastParagraph && lastSegment && !endsWithSentenceTerminator(lastSegment.text)) {
      lastParagraph.push(segment);
    } else {
      active.paragraphs.push([segment]);
    }
  }

  const last = groups.at(-1);
  if (last) {
    // Son grubun sonundaki commit edilmemiş segmentleri kuyruk olarak ayır.
    while (true) {
      const lastParagraph = last.paragraphs.at(-1);
      const candidate = lastParagraph?.at(-1);
      if (!lastParagraph || !candidate || isCommitted(candidate)) {
        break;
      }
      last.tail.unshift(candidate);
      lastParagraph.pop();
      if (lastParagraph.length === 0) {
        last.paragraphs.pop();
      }
    }
  }

  return groups.filter((group) => group.paragraphs.length > 0 || group.tail.length > 0);
}
