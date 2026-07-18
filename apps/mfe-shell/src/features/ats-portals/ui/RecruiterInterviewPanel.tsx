import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createApplicationIdempotencyKey,
  createRecruiterInterview,
  listRecruiterInterviews,
  rescheduleRecruiterInterview,
  submitInterviewScorecard,
  transitionRecruiterInterview,
  type ApplicationStatus,
  type CreateInterviewRequest,
  type InterviewCriterionDto,
  type InterviewMode,
  type InterviewRecommendation,
  type InterviewType,
  type RecruiterInterviewWorkspaceDto,
} from '../api/application-api';

const TYPE_LABELS: Record<InterviewType, string> = {
  SCREENING: 'Ön görüşme',
  TECHNICAL: 'Teknik görüşme',
  BEHAVIORAL: 'Yetkinlik görüşmesi',
  PANEL: 'Panel görüşmesi',
  FINAL: 'Final görüşmesi',
};

const MODE_LABELS: Record<InterviewMode, string> = {
  VIDEO: 'Görüntülü',
  PHONE: 'Telefon',
  ONSITE: 'Yerinde',
};

const STATUS_LABELS = {
  SCHEDULED: 'Planlandı',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal edildi',
} as const;

const DEFAULT_CRITERIA: InterviewCriterionDto[] = [
  {
    key: 'role_problem_solving',
    label: 'İşle ilgili problem çözme',
    question:
      'Bu rolle ilgili zor bir problemi nasıl analiz edip sonuca ulaştırdığınızı anlatır mısınız?',
    evidencePrompt: 'Adayın yaklaşımını, kendi katkısını ve ölçülebilir sonucu kaydedin.',
  },
  {
    key: 'relevant_delivery',
    label: 'İşle ilgili teslimat kanıtı',
    question: 'Bu rolün gerekliliklerine benzeyen bir işi uçtan uca nasıl teslim ettiniz?',
    evidencePrompt: 'Bağlamı, adayın eylemini ve doğrulanabilir sonucu kaydedin.',
  },
  {
    key: 'collaboration_evidence',
    label: 'İş birliği kanıtı',
    question:
      'Farklı paydaşlarla anlaşmazlığı çözüp işi ilerlettiğiniz bir örneği anlatır mısınız?',
    evidencePrompt: 'Gözlemlenebilir davranışı ve iş sonucunu kaydedin; kişilik yorumu yapmayın.',
  },
];

type ScheduleForm = {
  type: InterviewType;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  mode: InterviewMode;
  location: string;
  participantLabel: string;
  criteria: InterviewCriterionDto[];
};

type RescheduleForm = Pick<
  ScheduleForm,
  'startsAt' | 'endsAt' | 'timeZone' | 'mode' | 'location'
> & { reason: string };

type ScorecardForm = {
  recommendation: InterviewRecommendation;
  summary: string;
  confirmed: boolean;
  ratings: Array<{ criterionKey: string; rating: string; evidence: string }>;
};

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const toLocalInput = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const initialSchedule = (participantLabel: string): ScheduleForm => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    type: 'SCREENING',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    timeZone: browserTimeZone(),
    mode: 'VIDEO',
    location: 'https://meet.example.test/sentetik-gorusme',
    participantLabel,
    criteria: DEFAULT_CRITERIA.map((criterion) => ({ ...criterion })),
  };
};

const initialReschedule = (interview: RecruiterInterviewWorkspaceDto): RescheduleForm => ({
  startsAt: toLocalInput(interview.startsAt),
  endsAt: toLocalInput(interview.endsAt),
  timeZone: interview.timeZone,
  mode: interview.mode,
  location: interview.location,
  reason: '',
});

const initialScorecard = (interview: RecruiterInterviewWorkspaceDto): ScorecardForm => ({
  recommendation: 'HOLD',
  summary: '',
  confirmed: false,
  ratings: interview.criteria.map((criterion) => ({
    criterionKey: criterion.key,
    rating: '',
    evidence: '',
  })),
});

const formatDate = (value: string, timeZone?: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));

