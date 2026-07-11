import { meetings, type MeetingRecord } from './meeting-workbench';
import { getShellServices, type MeetingShellServices } from './shell-services';

export type WorkbenchSourceMode =
  | 'loading'
  | 'demo'
  | 'api'
  | 'empty'
  | 'unauthorized'
  | 'api-error';

export interface WorkbenchDataSource {
  mode: WorkbenchSourceMode;
  label: string;
  detail: string;
  checkedAt: string;
  endpoint?: string;
}

export interface MeetingWorkbenchData {
  records: MeetingRecord[];
  source: WorkbenchDataSource;
}

export interface LoadMeetingWorkbenchOptions {
  endpoint?: string | null;
  services?: MeetingShellServices;
}

export interface LoadMeetingDetailOptions {
  services?: MeetingShellServices;
  meetingsEndpoint?: string;
}

type UnknownRecord = Record<string, unknown>;

const CANONICAL_MEETINGS_ENDPOINT = '/v1/admin/meetings';
const CANONICAL_TRANSCRIPTS_ENDPOINT = '/v1/admin/transcripts';
const PAGE_SIZE = 50;
const TRANSCRIPT_PAGE_SIZE = 200;
const MAX_TRANSCRIPT_PAGES = 10;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (record: UnknownRecord, key: string, fallback = ''): string => {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
};

const readNumber = (record: UnknownRecord, key: string, fallback = 0): number => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const checkedNow = () => new Date().toISOString();

export function resolveMeetingWorkbenchEndpoint(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_MEETING_DATA_MODE?.trim().toLowerCase() === 'demo') return null;
  return env.VITE_MEETING_WORKBENCH_API_URL?.trim() || CANONICAL_MEETINGS_ENDPOINT;
}

export function createPendingWorkbenchData(checkedAt = checkedNow()): MeetingWorkbenchData {
  return {
    records: [],
    source: {
      mode: 'loading',
      label: 'Toplantılar yükleniyor',
      detail: 'Canonical meeting-service bağlantısı hazırlanıyor.',
      checkedAt,
    },
  };
}

export function createDemoWorkbenchData(checkedAt = checkedNow()): MeetingWorkbenchData {
  return {
    records: meetings,
    source: {
      mode: 'demo',
      label: 'Demo veri',
      detail: 'Demo modu açık; bu kayıtlar canlı acceptance kanıtı değildir.',
      checkedAt,
    },
  };
}

function durationMinutes(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 60_000);
}

function mapMeetingStatus(status: string): MeetingRecord['status'] {
  switch (status.toUpperCase()) {
    case 'IN_PROGRESS':
      return 'live';
    case 'COMPLETED':
      return 'ready';
    case 'CANCELLED':
      return 'blocked';
    default:
      return 'processing';
  }
}

