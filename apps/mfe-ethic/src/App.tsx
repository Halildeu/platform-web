import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mfe/design-system';
import {
  addInternalNote,
  getCase,
  listCases,
  replyToReporter,
  updateCase,
  type EthicsCaseDetail,
  type EthicsCaseSummary,
} from './ethics-api';
import './ethics.css';

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [items, setItems] = useState<EthicsCaseSummary[]>([]);
  const [selected, setSelected] = useState<EthicsCaseDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const selectionSequence = useRef(0);
  const operationKeys = useRef(new Map<string, string>());

  const clearSensitiveState = () => {
    selectionSequence.current += 1;
    setItems([]);
    setSelected(null);
    setReply('');
    setInternalNote('');
    setAssignee('');
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

  const refresh = async () => {
    const requestSequence = ++selectionSequence.current;
    const selectedId = selected?.id;
    setLoadState('loading');
    setError('');
    try {
      const next = await listCases();
      setItems(next);
      setLoadState('ready');
      if (selectedId) {
        const fresh = await getCase(selectedId);
        if (requestSequence === selectionSequence.current) {
          setSelected(fresh);
          setAssignee(fresh.assignedTo ?? '');
        }
      }
    } catch (requestError) {
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
    setAssignee('');
    try {
      const next = await getCase(item.id);
      if (requestSequence === selectionSequence.current) {
        setSelected(next);
        setAssignee(next.assignedTo ?? '');
      }
    } catch (requestError) {
      if (requestSequence === selectionSequence.current) showRequestError(requestError);
    }
  };

  const changeStatus = async (status: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await updateCase(selected.id, selected.version, { status });
      try {
        setSelected(await getCase(selected.id));
        setItems(await listCases());
      } catch (refreshError) {
        showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
      }
    } catch (requestError) {
      await handleWriteFailure(
        requestError,
        selected.id,
        setSelected,
        setAssignee,
        showRequestError,
      );
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await updateCase(selected.id, selected.version, { assignedTo: assignee.trim() || null });
      try {
        const fresh = await getCase(selected.id);
        setSelected(fresh);
        setAssignee(fresh.assignedTo ?? '');
        setItems(await listCases());
      } catch (refreshError) {
        showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
      }
    } catch (requestError) {
      await handleWriteFailure(
        requestError,
        selected.id,
        setSelected,
        setAssignee,
        showRequestError,
      );
    } finally {
      setBusy(false);
    }
  };

  const saveInternalNote = async () => {
    if (!selected || !internalNote.trim()) return;
    setBusy(true);
    setError('');
    const note = internalNote.trim();
    const operation = operationKey('internal-note', selected.id, note);
    try {
      await addInternalNote(selected.id, note, operation.key);
      operationKeys.current.delete(operation.identity);
      setInternalNote('');
      try {
        setSelected(await getCase(selected.id));
      } catch (refreshError) {
        showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
      }
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError('');
    const body = reply.trim();
    const operation = operationKey('reporter-reply', selected.id, body);
    try {
      await replyToReporter(selected.id, body, operation.key);
      operationKeys.current.delete(operation.identity);
      setReply('');
      try {
        setSelected(await getCase(selected.id));
      } catch (refreshError) {
        showRequestErrorAfterWrite(refreshError, clearSensitiveState, setError);
      }
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setBusy(false);
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
                <section aria-labelledby="narrative-heading">
                  <h3 id="narrative-heading">Bildirim</h3>
                  <p className="ethics-narrative">{selected.description}</p>
                </section>
                <section aria-labelledby="workflow-heading">
                  <h3 id="workflow-heading">İş akışı</h3>
                  <div className="ethics-assignment">
                    <label htmlFor="case-assignee">Yetkili ataması</label>
                    <div className="ethics-inline-form">
                      <input
                        id="case-assignee"
                        value={assignee}
                        onChange={(event) => setAssignee(event.target.value)}
                        maxLength={200}
                        placeholder="Kullanıcı veya ekip referansı"
                      />
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void saveAssignment()}
                      >
                        Atamayı kaydet
                      </Button>
                    </div>
                    <p className="ethics-muted">
                      Atama, ürün yetkisi ve çıkar çatışması kontrolünden sonra uygulanır.
                    </p>
                  </div>
                  <div className="ethics-actions">
                    <Button disabled={busy} onClick={() => void changeStatus('IN_REVIEW')}>
                      İncelemeye al
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void changeStatus('CLOSED')}
                    >
                      Kapat
                    </Button>
                  </div>
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
  setAssignee: (value: string) => void,
  showError: (value: unknown) => void,
) {
  if ([409, 412].includes(responseStatus(error) ?? 0)) {
    try {
      const fresh = await getCase(caseId);
      setSelected(fresh);
      setAssignee(fresh.assignedTo ?? '');
    } catch (refreshError) {
      showError(refreshError);
      return;
    }
  }
  showError(error);
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
const statusLabel = (status: string) =>
  ({ NEW: 'Yeni', IN_REVIEW: 'İncelemede', CLOSED: 'Kapalı' })[status] ?? status;
