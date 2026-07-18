import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@mfe/design-system/primitives';
import { usePermissions } from '@mfe/auth';
import {
  listRecruiterApplications,
  updateRecruiterApplicationStatus,
  type ApplicationStatus,
  type RecruiterApplicationDto,
} from '../api/application-api';
import {
  ATS_PRODUCT_HUB_ENTRY,
  INTERVIEW_EVIDENCE_ENTRY,
} from '../../ats-product-catalog/model/ats-capability-registry';
import RecruiterJobsPanel from './RecruiterJobsPanel';

const STAGES: ReadonlyArray<{
  id: ApplicationStatus;
  label: string;
  description: string;
}> = [
  { id: 'SUBMITTED', label: 'Yeni', description: 'İnsan incelemesi henüz başlamadı.' },
  { id: 'UNDER_REVIEW', label: 'İncelemede', description: 'İK ekibi başvuruyu inceliyor.' },
  {
    id: 'INTERVIEW_PENDING',
    label: 'Mülakat planlaması',
    description: 'İnsan kontrollü planlama adımı bekleniyor.',
  },
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const RecruiterWorkspacePage = () => {
  const permissions = usePermissions();
  const atsModuleManage = permissions.getModuleLevel('ATS') === 'MANAGE';
  const canManageJobs = atsModuleManage || permissions.isActionAllowed('ATS_JOB_MANAGE');
  const canManageApplications =
    atsModuleManage || permissions.isActionAllowed('ATS_APPLICATION_MANAGE');
  const [applications, setApplications] = useState<RecruiterApplicationDto[]>([]);
  const [query, setQuery] = useState('');
  const [activeJobSlug, setActiveJobSlug] = useState('');
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [updating, setUpdating] = useState(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await listRecruiterApplications();
      setApplications(page.items);
    } catch (loadError) {
      setApplications([]);
      setError(loadError instanceof Error ? loadError.message : 'Başvuru kutusu yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (selectedRef) reviewHeadingRef.current?.focus();
  }, [selectedRef]);

  const jobs = useMemo(() => {
    const unique = new Map<string, string>();
    applications.forEach((application) => unique.set(application.jobSlug, application.jobTitle));
    return [...unique.entries()].map(([slug, title]) => ({ slug, title }));
  }, [applications]);

  const visibleApplications = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    return applications.filter((application) => {
      if (activeJobSlug && application.jobSlug !== activeJobSlug) return false;
      if (!normalized) return true;
      return [
        application.fullName,
        application.email,
        application.city,
        application.jobTitle,
        ...application.skills,
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(normalized);
    });
  }, [activeJobSlug, applications, query]);

  const selected =
    applications.find((application) => application.publicRef === selectedRef) ?? null;

  const advanceSelected = async () => {
    if (!canManageApplications || !selected || selected.status === 'INTERVIEW_PENDING' || updating)
      return;
    const toStatus = selected.status === 'SUBMITTED' ? 'UNDER_REVIEW' : 'INTERVIEW_PENDING';
    setUpdating(true);
    setActionError('');
    try {
      const updated = await updateRecruiterApplicationStatus(
        selected.publicRef,
        selected.version,
        toStatus,
      );
      setApplications((current) =>
        current.map((application) =>
          application.publicRef === updated.publicRef ? updated : application,
        ),
      );
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : 'Durum güncellenemedi.');
      await loadInbox();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      className="mx-auto w-full max-w-[96rem] space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:pb-8 lg:px-8"
      data-testid="recruiter-workspace-page"
    >
      <nav aria-label="ATS konumu" className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          to={ATS_PRODUCT_HUB_ENTRY.route}
          className="font-semibold text-text-primary underline underline-offset-4 hover:no-underline"
        >
          ATS Ürün Merkezi
        </Link>
        <span className="text-text-subtle" aria-hidden="true">
          /
        </span>
        <span className="text-text-secondary" aria-current="page">
          İK Çalışma Alanı
        </span>
      </nav>

      <header className="relative overflow-hidden rounded-3xl border border-border-subtle bg-linear-to-br from-action-primary/10 via-surface-default to-state-info-bg px-5 py-7 shadow-xs sm:px-8 sm:py-9">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="success"
                size="lg"
                className="border border-state-success-border font-bold"
              >
                Kalıcı başvuru kutusu
              </Badge>
              <span className="rounded-full border border-border-subtle bg-surface-default px-3 py-1 text-xs font-semibold text-text-secondary">
                İnsan kontrollü
              </span>
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
              Full ATS · İK deneyimi
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              İK Çalışma Alanı
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
              İlanlarınızı oluşturup yayınlayın; adayın gönderdiği kalıcı başvuruyu inceleyin ve
              yalnız izin verilen insan kontrollü adımlarda ilerletin. Otomatik puanlama, ret veya
              teklif yürütülmez.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href="#recruiter-jobs"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text"
            >
              İlanları yönet
            </a>
            <button
              type="button"
              onClick={() => void loadInbox()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 py-2.5 text-sm font-bold text-text-primary disabled:opacity-50"
            >
              Başvuru kutusunu yenile
            </button>
            <Link
              to={INTERVIEW_EVIDENCE_ENTRY.route}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 py-2.5 text-sm font-bold text-text-primary hover:bg-surface-muted"
            >
              Interview Evidence’ı aç
            </Link>
          </div>
        </div>
      </header>

      <RecruiterJobsPanel canManage={canManageJobs} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="İK çalışma özeti">
        {[
          [String(jobs.length), 'Pozisyon', 'Başvurusu bulunan ilan'],
          [String(applications.length), 'Kalıcı başvuru', 'Tenant-korumalı kayıt'],
          [
            String(
              applications.filter((application) => application.status === 'UNDER_REVIEW').length,
            ),
            'İnsan incelemesi',
            'Otomatik puanlama yok',
          ],
          [
            String(
              applications.filter((application) => application.status === 'INTERVIEW_PENDING')
                .length,
            ),
            'Mülakat planlaması',
            'İnsan kontrollü adım',
          ],
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

      {error ? (
        <div
          className="rounded-2xl border border-state-danger-border bg-state-danger-bg p-5"
          role="alert"
        >
          <p className="font-semibold text-text-primary">Başvuru kutusu yüklenemedi.</p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => void loadInbox()}
            className="mt-4 rounded-xl border border-border-strong bg-surface-default px-4 py-2 text-sm font-bold"
          >
            Yeniden dene
          </button>
        </div>
      ) : null}

      <section
        className="rounded-3xl border border-border-subtle bg-surface-default p-4 shadow-xs sm:p-6"
        aria-label="Aday filtreleri"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="recruiter-position" className="text-sm font-semibold text-text-primary">
              Pozisyon
            </label>
            <select
              id="recruiter-position"
              value={activeJobSlug}
              onChange={(event) => {
                setActiveJobSlug(event.target.value);
                setSelectedRef(null);
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm font-semibold"
            >
              <option value="">Tüm pozisyonlar</option>
              {jobs.map((job) => (
                <option key={job.slug} value={job.slug}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="recruiter-search" className="text-sm font-semibold text-text-primary">
              Aday, e-posta veya beceri ara
            </label>
            <input
              id="recruiter-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Örn. erişilebilirlik"
              className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="pipeline-heading" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
                İnsan kontrollü akış
              </p>
              <h2 id="pipeline-heading" className="mt-1 text-2xl font-bold text-text-primary">
                Aday pipeline’ı
              </h2>
            </div>
            <p className="text-sm font-medium text-text-secondary" aria-live="polite">
              {loading ? 'Yükleniyor…' : `${visibleApplications.length} başvuru gösteriliyor`}
            </p>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3" data-testid="recruiter-pipeline">
            {STAGES.map((stage) => {
              const stageApplications = visibleApplications.filter(
                (application) => application.status === stage.id,
              );
              return (
                <section
                  key={stage.id}
                  className="min-w-0 rounded-2xl border border-border-subtle bg-surface-muted p-3"
                >
                  <div className="flex items-start justify-between gap-2 px-1 py-1">
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">{stage.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {stage.description}
                      </p>
                    </div>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-default px-2 text-xs font-bold">
                      {stageApplications.length}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-3">
                    {stageApplications.map((application) => (
                      <li key={application.publicRef}>
                        <article className="rounded-2xl border border-border-subtle bg-surface-default p-4 shadow-xs">
                          <h4 className="truncate text-sm font-bold text-text-primary">
                            {application.fullName}
                          </h4>
                          <p className="mt-1 truncate text-xs text-text-secondary">
                            {application.email}
                          </p>
                          <p className="mt-2 text-xs text-text-secondary">
                            {application.jobTitle} · {formatDate(application.createdAt)}
                          </p>
                          <ul
                            className="mt-3 flex flex-wrap gap-1.5"
                            aria-label="Beceri etiketleri"
                          >
                            {application.skills.slice(0, 4).map((skill) => (
                              <li
                                key={skill}
                                className="rounded-lg bg-surface-muted px-2 py-1 text-[11px] font-medium text-text-secondary"
                              >
                                {skill}
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRef(application.publicRef);
                              setActionError('');
                            }}
                            aria-controls="recruiter-review-panel"
                            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold hover:bg-surface-muted"
                          >
                            Başvuruyu incele
                          </button>
                        </article>
                      </li>
                    ))}
                    {stageApplications.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-border-subtle p-3 text-center text-xs leading-5 text-text-secondary">
                        Bu aşamada başvuru yok.
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>

        <aside
          id="recruiter-review-panel"
          className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs 2xl:sticky 2xl:top-6 2xl:self-start"
          data-testid="recruiter-review-panel"
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
            Başvuru incelemesi
          </p>
          <h2
            ref={reviewHeadingRef}
            className="mt-1 text-xl font-bold outline-hidden"
            tabIndex={-1}
          >
            Aday bilgileri
          </h2>

          {selected ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
                <p className="font-bold">{selected.fullName}</p>
                <p className="mt-1 text-sm text-text-secondary">{selected.jobTitle}</p>
                <p className="mt-3 break-all font-mono text-xs text-text-secondary">
                  {selected.publicRef}
                </p>
              </div>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">İletişim</dt>
                  <dd className="mt-1 break-words">
                    {selected.email}
                    <br />
                    {selected.phone} · {selected.city}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Profesyonel özet</dt>
                  <dd className="mt-1 whitespace-pre-wrap leading-6">{selected.summary}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Deneyim</dt>
                  <dd className="mt-1 whitespace-pre-wrap leading-6">{selected.experience}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-secondary">Eğitim</dt>
                  <dd className="mt-1 whitespace-pre-wrap leading-6">{selected.education}</dd>
                </div>
                {selected.note ? (
                  <div>
                    <dt className="text-xs font-semibold text-text-secondary">Aday notu</dt>
                    <dd className="mt-1 whitespace-pre-wrap leading-6">{selected.note}</dd>
                  </div>
                ) : null}
              </dl>
              {selected.status !== 'INTERVIEW_PENDING' && canManageApplications ? (
                <button
                  type="button"
                  onClick={() => void advanceSelected()}
                  disabled={updating}
                  className="min-h-11 w-full rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text disabled:opacity-50"
                >
                  {updating
                    ? 'Güncelleniyor…'
                    : selected.status === 'SUBMITTED'
                      ? 'İnsan incelemesini başlat'
                      : 'Mülakat planlamasına al'}
                </button>
              ) : selected.status === 'INTERVIEW_PENDING' ? (
                <div
                  role="status"
                  className="rounded-xl border border-state-success-border bg-state-success-bg p-4 text-sm font-semibold text-text-primary"
                >
                  Mülakat planlaması bekleniyor.
                </div>
              ) : (
                <p className="rounded-xl border border-border-subtle bg-surface-muted p-4 text-sm font-semibold text-text-secondary">
                  Bu başvuruyu görüntüleyebilirsiniz; aşama değiştirme yetkiniz yok.
                </p>
              )}
              {actionError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm font-semibold text-text-primary"
                >
                  {actionError}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-border-subtle bg-surface-muted p-4 text-sm leading-6 text-text-secondary">
              Kalıcı bir başvuru kartındaki “Başvuruyu incele” düğmesini seçin.
            </p>
          )}

          <div className="mt-5 border-t border-border-subtle pt-5">
            <h3 className="text-sm font-semibold">Bu dilimde kapalı eylemler</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Ret, teklif, otomatik puanlama ve toplu işlem endpoint’i yoktur.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default RecruiterWorkspacePage;
