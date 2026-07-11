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
  createPendingWorkbenchData,
  loadMeetingDetail,
  loadMeetingWorkbenchData,
  type MeetingWorkbenchData,
} from './meeting-api';
import {
  createLiveStreamSnapshot,
  displayLiveStreamEndpoint,
  reduceLiveStreamEvent,
  resolveMeetingLiveStreamEndpoint,
  type MeetingLiveStreamSnapshot,
} from './meeting-live-stream';
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
import { parseWsStreamEventMessage } from './ws-stream-events';
import { getShellServices } from './shell-services';

const statusFilters: Array<{ value: MeetingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'live', label: 'Canlı' },
  { value: 'ready', label: 'Hazır' },
  { value: 'processing', label: 'İşleniyor' },
  { value: 'blocked', label: 'Blokeli' },
];

export interface MeetingAppProps {
  loadWorkbench?: () => Promise<MeetingWorkbenchData>;
  loadDetail?: (meeting: MeetingRecord) => Promise<MeetingRecord>;
  subscribeAuthChanges?: (listener: () => void) => () => void;
  resolveLiveStreamEndpoint?: (meeting: MeetingRecord) => string | null;
  webSocketFactory?: (endpoint: string) => MeetingWebSocket;
}

interface MeetingWebSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}

const defaultResolveLiveStreamEndpoint = (meeting: MeetingRecord): string | null =>
  resolveMeetingLiveStreamEndpoint(meeting.id);

const defaultSubscribeAuthChanges = (listener: () => void): (() => void) => {
  const subscribe = getShellServices().auth.onTokenChange;
  if (!subscribe) return () => undefined;
  let initialSignal = true;
  return subscribe(() => {
    if (initialSignal) {
      initialSignal = false;
      return;
    }
    listener();
  });
};

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

function LiveStreamStatusPanel({
  snapshot,
  onReconnect,
}: {
  snapshot: MeetingLiveStreamSnapshot;
  onReconnect: () => void;
}) {
  const isConfigured = snapshot.state !== 'not-configured';
  return (
    <section className={`stream-status stream-${snapshot.state}`} aria-label="Canlı stream durumu">
      <div className="stream-status-heading">
        <Radio size={16} aria-hidden="true" />
        <span>
          <strong>{snapshot.label}</strong>
          <small>{snapshot.detail}</small>
        </span>
      </div>
      <dl>
        <div>
          <dt>Uç nokta</dt>
          <dd>
            {snapshot.endpoint ? displayLiveStreamEndpoint(snapshot.endpoint) : 'Tanımlı değil'}
          </dd>
        </div>
        <div>
          <dt>Son olay</dt>
          <dd>{snapshot.lastEvent ?? '-'}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{snapshot.liveModel ? `${snapshot.liveModel} / ${snapshot.finalModel}` : '-'}</dd>
        </div>
      </dl>
      {isConfigured ? (
        <button
          type="button"
          className="stream-reconnect-button"
          onClick={onReconnect}
          disabled={snapshot.state === 'connecting'}
          aria-label="Canlı stream yeniden bağlan"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Yeniden bağlan
        </button>
      ) : null}
    </section>
  );
}

