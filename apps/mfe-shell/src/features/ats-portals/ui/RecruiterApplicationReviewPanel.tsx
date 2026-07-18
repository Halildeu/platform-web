import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createApplicationIdempotencyKey,
  getRecruiterApplication,
  submitRecruiterApplicationEvaluation,
  updateRecruiterApplicationStatus,
  type ApplicationStatus,
  type RecruiterApplicationDetailDto,
  type RecruiterApplicationDto,
  type RecruiterApplicationEvaluationRequest,
  type RecruiterEvaluationRecommendation,
} from '../api/application-api';
import RecruiterInterviewPanel from './RecruiterInterviewPanel';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'Başvuru alındı',
  UNDER_REVIEW: 'İnsan incelemesinde',
  INTERVIEW_PENDING: 'Mülakat planlaması bekliyor',
  REJECTED: 'İnsan kararıyla reddedildi',
  WITHDRAWN: 'Aday tarafından geri çekildi',
};

const RECOMMENDATION_LABELS: Record<RecruiterEvaluationRecommendation, string> = {
  ADVANCE: 'İlerletme önerisi',
  HOLD: 'Ek kanıt bekle',
  NO_HIRE: 'İlerletmeme önerisi',
};

const SCORECARD_CRITERIA = [
  { key: 'role_requirements', label: 'Rol gereklilikleriyle eşleşme' },
  { key: 'relevant_experience', label: 'İşle ilgili deneyim kanıtı' },
  { key: 'collaboration_evidence', label: 'İş birliği ve iletişim kanıtı' },
] as const;

type EvaluationForm = {
  recommendation: RecruiterEvaluationRecommendation;
  summary: string;
  jobRelatednessConfirmed: boolean;
  criteria: Array<{ key: string; label: string; rating: string; evidence: string }>;
};

const emptyEvaluationForm = (): EvaluationForm => ({
  recommendation: 'HOLD',
  summary: '',
  jobRelatednessConfirmed: false,
  criteria: SCORECARD_CRITERIA.map((criterion) => ({ ...criterion, rating: '', evidence: '' })),
});

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const latestEvaluationOf = (detail: RecruiterApplicationDetailDto | null) => {
  if (!detail?.evaluations.length) return null;
  return detail.evaluations.reduce((latest, evaluation) =>
    evaluation.revision > latest.revision ? evaluation : latest,
  );
};

interface RecruiterApplicationReviewPanelProps {
  publicRef: string | null;
  canManage: boolean;
  onApplicationChanged: (application: RecruiterApplicationDto) => void;
}

