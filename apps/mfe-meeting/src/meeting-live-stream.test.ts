import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLiveStreamSnapshot,
  displayLiveStreamEndpoint,
  reduceLiveStreamEvent,
  resolveMeetingLiveStreamEndpoint,
} from './meeting-live-stream';

describe('meeting live stream boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays disabled when no websocket endpoint is configured', () => {
    vi.stubEnv('VITE_MEETING_LIVE_STREAM_WS_URL', '');

    expect(resolveMeetingLiveStreamEndpoint('mtg-1')).toBeNull();
    expect(createLiveStreamSnapshot('not-configured')).toMatchObject({
      state: 'not-configured',
      label: 'Stream kapalı',
      segments: [],
    });
  });

  it('resolves meeting-scoped websocket endpoint templates without exposing query secrets', () => {
    vi.stubEnv(
      'VITE_MEETING_LIVE_STREAM_WS_URL',
      'wss://live.example.test/ws/stream?meeting={meetingId}&token=secret',
    );

    const endpoint = resolveMeetingLiveStreamEndpoint('faz 24');

    expect(endpoint).toBe('wss://live.example.test/ws/stream?meeting=faz%2024&token=secret');
    expect(displayLiveStreamEndpoint(endpoint ?? '')).toBe('wss://live.example.test/ws/stream');
  });

  it('reduces ready, partial, and final events into a fail-closed transcript snapshot', () => {
    const ready = reduceLiveStreamEvent(createLiveStreamSnapshot('connecting', 'ws://live'), {
      type: 'ready',
      sample_rate: 16000,
      live_model: 'live',
      final_model: 'final',
    });

    expect(ready).toMatchObject({
      state: 'ready',
      sampleRate: 16000,
      liveModel: 'live',
      finalModel: 'final',
      segments: [],
    });

    const partial = reduceLiveStreamEvent(ready, {
      type: 'partial',
      seq: 7,
      confirmed: 'faz yirmi dört',
      tentative: 'ürün',
      elapsed_ms: 2100,
      rms: 0.2,
      source: 'desktop',
    });

    expect(partial).toMatchObject({
      state: 'receiving',
      lastEvent: 'partial',
      segments: [
        {
          id: 'ws-partial-7',
          speaker: 'desktop',
          status: 'draft',
          text: 'faz yirmi dört ürün',
        },
      ],
    });

    const final = reduceLiveStreamEvent(partial, {
      type: 'final',
      seq: 7,
      text: 'Faz yirmi dört ürün yüzeyi ilerliyor.',
      reason: 'vad-final',
      elapsed_ms: 3400,
      rms: 0.19,
    });

    expect(final.segments).toEqual([
      {
        id: 'ws-final-7',
        speaker: 'Canlı STT',
        startedAtMs: 3400,
        status: 'final',
        text: 'Faz yirmi dört ürün yüzeyi ilerliyor.',
      },
    ]);
  });

  it('surfaces server error events without creating transcript text', () => {
    const snapshot = reduceLiveStreamEvent(createLiveStreamSnapshot('ready', 'ws://live'), {
      type: 'error',
      msg: 'worker timeout',
    });

    expect(snapshot).toMatchObject({
      state: 'error',
      label: 'Stream hatası',
      detail: 'worker timeout',
      segments: [],
    });
  });
});