const iso = (localValue: string) => new Date(localValue).toISOString();

interface RecruiterInterviewPanelProps {
  publicRef: string;
  applicationStatus: ApplicationStatus;
  canManage: boolean;
  interviewerActorRef: string | null;
  interviewerLabel: string;
  onApplicationRefresh: () => Promise<void>;
}

const RecruiterInterviewPanel = ({
  publicRef,
  applicationStatus,
  canManage,
  interviewerActorRef,
  interviewerLabel,
  onApplicationRefresh,
}: RecruiterInterviewPanelProps) => {
  const [interviews, setInterviews] = useState<RecruiterInterviewWorkspaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleForm>(() => initialSchedule(interviewerLabel));
  const [rescheduleTarget, setRescheduleTarget] = useState<RecruiterInterviewWorkspaceDto | null>(
    null,
  );
  const [reschedule, setReschedule] = useState<RescheduleForm | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<{
    interview: RecruiterInterviewWorkspaceDto;
    target: 'COMPLETED' | 'CANCELLED';
  } | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [scorecardTarget, setScorecardTarget] = useState<RecruiterInterviewWorkspaceDto | null>(
    null,
  );
  const [scorecard, setScorecard] = useState<ScorecardForm | null>(null);
  const mutation = useRef<{ signature: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setInterviews(await listRecruiterInterviews(publicRef));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Görüşmeler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [publicRef]);

  useEffect(() => {
    setScheduleOpen(false);
    setSchedule(initialSchedule(interviewerLabel));
    setRescheduleTarget(null);
    setTransitionTarget(null);
    setScorecardTarget(null);
    mutation.current = null;
    void refresh();
  }, [interviewerLabel, refresh]);

  const scheduleAllowed =
    canManage &&
    Boolean(interviewerActorRef) &&
    (applicationStatus === 'UNDER_REVIEW' || applicationStatus === 'INTERVIEW_PENDING');

  const mutationKey = (request: unknown) => {
    const signature = JSON.stringify(request);
    if (mutation.current?.signature !== signature) {
      mutation.current = { signature, key: createApplicationIdempotencyKey() };
    }
    return mutation.current.key;
  };

  const submitSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduleAllowed || !interviewerActorRef || busy) return;
    const request: CreateInterviewRequest = {
      type: schedule.type,
      startsAt: iso(schedule.startsAt),
      endsAt: iso(schedule.endsAt),
      timeZone: schedule.timeZone,
      mode: schedule.mode,
      location: schedule.location.trim(),
      participants: [
        {
          actorRef: interviewerActorRef,
          displayLabel: schedule.participantLabel.trim(),
          role: 'LEAD',
        },
      ],
      criteria: schedule.criteria.map((criterion) => ({
        ...criterion,
        label: criterion.label.trim(),
        question: criterion.question.trim(),
        evidencePrompt: criterion.evidencePrompt.trim(),
      })),
    };
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await createRecruiterInterview(publicRef, request, mutationKey(request));
      mutation.current = null;
      setScheduleOpen(false);
      setSuccess('Görüşme planlandı; adayın güvenli takvimine yansıdı.');
      await Promise.allSettled([refresh(), onApplicationRefresh()]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Görüşme planlanamadı.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const submitReschedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rescheduleTarget || !reschedule || busy) return;
    const request = {
      startsAt: iso(reschedule.startsAt),
      endsAt: iso(reschedule.endsAt),
      timeZone: reschedule.timeZone,
      mode: reschedule.mode,
      location: reschedule.location.trim(),
      reason: reschedule.reason.trim(),
    };
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await rescheduleRecruiterInterview(
        publicRef,
        rescheduleTarget,
        request,
        mutationKey(request),
      );
      mutation.current = null;
      setRescheduleTarget(null);
      setReschedule(null);
      setSuccess('Görüşme yeni revizyonla yeniden planlandı.');
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Görüşme güncellenemedi.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const submitTransition = async () => {
    if (!transitionTarget || transitionReason.trim().length < 5 || busy) return;
    const request = { target: transitionTarget.target, reason: transitionReason.trim() };
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await transitionRecruiterInterview(
        publicRef,
        transitionTarget.interview,
        request.target,
        request.reason,
        mutationKey(request),
      );
      mutation.current = null;
      setTransitionTarget(null);
      setTransitionReason('');
      setSuccess(
        request.target === 'COMPLETED'
          ? 'Görüşme insan eylemiyle tamamlandı.'
          : 'Görüşme gerekçeli olarak iptal edildi.',
      );
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Görüşme kapatılamadı.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const submitScorecardForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scorecardTarget || !scorecard || !scorecard.confirmed || busy) return;
    const latestOwnScorecard = scorecardTarget.scorecards
      .filter((item) => item.actorRef === interviewerActorRef)
      .sort((left, right) => right.revision - left.revision)[0];
    const request = {
      policyVersion: 'structured-interview-v1' as const,
      jobRelatednessConfirmed: true as const,
      recommendation: scorecard.recommendation,
      ratings: scorecard.ratings.map((rating) => ({
        criterionKey: rating.criterionKey,
        rating: Number(rating.rating),
        evidence: rating.evidence.trim(),
      })),
      summary: scorecard.summary.trim(),
      ...(latestOwnScorecard ? { predecessorScorecardId: latestOwnScorecard.scorecardId } : {}),
    };
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const saved = await submitInterviewScorecard(
        scorecardTarget.interviewId,
        request,
        mutationKey(request),
      );
      mutation.current = null;
      setScorecardTarget(null);
      setScorecard(null);
      setSuccess(`İnsan scorecard’ı revizyon ${saved.revision} olarak kaydedildi.`);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Scorecard kaydedilemedi.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const sortedInterviews = useMemo(
    () => [...interviews].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [interviews],
  );

  return (
    <section
      className="rounded-2xl border border-border-strong bg-surface-default p-4"
      aria-labelledby="interview-workspace-heading"
      data-testid="recruiter-interview-workspace"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="interview-workspace-heading" className="text-base font-bold text-text-primary">
            Görüşme çalışma alanı
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Plan, rubric ve scorecard insan kontrollüdür; puanlar otomatik sıralama, ret veya işe
            alım kararı üretmez.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || busy}
          className="min-h-10 rounded-xl border border-border-subtle px-3 text-xs font-bold disabled:opacity-50"
        >
          Görüşmeleri yenile
        </button>
      </div>

      {scheduleAllowed && !scheduleOpen ? (
        <button
          type="button"
          onClick={() => {
            mutation.current = null;
            setSchedule(initialSchedule(interviewerLabel));
            setScheduleOpen(true);
          }}
          className="mt-4 min-h-11 w-full rounded-xl bg-action-primary px-4 text-sm font-bold text-action-primary-text"
        >
          Yeni görüşme planla
        </button>
      ) : null}
      {canManage && !scheduleAllowed && applicationStatus === 'UNDER_REVIEW' ? (
        <p className="mt-3 rounded-xl border border-state-info-border bg-state-info-bg p-3 text-xs leading-5 text-text-secondary">
          Görüşmeyi planlamak için önce işle ilgili insan değerlendirmesini kaydedin; son
          değerlendirici ilk görüşmeci olarak atanır.
        </p>
      ) : null}

      {scheduleOpen ? (
        <form
          onSubmit={(event) => void submitSchedule(event)}
          className="mt-4 space-y-4 rounded-2xl border border-action-primary bg-action-primary/5 p-4"
          aria-label="Yeni görüşme planı"
        >
          <h4 className="font-bold">Yeni görüşme planı</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-text-secondary">
              Görüşme türü
              <select
                value={schedule.type}
                onChange={(event) =>
                  setSchedule((current) => ({
                    ...current,
                    type: event.target.value as InterviewType,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Görüşme modu
              <select
                value={schedule.mode}
                onChange={(event) =>
                  setSchedule((current) => ({
                    ...current,
                    mode: event.target.value as InterviewMode,
                    location: event.target.value === 'VIDEO' ? 'https://' : '',
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              >
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Başlangıç
              <input
                type="datetime-local"
                required
                value={schedule.startsAt}
                onChange={(event) =>
                  setSchedule((current) => ({ ...current, startsAt: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Bitiş
              <input
                type="datetime-local"
                required
                value={schedule.endsAt}
                onChange={(event) =>
                  setSchedule((current) => ({ ...current, endsAt: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-text-secondary">
            Saat dilimi: <strong>{schedule.timeZone}</strong>. Girilen saat tarayıcınızın yerel
            saatinden güvenli UTC zamanına çevrilir.
          </p>
          <label className="block text-xs font-semibold text-text-secondary">
            Bağlantı, telefon veya adres
            <input
              required
              minLength={2}
              maxLength={500}
              value={schedule.location}
              onChange={(event) =>
                setSchedule((current) => ({ ...current, location: event.target.value }))
              }
              placeholder={schedule.mode === 'VIDEO' ? 'https://...' : 'Telefon veya açık adres'}
              className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Atanmış görüşmeci etiketi
            <input
              required
              minLength={2}
              maxLength={120}
              value={schedule.participantLabel}
              onChange={(event) =>
                setSchedule((current) => ({ ...current, participantLabel: event.target.value }))
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">İşle ilgili yapılandırılmış rubric</legend>
            {schedule.criteria.map((criterion, index) => (
              <div
                key={criterion.key}
                className="rounded-xl border border-border-subtle bg-surface-default p-3"
              >
                <p className="text-sm font-bold">{criterion.label}</p>
                <label className="mt-2 block text-xs font-semibold text-text-secondary">
                  Soru
                  <textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={2}
                    value={criterion.question}
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        criteria: current.criteria.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, question: event.target.value } : item,
                        ),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-2 block text-xs font-semibold text-text-secondary">
                  Kanıt kayıt yönlendirmesi
                  <textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={2}
                    value={criterion.evidencePrompt}
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        criteria: current.criteria.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, evidencePrompt: event.target.value }
                            : item,
                        ),
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl bg-action-primary px-4 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              {busy ? 'Plan kaydediliyor…' : 'Görüşmeyi kalıcı olarak planla'}
            </button>
            <button
              type="button"
              onClick={() => setScheduleOpen(false)}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-text-secondary" role="status">
          Görüşmeler yükleniyor…
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm text-state-danger-text"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="mt-4 rounded-xl border border-state-success-border bg-state-success-bg p-3 text-sm font-semibold"
          role="status"
        >
          {success}
        </p>
      ) : null}

      {!loading && !sortedInterviews.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-secondary">
          Bu başvuru için henüz görüşme planlanmadı.
        </p>
      ) : null}

      <ol className="mt-4 space-y-4">
        {sortedInterviews.map((interview) => (
          <li
            key={interview.interviewId}
            className="rounded-2xl border border-border-subtle bg-surface-muted p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="font-bold">{TYPE_LABELS[interview.type]}</h4>
                <p className="mt-1 text-xs text-text-secondary">
                  {formatDate(interview.startsAt, interview.timeZone)} –{' '}
                  {formatDate(interview.endsAt, interview.timeZone)} · {interview.timeZone}
                </p>
                <p className="mt-1 break-all text-xs text-text-secondary">
                  {MODE_LABELS[interview.mode]} · {interview.location}
                </p>
              </div>
              <span className="rounded-lg bg-surface-default px-2 py-1 text-xs font-bold">
                {STATUS_LABELS[interview.status]}
              </span>
            </div>

            <details className="mt-3 rounded-xl border border-border-subtle bg-surface-default p-3">
              <summary className="cursor-pointer text-sm font-bold">
                Rubric ve insan kayıtları
              </summary>
              <div className="mt-3 space-y-3 text-xs leading-5">
                <p>
                  <strong>Görüşmeciler:</strong>{' '}
                  {interview.participants.map((participant) => participant.displayLabel).join(', ')}
                </p>
                {interview.criteria.map((criterion) => (
                  <div key={criterion.key}>
                    <strong>{criterion.label}</strong>
                    <p>{criterion.question}</p>
                    <p className="text-text-secondary">{criterion.evidencePrompt}</p>
                  </div>
                ))}
                <p>
                  <strong>Scorecard sayısı:</strong> {interview.scorecards.length}
                </p>
              </div>
            </details>

            {canManage && interview.status === 'SCHEDULED' ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    mutation.current = null;
                    setScorecardTarget(interview);
                    setScorecard(initialScorecard(interview));
                  }}
                  className="min-h-10 rounded-xl bg-action-primary px-3 text-xs font-bold text-action-primary-text"
                >
                  İnsan scorecard’ı doldur
                </button>
                <button
                  type="button"
                  onClick={() => {
                    mutation.current = null;
                    setRescheduleTarget(interview);
                    setReschedule(initialReschedule(interview));
                  }}
                  className="min-h-10 rounded-xl border border-border-subtle bg-surface-default px-3 text-xs font-bold"
                >
                  Yeniden planla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    mutation.current = null;
                    setTransitionTarget({ interview, target: 'COMPLETED' });
                    setTransitionReason('Görüşme tamamlandı');
                  }}
                  className="min-h-10 rounded-xl border border-border-subtle bg-surface-default px-3 text-xs font-bold"
                >
                  Görüşmeyi tamamla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    mutation.current = null;
                    setTransitionTarget({ interview, target: 'CANCELLED' });
                    setTransitionReason('');
                  }}
                  className="min-h-10 rounded-xl border border-state-danger-border bg-surface-default px-3 text-xs font-bold"
                >
                  Görüşmeyi iptal et
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {rescheduleTarget && reschedule ? (
        <form
          onSubmit={(event) => void submitReschedule(event)}
          className="mt-4 space-y-3 rounded-2xl border border-border-strong bg-surface-muted p-4"
          aria-label="Görüşmeyi yeniden planla"
        >
          <h4 className="font-bold">Görüşmeyi yeniden planla</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Yeni başlangıç
              <input
                type="datetime-local"
                required
                value={reschedule.startsAt}
                onChange={(event) =>
                  setReschedule((current) =>
                    current ? { ...current, startsAt: event.target.value } : current,
                  )
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle px-3"
              />
            </label>
            <label className="text-xs font-semibold">
              Yeni bitiş
              <input
                type="datetime-local"
                required
                value={reschedule.endsAt}
                onChange={(event) =>
                  setReschedule((current) =>
                    current ? { ...current, endsAt: event.target.value } : current,
                  )
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle px-3"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold">
            Bağlantı, telefon veya adres
            <input
              required
              value={reschedule.location}
              onChange={(event) =>
                setReschedule((current) =>
                  current ? { ...current, location: event.target.value } : current,
                )
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle px-3"
            />
          </label>
          <label className="block text-xs font-semibold">
            Değişiklik gerekçesi
            <textarea
              required
              minLength={5}
              maxLength={500}
              value={reschedule.reason}
              onChange={(event) =>
                setReschedule((current) =>
                  current ? { ...current, reason: event.target.value } : current,
                )
              }
              className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl bg-action-primary px-3 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              Yeni revizyonu kaydet
            </button>
            <button
              type="button"
              onClick={() => setRescheduleTarget(null)}
              className="min-h-11 rounded-xl border border-border-subtle px-3 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {scorecardTarget && scorecard ? (
        <form
          onSubmit={(event) => void submitScorecardForm(event)}
          className="mt-4 space-y-4 rounded-2xl border border-border-strong bg-surface-muted p-4"
          aria-label="Görüşme insan scorecard'ı"
        >
          <h4 className="font-bold">Görüşme insan scorecard’ı</h4>
          <p className="text-xs leading-5 text-text-secondary">
            Her puan somut iş kanıtına bağlanır; sistem ortalama puan, sıralama veya otomatik karar
            üretmez.
          </p>
          {scorecardTarget.criteria.map((criterion, index) => (
            <fieldset
              key={criterion.key}
              className="rounded-xl border border-border-subtle bg-surface-default p-3"
            >
              <legend className="px-1 text-sm font-bold">{criterion.label}</legend>
              <p className="mt-1 text-xs text-text-secondary">{criterion.question}</p>
              <label className="mt-3 block text-xs font-semibold">
                Kanıt düzeyi (1–4)
                <select
                  required
                  value={scorecard.ratings[index]?.rating ?? ''}
                  onChange={(event) =>
                    setScorecard((current) =>
                      current
                        ? {
                            ...current,
                            ratings: current.ratings.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, rating: event.target.value } : item,
                            ),
                          }
                        : current,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle px-3"
                >
                  <option value="">Seçin</option>
                  <option value="1">1 · Yetersiz kanıt</option>
                  <option value="2">2 · Sınırlı kanıt</option>
                  <option value="3">3 · Yeterli kanıt</option>
                  <option value="4">4 · Güçlü kanıt</option>
                </select>
              </label>
              <label className="mt-3 block text-xs font-semibold">
                Somut iş kanıtı
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  value={scorecard.ratings[index]?.evidence ?? ''}
                  onChange={(event) =>
                    setScorecard((current) =>
                      current
                        ? {
                            ...current,
                            ratings: current.ratings.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, evidence: event.target.value }
                                : item,
                            ),
                          }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2"
                />
              </label>
            </fieldset>
          ))}
          <label className="block text-xs font-semibold">
            İnsan önerisi
            <select
              value={scorecard.recommendation}
              onChange={(event) =>
                setScorecard((current) =>
                  current
                    ? {
                        ...current,
                        recommendation: event.target.value as InterviewRecommendation,
                      }
                    : current,
                )
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle px-3"
            >
              <option value="ADVANCE">İlerletme önerisi</option>
              <option value="HOLD">Ek kanıt bekle</option>
              <option value="NO_HIRE">İlerletmeme önerisi</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Genel gerekçe
            <textarea
              required
              minLength={10}
              maxLength={4000}
              value={scorecard.summary}
              onChange={(event) =>
                setScorecard((current) =>
                  current ? { ...current, summary: event.target.value } : current,
                )
              }
              className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2"
            />
          </label>
          <label className="flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              checked={scorecard.confirmed}
              onChange={(event) =>
                setScorecard((current) =>
                  current ? { ...current, confirmed: event.target.checked } : current,
                )
              }
              className="mt-1 h-4 w-4"
            />
            Değerlendirme yalnız işle ilgili rubric ve görüşmede gözlemlenen kanıtlara dayanır;
            korunan nitelikler ve kişilik/culture-fit çıkarımı kullanılmamıştır.
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!scorecard.confirmed || busy}
              className="min-h-11 flex-1 rounded-xl bg-action-primary px-3 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              Immutable scorecard’ı kaydet
            </button>
            <button
              type="button"
              onClick={() => setScorecardTarget(null)}
              className="min-h-11 rounded-xl border border-border-subtle px-3 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {transitionTarget ? (
        <div className="mt-4 rounded-2xl border border-border-strong bg-surface-muted p-4">
          <h4 className="font-bold">
            {transitionTarget.target === 'COMPLETED' ? 'Görüşmeyi tamamla' : 'Görüşmeyi iptal et'}
          </h4>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Bu, otomatik bir karar değildir; sürümlü ve gerekçeli insan eylemi olarak kaydedilir.
          </p>
          <label className="mt-3 block text-xs font-semibold">
            Gerekçe
            <textarea
              required
              minLength={5}
              maxLength={500}
              value={transitionReason}
              onChange={(event) => setTransitionReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void submitTransition()}
              disabled={transitionReason.trim().length < 5 || busy}
              className="min-h-11 flex-1 rounded-xl bg-action-primary px-3 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              İnsan eylemini kaydet
            </button>
            <button
              type="button"
              onClick={() => setTransitionTarget(null)}
              className="min-h-11 rounded-xl border border-border-subtle px-3 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default RecruiterInterviewPanel;
