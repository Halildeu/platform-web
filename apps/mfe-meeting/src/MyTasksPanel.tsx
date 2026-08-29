/**
 * Faz 24 Görevler dilim-2 (gitops#3494) — "Görevlerim" cross-meeting block.
 *
 * Collapsible block above the meeting list: the caller's own tasks across
 * every meeting (due-first ordering comes from the backend), with industry
 * standard due badges (overdue / today), one-click complete, a status filter,
 * and click-through to the owning meeting. Same manual-promise conventions
 * as TasksPanel.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, ListTodo } from 'lucide-react';
import {
  listMyTasks,
  updateMeetingTask,
  type MeetingTaskStatus,
  type MyTask,
} from './meeting-tasks-api';

type Filter = 'active' | 'done' | 'all';

const FILTER_LABELS: Record<Filter, string> = {
  active: 'Aktif',
  done: 'Tamamlanan',
  all: 'Tümü',
};

const FILTER_STATUSES: Record<Filter, MeetingTaskStatus[] | undefined> = {
  active: undefined, // backend default: OPEN + IN_PROGRESS
  done: ['DONE'],
  all: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
};

const dayDiffFromToday = (iso: string): number => {
  const due = new Date(iso);
  const today = new Date();
  const a = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((a - b) / 86_400_000);
};

function DueBadge({ dueAt, status }: { dueAt: string | null; status: MeetingTaskStatus }) {
  if (!dueAt || status === 'DONE' || status === 'CANCELLED') return null;
  const diff = dayDiffFromToday(dueAt);
  const label = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(
    new Date(dueAt),
  );
  const tone = diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'later';
  const prefix = diff < 0 ? 'gecikti' : diff === 0 ? 'bugün' : label;
  return (
    <span className={`mytask-due mytask-due-${tone}`} title={dueAt}>
      {diff < 0 || diff === 0 ? prefix : label}
    </span>
  );
}

export function MyTasksPanel({ onOpenMeeting }: { onOpenMeeting: (meetingId: string) => void }) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setState('loading');
    listMyTasks(FILTER_STATUSES[filter])
      .then((rows) => {
        if (cancelled) return;
        setTasks(rows);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => reload(), [reload]);

  const toggleDone = useCallback(
    (task: MyTask) => {
      setNotice(null);
      updateMeetingTask(task.meetingId, task.id, {
        description: task.description,
        assigneeSubject: task.assigneeSubject,
        status: task.status === 'DONE' ? 'OPEN' : 'DONE',
        dueAt: task.dueAt,
        expectedVersion: task.version,
      })
        .then(() => reload())
        .catch(() => {
          setNotice('Görev bu sırada değişti; liste tazelendi.');
          reload();
        });
    },
    [reload],
  );

  return (
    <section className="mytasks" aria-label="Görevlerim">
      <button
        type="button"
        className="mytasks-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        <ListTodo size={14} aria-hidden="true" />
        <strong>Görevlerim</strong>
        <span className="mytasks-count">
          {state === 'ready' && filter === 'active' && tasks.length > 0 ? tasks.length : ''}
        </span>
      </button>

      {open ? (
        <div className="mytasks-body">
          <div className="mytasks-filters" role="group" aria-label="Görev filtresi">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? 'active' : ''}
                onClick={() => setFilter(f)}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {state === 'loading' ? <p className="mytasks-empty">Yükleniyor…</p> : null}
          {state === 'error' ? (
            <p className="mytasks-empty" role="alert">
              Görevler alınamadı.{' '}
              <button type="button" className="task-link-btn" onClick={() => reload()}>
                Yeniden dene
              </button>
            </p>
          ) : null}
          {notice ? (
            <p className="mytasks-empty" role="alert">
              {notice}
            </p>
          ) : null}
          {state === 'ready' && tasks.length === 0 ? (
            <p className="mytasks-empty">
              {filter === 'active' ? 'Açık görevin yok 🎉' : 'Bu filtrede görev yok.'}
            </p>
          ) : null}

          <ul className="mytasks-list">
            {tasks.map((t) => (
              <li key={t.id} className={`mytask-row mytask-${t.status.toLowerCase()}`}>
                <button
                  type="button"
                  className="task-toggle"
                  aria-label={t.status === 'DONE' ? 'Yeniden aç' : 'Tamamla'}
                  onClick={() => toggleDone(t)}
                >
                  {t.status === 'DONE' ? (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  ) : (
                    <CircleDashed size={16} aria-hidden="true" />
                  )}
                </button>
                <span className="mytask-main">
                  <span className="mytask-desc">{t.description}</span>
                  <button
                    type="button"
                    className="mytask-meeting task-link-btn"
                    onClick={() => onOpenMeeting(t.meetingId)}
                    title="Toplantıyı aç"
                  >
                    {t.meetingTitle || 'Toplantı'}
                  </button>
                </span>
                <DueBadge dueAt={t.dueAt} status={t.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
