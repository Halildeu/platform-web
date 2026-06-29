import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Mic,
  Radio,
  Search,
  Share2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import './styles.css';
import {
  computeStats,
  filterMeetings,
  findSelectedMeeting,
  gateStateLabel,
  meetings,
  orderTranscriptSegments,
  segmentStatusLabel,
  sourceLabel,
  statusLabel,
  type MeetingRecord,
  type MeetingStatus,
} from './meeting-workbench';

const statusFilters: Array<{ value: MeetingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'live', label: 'Canlı' },
  { value: 'ready', label: 'Hazır' },
  { value: 'processing', label: 'İşleniyor' },
  { value: 'blocked', label: 'Blokeli' },
];

function formatStart(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatOffset(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function MeetingListItem({
  meeting,
  selected,
  onSelect,
}: {
  meeting: MeetingRecord;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`meeting-list-item ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(meeting.id)}
      aria-pressed={selected}
    >
      <span className={`meeting-status-dot status-${meeting.status}`} aria-hidden="true" />
      <span className="meeting-list-copy">
        <strong>{meeting.title}</strong>
        <span>
          {formatStart(meeting.startsAt)} · {meeting.durationMinutes} dk · {meeting.organizer}
        </span>
      </span>
      <span className={`status-chip status-${meeting.status}`}>{statusLabel(meeting.status)}</span>
    </button>
  );
}

function TranscriptTimeline({ meeting }: { meeting: MeetingRecord }) {
  const segments = orderTranscriptSegments(meeting.transcript);
  if (segments.length === 0) {
    return (
      <>
        <div className={`feed-banner feed-${meeting.transcriptFeed.state}`}>
          <strong>{meeting.transcriptFeed.label}</strong>
          <span>{meeting.transcriptFeed.detail}</span>
        </div>
        <div className="empty-transcript">
          <ShieldAlert size={22} aria-hidden="true" />
          <strong>Transkript akışı bekleniyor</strong>
          <span>{meeting.summary}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`feed-banner feed-${meeting.transcriptFeed.state}`}>
        <strong>{meeting.transcriptFeed.label}</strong>
        <span>{meeting.transcriptFeed.detail}</span>
      </div>
      <div className="transcript-timeline" aria-label="Transkript zaman çizgisi">
        {segments.map((segment) => (
          <article className={`transcript-row segment-${segment.status}`} key={segment.id}>
            <div className="segment-meta">
              <span>{formatOffset(segment.startedAtMs)}</span>
              <span>{segment.speaker}</span>
              <span>{segmentStatusLabel(segment.status)}</span>
            </div>
            <p>{segment.text}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function InsightPanel({ meeting }: { meeting: MeetingRecord }) {
  return (
    <section className="insight-panel" aria-label="Toplantı çıktıları">
      <div className="summary-block">
        <h3>Özet</h3>
        <p>{meeting.summary}</p>
      </div>

      <div className="output-grid">
        <section aria-labelledby="decisions-title">
          <h3 id="decisions-title">Kararlar</h3>
          {meeting.decisions.length > 0 ? (
            <ul className="output-list">
              {meeting.decisions.map((decision) => (
                <li key={decision.id}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{decision.label}</span>
                  <em>{decision.owner}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet-copy">Karar kaydı yok.</p>
          )}
        </section>

        <section aria-labelledby="actions-title">
          <h3 id="actions-title">Aksiyonlar</h3>
          {meeting.actions.length > 0 ? (
            <ul className="output-list">
              {meeting.actions.map((action) => (
                <li key={action.id}>
                  <Clock3 size={16} aria-hidden="true" />
                  <span>{action.label}</span>
                  <em>
                    {action.owner} · {action.due}
                  </em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet-copy">Aksiyon kaydı yok.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="gates-title">
        <h3 id="gates-title">Kontroller</h3>
        <div className="gate-strip">
          {meeting.gates.map((gate) => (
            <span className={`gate-chip gate-${gate.state}`} key={gate.id}>
              {gate.label}: {gateStateLabel(gate.state)}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}

export default function MeetingApp() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState(meetings[0]?.id ?? '');

  const filteredMeetings = useMemo(
    () => filterMeetings(meetings, { query, status: statusFilter }),
    [query, statusFilter],
  );
  const selectedMeeting = findSelectedMeeting(
    filteredMeetings.length > 0 ? filteredMeetings : meetings,
    selectedId,
  );
  const stats = computeStats(meetings);

  return (
    <main className="meeting-app">
      <header className="meeting-header">
        <div>
          <span className="eyebrow">Faz 24</span>
          <h1>Meeting Intelligence</h1>
        </div>
        <div className="action-row" aria-label="Toplantı aksiyonları">
          <button type="button" disabled aria-label="Paylaş">
            <Share2 size={16} aria-hidden="true" />
            Paylaş
          </button>
          <button type="button" disabled aria-label="Dışa aktar">
            <Download size={16} aria-hidden="true" />
            Dışa aktar
          </button>
          <button type="button" disabled aria-label="Sil">
            <Trash2 size={16} aria-hidden="true" />
            Sil
          </button>
        </div>
      </header>

      <section className="metric-strip" aria-label="Meeting Intelligence metrikleri">
        <div>
          <Radio size={18} aria-hidden="true" />
          <span>Aktif</span>
          <strong>{stats.live}</strong>
        </div>
        <div>
          <FileText size={18} aria-hidden="true" />
          <span>Toplantı</span>
          <strong>{stats.total}</strong>
        </div>
        <div>
          <Clock3 size={18} aria-hidden="true" />
          <span>Aksiyon</span>
          <strong>{stats.openActions}</strong>
        </div>
        <div>
          <ShieldAlert size={18} aria-hidden="true" />
          <span>Blokeli</span>
          <strong>{stats.blocked}</strong>
        </div>
      </section>

      <section className="meeting-workbench">
        <aside className="meeting-sidebar" aria-label="Toplantılar">
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Toplantı ara"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Toplantı ara"
            />
          </div>
          <div className="filter-row" aria-label="Durum filtresi">
            {statusFilters.map((filter) => (
              <button
                type="button"
                key={filter.value}
                className={statusFilter === filter.value ? 'active' : ''}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="meeting-list">
            {filteredMeetings.map((meeting) => (
              <MeetingListItem
                key={meeting.id}
                meeting={meeting}
                selected={meeting.id === selectedMeeting?.id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </aside>

        {selectedMeeting ? (
          <section className="meeting-detail" aria-label="Seçili toplantı">
            <div className="detail-header">
              <div>
                <div className="detail-meta">
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{formatStart(selectedMeeting.startsAt)}</span>
                  <Mic size={16} aria-hidden="true" />
                  <span>{sourceLabel(selectedMeeting.source)}</span>
                </div>
                <h2>{selectedMeeting.title}</h2>
              </div>
              <span className={`status-chip status-${selectedMeeting.status}`}>
                {statusLabel(selectedMeeting.status)}
              </span>
            </div>

            <div className="detail-grid">
              <section className="transcript-panel" aria-labelledby="transcript-title">
                <div className="panel-title-row">
                  <h3 id="transcript-title">
                    {selectedMeeting.transcriptFeed.state === 'live'
                      ? 'Canlı Transkript'
                      : 'Transkript'}
                  </h3>
                  <span>{selectedMeeting.language.toUpperCase()}</span>
                </div>
                <TranscriptTimeline meeting={selectedMeeting} />
              </section>
              <InsightPanel meeting={selectedMeeting} />
            </div>
          </section>
        ) : (
          <section className="meeting-detail empty-selection">
            <strong>Toplantı bulunamadı.</strong>
          </section>
        )}
      </section>
    </main>
  );
}
