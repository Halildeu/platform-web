import {
  meetings,
  orderTranscriptSegments,
  type EvidenceCitation,
  type MeetingDetailStatus,
  type MeetingIntelligenceState,
  type MeetingRecord,
} from './meeting-workbench';
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

export interface LoadMeetingByIdOptions {
  services?: MeetingShellServices;
  meetingsEndpoint?: string;
}

export interface LoadMeetingDetailOptions extends LoadMeetingByIdOptions {
  transcriptsEndpoint?: string;
}

export interface CanonicalMeetingIntelligenceCitation {
  claim: string;
  sourceIndex: number;
  sourceText: string;
  similarity: number;
  grounded: boolean;
  status: string;
  reason: string;
  startSec: number | null;
  sourceCharStart: number;
  sourceCharEnd: number;
}

export interface CanonicalMeetingIntelligenceActionItem {
  text: string;
  owner: string | null;
  dueDate: string | null;
}

export interface CanonicalMeetingIntelligenceResult {
  analysisRunId: string;
  meetingId: string;
  sessionId: string | null;
  schemaVersion: string;
  model: string | null;
  backend: string | null;
  promptVersion: string | null;
  summary: string;
  summaryGroundingStatus: string | null;
  summaryCitations: CanonicalMeetingIntelligenceCitation[];
  decisions: string[];
  actionItems: CanonicalMeetingIntelligenceActionItem[];
  citations: CanonicalMeetingIntelligenceCitation[];
  rejectedClaimCount: number;
  ungroundedCount: number;
  redacted: boolean;
  redactionCount: number;
  generatedAt: string;
  supersedesAnalysisRunId: string | null;
  persisted: true;
  storageMode: 'canonical';
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

const readNullableString = (record: UnknownRecord, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

const readNumber = (record: UnknownRecord, key: string, fallback = 0): number => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const requiredString = (record: UnknownRecord, key: string): string => {
  const value = readString(record, key).trim();
  if (!value) throw new Error(`invalid-intelligence-result:${key}`);
  return value;
};

const requiredArray = (record: UnknownRecord, key: string): unknown[] => {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`invalid-intelligence-result:${key}`);
  return value;
};

const requiredBoolean = (record: UnknownRecord, key: string): boolean => {
  const value = record[key];
  if (typeof value !== 'boolean') throw new Error(`invalid-intelligence-result:${key}`);
  return value;
};

const requiredNonNegativeInteger = (record: UnknownRecord, key: string): number => {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid-intelligence-result:${key}`);
  }
  return value;
};

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
    case 'CANCELLED':
      return 'blocked';
    case 'COMPLETED':
    default:
      return 'processing';
  }
}

function unavailablePolicyActions(): MeetingRecord['policyActions'] {
  return [
    {
      kind: 'export',
      state: 'blocked',
      label: 'Dışa aktar',
      detail: 'Canonical export endpointi bu web yüzeyine bağlı değil.',
      requirement: 'Export endpoint + authorization + audit',
      auditTag: 'MEETING_EXPORT_UNAVAILABLE',
    },
    {
      kind: 'share',
      state: 'blocked',
      label: 'Paylaş',
      detail: 'Canonical paylaşım endpointi bu web yüzeyine bağlı değil.',
      requirement: 'Share endpoint + recipient authorization + audit',
      auditTag: 'MEETING_SHARE_UNAVAILABLE',
    },
    {
      kind: 'delete',
      state: 'blocked',
      label: 'Sil',
      detail: 'Canonical silme endpointi bu web yüzeyine bağlı değil.',
      requirement: 'Delete endpoint + retention guard + audit',
      auditTag: 'MEETING_DELETE_UNAVAILABLE',
    },
  ];
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
      label: 'Canonical sonuç bekliyor',
      detail: 'Seçildiğinde kalıcı Meeting Intelligence sonucu doğrulanır.',
    },
    intelligence: {
      state: 'pending',
      persisted: false,
      redacted: false,
      redactionCount: 0,
      rejectedClaimCount: 0,
      ungroundedCount: 0,
    },
    transcriptFeed: {
      state: status === 'live' ? 'live' : status === 'blocked' ? 'blocked' : 'recorded',
      label: 'Canonical kayıt',
      detail: 'Final transcript doğrulaması bekleniyor.',
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
      { id: 'canonical-result', label: 'Canonical sonuç', state: 'pending' },
      { id: 'canonical-transcript', label: 'Final transcript', state: 'pending' },
      { id: 'grounded-summary', label: 'Kaynaklı çıktılar', state: 'pending' },
    ],
    policyActions: unavailablePolicyActions(),
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

function errorCodeOf(error: unknown): string {
  if (!isRecord(error)) return '';
  const response = isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : null;
  return data ? readString(data, 'error').trim().toUpperCase() : '';
}

function isUnauthorized(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

export function describeMeetingDetailError(error: unknown): MeetingDetailStatus {
  const status = statusOf(error);
  const code = errorCodeOf(error);
  const errorName = error instanceof Error ? error.name : '';

  if (isUnauthorized(error) || errorName === 'MeetingUnauthenticatedError') {
    return {
      state: 'denied',
      label: 'Toplantı içeriği gösterilemiyor',
      detail: 'Bu toplantı için görüntüleme yetkisi doğrulanamadı; içerik gösterilmedi.',
    };
  }
  if (code === 'ANALYSIS_RESULT_NOT_FOUND') {
    return {
      state: 'pending',
      label: 'Canonical sonuç işleniyor',
      detail: 'Toplantı kaydı mevcut; kalıcı Meeting Intelligence sonucu henüz hazır değil.',
    };
  }
  if (code.includes('RETENTION') || code.includes('LEGAL_HOLD') || status === 423) {
    return {
      state: 'retention-blocked',
      label: 'Sonuç saklama politikasıyla kısıtlı',
      detail: 'Retention veya legal hold durumu nedeniyle içerik gösterilmedi.',
    };
  }
  if (code.includes('DELETED') || status === 410) {
    return {
      state: 'deleted',
      label: 'Toplantı artık mevcut değil',
      detail: 'Silinen toplantının transcript ve intelligence içeriği gösterilmedi.',
    };
  }
  if (code.includes('REVOKED')) {
    return {
      state: 'revoked',
      label: 'Toplantı erişimi kaldırıldı',
      detail: 'Erişim kaldırıldığı için transcript ve intelligence içeriği gösterilmedi.',
    };
  }
  if (code === 'MEETING_NOT_FOUND' || status === 404) {
    return {
      state: 'revoked',
      label: 'Toplantı kullanılamıyor',
      detail: 'Toplantı silinmiş veya erişim kaldırılmış olabilir; içerik gösterilmedi.',
    };
  }
  if (code === 'ANALYSIS_RESULT_INVALID' || status === 400 || status === 422) {
    return {
      state: 'failed',
      label: 'Canonical sonuç doğrulanamadı',
      detail: 'Sonuç sözleşmesi veya kanıt alanları doğrulamayı geçmedi; içerik gösterilmedi.',
    };
  }
  if (status === null || [408, 425, 429, 502, 503, 504].includes(status)) {
    return {
      state: 'retryable',
      label: 'Canonical sonuç geçici olarak alınamıyor',
      detail: 'Bağlantı geçici olarak kullanılamıyor; daha sonra yeniden deneyin.',
    };
  }
  return {
    state: 'failed',
    label: 'Canonical sonuç alınamadı',
    detail: 'Sonuç okunamadı; doğrulanmamış içerik gösterilmedi.',
  };
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

export async function loadMeetingById(
  meetingId: string,
  options: LoadMeetingByIdOptions = {},
): Promise<MeetingRecord> {
  const services = await resolveServices(options.services);
  const base = (options.meetingsEndpoint ?? CANONICAL_MEETINGS_ENDPOINT).split('?')[0];
  const response = await services.http.get<unknown>(`${base}/${encodeURIComponent(meetingId)}`, {
    headers: { Accept: 'application/json' },
  });
  const meeting = mapCanonicalMeeting(response.data);
  if (meeting.id !== meetingId) throw new Error('meeting-id-mismatch');
  return meeting;
}

function mapTranscript(payload: unknown): MeetingRecord['transcript'] {
  if (!isRecord(payload)) return [];
  return readArray(payload.content).flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = readString(value, 'id');
    const rawStatus = readString(value, 'status').toUpperCase();
    const finalText = readString(value, 'textFinal');
    const draftText = readString(value, 'textDraft');
    const text = rawStatus === 'REDACTED' ? '[İçerik redakte edildi]' : finalText || draftText;
    if (!id || !text.trim()) return [];
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
        text,
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
  sessionId: string,
  transcriptsEndpoint: string,
): Promise<TranscriptLoadResult> {
  const endpoint = `${transcriptsEndpoint.split('?')[0]}?sessionId=${encodeURIComponent(sessionId)}`;
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

function parseCitation(value: unknown): CanonicalMeetingIntelligenceCitation {
  if (!isRecord(value)) throw new Error('invalid-intelligence-result:citation');
  const sourceIndex = requiredNonNegativeInteger(value, 'source_index');
  const sourceCharStart = requiredNonNegativeInteger(value, 'source_char_start');
  const sourceCharEnd = requiredNonNegativeInteger(value, 'source_char_end');
  const similarity = readNumber(value, 'similarity', Number.NaN);
  const grounded = value.grounded;
  const startSecValue = value.start_sec;
  const startSec =
    startSecValue === null || startSecValue === undefined
      ? null
      : typeof startSecValue === 'number' && Number.isFinite(startSecValue) && startSecValue >= 0
        ? startSecValue
        : Number.NaN;
  if (
    !Number.isFinite(similarity) ||
    similarity < 0 ||
    similarity > 1 ||
    typeof grounded !== 'boolean' ||
    Number.isNaN(startSec) ||
    sourceCharEnd <= sourceCharStart
  ) {
    throw new Error('invalid-intelligence-result:citation');
  }
  return {
    claim: requiredString(value, 'claim'),
    sourceIndex,
    sourceText: requiredString(value, 'source_text'),
    similarity,
    grounded,
    status: requiredString(value, 'status'),
    reason: readString(value, 'reason'),
    startSec,
    sourceCharStart,
    sourceCharEnd,
  };
}

export function normalizeCanonicalIntelligenceResult(
  payload: unknown,
  expectedMeetingId: string,
): CanonicalMeetingIntelligenceResult {
  if (!isRecord(payload)) throw new Error('invalid-intelligence-result');
  const meetingId = requiredString(payload, 'meetingId');
  const persisted = requiredBoolean(payload, 'persisted');
  const storageMode = requiredString(payload, 'storageMode');
  const generatedAt = requiredString(payload, 'generatedAt');
  if (
    meetingId !== expectedMeetingId ||
    persisted !== true ||
    storageMode !== 'canonical' ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw new Error('invalid-intelligence-result:provenance');
  }

  const decisions = requiredArray(payload, 'decisions').map((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('invalid-intelligence-result:decisions');
    }
    return value.trim();
  });
  const actionItems = requiredArray(payload, 'action_items').map((value) => {
    if (!isRecord(value)) throw new Error('invalid-intelligence-result:action_items');
    return {
      text: requiredString(value, 'text'),
      owner: readNullableString(value, 'owner'),
      dueDate: readNullableString(value, 'due_date'),
    };
  });

  return {
    analysisRunId: requiredString(payload, 'analysisRunId'),
    meetingId,
    sessionId: readNullableString(payload, 'sessionId'),
    schemaVersion: requiredString(payload, 'schema_version'),
    model: readNullableString(payload, 'model'),
    backend: readNullableString(payload, 'backend'),
    promptVersion: readNullableString(payload, 'promptVersion'),
    summary: readString(payload, 'summary'),
    summaryGroundingStatus: readNullableString(payload, 'summary_grounding_status'),
    summaryCitations: requiredArray(payload, 'summary_citations').map(parseCitation),
    decisions,
    actionItems,
    citations: requiredArray(payload, 'citations').map(parseCitation),
    rejectedClaimCount: requiredArray(payload, 'rejected_claims').length,
    ungroundedCount: requiredNonNegativeInteger(payload, 'ungrounded_count'),
    redacted: requiredBoolean(payload, 'redacted'),
    redactionCount: requiredNonNegativeInteger(payload, 'redaction_count'),
    generatedAt,
    supersedesAnalysisRunId: readNullableString(payload, 'supersedesAnalysisRunId'),
    persisted: true,
    storageMode: 'canonical',
  };
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function resolveCitation(
  citation: CanonicalMeetingIntelligenceCitation,
  transcript: MeetingRecord['transcript'],
): EvidenceCitation | null {
  if (!citation.grounded || citation.status !== 'PASSED') return null;
  const segment = orderTranscriptSegments(transcript)[citation.sourceIndex];
  if (!segment || segment.status !== 'final') return null;
  if (normalizedText(segment.text) !== normalizedText(citation.sourceText)) return null;
  if (citation.startSec !== null && Math.abs(segment.startedAtMs - citation.startSec * 1000) > 10) {
    return null;
  }
  if (citation.sourceCharEnd > citation.sourceText.length) return null;
  const quote = citation.sourceText.slice(citation.sourceCharStart, citation.sourceCharEnd).trim();
  if (!quote) return null;
  return {
    segmentId: segment.id,
    quote,
    confidence:
      citation.similarity >= 0.85 ? 'high' : citation.similarity >= 0.7 ? 'medium' : 'low',
  };
}

function citationsForClaim(
  claim: string,
  citations: CanonicalMeetingIntelligenceCitation[],
  transcript: MeetingRecord['transcript'],
): EvidenceCitation[] {
  const normalizedClaim = normalizedText(claim);
  return citations.flatMap((citation) => {
    if (normalizedText(citation.claim) !== normalizedClaim) return [];
    const resolved = resolveCitation(citation, transcript);
    return resolved ? [resolved] : [];
  });
}

function confidenceOf(citations: CanonicalMeetingIntelligenceCitation[]): number {
  if (citations.length === 0) return 0;
  return citations.reduce((sum, citation) => sum + citation.similarity, 0) / citations.length;
}

function failureRecord(
  meeting: MeetingRecord,
  detail: MeetingDetailStatus,
  transcript: MeetingRecord['transcript'],
  transcriptComplete: boolean,
): MeetingRecord {
  const hideContent = ['denied', 'revoked', 'deleted', 'retention-blocked'].includes(detail.state);
  const visibleTranscript = hideContent ? [] : transcript;
  const intelligenceState = detail.state as MeetingIntelligenceState;
  return {
    ...meeting,
    status:
      detail.state === 'pending' || detail.state === 'retryable'
        ? meeting.status === 'live'
          ? 'live'
          : 'processing'
        : detail.state === 'failed'
          ? 'blocked'
          : hideContent
            ? 'blocked'
            : meeting.status,
    detail,
    intelligence: {
      state: intelligenceState,
      persisted: false,
      redacted: false,
      redactionCount: 0,
      rejectedClaimCount: 0,
      ungroundedCount: 0,
    },
    transcriptFeed: {
      state: visibleTranscript.length > 0 ? 'recorded' : 'blocked',
      label: visibleTranscript.length > 0 ? 'Canonical transkript' : 'Transkript gösterilemiyor',
      detail:
        visibleTranscript.length > 0
          ? `${visibleTranscript.length} segment okundu${transcriptComplete ? '' : '; devamı doğrulanmadı'}.`
          : 'Görünür final transcript segmenti yok.',
    },
    transcript: visibleTranscript,
    summary: hideContent
      ? { text: 'İçerik gösterilmedi.', citations: [], confidence: 0, kind: 'pending' }
      : meeting.summary,
    decisions: [],
    actions: [],
    gates: [
      {
        id: 'canonical-meeting',
        label: 'Canonical meeting',
        state: hideContent ? 'blocked' : 'pass',
      },
      {
        id: 'canonical-result',
        label: 'Canonical sonuç',
        state: detail.state === 'pending' || detail.state === 'retryable' ? 'pending' : 'blocked',
      },
      {
        id: 'canonical-transcript',
        label: 'Final transcript',
        state:
          visibleTranscript.length > 0 && transcriptComplete
            ? 'pass'
            : visibleTranscript.length > 0
              ? 'pending'
              : 'blocked',
      },
      { id: 'grounded-summary', label: 'Kaynaklı çıktılar', state: 'blocked' },
    ],
  };
}

function mapCanonicalResult(
  meeting: MeetingRecord,
  result: CanonicalMeetingIntelligenceResult,
  transcript: MeetingRecord['transcript'],
  transcriptComplete: boolean,
): MeetingRecord {
  const summaryCanBeGrounded = result.summaryGroundingStatus?.toLowerCase() === 'verified';
  const summaryRawCitations = summaryCanBeGrounded ? result.summaryCitations : [];
  const summaryCitations = citationsForClaim(result.summary, summaryRawCitations, transcript);
  const summaryText = result.summary.trim();
  const decisions = result.decisions.map((decision, index) => {
    const rawCitations = result.citations.filter(
      (citation) => normalizedText(citation.claim) === normalizedText(decision),
    );
    return {
      id: `${result.analysisRunId}-decision-${index}`,
      label: decision,
      owner: 'Meeting Intelligence',
      citations: citationsForClaim(decision, rawCitations, transcript),
      confidence: confidenceOf(rawCitations),
    };
  });
  const actions = result.actionItems.map((action, index) => {
    const rawCitations = result.citations.filter(
      (citation) => normalizedText(citation.claim) === normalizedText(action.text),
    );
    return {
      id: `${result.analysisRunId}-action-${index}`,
      label: action.text,
      owner: action.owner ?? 'Atanmamış',
      due: action.dueDate?.slice(0, 10) || '-',
      state: 'open' as const,
      citations: citationsForClaim(action.text, rawCitations, transcript),
      confidence: confidenceOf(rawCitations),
    };
  });
  const outputCitations = [
    summaryCitations,
    ...decisions.map((item) => item.citations),
    ...actions.map((item) => item.citations),
  ];
  const outputCount = (summaryText ? 1 : 0) + decisions.length + actions.length;
  const groundedOutputCount = outputCitations.filter((citations) => citations.length > 0).length;
  const missingGroundingCount = Math.max(0, outputCount - groundedOutputCount);

  return {
    ...meeting,
    status: 'ready',
    detail: {
      state: 'ready',
      label: 'Canonical sonuç hazır',
      detail:
        outputCount === 0
          ? 'Kalıcı sonuç hazır; üretilmiş özet, karar veya aksiyon yok.'
          : missingGroundingCount > 0
            ? `Kalıcı sonuç hazır; ${missingGroundingCount} çıktı final transcript citation'ı olmadan kaynaklı sayılmıyor.`
            : 'Kalıcı sonuç ve tüm çıktı citation bağları final transcript segmentleriyle doğrulandı.',
    },
    intelligence: {
      state: 'ready',
      analysisRunId: result.analysisRunId,
      generatedAt: result.generatedAt,
      schemaVersion: result.schemaVersion,
      model: result.model ?? undefined,
      persisted: result.persisted,
      storageMode: result.storageMode,
      redacted: result.redacted,
      redactionCount: result.redactionCount,
      rejectedClaimCount: result.rejectedClaimCount,
      ungroundedCount: result.ungroundedCount,
    },
    transcriptFeed: {
      state: transcript.length > 0 ? 'recorded' : 'blocked',
      label: transcript.length > 0 ? 'Canonical final transkript' : 'Final transkript bulunamadı',
      detail:
        transcript.length > 0
          ? `${transcript.length} segment okundu${transcriptComplete ? '' : '; sayfa sınırı nedeniyle devamı doğrulanmadı'}.`
          : 'Canonical sonuç hazır; doğrulanabilir final transcript segmenti yok.',
    },
    transcript,
    summary: {
      text: summaryText || 'Canonical özet üretilmedi.',
      citations: summaryCitations,
      confidence: confidenceOf(summaryRawCitations),
      kind: summaryText ? 'ai-summary' : 'pending',
    },
    decisions,
    actions,
    gates: [
      { id: 'canonical-meeting', label: 'Canonical meeting', state: 'pass' },
      { id: 'canonical-result', label: 'Canonical sonuç', state: 'pass' },
      {
        id: 'canonical-transcript',
        label: 'Final transcript',
        state:
          transcript.length > 0 && transcriptComplete
            ? 'pass'
            : transcript.length > 0
              ? 'pending'
              : 'blocked',
      },
      {
        id: 'grounded-summary',
        label: 'Kaynaklı çıktılar',
        state:
          outputCount > 0 && missingGroundingCount === 0
            ? 'pass'
            : outputCount > 0
              ? 'pending'
              : 'blocked',
      },
    ],
  };
}

