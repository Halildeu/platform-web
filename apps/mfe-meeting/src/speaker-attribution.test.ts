import { describe, expect, it } from 'vitest';
import { expandSpeakerTurns, parseSpeakerAttribution } from './speaker-attribution';
import { chunkToSegment } from './meeting-live-transcript-sse';
import { parseWsStreamEvent, wsStreamEventToTranscriptSegment } from './ws-stream-events';
import type { TranscriptSegment } from './meeting-workbench';

const attribution = {
  scope: '22222222-2222-4222-8222-222222222222',
  turns: [
    { speaker: 'S1', textStart: 0, textEnd: 5, startMs: 0, endMs: 700 },
    { speaker: 'S2', textStart: 6, textEnd: 11, startMs: 500, endMs: 1000 },
  ],
};
const segment: TranscriptSegment = {
  id: 'canonical-1',
  text: 'hello world',
  status: 'final',
  speaker: 'unknown',
  startedAtMs: 1000,
  speakerAttribution: attribution,
};

describe('anonymous speaker attribution', () => {
  it('preserves overlap and canonical citation identity without naming people', () => {
    const result = expandSpeakerTurns([segment]);
    expect(result.map((s) => [s.speaker, s.text, s.startedAtMs])).toEqual([
      ['Konuşmacı 1', 'hello', 1000],
      ['Konuşmacı 2', 'world', 1500],
    ]);
    expect(result[0].id).toBe('canonical-1');
  });
  it('does not merge speakers across transport scopes', () => {
    const result = expandSpeakerTurns([
      segment,
      {
        ...segment,
        id: 'second',
        speakerAttribution: {
          ...attribution,
          scope: '33333333-3333-4333-8333-333333333333',
        },
      },
    ]);
    expect(result.map((s) => s.speaker)).toEqual([
      'Konuşmacı 1',
      'Konuşmacı 2',
      'Konuşmacı 3',
      'Konuşmacı 4',
    ]);
  });
  it('keeps unknown explicit and does not drop text when attribution is invalid', () => {
    const unknown = {
      ...attribution,
      turns: [{ speaker: 'UU', textStart: 0, textEnd: 11, startMs: 0, endMs: 1000 }],
    };
    expect(expandSpeakerTurns([{ ...segment, speakerAttribution: unknown }])[0].speaker).toBe(
      'Konuşmacı belirsiz',
    );
    expect(
      parseSpeakerAttribution({ ...attribution, turns: [attribution.turns[0]] }, segment.text),
    ).toBeUndefined();
    const invalid = { ...segment, speakerAttribution: { ...attribution, scope: 'not-a-uuid' } };
    expect(expandSpeakerTurns([invalid])).toEqual([invalid]);
  });
  it('rejects names, extra fields, non-integer offsets and surrogate splits', () => {
    for (const patch of [{ speaker: 'Alice' }, { textEnd: 0.5 }, { voiceprint: 'x' }]) {
      expect(
        parseSpeakerAttribution(
          { ...attribution, turns: [{ ...attribution.turns[0], ...patch }] },
          'hello',
        ),
      ).toBeUndefined();
    }
    expect(
      parseSpeakerAttribution(
        {
          ...attribution,
          turns: [
            { speaker: 'S1', textStart: 0, textEnd: 1, startMs: 0, endMs: 1 },
            { speaker: 'S2', textStart: 1, textEnd: 2, startMs: 1, endMs: 2 },
          ],
        },
        '\uD83D\uDE00',
      ),
    ).toBeUndefined();
  });
  it('receives the same attribution over live SSE and gateway WebSocket', () => {
    const sse = chunkToSegment({ text: segment.text, speakerAttribution: attribution }, 0, 1000);
    expect(sse.speakerAttribution).toEqual(attribution);
    const parsed = parseWsStreamEvent({
      type: 'final',
      seq: 0,
      text: segment.text,
      reason: 'speechmatics_final',
      elapsed_ms: 2000,
      rms: 0,
      source_start_sample: 16000,
      source_end_sample: 32000,
      speakerAttribution: attribution,
      audio_sent_ms: 2000,
      emitted_at_ms: 3000,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const ws = wsStreamEventToTranscriptSegment(parsed.event)!;
      expect(ws.speakerAttribution).toEqual(sse.speakerAttribution);
      expect(ws.startedAtMs).toBe(1000);
    }
  });
});
