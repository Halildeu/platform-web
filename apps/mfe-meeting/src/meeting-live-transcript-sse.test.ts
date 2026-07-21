// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  chunkToSegment,
  connectLiveTranscriptSse,
  resolveLiveTranscriptSseEndpoint,
  type LiveTranscriptChunk,
} from './meeting-live-transcript-sse';

const ENDPOINT_ENV = 'VITE_MEETING_LIVE_TRANSCRIPT_SSE_URL';

describe('resolveLiveTranscriptSseEndpoint', () => {
  const original = { ...import.meta.env };

  beforeEach(() => {
    Object.assign(import.meta.env, original);
  });

  afterEach(() => {
    Object.assign(import.meta.env, original);
  });

  test('returns null when env not set', () => {
    delete (import.meta.env as Record<string, string | undefined>)[ENDPOINT_ENV];
    expect(resolveLiveTranscriptSseEndpoint('m-1')).toBeNull();
  });

  test('substitutes {meetingId} placeholder + URL-encodes', () => {
    (import.meta.env as Record<string, string | undefined>)[ENDPOINT_ENV] =
      'https://gw.example/api/v1/audio-gateway/meetings/{meetingId}/live-transcript/stream';
    expect(resolveLiveTranscriptSseEndpoint('m-1 a')).toBe(
      'https://gw.example/api/v1/audio-gateway/meetings/m-1%20a/live-transcript/stream',
    );
  });
});

describe('chunkToSegment', () => {
  test('maps text + seq + timestamp into a TranscriptSegment draft', () => {
    const chunk: LiveTranscriptChunk = { text: 'Merhaba' };
    const seg = chunkToSegment(chunk, 0, 1_700_000_000_000);
    expect(seg.text).toBe('Merhaba');
    expect(seg.status).toBe('draft');
    expect(seg.speaker).toBe('Kayıtçı');
    expect(seg.startedAtMs).toBe(1_700_000_000_000);
    expect(seg.id).toContain('live-sse-1700000000000-0');
  });

  test('null text becomes empty string, not null', () => {
    const seg = chunkToSegment({ text: null as unknown as string }, 0, 0);
    expect(seg.text).toBe('');
  });
});

describe('connectLiveTranscriptSse', () => {
  const original = { ...import.meta.env };

  beforeEach(() => {
    Object.assign(import.meta.env, original);
  });

  afterEach(() => {
    Object.assign(import.meta.env, original);
  });

  test('not-configured when env is unset', () => {
    delete (import.meta.env as Record<string, string | undefined>)[ENDPOINT_ENV];
    const controller = connectLiveTranscriptSse('m-1');
    expect(controller.snapshot().state).toBe('not-configured');
    expect(controller.snapshot().chunks).toEqual([]);
  });

  test('factory injection lets us fake EventSource', () => {
    (import.meta.env as Record<string, string | undefined>)[ENDPOINT_ENV] =
      'https://gw.example/api/v1/audio-gateway/meetings/{meetingId}/live-transcript/stream';
    const listeners = new Map<string, EventListener>();
    let openHandler: (() => void) | null = null;
    let errorHandler: (() => void) | null = null;
    const fakeSource = {
      addEventListener: (event: string, listener: EventListener) => {
        listeners.set(event, listener);
      },
      set onopen(handler: () => void) {
        openHandler = handler;
      },
      set onerror(handler: () => void) {
        errorHandler = handler;
      },
      close: vi.fn(),
    } as unknown as EventSource;

    const snapshots: string[] = [];
    const controller = connectLiveTranscriptSse(
      'm-1',
      { onSnapshot: (s) => snapshots.push(s.state) },
      () => fakeSource,
    );

    expect(controller.snapshot().state).toBe('connecting');

    openHandler?.();
    expect(controller.snapshot().state).toBe('open');

    const handler = listeners.get('transcript-chunk');
    expect(handler).toBeDefined();
    handler?.(new MessageEvent('transcript-chunk', {
      data: JSON.stringify({ text: 'Merhaba dunya' } satisfies LiveTranscriptChunk),
    }));
    expect(controller.snapshot().state).toBe('receiving');
    expect(controller.snapshot().chunks).toHaveLength(1);
    expect(controller.snapshot().chunks[0].text).toBe('Merhaba dunya');

    errorHandler?.();
    expect(controller.snapshot().state).toBe('error');

    controller.close();
    expect(controller.snapshot().state).toBe('closed');
    expect((fakeSource.close as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });
});
