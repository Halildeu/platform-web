import { describe, expect, it } from 'vitest';

import {
  parseWsStreamEvent,
  parseWsStreamEventMessage,
  wsStreamEventToTranscriptSegment,
  type WsStreamEvent,
} from './ws-stream-events';

const validEvents: WsStreamEvent[] = [
  { type: 'loading', stage: 'live_model' },
  {
    type: 'ready',
    sample_rate: 16000,
    live_model: 'faster-whisper-live',
    final_model: 'faster-whisper-final',
  },
  {
    type: 'partial',
    seq: 2,
    confirmed: 'faz yirmi dort',
    tentative: 'urun yuzeyi',
    elapsed_ms: 1200,
    rms: 0.22,
    source: 'desktop',
  },
  {
    type: 'final',
    seq: 2,
    text: 'Faz 24 urun yuzeyi ilerliyor.',
    reason: 'vad-final',
    elapsed_ms: 3400,
    rms: 0.2,
  },
  { type: 'error', msg: 'worker timeout' },
  { type: 'debug', event: 'vad-state', detail: { active: true } },
];

describe('ws-stream-events consumer contract', () => {
  it.each(validEvents)('accepts canonical %s event payloads', (event) => {
    const result = parseWsStreamEvent(event);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toEqual(event);
    }
  });

  it('parses JSON websocket messages without accepting invalid JSON', () => {
    expect(parseWsStreamEventMessage(JSON.stringify(validEvents[2]))).toMatchObject({ ok: true });
    expect(parseWsStreamEventMessage('{broken-json')).toEqual({
      ok: false,
      reason: 'invalid-json',
    });
  });

  it('rejects unknown event types gracefully', () => {
    expect(parseWsStreamEvent({ type: 'transcript', text: 'not canonical' })).toEqual({
      ok: false,
      reason: 'unknown-type',
      eventType: 'transcript',
    });
  });

  it('rejects malformed or drifted strict event shapes', () => {
    expect(
      parseWsStreamEvent({
        type: 'partial',
        seq: 1,
        confirmed: '',
        tentative: 'hello',
        elapsed_ms: 20,
        rms: 0.1,
        source: 'desktop',
        raw_audio: 'forbidden',
      }),
    ).toEqual({ ok: false, reason: 'invalid-shape', eventType: 'partial' });

    expect(
      parseWsStreamEvent({
        type: 'ready',
        sample_rate: 4000,
        live_model: 'live',
        final_model: 'final',
      }),
    ).toEqual({ ok: false, reason: 'invalid-shape', eventType: 'ready' });
  });

  it('normalizes transcript-bearing events into timeline segments only', () => {
    const partialResult = parseWsStreamEvent(validEvents[2]);
    const finalResult = parseWsStreamEvent(validEvents[3]);
    const readyResult = parseWsStreamEvent(validEvents[1]);

    expect(partialResult.ok && wsStreamEventToTranscriptSegment(partialResult.event)).toEqual({
      id: 'ws-partial-2',
      speaker: 'desktop',
      startedAtMs: 1200,
      status: 'draft',
      text: 'faz yirmi dort urun yuzeyi',
    });
    expect(finalResult.ok && wsStreamEventToTranscriptSegment(finalResult.event)).toEqual({
      id: 'ws-final-2',
      speaker: 'Canlı STT',
      startedAtMs: 3400,
      status: 'final',
      text: 'Faz 24 urun yuzeyi ilerliyor.',
    });
    expect(readyResult.ok && wsStreamEventToTranscriptSegment(readyResult.event)).toBeNull();
  });
});
