import { describe, expect, it } from 'vitest';

import type { TranscriptSegment } from './meeting-workbench';
import { buildTranscriptFlow, endsWithSentenceTerminator } from './transcript-flow';

function segment(
  id: string,
  speaker: string,
  text: string,
  status: TranscriptSegment['status'],
  startedAtMs = 0,
): TranscriptSegment {
  return { id, speaker, startedAtMs, status, text };
}

describe('endsWithSentenceTerminator', () => {
  it('matches Turkish sentence enders', () => {
    expect(endsWithSentenceTerminator('Bütçe onaylandı.')).toBe(true);
    expect(endsWithSentenceTerminator('Katılıyor musunuz?')).toBe(true);
    expect(endsWithSentenceTerminator('devam eden ifade')).toBe(false);
  });
});

describe('buildTranscriptFlow', () => {
  it('keeps unterminated finals in one paragraph — no time-based break', () => {
    const groups = buildTranscriptFlow([
      segment('a', 'Konuşmacı', 'Bu toplantıda bütçe ve', 'final', 0),
      segment('b', 'Konuşmacı', 'proje planını', 'final', 2000),
      segment('c', 'Konuşmacı', 'değerlendiriyoruz.', 'final', 4000),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].paragraphs).toHaveLength(1);
    expect(groups[0].paragraphs[0].map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('opens a new paragraph only after a sentence terminator', () => {
    const groups = buildTranscriptFlow([
      segment('a', 'Konuşmacı', 'Karar kaydedildi.', 'final', 0),
      segment('b', 'Konuşmacı', 'Sorumlu kişi rapor', 'final', 3000),
      segment('c', 'Konuşmacı', 'hazırlayacak.', 'final', 6000),
    ]);
    expect(groups[0].paragraphs).toHaveLength(2);
    expect(groups[0].paragraphs[1].map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('breaks the group on speaker change', () => {
    const groups = buildTranscriptFlow([
      segment('a', 'Ürün', 'Plan hazır', 'final', 0),
      segment('b', 'Platform', 'Onaylıyorum.', 'final', 2000),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].speaker).toBe('Ürün');
    expect(groups[1].speaker).toBe('Platform');
  });

  it('extracts trailing drafts of the last group as the live tail', () => {
    const groups = buildTranscriptFlow([
      segment('a', 'Konuşmacı', 'İlk cümle tamam.', 'final', 0),
      segment('b', 'Konuşmacı', 'devam eden', 'stabilizing', 2000),
      segment('c', 'Konuşmacı', 'canlı hipotez', 'draft', 2500),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].paragraphs).toHaveLength(1);
    expect(groups[0].tail.map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('keeps mid-stream drafts in the flow (REST fallback content is not lost)', () => {
    const groups = buildTranscriptFlow([
      segment('a', 'Konuşmacı', 'canlı hat koptu', 'draft', 0),
      segment('b', 'Konuşmacı', 'ama kayıt sürdü.', 'draft', 2000),
      segment('c', 'Konuşmacı', 'Canlı hat geri döndü.', 'final', 5000),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].paragraphs).toHaveLength(2);
    expect(groups[0].paragraphs[0].map((s) => s.id)).toEqual(['a', 'b']);
    expect(groups[0].tail).toHaveLength(0);
  });

  it('renders a tail-only group when everything is still pending', () => {
    const groups = buildTranscriptFlow([segment('a', 'Konuşmacı', 'henüz commit yok', 'draft', 0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].paragraphs).toHaveLength(0);
    expect(groups[0].tail.map((s) => s.id)).toEqual(['a']);
  });

  it('ignores blank segments and returns empty for empty input', () => {
    expect(buildTranscriptFlow([])).toHaveLength(0);
    expect(buildTranscriptFlow([segment('a', 'K', '   ', 'final', 0)])).toHaveLength(0);
  });
});
