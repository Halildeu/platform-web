// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  chunkToSegment,
  collapseFoldedFragments,
  connectLiveTranscriptSse,
  liveStatusToSegmentStatus,
  resolveLiveTranscriptSseEndpoint,
  type LiveTranscriptChunk,
} from './meeting-live-transcript-sse';
import type { TranscriptSegment } from './meeting-workbench';

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

  test('UTTERANCE becomes a permanent line, DRAFT stays volatile', () => {
    const assembled = chunkToSegment(
      { text: 'Toplantıyı başlatalım.', status: 'UTTERANCE' },
      0,
      1_700_000_000_000,
    );
    expect(assembled.status).toBe('final');

    const raw = chunkToSegment({ text: 'Toplantıyı', status: 'DRAFT' }, 1, 1_700_000_000_000);
    expect(raw.status).toBe('draft');
  });

  test('an assembled line carries the audit trail back to its fragments', () => {
    const seg = chunkToSegment(
      {
        text: 'Toplantıyı başlatalım.',
        status: 'UTTERANCE',
        assemblyReason: 'SILENCE',
        sourceEventIds: ['evt-1', 'evt-2'],
      },
      0,
      1_700_000_000_000,
    );
    expect(seg.assemblyReason).toBe('SILENCE');
    expect(seg.sourceEventIds).toEqual(['evt-1', 'evt-2']);
  });

  test('a raw chunk carries no audit trail fields', () => {
    const seg = chunkToSegment({ text: 'Toplantıyı', status: 'DRAFT', sourceEventIds: [] }, 0, 0);
    expect(seg.assemblyReason).toBeUndefined();
    expect(seg.sourceEventIds).toBeUndefined();
  });

  // 'final' is what makes a line citable, so an unrecognised status must never
  // reach it. Without this anchor the mapping could be loosened to a default of
  // 'final' and the suite would still pass on the two known values.
  const uncitableStatuses: ReadonlyArray<readonly [string, string | null | undefined]> = [
    ['missing', undefined],
    ['null', null],
    ['lowercase', 'utterance'],
    ['unknown', 'PARTIAL'],
    ['empty', ''],
  ];

  test.each(uncitableStatuses)('%s status is not promoted to a citable line', (_label, status) => {
    expect(liveStatusToSegmentStatus(status)).toBe('draft');
    expect(chunkToSegment({ text: 'x', status }, 0, 0).status).toBe('draft');
  });
});

describe('collapseFoldedFragments', () => {
  const seg = (id: string, status: TranscriptSegment['status']): TranscriptSegment => ({
    id,
    speaker: 'Kayıtçı',
    startedAtMs: 0,
    status,
    text: 'x',
  });

  test('removes the raw fragments an assembled line folded in', () => {
    const before = [seg('evt-1', 'draft'), seg('evt-2', 'draft'), seg('evt-9', 'draft')];
    const after = collapseFoldedFragments(before, ['evt-1', 'evt-2']);
    expect(after.map((s) => s.id)).toEqual(['evt-9']);
  });

  // Deleting a line that was never folded is worse than briefly showing a
  // duplicate, so no ids to match must mean no deletions.
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', [] as string[]],
  ])('%s sourceEventIds removes nothing', (_label, ids) => {
    const before = [seg('evt-1', 'draft'), seg('evt-2', 'draft')];
    expect(collapseFoldedFragments(before, ids).map((s) => s.id)).toEqual(['evt-1', 'evt-2']);
  });

  test('a fragment that was already promoted survives — accuracy outranks readability', () => {
    const before = [seg('evt-1', 'final'), seg('evt-2', 'draft')];
    const after = collapseFoldedFragments(before, ['evt-1', 'evt-2']);
    expect(after.map((s) => s.id)).toEqual(['evt-1']);
  });

  test('does not mutate the array it was given', () => {
    const before = [seg('evt-1', 'draft')];
    collapseFoldedFragments(before, ['evt-1']);
    expect(before).toHaveLength(1);
  });
});

describe('chunkToSegment id', () => {
  test('uses the gateway id so an assembled line can find its fragments', () => {
    expect(chunkToSegment({ text: 'a', eventId: '1700000000000-3' }, 0, 111).id).toBe(
      '1700000000000-3',
    );
  });

  test('falls back to a local id when the gateway sends none', () => {
    expect(chunkToSegment({ text: 'a' }, 4, 111).id).toBe('live-sse-111-4');
    expect(chunkToSegment({ text: 'a', eventId: '   ' }, 4, 111).id).toBe('live-sse-111-4');
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

  // Wiring anchor: collapseFoldedFragments is unit-tested above, but disabling
  // the CALL leaves those tests green. This one fails the moment the stream
  // stops folding, which is the regression a viewer would actually see.
  test('an assembled line replaces the fragments it folded, instead of stacking on them', () => {
    (import.meta.env as Record<string, string | undefined>)[ENDPOINT_ENV] =
      'https://gw.example/api/v1/audio-gateway/meetings/{meetingId}/live-transcript/stream';
    const listeners = new Map<string, EventListener>();
    const fakeSource = {
      addEventListener: (event: string, listener: EventListener) => {
        listeners.set(event, listener);
      },
      set onopen(_handler: () => void) {},
      set onerror(_handler: () => void) {},
      close: vi.fn(),
    } as unknown as EventSource;

    const controller = connectLiveTranscriptSse('m-1', {}, () => fakeSource);
    const send = (chunk: LiveTranscriptChunk) =>
      listeners.get('transcript-chunk')?.(
        new MessageEvent('transcript-chunk', { data: JSON.stringify(chunk) }),
      );

    send({ text: 'Toplantıyı', eventId: 'evt-1', status: 'DRAFT' });
    send({ text: 'başlatalım.', eventId: 'evt-2', status: 'DRAFT' });
    expect(controller.snapshot().chunks.map((c) => c.id)).toEqual(['evt-1', 'evt-2']);

    send({
      text: 'Toplantıyı başlatalım.',
      eventId: 'evt-3',
      status: 'UTTERANCE',
      sourceEventIds: ['evt-1', 'evt-2'],
    });

    const after = controller.snapshot().chunks;
    expect(after.map((c) => c.id)).toEqual(['evt-3']);
    expect(after[0].status).toBe('final');
    expect(after[0].text).toBe('Toplantıyı başlatalım.');
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
    // Held on an object, not in `let` bindings: the assignments happen inside
    // the setters below, which the compiler cannot prove ever run, so it
    // narrowed the bindings to `null` and every call site became `never`.
    const captured: { open?: () => void; error?: () => void } = {};
    const fakeSource = {
      addEventListener: (event: string, listener: EventListener) => {
        listeners.set(event, listener);
      },
      set onopen(handler: () => void) {
        captured.open = handler;
      },
      set onerror(handler: () => void) {
        captured.error = handler;
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

    captured.open?.();
    expect(controller.snapshot().state).toBe('open');

    const handler = listeners.get('transcript-chunk');
    expect(handler).toBeDefined();
    handler?.(new MessageEvent('transcript-chunk', {
      data: JSON.stringify({ text: 'Merhaba dunya' } satisfies LiveTranscriptChunk),
    }));
    expect(controller.snapshot().state).toBe('receiving');
    expect(controller.snapshot().chunks).toHaveLength(1);
    expect(controller.snapshot().chunks[0].text).toBe('Merhaba dunya');

    captured.error?.();
    expect(controller.snapshot().state).toBe('error');

    controller.close();
    expect(controller.snapshot().state).toBe('closed');
    expect((fakeSource.close as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });
});
