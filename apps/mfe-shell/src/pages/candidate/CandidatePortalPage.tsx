import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCandidateStatus,
  readCandidateSession,
  type ApplicationStatus,
  type CandidateSession,
  type CandidateStatusDto,
} from '../../features/ats-portals/api/application-api';

const STATUS_STEPS: ReadonlyArray<{
  id: ApplicationStatus;
  label: string;
  description: string;
}> = [
  {
    id: 'SUBMITTED',
    label: 'Başvuru alındı',
    description: 'Formunuz kalıcı test başvurusu olarak kaydedildi.',
  },
  {
    id: 'UNDER_REVIEW',
    label: 'İnsan incelemesinde',
    description: 'İK ekibi başvurunuzu inceliyor; otomatik eleme veya puanlama yapılmaz.',
  },
  {
    id: 'INTERVIEW_PENDING',
    label: 'Mülakat planlaması',
    description: 'İnsan kontrollü mülakat planlama adımı bekleniyor.',
  },
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const CandidatePortalPage = () => {
  const [session] = useState<CandidateSession | null>(() => readCandidateSession());
  const [status, setStatus] = useState<CandidateStatusDto | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setStatus(await getCandidateStatus(session));
    } catch (loadError) {
      setStatus(null);
      setError(loadError instanceof Error ? loadError.message : 'Başvuru durumu alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Aday Alanım | Açık Kariyer';
    void refresh();
    return () => {
      document.title = previousTitle;
    };
  }, [refresh]);

  const currentIndex = status ? STATUS_STEPS.findIndex((step) => step.id === status.status) : -1;

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

              <ol className="mt-6 space-y-3">
                {STATUS_STEPS.map((step, index) => {
                  const reached = index <= currentIndex;
                  const current = index === currentIndex;
                  return (
                    <li
                      key={step.id}
                      className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-2xl border p-4 ${
                        current
                          ? 'border-action-primary bg-action-primary/5'
                          : reached
                            ? 'border-state-success-border bg-state-success-bg'
                            : 'border-border-subtle bg-surface-subtle'
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${
                          reached
                            ? 'bg-action-primary text-action-primary-text'
                            : 'bg-surface-default text-text-secondary'
                        }`}
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{step.label}</h3>
                          {current ? (
                            <span className="rounded-full border border-action-primary px-2 py-0.5 text-[11px] font-bold">
                              Şimdi
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                          {step.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
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
                  <dd className="mt-1 font-bold">{STATUS_STEPS[currentIndex]?.label}</dd>
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
