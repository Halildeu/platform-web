import { describe, expect, it } from 'vitest';
import { formatTranscriptOffset, sessionTimeOrigin } from './transcript-time';
import { buildTranscriptFlow } from './transcript-flow';
import { expandSpeakerTurns } from './speaker-attribution';
import { chunkToSegment } from './meeting-live-transcript-sse';

describe('transcript display time', () => {
  const origin = Date.parse('2026-09-13T16:00:00Z');

  it('preserves initial silence and raw timestamps rather than zeroing the first segment', () => {
    const segment = { startedAtMs: origin + 71000, timeOriginMs: origin };
    expect(formatTranscriptOffset(segment)).toBe('01:11');
    expect(segment.startedAtMs).toBe(origin + 71000);
    expect(formatTranscriptOffset({ startedAtMs: 71000 })).toBe('01:11');
    expect(formatTranscriptOffset({ startedAtMs: 3600000 })).toBe('60:00');
  });

  it.each([null, NaN, Infinity, origin + 1])(
    'does not invent a duration for origin %s',
    (timeOriginMs) => {
      expect(formatTranscriptOffset({ startedAtMs: origin, timeOriginMs })).toBe('--:--');
    },
  );

  it.each([undefined, '', 'invalid', '2026-09-13T16:00:00'])(
    'rejects unknown or local origin %s',
    (value) => {
      expect(sessionTimeOrigin(value)).toBeNull();
    },
  );

  it('uses an explicit timezone and keeps the same instant across offsets', () => {
    expect(sessionTimeOrigin('2026-09-13T16:00:00Z')).toBe(origin);
    expect(sessionTimeOrigin('2026-09-13T19:00:00+03:00')).toBe(origin);
  });

  it('carries the display origin through speaker expansion and flowing paragraphs', () => {
    const segments = expandSpeakerTurns([
      {
        id: 'source-1',
        speaker: 'unknown',
        text: 'hello world',
        status: 'final' as const,
        startedAtMs: origin + 7000,
        timeOriginMs: origin,
        speakerAttribution: {
          scope: '22222222-2222-4222-8222-222222222222',
          turns: [
            { speaker: 'S1', textStart: 0, textEnd: 5, startMs: 0, endMs: 1000 },
            { speaker: 'S2', textStart: 6, textEnd: 11, startMs: 1000, endMs: 2000 },
          ],
        },
      },
    ]);
    expect(segments.map(formatTranscriptOffset)).toEqual(['00:07', '00:08']);
    expect(buildTranscriptFlow(segments).map(formatTranscriptOffset)).toEqual(['00:07', '00:08']);
    expect(segments[0].id).toBe('source-1');
  });

  it('does not present SSE arrival time as an audio position', () => {
    const segment = chunkToSegment({ text: 'test', status: 'FINAL' }, 1, origin);
    expect(segment.startedAtMs).toBe(origin);
    expect(formatTranscriptOffset(segment)).toBe('--:--');
  });
});
