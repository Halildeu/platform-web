import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, ChevronRight, RefreshCw, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Drawer } from '@mfe/design-system/primitives';
import { usePermissions } from '@mfe/auth';
import {
  describeAtsError,
  listRecruiterApplications,
  type ApplicationStatus,
  type RecruiterApplicationSummaryDto,
} from '../api/application-api';
import {
  ATS_PRODUCT_HUB_ENTRY,
  INTERVIEW_EVIDENCE_ENTRY,
} from '../../ats-product-catalog/model/ats-capability-registry';
import RecruiterJobsPanel from './RecruiterJobsPanel';
import RecruiterApplicationReviewPanel from './RecruiterApplicationReviewPanel';

const STAGES: ReadonlyArray<{ id: ApplicationStatus; label: string }> = [
  { id: 'SUBMITTED', label: 'Yeni' },
  { id: 'UNDER_REVIEW', label: 'İncelemede' },
  { id: 'INTERVIEW_PENDING', label: 'Mülakat' },
  { id: 'OFFER_PENDING', label: 'Teklif yanıtı' },
  { id: 'OFFER_ACCEPTED', label: 'Teklif kabulü' },
  { id: 'HIRED', label: 'İşe alındı' },
  { id: 'OFFER_DECLINED', label: 'Teklif reddi' },
  { id: 'OFFER_WITHDRAWN', label: 'Teklif geri çekildi' },
  { id: 'REJECTED', label: 'Reddedildi' },
  { id: 'WITHDRAWN', label: 'Geri çekildi' },
];

const STATUS_LABELS = Object.fromEntries(STAGES.map((stage) => [stage.id, stage.label])) as Record<
  ApplicationStatus,
  string
>;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const initialsOf = (name: string) =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');

type WorkspaceTab = 'applications' | 'jobs';
type StageFilter = 'ALL' | ApplicationStatus;

