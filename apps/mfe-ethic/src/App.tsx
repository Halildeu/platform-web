import { useEffect, useState } from 'react';
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

  const refresh = async () => {
    setLoadState('loading');
    setError('');
    try {
      const next = await listCases();
      setItems(next);
      setLoadState('ready');
      if (selected) {
        const fresh = await getCase(selected.id);
        setSelected(fresh);
      }
    } catch (requestError) {
      setLoadState('error');
      setError(readableError(requestError));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openCase = async (item: EthicsCaseSummary) => {
    setError('');
    try {
      const next = await getCase(item.id);
      setSelected(next);
      setAssignee(next.assignedTo ?? '');
    } catch (requestError) {
      setError(readableError(requestError));
    }
  };

  const changeStatus = async (status: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await updateCase(selected.id, selected.version, { status });
      setSelected(await getCase(selected.id));
      setItems(await listCases());
    } catch (requestError) {
      setError(readableError(requestError));
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
      const fresh = await getCase(selected.id);
      setSelected(fresh);
      setAssignee(fresh.assignedTo ?? '');
      setItems(await listCases());
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveInternalNote = async () => {
    if (!selected || !internalNote.trim()) return;
    setBusy(true);
    setError('');
    try {
      await addInternalNote(selected.id, internalNote.trim());
      setInternalNote('');
      setSelected(await getCase(selected.id));
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      await replyToReporter(selected.id, reply.trim());
      setReply('');
      setSelected(await getCase(selected.id));
    } catch (requestError) {
      setError(readableError(requestError));
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
                      onClick={() => void openCase(item)}
                    >
                      <span className="ethics-case-list-id">{shortId(item.id)}</span>
                      <span>{statusLabel(item.status)}</span>
                      <small>{new Date(item.updatedAt).toLocaleString('tr-TR')}</small>
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
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Oturum doğrulanamadı. Yeniden giriş yapın.';
  if (status === 403)
    return 'Bu vaka için yetkiniz yok veya çıkar çatışması kuralı erişimi engelledi.';
  return 'Etik Speak servisine ulaşılamadı. İşlem uygulanmadı; güvenle yeniden deneyebilirsiniz.';
}
const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
const statusLabel = (status: string) =>
  ({ NEW: 'Yeni', IN_REVIEW: 'İncelemede', CLOSED: 'Kapalı' })[status] ?? status;
