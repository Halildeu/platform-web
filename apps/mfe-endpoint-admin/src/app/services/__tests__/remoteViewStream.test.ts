import { describe, expect, it, vi } from 'vitest';
import { acknowledgeRemoteViewRender, openRemoteViewStream } from '../remoteViewStream';
import type { RemoteViewFrame, RemoteViewStatus } from '../../../entities/remote-view/types';

function sseResponse(chunks: string[], init?: { status?: number; ok?: boolean }): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  const status = init?.status ?? 200;
  return { status, ok: init?.ok ?? status < 400, body: stream } as unknown as Response;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
async function until(pred: () => boolean, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (pred()) return;
    await flush();
  }
  throw new Error('until: condition not met in time');
}

describe('openRemoteViewStream', () => {
  it('parses meta + frames, ignores the heartbeat comment, ends closed, sends the bearer header', async () => {
    const statuses: RemoteViewStatus[] = [];
    const frames: RemoteViewFrame[] = [];
    let meta: unknown = null;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-opaque"}\n\n',
          ':heartbeat\n\n',
          'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":110,"dataB64":"AAAB"}\n\n',
          'event: frame\ndata: {"seq":2,"contentType":"image/png","observedAtEpochMillis":120,"sentAtEpochMillis":130,"dataB64":"AAAC"}\n\n',
        ]),
      );

    openRemoteViewStream({
      url: 'http://x/view',
      token: 'tkn',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onStatus: (s) => statuses.push(s),
      onMeta: (m) => {
        meta = m;
      },
      onFrame: (f) => frames.push(f),
    });

    await until(() => statuses.includes('closed'));
    expect(statuses).toEqual(['connecting', 'live', 'closed']);
    expect(meta).toEqual({
      recording: false,
      attended: true,
      capability: 'VIEW_ONLY',
      viewerId: 'vw-opaque',
    });
    expect(frames).toEqual([
      {
        seq: 1,
        contentType: 'image/png',
        observedAtEpochMillis: 100,
        sentAtEpochMillis: 110,
        dataB64: 'AAAB',
      },
      {
        seq: 2,
        contentType: 'image/png',
        observedAtEpochMillis: 120,
        sentAtEpochMillis: 130,
        dataB64: 'AAAC',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/view',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tkn',
          Accept: 'text/event-stream',
        }),
        cache: 'no-store',
      }),
    );
  });

  it('maps HTTP outcomes: 401/403→forbidden, 409→busy, 500→error (and never streams)', async () => {
    const cases: Array<[number, RemoteViewStatus]> = [
      [401, 'forbidden'],
      [403, 'forbidden'],
      [409, 'busy'],
      [500, 'error'],
    ];
    for (const [code, expected] of cases) {
      const statuses: RemoteViewStatus[] = [];
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse([], { status: code }));
      openRemoteViewStream({
        url: 'u',
        token: null,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onStatus: (s) => statuses.push(s),
      });
      await until(() => statuses.includes(expected));
      expect(statuses).toContain(expected);
      expect(statuses).not.toContain('live');
    }
  });

  it('buffers an event split across chunks and parses it once', async () => {
    const frames: RemoteViewFrame[] = [];
    const statuses: RemoteViewStatus[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: frame\ndata: {"seq":7,"contentType":"image/p',
          'ng","observedAtEpochMillis":100,"sentAtEpochMillis":101,"dataB64":"ZZZ"}\n\n',
        ]),
      );
    openRemoteViewStream({
      url: 'u',
      token: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onFrame: (f) => frames.push(f),
      onStatus: (s) => statuses.push(s),
    });
    await until(() => statuses.includes('closed'));
    expect(frames).toEqual([
      {
        seq: 7,
        contentType: 'image/png',
        observedAtEpochMillis: 100,
        sentAtEpochMillis: 101,
        dataB64: 'ZZZ',
      },
    ]);
  });

  it('omits the Authorization header when there is no token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([]));
    const statuses: RemoteViewStatus[] = [];
    openRemoteViewStream({
      url: 'u',
      token: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onStatus: (s) => statuses.push(s),
    });
    await until(() => statuses.includes('closed'));
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('swallows malformed or incomplete frames instead of inventing acknowledgement authority', async () => {
    const frames: RemoteViewFrame[] = [];
    const statuses: RemoteViewStatus[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: frame\ndata: {not valid json}\n\n',
          'event: frame\ndata: {"dataB64":"INCOMPLETE"}\n\n',
          'event: frame\ndata: {"seq":3,"contentType":"image/png","observedAtEpochMillis":10,"sentAtEpochMillis":11,"dataB64":"OK"}\n\n',
        ]),
      );
    openRemoteViewStream({
      url: 'u',
      token: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onFrame: (f) => frames.push(f),
      onStatus: (s) => statuses.push(s),
    });
    await until(() => statuses.includes('closed'));
    expect(frames).toEqual([
      {
        seq: 3,
        contentType: 'image/png',
        observedAtEpochMillis: 10,
        sentAtEpochMillis: 11,
        dataB64: 'OK',
      },
    ]);
  });

  it('sends metadata-only render acknowledgement with the bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 204, ok: true } as Response);
    const accepted = await acknowledgeRemoteViewRender({
      url: 'https://test/view?streamId=op-1',
      token: 'tkn',
      viewerId: 'vw-opaque',
      frameSeq: 7,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(accepted).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer tkn', 'Content-Type': 'application/json' }),
    );
    expect(JSON.parse(String(init.body))).toEqual({ viewerId: 'vw-opaque', frameSeq: 7 });
    expect(String(init.body)).not.toMatch(/dataB64|payload|image/i);
  });

  it('does not send render acknowledgement without bearer authority', async () => {
    const fetchImpl = vi.fn();
    expect(
      await acknowledgeRemoteViewRender({
        url: 'u',
        token: null,
        viewerId: 'vw',
        frameSeq: 1,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
