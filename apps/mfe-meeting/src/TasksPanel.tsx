/**
 * Faz 24 Görevler dilim-1 (gitops#3487) — meeting task management panel.
 *
 * Renders under the detail grid for a canonical (UUID) meeting: lists the
 * meeting's action items as editable tasks (status, assignee, due date),
 * supports adding a manual task, and surfaces AI-produced rows with a badge.
 * Follows the app's manual promise + cancel-flag convention (no react-query);
 * mount with key={meetingId} so state resets per meeting.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleDashed, Plus, Sparkles, UserRound } from 'lucide-react';
import {
  AI_CREATOR_SUBJECT,
  createMeetingTask,
  listMeetingTasks,
  searchAssignees,
  TASK_STATUS_LABELS,
  updateMeetingTask,
  type MeetingTask,
  type MeetingTaskStatus,
  type UserOption,
} from './meeting-tasks-api';

interface TasksPanelProps {
  meetingId: string;
}

type PanelState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

const dateInputValue = (iso: string | null): string => {
  if (!iso) return '';
  const idx = iso.indexOf('T');
  return idx > 0 ? iso.slice(0, idx) : iso;
};

const dateInputToIso = (value: string): string | null => (value ? `${value}T12:00:00Z` : null);

const errorMessage = (err: unknown): string => {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 409) return 'Görev bu sırada başka biri tarafından değişti; liste tazelendi.';
    if (status === 403) return 'Bu işlem için yetkiniz yok.';
    if (status) return `İstek başarısız (HTTP ${status}).`;
  }
  return 'İstek başarısız oldu; bağlantıyı kontrol edin.';
};

function AssigneeEditor(props: {
  current: string | null;
  onPick: (option: UserOption | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<UserOption[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setOptions([]);
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    let cancelled = false;
    timer.current = window.setTimeout(() => {
      setBusy(true);
      searchAssignees(query.trim())
        .then((rows) => {
          if (!cancelled) setOptions(rows);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="task-assignee-editor">
      <input
        autoFocus
        type="text"
        value={query}
        placeholder="Kişi ara (en az 3 harf)…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onClose();
        }}
        aria-label="Sorumlu ara"
      />
      {busy ? <small className="task-assignee-hint">aranıyor…</small> : null}
      {!busy && query.trim().length >= 3 && options.length === 0 ? (
        <small className="task-assignee-hint">sonuç yok</small>
      ) : null}
      <ul role="listbox" aria-label="Kişi önerileri">
        {options.map((opt) => (
          <li key={opt.subject}>
            <button type="button" onClick={() => props.onPick(opt)}>
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="task-assignee-actions">
        {props.current ? (
          <button type="button" className="task-link-btn" onClick={() => props.onPick(null)}>
            Atamayı kaldır
          </button>
        ) : null}
        <button type="button" className="task-link-btn" onClick={props.onClose}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

export function TasksPanel({ meetingId }: TasksPanelProps) {
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [editingAssigneeOf, setEditingAssigneeOf] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    listMeetingTasks(meetingId)
      .then((rows) => {
        if (cancelled) return;
        setTasks(rows);
        setState({ kind: 'ready' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  useEffect(() => reload(), [reload]);

  const applyUpdate = useCallback(
    (
      task: MeetingTask,
      patch: Partial<Pick<MeetingTask, 'assigneeSubject' | 'status' | 'dueAt'>>,
    ) => {
      setNotice(null);
      updateMeetingTask(meetingId, task.id, {
        description: task.description,
        assigneeSubject:
          patch.assigneeSubject !== undefined ? patch.assigneeSubject : task.assigneeSubject,
        status: patch.status ?? task.status,
        dueAt: patch.dueAt !== undefined ? patch.dueAt : task.dueAt,
        expectedVersion: task.version,
      })
        .then((updated) => {
          if (updated) {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          } else {
            reload();
          }
        })
        .catch((err: unknown) => {
          setNotice(errorMessage(err));
          reload();
        });
    },
    [meetingId, reload],
  );

  const handleCreate = useCallback(() => {
    const description = newDescription.trim();
    if (!description || creating) return;
    setCreating(true);
    setNotice(null);
    createMeetingTask(meetingId, { description })
      .then((created) => {
        setNewDescription('');
        if (created) setTasks((prev) => [...prev, created]);
        else reload();
      })
      .catch((err: unknown) => setNotice(errorMessage(err)))
      .finally(() => setCreating(false));
  }, [creating, meetingId, newDescription, reload]);

  return (
    <section className="tasks-panel" aria-labelledby="tasks-panel-title">
      <div className="panel-title-row">
        <h3 id="tasks-panel-title">Görevler</h3>
        <span>{tasks.length > 0 ? `${tasks.length} görev` : ''}</span>
      </div>

      {state.kind === 'loading' ? <p className="tasks-empty">Görevler yükleniyor…</p> : null}
      {state.kind === 'error' ? (
        <p className="tasks-error" role="alert">
          {state.message}{' '}
          <button type="button" className="task-link-btn" onClick={() => reload()}>
            Yeniden dene
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="tasks-error" role="alert">
          {notice}
        </p>
      ) : null}

      {state.kind === 'ready' && tasks.length === 0 ? (
        <p className="tasks-empty">
          Henüz görev yok. Analiz tamamlandığında aksiyonlar burada listelenir; aşağıdan elle de
          ekleyebilirsiniz.
        </p>
      ) : null}

      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className={`task-row task-status-${task.status.toLowerCase()}`}>
            <button
              type="button"
              className="task-toggle"
              aria-label={task.status === 'DONE' ? 'Görevi yeniden aç' : 'Görevi tamamla'}
              title={task.status === 'DONE' ? 'Yeniden aç' : 'Tamamla'}
              onClick={() =>
                applyUpdate(task, { status: task.status === 'DONE' ? 'OPEN' : 'DONE' })
              }
            >
              {task.status === 'DONE' ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <CircleDashed size={18} aria-hidden="true" />
              )}
            </button>

            <div className="task-main">
              <span className="task-description">{task.description}</span>
              <div className="task-meta">
                {task.createdBySubject === AI_CREATOR_SUBJECT ? (
                  <span className="task-badge task-badge-ai" title="Canlı analizden üretildi">
                    <Sparkles size={12} aria-hidden="true" /> analizden
                  </span>
                ) : null}
                <span className="task-assignee">
                  <UserRound size={12} aria-hidden="true" />
                  {editingAssigneeOf === task.id ? null : (
                    <button
                      type="button"
                      className="task-link-btn"
                      onClick={() => setEditingAssigneeOf(task.id)}
                    >
                      {task.assigneeSubject ?? 'Ata'}
                    </button>
                  )}
                </span>
              </div>
              {editingAssigneeOf === task.id ? (
                <AssigneeEditor
                  current={task.assigneeSubject}
                  onClose={() => setEditingAssigneeOf(null)}
                  onPick={(opt) => {
                    setEditingAssigneeOf(null);
                    applyUpdate(task, { assigneeSubject: opt ? opt.subject : null });
                  }}
                />
              ) : null}
            </div>

            <select
              className="task-status-select"
              value={task.status}
              aria-label="Görev durumu"
              onChange={(e) => applyUpdate(task, { status: e.target.value as MeetingTaskStatus })}
            >
              {(Object.keys(TASK_STATUS_LABELS) as MeetingTaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <input
              className="task-due"
              type="date"
              value={dateInputValue(task.dueAt)}
              aria-label="Termin"
              onChange={(e) => applyUpdate(task, { dueAt: dateInputToIso(e.target.value) })}
            />
          </li>
        ))}
      </ul>

      <form
        className="task-create"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
      >
        <input
          type="text"
          value={newDescription}
          maxLength={2000}
          placeholder="Yeni görev ekle…"
          aria-label="Yeni görev açıklaması"
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <button type="submit" disabled={creating || newDescription.trim().length === 0}>
          <Plus size={14} aria-hidden="true" /> Ekle
        </button>
      </form>
    </section>
  );
}
