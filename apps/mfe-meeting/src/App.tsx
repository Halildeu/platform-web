import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Link2,
  Mic,
  Radio,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import './styles.css';
import {
  createDemoWorkbenchData,
  loadMeetingWorkbenchData,
  type MeetingWorkbenchData,
} from './meeting-api';
import {
  computeStats,
  confidenceLabel,
  filterMeetings,
  findSelectedMeeting,
  gateStateLabel,
  getPolicyAction,
  orderTranscriptSegments,
  policyActionLabel,
  policyActionStateLabel,
  segmentStatusLabel,
  sourceLabel,
  statusLabel,
  type EvidenceCitation,
  type MeetingPolicyActionKind,
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

export interface MeetingAppProps {
  loadWorkbench?: () => Promise<MeetingWorkbenchData>;
}

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

function DataSourceBanner({
  data,
  loading,
  onReload,
}: {
  data: MeetingWorkbenchData;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <section className={`source-banner source-${data.source.mode}`} aria-label="Veri kaynağı">
      <div>
        <AlertCircle size={18} aria-hidden="true" />
        <span>
          <strong>{loading ? 'Veri kaynağı kontrol ediliyor' : data.source.label}</strong>
          <small>{data.source.detail}</small>
        </span>
      </div>
      <button type="button" onClick={onReload} disabled={loading} aria-label="Veriyi yenile">
        <RefreshCw size={16} aria-hidden="true" />
        Yenile
      </button>
    </section>
  );
}

function CitationTrail({
  meeting,
  citations,
  confidence,
}: {
  meeting: MeetingRecord;
  citations: EvidenceCitation[];
  confidence: number;
}) {
  if (citations.length === 0) {
    return (
      <div className="citation-trail">
        <span className="confidence-chip confidence-low">
          {confidenceLabel(confidence)} güven · kaynak bekliyor
        </span>
      </div>
    );
  }

  return (
    <div className="citation-trail" aria-label="Kaynaklar">
      <span className={`confidence-chip confidence-${confidence >= 0.85 ? 'high' : 'medium'}`}>
        {confidenceLabel(confidence)} güven
      </span>
      {citations.map((citation) => {
        const segment = meeting.transcript.find((item) => item.id === citation.segmentId);
        const label = segment
          ? `${formatOffset(segment.startedAtMs)} · ${segment.speaker}`
          : citation.segmentId;
        return (
          <a
            href={`#segment-${citation.segmentId}`}
            key={`${citation.segmentId}-${citation.quote}`}
          >
            <Link2 size={13} aria-hidden="true" />
            {label}
          </a>
        );
      })}
    </div>
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
          <span>{meeting.summary.text}</span>
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
          <article
            className={`transcript-row segment-${segment.status}`}
            id={`segment-${segment.id}`}
            key={segment.id}
          >
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
        <p>{meeting.summary.text}</p>
        <CitationTrail
          meeting={meeting}
          citations={meeting.summary.citations}
          confidence={meeting.summary.confidence}
        />
      </div>

      <div className="output-grid">
        <section aria-labelledby="decisions-title">
          <h3 id="decisions-title">Kararlar</h3>
          {meeting.decisions.length > 0 ? (
            <ul className="output-list">
              {meeting.decisions.map((decision) => (
                <li key={decision.id}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span className="output-copy">
                    <span>{decision.label}</span>
                    <em>{decision.owner}</em>
                    <CitationTrail
                      meeting={meeting}
                      citations={decision.citations}
                      confidence={decision.confidence}
                    />
                  </span>
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
                  <span className="output-copy">
                    <span>{action.label}</span>
                    <em>
                      {action.owner} · {action.due}
                    </em>
                    <CitationTrail
                      meeting={meeting}
                      citations={action.citations}
                      confidence={action.confidence}
                    />
                  </span>
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

function ActionPolicyPanel({
  meeting,
  selectedAction,
  onSelectAction,
  onClose,
}: {
  meeting: MeetingRecord;
  selectedAction: MeetingPolicyActionKind;
  onSelectAction: (kind: MeetingPolicyActionKind) => void;
  onClose: () => void;
}) {
  const policyAction = getPolicyAction(meeting, selectedAction);

  return (
    <section className="action-policy-panel" aria-label={`${policyAction.label} politika durumu`}>
      <div className="policy-panel-header">
        <div>
          <span className={`policy-state policy-${policyAction.state}`}>
            {policyActionStateLabel(policyAction.state)}
          </span>
          <h3>{policyAction.label} politikası</h3>
        </div>
        <button type="button" className="policy-close-button" onClick={onClose}>
          Kapat
        </button>
      </div>

      <div className="policy-action-tabs" aria-label="Aksiyon türü">
        {(['export', 'share', 'delete'] as MeetingPolicyActionKind[]).map((kind) => (
          <button
            type="button"
            key={kind}
            className={`policy-tab ${selectedAction === kind ? 'active' : ''}`}
            onClick={() => onSelectAction(kind)}
          >
            {policyActionLabel(kind)}
          </button>
        ))}
      </div>

      <div className="policy-body">
        <p>{policyAction.detail}</p>
        <dl>
          <div>
            <dt>Gereken kapı</dt>
            <dd>{policyAction.requirement}</dd>
          </div>
          <div>
            <dt>Audit olayı</dt>
            <dd>{policyAction.auditTag}</dd>
          </div>
        </dl>
        <button type="button" className="policy-disabled-action" disabled>
          Runtime mutasyon kapalı
        </button>
      </div>
    </section>
  );
}

export default function MeetingApp({
  loadWorkbench = loadMeetingWorkbenchData,
}: MeetingAppProps = {}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all');
  const [workbench, setWorkbench] = useState<MeetingWorkbenchData>(() => createDemoWorkbenchData());
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState(workbench.records[0]?.id ?? '');
  const [selectedPolicyAction, setSelectedPolicyAction] = useState<MeetingPolicyActionKind | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadWorkbench()
      .then((data) => {
        if (!cancelled) {
          setWorkbench(data);
          setSelectedPolicyAction(null);
          setSelectedId((current) => {
            if (data.records.some((meeting) => meeting.id === current)) return current;
            return data.records[0]?.id ?? '';
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadWorkbench, reloadToken]);

  const filteredMeetings = useMemo(
    () => filterMeetings(workbench.records, { query, status: statusFilter }),
    [query, statusFilter, workbench.records],
  );
  const selectedMeeting = findSelectedMeeting(
    filteredMeetings.length > 0 ? filteredMeetings : workbench.records,
    selectedId,
  );
  const stats = computeStats(workbench.records);
  const handleSelectMeeting = (meetingId: string) => {
    setSelectedId(meetingId);
    setSelectedPolicyAction(null);
  };

  return (
    <main className="meeting-app">
      <header className="meeting-header">
        <div>
          <span className="eyebrow">Faz 24</span>
          <h1>Meeting Intelligence</h1>
        </div>
        <div className="action-row" aria-label="Toplantı aksiyonları">
          <button
            type="button"
            disabled={!selectedMeeting}
            aria-label="Paylaş"
            onClick={() => setSelectedPolicyAction('share')}
          >
            <Share2 size={16} aria-hidden="true" />
            Paylaş
          </button>
          <button
            type="button"
            disabled={!selectedMeeting}
            aria-label="Dışa aktar"
            onClick={() => setSelectedPolicyAction('export')}
          >
            <Download size={16} aria-hidden="true" />
            Dışa aktar
          </button>
          <button
            type="button"
            disabled={!selectedMeeting}
            aria-label="Sil"
            onClick={() => setSelectedPolicyAction('delete')}
          >
            <Trash2 size={16} aria-hidden="true" />
            Sil
          </button>
        </div>
      </header>

      <DataSourceBanner
        data={workbench}
        loading={isLoading}
        onReload={() => setReloadToken((value) => value + 1)}
      />

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
          <Link2 size={18} aria-hidden="true" />
          <span>Kaynaklı</span>
          <strong>{stats.sourcedOutputs}</strong>
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
                onSelect={handleSelectMeeting}
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

            {selectedPolicyAction ? (
              <ActionPolicyPanel
                meeting={selectedMeeting}
                selectedAction={selectedPolicyAction}
                onSelectAction={setSelectedPolicyAction}
                onClose={() => setSelectedPolicyAction(null)}
              />
            ) : null}

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