function InsightPanel({ meeting }: { meeting: MeetingRecord }) {
  return (
    <section className="insight-panel" aria-label="Toplantı çıktıları">
      <div className="summary-block">
        <h3>{meeting.summary.kind === 'canonical-description' ? 'Toplantı açıklaması' : 'Özet'}</h3>
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
  loadDetail = loadMeetingDetail,
  subscribeAuthChanges = defaultSubscribeAuthChanges,
  resolveLiveStreamEndpoint = defaultResolveLiveStreamEndpoint,
  webSocketFactory,
}: MeetingAppProps = {}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all');
  const [workbench, setWorkbench] = useState<MeetingWorkbenchData>(() =>
    createPendingWorkbenchData(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [authRevision, setAuthRevision] = useState(0);
  const [selectedId, setSelectedId] = useState(workbench.records[0]?.id ?? '');
  const [selectedPolicyAction, setSelectedPolicyAction] = useState<MeetingPolicyActionKind | null>(
    null,
  );
  const [liveStreamToken, setLiveStreamToken] = useState(0);
  const [liveStream, setLiveStream] = useState<MeetingLiveStreamSnapshot>(() =>
    createLiveStreamSnapshot('not-configured'),
  );

  useEffect(
    () => subscribeAuthChanges(() => setAuthRevision((value) => value + 1)),
    [subscribeAuthChanges],
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
  }, [authRevision, loadWorkbench, reloadToken]);

  useEffect(() => {
    if (workbench.source.mode !== 'api' || !selectedId) return;
    const selected = workbench.records.find((meeting) => meeting.id === selectedId);
    if (!selected) return;
    if (selected.detail && selected.detail.state !== 'idle') return;

    let cancelled = false;
    setWorkbench((current) => ({
      ...current,
      records: current.records.map((meeting) =>
        meeting.id === selectedId
          ? {
              ...meeting,
              detail: {
                state: 'loading',
                label: 'Canonical detay yükleniyor',
                detail: 'Transcript, oturum, aksiyon ve karar kaynakları okunuyor.',
              },
            }
          : meeting,
      ),
    }));

    loadDetail(selected)
      .then((hydrated) => {
        if (cancelled) return;
        setWorkbench((current) => ({
          ...current,
          records: current.records.map((meeting) =>
            meeting.id === hydrated.id ? hydrated : meeting,
          ),
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const unauthorized =
          error instanceof Error &&
          (error.name === 'MeetingUnauthenticatedError' || /unauthenticated/i.test(error.message));
        setWorkbench((current) => ({
          ...current,
          records: current.records.map((meeting) =>
            meeting.id === selectedId
              ? {
                  ...meeting,
                  detail: {
                    state: unauthorized ? 'unauthorized' : 'error',
                    label: unauthorized ? 'Detay yetkisi gerekli' : 'Detay alınamadı',
                    detail: unauthorized
                      ? 'MEETING veya TRANSCRIPT görüntüleme yetkisi doğrulanamadı.'
                      : 'Canonical toplantı alt kaynaklarına ulaşılamadı.',
                  },
                }
              : meeting,
          ),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [loadDetail, reloadToken, selectedId, workbench.source.mode]);

  const filteredMeetings = useMemo(
    () => filterMeetings(workbench.records, { query, status: statusFilter }),
    [query, statusFilter, workbench.records],
  );
  const selectedMeeting = useMemo(
    () =>
      findSelectedMeeting(
        filteredMeetings.length > 0 ? filteredMeetings : workbench.records,
        selectedId,
      ),
    [filteredMeetings, selectedId, workbench.records],
  );
  const renderedSelectedMeeting =
    selectedMeeting && liveStream.segments.length > 0
      ? {
          ...selectedMeeting,
          status: 'live' as const,
          transcriptFeed: {
            state: 'live' as const,
            label: liveStream.label,
            detail: liveStream.detail,
          },
          transcript: [...selectedMeeting.transcript, ...liveStream.segments],
        }
      : selectedMeeting;
  const stats = computeStats(workbench.records);
  const handleSelectMeeting = (meetingId: string) => {
    setSelectedId(meetingId);
    setSelectedPolicyAction(null);
  };

  useEffect(() => {
    if (!selectedMeeting) {
      setLiveStream(
        createLiveStreamSnapshot('not-configured', undefined, 'Toplantı seçili değil.'),
      );
      return;
    }

    const endpoint = resolveLiveStreamEndpoint(selectedMeeting);
    if (!endpoint) {
      setLiveStream(createLiveStreamSnapshot('not-configured'));
      return;
    }

    setLiveStream(createLiveStreamSnapshot('connecting', endpoint));

    if (!webSocketFactory && typeof WebSocket === 'undefined') {
      setLiveStream(
        createLiveStreamSnapshot('error', endpoint, 'Bu runtime WebSocket bağlantısı kuramıyor.'),
      );
      return;
    }

    let closedByCleanup = false;
    let contractFailed = false;
    const socket: MeetingWebSocket = webSocketFactory
      ? webSocketFactory(endpoint)
      : (new WebSocket(endpoint) as MeetingWebSocket);

    socket.onopen = () => {
      if (closedByCleanup) return;
      setLiveStream((current) => ({
        ...current,
        state: 'connecting',
        label: 'Stream bağlandı',
        detail: 'WebSocket açık; ready event bekleniyor.',
      }));
    };

    socket.onmessage = (event) => {
      if (closedByCleanup) return;
      const payload = typeof event.data === 'string' ? event.data : String(event.data);
      const parsed = parseWsStreamEventMessage(payload);
      if (!parsed.ok) {
        contractFailed = true;
        setLiveStream((current) => ({
          ...current,
          state: 'contract-error',
          label: 'Sözleşme hatası',
          detail: `Beklenmeyen /ws/stream eventi reddedildi: ${parsed.reason}`,
          error: parsed.reason,
        }));
        socket.close();
        return;
      }
      setLiveStream((current) => reduceLiveStreamEvent(current, parsed.event));
    };

    socket.onerror = () => {
      if (closedByCleanup) return;
      setLiveStream((current) => ({
        ...current,
        state: 'error',
        label: 'Stream hatası',
        detail: 'Canlı stream bağlantısı hata verdi.',
        error: 'websocket-error',
      }));
    };

    socket.onclose = () => {
      if (closedByCleanup || contractFailed) return;
      setLiveStream((current) => ({
        ...current,
        state: current.state === 'error' ? 'error' : 'closed',
        label: current.state === 'error' ? current.label : 'Stream kapandı',
        detail:
          current.state === 'error'
            ? current.detail
            : 'Canlı stream kapandı; son güvenilir transcript parçaları korunuyor.',
      }));
    };

    return () => {
      closedByCleanup = true;
      socket.close();
    };
  }, [resolveLiveStreamEndpoint, selectedMeeting, liveStreamToken, webSocketFactory]);

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
          <span>{workbench.source.mode === 'api' ? 'Yüklü aksiyon' : 'Aksiyon'}</span>
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

        {renderedSelectedMeeting ? (
          <section className="meeting-detail" aria-label="Seçili toplantı">
            <div className="detail-header">
              <div>
                <div className="detail-meta">
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{formatStart(renderedSelectedMeeting.startsAt)}</span>
                  <Mic size={16} aria-hidden="true" />
                  <span>{sourceLabel(renderedSelectedMeeting.source)}</span>
                </div>
                <h2>{renderedSelectedMeeting.title}</h2>
              </div>
              <span className={`status-chip status-${renderedSelectedMeeting.status}`}>
                {statusLabel(renderedSelectedMeeting.status)}
              </span>
            </div>

            {renderedSelectedMeeting.detail && renderedSelectedMeeting.detail.state !== 'ready' ? (
              <section
                className={`detail-status detail-status-${renderedSelectedMeeting.detail.state}`}
                aria-label="Toplantı detay durumu"
              >
                <strong>{renderedSelectedMeeting.detail.label}</strong>
                <span>{renderedSelectedMeeting.detail.detail}</span>
              </section>
            ) : null}

            {selectedPolicyAction ? (
              <ActionPolicyPanel
                meeting={renderedSelectedMeeting}
                selectedAction={selectedPolicyAction}
                onSelectAction={setSelectedPolicyAction}
                onClose={() => setSelectedPolicyAction(null)}
              />
            ) : null}

            <div className="detail-grid">
              <section className="transcript-panel" aria-labelledby="transcript-title">
                <div className="panel-title-row">
                  <h3 id="transcript-title">
                    {renderedSelectedMeeting.transcriptFeed.state === 'live'
                      ? 'Canlı Transkript'
                      : 'Transkript'}
                  </h3>
                  <span>{renderedSelectedMeeting.language.toUpperCase()}</span>
                </div>
                <LiveStreamStatusPanel
                  snapshot={liveStream}
                  onReconnect={() => setLiveStreamToken((value) => value + 1)}
                />
                <TranscriptTimeline meeting={renderedSelectedMeeting} />
              </section>
              <InsightPanel meeting={renderedSelectedMeeting} />
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