const RecruiterWorkspacePage = () => {
  const permissions = usePermissions();
  const atsModuleManage = permissions.getModuleLevel('ATS') === 'MANAGE';
  const canManageJobs = atsModuleManage || permissions.isActionAllowed('ATS_JOB_MANAGE');
  const canManageApplications =
    atsModuleManage || permissions.isActionAllowed('ATS_APPLICATION_MANAGE');
  const [applications, setApplications] = useState<RecruiterApplicationSummaryDto[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('applications');
  const [query, setQuery] = useState('');
  const [activeJobSlug, setActiveJobSlug] = useState('');
  const [activeStage, setActiveStage] = useState<StageFilter>('ALL');
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await listRecruiterApplications();
      setApplications(page.items);
    } catch (loadError) {
      setApplications([]);
      setError(describeAtsError(loadError, 'Başvuru kutusu yüklenemedi.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const jobs = useMemo(() => {
    const unique = new Map<string, string>();
    applications.forEach((application) => unique.set(application.jobSlug, application.jobTitle));
    return [...unique.entries()].map(([slug, title]) => ({ slug, title }));
  }, [applications]);

  const filteredApplications = useMemo(() => {
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

  const visibleApplications = useMemo(
    () =>
      activeStage === 'ALL'
        ? filteredApplications
        : filteredApplications.filter((application) => application.status === activeStage),
    [activeStage, filteredApplications],
  );

  const selectedApplication = applications.find(
    (application) => application.publicRef === selectedRef,
  );
  const newCount = applications.filter((application) => application.status === 'SUBMITTED').length;
  const activeCount = applications.filter((application) =>
    ['UNDER_REVIEW', 'INTERVIEW_PENDING', 'OFFER_PENDING', 'OFFER_ACCEPTED'].includes(
      application.status,
    ),
  ).length;
  const completedCount = applications.filter((application) =>
    ['HIRED', 'REJECTED', 'WITHDRAWN', 'OFFER_DECLINED', 'OFFER_WITHDRAWN'].includes(
      application.status,
    ),
  ).length;

  return (
    <main
      className="mx-auto w-full max-w-[90rem] space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:pb-10 lg:px-8"
      data-testid="recruiter-workspace-page"
    >
      <nav aria-label="ATS konumu" className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          to={ATS_PRODUCT_HUB_ENTRY.route}
          className="font-semibold text-text-primary underline underline-offset-4 hover:no-underline"
        >
          ATS Ürün Merkezi
        </Link>
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-text-subtle" />
        <span className="text-text-secondary" aria-current="page">
          İK Çalışma Alanı
        </span>
      </nav>

      <header className="overflow-hidden rounded-3xl bg-text-primary px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="success"
                size="lg"
                className="border border-state-success-border font-bold"
              >
                Kalıcı başvuru kutusu
              </Badge>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                İnsan kontrollü
              </span>
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-white/70">
              Full ATS · İK deneyimi
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Başvuruları tek yerden yönetin
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
              Adayı bulun, işle ilgili kanıtlarla değerlendirin ve aşamayı açık bir insan eylemiyle
              değiştirin. Otomatik puanlama, sıralama veya karar yürütülmez.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadInbox()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-text-primary disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Başvuru kutusunu yenile
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTab('jobs')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white"
            >
              <BriefcaseBusiness aria-hidden="true" className="h-4 w-4" />
              İlanları yönet
            </button>
          </div>
        </div>
      </header>

      <div
        className="flex gap-1 rounded-2xl border border-border-subtle bg-surface-default p-1 shadow-xs"
        role="tablist"
        aria-label="İK çalışma alanı bölümleri"
      >
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === 'applications'}
          onClick={() => setWorkspaceTab('applications')}
          className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-bold ${
            workspaceTab === 'applications'
              ? 'bg-action-primary text-action-primary-text'
              : 'text-text-secondary hover:bg-surface-muted'
          }`}
        >
          Başvurular
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === 'jobs'}
          onClick={() => setWorkspaceTab('jobs')}
          className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-bold ${
            workspaceTab === 'jobs'
              ? 'bg-action-primary text-action-primary-text'
              : 'text-text-secondary hover:bg-surface-muted'
          }`}
        >
          İlanlar
        </button>
      </div>

      {workspaceTab === 'jobs' ? (
        <section role="tabpanel" aria-label="İlan yönetimi" className="space-y-4">
          <RecruiterJobsPanel canManage={canManageJobs} />
          <div className="flex justify-end">
            <Link
              to={INTERVIEW_EVIDENCE_ENTRY.route}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary hover:bg-surface-muted"
            >
              Interview Evidence’ı aç
            </Link>
          </div>
        </section>
      ) : (
        <section role="tabpanel" aria-label="Başvuru yönetimi" className="space-y-5">
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="İK çalışma özeti"
          >
            {[
              [String(applications.length), 'Tüm başvurular', 'Kalıcı aday kayıtları'],
              [String(newCount), 'Yeni', 'İlk inceleme bekliyor'],
              [String(activeCount), 'Aktif süreç', 'İnsan eylemi devam ediyor'],
              [String(completedCount), 'Sonuçlanan', 'Kalıcı süreç sonucu'],
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

          <section className="rounded-3xl border border-border-subtle bg-surface-default shadow-xs">
            <div className="border-b border-border-subtle p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <label className="relative block">
                  <span className="sr-only">Aday, e-posta veya beceri ara</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-text-subtle"
                  />
                  <input
                    id="recruiter-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Aday, e-posta veya beceri ara"
                    className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default py-2.5 pl-10 pr-3.5 text-sm"
                  />
                </label>
                <label>
                  <span className="sr-only">Pozisyon</span>
                  <select
                    id="recruiter-position"
                    value={activeJobSlug}
                    onChange={(event) => {
                      setActiveJobSlug(event.target.value);
                      setSelectedRef(null);
                    }}
                    className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm font-semibold"
                  >
                    <option value="">Tüm pozisyonlar</option>
                    {jobs.map((job) => (
                      <option key={job.slug} value={job.slug}>
                        {job.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Aşama filtresi">
                <button
                  type="button"
                  aria-pressed={activeStage === 'ALL'}
                  onClick={() => setActiveStage('ALL')}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${
                    activeStage === 'ALL'
                      ? 'border-action-primary bg-action-primary text-action-primary-text'
                      : 'border-border-subtle bg-surface-default text-text-secondary'
                  }`}
                >
                  Tümü · {filteredApplications.length}
                </button>
                {STAGES.map((stage) => {
                  const count = filteredApplications.filter(
                    (application) => application.status === stage.id,
                  ).length;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      aria-pressed={activeStage === stage.id}
                      onClick={() => setActiveStage(stage.id)}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${
                        activeStage === stage.id
                          ? 'border-action-primary bg-action-primary text-action-primary-text'
                          : 'border-border-subtle bg-surface-default text-text-secondary'
                      }`}
                    >
                      {stage.label} · {count}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                  Aday listesi
                </p>
                <h2 className="mt-1 text-xl font-bold text-text-primary">Başvurular</h2>
              </div>
              <p className="text-sm font-medium text-text-secondary" aria-live="polite">
                {loading ? 'Yükleniyor…' : `${visibleApplications.length} başvuru`}
              </p>
            </div>

            <div data-testid="recruiter-pipeline">
              {loading ? (
                <p className="border-t border-border-subtle px-5 py-10 text-center text-sm font-semibold text-text-secondary">
                  Başvurular yükleniyor…
                </p>
              ) : visibleApplications.length ? (
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {visibleApplications.map((application) => (
                    <li key={application.publicRef}>
                      <article className="grid gap-4 px-4 py-4 hover:bg-surface-muted sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-action-primary/10 text-sm font-bold text-action-primary"
                            aria-hidden="true"
                          >
                            {initialsOf(application.fullName)}
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-text-primary">
                              {application.fullName}
                            </h3>
                            <p className="mt-1 truncate text-xs text-text-secondary">
                              {application.email}
                            </p>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">
                            {application.jobTitle}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                            <span className="rounded-full bg-surface-muted px-2 py-1 font-semibold text-text-primary">
                              {STATUS_LABELS[application.status]}
                            </span>
                            <span>{formatDate(application.createdAt)}</span>
                          </div>
                          {application.skills.length ? (
                            <p className="mt-2 truncate text-xs text-text-secondary">
                              {application.skills.slice(0, 3).join(' · ')}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedRef(application.publicRef)}
                          aria-controls="recruiter-review-panel"
                          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border-subtle bg-surface-default px-4 text-xs font-bold text-text-primary hover:bg-surface-muted"
                        >
                          Başvuruyu incele
                          <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="border-t border-border-subtle px-5 py-12 text-center">
                  <Users aria-hidden="true" className="mx-auto h-8 w-8 text-text-subtle" />
                  <h3 className="mt-3 text-sm font-bold text-text-primary">Başvuru bulunamadı</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Arama, pozisyon veya aşama filtresini değiştirin.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      <Drawer
        open={Boolean(selectedRef)}
        onClose={() => setSelectedRef(null)}
        placement="right"
        size="lg"
        title={selectedApplication?.fullName ?? 'Aday başvurusu'}
        description={
          selectedApplication
            ? `${selectedApplication.jobTitle} · ${STATUS_LABELS[selectedApplication.status]}`
            : 'Yetkili başvuru detayı'
        }
        closeLabel="Aday detayını kapat"
        className="max-w-3xl"
      >
        <RecruiterApplicationReviewPanel
          publicRef={selectedRef}
          canManage={canManageApplications}
          embedded
          onApplicationChanged={(updated) =>
            setApplications((current) =>
              current.map((application) =>
                application.publicRef === updated.publicRef
                  ? {
                      publicRef: updated.publicRef,
                      jobSlug: updated.jobSlug,
                      jobTitle: updated.jobTitle,
                      fullName: updated.fullName,
                      email: updated.email,
                      city: updated.city,
                      skills: updated.skills,
                      status: updated.status,
                      version: updated.version,
                      createdAt: updated.createdAt,
                      updatedAt: updated.updatedAt,
                    }
                  : application,
              ),
            )
          }
        />
      </Drawer>
    </main>
  );
};

export default RecruiterWorkspacePage;
