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

    // Locale-agnostic (the jsdom env may resolve to tr or en): match both.
    expect(screen.getByTestId('remote-view-badge-viewonly')).toHaveTextContent(
      /YALNIZ İZLEME|VIEW-ONLY/,
    );
    // recording-OFF defaults on (fail-safe) and stays on after the meta event.
    expect(screen.getByTestId('remote-view-badge-recording-off')).toBeInTheDocument();
    expect(screen.getByTestId('remote-view-no-input-note').textContent).toMatch(
      /iletilmez|not forwarded/,
    );

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      sse.push(
        'event: meta\ndata: {"recording":false,"attended":true,"capability":"VIEW_ONLY"}\n\n',
      );
      sse.push('event: frame\ndata: {"seq":1,"contentType":"image/png","dataB64":"iVBOR"}\n\n');
    });
    await flush();

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
      sseA.push('event: frame\ndata: {"seq":1,"contentType":"image/png","dataB64":"AAA"}\n\n');
    });
    expect(await screen.findByTestId('remote-view-frame')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-to-b'));
    });
    // The sess-A screen frame must NOT remain visible under the new sess-B target.
    await waitFor(() => expect(screen.queryByTestId('remote-view-frame')).toBeNull());
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
      sseA.push('event: frame\ndata: {"seq":1,"contentType":"image/png","dataB64":"AAA"}\n\n');
    });
    await screen.findByTestId('remote-view-frame');

    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-to-b'));
    });
    await waitFor(() => expect(screen.queryByTestId('remote-view-frame')).toBeNull());

    // A late frame delivered on the OLD (superseded) sess-A stream must not repaint sess-B.
    await act(async () => {
      sseA.push('event: frame\ndata: {"seq":2,"contentType":"image/png","dataB64":"BBB"}\n\n');
    });
    await flush();
    expect(screen.queryByTestId('remote-view-frame')).toBeNull();
    sseA.end();
    sseB.end();
  });
});