const RecruiterApplicationReviewPanel = ({
  publicRef,
  canManage,
  onApplicationChanged,
}: RecruiterApplicationReviewPanelProps) => {
  const [detail, setDetail] = useState<RecruiterApplicationDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [updating, setUpdating] = useState(false);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [evaluationForm, setEvaluationForm] = useState<EvaluationForm>(emptyEvaluationForm);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [rejectionConfirmed, setRejectionConfirmed] = useState(false);
  const evaluationMutation = useRef<{ signature: string; key: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loadDetail = useCallback(async () => {
    if (!publicRef) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      setDetail(await getRecruiterApplication(publicRef));
    } catch (error) {
      setDetail(null);
      setLoadError(error instanceof Error ? error.message : 'Başvuru detayı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [publicRef]);

  useEffect(() => {
    setActionError('');
    setSuccessMessage('');
    setEvaluationOpen(false);
    setRejectionOpen(false);
    setRejectionConfirmed(false);
    evaluationMutation.current = null;
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (detail) headingRef.current?.focus();
  }, [detail?.application.publicRef]);

  const latestEvaluation = useMemo(() => latestEvaluationOf(detail), [detail]);
  const terminal =
    detail?.application.status === 'REJECTED' || detail?.application.status === 'WITHDRAWN';

  const changeStatus = async (toStatus: 'UNDER_REVIEW' | 'INTERVIEW_PENDING' | 'REJECTED') => {
    if (!canManage || !detail || updating || terminal) return;
    setUpdating(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const updated = await updateRecruiterApplicationStatus(
        detail.application.publicRef,
        detail.application.version,
        toStatus,
      );
      onApplicationChanged(updated);
      setSuccessMessage(`Durum güncellendi: ${STATUS_LABELS[updated.status]}.`);
      setRejectionOpen(false);
      setRejectionConfirmed(false);
      await loadDetail();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Durum güncellenemedi.');
      await loadDetail();
    } finally {
      setUpdating(false);
    }
  };

  const openEvaluation = () => {
    if (latestEvaluation) {
      const existing = new Map(
        latestEvaluation.criteria.map((criterion) => [criterion.key, criterion]),
      );
      setEvaluationForm({
        recommendation: latestEvaluation.recommendation,
        summary: latestEvaluation.summary,
        jobRelatednessConfirmed: false,
        criteria: SCORECARD_CRITERIA.map((criterion) => {
          const previous = existing.get(criterion.key);
          return {
            ...criterion,
            rating: previous ? String(previous.rating) : '',
            evidence: previous?.evidence ?? '',
          };
        }),
      });
    } else {
      setEvaluationForm(emptyEvaluationForm());
    }
    setEvaluationOpen(true);
    setActionError('');
    setSuccessMessage('');
    evaluationMutation.current = null;
  };

  const submitEvaluation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail || !canManage || terminal || updating) return;
    if (!evaluationForm.jobRelatednessConfirmed) {
      setActionError('Değerlendirmenin yalnız işle ilgili ölçütlere dayandığını doğrulayın.');
      return;
    }
    const request: RecruiterApplicationEvaluationRequest = {
      policyVersion: 'structured-evaluation-v1',
      jobRelatednessConfirmed: true,
      recommendation: evaluationForm.recommendation,
      criteria: evaluationForm.criteria.map((criterion) => ({
        key: criterion.key,
        label: criterion.label,
        rating: Number(criterion.rating),
        evidence: criterion.evidence.trim(),
      })),
      summary: evaluationForm.summary.trim(),
      ...(latestEvaluation ? { predecessorEvaluationId: latestEvaluation.evaluationId } : {}),
    };
    const signature = JSON.stringify(request);
    if (evaluationMutation.current?.signature !== signature) {
      evaluationMutation.current = { signature, key: createApplicationIdempotencyKey() };
    }
    setUpdating(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const saved = await submitRecruiterApplicationEvaluation(
        detail.application.publicRef,
        request,
        evaluationMutation.current.key,
      );
      setSuccessMessage(`İnsan değerlendirmesi revizyon ${saved.revision} olarak kaydedildi.`);
      setEvaluationOpen(false);
      evaluationMutation.current = null;
      await loadDetail();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Değerlendirme kaydedilemedi.');
      await loadDetail();
    } finally {
      setUpdating(false);
    }
  };

  const refreshAfterInterviewChange = async () => {
    if (!detail) return;
    const refreshed = await getRecruiterApplication(detail.application.publicRef);
    setDetail(refreshed);
    onApplicationChanged(refreshed.application);
  };

  const renderApplication = () => {
    if (!publicRef) {
      return (
        <p className="mt-5 rounded-2xl border border-dashed border-border-subtle bg-surface-muted p-4 text-sm leading-6 text-text-secondary">
          Kalıcı bir başvuru kartındaki “Başvuruyu incele” düğmesini seçin.
        </p>
      );
    }
    if (loading) {
      return (
        <p className="mt-5 text-sm font-semibold text-text-secondary" role="status">
          Yetkili başvuru detayı yükleniyor…
        </p>
      );
    }
    if (loadError || !detail) {
      return (
        <div
          className="mt-5 rounded-xl border border-state-danger-border bg-state-danger-bg p-4"
          role="alert"
        >
          <p className="text-sm font-semibold text-text-primary">
            {loadError || 'Başvuru detayı yüklenemedi.'}
          </p>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="mt-3 min-h-10 rounded-xl border border-border-strong bg-surface-default px-3 text-sm font-bold"
          >
            Detayı yeniden yükle
          </button>
        </div>
      );
    }

    const application = detail.application;
    return (
      <div className="mt-5 space-y-5">
        <section className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
          <p className="font-bold">{application.fullName}</p>
          <p className="mt-1 text-sm text-text-secondary">{application.jobTitle}</p>
          <p className="mt-3 break-all font-mono text-xs text-text-secondary">
            {application.publicRef}
          </p>
          <p className="mt-3 text-sm font-semibold text-text-primary">
            {STATUS_LABELS[application.status]}
          </p>
        </section>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-text-secondary">İletişim</dt>
            <dd className="mt-1 break-words">
              {application.email}
              <br />
              {application.phone} · {application.city}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-secondary">Profesyonel özet</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-6">{application.summary}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-secondary">Deneyim</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-6">{application.experience}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-secondary">Eğitim</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-6">{application.education}</dd>
          </div>
          {application.note ? (
            <div>
              <dt className="text-xs font-semibold text-text-secondary">Aday notu</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-6">{application.note}</dd>
            </div>
          ) : null}
        </dl>

        <section aria-labelledby="application-actions-heading">
          <h3 id="application-actions-heading" className="text-sm font-bold text-text-primary">
            Açık insan eylemleri
          </h3>
          {!canManage ? (
            <p className="mt-2 rounded-xl border border-border-subtle bg-surface-muted p-4 text-sm font-semibold text-text-secondary">
              Bu başvuruyu görüntüleyebilirsiniz; değerlendirme ve aşama değiştirme yetkiniz yok.
            </p>
          ) : terminal ? (
            <p className="mt-2 rounded-xl border border-border-subtle bg-surface-muted p-4 text-sm font-semibold text-text-secondary">
              Bu başvuru terminal durumdadır; yeni değerlendirme veya aşama değişikliği yapılamaz.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {application.status === 'SUBMITTED' ? (
                <button
                  type="button"
                  onClick={() => void changeStatus('UNDER_REVIEW')}
                  disabled={updating}
                  className="min-h-11 w-full rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text disabled:opacity-50"
                >
                  İnsan incelemesini başlat
                </button>
              ) : null}
              {application.status === 'UNDER_REVIEW' ? (
                <button
                  type="button"
                  onClick={() => void changeStatus('INTERVIEW_PENDING')}
                  disabled={updating || !latestEvaluation}
                  className="min-h-11 w-full rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text disabled:opacity-50"
                >
                  Mülakat planlamasına al
                </button>
              ) : null}
              {application.status === 'UNDER_REVIEW' && !latestEvaluation ? (
                <p className="text-xs leading-5 text-text-secondary">
                  Mülakata ilerletmeden önce işle ilgili, yapılandırılmış insan değerlendirmesi
                  kaydedin.
                </p>
              ) : null}
              <button
                type="button"
                onClick={openEvaluation}
                disabled={updating}
                className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-4 py-2.5 text-sm font-bold text-text-primary disabled:opacity-50"
              >
                {latestEvaluation
                  ? 'Değerlendirmeyi yeni revizyonla düzelt'
                  : 'Yapılandırılmış değerlendirme yap'}
              </button>
              {!rejectionOpen ? (
                <button
                  type="button"
                  onClick={() => setRejectionOpen(true)}
                  disabled={!latestEvaluation || updating}
                  className="min-h-11 w-full rounded-xl border border-state-danger-border bg-surface-default px-4 py-2.5 text-sm font-bold text-text-primary disabled:opacity-50"
                >
                  Ret kararını hazırla
                </button>
              ) : (
                <div className="rounded-xl border border-state-danger-border bg-state-danger-bg p-4">
                  <p className="text-sm font-bold text-text-primary">Geri alınamaz insan kararı</p>
                  <label className="mt-3 flex items-start gap-2 text-sm leading-5 text-text-primary">
                    <input
                      type="checkbox"
                      checked={rejectionConfirmed}
                      onChange={(event) => setRejectionConfirmed(event.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    Son yapılandırılmış değerlendirmeyi inceledim; kararı korunan niteliklere değil
                    işle ilgili kanıtlara dayandırıyorum.
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void changeStatus('REJECTED')}
                      disabled={!rejectionConfirmed || updating}
                      className="min-h-10 flex-1 rounded-xl bg-state-danger-text px-3 text-sm font-bold text-text-inverse disabled:opacity-50"
                    >
                      Adayı reddet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectionOpen(false);
                        setRejectionConfirmed(false);
                      }}
                      className="min-h-10 rounded-xl border border-border-subtle bg-surface-default px-3 text-sm font-bold"
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}
              {!latestEvaluation ? (
                <p className="text-xs leading-5 text-text-secondary">
                  Ret eylemi de gerekçeli insan değerlendirmesi kaydedilene kadar kapalıdır.
                </p>
              ) : null}
            </div>
          )}
        </section>

        {evaluationOpen ? (
          <form
            onSubmit={(event) => void submitEvaluation(event)}
            className="rounded-2xl border border-border-strong bg-surface-muted p-4"
            aria-labelledby="scorecard-heading"
          >
            <h3 id="scorecard-heading" className="text-base font-bold text-text-primary">
              Yapılandırılmış insan scorecard’ı
            </h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Puanlar otomatik sıralama veya aşama üretmez; her ölçüt için gözlemlenebilir iş kanıtı
              zorunludur.
            </p>
            <div className="mt-4 space-y-4">
              {evaluationForm.criteria.map((criterion, index) => (
                <fieldset
                  key={criterion.key}
                  className="rounded-xl border border-border-subtle bg-surface-default p-3"
                >
                  <legend className="px-1 text-sm font-bold text-text-primary">
                    {criterion.label}
                  </legend>
                  <label className="mt-2 block text-xs font-semibold text-text-secondary">
                    Kanıt düzeyi (1–4)
                    <select
                      required
                      value={criterion.rating}
                      onChange={(event) =>
                        setEvaluationForm((current) => ({
                          ...current,
                          criteria: current.criteria.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, rating: event.target.value } : item,
                          ),
                        }))
                      }
                      className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
                    >
                      <option value="">Seçin</option>
                      <option value="1">1 · Kanıt yok / yetersiz</option>
                      <option value="2">2 · Sınırlı kanıt</option>
                      <option value="3">3 · Yeterli kanıt</option>
                      <option value="4">4 · Güçlü kanıt</option>
                    </select>
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-text-secondary">
                    İşle ilgili somut kanıt
                    <textarea
                      required
                      minLength={10}
                      maxLength={2000}
                      value={criterion.evidence}
                      onChange={(event) =>
                        setEvaluationForm((current) => ({
                          ...current,
                          criteria: current.criteria.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, evidence: event.target.value } : item,
                          ),
                        }))
                      }
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-sm"
                    />
                  </label>
                </fieldset>
              ))}
            </div>
            <fieldset className="mt-4">
              <legend className="text-sm font-bold text-text-primary">İnsan önerisi</legend>
              <div className="mt-2 grid gap-2">
                {(Object.keys(RECOMMENDATION_LABELS) as RecruiterEvaluationRecommendation[]).map(
                  (recommendation) => (
                    <label
                      key={recommendation}
                      className="flex min-h-10 items-center gap-2 rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="recommendation"
                        value={recommendation}
                        checked={evaluationForm.recommendation === recommendation}
                        onChange={() =>
                          setEvaluationForm((current) => ({ ...current, recommendation }))
                        }
                      />
                      {RECOMMENDATION_LABELS[recommendation]}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm font-bold text-text-primary">
              Genel gerekçe
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={evaluationForm.summary}
                onChange={(event) =>
                  setEvaluationForm((current) => ({ ...current, summary: event.target.value }))
                }
                rows={4}
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="mt-4 flex items-start gap-2 text-sm leading-5 text-text-primary">
              <input
                type="checkbox"
                checked={evaluationForm.jobRelatednessConfirmed}
                onChange={(event) =>
                  setEvaluationForm((current) => ({
                    ...current,
                    jobRelatednessConfirmed: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4"
              />
              Değerlendirme yalnız ilandaki iş gereklilikleri ve adayın sunduğu işle ilgili
              kanıtlara dayanır; korunan nitelikler kullanılmamıştır.
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={updating}
                className="min-h-11 flex-1 rounded-xl bg-action-primary px-4 text-sm font-bold text-action-primary-text disabled:opacity-50"
              >
                {updating ? 'Kaydediliyor…' : 'Immutable değerlendirmeyi kaydet'}
              </button>
              <button
                type="button"
                onClick={() => setEvaluationOpen(false)}
                className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold"
              >
                İptal
              </button>
            </div>
          </form>
        ) : null}

        <RecruiterInterviewPanel
          publicRef={application.publicRef}
          applicationStatus={application.status}
          canManage={canManage && !terminal}
          interviewerActorRef={latestEvaluation?.actorRef ?? null}
          interviewerLabel="Atanmış İK görüşmecisi"
          onApplicationRefresh={refreshAfterInterviewChange}
        />

        {successMessage ? (
          <p
            role="status"
            className="rounded-xl border border-state-success-border bg-state-success-bg p-3 text-sm font-semibold text-text-primary"
          >
            {successMessage}
          </p>
        ) : null}
        {actionError ? (
          <p
            role="alert"
            className="rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm font-semibold text-text-primary"
          >
            {actionError}
          </p>
        ) : null}

        <section aria-labelledby="evaluation-history-heading">
          <h3 id="evaluation-history-heading" className="text-sm font-bold text-text-primary">
            Değerlendirme revizyonları
          </h3>
          {detail.evaluations.length ? (
            <ol className="mt-2 space-y-2">
              {[...detail.evaluations]
                .sort((left, right) => right.revision - left.revision)
                .map((evaluation) => (
                  <li key={evaluation.evaluationId}>
                    <details
                      className="rounded-xl border border-border-subtle bg-surface-muted p-3"
                      open={evaluation.evaluationId === latestEvaluation?.evaluationId}
                    >
                      <summary className="cursor-pointer text-sm font-bold text-text-primary">
                        Revizyon {evaluation.revision} ·{' '}
                        {RECOMMENDATION_LABELS[evaluation.recommendation]}
                      </summary>
                      <p className="mt-2 text-xs text-text-secondary">
                        {formatDate(evaluation.createdAt)} · {evaluation.actorRef}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                        {evaluation.summary}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {evaluation.criteria.map((criterion) => (
                          <li key={criterion.key} className="text-xs leading-5">
                            <strong>
                              {criterion.label}: {criterion.rating}/4
                            </strong>
                            <br />
                            {criterion.evidence}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">Henüz insan değerlendirmesi yok.</p>
          )}
        </section>

        <section aria-labelledby="candidate-history-heading">
          <h3 id="candidate-history-heading" className="text-sm font-bold text-text-primary">
            Aday süreç geçmişi
          </h3>
          <ol className="mt-2 space-y-2 border-l border-border-subtle pl-4">
            {detail.history.map((event) => (
              <li key={event.eventId} className="text-xs leading-5 text-text-secondary">
                <strong className="text-text-primary">{STATUS_LABELS[event.toStatus]}</strong>
                <br />
                {formatDate(event.occurredAt)} · {event.actorRef}
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  };

  return (
    <aside
      id="recruiter-review-panel"
      className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs 2xl:sticky 2xl:top-6 2xl:self-start"
      data-testid="recruiter-review-panel"
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
        Yetkili başvuru detayı
      </p>
      <h2 ref={headingRef} className="mt-1 text-xl font-bold outline-hidden" tabIndex={-1}>
        Aday bilgileri ve insan kararı
      </h2>
      {renderApplication()}
    </aside>
  );
};

export default RecruiterApplicationReviewPanel;
