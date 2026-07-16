import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ATS_PORTAL_SAFETY_BOUNDARIES,
  CANDIDATE_DEMO_JOURNEY,
  CANDIDATE_PORTAL_ENTRY,
  CANDIDATE_PROFILE_TASKS,
} from '../../features/ats-portals/model/ats-portal-registry';

const TASK_PRESENTATION = {
  READY: {
    label: 'Hazır',
    className: 'border-state-success-border bg-state-success-bg text-text-primary',
  },
  IN_PROGRESS: {
    label: 'Sizi bekliyor',
    className: 'border-state-info-border bg-state-info-bg text-text-primary',
  },
  GATED: {
    label: 'Canlı hesap kapısı',
    className: 'border-state-warning-border bg-state-warning-bg text-text-primary',
  },
} as const;

const JOURNEY_PRESENTATION = {
  CURRENT: {
    label: 'Şimdi',
    dotClassName: 'bg-action-primary text-action-primary-text',
    cardClassName: 'border-action-primary bg-action-primary/5',
  },
  NEXT: {
    label: 'Sıradaki',
    dotClassName: 'bg-state-info-bg text-text-primary',
    cardClassName: 'border-state-info-border bg-state-info-bg',
  },
  GATED: {
    label: 'Kapılı',
    dotClassName: 'bg-surface-muted text-text-secondary',
    cardClassName: 'border-border-subtle bg-surface-default',
  },
} as const;

const CandidatePortalPage = () => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Aday Alanım | Açık Kariyer';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="candidate-portal-page"
    >
      <header className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to={CANDIDATE_PORTAL_ENTRY.route}
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
          <nav className="flex items-center gap-2" aria-label="Aday alanı">
            <Link
              to="/jobs"
              className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle bg-surface-default px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Açık pozisyonlar
            </Link>
            <span className="hidden rounded-full border border-state-info-border bg-state-info-bg px-3 py-1.5 text-xs font-semibold text-text-primary sm:inline-flex">
              Sentetik önizleme
            </span>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="relative overflow-hidden rounded-3xl bg-text-primary px-5 py-8 text-white shadow-lg sm:px-9 sm:py-12">
          <div
            className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/5"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-20 right-20 h-44 w-44 rounded-full bg-action-primary/20"
            aria-hidden="true"
          />
          <div className="relative max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
              Full ATS · Aday deneyimi
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              Kariyer yolculuğunuz tek yerde
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
              İlanları keşfedin, başvuru taslağınızı hazırlayın ve hangi adımın sizin kontrolünüzde
              olduğunu görün. Bu ilk yüzey sentetiktir; gerçek hesap veya kişisel veri kullanmaz.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/jobs"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text shadow-sm hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-text-primary"
              >
                Açık pozisyonlara göz at
              </Link>
              <Link
                to="/jobs/urun-yoneticisi/apply"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-text-primary"
              >
                Örnek başvuruyu düzenle
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Aday alanı özeti">
          {[
            ['1', 'Başvuru taslağı', 'Sentetik ve kaydedilmez'],
            ['%72', 'Örnek profil hazırlığı', 'Alanları siz doğrularsınız'],
            ['0', 'Gerçek gönderim', 'Canlı yazma kapalı'],
          ].map(([value, label, detail]) => (
            <article
              key={label}
              className="rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs"
            >
              <p className="text-3xl font-bold tracking-tight text-text-primary">{value}</p>
              <h2 className="mt-2 text-sm font-semibold text-text-primary">{label}</h2>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section
            className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-7"
            aria-labelledby="candidate-journey-heading"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-action-primary">
                  Başvuru akışı
                </p>
                <h2 id="candidate-journey-heading" className="mt-1 text-2xl font-bold">
                  Yolculuğum
                </h2>
              </div>
              <span className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-text-secondary">
                Örnek akış
              </span>
            </div>

            <ol className="mt-6 space-y-3">
              {CANDIDATE_DEMO_JOURNEY.map((step, index) => {
                const presentation = JOURNEY_PRESENTATION[step.state];
                return (
                  <li
                    key={step.id}
                    className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-2xl border p-4 ${presentation.cardClassName}`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${presentation.dotClassName}`}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{step.label}</h3>
                        <span className="rounded-full border border-border-subtle bg-surface-default px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                          {presentation.label}
                        </span>
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

          <section
            className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-7"
            aria-labelledby="candidate-profile-heading"
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-action-primary">
              Hazırlık kontrolü
            </p>
            <h2 id="candidate-profile-heading" className="mt-1 text-2xl font-bold">
              Profilim
            </h2>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted"
              aria-hidden="true"
            >
              <div className="h-full w-[72%] rounded-full bg-action-primary" />
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              %72 örnek hazırlık · Bu oran gerçek hesap verisi değildir.
            </p>

            <ul className="mt-5 space-y-3">
              {CANDIDATE_PROFILE_TASKS.map((task) => {
                const presentation = TASK_PRESENTATION[task.state];
                return (
                  <li key={task.id} className="rounded-2xl border border-border-subtle p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{task.label}</h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${presentation.className}`}
                      >
                        {presentation.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-text-secondary">{task.detail}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside
          className="mt-6 rounded-3xl border border-state-warning-border bg-state-warning-bg p-5 sm:p-7"
          aria-labelledby="candidate-safety-heading"
          data-testid="candidate-portal-boundary"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
                Güvenli kullanım
              </p>
              <h2 id="candidate-safety-heading" className="mt-1 text-xl font-bold">
                Kontrol sizde, gerçek veri kapalı
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Bu alan ürün deneyimini göstermek içindir. Canlı aday hesabı ve kalıcı başvuru,
                kimlik ve veri yönetişimi kapıları doğrulanmadan açılmaz.
              </p>
            </div>
            <ul className="grid gap-2 text-sm text-text-secondary sm:grid-cols-3">
              {ATS_PORTAL_SAFETY_BOUNDARIES.map((boundary) => (
                <li
                  key={boundary}
                  className="rounded-xl border border-state-warning-border bg-surface-default/70 p-3"
                >
                  {boundary}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default CandidatePortalPage;
