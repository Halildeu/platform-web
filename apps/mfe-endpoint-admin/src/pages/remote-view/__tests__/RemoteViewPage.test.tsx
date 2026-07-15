import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import RemoteViewPage, { type RemoteViewPageProps } from '../RemoteViewPage';

/** A push-controlled SSE Response so a test can keep the stream live or end it. */
function controllableSse(): { response: Response; push: (chunk: string) => void; end: () => void } {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
    },
  });
  return {
    response: { status: 200, ok: true, body: stream } as unknown as Response,
    push: (chunk) => ctrl.enqueue(enc.encode(chunk)),
    end: () => {
      try {
        ctrl.close();
      } catch {
        /* already closed */
      }
    },
  };
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

const VIEW_ROUTE = '/endpoint-admin/remote-access/sessions/:sessionId/view';

function renderAt(entry: string, props: RemoteViewPageProps = {}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={VIEW_ROUTE} element={<RemoteViewPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function NavButton() {
  const nav = useNavigate();
  return (
    <button
      data-testid="nav-to-b"
      onClick={() => nav('/endpoint-admin/remote-access/sessions/sess-B/view?streamId=op-B')}
    >
      go B
    </button>
  );
}

function NavHarness({ fetchImpl }: { fetchImpl: typeof fetch }) {
  return (
    <MemoryRouter
      initialEntries={['/endpoint-admin/remote-access/sessions/sess-A/view?streamId=op-A']}
    >
      <NavButton />
      <Routes>
        <Route
          path={VIEW_ROUTE}
          element={<RemoteViewPage fetchImpl={fetchImpl} tokenResolver={() => 'tkn'} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('RemoteViewPage', () => {
  it('renders VIEW_ONLY + recording-OFF + the no-input note, and forwards NO input controls', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockResolvedValue(sse.response);
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
    });

    expect(screen.queryByTestId('remote-view-badge-viewonly')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-recording-off')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-attended')).toBeNull();
    expect(screen.queryByTestId('remote-view-no-input-note')).toBeNull();
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute(
      'data-metadata-trusted',
      'false',
    );
    expect(screen.getByTestId('remote-view-page')).not.toHaveAttribute('data-viewer-id');

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-opaque"}\n\n',
      );
      sse.push(
        'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":110,"dataB64":"iVBOR"}\n\n',
      );
    });
    await flush();

    expect(screen.getByTestId('remote-view-badge-viewonly')).toHaveTextContent(
      /YALNIZ İZLEME|VIEW-ONLY/,
    );
    expect(screen.getByTestId('remote-view-badge-recording-off')).toBeInTheDocument();
    expect(screen.getByTestId('remote-view-badge-attended')).toBeInTheDocument();
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute('data-metadata-trusted', 'true');
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute('data-viewer-id', 'vw-opaque');
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute('data-frame-seq', '1');
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute('data-frame-observed-at', '100');
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute('data-frame-sent-at', '110');
    expect(screen.getByTestId('remote-view-no-input-note').textContent).toMatch(
      /iletilmez|not forwarded/,
    );

    const img = await screen.findByTestId('remote-view-frame');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,iVBOR');
    // observation-only: the ONLY interactive control is STOP — no text input, no other buttons.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual([
      'remote-view-stop',
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
    sse.end();
  });

  it('hits the correct gateway path with the bearer header and streamId', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockResolvedValue(sse.response);
    renderAt('/endpoint-admin/remote-access/sessions/sess-9/view?streamId=op-42', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'jwt-123',
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://localhost/api/v1/endpoint-admin/remote-access/sessions/sess-9/view?streamId=op-42',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
    sse.end();
  });

  it('acknowledges only metadata after the current image has rendered', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ status: 204, ok: true } as Response);
      }
      return Promise.resolve(sse.response);
    });
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
      afterPaint: (callback) => callback(),
      nowFn: () => 250,
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-opaque"}\n\n',
      );
      sse.push(
        'event: frame\ndata: {"seq":7,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":120,"dataB64":"FRAME"}\n\n',
      );
    });
    const img = await screen.findByTestId('remote-view-frame');
    fireEvent.load(img);

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const [ackUrl, ackInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(ackUrl).toContain('/sess-1/view?streamId=op-1');
    expect(ackInit.method).toBe('POST');
    expect((ackInit.headers as Record<string, string>).Authorization).toBe('Bearer tkn');
    expect(JSON.parse(String(ackInit.body))).toEqual({ viewerId: 'vw-opaque', frameSeq: 7 });
    expect(String(ackInit.body)).not.toContain('FRAME');
    expect(String(ackInit.body)).not.toMatch(/"dataB64"|"payload"|"image"/i);
    await waitFor(() =>
      expect(screen.getByTestId('remote-view-page')).toHaveAttribute(
        'data-render-ack-accepted-count',
        '1',
      ),
    );
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute(
      'data-render-ack-attempted-count',
      '1',
    );
    expect(screen.getByTestId('remote-view-frame-age')).toHaveTextContent('0s');
    sse.end();
  });

  it('bounds render acknowledgement traffic to one in-flight plus latest pending frame', async () => {
    const sse = controllableSse();
    let resolveFirstAck!: (response: Response) => void;
    const firstAck = new Promise<Response>((resolve) => {
      resolveFirstAck = resolve;
    });
    let postCount = 0;
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postCount += 1;
        return postCount === 1 ? firstAck : Promise.resolve({ status: 204, ok: true } as Response);
      }
      return Promise.resolve(sse.response);
    });
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
      afterPaint: (callback) => callback(),
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-opaque"}\n\n',
      );
      sse.push(
        'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":101,"dataB64":"A"}\n\n',
      );
    });
    fireEvent.load(await screen.findByTestId('remote-view-frame'));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    await act(async () => {
      sse.push(
        'event: frame\ndata: {"seq":2,"contentType":"image/png","observedAtEpochMillis":110,"sentAtEpochMillis":111,"dataB64":"B"}\n\n',
      );
    });
    fireEvent.load(await screen.findByTestId('remote-view-frame'));
    await act(async () => {
      sse.push(
        'event: frame\ndata: {"seq":3,"contentType":"image/png","observedAtEpochMillis":120,"sentAtEpochMillis":121,"dataB64":"C"}\n\n',
      );
    });
    fireEvent.load(await screen.findByTestId('remote-view-frame'));
    expect(fetchImpl).toHaveBeenCalledTimes(2); // GET + seq=1 POST; seq=2 was replaced by seq=3

    resolveFirstAck({ status: 204, ok: true } as Response);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    const latestAck = fetchImpl.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(latestAck.body))).toEqual({ viewerId: 'vw-opaque', frameSeq: 3 });
    expect(screen.getByTestId('remote-view-page')).toHaveAttribute(
      'data-render-ack-attempted-count',
      '2',
    );
    sse.end();
  });

  it('STOP closes a live view and disables the button', async () => {
    const sse = controllableSse(); // never ended → stays live
    const fetchImpl = vi.fn().mockResolvedValue(sse.response);
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
    });
    await waitFor(() =>
      expect(screen.getByTestId('remote-view-status')).toHaveTextContent(/Canlı|Live/),
    );
    const stopBtn = screen.getByTestId('remote-view-stop');
    expect(stopBtn).not.toBeDisabled();
    fireEvent.click(stopBtn);
    expect(screen.getByTestId('remote-view-status')).toHaveTextContent(
      /Oturum kapandı|Session closed/,
    );
    expect(stopBtn).toBeDisabled();
    sse.end();
  });

  it('STOP clears the last frame and cancels a scheduled render acknowledgement', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ status: 204, ok: true } as Response);
      }
      return Promise.resolve(sse.response);
    });
    let scheduledAck: (() => void) | undefined;
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
      afterPaint: (callback) => {
        scheduledAck = callback;
      },
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-opaque"}\n\n',
      );
      sse.push(
        'event: frame\ndata: {"seq":7,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":120,"dataB64":"FRAME"}\n\n',
      );
    });
    const img = await screen.findByTestId('remote-view-frame');
    fireEvent.load(img);
    expect(scheduledAck).toBeTypeOf('function');

    fireEvent.click(screen.getByTestId('remote-view-stop'));
    expect(screen.queryByTestId('remote-view-frame')).toBeNull();
    scheduledAck?.();
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1); // SSE GET only; no post-STOP acknowledgement
    sse.end();
  });

  it('shows the missing-params notice and opens NO stream when streamId is absent', () => {
    const fetchImpl = vi.fn();
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
    });
    expect(screen.getByText(/eksik|Missing/)).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a 403 to the forbidden status (no oracle leak on the client)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ status: 403, ok: false, body: null } as unknown as Response);
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
    });
    await waitFor(() =>
      expect(screen.getByTestId('remote-view-status')).toHaveTextContent(
        /yetkiniz yok|not authorized/,
      ),
    );
  });

  it('renders no frame, trusted badges or acknowledgement when a frame precedes metadata', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ status: 204, ok: true } as Response);
      return Promise.resolve(sse.response);
    });
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
      afterPaint: (callback) => callback(),
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":101,"dataB64":"EARLY"}\n\n',
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('remote-view-status')).toHaveTextContent(/Hata|error/i),
    );
    expect(screen.queryByTestId('remote-view-frame')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-viewonly')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-recording-off')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-attended')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed on partial metadata and never sends a render acknowledgement', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ status: 204, ok: true } as Response);
      return Promise.resolve(sse.response);
    });
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
      afterPaint: (callback) => callback(),
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY"}\n\n',
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('remote-view-status')).toHaveTextContent(/Hata|error/i),
    );
    expect(screen.queryByTestId('remote-view-frame')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-viewonly')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsafe viewer id before rendering or acknowledgement', async () => {
    const sse = controllableSse();
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ status: 204, ok: true } as Response);
      return Promise.resolve(sse.response);
    });
    renderAt('/endpoint-admin/remote-access/sessions/sess-1/view?streamId=op-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenResolver: () => 'tkn',
      afterPaint: (callback) => callback(),
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"../bad"}\n\n',
      );
      sse.push(
        'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":101,"dataB64":"NO"}\n\n',
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('remote-view-status')).toHaveTextContent(/Hata|error/i),
    );
    expect(screen.queryByTestId('remote-view-frame')).toBeNull();
    expect(screen.queryByTestId('remote-view-badge-viewonly')).toBeNull();
    expect(screen.queryByTestId('remote-view-no-input-note')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('clears the previous frame when the stream target changes (no stale-frame leak)', async () => {
    const sseA = controllableSse();
    const sseB = controllableSse(); // sess-B stays live but never pushes a frame
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(url.includes('sess-A') ? sseA.response : sseB.response),
      );
    render(<NavHarness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await act(async () => {
      sseA.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-A"}\n\n',
      );
      sseA.push(
        'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":101,"dataB64":"AAA"}\n\n',
      );
    });
    expect(await screen.findByTestId('remote-view-frame')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-to-b'));
    });
    // The sess-A screen frame must NOT remain visible under the new sess-B target.
    await waitFor(() => expect(screen.queryByTestId('remote-view-frame')).toBeNull());
    expect(screen.queryByTestId('remote-view-badge-viewonly')).toBeNull();
    sseA.end();
    sseB.end();
  });

  it('ignores a late frame from a superseded stream after a target change (generation guard)', async () => {
    const sseA = controllableSse();
    const sseB = controllableSse();
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(url.includes('sess-A') ? sseA.response : sseB.response),
      );
    render(<NavHarness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await act(async () => {
      sseA.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY","viewerId":"vw-A"}\n\n',
      );
      sseA.push(
        'event: frame\ndata: {"seq":1,"contentType":"image/png","observedAtEpochMillis":100,"sentAtEpochMillis":101,"dataB64":"AAA"}\n\n',
      );
    });
    await screen.findByTestId('remote-view-frame');

    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-to-b'));
    });
    await waitFor(() => expect(screen.queryByTestId('remote-view-frame')).toBeNull());

    // A late frame delivered on the OLD (superseded) sess-A stream must not repaint sess-B.
    await act(async () => {
      sseA.push(
        'event: frame\ndata: {"seq":2,"contentType":"image/png","observedAtEpochMillis":110,"sentAtEpochMillis":111,"dataB64":"BBB"}\n\n',
      );
    });
    await flush();
    expect(screen.queryByTestId('remote-view-frame')).toBeNull();
    sseA.end();
    sseB.end();
  });
});
