import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MeetingApp from './App';
import { createDemoWorkbenchData, normalizeWorkbenchPayload } from './meeting-api';
import type { MeetingWorkbenchData } from './meeting-api';
import type { MeetingRecord } from './meeting-workbench';

describe('MeetingApp', () => {
  const loadDemo = async () => createDemoWorkbenchData();

  afterEach(() => window.history.replaceState({}, '', '/'));

  it('renders the meeting workbench with stats, controls, and transcript readiness surface', async () => {
    render(<MeetingApp loadWorkbench={loadDemo} />);

    expect(await screen.findByText('Demo veri')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meeting Intelligence' })).toBeInTheDocument();
    expect(screen.getByLabelText('Veri kaynağı')).toHaveTextContent('Demo veri');
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('Aktif');
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('Kaynaklı');
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('4');
    expect(screen.getByLabelText('Toplantılar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Transkript' })).toBeInTheDocument();
    expect(screen.getByText('Recorder kanıtı')).toBeInTheDocument();
    expect(screen.getByLabelText('Canlı stream durumu')).toHaveTextContent('Stream kapalı');
    expect(
      screen.getByText('Web ürün yüzeyi acceptance hattından bağımsız paralel ilerleyecek.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /00:00 · Ürün/i })).toHaveLength(2);
    expect(screen.getAllByText('Yüksek güven')).not.toHaveLength(0);
  });

  it('filters blocked meetings and keeps empty transcript state honest', async () => {
    render(<MeetingApp loadWorkbench={loadDemo} />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Blokeli' }));

    const meetingList = screen.getByLabelText('Toplantılar');
    expect(within(meetingList).getByText('Direct-STT mTLS unblock')).toBeInTheDocument();
    expect(within(meetingList).queryByText('Faz 24 haftalık ürün durumu')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Faz 24 haftalık ürün durumu' }),
    ).toBeInTheDocument();

    fireEvent.click(within(meetingList).getByRole('button', { name: /Direct-STT mTLS unblock/i }));
    expect(screen.getByText('Direct-STT bekliyor')).toBeInTheDocument();
    expect(screen.getByText('Transkript akışı bekleniyor')).toBeInTheDocument();
    expect(screen.getByText('mTLS Secret: Blokeli')).toBeInTheDocument();
    expect(screen.getAllByText(/kaynak doğrulanmadı/i).length).toBeGreaterThan(0);
  });

  it('searches meetings and selects the demo readout detail', async () => {
    render(<MeetingApp loadWorkbench={loadDemo} />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Toplantı ara'), {
      target: { value: 'müşteri' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Müşteri demo hazırlığı/i }));

    expect(screen.getByRole('heading', { name: 'Müşteri demo hazırlığı' })).toBeInTheDocument();
    expect(
      screen.getByText('Demo senaryosu web workbench üzerinden tek ekranla anlatılacak.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Demo için empty/block/live state ekran görüntülerini hazırla.'),
    ).toBeInTheDocument();
  });

  it('keeps export, share and delete disabled when canonical mutation endpoints are absent', async () => {
    render(<MeetingApp loadWorkbench={loadDemo} />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    const actionRow = screen.getByLabelText('Toplantı aksiyonları');
    expect(within(actionRow).getByRole('button', { name: 'Dışa aktar' })).toBeDisabled();
    expect(within(actionRow).getByRole('button', { name: 'Paylaş' })).toBeDisabled();
    expect(within(actionRow).getByRole('button', { name: 'Sil' })).toBeDisabled();
    expect(within(actionRow).getByRole('button', { name: 'Dışa aktar' })).toHaveAttribute(
      'title',
      'Canonical export endpointi bağlı değil',
    );
  });

  it('writes an explicit meeting selection to the URL and preserves it across filters', async () => {
    render(<MeetingApp loadWorkbench={loadDemo} />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Direct-STT mTLS unblock/i }));
    expect(screen.getByRole('heading', { name: 'Direct-STT mTLS unblock' })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('meetingId')).toBe('mtg-direct-stt');

    fireEvent.click(screen.getByRole('button', { name: 'Hazır' }));
    expect(screen.getByRole('heading', { name: 'Direct-STT mTLS unblock' })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('meetingId')).toBe('mtg-direct-stt');
  });

  it('connects a configured live transcript stream without sending audio', async () => {
    const sockets: Array<{
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onerror: (() => void) | null;
      onclose: (() => void) | null;
      close: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    }> = [];
    const webSocketFactory = vi.fn((endpoint: string) => {
      const socket = {
        endpoint,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        close: vi.fn(),
        send: vi.fn(),
      };
      sockets.push(socket);
      return socket;
    });

    render(
      <MeetingApp
        loadWorkbench={loadDemo}
        resolveLiveStreamEndpoint={() => 'ws://live.example.test/ws/stream?token=redacted'}
        webSocketFactory={webSocketFactory}
      />,
    );
    expect(await screen.findByText('Stream bağlanıyor')).toBeInTheDocument();
    expect(screen.getByLabelText('Canlı stream durumu')).toHaveTextContent(
      'ws://live.example.test/ws/stream',
    );

    act(() => sockets[0]?.onopen?.());
    expect(screen.getByLabelText('Canlı stream durumu')).toHaveTextContent('Stream bağlandı');

    act(() =>
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: 'ready',
          sample_rate: 16000,
          live_model: 'live',
          final_model: 'final',
        }),
      }),
    );
    expect(screen.getByLabelText('Canlı stream durumu')).toHaveTextContent('Stream hazır');

    act(() =>
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: 'partial',
          seq: 4,
          confirmed: 'faz yirmi dört',
          tentative: 'canlı',
          elapsed_ms: 2500,
          rms: 0.22,
          source: 'desktop',
        }),
      }),
    );
    expect(screen.getByText('faz yirmi dört canlı')).toBeInTheDocument();

    act(() =>
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: 'final',
          seq: 4,
          text: 'Faz yirmi dört canlı transcript bağlandı.',
          reason: 'vad-final',
          elapsed_ms: 3200,
          rms: 0.2,
        }),
      }),
    );
    expect(screen.queryByText('faz yirmi dört canlı')).not.toBeInTheDocument();
    expect(screen.getByText('Faz yirmi dört canlı transcript bağlandı.')).toBeInTheDocument();
    expect(sockets[0]?.send).not.toHaveBeenCalled();
  });

  it('ignores stale websocket messages after the selected meeting changes', async () => {
    const sockets: Array<{
      endpoint: string;
      onmessage: ((event: { data: unknown }) => void) | null;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    const webSocketFactory = vi.fn((endpoint: string) => {
      const socket = {
        endpoint,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        close: vi.fn(),
      };
      sockets.push(socket);
      return socket;
    });
    const resolveLiveStreamEndpoint = (meeting: MeetingRecord) =>
      `ws://live.example.test/ws/stream/${meeting.id}`;

    render(
      <MeetingApp
        loadWorkbench={loadDemo}
        resolveLiveStreamEndpoint={resolveLiveStreamEndpoint}
        webSocketFactory={webSocketFactory}
      />,
    );
    expect(await screen.findByText('Stream bağlanıyor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Direct-STT mTLS unblock/i }));

    expect(screen.getByRole('heading', { name: 'Direct-STT mTLS unblock' })).toBeInTheDocument();
    expect(webSocketFactory).toHaveBeenCalledTimes(2);
    expect(sockets[0]?.close).toHaveBeenCalled();

    act(() =>
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: 'final',
          seq: 41,
          text: 'Stale first meeting transcript must be ignored.',
          reason: 'late-final',
          elapsed_ms: 4100,
          rms: 0.2,
        }),
      }),
    );
    expect(
      screen.queryByText('Stale first meeting transcript must be ignored.'),
    ).not.toBeInTheDocument();

    act(() =>
      sockets[1]?.onmessage?.({
        data: JSON.stringify({
          type: 'final',
          seq: 42,
          text: 'Current selected meeting transcript is accepted.',
          reason: 'selected-final',
          elapsed_ms: 4200,
          rms: 0.2,
        }),
      }),
    );
    expect(
      screen.getByText('Current selected meeting transcript is accepted.'),
    ).toBeInTheDocument();
  });

  it('fails closed when the websocket event contract drifts', async () => {
    const sockets: Array<{
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onerror: (() => void) | null;
      onclose: (() => void) | null;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    const webSocketFactory = vi.fn(() => {
      const socket = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        close: vi.fn(),
      };
      sockets.push(socket);
      return socket;
    });

    render(
      <MeetingApp
        loadWorkbench={loadDemo}
        resolveLiveStreamEndpoint={() => 'ws://live.example.test/ws/stream'}
        webSocketFactory={webSocketFactory}
      />,
    );
    expect(await screen.findByText('Stream bağlanıyor')).toBeInTheDocument();

    act(() =>
      sockets[0]?.onmessage?.({
        data: JSON.stringify({ type: 'transcript', text: 'drifted event should not render' }),
      }),
    );

    expect(screen.getByLabelText('Canlı stream durumu')).toHaveTextContent('Sözleşme hatası');
    expect(screen.queryByText('drifted event should not render')).not.toBeInTheDocument();
    expect(sockets[0]?.close).toHaveBeenCalled();
  });

  it('surfaces API fallback as a visible non-acceptance state', async () => {
    const fallback = createDemoWorkbenchData('2026-06-29T00:00:00.000Z');
    fallback.source = {
      mode: 'api-error',
      label: 'API ulaşılamadı',
      detail: 'Canonical veri alınamadı; demo veriye geçilmedi.',
      checkedAt: '2026-06-29T00:00:00.000Z',
      endpoint: '/api/v1/meeting-intelligence/workbench',
    };

    render(<MeetingApp loadWorkbench={async () => fallback} />);

    expect(await screen.findByText('API ulaşılamadı')).toBeInTheDocument();
    expect(screen.getByText(/demo veriye geçilmedi/i)).toBeInTheDocument();
  });

  it('hydrates the selected canonical meeting once and surfaces partial detail', async () => {
    const record = normalizeWorkbenchPayload({
      content: [
        {
          id: '2e5e58c6-1ac8-4d94-a493-48ae85d7207a',
          title: 'Canonical toplantı',
          status: 'COMPLETED',
          scheduledStart: '2026-07-11T08:00:00Z',
          scheduledEnd: '2026-07-11T08:30:00Z',
        },
      ],
    })[0] as MeetingRecord;
    const loadDetail = vi.fn().mockResolvedValue({
      ...record,
      detail: {
        state: 'partial',
        label: 'Detay kısmen hazır',
        detail: 'Transcript yetkisi doğrulanamadı.',
      },
      actions: [
        {
          id: 'action-1',
          label: 'Canonical aksiyon',
          owner: 'user-1',
          due: '2026-07-12',
          state: 'open',
          citations: [],
          confidence: 0,
        },
      ],
    });
    window.history.replaceState({}, '', `/admin/meetings?meetingId=${record.id}`);

    render(
      <MeetingApp
        loadWorkbench={async () => ({
          records: [record],
          source: {
            mode: 'api',
            label: 'Canonical meeting-service',
            detail: 'Canonical liste',
            checkedAt: '2026-07-11T08:00:00Z',
          },
        })}
        loadDetail={loadDetail}
        subscribeAuthChanges={() => () => undefined}
        resolveLiveStreamEndpoint={() => null}
      />,
    );

    expect(await screen.findByText('Detay kısmen hazır')).toBeInTheDocument();
    expect(screen.getByText('Canonical aksiyon')).toBeInTheDocument();
    await waitFor(() => expect(loadDetail).toHaveBeenCalledTimes(1));
  });

  it('reloads the same selected meeting detail when the canonical list stays in api mode', async () => {
    const record = normalizeWorkbenchPayload({
      content: [
        {
          id: 'same-meeting',
          title: 'Aynı seçili toplantı',
          status: 'COMPLETED',
          createdAt: '2026-07-11T08:00:00Z',
        },
      ],
    })[0] as MeetingRecord;
    const workbench = {
      records: [record],
      source: {
        mode: 'api' as const,
        label: 'Canonical meeting-service',
        detail: 'Canonical liste',
        checkedAt: '2026-07-11T08:00:00Z',
      },
    };
    const loadWorkbench = vi.fn().mockResolvedValue(workbench);
    const loadDetail = vi.fn(async (meeting: MeetingRecord) => ({
      ...meeting,
      status: 'ready' as const,
      detail: { state: 'ready' as const, label: 'Canonical sonuç hazır', detail: 'Hazır' },
    }));
    window.history.replaceState({}, '', '/admin/meetings?meetingId=same-meeting');

    render(
      <MeetingApp
        loadWorkbench={loadWorkbench}
        loadDetail={loadDetail}
        subscribeAuthChanges={() => () => undefined}
        resolveLiveStreamEndpoint={() => null}
      />,
    );

    await waitFor(() => expect(loadDetail).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Veriyi yenile' }));
    await waitFor(() => expect(loadDetail).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Aynı seçili toplantı' })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('meetingId')).toBe('same-meeting');
  });

  it('reloads canonical data when the shell auth identity changes', async () => {
    const record = normalizeWorkbenchPayload({
      content: [
        {
          id: '2e5e58c6-1ac8-4d94-a493-48ae85d7207a',
          title: 'Yeni kimlik toplantısı',
          status: 'SCHEDULED',
          createdAt: '2026-07-11T08:00:00Z',
        },
      ],
    })[0] as MeetingRecord;
    const loadWorkbench = vi
      .fn()
      .mockResolvedValueOnce({
        records: [],
        source: {
          mode: 'unauthorized',
          label: 'Toplantı yetkisi gerekli',
          detail: 'Oturum bekleniyor.',
          checkedAt: '2026-07-11T08:00:00Z',
        },
      })
      .mockResolvedValue({
        records: [record],
        source: {
          mode: 'api',
          label: 'Canonical meeting-service',
          detail: 'Canonical liste',
          checkedAt: '2026-07-11T08:01:00Z',
        },
      });
    let authChanged: (() => void) | undefined;
    window.history.replaceState({}, '', `/admin/meetings?meetingId=${record.id}`);

    render(
      <MeetingApp
        loadWorkbench={loadWorkbench}
        loadDetail={async (meeting) => ({
          ...meeting,
          detail: { state: 'ready', label: 'Hazır', detail: 'Hazır' },
        })}
        subscribeAuthChanges={(listener) => {
          authChanged = listener;
          return () => undefined;
        }}
        resolveLiveStreamEndpoint={() => null}
      />,
    );

    expect(await screen.findByText('Toplantı yetkisi gerekli')).toBeInTheDocument();
    act(() => authChanged?.());
    expect(
      await screen.findByRole('heading', { name: 'Yeni kimlik toplantısı' }),
    ).toBeInTheDocument();
    expect(loadWorkbench).toHaveBeenCalledTimes(2);
  });

  it('clears prior meeting content immediately while a changed identity is revalidated', async () => {
    const record = normalizeWorkbenchPayload({
      content: [
        {
          id: 'identity-bound-meeting',
          title: 'Önceki kimliğin toplantısı',
          status: 'COMPLETED',
          createdAt: '2026-07-11T08:00:00Z',
        },
      ],
    })[0] as MeetingRecord;
    let resolveReload: ((value: MeetingWorkbenchData) => void) | undefined;
    const loadWorkbench = vi
      .fn()
      .mockResolvedValueOnce({
        records: [record],
        source: {
          mode: 'api',
          label: 'Canonical meeting-service',
          detail: 'Canonical liste',
          checkedAt: '2026-07-11T08:00:00Z',
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise<MeetingWorkbenchData>((resolve) => {
            resolveReload = resolve;
          }),
      );
    let authChanged: (() => void) | undefined;
    window.history.replaceState({}, '', '/admin/meetings?meetingId=identity-bound-meeting');

    render(
      <MeetingApp
        loadWorkbench={loadWorkbench}
        loadDetail={async (meeting) => ({
          ...meeting,
          status: 'ready',
          detail: { state: 'ready', label: 'Canonical sonuç hazır', detail: 'Hazır' },
          summary: {
            text: 'Önceki kimliğe ait hassas özet.',
            confidence: 0,
            citations: [],
          },
        })}
        subscribeAuthChanges={(listener) => {
          authChanged = listener;
          return () => undefined;
        }}
        resolveLiveStreamEndpoint={() => null}
      />,
    );

    expect(await screen.findAllByText('Önceki kimliğe ait hassas özet.')).toHaveLength(2);
    act(() => authChanged?.());

    expect(screen.queryAllByText('Önceki kimliğe ait hassas özet.')).toHaveLength(0);
    expect(screen.getByText('Yetki yeniden doğrulanıyor')).toBeInTheDocument();
    expect(screen.queryByLabelText('Canlı stream durumu')).not.toBeInTheDocument();

    act(() =>
      resolveReload?.({
        records: [],
        source: {
          mode: 'unauthorized',
          label: 'Toplantı yetkisi gerekli',
          detail: 'Yeni kimlik bu toplantıyı göremiyor.',
          checkedAt: '2026-07-11T08:01:00Z',
        },
      }),
    );
    expect(await screen.findByText('Toplantı yetkisi gerekli')).toBeInTheDocument();
  });

  it('keeps an unavailable deep-link id instead of silently selecting the first meeting', async () => {
    const first = normalizeWorkbenchPayload({
      content: [
        {
          id: 'first-meeting',
          title: 'İlk toplantı',
          status: 'COMPLETED',
          createdAt: '2026-07-11T08:00:00Z',
        },
      ],
    })[0] as MeetingRecord;
    const loadMeeting = vi.fn().mockRejectedValue({
      response: { status: 404, data: { error: 'MEETING_NOT_FOUND' } },
    });
    window.history.replaceState({}, '', '/admin/meetings?meetingId=missing-meeting');

    render(
      <MeetingApp
        loadWorkbench={async () => ({
          records: [first],
          source: {
            mode: 'api',
            label: 'Canonical meeting-service',
            detail: 'Canonical liste',
            checkedAt: '2026-07-11T08:00:00Z',
          },
        })}
        loadMeeting={loadMeeting}
        loadDetail={vi.fn()}
        subscribeAuthChanges={() => () => undefined}
        resolveLiveStreamEndpoint={() => null}
      />,
    );

    expect(await screen.findByText('Toplantı kullanılamıyor')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'İlk toplantı' })).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('meetingId')).toBe('missing-meeting');
    expect(loadMeeting).toHaveBeenCalledWith('missing-meeting');
  });

  it('announces a canonical ready result and exposes citation links only to final segments', async () => {
    const record = normalizeWorkbenchPayload({
      content: [
        {
          id: 'ready-meeting',
          title: 'Hazır canonical toplantı',
          status: 'COMPLETED',
          createdAt: '2026-07-11T08:00:00Z',
        },
      ],
    })[0] as MeetingRecord;
    window.history.replaceState({}, '', '/admin/meetings?meetingId=ready-meeting');

    render(
      <MeetingApp
        loadWorkbench={async () => ({
          records: [record],
          source: {
            mode: 'api',
            label: 'Canonical meeting-service',
            detail: 'Canonical liste',
            checkedAt: '2026-07-11T08:00:00Z',
          },
        })}
        loadDetail={async (meeting) => ({
          ...meeting,
          status: 'ready',
          detail: {
            state: 'ready',
            label: 'Canonical sonuç hazır',
            detail: 'Final citation doğrulandı.',
          },
          intelligence: {
            state: 'ready',
            analysisRunId: 'run-1',
            generatedAt: '2026-07-11T09:00:00Z',
            persisted: true,
            storageMode: 'canonical',
            redacted: false,
            redactionCount: 0,
            rejectedClaimCount: 0,
            ungroundedCount: 0,
          },
          transcript: [
            {
              id: 'segment-final',
              speaker: 'Konuşmacı',
              startedAtMs: 0,
              status: 'final',
              text: 'Doğrulanan final segment.',
            },
          ],
          summary: {
            text: 'Doğrulanmış özet.',
            confidence: 0.95,
            kind: 'ai-summary',
            citations: [
              {
                segmentId: 'segment-final',
                quote: 'Doğrulanan final segment.',
                confidence: 'high',
              },
            ],
          },
        })}
        subscribeAuthChanges={() => () => undefined}
        resolveLiveStreamEndpoint={() => null}
      />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Canonical sonuç hazır');
    expect(screen.getByLabelText('Canonical sonuç kaydı')).toHaveTextContent(
      'Kalıcı canonical sonuç',
    );
    expect(screen.getByRole('link', { name: /00:00 · Konuşmacı/i })).toHaveAttribute(
      'href',
      '#segment-segment-final',
    );
  });

  it('keeps primary regions and disabled actions accessible at a 375px viewport', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));

    render(<MeetingApp loadWorkbench={loadDemo} />);

    expect(await screen.findByRole('heading', { name: 'Meeting Intelligence' })).toBeVisible();
    expect(screen.getByLabelText('Toplantılar')).toBeVisible();
    expect(screen.getByLabelText('Seçili toplantı')).toBeVisible();
    const actions = screen.getByLabelText('Toplantı aksiyonları');
    expect(within(actions).getAllByRole('button')).toHaveLength(3);
    within(actions)
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled());

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    window.dispatchEvent(new Event('resize'));
  });
});
