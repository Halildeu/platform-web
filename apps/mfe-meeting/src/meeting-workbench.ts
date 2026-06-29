export type MeetingStatus = 'live' | 'ready' | 'processing' | 'blocked';
export type TranscriptSegmentStatus = 'draft' | 'stabilizing' | 'final' | 'revised';
export type TranscriptFeedState = 'live' | 'recorded' | 'demo' | 'blocked';
export type GateState = 'pass' | 'pending' | 'blocked';

export interface TranscriptSegment {
  id: string;
  speaker: string;
  startedAtMs: number;
  status: TranscriptSegmentStatus;
  text: string;
}

export interface MeetingDecision {
  id: string;
  label: string;
  owner: string;
}

export interface MeetingAction {
  id: string;
  label: string;
  owner: string;
  due: string;
  state: 'open' | 'waiting' | 'done';
}

export interface MeetingGate {
  id: string;
  label: string;
  state: GateState;
}

export interface TranscriptFeed {
  state: TranscriptFeedState;
  label: string;
  detail: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  organizer: string;
  startsAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  language: string;
  source: 'desktop' | 'web' | 'calendar';
  transcriptFeed: TranscriptFeed;
  transcript: TranscriptSegment[];
  summary: string;
  decisions: MeetingDecision[];
  actions: MeetingAction[];
  gates: MeetingGate[];
}

export interface MeetingStats {
  total: number;
  live: number;
  blocked: number;
  openActions: number;
}

export const meetings: MeetingRecord[] = [
  {
    id: 'mtg-f24-weekly',
    title: 'Faz 24 haftalık ürün durumu',
    organizer: 'Platform ekibi',
    startsAt: '2026-06-29T08:30:00+03:00',
    durationMinutes: 38,
    status: 'live',
    language: 'tr',
    source: 'desktop',
    transcriptFeed: {
      state: 'recorded',
      label: 'Recorder kanıtı',
      detail:
        'Desktop recorder lifecycle kanıtı var; gerçek Direct-STT stream kapısı hâlâ blokeli.',
    },
    transcript: [
      {
        id: 'seg-1',
        speaker: 'Ürün',
        startedAtMs: 0,
        status: 'final',
        text: 'Desktop recorder lifecycle kanıtı ürün yüzeyinde görünür hale getiriliyor.',
      },
      {
        id: 'seg-2',
        speaker: 'Platform',
        startedAtMs: 34_000,
        status: 'stabilizing',
        text: 'Direct-STT Gate 1 unblock olduğunda gerçek transcript stream adapter aynı ekrana bağlanacak.',
      },
      {
        id: 'seg-3',
        speaker: 'AI',
        startedAtMs: 71_000,
        status: 'draft',
        text: 'Aksiyonlar ve kararlar toplantı sonunda kaynaklı biçimde ayrıştırılacak.',
      },
    ],
    summary:
      'Recorder yüzeyi ürünleşti; sıradaki görünür boşluk web meeting workbench ve gerçek transcript stream bağlantısı.',
    decisions: [
      {
        id: 'dec-1',
        label: 'Web ürün yüzeyi acceptance hattından bağımsız paralel ilerleyecek.',
        owner: 'Platform',
      },
    ],
    actions: [
      {
        id: 'act-1',
        label: 'mfe-meeting shell route entegrasyonunu ayrı düşük riskli PR ile bağla.',
        owner: 'Frontend',
        due: '2026-06-30',
        state: 'open',
      },
      {
        id: 'act-2',
        label: 'Direct-STT transcript stream adapter kontratını backend ile eşleştir.',
        owner: 'AI/Backend',
        due: '2026-07-01',
        state: 'waiting',
      },
    ],
    gates: [
      { id: 'gate-capture', label: 'Desktop capture', state: 'pass' },
      { id: 'gate-transcript', label: 'Direct-STT stream', state: 'blocked' },
      { id: 'gate-export', label: 'Export policy', state: 'pending' },
    ],
  },
  {
    id: 'mtg-direct-stt',
    title: 'Direct-STT mTLS unblock',
    organizer: 'AI platform',
    startsAt: '2026-06-29T10:00:00+03:00',
    durationMinutes: 24,
    status: 'blocked',
    language: 'tr',
    source: 'calendar',
    transcriptFeed: {
      state: 'blocked',
      label: 'Direct-STT bekliyor',
      detail:
        'audio-gateway-direct-stt-mtls Secret henüz oluşmadığı için gerçek transcript stream kapalı.',
    },
    transcript: [],
    summary:
      'Runtime Secret beklenen mTLS key adlarını henüz üretmediği için gerçek transcript akışı bekliyor.',
    decisions: [],
    actions: [
      {
        id: 'act-3',
        label: 'Vault/ESO seed reconciliation tamamlanınca Direct-STT Gate 1 tekrar koşulacak.',
        owner: 'Ops',
        due: '2026-06-30',
        state: 'waiting',
      },
    ],
    gates: [
      { id: 'gate-secret', label: 'mTLS Secret', state: 'blocked' },
      { id: 'gate-leak', label: 'Artifact leak scan', state: 'pass' },
      { id: 'gate-transcribe', label: '/transcribe proof', state: 'pending' },
    ],
  },
  {
    id: 'mtg-demo-readout',
    title: 'Müşteri demo hazırlığı',
    organizer: 'Customer success',
    startsAt: '2026-06-29T14:00:00+03:00',
    durationMinutes: 45,
    status: 'ready',
    language: 'tr',
    source: 'web',
    transcriptFeed: {
      state: 'demo',
      label: 'Demo veri',
      detail: 'Demo workbench verisi; gerçek canlı stream acceptance yerine geçmez.',
    },
    transcript: [
      {
        id: 'seg-4',
        speaker: 'Ayşe',
        startedAtMs: 0,
        status: 'final',
        text: 'Demo akışında kayıt, transkript ve aksiyon paneli tek çalışma alanında gösterilecek.',
      },
    ],
    summary: 'Demo senaryosu web workbench üzerinden tek ekranla anlatılacak.',
    decisions: [
      {
        id: 'dec-2',
        label: 'Demo ekranı önce web/desktop eşliğinde, mobil daha sonra.',
        owner: 'Product',
      },
    ],
    actions: [
      {
        id: 'act-4',
        label: 'Demo için empty/block/live state ekran görüntülerini hazırla.',
        owner: 'Product',
        due: '2026-06-30',
        state: 'open',
      },
    ],
    gates: [
      { id: 'gate-ui', label: 'Web workbench', state: 'pending' },
      { id: 'gate-auth', label: 'Meeting auth', state: 'pending' },
    ],
  },
];

