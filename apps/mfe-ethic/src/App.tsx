import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  addCaseParticipant,
  addInternalNote,
  downloadCaseEvidence,
  getCase,
  listAssignableStaff,
  listCaseEvidence,
  listCaseParticipants,
  listCaseTimeline,
  listCases,
  replyToReporter,
  updateCase,
  type AssignableStaffEntry,
  type CaseParticipant,
  type CaseTimelineEntry,
  type EthicsCaseDetail,
  type EthicsCaseSummary,
  type StaffEvidence,
} from './ethics-api';
import { timelineDetailLabel, timelineEventLabel, timelineMoment } from './case-timeline';
import { dispatchAcknowledgement, fetchAcknowledgementDraft } from './ethics-api';
import {
  acknowledgementCountdown,
  acknowledgementDraft,
  acknowledgementState,
  missingAcknowledgementSections,
  categoryLabel,
  CASE_CATEGORIES,
  CASE_STATUSES,
  EMPTY_CASE_FILTER,
  filterCases,
  isFilterActive,
  sortForQueue,
  isAnonymous,
  NEXT_STATUSES,
  OUTCOME_OPTIONS,
  outcomeLabel,
  PARTICIPANT_ROLES,
  participantRoleLabel,
  statusLabel,
  transitionLabel,
  type CaseFilter,
  type CaseOutcome,
  type CaseStatus,
  type ParticipantRole,
} from './case-lifecycle';
import './ethics.css';

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [items, setItems] = useState<EthicsCaseSummary[]>([]);
  const [selected, setSelected] = useState<EthicsCaseDetail | null>(null);
  const [evidence, setEvidence] = useState<StaffEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState('');
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [filter, setFilter] = useState<CaseFilter>(EMPTY_CASE_FILTER);
  // Derived, not stored: a second copy of the list would drift from the first the moment
  // a refresh lands while a filter is on.
  // Queue order, not recency: the case one day from its statutory deadline outranks
  // whatever was touched last.
  const visibleItems = sortForQueue(filterCases(items, filter));
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  // ES-2 (#3271): when the textarea holds an acknowledgement draft, the template
  // identity it was drafted from rides along to the ledger. Null means the textarea
  // is an ordinary reply and the ordinary message path applies.
  const [ackTemplate, setAckTemplate] = useState<{ id: string; version: number } | null>(null);
  const [internalNote, setInternalNote] = useState('');
  // ES-203 — participants are handle-named. The free-text assignment label is
  // gone from this surface and refused by the server (slice 2), so the case
  // cannot grow a second, rival answer to "who is on this".
  const [participants, setParticipants] = useState<CaseParticipant[]>([]);
  const [participantsError, setParticipantsError] = useState('');
  const [timeline, setTimeline] = useState<CaseTimelineEntry[]>([]);
  // Three states, not two. "Loaded and empty" and "could not load" look identical if both
  // render an empty list, and on an audit trail those two mean opposite things.
  const [timelineState, setTimelineState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [staffOptions, setStaffOptions] = useState<AssignableStaffEntry[]>([]);
  const [staffState, setStaffState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [pickerHandle, setPickerHandle] = useState('');
  const [pickerRole, setPickerRole] = useState<ParticipantRole>('handler');
  const [busy, setBusy] = useState(false);
  // A closure needs a finding and a reopening needs a reason, so both are collected
  // before the request rather than sent empty and refused by the server.
  const [pendingMove, setPendingMove] = useState<CaseStatus | null>(null);
  const [outcome, setOutcome] = useState<CaseOutcome>('UNSUBSTANTIATED');
  const [closingMessage, setClosingMessage] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const selectionSequence = useRef(0);
  const operationKeys = useRef(new Map<string, string>());

  const clearSensitiveState = () => {
    selectionSequence.current += 1;
    setItems([]);
    setSelected(null);
    setEvidence([]);
    setEvidenceError('');
    setDownloadingEvidenceId('');
    setReply('');
    setAckTemplate(null);
    setInternalNote('');
    setParticipants([]);
    setParticipantsError('');
    // The history carries case-scoped actor handles and who did what — it belongs to the
    // session being torn down, not to whatever loads next.
    setTimeline([]);
    setTimelineState('loading');
    setStaffOptions([]);
    setStaffState('loading');
    setPickerHandle('');
    setBusy(false);
    operationKeys.current.clear();
  };

  const showRequestError = (requestError: unknown) => {
    if (isAuthorizationFailure(requestError)) clearSensitiveState();
    setError(readableError(requestError));
  };

  const operationKey = (kind: string, caseId: string, body: string) => {
    const identity = `${kind}\n${caseId}\n${body}`;
    const existing = operationKeys.current.get(identity);
    if (existing) return { identity, key: existing };
    const key = crypto.randomUUID();
    operationKeys.current.set(identity, key);
    return { identity, key };
  };

  // ES-203/C — two loads with opposite failure shapes, matching the server's.
  // The participants list degrades (people on a case must stay knowable even
  // when a dependency is down); the assignable list fails closed (the server
  // answers 503 rather than serving unnamed rows, and this surface says so
  // instead of pretending the team is empty).
  const loadParticipants = async (caseId: string, requestSequence: number) => {
    try {
      const next = await listCaseParticipants(caseId);
      if (requestSequence !== selectionSequence.current) return;
      setParticipants(next);
      setParticipantsError('');
    } catch (requestError) {
      if (requestSequence !== selectionSequence.current) return;
      if (isAuthorizationFailure(requestError)) {
        showRequestError(requestError);
        return;
      }
      setParticipants([]);
      setParticipantsError('Katılımcı listesi şu anda doğrulanamıyor.');
    }
  };

  const loadAssignableStaff = async (caseId: string, requestSequence: number) => {
    setStaffState('loading');
    try {
      const next = await listAssignableStaff(caseId);
      if (requestSequence !== selectionSequence.current) return;
      setStaffOptions(next);
      setStaffState('ready');
    } catch (requestError) {
      if (requestSequence !== selectionSequence.current) return;
      setStaffOptions([]);
      setStaffState('unavailable');
    }
  };

  /**
   * The case's history. A display surface, so it degrades — but it degrades *loudly*.
   *
   * <p>Silence here is the dangerous failure: a handler who sees an empty history concludes
   * nothing has happened to the case, and on a whistleblowing record that conclusion drives
   * real decisions. So a failed load never leaves an empty list behind; it says it failed.
   */
  const loadCaseTimeline = async (caseId: string, requestSequence: number) => {
    setTimelineState('loading');
    try {
      const next = await listCaseTimeline(caseId);
      if (requestSequence !== selectionSequence.current) return;
      setTimeline(next);
      setTimelineState('ready');
    } catch (requestError) {
      if (requestSequence !== selectionSequence.current) return;
      if (isAuthorizationFailure(requestError)) {
        showRequestError(requestError);
        return;
      }
      setTimeline([]);
      setTimelineState('unavailable');
    }
  };

  const loadCaseEvidence = async (caseId: string, requestSequence: number) => {
    try {
      const next = await listCaseEvidence(caseId);
      if (requestSequence !== selectionSequence.current) return;
      setEvidence(next);
      setEvidenceError('');
    } catch (requestError) {
      if (requestSequence !== selectionSequence.current) return;
      if (isAuthorizationFailure(requestError)) {
        showRequestError(requestError);
        return;
      }
      setEvidence([]);
      setEvidenceError(
        'Kanıt dosyaları şu anda doğrulanamıyor. Vaka ve mesaj işlemleri kullanılabilir.',
      );
    }
  };

  const refresh = async () => {
    const requestSequence = ++selectionSequence.current;
    const selectedId = selected?.id;
    setLoadState('loading');
    setError('');
    try {
      const next = await listCases();
      if (requestSequence !== selectionSequence.current) return;
      setItems(next);
      setLoadState('ready');
      if (selectedId) {
        const fresh = await getCase(selectedId);
        if (requestSequence === selectionSequence.current) {
          setSelected(fresh);
          await loadCaseEvidence(selectedId, requestSequence);
          await loadParticipants(selectedId, requestSequence);
          await loadAssignableStaff(selectedId, requestSequence);
          await loadCaseTimeline(selectedId, requestSequence);
        }
      }
    } catch (requestError) {
      if (requestSequence !== selectionSequence.current) return;
      setLoadState('error');
      showRequestError(requestError);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openCase = async (item: EthicsCaseSummary) => {
    const requestSequence = ++selectionSequence.current;
    setError('');
    setReply('');
    setAckTemplate(null);
    setInternalNote('');
    setEvidence([]);
    setEvidenceError('');
    setParticipants([]);
    setParticipantsError('');
    setTimeline([]);
    setTimelineState('loading');
    setStaffOptions([]);
    setStaffState('loading');
    setPickerHandle('');
    try {
      const next = await getCase(item.id);
      if (requestSequence === selectionSequence.current) {
        setSelected(next);
        await loadCaseEvidence(item.id, requestSequence);
        await loadParticipants(item.id, requestSequence);
        await loadAssignableStaff(item.id, requestSequence);
        await loadCaseTimeline(item.id, requestSequence);
      }
    } catch (requestError) {
      if (requestSequence === selectionSequence.current) showRequestError(requestError);
    }
  };

  const changeStatus = async (status: CaseStatus) => {
    if (!selected) return;
    const closing = status === 'CLOSED';
    const reopening = selected.status === 'CLOSED' && status !== 'CLOSED';
    if (reopening && !reopenReason.trim()) return;
    if (closing && !closingMessage.trim()) return;
    const requestSequence = ++selectionSequence.current;
    const caseId = selected.id;
    const version = selected.version;
    setBusy(true);
    setError('');
    try {
      await updateCase(caseId, version, {
        status,
        ...(closing ? { outcome, closingMessage: closingMessage.trim() } : {}),
        ...(reopening ? { reason: reopenReason.trim() } : {}),
      });
      if (requestSequence !== selectionSequence.current) return;
      try {
        const [fresh, next] = await Promise.all([getCase(caseId), listCases()]);
        if (requestSequence !== selectionSequence.current) return;
        setSelected(fresh);
        setItems(next);
        setPendingMove(null);
        setReopenReason('');
        setClosingMessage('');
      } catch (refreshError) {
        if (requestSequence === selectionSequence.current) {
          showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
        }
      }
    } catch (requestError) {
      await handleWriteFailure(
        requestError,
        caseId,
        setSelected,
        showRequestError,
        () => requestSequence === selectionSequence.current,
      );
    } finally {
      if (requestSequence === selectionSequence.current) setBusy(false);
    }
  };

  // ES-203/C — assignment goes through the handle the server minted for this
  // case. There is no free-text path anymore: a label the authorization plane
  // cannot check is how `assigned_to` accumulated values like `jbjb`.
  const addParticipant = async () => {
    if (!selected || !pickerHandle) return;
    const requestSequence = ++selectionSequence.current;
    const caseId = selected.id;
    setBusy(true);
    setError('');
    try {
      await addCaseParticipant(caseId, pickerHandle, pickerRole);
      if (requestSequence !== selectionSequence.current) return;
      setPickerHandle('');
      await loadParticipants(caseId, requestSequence);
    } catch (requestError) {
      if (requestSequence === selectionSequence.current) showRequestError(requestError);
    } finally {
      if (requestSequence === selectionSequence.current) setBusy(false);
    }
  };

  const saveInternalNote = async () => {
    if (!selected || !internalNote.trim()) return;
    const requestSequence = ++selectionSequence.current;
    const caseId = selected.id;
    setBusy(true);
    setError('');
    const note = internalNote.trim();
    const operation = operationKey('internal-note', caseId, note);
    try {
      await addInternalNote(caseId, note, operation.key);
      if (requestSequence !== selectionSequence.current) return;
      operationKeys.current.delete(operation.identity);
      setInternalNote('');
      try {
        const fresh = await getCase(caseId);
        if (requestSequence !== selectionSequence.current) return;
        setSelected(fresh);
      } catch (refreshError) {
        if (requestSequence === selectionSequence.current) {
          showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
        }
      }
    } catch (requestError) {
      if (requestSequence === selectionSequence.current) showRequestError(requestError);
    } finally {
      if (requestSequence === selectionSequence.current) setBusy(false);
    }
  };

  /**
   * ES-2 (#3271): the draft is SERVER truth — the tenant's template, the case's
   * category variant, placeholders filled, identity versioned. The local generator
   * stays only as the honest fallback for a frontend deployed ahead of the service:
   * it produces a plain reply (no template identity), exactly what it always was.
   */
  const prepareAcknowledgement = async () => {
    if (!selected) return;
    const requestSequence = ++selectionSequence.current;
    setBusy(true);
    setError('');
    try {
      const draft = await fetchAcknowledgementDraft(selected.id);
      if (requestSequence !== selectionSequence.current) return;
      setReply(draft.body);
      setAckTemplate({ id: draft.templateId, version: draft.templateVersion });
    } catch {
      if (requestSequence !== selectionSequence.current) return;
      setReply(acknowledgementDraft(selected.id, selected.createdAt));
      setAckTemplate(null);
      setError('Sunucu taslağı alınamadı; yerel taslak kullanıldı. Gönderim sıradan yanıt olarak gider.');
    } finally {
      if (requestSequence === selectionSequence.current) setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    const requestSequence = ++selectionSequence.current;
    const caseId = selected.id;
    setBusy(true);
    setError('');
    const body = reply.trim();
    const template = ackTemplate;
    const operation = operationKey(
      template ? 'acknowledgement' : 'reporter-reply', caseId, body);
    try {
      if (template) {
        await dispatchAcknowledgement(caseId, body, template.id, template.version, operation.key);
      } else {
        await replyToReporter(caseId, body, operation.key);
      }
      if (requestSequence !== selectionSequence.current) return;
      operationKeys.current.delete(operation.identity);
      setReply('');
      setAckTemplate(null);
      try {
        const fresh = await getCase(caseId);
        if (requestSequence !== selectionSequence.current) return;
        setSelected(fresh);
      } catch (refreshError) {
        if (requestSequence === selectionSequence.current) {
          showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
        }
      }
    } catch (requestError) {
      if (requestSequence === selectionSequence.current) showRequestError(requestError);
    } finally {
      if (requestSequence === selectionSequence.current) setBusy(false);
    }
  };

  const downloadEvidence = async (attachment: StaffEvidence, position: number) => {
    if (!selected || !attachment.derivativeAvailable) return;
    const caseId = selected.id;
    setDownloadingEvidenceId(attachment.attachmentId);
    setEvidenceError('');
    try {
      const body = await downloadCaseEvidence(caseId, attachment.attachmentId);
      if (selected.id !== caseId) return;
      const url = URL.createObjectURL(new Blob([body], { type: attachment.mediaType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `guvenli-kanit-${position + 1}.${evidenceExtension(attachment.mediaType)}`;
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      if (isAuthorizationFailure(requestError)) {
        showRequestError(requestError);
      } else {
        setEvidenceError(
          'Güvenli türev indirilemedi. Sonuç doğrulanamadı; listeyi yenileyip yeniden deneyin.',
        );
      }
    } finally {
      setDownloadingEvidenceId('');
    }
  };

  return (
    <main className="ethics-manager" aria-labelledby="ethics-title">
      <Stack direction="column" gap={4}>
        <header className="ethics-manager-header">
          <div>
            <Text as="h1" size="2xl" weight="bold" id="ethics-title">
              Etik Speak
            </Text>
            <Text as="p" variant="secondary">
              Yetkili vaka yönetimi · Test ortamı
            </Text>
          </div>
          <Badge variant="success">Ürün hücresi</Badge>
        </header>

        {error && (
          <div className="ethics-alert" role="alert">
            {error}
          </div>
        )}

        <div className="ethics-manager-grid">
          <Card variant="outlined" padding="md">
            <Stack direction="column" gap={3}>
              <div className="ethics-section-title">
                <Text as="h2" size="lg" weight="bold">
                  Vakalar
                </Text>
                <Button variant="secondary" size="sm" onClick={() => void refresh()}>
                  Yenile
                </Button>
              </div>
              {loadState === 'loading' && <p role="status">Vakalar yükleniyor…</p>}
              {loadState === 'error' && <p>Vaka listesi alınamadı.</p>}
              {loadState === 'ready' && items.length === 0 && (
                <p>Yetkiniz kapsamında açık vaka yok.</p>
              )}
              {loadState === 'ready' && items.length > 0 && (
                <div className="ethics-filters">
                  <label className="ethics-filter-search">
                    <span>Konu ara</span>
                    <input
                      type="search"
                      value={filter.query}
                      onChange={(e) => setFilter({ ...filter, query: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Durum</span>
                    <select
                      value={filter.status}
                      onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                    >
                      <option value="">Hepsi</option>
                      {CASE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Kategori</span>
                    <select
                      value={filter.category}
                      onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                    >
                      <option value="">Hepsi</option>
                      {CASE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* The two questions triage exists to answer, as one click each. */}
                  <label className="ethics-filter-toggle">
                    <input
                      type="checkbox"
                      checked={filter.unattended}
                      onChange={(e) => setFilter({ ...filter, unattended: e.target.checked })}
                    />
                    <span>Sahipsiz</span>
                  </label>
                  <label className="ethics-filter-toggle">
                    <input
                      type="checkbox"
                      checked={filter.overdue}
                      onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })}
                    />
                    <span>Teyit süresi geçti</span>
                  </label>
                </div>
              )}
              {/* A filtered list must never look like the whole list. A filter left on from
                  an earlier question silently hides cases, and on this screen a hidden case
                  is a report nobody is working. The count says what is being withheld and
                  the button undoes it in one move. */}
              {loadState === 'ready' && isFilterActive(filter) && (
                <p className="ethics-filter-summary" role="status">
                  <span>
                    <strong>{visibleItems.length}</strong> / {items.length} vaka gösteriliyor
                  </span>
                  <button type="button" onClick={() => setFilter(EMPTY_CASE_FILTER)}>
                    Süzmeyi kaldır
                  </button>
                </p>
              )}
              {loadState === 'ready' && items.length > 0 && visibleItems.length === 0 && (
                <p>Bu süzgeçle eşleşen vaka yok.</p>
              )}
              <ul className="ethics-case-list" aria-label="Etik vakaları">
                {visibleItems.map((item) => (
                  <li key={item.id}>
                    <button
                      className={selected?.id === item.id ? 'is-selected' : ''}
                      // Read aloud in the order it is read on screen: what the case is
                      // first, then the flags that change how it is handled. The id stays
                      // because it is how a case is referred to outside this screen.
                      aria-label={[
                        item.subject ?? 'Konu okunamadı',
                        statusLabel(item.status),
                        isAnonymous(item.mode) ? 'anonim' : null,
                        item.participantCount === 0 ? 'sahipsiz' : null,
                        acknowledgementState(item).overdue ? 'teyit süresi geçti' : null,
                        `Vaka #${item.id.toUpperCase()}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      onClick={() => void openCase(item)}
                    >
                      {/* The subject leads, because it is the only thing that says what
                          the case is. The row used to open with an id fragment, which
                          distinguishes cases from each other but describes none of them. */}
                      <span className="ethics-case-subject">
                        {item.subject ?? 'Konu okunamadı'}
                      </span>
                      <span className="ethics-case-status">{statusLabel(item.status)}</span>
                      <small className="ethics-case-meta">
                        {isAnonymous(item.mode) && (
                          <span className="ethics-tag is-anonymous">Anonim</span>
                        )}
                        {categoryLabel(item.category) && (
                          <span className="ethics-tag">{categoryLabel(item.category)}</span>
                        )}
                        {/* Nobody on the case is the state that most needs to be seen from
                            the list: it is how a report goes unworked without anyone
                            deciding that it should. */}
                        {item.participantCount === 0 && (
                          <span className="ethics-tag is-unattended">Sahipsiz</span>
                        )}
                        {acknowledgementState(item).overdue && (
                          <span className="ethics-tag is-overdue">Teyit süresi geçti</span>
                        )}
                        {(() => {
                          // Urgency BEFORE the breach: the red tag above only exists
                          // after the promise is already broken.
                          const countdown = acknowledgementCountdown(item);
                          return countdown ? (
                            <span
                              className={
                                countdown.urgent
                                  ? 'ethics-tag is-deadline-near'
                                  : 'ethics-tag is-deadline'
                              }
                            >
                              {countdown.text}
                            </span>
                          ) : null;
                        })()}
                      </small>
                      <small className="ethics-case-foot">
                        <span className="ethics-case-list-id">{shortId(item.id)}</span>
                        <time dateTime={item.updatedAt}>
                          {new Date(item.updatedAt).toLocaleString('tr-TR')}
                        </time>
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </Stack>
          </Card>

          <Card variant="outlined" padding="md" className="ethics-detail-pane">
            {!selected ? (
              <div className="ethics-empty">
                <Text as="h2" size="lg" weight="bold">
                  Vaka ayrıntısı
                </Text>
                <p>İncelemek için yetkiniz kapsamındaki bir vakayı seçin.</p>
              </div>
            ) : (
              <Stack direction="column" gap={4}>
                <div className="ethics-section-title">
                  <div>
                    <Text as="h2" size="lg" weight="bold">
                      {selected.subject}
                    </Text>
                    <p className="ethics-muted">
                      {selected.category} · {selected.mode}
                    </p>
                  </div>
                  <Badge variant="info">{statusLabel(selected.status)}</Badge>
                </div>
                {(() => {
                  const ack = acknowledgementState(selected);
                  return (
                    <p
                      className="ethics-muted"
                      data-testid="acknowledgement-state"
                      data-overdue={ack.overdue}
                      role={ack.overdue ? 'alert' : undefined}
                    >
                      {ack.text}
                      {selected.status === 'CLOSED' && selected.outcome
                        ? ` · Sonuç: ${outcomeLabel(selected.outcome)}`
                        : ''}
                    </p>
                  );
                })()}
                <section aria-labelledby="narrative-heading">
                  <h3 id="narrative-heading">Bildirim</h3>
                  <p className="ethics-narrative">{selected.description}</p>
                </section>
                <section className="ethics-evidence" aria-labelledby="evidence-heading">
                  <h3 id="evidence-heading">Kanıt dosyaları</h3>
                  <p className="ethics-muted">
                    Orijinal dosya yöneticiye açılmaz. Yalnız taranmış ve metadata’dan arındırılmış
                    güvenli türev indirilebilir.
                  </p>
                  {evidenceError && (
                    <div className="ethics-evidence-error" role="alert">
                      {evidenceError}
                    </div>
                  )}
                  <ol className="ethics-evidence-list" aria-label="Vaka kanıt dosyaları">
                    {evidence.length === 0 && !evidenceError && (
                      <li className="is-empty">Bu vakada kanıt dosyası yok.</li>
                    )}
                    {evidence.map((attachment, index) => (
                      <li key={attachment.attachmentId}>
                        <div>
                          <strong>Kanıt {index + 1}</strong>
                          <span>
                            {evidenceMediaLabel(attachment.mediaType)}
                            {attachment.size === null ? '' : ` · ${formatBytes(attachment.size)}`}
                          </span>
                        </div>
                        <span
                          className={`ethics-evidence-state is-${attachment.state.toLowerCase().replaceAll('_', '-')}`}
                        >
                          {evidenceStateLabel(attachment.state)}
                        </span>
                        {attachment.derivativeAvailable && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={downloadingEvidenceId === attachment.attachmentId}
                            onClick={() => void downloadEvidence(attachment, index)}
                          >
                            {downloadingEvidenceId === attachment.attachmentId
                              ? 'İndiriliyor…'
                              : 'Güvenli türevi indir'}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
                <section aria-labelledby="workflow-heading">
                  <h3 id="workflow-heading">İş akışı</h3>
                  <div className="ethics-assignment">
                    <h4 id="participants-heading">Davadaki kişiler</h4>
                    {participantsError && (
                      <p className="ethics-muted" role="status">
                        {participantsError}
                      </p>
                    )}
                    <ul className="ethics-participants" aria-labelledby="participants-heading">
                      {participants.length === 0 && !participantsError && (
                        <li className="is-empty">Bu davaya henüz kimse atanmadı.</li>
                      )}
                      {participants.map((participant) => (
                        <li key={participant.handle}>
                          <strong>
                            {/* Null means the directory could not answer just now — the view
                                degrades honestly instead of hiding the person. */}
                            {participant.displayName ?? 'Ad şu anda çözülemiyor'}
                          </strong>
                          <span>
                            {participantRoleLabel(participant.role)} ·{' '}
                            {handleDiscriminator(participant.handle)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {staffState === 'unavailable' ? (
                      /* The server refuses to serve unnamed rows (503) and this surface says
                         so. Picking from an unnamed list is precisely the wrong-person
                         assignment this workflow exists to prevent. */
                      <p role="alert" data-testid="staff-directory-down">
                        Ad dizini şu anda yanıt vermiyor; kişi atama geçici olarak kapalı.
                        Katılımcı listesi ve mesajlaşma kullanılmaya devam edilebilir.
                      </p>
                    ) : (
                      <div className="ethics-inline-form">
                        <label htmlFor="participant-pick">Kişi ata</label>
                        <select
                          id="participant-pick"
                          value={pickerHandle}
                          disabled={busy || staffState === 'loading'}
                          onChange={(event) => setPickerHandle(event.target.value)}
                        >
                          <option value="">
                            {staffState === 'loading' ? 'Kişiler yükleniyor…' : 'Kişi seçin…'}
                          </option>
                          {staffOptions.map((entry) => (
                            <option key={entry.handle} value={entry.handle}>
                              {/* The short code disambiguates duplicate names: two colleagues
                                  who share a name must stay two separate choices. */}
                              {entry.displayName} · {handleDiscriminator(entry.handle)}
                            </option>
                          ))}
                        </select>
                        <label htmlFor="participant-role">Rol</label>
                        <select
                          id="participant-role"
                          value={pickerRole}
                          disabled={busy}
                          onChange={(event) => setPickerRole(event.target.value as ParticipantRole)}
                        >
                          {PARTICIPANT_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {participantRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="secondary"
                          disabled={busy || !pickerHandle}
                          onClick={() => void addParticipant()}
                        >
                          Davaya ekle
                        </Button>
                      </div>
                    )}
                    <p className="ethics-muted">
                      Atama, ürün yetkisi ve çıkar çatışması kontrolünden sonra uygulanır. Kişi
                      kimliği tarayıcıya yalnız bu davaya özgü bir kodla gelir.
                    </p>
                  </div>
                  <div className="ethics-actions">
                    {/* Only the moves the server will accept from here. Offering the rest
                        would be a button that looks available and answers with a conflict. */}
                    {(NEXT_STATUSES[selected.status as CaseStatus] ?? []).map((next) => (
                      <Button
                        key={next}
                        variant={next === 'CLOSED' ? 'secondary' : 'primary'}
                        disabled={busy}
                        onClick={() => {
                          if (next === 'CLOSED' || selected.status === 'CLOSED') {
                            setPendingMove(pendingMove === next ? null : next);
                            return;
                          }
                          void changeStatus(next);
                        }}
                      >
                        {selected.status === 'CLOSED' ? 'Yeniden aç' : transitionLabel(next)}
                      </Button>
                    ))}
                  </div>
                  {pendingMove === 'CLOSED' && (
                    <div className="ethics-closure">
                      <label htmlFor="case-outcome">Sonuç</label>
                      <select
                        id="case-outcome"
                        value={outcome}
                        disabled={busy}
                        onChange={(event) => setOutcome(event.target.value as CaseOutcome)}
                      >
                        {OUTCOME_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {outcomeLabel(value)}
                          </option>
                        ))}
                      </select>
                      <p className="ethics-muted">
                        Sonuç kalıcı olarak kaydedilir. Dava yeniden açılırsa sonuç silinir ve
                        gerekçe denetim kaydına yazılır.
                      </p>
                      {/* The finding above is internal; this is what the reporter reads. They are
                          separate on purpose — a workflow value is not an explanation, and what a
                          person should be told about their own report is a judgement, not a
                          translation of an enum. */}
                      <label htmlFor="closing-message">İhbarcıya iletilecek kapanış mesajı</label>
                      <textarea
                        id="closing-message"
                        rows={3}
                        maxLength={16000}
                        value={closingMessage}
                        disabled={busy}
                        onChange={(event) => setClosingMessage(event.target.value)}
                      />
                      <p className="ethics-muted">
                        Bu metin ihbarcının posta kutusunda görünür. Üçüncü kişilerin haklarını ve
                        disiplin ayrıntısını paylaşmayın; ihbarcıya bildirimin nasıl sonuçlandığını
                        anlatın.
                      </p>
                      <Button
                        disabled={busy || !closingMessage.trim()}
                        onClick={() => void changeStatus('CLOSED')}
                      >
                        Sonucu kaydet ve kapat
                      </Button>
                    </div>
                  )}
                  {pendingMove === 'ASSESSING' && selected.status === 'CLOSED' && (
                    <div className="ethics-closure">
                      <label htmlFor="reopen-reason">Yeniden açma gerekçesi</label>
                      <textarea
                        id="reopen-reason"
                        rows={2}
                        maxLength={500}
                        value={reopenReason}
                        disabled={busy}
                        onChange={(event) => setReopenReason(event.target.value)}
                      />
                      <p className="ethics-muted">
                        Kayıtlı sonuç ({selected.outcome ? outcomeLabel(selected.outcome) : '—'})
                        silinecek. Gerekçe zorunludur.
                      </p>
                      <Button
                        disabled={busy || !reopenReason.trim()}
                        onClick={() => void changeStatus('ASSESSING')}
                      >
                        Davayı yeniden aç
                      </Button>
                    </div>
                  )}
                </section>
                <section aria-labelledby="notes-heading" className="ethics-internal-note">
                  <h3 id="notes-heading">İç not</h3>
                  <p className="ethics-muted">Bu not reporter mailbox’ında görünmez.</p>
                  <label htmlFor="internal-note">Yetkili ekip notu</label>
                  <textarea
                    id="internal-note"
                    rows={3}
                    value={internalNote}
                    onChange={(event) => setInternalNote(event.target.value)}
                    maxLength={16000}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || !internalNote.trim()}
                    onClick={() => void saveInternalNote()}
                  >
                    İç notu kaydet
                  </Button>
                </section>
                <section aria-labelledby="messages-heading">
                  <h3 id="messages-heading">Reporter iletişimi</h3>
                  <ol className="ethics-messages">
                    {selected.messages.map((message) => (
                      <li
                        key={message.id}
                        className={message.visibility === 'INTERNAL' ? 'is-internal' : ''}
                      >
                        <strong>
                          {message.visibility === 'INTERNAL'
                            ? 'İç not'
                            : message.authorType === 'STAFF'
                              ? 'Etik ekibi'
                              : 'Reporter'}
                        </strong>
                        <p>{message.body}</p>
                      </li>
                    ))}
                  </ol>
                  <div className="ethics-reply-head">
                    <label htmlFor="staff-reply">Reporter'a güvenli yanıt</label>
                    {/* Only while the acknowledgement is still owed. Once it has been given
                        the button is noise, and on a case that already has an answer it would
                        invite sending the same paragraph twice. */}
                    {!selected.acknowledgedAt && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void prepareAcknowledgement()}
                      >
                        Alındı teyidi hazırla
                      </Button>
                    )}
                  </div>
                  {!selected.acknowledgedAt && (
                    <p className="ethics-muted ethics-reply-hint">
                      Metin hazırlanır, gönderilmez. Okuyup değiştirdikten sonra siz
                      gönderirsiniz.
                    </p>
                  )}
                  <textarea
                    id="staff-reply"
                    rows={4}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={16000}
                  />
                  {ackTemplate && reply.trim() && (() => {
                    const missing = missingAcknowledgementSections(reply);
                    return missing.length > 0 ? (
                      <p className="ethics-ack-warning" role="alert">
                        Taslaktan zorunlu bölümler çıkarılmış:{' '}
                        {missing.map((section) => section.label).join(', ')}. Yine de
                        gönderebilirsiniz; eksik denetim kaydına işlenir.
                      </p>
                    ) : null;
                  })()}
                  <Button disabled={busy || !reply.trim()} onClick={() => void sendReply()}>
                    {ackTemplate ? 'Alındı teyidini gönder' : 'Yanıtı gönder'}
                  </Button>
                </section>
                <section aria-labelledby="timeline-heading">
                  <h3 id="timeline-heading">Vaka geçmişi</h3>
                  {timelineState === 'unavailable' ? (
                    /* An alert, not a quiet note. The alternative reading of an empty
                       history — "nothing has happened to this case" — is a conclusion a
                       handler acts on, and it must never be reachable by a failed fetch. */
                    <p role="alert" data-testid="timeline-unavailable">
                      Vaka geçmişi şu anda okunamıyor. Bu, geçmişin boş olduğu anlamına
                      gelmez; yenileyip tekrar deneyin.
                    </p>
                  ) : timelineState === 'loading' ? (
                    <p className="ethics-muted">Geçmiş yükleniyor…</p>
                  ) : timeline.length === 0 ? (
                    <p className="ethics-muted">Bu vaka için kayıtlı olay yok.</p>
                  ) : (
                    <ol className="ethics-timeline" aria-labelledby="timeline-heading">
                      {timeline.map((entry, index) => {
                        const detail = timelineDetailLabel(entry.event, entry.detail);
                        return (
                          <li key={`${entry.occurredAt}-${entry.event}-${index}`}>
                            <time dateTime={entry.occurredAt}>
                              {timelineMoment(entry.occurredAt)}
                            </time>
                            <strong>{timelineEventLabel(entry.event)}</strong>
                            {detail && (
                              <span
                                className="ethics-timeline-detail"
                                /* The value as the ledger holds it, for anyone reconciling
                                   this screen against the audit trail. Only when it differs
                                   from what is shown — a reason typed by a handler is
                                   already its own raw value. */
                                title={detail === entry.detail ? undefined : (entry.detail ?? undefined)}
                              >
                                {detail}
                              </span>
                            )}
                            {entry.actorDisplayName ? (
                              <span className="ethics-timeline-actor">
                                {entry.actorDisplayName}
                              </span>
                            ) : (
                              /* Said only when the service actually said it. UNRESOLVED means
                                 an actor is recorded and cannot be named right now — worth
                                 showing, because a handler reading a bare line would otherwise
                                 conclude nobody acted. Nothing is claimed when the field is
                                 absent (older service) or NONE (anonymous filing, pipeline
                                 step): inventing "unknown" there would raise an alarm about
                                 an event that never had an actor. */
                              entry.actorState === 'UNRESOLVED' && (
                                <span className="ethics-timeline-actor is-unresolved">
                                  Aktör şu anda çözülemiyor
                                </span>
                              )
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              </Stack>
            )}
          </Card>
        </div>
      </Stack>
    </main>
  );
}

function readableError(error: unknown): string {
  const status = responseStatus(error);
  if (status === 401) return 'Oturum doğrulanamadı. Yeniden giriş yapın.';
  if (status === 403 || status === 404)
    return 'Vaka bulunamadı veya ürün yetkisi/çıkar çatışması kuralı erişimi engelledi.';
  if (status === 409 || status === 412)
    return 'Vaka başka bir yetkili tarafından güncellendi. Güncel sürüm yüklendi; taslağınızı kontrol edip yeniden deneyin.';
  return 'Etik Speak servisine ulaşılamadı. İşlemin sonucu doğrulanamadı; yeniden göndermeden önce Yenile ile durumu kontrol edin.';
}

const responseStatus = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

// Object authorization deliberately uses the same 404 class as a missing case
// to avoid an existence oracle. Treat it as sensitive authorization loss and
// purge any narrative already rendered in the manager surface.
const isAuthorizationFailure = (error: unknown) =>
  [401, 403, 404].includes(responseStatus(error) ?? 0);

async function handleWriteFailure(
  error: unknown,
  caseId: string,
  setSelected: (value: EthicsCaseDetail | null) => void,
  showError: (value: unknown) => void,
  isCurrent: () => boolean,
) {
  if (!isCurrent()) return;
  if ([409, 412].includes(responseStatus(error) ?? 0)) {
    try {
      const fresh = await getCase(caseId);
      if (!isCurrent()) return;
      setSelected(fresh);
    } catch (refreshError) {
      if (isCurrent()) showError(refreshError);
      return;
    }
  }
  if (isCurrent()) showError(error);
}

function showRequestErrorAfterWrite(
  error: unknown,
  clearSensitiveState: () => void,
  setError: (value: string) => void,
) {
  if (isAuthorizationFailure(error)) {
    clearSensitiveState();
    setError(readableError(error));
    return;
  }
  setError(
    'İşlem kaydedildi ancak ekran yenilenemedi. Yeniden göndermeyin; Yenile ile durumu kontrol edin.',
  );
}
const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

// ES-203/C — the last characters of the case-scoped handle. Enough to tell two
// same-named colleagues apart within this case; useless as a correlation key
// across cases, because the handle itself changes per case.
const handleDiscriminator = (handle: string) => handle.slice(-6);


const evidenceStateLabel = (state: StaffEvidence['state']) =>
  ({
    DECLARED: 'Yükleme bekliyor',
    UPLOADING: 'Yükleme bekliyor',
    QUARANTINED: 'Karantinada',
    INTEGRITY_VERIFIED: 'Bütünlük doğrulandı',
    ORIGINAL_SEALED: 'Orijinal mühürlendi',
    SCANNING: 'Zararlı içerik taranıyor',
    SANITIZING: 'Metadata temizleniyor',
    DERIVATIVE_READY: 'Güvenli türev hazırlanıyor',
    AVAILABLE: 'Güvenli türev hazır',
    REJECTED: 'Dosya reddedildi',
    SCAN_PENDING: 'Tarama yeniden denenecek',
    EXPIRED_UNBOUND: 'Yükleme süresi doldu',
  })[state];

const evidenceMediaLabel = (mediaType: string) =>
  ({ 'text/plain': 'Metin', 'image/jpeg': 'JPEG görsel', 'image/png': 'PNG görsel' })[mediaType] ??
  'Dosya';

const evidenceExtension = (mediaType: string) =>
  ({ 'text/plain': 'txt', 'image/jpeg': 'jpg', 'image/png': 'png' })[mediaType] ?? 'bin';

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} bayt`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / 1024 / 1024).toFixed(2)} MiB`;
};