function mapCanonicalMeeting(value: unknown): MeetingRecord {
  if (!isRecord(value)) throw new Error('invalid-meeting-record');
  const id = readString(value, 'id');
  const title = readString(value, 'title');
  if (!id || !title) throw new Error('invalid-meeting-record');

  const startsAt =
    readString(value, 'scheduledStart') || readString(value, 'createdAt') || checkedNow();
  const endsAt = readString(value, 'scheduledEnd');
  const status = mapMeetingStatus(readString(value, 'status'));
  const description = readString(value, 'description');

  return {
    id,
    title,
    organizer: readString(value, 'organizerSubject', 'Organizatör bilgisi yok'),
    startsAt,
    durationMinutes: durationMinutes(startsAt, endsAt),
    status,
    language: 'tr',
    source: 'calendar',
    detail: {
      state: 'idle',
      label: 'Detay bekliyor',
      detail: 'Seçildiğinde canonical transkript, aksiyon ve karar kayıtları yüklenir.',
    },
    transcriptFeed: {
      state: status === 'live' ? 'live' : status === 'blocked' ? 'blocked' : 'recorded',
      label: 'Canonical kayıt',
      detail: 'Transcript-service detay yüklemesi bekleniyor.',
    },
    transcript: [],
    summary: {
      text: description || 'Toplantı açıklaması girilmemiş.',
      citations: [],
      confidence: 0,
      kind: 'canonical-description',
    },
    decisions: [],
    actions: [],
    gates: [
      { id: 'canonical-meeting', label: 'Canonical meeting', state: 'pass' },
      { id: 'canonical-detail', label: 'Canonical detay', state: 'pending' },
      { id: 'grounded-summary', label: 'Kaynaklı özet', state: 'pending' },
    ],
    policyActions: [
      {
        kind: 'export',
        state: 'pending',
        label: 'Dışa aktar',
        detail: 'Transcript ve export policy doğrulanmadan mutasyon üretilmez.',
        requirement: 'Transcript read + export policy + audit sink',
        auditTag: 'MEETING_EXPORT_REQUESTED',
      },
      {
        kind: 'share',
        state: 'pending',
        label: 'Paylaş',
        detail: 'Alıcı yetkisi ve paylaşım politikası doğrulanmadan link üretilmez.',
        requirement: 'Recipient authorization + share audit + link TTL',
        auditTag: 'MEETING_SHARE_REQUESTED',
      },
      {
        kind: 'delete',
        state: 'blocked',
        label: 'Sil',
        detail: 'Retention ve dual-control doğrulanmadan silme mutasyonu üretilmez.',
        requirement: 'Retention decision + dual-control + delete audit',
        auditTag: 'MEETING_DELETE_REQUESTED',
      },
    ],
  };
}

export function normalizeWorkbenchPayload(payload: unknown): MeetingRecord[] {
  const raw = isRecord(payload) && Array.isArray(payload.content) ? payload.content : null;
  if (!raw) throw new Error('invalid-meeting-page');
  return raw.map(mapCanonicalMeeting);
}

function statusOf(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const response = isRecord(error.response) ? error.response : null;
  return response ? readNumber(response, 'status', 0) || null : null;
}

function isUnauthorized(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

async function resolveServices(services?: MeetingShellServices): Promise<MeetingShellServices> {
  const resolved = services ?? getShellServices();
  const ready = await resolved.auth.ready();
  if (!ready.ok) {
    const error = new Error(ready.error || ready.reason);
    error.name =
      ready.reason === 'unauthenticated' ? 'MeetingUnauthenticatedError' : 'MeetingAuthError';
    throw error;
  }
  return resolved;
}

export async function loadMeetingWorkbenchData(
  options: LoadMeetingWorkbenchOptions = {},
): Promise<MeetingWorkbenchData> {
  const endpoint =
    options.endpoint === undefined ? resolveMeetingWorkbenchEndpoint() : options.endpoint?.trim();
  if (!endpoint) return createDemoWorkbenchData();

  const checkedAt = checkedNow();
  const listEndpoint = endpoint.includes('?') ? endpoint : `${endpoint}?page=0&size=${PAGE_SIZE}`;
  try {
    const services = await resolveServices(options.services);
    const response = await services.http.get<unknown>(listEndpoint, {
      headers: { Accept: 'application/json' },
    });
    const records = normalizeWorkbenchPayload(response.data);
    return {
      records,
      source: {
        mode: records.length === 0 ? 'empty' : 'api',
        label: records.length === 0 ? 'Toplantı bulunamadı' : 'Canonical meeting-service',
        detail:
          records.length === 0
            ? 'Bu organizasyon için görünür toplantı kaydı yok.'
            : 'Toplantı listesi canonical meeting-service üzerinden okundu.',
        endpoint,
        checkedAt,
      },
    };
  } catch (error) {
    const unauthorized =
      isUnauthorized(error) ||
      (error instanceof Error && error.name === 'MeetingUnauthenticatedError');
    return {
      records: [],
      source: {
        mode: unauthorized ? 'unauthorized' : 'api-error',
        label: unauthorized ? 'Toplantı yetkisi gerekli' : 'Meeting-service kullanılamıyor',
        detail: unauthorized
          ? 'Oturum veya MEETING görüntüleme yetkisi doğrulanamadı; demo veriye geçilmedi.'
          : 'Canonical toplantı listesi alınamadı; demo veriye geçilmedi.',
        endpoint,
        checkedAt,
      },
    };
  }
}

function mapTranscript(payload: unknown): MeetingRecord['transcript'] {
  if (!isRecord(payload)) return [];
  return readArray(payload.content).flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = readString(value, 'id');
    if (!id) return [];
    const rawStatus = readString(value, 'status').toUpperCase();
    const finalText = readString(value, 'textFinal');
    const draftText = readString(value, 'textDraft');
    return [
      {
        id,
        speaker: readString(value, 'speakerId', 'Konuşmacı'),
        startedAtMs: Math.max(0, readNumber(value, 'startTime') * 1000),
        status:
          rawStatus === 'FINALIZED'
            ? ('final' as const)
            : rawStatus === 'REDACTED'
              ? ('revised' as const)
              : ('draft' as const),
        text: rawStatus === 'REDACTED' ? '[İçerik redakte edildi]' : finalText || draftText,
      },
    ];
  });
}

