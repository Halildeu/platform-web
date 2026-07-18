import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicJob, type PublicJobDto } from '../../features/ats-portals/api/application-api';

const PublicJobDetailPage = () => {
  const { publicHandle, jobSlug = '' } = useParams();
  const [job, setJob] = useState<PublicJobDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const jobsBase = publicHandle ? `/careers/${encodeURIComponent(publicHandle)}/jobs` : '/jobs';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getPublicJob(jobSlug, publicHandle)
      .then((value) => {
        if (!cancelled) setJob(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setJob(null);
          setError(reason instanceof Error ? reason.message : 'İlan yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobSlug, publicHandle]);

  useEffect(() => {
    const previous = document.title;
    if (job) document.title = `${job.title} | Açık Kariyer`;
    return () => {
      document.title = previous;
    };
  }, [job]);

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="public-job-detail-page"
    >
      <header className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to={jobsBase}
            className="text-sm font-bold text-text-primary underline underline-offset-4"
          >
            ← Açık pozisyonlar
          </Link>
          <Link
            to="/candidate"
            className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-bold"
          >
            Aday Alanım
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {loading ? (
          <p role="status" className="rounded-2xl bg-surface-default p-6">
            İlan yükleniyor…
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-state-danger-border bg-state-danger-bg p-6 text-state-danger-text"
          >
            {error}
          </p>
        ) : null}
        {job ? (
          <article className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-default shadow-sm">
            <div className="bg-text-primary px-5 py-8 text-white sm:px-9 sm:py-11">
              <p className="text-sm font-bold text-white/75">{job.team}</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">{job.title}</h1>
              <p className="mt-5 text-sm text-white/80 sm:text-base">
                {job.location} · {job.mode} · {job.employmentType}
              </p>
            </div>
            <div className="grid gap-8 p-5 sm:p-9 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <h2 className="text-xl font-bold">Pozisyon hakkında</h2>
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-text-secondary">
                  {job.summary}
                </p>
                {job.highlights.length ? (
                  <>
                    <h2 className="mt-8 text-xl font-bold">Öne çıkanlar</h2>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-text-secondary">
                      {job.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
              <section
                aria-labelledby="public-job-apply-heading"
                className="h-fit rounded-2xl border border-border-subtle bg-surface-muted p-5"
              >
                <h2 id="public-job-apply-heading" className="font-bold">
                  Bu role başvurun
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Formu doldurabilir, önizleyebilir ve göndermeden önce tüm bilgilerinizi
                  değiştirebilirsiniz.
                </p>
                <Link
                  to={`${jobsBase}/${encodeURIComponent(job.slug)}/apply`}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text"
                >
                  Başvuru formuna geç
                </Link>
              </section>
            </div>
          </article>
        ) : null}
      </div>
    </main>
  );
};

export default PublicJobDetailPage;