const STATUS_RANK: Record<TranscriptSegmentStatus, number> = {
  draft: 0,
  stabilizing: 1,
  final: 2,
  revised: 3,
};

export function statusLabel(status: MeetingStatus): string {
  switch (status) {
    case 'live':
      return 'Canlı';
    case 'ready':
      return 'Hazır';
    case 'processing':
      return 'İşleniyor';
    case 'blocked':
      return 'Blokeli';
  }
}

export function segmentStatusLabel(status: TranscriptSegmentStatus): string {
  switch (status) {
    case 'draft':
      return 'Taslak';
    case 'stabilizing':
      return 'Netleşiyor';
    case 'final':
      return 'Final';
    case 'revised':
      return 'Revize';
  }
}

export function gateStateLabel(state: GateState): string {
  switch (state) {
    case 'pass':
      return 'Geçti';
    case 'pending':
      return 'Bekliyor';
    case 'blocked':
      return 'Blokeli';
  }
}

export function sourceLabel(source: MeetingRecord['source']): string {
  switch (source) {
    case 'desktop':
      return 'Desktop';
    case 'web':
      return 'Web';
    case 'calendar':
      return 'Takvim';
  }
}

export function orderTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return [...segments].sort((a, b) => {
    const time = a.startedAtMs - b.startedAtMs;
    if (time !== 0) return time;
    const rank = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (rank !== 0) return rank;
    return a.id.localeCompare(b.id);
  });
}

export function computeStats(records: MeetingRecord[]): MeetingStats {
  return records.reduce<MeetingStats>(
    (acc, meeting) => ({
      total: acc.total + 1,
      live: acc.live + (meeting.status === 'live' ? 1 : 0),
      blocked: acc.blocked + (meeting.status === 'blocked' ? 1 : 0),
      openActions:
        acc.openActions + meeting.actions.filter((action) => action.state !== 'done').length,
    }),
    { total: 0, live: 0, blocked: 0, openActions: 0 },
  );
}

export function filterMeetings(
  records: MeetingRecord[],
  args: { query: string; status: MeetingStatus | 'all' },
): MeetingRecord[] {
  const query = args.query.trim().toLocaleLowerCase('tr-TR');
  return records.filter((meeting) => {
    const matchesStatus = args.status === 'all' || meeting.status === args.status;
    const matchesQuery =
      query.length === 0 ||
      [meeting.title, meeting.organizer, meeting.summary, meeting.id]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(query);
    return matchesStatus && matchesQuery;
  });
}

export function findSelectedMeeting(
  records: MeetingRecord[],
  selectedId: string,
): MeetingRecord | null {
  return records.find((meeting) => meeting.id === selectedId) ?? records[0] ?? null;
}
