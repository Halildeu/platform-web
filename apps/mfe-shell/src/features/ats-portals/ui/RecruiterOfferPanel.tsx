import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createApplicationIdempotencyKey,
  createRecruiterOffer,
  listRecruiterOffers,
  transitionRecruiterOffer,
  updateRecruiterOffer,
  type ApplicationStatus,
  type OfferPayPeriod,
  type OfferStatus,
  type OfferTermsDto,
  type OfferWorkMode,
  type RecruiterOfferWorkspaceDto,
} from '../api/application-api';

const STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT: 'Taslak',
  EXTENDED: 'Adaya iletildi',
  ACCEPTED: 'Aday kabul etti',
  DECLINED: 'Aday reddetti',
  WITHDRAWN: 'İK geri çekti',
  HIRED: 'İşe alındı',
};

const WORK_MODE_LABELS: Record<OfferWorkMode, string> = {
  REMOTE: 'Uzaktan',
  HYBRID: 'Hibrit',
  ONSITE: 'Yerinde',
};

const PAY_PERIOD_LABELS: Record<OfferPayPeriod, string> = {
  HOURLY: 'Saatlik',
  MONTHLY: 'Aylık',
  ANNUAL: 'Yıllık',
};

type OfferForm = Omit<OfferTermsDto, 'compensationAmount' | 'expiresAt'> & {
  compensationAmount: string;
  expiresAt: string;
  reason: string;
};

type TransitionTarget = {
  offer: RecruiterOfferWorkspaceDto;
  target: 'EXTENDED' | 'WITHDRAWN' | 'HIRED';
};

const toLocalInput = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const initialForm = (jobTitle: string, location: string): OfferForm => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 14);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  return {
    roleTitle: jobTitle,
    startDate: startDate.toISOString().slice(0, 10),
    employmentType: 'Tam zamanlı',
    workMode: 'HYBRID',
    location,
    compensationAmount: '',
    currency: 'TRY',
    payPeriod: 'MONTHLY',
    expiresAt: toLocalInput(expiresAt),
    termsSummary: '',
    reason: '',
  };
};

const formFromOffer = (offer: RecruiterOfferWorkspaceDto): OfferForm => ({
  roleTitle: offer.roleTitle,
  startDate: offer.startDate,
  employmentType: offer.employmentType,
  workMode: offer.workMode,
  location: offer.location,
  compensationAmount: String(offer.compensationAmount),
  currency: offer.currency,
  payPeriod: offer.payPeriod,
  expiresAt: toLocalInput(offer.expiresAt),
  termsSummary: offer.termsSummary,
  reason: '',
});

const termsFromForm = (form: OfferForm): OfferTermsDto => ({
  roleTitle: form.roleTitle.trim(),
  startDate: form.startDate,
  employmentType: form.employmentType.trim(),
  workMode: form.workMode,
  location: form.location.trim(),
  compensationAmount: Number(form.compensationAmount),
  currency: form.currency.trim().toUpperCase(),
  payPeriod: form.payPeriod,
  expiresAt: new Date(form.expiresAt).toISOString(),
  termsSummary: form.termsSummary.trim(),
});

const formatDate = (value: string, withTime = true) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(value));

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

interface RecruiterOfferPanelProps {
  publicRef: string;
  jobTitle: string;
  candidateLocation: string;
  applicationStatus: ApplicationStatus;
  canManage: boolean;
  onApplicationRefresh: () => Promise<void>;
}