function mapActions(payload: unknown): MeetingRecord['actions'] {
  return readArray(payload).flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = readString(value, 'id');
    if (!id) return [];
    const status = readString(value, 'status').toUpperCase();
    return [
      {
        id,
        label: readString(value, 'description'),
        owner: readString(value, 'assigneeSubject', 'Atanmamış'),
        due: readString(value, 'dueAt').slice(0, 10) || '-',
        state:
          status === 'DONE' || status === 'CANCELLED'
            ? ('done' as const)
            : status === 'IN_PROGRESS'
              ? ('waiting' as const)
              : ('open' as const),
        citations: [],
        confidence: 0,
      },
    ];
  });
}

function mapDecisions(payload: unknown): MeetingRecord['decisions'] {
  return readArray(payload).flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = readString(value, 'id');
    if (!id) return [];
    const title = readString(value, 'title');
    const detail = readString(value, 'detail');
    return [
      {
        id,
        label: detail ? `${title}: ${detail}` : title,
        owner: readString(value, 'decidedBySubject', 'Karar sahibi belirtilmedi'),
        citations: [],
        confidence: 0,
      },
    ];
  });
}

interface TranscriptLoadResult {
  payload: UnknownRecord;
  complete: boolean;
}

async function loadTranscriptPages(
  services: MeetingShellServices,
  meetingId: string,
): Promise<TranscriptLoadResult> {
  const endpoint = `${CANONICAL_TRANSCRIPTS_ENDPOINT}?meetingId=${meetingId}`;
  const first = await services.http.get<unknown>(`${endpoint}&page=0&size=${TRANSCRIPT_PAGE_SIZE}`);
  if (!isRecord(first.data)) throw new Error('invalid-transcript-page');

  const totalElements = Math.max(0, readNumber(first.data, 'totalElements'));
  const pageSize = Math.max(1, readNumber(first.data, 'size', TRANSCRIPT_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));
  const pagesToRead = Math.min(totalPages, MAX_TRANSCRIPT_PAGES);
  const content = [...readArray(first.data.content)];

  for (let page = 1; page < pagesToRead; page += 1) {
    const response = await services.http.get<unknown>(`${endpoint}&page=${page}&size=${pageSize}`);
    if (!isRecord(response.data)) throw new Error('invalid-transcript-page');
    content.push(...readArray(response.data.content));
  }

  return {
    payload: { ...first.data, content },
    complete: totalPages <= MAX_TRANSCRIPT_PAGES,
  };
}

