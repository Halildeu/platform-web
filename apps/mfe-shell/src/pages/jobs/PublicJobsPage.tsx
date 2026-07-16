import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_JOBS } from './publicJobCatalog';

const PublicJobsPage = () => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Açık Pozisyonlar | Açık Kariyer';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="public-jobs-page"
    >
      <header className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/jobs"
            className="flex items-center gap-3"
            aria-label="Açık Kariyer ana sayfası"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-action-primary text-sm font-bold text-action-primary-text">
              A
            </span>
            <span>
              <span className="block text-sm font-bold">Açık Kariyer</span>
              <span className="block text-xs text-text-secondary">Aday başvuru merkezi</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Aday kariyer alanı">
            <Link
              to="/candidate"
              className="inline-flex min-h-10 items-center rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-xs font-bold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:text-sm"
            >
              Aday Alanım
            </Link>
            <span className="hidden rounded-full border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary sm:inline-flex">
              Test kataloğu
            </span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="overflow-hidden rounded-3xl bg-text-primary px-5 py-8 text-white shadow-lg sm:px-9 sm:py-12">
          <p className="text-xs font-bold uppercase tracking-wider text-white/70">Açık Kariyer</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            Açık pozisyonları keşfedin
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
            Size uygun rolü bulun, ilan bağlamını inceleyin ve oturum açmadan başvuru formunu
            hazırlamaya başlayın.
          </p>
          <div className="mt-6 inline-flex rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm leading-6 text-white/90">
            Bu test ortamındaki ilanlar sentetiktir. Gerçek kişisel veri kullanmayın; bu aşamada
            kalıcı başvuru gönderilmez.
          </div>
        </section>

        <section className="py-8 sm:py-10" aria-labelledby="open-jobs-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Fırsatlar
              </p>
              <h2 id="open-jobs-heading" className="mt-1 text-2xl font-bold sm:text-3xl">
                Açık pozisyonlar
              </h2>
            </div>
            <p className="text-sm text-text-secondary">{PUBLIC_JOBS.length} sentetik ilan</p>
          </div>

          <ul className="mt-6 grid gap-4 lg:grid-cols-3" aria-label="Açık pozisyon listesi">
            {PUBLIC_JOBS.map((job) => (
              <li key={job.slug}>
                <article
                  className="flex h-full flex-col rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs transition hover:border-border-strong hover:shadow-sm sm:p-6"
                  data-testid={`public-job-card-${job.slug}`}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-action-primary">
                    {job.team}
                  </p>
                  <h3 className="mt-2 text-xl font-bold leading-tight">{job.title}</h3>
                  <dl className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-text-secondary">
                    <div className="rounded-full bg-surface-subtle px-3 py-1.5">
                      <dt className="sr-only">Konum</dt>
                      <dd>{job.location}</dd>
                    </div>
                    <div className="rounded-full bg-surface-subtle px-3 py-1.5">
                      <dt className="sr-only">Çalışma biçimi</dt>
                      <dd>{job.mode}</dd>
                    </div>
                    <div className="rounded-full bg-surface-subtle px-3 py-1.5">
                      <dt className="sr-only">Çalışma türü</dt>
                      <dd>{job.employmentType}</dd>
                    </div>
                  </dl>
                  <p className="mt-5 flex-1 text-sm leading-6 text-text-secondary">{job.summary}</p>
                  <ul
                    className="mt-5 flex flex-wrap gap-2"
                    aria-label={`${job.title} odak alanları`}
                  >
                    {job.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs font-medium text-text-secondary"
                      >
                        {highlight}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/jobs/${job.slug}/apply`}
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text shadow-sm hover:opacity-90 focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-2"
                    aria-label={`${job.title} rolüne başvur`}
                  >
                    Başvur
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <aside className="rounded-2xl border border-state-info-border bg-state-info-bg p-5 text-sm leading-6 text-text-primary sm:p-6">
          <h2 className="font-bold">Başvuru kontrolü sizde</h2>
          <p className="mt-2 max-w-3xl">
            Sonraki ekranda örnek CV verileriyle formu deneyebilir, bütün alanları değiştirebilir ve
            göndermeden önce önizleyebilirsiniz. Test yüzeyi dosyanızı veya form verinizi sunucuya
            göndermez.
          </p>
        </aside>
      </div>
    </main>
  );
};

export default PublicJobsPage;
