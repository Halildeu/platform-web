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
  listCases,
  replyToReporter,
  updateCase,
  type AssignableStaffEntry,
  type CaseParticipant,
  type EthicsCaseDetail,
  type EthicsCaseSummary,
  type StaffEvidence,
} from './ethics-api';
import {
  acknowledgementState,
  NEXT_STATUSES,
  OUTCOME_OPTIONS,
  outcomeLabel,
  PARTICIPANT_ROLES,
  participantRoleLabel,
  statusLabel,
  transitionLabel,
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
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  // ES-203/C — participants are handle-named; the free-text `assignedTo` label
  // is gone from this surface so the case cannot grow a second, rival answer
  // to "who is on this" (backend retirement is #945's remaining half).
  const [participants, setParticipants] = useState<CaseParticipant[]>([]);
  const [participantsError, setParticipantsError] = useState('');
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
    setInternalNote('');
    setParticipants([]);
    setParticipantsError('');
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
    setInternalNote('');
    setEvidence([]);
    setEvidenceError('');
    setParticipants([]);
    setParticipantsError('');
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

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    const requestSequence = ++selectionSequence.current;
    const caseId = selected.id;
    setBusy(true);
    setError('');
    const body = reply.trim();
    const operation = operationKey('reporter-reply', caseId, body);
    try {
      await replyToReporter(caseId, body, operation.key);
      if (requestSequence !== selectionSequence.current) return;
      operationKeys.current.delete(operation.identity);
      setReply('');
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
              <ul className="ethics-case-list" aria-label="Etik vakaları">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      className={selected?.id === item.id ? 'is-selected' : ''}
                      aria-label={`Vaka #${item.id.toUpperCase()} · ${statusLabel(item.status)}`}
                      onClick={() => void openCase(item)}
                    >
                      <span className="ethics-case-list-id">{shortId(item.id)}</span>
                      <span>{statusLabel(item.status)}</span>
                      <small>
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

          <Card variant="outlined" padding="md">
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
                  <label htmlFor="staff-reply">Reporter'a güvenli yanıt</label>
                  <textarea
                    id="staff-reply"
                    rows={4}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={16000}
                  />
                  <Button disabled={busy || !reply.trim()} onClick={() => void sendReply()}>
                    Yanıtı gönder
                  </Button>
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
