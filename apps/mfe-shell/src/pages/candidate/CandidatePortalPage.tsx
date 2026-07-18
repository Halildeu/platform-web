import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCandidateInterviews,
  getCandidateStatus,
  readCandidateSession,
  withdrawCandidateApplication,
  type ApplicationStatus,
  type CandidateInterviewDto,
  type CandidateSession,
  type CandidateStatusDto,
} from '../../features/ats-portals/api/application-api';

const STATUS_COPY: Record<ApplicationStatus, { label: string; description: string }> = {
  SUBMITTED: {
    label: 'Başvuru alındı',
    description: 'Formunuz kalıcı test başvurusu olarak kaydedildi.',
  },
  UNDER_REVIEW: {
    label: 'İnsan incelemesinde',
    description: 'İK ekibi başvurunuzu inceliyor; otomatik eleme veya puanlama yapılmaz.',
  },
  INTERVIEW_PENDING: {
    label: 'Mülakat planlaması',
    description: 'İnsan kontrollü mülakat planlama adımı bekleniyor.',
  },
  REJECTED: {
    label: 'Başvuru ilerletilmedi',
    description:
      'İK ekibi işle ilgili kanıtları insan değerlendirmesiyle inceledi ve süreci kapattı.',
  },
  WITHDRAWN: {
    label: 'Başvuru geri çekildi',
    description: 'Başvuruyu geri çektiniz; bu durum terminaldir.',
  },
};

const NEXT_ACTION_COPY: Record<CandidateStatusDto['nextAction'], string> = {
  WAIT_FOR_REVIEW:
    'Şu anda sizden bir işlem beklenmiyor. İK incelemesinin güncellenmesini bekleyin.',
  PREPARE_FOR_INTERVIEW:
    'Mülakat daveti ve planlama bilgileri için iletişim kanallarınızı kontrol edin.',
  NONE: 'Bu başvuru için açık bir sonraki adım yok.',
};

const INTERVIEW_TYPE_COPY: Record<CandidateInterviewDto['type'], string> = {
  SCREENING: 'Ön görüşme',
  TECHNICAL: 'Teknik görüşme',
  BEHAVIORAL: 'Yetkinlik görüşmesi',
  PANEL: 'Panel görüşmesi',
  FINAL: 'Final görüşmesi',
};

const INTERVIEW_MODE_COPY: Record<CandidateInterviewDto['mode'], string> = {
  VIDEO: 'Görüntülü',
  PHONE: 'Telefon',
  ONSITE: 'Yerinde',
};

const INTERVIEW_STATUS_COPY: Record<CandidateInterviewDto['status'], string> = {
  SCHEDULED: 'Planlandı',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal edildi',
};

const formatDate = (value: string, timeZone?: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));