const RecruiterOfferPanel = ({
  publicRef,
  jobTitle,
  candidateLocation,
  applicationStatus,
  canManage,
  onApplicationRefresh,
}: RecruiterOfferPanelProps) => {
  const [offers, setOffers] = useState<RecruiterOfferWorkspaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<OfferForm>(() => initialForm(jobTitle, candidateLocation));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecruiterOfferWorkspaceDto | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionConfirmed, setTransitionConfirmed] = useState(false);
  const mutation = useRef<{ signature: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOffers(await listRecruiterOffers(publicRef));
    } catch (loadError) {
      setOffers([]);
      setError(loadError instanceof Error ? loadError.message : 'Teklifler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [publicRef]);

  useEffect(() => {
    setForm(initialForm(jobTitle, candidateLocation));
    setFormOpen(false);
    setEditing(null);
    setTransitionTarget(null);
    setError('');
    setSuccess('');
    mutation.current = null;
    void refresh();
  }, [candidateLocation, jobTitle, refresh]);

  const mutationKey = (request: unknown) => {
    const signature = JSON.stringify(request);
    if (mutation.current?.signature !== signature) {
      mutation.current = { signature, key: createApplicationIdempotencyKey() };
    }
    return mutation.current.key;
  };

  const activeOffer = offers.find((offer) =>
    ['DRAFT', 'EXTENDED', 'ACCEPTED'].includes(offer.status),
  );
  const canCreate = canManage && applicationStatus === 'INTERVIEW_PENDING' && !activeOffer;

  const openCreate = () => {
    setForm(initialForm(jobTitle, candidateLocation));
    setEditing(null);
    setFormOpen(true);
    setError('');
    setSuccess('');
    mutation.current = null;
  };

  const openEdit = (offer: RecruiterOfferWorkspaceDto) => {
    setForm(formFromOffer(offer));
    setEditing(offer);
    setFormOpen(true);
    setError('');
    setSuccess('');
    mutation.current = null;
  };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const terms = termsFromForm(form);
      const request = editing
        ? { expectedVersion: editing.version, reason: form.reason.trim(), terms }
        : terms;
      if (editing) {
        await updateRecruiterOffer(
          publicRef,
          editing,
          terms,
          form.reason.trim(),
          mutationKey(request),
        );
        setSuccess('Teklif taslağı gerekçeli yeni revizyonla güncellendi.');
      } else {
        await createRecruiterOffer(publicRef, terms, mutationKey(request));
        setSuccess('Teklif taslağı kalıcı olarak oluşturuldu; henüz adaya görünmez.');
      }
      mutation.current = null;
      setFormOpen(false);
      setEditing(null);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Teklif kaydedilemedi.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openTransition = (
    offer: RecruiterOfferWorkspaceDto,
    target: TransitionTarget['target'],
  ) => {
    setTransitionTarget({ offer, target });
    setTransitionReason('');
    setTransitionConfirmed(false);
    setError('');
    setSuccess('');
    mutation.current = null;
  };

  const submitTransition = async () => {
    if (!transitionTarget || transitionReason.trim().length < 5 || !transitionConfirmed || busy)
      return;
    const request = {
      expectedVersion: transitionTarget.offer.version,
      target: transitionTarget.target,
      reason: transitionReason.trim(),
    };
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await transitionRecruiterOffer(
        publicRef,
        transitionTarget.offer,
        transitionTarget.target,
        request.reason,
        mutationKey(request),
      );
      mutation.current = null;
      const message =
        transitionTarget.target === 'EXTENDED'
          ? 'Teklif adaya iletildi; adayın güvenli portalında yanıt bekleniyor.'
          : transitionTarget.target === 'WITHDRAWN'
            ? 'Teklif gerekçeli olarak geri çekildi.'
            : 'Kabul edilmiş teklif insan eylemiyle işe alındı sonucuna taşındı.';
      setTransitionTarget(null);
      setTransitionReason('');
      setTransitionConfirmed(false);
      setSuccess(message);
      await Promise.allSettled([refresh(), onApplicationRefresh()]);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Teklif durumu değiştirilemedi.',
      );
      await Promise.allSettled([refresh(), onApplicationRefresh()]);
    } finally {
      setBusy(false);
    }
  };

  const transitionCopy = transitionTarget
    ? {
        EXTENDED: {
          heading: 'Teklifi adaya ilet',
          confirmation:
            'Koşulları, ücret dönemini ve yanıt son tarihini kontrol ettim; teklifi adaya görünür yapıyorum.',
          button: 'Teklifi adaya ilet',
        },
        WITHDRAWN: {
          heading: 'Teklifi geri çek',
          confirmation:
            'Adaya iletilmiş teklifi geri çekmenin aday sürecini kapatacağını anlıyorum.',
          button: 'Teklifi geri çek',
        },
        HIRED: {
          heading: 'İşe alım sonucunu kaydet',
          confirmation:
            'Adayın ATS kabul yanıtını inceledim; bu insan kontrollü süreç sonucudur ve ayrı iş sözleşmesi/e-imza yerine geçmez.',
          button: 'İşe alındı olarak kaydet',
        },
      }[transitionTarget.target]
    : null;

  return (
    <section
      className="rounded-2xl border border-border-strong bg-surface-default p-4"
      aria-labelledby="offer-workspace-heading"
      data-testid="recruiter-offer-workspace"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="offer-workspace-heading" className="text-base font-bold text-text-primary">
            Teklif ve işe alım çalışma alanı
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Teklif yalnız scorecard’lı tamamlanmış görüşmeden sonra açılır. Bu ATS kaydı iş
            sözleşmesi veya e-imza değildir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void Promise.allSettled([refresh(), onApplicationRefresh()])}
          disabled={loading || busy}
          className="min-h-10 rounded-xl border border-border-subtle px-3 text-xs font-bold disabled:opacity-50"
        >
          Teklifleri yenile
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-text-secondary" role="status">
          Teklif çalışma alanı yükleniyor…
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm font-semibold text-state-danger-text"
          role="alert"
        >
          {error}
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

      {!canManage ? (
        <p className="mt-4 rounded-xl border border-border-subtle bg-surface-muted p-3 text-sm text-text-secondary">
          Teklifleri görüntüleyebilirsiniz; oluşturma ve durum değiştirme yetkiniz yok.
        </p>
      ) : null}
      {canCreate && !formOpen ? (
        <button
          type="button"
          onClick={openCreate}
          className="mt-4 min-h-11 w-full rounded-xl bg-action-primary px-4 text-sm font-bold text-action-primary-text"
        >
          Teklif taslağı oluştur
        </button>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={(event) => void submitForm(event)}
          className="mt-4 space-y-4 rounded-2xl border border-action-primary bg-action-primary/5 p-4"
          aria-label={editing ? 'Teklif taslağını düzenle' : 'Yeni teklif taslağı'}
        >
          <h4 className="font-bold">
            {editing ? 'Teklif taslağını düzenle' : 'Yeni teklif taslağı'}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-text-secondary">
              Rol başlığı
              <input
                required
                minLength={2}
                maxLength={160}
                value={form.roleTitle}
                onChange={(event) =>
                  setForm((current) => ({ ...current, roleTitle: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Başlangıç tarihi
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, startDate: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Çalışma türü
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.employmentType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, employmentType: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Çalışma modeli
              <select
                value={form.workMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    workMode: event.target.value as OfferWorkMode,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              >
                {(Object.keys(WORK_MODE_LABELS) as OfferWorkMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {WORK_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary sm:col-span-2">
              Konum
              <input
                required
                minLength={2}
                maxLength={240}
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Brüt ücret
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.compensationAmount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, compensationAmount: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Para birimi
              <input
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({ ...current, currency: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm uppercase"
              />
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Ücret dönemi
              <select
                value={form.payPeriod}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    payPeriod: event.target.value as OfferPayPeriod,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              >
                {(Object.keys(PAY_PERIOD_LABELS) as OfferPayPeriod[]).map((period) => (
                  <option key={period} value={period}>
                    {PAY_PERIOD_LABELS[period]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-text-secondary">
              Yanıt son tarihi
              <input
                required
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiresAt: event.target.value }))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-text-secondary">
            Teklif özeti
            <textarea
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              value={form.termsSummary}
              onChange={(event) =>
                setForm((current) => ({ ...current, termsSummary: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-sm"
            />
          </label>
          {editing ? (
            <label className="block text-xs font-semibold text-text-secondary">
              Revizyon gerekçesi
              <textarea
                required
                minLength={5}
                maxLength={500}
                rows={2}
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reason: event.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl bg-action-primary px-4 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              {busy ? 'Kaydediliyor…' : editing ? 'Yeni revizyonu kaydet' : 'Taslağı kalıcı kaydet'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold"
            >
              İptal
            </button>
          </div>
        </form>
      ) : null}

      {!loading && !offers.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-secondary">
          Bu başvuru için henüz teklif kaydı yok.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {offers.map((offer) => (
          <article
            key={offer.offerId}
            className="rounded-2xl border border-border-subtle bg-surface-muted p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-text-primary">{offer.roleTitle}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {formatMoney(offer.compensationAmount, offer.currency)} ·{' '}
                  {PAY_PERIOD_LABELS[offer.payPeriod]}
                </p>
              </div>
              <span className="rounded-full border border-border-subtle bg-surface-default px-3 py-1 text-xs font-bold">
                {STATUS_LABELS[offer.status]}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-xs text-text-secondary sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Başlangıç</dt>
                <dd>{formatDate(offer.startDate, false)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Yanıt sonu</dt>
                <dd>{formatDate(offer.expiresAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Çalışma</dt>
                <dd>
                  {offer.employmentType} · {WORK_MODE_LABELS[offer.workMode]}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Konum</dt>
                <dd>{offer.location}</dd>
              </div>
            </dl>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">
              {offer.termsSummary}
            </p>
            <p className="mt-3 break-all font-mono text-[11px] text-text-secondary">
              {offer.offerId} · sürüm {offer.version}
            </p>

            {canManage && offer.status === 'DRAFT' ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => openEdit(offer)}
                  className="min-h-10 rounded-xl border border-border-subtle bg-surface-default px-3 text-sm font-bold"
                >
                  Taslağı düzenle
                </button>
                <button
                  type="button"
                  onClick={() => openTransition(offer, 'EXTENDED')}
                  className="min-h-10 rounded-xl bg-action-primary px-3 text-sm font-bold text-action-primary-text"
                >
                  Adaya iletmeyi hazırla
                </button>
              </div>
            ) : null}
            {canManage && offer.status === 'EXTENDED' ? (
              <button
                type="button"
                onClick={() => openTransition(offer, 'WITHDRAWN')}
                className="mt-3 min-h-10 w-full rounded-xl border border-state-danger-border bg-surface-default px-3 text-sm font-bold"
              >
                Teklifi geri çekmeyi hazırla
              </button>
            ) : null}
            {canManage && offer.status === 'ACCEPTED' ? (
              <button
                type="button"
                onClick={() => openTransition(offer, 'HIRED')}
                className="mt-3 min-h-10 w-full rounded-xl bg-action-primary px-3 text-sm font-bold text-action-primary-text"
              >
                İşe alım sonucunu hazırla
              </button>
            ) : null}

            <details className="mt-3 rounded-xl border border-border-subtle bg-surface-default p-3">
              <summary className="cursor-pointer text-xs font-bold">Sürümlü teklif geçmişi</summary>
              <ol className="mt-2 space-y-2">
                {[...offer.revisions]
                  .sort((left, right) => right.version - left.version)
                  .map((revision) => (
                    <li key={revision.version} className="text-xs leading-5 text-text-secondary">
                      <span className="font-bold text-text-primary">
                        Sürüm {revision.version} · {STATUS_LABELS[revision.status]}
                      </span>
                      <br />
                      {revision.reason} · {revision.actorRef} · {formatDate(revision.occurredAt)}
                    </li>
                  ))}
              </ol>
            </details>
          </article>
        ))}
      </div>

      {transitionTarget && transitionCopy ? (
        <section
          className="mt-4 rounded-2xl border border-border-strong bg-surface-muted p-4"
          aria-label={transitionCopy.heading}
        >
          <h4 className="font-bold">{transitionCopy.heading}</h4>
          <label className="mt-3 block text-xs font-semibold text-text-secondary">
            İnsan kararı gerekçesi
            <textarea
              required
              minLength={5}
              maxLength={500}
              rows={3}
              value={transitionReason}
              onChange={(event) => setTransitionReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm leading-5 text-text-primary">
            <input
              type="checkbox"
              checked={transitionConfirmed}
              onChange={(event) => setTransitionConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            {transitionCopy.confirmation}
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void submitTransition()}
              disabled={busy || transitionReason.trim().length < 5 || !transitionConfirmed}
              className="min-h-11 flex-1 rounded-xl bg-action-primary px-4 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              {busy ? 'Kaydediliyor…' : transitionCopy.button}
            </button>
            <button
              type="button"
              onClick={() => setTransitionTarget(null)}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
};

export default RecruiterOfferPanel;
