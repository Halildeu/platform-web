import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@mfe/design-system/primitives';
import {
  createApplicationIdempotencyKey,
  createRecruiterJob,
  DEFAULT_APPLICATION_FIELDS,
  listRecruiterJobs,
  transitionRecruiterJob,
  updateRecruiterJob,
  type ApplicationFieldKey,
  type RecruiterJobDraftDto,
  type RecruiterJobDto,
  type RecruiterJobStatus,
} from '../api/application-api';

type FormState = {
  slug: string;
  title: string;
  team: string;
  location: string;
  mode: string;
  employmentType: string;
  summary: string;
  highlights: string;
  applicationFields: ApplicationFieldKey[];
};

const EMPTY_FORM: FormState = {
  slug: '',
  title: '',
  team: '',
  location: '',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: '',
  highlights: '',
  applicationFields: DEFAULT_APPLICATION_FIELDS,
};

const STATUS_LABELS: Record<RecruiterJobStatus, string> = {
  DRAFT: 'Taslak',
  PUBLISHED: 'Yayında',
  PAUSED: 'Duraklatıldı',
  CLOSED: 'Kapandı',
  ARCHIVED: 'Arşivlendi',
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const formFromJob = (job: RecruiterJobDto): FormState => ({
  slug: job.slug,
  title: job.title,
  team: job.team,
  location: job.location,
  mode: job.mode,
  employmentType: job.employmentType,
  summary: job.summary,
  highlights: job.highlights.join('\n'),
  applicationFields: job.applicationFields,
});

const payloadFromForm = (form: FormState): RecruiterJobDraftDto => ({
  ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
  title: form.title.trim(),
  team: form.team.trim(),
  location: form.location.trim(),
  mode: form.mode.trim(),
  employmentType: form.employmentType.trim(),
  summary: form.summary.trim(),
  highlights: form.highlights
    .split(/\n|,/u)
    .map((item) => item.trim())
    .filter((item, index, values) => item.length > 0 && values.indexOf(item) === index),
  applicationFields: form.applicationFields,
  noticeVersion: 'kvkk-application-v1',
});

const OPTIONAL_FIELD_OPTIONS: Array<{ key: ApplicationFieldKey; label: string }> = [
  { key: 'linkedIn', label: 'LinkedIn adresi' },
  { key: 'portfolio', label: 'Portföy / kişisel site' },
  { key: 'note', label: 'Başvuru motivasyonu notu' },
];

const RecruiterJobsPanel = ({ canManage }: { canManage: boolean }) => {
  const [jobs, setJobs] = useState<RecruiterJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecruiterJobDto | null>(null);
  const [previewing, setPreviewing] = useState<RecruiterJobDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [transitioningJobId, setTransitioningJobId] = useState<string | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const panelRef = useRef<HTMLElement>(null);
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);

  const closePreview = useCallback(() => {
    setPreviewing(null);
    window.setTimeout(() => previewTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!previewing) return undefined;
    previewHeadingRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
    };
    const background = panelRef.current?.parentElement;
    const previousAriaHidden = background?.getAttribute('aria-hidden');
    const previousInert = background?.inert ?? false;
    if (background) {
      background.inert = true;
      background.setAttribute('aria-hidden', 'true');
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (background) {
        background.inert = previousInert;
        if (previousAriaHidden === null) background.removeAttribute('aria-hidden');
        else background.setAttribute('aria-hidden', previousAriaHidden);
      }
    };
  }, [closePreview, previewing]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loaded = await listRecruiterJobs();
      setJobs(loaded);
      return loaded;
    } catch (loadError) {
      setJobs([]);
      setError(loadError instanceof Error ? loadError.message : 'İlanlar yüklenemedi.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutationKey = (operation: string) => {
    const existing = retryKeys.current.get(operation);
    if (existing) return existing;
    const created = createApplicationIdempotencyKey();
    retryKeys.current.set(operation, created);
    return created;
  };

  const openCreate = () => {
    retryKeys.current.delete('create');
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setActionError('');
    setSuccess('');
  };

  const openEdit = (job: RecruiterJobDto) => {
    setEditing(job);
    setForm(formFromJob(job));
    setFormOpen(true);
    setActionError('');
    setSuccess('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    const operation = editing ? `update:${editing.jobId}:${editing.version}` : 'create';
    try {
      const payload = payloadFromForm(form);
      const saved = editing
        ? await updateRecruiterJob(
            editing,
            { ...payload, slug: payload.slug ?? editing.slug },
            mutationKey(operation),
          )
        : await createRecruiterJob(payload, mutationKey(operation));
      retryKeys.current.delete(operation);
      setJobs((current) =>
        editing
          ? current.map((job) => (job.jobId === saved.jobId ? saved : job))
          : [saved, ...current],
      );
      setFormOpen(false);
      setEditing(null);
      setSuccess(
        editing
          ? `“${saved.title}” ilanı güncellendi.`
          : `“${saved.title}” taslak ilanı kalıcı olarak oluşturuldu.`,
      );
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : 'İlan kaydedilemedi; değişiklik yapılmadı.',
      );
      const refreshed = await load();
      if (editing) {
        const freshJob = refreshed.find((job) => job.jobId === editing.jobId);
        if (freshJob && freshJob.version !== editing.version) {
          setFormOpen(false);
          setEditing(null);
          setActionError(
            `“${freshJob.title}” başka bir işlemde güncellendi. Güncel ilanı yeniden açıp değişikliklerinizi tekrar uygulayın.`,
          );
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const transition = async (job: RecruiterJobDto, targetStatus: RecruiterJobStatus) => {
    if (transitioningJobId) return;
    const operation = `transition:${job.jobId}:${job.version}:${targetStatus}`;
    setTransitioningJobId(job.jobId);
    setActionError('');
    setSuccess('');
    try {
      const updated = await transitionRecruiterJob(job, targetStatus, mutationKey(operation));
      retryKeys.current.delete(operation);
      setJobs((current) => current.map((item) => (item.jobId === updated.jobId ? updated : item)));
      setSuccess(
        `“${updated.title}” artık ${STATUS_LABELS[updated.status].toLocaleLowerCase('tr-TR')}.`,
      );
    } catch (transitionError) {
      setActionError(
        transitionError instanceof Error ? transitionError.message : 'İlan durumu değiştirilemedi.',
      );
      await load();
    } finally {
      setTransitioningJobId(null);
    }
  };

  const openPreview = (job: RecruiterJobDto, trigger: HTMLButtonElement) => {
    previewTriggerRef.current = trigger;
    setPreviewing(job);
  };

  const trapPreviewFocus: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      previewDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) {
      event.preventDefault();
      previewHeadingRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={panelRef}
      id="recruiter-jobs"
      className="scroll-mt-24 rounded-3xl border border-border-subtle bg-surface-default p-4 shadow-xs sm:p-6"
      aria-labelledby="recruiter-jobs-heading"
      data-testid="recruiter-jobs-panel"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
            İlan yönetimi
          </p>
          <h2 id="recruiter-jobs-heading" className="mt-1 text-2xl font-bold text-text-primary">
            İlanlarım
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Taslak oluşturun, içeriği kontrol edin ve hazır olduğunda yayınlayın. Yalnız “Yayında”
            durumundaki ilanlar yeni başvuru kabul eder.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 py-2.5 text-sm font-bold text-action-primary-text"
          >
            Yeni ilan oluştur
          </button>
        ) : (
          <p className="rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-sm font-semibold text-text-secondary">
            Salt-okuma erişimi
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="İlan sayıları">
        {[
          [jobs.length, 'Toplam ilan'],
          [jobs.filter((job) => job.status === 'PUBLISHED').length, 'Yayında'],
          [jobs.filter((job) => job.status === 'DRAFT').length, 'Taslak'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            <p className="mt-1 text-sm font-medium text-text-secondary">{label}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div
          className="mt-5 rounded-2xl border border-state-danger-border bg-state-danger-bg p-4"
          role="alert"
        >
          <p className="font-semibold text-state-danger-text">İlanlar yüklenemedi.</p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl border border-border-strong bg-surface-default px-4 py-2 text-sm font-bold"
          >
            Yeniden dene
          </button>
        </div>
      ) : null}
      {actionError ? (
        <p
          className="mt-4 rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm text-state-danger-text"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {success ? (
        <p
          className="mt-4 rounded-xl border border-state-success-border bg-state-success-bg p-3 text-sm font-semibold text-text-primary"
          role="status"
        >
          {success}
        </p>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-6 rounded-2xl border border-border-strong bg-surface-muted p-4 sm:p-6"
          aria-label={editing ? 'İlanı düzenle' : 'Yeni ilan'}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-text-primary">
                {editing ? 'İlanı düzenle' : 'Yeni taslak ilan'}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Kaydetmek ilanı yayınlamaz; önce taslak oluşur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm font-semibold"
            >
              Formu kapat
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="İlan başlığı"
              value={form.title}
              onChange={(title) => setForm((current) => ({ ...current, title }))}
              required
              minLength={2}
              maxLength={180}
            />
            <Field
              label="URL kısa adı"
              value={form.slug}
              onChange={(slug) => setForm((current) => ({ ...current, slug }))}
              placeholder={editing ? undefined : 'Boş bırakılırsa otomatik üretilir'}
              required={Boolean(editing)}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <Field
              label="Ekip"
              value={form.team}
              onChange={(team) => setForm((current) => ({ ...current, team }))}
              required
              minLength={2}
              maxLength={120}
            />
            <Field
              label="Konum"
              value={form.location}
              onChange={(location) => setForm((current) => ({ ...current, location }))}
              required
              minLength={2}
              maxLength={160}
            />
            <Field
              label="Çalışma modeli"
              value={form.mode}
              onChange={(mode) => setForm((current) => ({ ...current, mode }))}
              required
              minLength={2}
              maxLength={80}
            />
            <Field
              label="İstihdam türü"
              value={form.employmentType}
              onChange={(employmentType) => setForm((current) => ({ ...current, employmentType }))}
              required
              minLength={2}
              maxLength={80}
            />
          </div>
          <label className="mt-4 block text-sm font-semibold text-text-primary">
            İlan özeti
            <textarea
              value={form.summary}
              onChange={(event) =>
                setForm((current) => ({ ...current, summary: event.target.value }))
              }
              required
              minLength={20}
              maxLength={8000}
              rows={5}
              className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-3 text-sm"
            />
          </label>
          <label className="mt-4 block text-sm font-semibold text-text-primary">
            Öne çıkanlar
            <textarea
              value={form.highlights}
              onChange={(event) =>
                setForm((current) => ({ ...current, highlights: event.target.value }))
              }
              rows={3}
              placeholder="Her satıra bir madde"
              className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-3 text-sm"
            />
          </label>
          <fieldset className="mt-4 rounded-2xl border border-border-subtle bg-surface-default p-4">
            <legend className="px-1 text-sm font-bold text-text-primary">
              Başvuru formu alanları
            </legend>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              İletişim, özgeçmiş özeti, deneyim, eğitim ve beceri alanları güvenli başvuru için
              zorunludur. Aşağıdaki ek alanları aday formunda açıp kapatabilirsiniz.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {OPTIONAL_FIELD_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex min-h-11 items-center gap-3 text-sm font-semibold"
                >
                  <input
                    type="checkbox"
                    checked={form.applicationFields.includes(option.key)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        applicationFields: event.target.checked
                          ? [...current.applicationFields, option.key]
                          : current.applicationFields.filter((field) => field !== option.key),
                      }))
                    }
                    className="h-4 w-4"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-text-secondary">
              Aydınlatma metni sürümü: <strong>kvkk-application-v1</strong>
            </p>
          </fieldset>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-xl bg-action-primary px-5 py-2.5 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Taslak oluştur'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-5 py-2.5 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {previewing
        ? createPortal(
            <div
              ref={previewDialogRef}
              className="fixed inset-0 z-[1700] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="recruiter-job-preview-heading"
              data-testid="recruiter-job-preview"
              onKeyDown={trapPreviewFocus}
            >
              <article className="my-auto w-full max-w-4xl overflow-hidden rounded-3xl bg-surface-default shadow-2xl">
                <div className="bg-text-primary px-5 py-7 text-white sm:px-8 sm:py-9">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white/75">{previewing.team}</p>
                      <h2
                        ref={previewHeadingRef}
                        id="recruiter-job-preview-heading"
                        tabIndex={-1}
                        className="mt-2 text-2xl font-bold outline-none sm:text-4xl"
                      >
                        {previewing.title}
                      </h2>
                      <p className="mt-4 text-sm text-white/80">
                        {previewing.location} · {previewing.mode} · {previewing.employmentType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="min-h-11 rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
                    >
                      Önizlemeyi kapat
                    </button>
                  </div>
                </div>
                <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <h3 className="text-lg font-bold">Pozisyon hakkında</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                      {previewing.summary}
                    </p>
                    {previewing.highlights.length ? (
                      <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                        {previewing.highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <aside className="h-fit rounded-2xl border border-border-subtle bg-surface-muted p-4">
                    <p className="font-bold">Aday başvuru formu</p>
                    <p className="mt-2 text-xs leading-5 text-text-secondary">
                      {previewing.applicationFields.length} alan · aydınlatma{' '}
                      {previewing.noticeVersion}
                    </p>
                    <p className="mt-4 rounded-xl bg-surface-default p-3 text-xs text-text-secondary">
                      Bu önizleme public yayına çıkmaz; aday yalnız ilan yayınlandıktan sonra
                      başvurabilir.
                    </p>
                  </aside>
                </div>
              </article>
            </div>,
            document.body,
          )
        : null}

      <div className="mt-6">
        {loading ? (
          <p className="rounded-2xl bg-surface-muted p-5 text-sm text-text-secondary" role="status">
            İlanlar yükleniyor…
          </p>
        ) : null}
        {!loading && !error && jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted p-6 text-center">
            <p className="font-bold text-text-primary">Henüz ilanınız yok.</p>
            <p className="mt-2 text-sm text-text-secondary">
              İlk taslağı oluşturup adayların görebileceği hale getirin.
            </p>
          </div>
        ) : null}
        {!loading && jobs.length > 0 ? (
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Tenant ilanları">
            {jobs.map((job) => (
              <li
                key={job.jobId}
                className="rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge
                      variant={
                        job.status === 'PUBLISHED'
                          ? 'success'
                          : job.status === 'DRAFT'
                            ? 'info'
                            : 'warning'
                      }
                      size="sm"
                    >
                      {STATUS_LABELS[job.status]}
                    </Badge>
                    <h3 className="mt-3 text-lg font-bold text-text-primary">{job.title}</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      {job.team} · {job.location} · {job.mode}
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-secondary">
                    v{job.version}
                  </span>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-text-secondary">
                  {job.summary}
                </p>
                <p className="mt-3 text-xs text-text-subtle">
                  Son değişiklik: {formatDate(job.updatedAt)}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ActionButton
                    label="Önizle"
                    onClick={(event) => openPreview(job, event.currentTarget)}
                  />
                  {canManage && job.status !== 'CLOSED' && job.status !== 'ARCHIVED' ? (
                    <ActionButton label="Düzenle" onClick={() => openEdit(job)} />
                  ) : null}
                  {canManage && (job.status === 'DRAFT' || job.status === 'PAUSED') ? (
                    <ActionButton
                      label="Yayınla"
                      primary
                      onClick={() => void transition(job, 'PUBLISHED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {canManage && job.status === 'PUBLISHED' ? (
                    <ActionButton
                      label="Duraklat"
                      onClick={() => void transition(job, 'PAUSED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {canManage && (job.status === 'PUBLISHED' || job.status === 'PAUSED') ? (
                    <ActionButton
                      label="İlanı kapat"
                      onClick={() => void transition(job, 'CLOSED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {canManage && job.status === 'CLOSED' ? (
                    <ActionButton
                      label="Arşivle"
                      onClick={() => void transition(job, 'ARCHIVED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {job.status === 'PUBLISHED' && job.publicHandle ? (
                    <a
                      href={`/careers/${encodeURIComponent(job.publicHandle)}/jobs/${encodeURIComponent(job.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center rounded-lg border border-border-subtle bg-surface-muted px-3 py-2 text-sm font-bold text-text-primary underline underline-offset-4"
                    >
                      Public ilanı aç
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
};

const Field = ({
  label,
  value,
  onChange,
  ...inputProps
}: { label: string; value: string; onChange: (value: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) => (
  <label className="block text-sm font-semibold text-text-primary">
    {label}
    <input
      {...inputProps}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm"
    />
  </label>
);

const ActionButton = ({
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  primary?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={
      primary
        ? 'min-h-10 rounded-lg bg-action-primary px-3 py-2 text-sm font-bold text-action-primary-text disabled:opacity-50'
        : 'min-h-10 rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm font-bold text-text-primary disabled:opacity-50'
    }
  >
    {label}
  </button>
);

export default RecruiterJobsPanel;