const CandidatePortalPage = () => {
  const [session] = useState<CandidateSession | null>(() => readCandidateSession());
  const [status, setStatus] = useState<CandidateStatusDto | null>(null);
  const [interviews, setInterviews] = useState<CandidateInterviewDto[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [interviewsLoading, setInterviewsLoading] = useState(Boolean(session));
  const [error, setError] = useState('');
  const [interviewError, setInterviewError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalConfirmed, setWithdrawalConfirmed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setInterviewsLoading(true);
    setError('');
    setInterviewError('');
    const [statusResult, interviewResult] = await Promise.allSettled([
      getCandidateStatus(session),
      getCandidateInterviews(session),
    ]);
    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value);
    } else {
      setStatus(null);
      setError(
        statusResult.reason instanceof Error
          ? statusResult.reason.message
          : 'Başvuru durumu alınamadı.',
      );
    }
    if (interviewResult.status === 'fulfilled') {
      setInterviews(interviewResult.value);
    } else {
      setInterviews([]);
      setInterviewError(
        interviewResult.reason instanceof Error
          ? interviewResult.reason.message
          : 'Görüşme takvimi alınamadı.',
      );
    }
    setLoading(false);
    setInterviewsLoading(false);
  }, [session]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Aday Alanım | Açık Kariyer';
    void refresh();
    return () => {
      document.title = previousTitle;
    };
  }, [refresh]);

  const withdraw = async () => {
    if (!session || !status?.withdrawalAllowed || !withdrawalConfirmed || withdrawing) return;
    setWithdrawing(true);
    setActionError('');
    setSuccessMessage('');
    try {
      setStatus(await withdrawCandidateApplication(session));
      try {
        setInterviews(await getCandidateInterviews(session));
      } catch {
        setInterviewError('Başvuru geri çekildi; güncel görüşme takvimini yenileyin.');
      }
      setSuccessMessage('Başvurunuz geri çekildi. Güncel terminal durum aşağıda görünür.');
      setWithdrawalOpen(false);
      setWithdrawalConfirmed(false);
    } catch (withdrawError) {
      setActionError(
        withdrawError instanceof Error ? withdrawError.message : 'Başvuru geri çekilemedi.',
      );
      await refresh();
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="candidate-portal-page"
    >
      <header className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/candidate"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            aria-label="Aday Alanım ana sayfası"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-action-primary text-sm font-bold text-action-primary-text">
              A
            </span>
            <span>
              <span className="block text-sm font-bold">Açık Kariyer</span>
              <span className="block text-xs text-text-secondary">Aday Alanım</span>
            </span>
          </Link>
          <Link
            to="/jobs"
            className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle bg-surface-default px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted"
          >
            Açık pozisyonlar
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="relative overflow-hidden rounded-3xl bg-text-primary px-5 py-8 text-white shadow-lg sm:px-9 sm:py-12">
          <div className="relative max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
              Full ATS · Aday deneyimi
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              Başvurunuzun durumunu izleyin
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
              Bu sekmede yaptığınız son başvurunun kalıcı durumunu görürsünüz. Takip anahtarı URL’ye
              veya kalıcı tarayıcı depolamasına yazılmaz.
            </p>
          </div>
        </section>

        {!session ? (
          <section className="mt-6 rounded-3xl border border-border-subtle bg-surface-default p-6 text-center shadow-xs sm:p-10">
            <h2 className="text-2xl font-bold">Bu sekmede takip edilen başvuru yok</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-secondary">
              Güvenlik nedeniyle takip anahtarı yalnız başvuruyu gönderdiğiniz tarayıcı sekmesinde
              tutulur. Yeni bir sentetik başvuru göndererek akışı uçtan uca deneyebilirsiniz.
            </p>
            <Link
              to="/jobs"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text"
            >
              Açık pozisyonlara git
            </Link>
          </section>
        ) : null}

        {loading ? (
          <div
            className="mt-6 rounded-2xl border border-border-subtle bg-surface-default p-6 text-sm text-text-secondary"
            role="status"
          >
            Kalıcı başvuru durumu yükleniyor…
          </div>
        ) : null}

        {error ? (
          <div
            className="mt-6 rounded-2xl border border-state-danger-border bg-state-danger-bg p-5"
            role="alert"
          >
            <p className="font-semibold text-state-danger-text">Durum alınamadı.</p>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 rounded-xl border border-border-strong bg-surface-default px-4 py-2 text-sm font-bold"
            >
              Yeniden dene
            </button>
          </div>
        ) : null}

        {status ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section
              className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-7"
              aria-labelledby="candidate-journey-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-action-primary">
                    {status.jobTitle}
                  </p>
                  <h2 id="candidate-journey-heading" className="mt-1 text-2xl font-bold">
                    Başvuru yolculuğum
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  className="min-h-10 rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold hover:bg-surface-muted disabled:opacity-50"
                >
                  Durumu yenile
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-action-primary bg-action-primary/5 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-action-primary">
                  Güncel durum
                </p>
                <h3 className="mt-2 text-xl font-bold">{STATUS_COPY[status.status].label}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {STATUS_COPY[status.status].description}
                </p>
              </div>

              <section className="mt-6" aria-labelledby="candidate-next-action-heading">
                <h3 id="candidate-next-action-heading" className="text-base font-bold">
                  Sıradaki adım
                </h3>
                <p className="mt-2 rounded-xl border border-state-info-border bg-state-info-bg p-4 text-sm leading-6 text-text-secondary">
                  {NEXT_ACTION_COPY[status.nextAction]}
                </p>
              </section>

              <section className="mt-6" aria-labelledby="candidate-interviews-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id="candidate-interviews-heading" className="text-base font-bold">
                    Görüşme takvimim
                  </h3>
                  {interviewsLoading ? (
                    <span className="text-xs text-text-secondary" role="status">
                      Takvim yükleniyor…
                    </span>
                  ) : null}
                </div>
                {interviewError ? (
                  <p
                    className="mt-3 rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm text-state-danger-text"
                    role="alert"
                  >
                    {interviewError}
                  </p>
                ) : null}
                {!interviewsLoading && !interviewError && !interviews.length ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border-subtle p-4 text-sm leading-6 text-text-secondary">
                    Henüz planlanmış bir görüşme yok. Planlandığında tarih, saat dilimi, yöntem ve
                    katılım bilgisi burada görünür.
                  </p>
                ) : null}
                {interviews.length ? (
                  <ol className="mt-3 space-y-3">
                    {[...interviews]
                      .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
                      .map((interview) => (
                        <li
                          key={interview.interviewId}
                          className="rounded-2xl border border-border-subtle bg-surface-muted p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold">{INTERVIEW_TYPE_COPY[interview.type]}</h4>
                              <p className="mt-1 text-sm text-text-secondary">
                                {formatDate(interview.startsAt, interview.timeZone)} –{' '}
                                {formatDate(interview.endsAt, interview.timeZone)}
                              </p>
                              <p className="mt-1 text-xs text-text-secondary">
                                Saat dilimi: {interview.timeZone}
                              </p>
                            </div>
                            <span className="rounded-lg bg-surface-default px-2 py-1 text-xs font-bold">
                              {INTERVIEW_STATUS_COPY[interview.status]}
                            </span>
                          </div>
                          <p className="mt-3 text-sm">
                            <strong>{INTERVIEW_MODE_COPY[interview.mode]}:</strong>{' '}
                            {interview.mode === 'VIDEO' &&
                            interview.location.startsWith('https://') ? (
                              <a
                                href={interview.location}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all font-semibold text-action-primary underline"
                              >
                                Güvenli görüşme bağlantısını aç
                              </a>
                            ) : (
                              interview.location
                            )}
                          </p>
                          <p className="mt-3 text-xs leading-5 text-text-secondary">
                            Bu görünüm yalnız katılım için gereken program bilgisini içerir; iç
                            rubric, görüşmeci kimliği, scorecard ve karar gerekçesi paylaşılmaz.
                          </p>
                        </li>
                      ))}
                  </ol>
                ) : null}
              </section>

              <section className="mt-6" aria-labelledby="candidate-history-heading">
                <h3 id="candidate-history-heading" className="text-base font-bold">
                  Durum geçmişi
                </h3>
                <ol className="mt-3 space-y-3 border-l border-border-subtle pl-5">
                  {(status.history?.length
                    ? status.history
                    : [{ status: status.status, occurredAt: status.updatedAt }]
                  ).map((event, index) => (
                    <li key={`${event.status}-${event.occurredAt}-${index}`} className="relative">
                      <span
                        className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full bg-action-primary"
                        aria-hidden="true"
                      />
                      <h4 className="text-sm font-bold">{STATUS_COPY[event.status].label}</h4>
                      <p className="mt-1 text-xs text-text-secondary">
                        {formatDate(event.occurredAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              {status.withdrawalAllowed ? (
                <section
                  className="mt-6 border-t border-border-subtle pt-5"
                  aria-labelledby="withdrawal-heading"
                >
                  <h3 id="withdrawal-heading" className="text-base font-bold">
                    Başvuruyu geri çek
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    Bu işlem başvuruyu terminal duruma getirir; İK ekibi başvuruyu ilerletemez.
                  </p>
                  {!withdrawalOpen ? (
                    <button
                      type="button"
                      onClick={() => setWithdrawalOpen(true)}
                      className="mt-3 min-h-11 rounded-xl border border-state-danger-border bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      Geri çekme onayını aç
                    </button>
                  ) : (
                    <div className="mt-3 rounded-xl border border-state-danger-border bg-state-danger-bg p-4">
                      <label className="flex items-start gap-2 text-sm leading-5 text-text-primary">
                        <input
                          type="checkbox"
                          checked={withdrawalConfirmed}
                          onChange={(event) => setWithdrawalConfirmed(event.target.checked)}
                          className="mt-1 h-4 w-4"
                        />
                        Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını
                        doğruluyorum.
                      </label>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void withdraw()}
                          disabled={!withdrawalConfirmed || withdrawing}
                          className="min-h-11 rounded-xl bg-state-danger-text px-4 text-sm font-bold text-text-inverse disabled:opacity-50"
                        >
                          {withdrawing ? 'Geri çekiliyor…' : 'Başvuruyu geri çek'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWithdrawalOpen(false);
                            setWithdrawalConfirmed(false);
                          }}
                          className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold"
                        >
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : null}

              {successMessage ? (
                <p
                  role="status"
                  className="mt-5 rounded-xl border border-state-success-border bg-state-success-bg p-4 text-sm font-semibold text-text-primary"
                >
                  {successMessage}
                </p>
              ) : null}
              {actionError ? (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-state-danger-border bg-state-danger-bg p-4 text-sm font-semibold text-state-danger-text"
                >
                  {actionError}
                </p>
              ) : null}
            </section>

            <aside className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-6">
              <h2 className="text-lg font-bold">Başvuru bilgisi</h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Referans</dt>
                  <dd className="mt-1 break-all font-mono font-bold">{status.publicRef}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Durum</dt>
                  <dd className="mt-1 font-bold">{STATUS_COPY[status.status].label}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Gönderildi</dt>
                  <dd className="mt-1">{formatDate(status.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Son güncelleme</dt>
                  <dd className="mt-1">{formatDate(status.updatedAt)}</dd>
                </div>
              </dl>
              <div className="mt-6 rounded-xl border border-state-info-border bg-state-info-bg p-4 text-xs leading-5 text-text-secondary">
                Bu ekran ad, e-posta, telefon veya CV içeriğini geri döndürmez; yalnız minimal
                başvuru durumunu gösterir.
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
};

export default CandidatePortalPage;
