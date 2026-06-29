import {
  meetings,
  policyActionLabel,
  type MeetingPolicyActionKind,
  type MeetingRecord,
} from './meeting-workbench';

export type WorkbenchSourceMode = 'demo' | 'api' | 'api-fallback';

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
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_ENDPOINT_ENV = 'VITE_MEETING_WORKBENCH_API_URL';
const DEFAULT_TIMEOUT_MS = 5000;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (record: UnknownRecord, key: string, fallback = ''): string => {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
};

const readNumber = (record: UnknownRecord, key: string, fallback: number): number => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const readArray = (record: UnknownRecord, key: string): unknown[] => {
  const value = record[key];
  return Array.isArray(value) ? value : [];
};

const isMeetingStatus = (value: string): value is MeetingRecord['status'] =>
  value === 'live' || value === 'ready' || value === 'processing' || value === 'blocked';

const isSource = (value: string): value is MeetingRecord['source'] =>
  value === 'desktop' || value === 'web' || value === 'calendar';

const isSegmentStatus = (value: string): value is MeetingRecord['transcript'][number]['status'] =>
  value === 'draft' || value === 'stabilizing' || value === 'final' || value === 'revised';

const isFeedState = (value: string): value is MeetingRecord['transcriptFeed']['state'] =>
  value === 'live' || value === 'recorded' || value === 'demo' || value === 'blocked';

const isGateState = (value: string): value is MeetingRecord['gates'][number]['state'] =>
  value === 'pass' || value === 'pending' || value === 'blocked';

const isPolicyActionKind = (
  value: string,
): value is MeetingRecord['policyActions'][number]['kind'] =>
  value === 'export' || value === 'share' || value === 'delete';

const isPolicyActionState = (
  value: string,
): value is MeetingRecord['policyActions'][number]['state'] =>
  value === 'preview' || value === 'pending' || value === 'blocked';

const isActionState = (value: string): value is MeetingRecord['actions'][number]['state'] =>
  value === 'open' || value === 'waiting' || value === 'done';

const policyActionKinds: MeetingPolicyActionKind[] = ['export', 'share', 'delete'];

function createDefaultPolicyAction(
  kind: MeetingPolicyActionKind,
): MeetingRecord['policyActions'][number] {
  switch (kind) {
    case 'export':
      return {
        kind,
        state: 'pending',
        label: policyActionLabel(kind),
        detail: 'Runtime policy bilgisi bekleniyor; mutasyon üretilmez.',
        requirement: 'Export policy + audit sink',
        auditTag: 'MEETING_EXPORT_REQUESTED',
      };
    case 'share':
      return {
        kind,
        state: 'pending',
        label: policyActionLabel(kind),
        detail: 'Runtime policy bilgisi bekleniyor; paylaşım linki üretilmez.',
        requirement: 'Share policy + recipient authorization',
        auditTag: 'MEETING_SHARE_REQUESTED',
      };
    case 'delete':
      return {
        kind,
        state: 'pending',
        label: policyActionLabel(kind),
        detail: 'Runtime policy bilgisi bekleniyor; silme mutasyonu üretilmez.',
        requirement: 'Retention guard + delete audit',
        auditTag: 'MEETING_DELETE_REQUESTED',
      };
  }
}

const createDefaultPolicyActions = (): MeetingRecord['policyActions'] =>
  policyActionKinds.map(createDefaultPolicyAction);

const isCitationConfidence = (
  value: string,
): value is MeetingRecord['summary']['citations'][number]['confidence'] =>
  value === 'high' || value === 'medium' || value === 'low';

export function resolveMeetingWorkbenchEndpoint(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const configured = env[DEFAULT_ENDPOINT_ENV]?.trim();
  return configured && configured.length > 0 ? configured : null;
}

export function createDemoWorkbenchData(
  checkedAt = new Date().toISOString(),
): MeetingWorkbenchData {
  return {
    records: meetings,
    source: {
      mode: 'demo',
      label: 'Demo veri',
      detail:
        'API endpoint tanımlı değil; ekran kaynaklı çıktı ve Direct-STT sınırını demo veriyle gösteriyor.',
      checkedAt,
    },
  };
}

function normalizeCitations(value: unknown): MeetingRecord['summary']['citations'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const segmentId = readString(item, 'segmentId');
    if (!segmentId) return [];
    const confidenceValue = readString(item, 'confidence', 'medium');
    return [
      {
        segmentId,
        quote: readString(item, 'quote'),
        confidence: isCitationConfidence(confidenceValue) ? confidenceValue : 'medium',
      },
    ];
  });
}

function normalizeSourcedOutput(value: unknown): MeetingRecord['summary'] {
  if (typeof value === 'string') {
    return { text: value, citations: [], confidence: 0 };
  }
  if (!isRecord(value)) {
    return { text: '', citations: [], confidence: 0 };
  }
  return {
    text: readString(value, 'text'),
    citations: normalizeCitations(value.citations),
    confidence: Math.max(0, Math.min(1, readNumber(value, 'confidence', 0))),
  };
}

