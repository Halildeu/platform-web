import type { TranscriptSegment } from './meeting-workbench';
import { wsStreamEventToTranscriptSegment, type WsStreamEvent } from './ws-stream-events';

const DEFAULT_LIVE_STREAM_ENDPOINT_ENV = 'VITE_MEETING_LIVE_STREAM_WS_URL';

export type LiveStreamConnectionState =
  | 'not-configured'
  | 'connecting'
  | 'ready'
  | 'receiving'
  | 'closed'
  | 'error'
  | 'contract-error';

export interface MeetingLiveStreamSnapshot {
  state: LiveStreamConnectionState;
  label: string;
  detail: string;
  endpoint?: string;
  sampleRate?: number;
  liveModel?: string;
  finalModel?: string;
  lastEvent?: WsStreamEvent['type'];
  error?: string;
  segments: TranscriptSegment[];
}

export function resolveMeetingLiveStreamEndpoint(meetingId: string): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const configured = env[DEFAULT_LIVE_STREAM_ENDPOINT_ENV]?.trim();
  if (!configured) {
    return null;
  }
  return configured.replace('{meetingId}', encodeURIComponent(meetingId));
}

export function displayLiveStreamEndpoint(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'Yapılandırılmış endpoint';
  }
}

export function createLiveStreamSnapshot(
  state: LiveStreamConnectionState,
  endpoint?: string,
  detail?: string,
): MeetingLiveStreamSnapshot {
  switch (state) {
    case 'not-configured':
      return {
        state,
        label: 'Stream kapalı',
        detail: detail ?? 'Live stream endpoint tanımlı değil; demo/API transkript gösteriliyor.',
        segments: [],
      };
    case 'connecting':
      return {
        state,
        label: 'Stream bağlanıyor',
        detail: detail ?? 'Canlı transcript endpointi açılıyor; event gelmeden canlı kabul yok.',
        endpoint,
        segments: [],
      };
    case 'ready':
      return {
        state,
        label: 'Stream hazır',
        detail: detail ?? 'Endpoint hazır; transcript eventleri bekleniyor.',
        endpoint,
        segments: [],
      };
    case 'receiving':
      return {
        state,
        label: 'Stream alınıyor',
        detail: detail ?? 'Canlı transcript eventleri sözleşme doğrulamasıyla işleniyor.',
        endpoint,
        segments: [],
      };
    case 'closed':
      return {
        state,
        label: 'Stream kapandı',
        detail: detail ?? 'Canlı stream kapandı; son güvenilir transcript parçaları korunuyor.',
        endpoint,
        segments: [],
      };
    case 'error':
      return {
        state,
        label: 'Stream hatası',
        detail: detail ?? 'Canlı stream bağlantısı kurulamadı.',
        endpoint,
        segments: [],
      };
    case 'contract-error':
      return {
        state,
        label: 'Sözleşme hatası',
        detail: detail ?? 'Canlı stream event sözleşmesi uyuşmadı; event render edilmedi.',
        endpoint,
        segments: [],
      };
  }
}

function upsertSegment(
  segments: TranscriptSegment[],
  segment: TranscriptSegment,
): TranscriptSegment[] {
  const withoutReplaced = segments.filter((item) => {
    if (item.id === segment.id) return false;
    if (segment.id.startsWith('ws-final-')) {
      return item.id !== segment.id.replace('ws-final-', 'ws-partial-');
    }
    return true;
  });
  return [...withoutReplaced, segment];
}

export function reduceLiveStreamEvent(
  snapshot: MeetingLiveStreamSnapshot,
  event: WsStreamEvent,
): MeetingLiveStreamSnapshot {
  if (event.type === 'ready') {
    return {
      ...snapshot,
      state: 'ready',
      label: 'Stream hazır',
      detail: 'Endpoint hazır; transcript eventleri bekleniyor.',
      sampleRate: event.sample_rate,
      liveModel: event.live_model,
      finalModel: event.final_model,
      lastEvent: event.type,
    };
  }

  if (event.type === 'error') {
    return {
      ...snapshot,
      state: 'error',
      label: 'Stream hatası',
      detail: event.msg,
      error: event.msg,
      lastEvent: event.type,
    };
  }

  const segment = wsStreamEventToTranscriptSegment(event);
  if (!segment) {
    return {
      ...snapshot,
      lastEvent: event.type,
    };
  }

  return {
    ...snapshot,
    state: 'receiving',
    label: 'Stream alınıyor',
    detail: 'Canlı transcript eventleri sözleşme doğrulamasıyla işleniyor.',
    lastEvent: event.type,
    segments: upsertSegment(snapshot.segments, segment),
  };
}