export async function loadMeetingDetail(
  meeting: MeetingRecord,
  options: LoadMeetingDetailOptions = {},
): Promise<MeetingRecord> {
  const services = await resolveServices(options.services);
  const meetingBase = (options.meetingsEndpoint ?? CANONICAL_MEETINGS_ENDPOINT).split('?')[0];
  const meetingId = encodeURIComponent(meeting.id);
  const requests = [
    services.http.get<unknown>(`${meetingBase}/${meetingId}/sessions`),
    services.http.get<unknown>(`${meetingBase}/${meetingId}/actions`),
    services.http.get<unknown>(`${meetingBase}/${meetingId}/decisions`),
    loadTranscriptPages(services, meetingId),
  ] as const;
  const [sessionsResult, actionsResult, decisionsResult, transcriptResult] =
    await Promise.allSettled(requests);
  const results = [sessionsResult, actionsResult, decisionsResult, transcriptResult];
  const succeeded = results.filter((result) => result.status === 'fulfilled').length;
  const unauthorized = results.some(
    (result) => result.status === 'rejected' && isUnauthorized(result.reason),
  );

  const transcriptComplete =
    transcriptResult.status === 'fulfilled' && transcriptResult.value.complete;
  const transcriptTruncated =
    transcriptResult.status === 'fulfilled' && !transcriptResult.value.complete;
  const state =
    succeeded === results.length && transcriptComplete
      ? ('ready' as const)
      : succeeded > 0
        ? ('partial' as const)
        : unauthorized
          ? ('unauthorized' as const)
          : ('error' as const);
  const transcript =
    transcriptResult.status === 'fulfilled' ? mapTranscript(transcriptResult.value.payload) : [];
  const sessionCount =
    sessionsResult.status === 'fulfilled' ? readArray(sessionsResult.value.data).length : 0;

  return {
    ...meeting,
    detail: {
      state,
      label:
        state === 'ready'
          ? 'Canonical detay hazır'
          : state === 'partial'
            ? 'Detay kısmen hazır'
            : state === 'unauthorized'
              ? 'Detay yetkisi gerekli'
              : 'Detay alınamadı',
      detail:
        state === 'ready'
          ? 'Sessions, transcript, aksiyon ve karar kayıtları canonical servislerden okundu.'
          : state === 'partial'
            ? transcriptTruncated
              ? 'Transcript güvenli sayfa sınırını aştı; yalnız okunan segmentler gösteriliyor.'
              : 'Bazı alt kaynaklar okunamadı; yalnız doğrulanan kayıtlar gösteriliyor.'
            : state === 'unauthorized'
              ? 'MEETING veya TRANSCRIPT görüntüleme yetkisi doğrulanamadı.'
              : 'Canonical alt kaynaklara ulaşılamadı.',
    },
    transcriptFeed: {
      state: meeting.status === 'live' ? 'live' : transcript.length > 0 ? 'recorded' : 'blocked',
      label: transcript.length > 0 ? 'Canonical transkript' : 'Transkript bekleniyor',
      detail:
        transcript.length > 0
          ? `${transcript.length} segment ve ${sessionCount} oturum okundu${transcriptTruncated ? '; devamı yüklenmedi' : ''}.`
          : `${sessionCount} oturum bulundu; görünür transcript segmenti yok.`,
    },
    transcript,
    actions: actionsResult.status === 'fulfilled' ? mapActions(actionsResult.value.data) : [],
    decisions:
      decisionsResult.status === 'fulfilled' ? mapDecisions(decisionsResult.value.data) : [],
    gates: [
      { id: 'canonical-meeting', label: 'Canonical meeting', state: 'pass' },
      {
        id: 'canonical-detail',
        label: 'Canonical detay',
        state: state === 'ready' ? 'pass' : state === 'partial' ? 'pending' : 'blocked',
      },
      {
        id: 'canonical-transcript',
        label: 'Canonical transcript',
        state:
          transcriptResult.status === 'fulfilled'
            ? transcript.length > 0 && transcriptComplete
              ? 'pass'
              : 'pending'
            : 'blocked',
      },
      { id: 'grounded-summary', label: 'Kaynaklı özet', state: 'pending' },
    ],
  };
}