function normalizePolicyActions(value: unknown): MeetingRecord['policyActions'] {
  if (!Array.isArray(value)) {
    return createDefaultPolicyActions();
  }

  const normalized = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const kind = readString(item, 'kind');
    if (!isPolicyActionKind(kind)) return [];
    const state = readString(item, 'state');
    return [
      {
        kind,
        state: isPolicyActionState(state) ? state : 'pending',
        label: readString(item, 'label', policyActionLabel(kind)),
        detail: readString(
          item,
          'detail',
          'Runtime policy bilgisi bekleniyor; mutasyon üretilmez.',
        ),
        requirement: readString(item, 'requirement', 'Policy state + audit sink'),
        auditTag: readString(item, 'auditTag', `MEETING_${kind.toUpperCase()}_REQUESTED`),
      },
    ];
  });

  const presentKinds = new Set(normalized.map((action) => action.kind));
  const missingDefaults = policyActionKinds
    .filter((kind) => !presentKinds.has(kind))
    .map(createDefaultPolicyAction);

  return [...normalized, ...missingDefaults];
}

function normalizeMeeting(value: unknown): MeetingRecord {
  if (!isRecord(value)) {
    throw new Error('invalid-meeting-record');
  }

  const statusValue = readString(value, 'status');
  const sourceValue = readString(value, 'source');
  const feed = isRecord(value.transcriptFeed) ? value.transcriptFeed : {};
  const feedState = readString(feed, 'state');

  return {
    id: readString(value, 'id'),
    title: readString(value, 'title'),
    organizer: readString(value, 'organizer'),
    startsAt: readString(value, 'startsAt'),
    durationMinutes: readNumber(value, 'durationMinutes', 0),
    status: isMeetingStatus(statusValue) ? statusValue : 'processing',
    language: readString(value, 'language', 'tr'),
    source: isSource(sourceValue) ? sourceValue : 'web',
    transcriptFeed: {
      state: isFeedState(feedState) ? feedState : 'demo',
      label: readString(feed, 'label'),
      detail: readString(feed, 'detail'),
    },
    transcript: readArray(value, 'transcript').flatMap((item) => {
      if (!isRecord(item)) return [];
      const segmentStatus = readString(item, 'status');
      const id = readString(item, 'id');
      if (!id) return [];
      return [
        {
          id,
          speaker: readString(item, 'speaker'),
          startedAtMs: readNumber(item, 'startedAtMs', 0),
          status: isSegmentStatus(segmentStatus) ? segmentStatus : 'draft',
          text: readString(item, 'text'),
        },
      ];
    }),
    summary: normalizeSourcedOutput(value.summary),
    decisions: readArray(value, 'decisions').flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item, 'id');
      if (!id) return [];
      return [
        {
          id,
          label: readString(item, 'label'),
          owner: readString(item, 'owner'),
          citations: normalizeCitations(item.citations),
          confidence: Math.max(0, Math.min(1, readNumber(item, 'confidence', 0))),
        },
      ];
    }),
    actions: readArray(value, 'actions').flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item, 'id');
      const actionState = readString(item, 'state');
      if (!id) return [];
      return [
        {
          id,
          label: readString(item, 'label'),
          owner: readString(item, 'owner'),
          due: readString(item, 'due'),
          state: isActionState(actionState) ? actionState : 'open',
          citations: normalizeCitations(item.citations),
          confidence: Math.max(0, Math.min(1, readNumber(item, 'confidence', 0))),
        },
      ];
    }),
    gates: readArray(value, 'gates').flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item, 'id');
      const gateState = readString(item, 'state');
      if (!id) return [];
      return [
        {
          id,
          label: readString(item, 'label'),
          state: isGateState(gateState) ? gateState : 'pending',
        },
      ];
    }),
    policyActions: normalizePolicyActions(value.policyActions),
  };
}

export function normalizeWorkbenchPayload(payload: unknown): MeetingRecord[] {
  const records = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.meetings)
      ? payload.meetings
      : null;

  if (!records) {
    throw new Error('invalid-workbench-payload');
  }

  const normalized = records.map(normalizeMeeting).filter((meeting) => meeting.id && meeting.title);
  if (normalized.length === 0) {
    throw new Error('empty-workbench-payload');
  }
  return normalized;
}

export async function loadMeetingWorkbenchData(
  options: LoadMeetingWorkbenchOptions = {},
): Promise<MeetingWorkbenchData> {
  const endpoint =
    options.endpoint === undefined ? resolveMeetingWorkbenchEndpoint() : options.endpoint?.trim();
  if (!endpoint) {
    return createDemoWorkbenchData();
  }

  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('workbench-api-not-ok');
    }
    return {
      records: normalizeWorkbenchPayload(await response.json()),
      source: {
        mode: 'api',
        label: 'API verisi',
        detail: 'Meeting Intelligence verisi yapılandırılmış workbench endpointinden okundu.',
        endpoint,
        checkedAt,
      },
    };
  } catch {
    return {
      records: meetings,
      source: {
        mode: 'api-fallback',
        label: 'API ulaşılamadı',
        detail:
          'Workbench endpointi okunamadı; ekran demo veriyle devam ediyor ve canlı acceptance iddiası üretmiyor.',
        endpoint,
        checkedAt,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