export async function loadMeetingDetail(
  meeting: MeetingRecord,
  options: LoadMeetingDetailOptions = {},
): Promise<MeetingRecord> {
  let services: MeetingShellServices;
  try {
    services = await resolveServices(options.services);
  } catch (error) {
    return failureRecord(meeting, describeMeetingDetailError(error), [], false);
  }

  const meetingBase = (options.meetingsEndpoint ?? CANONICAL_MEETINGS_ENDPOINT).split('?')[0];
  const transcriptsEndpoint = options.transcriptsEndpoint ?? CANONICAL_TRANSCRIPTS_ENDPOINT;
  const meetingId = encodeURIComponent(meeting.id);
  let resultResponse: { data: unknown };
  try {
    resultResponse = await services.http.get<unknown>(
      `${meetingBase}/${meetingId}/intelligence/result`,
      {
        headers: { Accept: 'application/json' },
      },
    );
  } catch (error) {
    return failureRecord(meeting, describeMeetingDetailError(error), [], false);
  }

  let result: CanonicalMeetingIntelligenceResult;
  try {
    result = normalizeCanonicalIntelligenceResult(resultResponse.data, meeting.id);
  } catch {
    return failureRecord(
      meeting,
      {
        state: 'failed',
        label: 'Canonical sonuç doğrulanamadı',
        detail: 'Yanıt canonical result sözleşmesini geçmedi; içerik gösterilmedi.',
      },
      [],
      false,
    );
  }

  if (!result.sessionId) {
    return mapCanonicalResult(meeting, result, [], false);
  }

  try {
    const transcriptResponse = await loadTranscriptPages(
      services,
      result.sessionId,
      transcriptsEndpoint,
    );
    return mapCanonicalResult(
      meeting,
      result,
      mapTranscript(transcriptResponse.payload),
      transcriptResponse.complete,
    );
  } catch {
    return mapCanonicalResult(meeting, result, [], false);
  }
}
