import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  approveBudget,
  BudgetApiError,
  createBudget,
  fetchBudget,
  fetchBudgetControl,
  replaceBudgetLines,
  submitBudget,
} from './api';
import type {
  BudgetControlSummary,
  BudgetLineInput,
  BudgetPlanView,
  BudgetReference,
  BudgetVersionStatus,
} from './types';

const COMPANY_STORAGE_KEY = 'reporting:currentCompanyId';
const REFERENCE_PREFIX = 'reporting:budget-reference:';

const currentYear = new Date().getFullYear();

type EditableBudgetLine = BudgetLineInput & { clientKey: string };

let lineSequence = 0;
const nextLineKey = (): string => `budget-line-${++lineSequence}`;

const emptyLine = (fiscalYear: number, currency: string): EditableBudgetLine => ({
  clientKey: nextLineKey(),
  period: `${fiscalYear}-01`,
  accountCode: '',
  costCenterCode: '',
  projectCode: '',
  departmentCode: '',
  branchCode: '',
  direction: 'EXPENSE',
  plannedAmount: 0,
  currency,
  description: '',
});

const readCompany = (): string => {
  try {
    return window.localStorage.getItem(COMPANY_STORAGE_KEY) ?? '35';
  } catch {
    return '35';
  }
};

const referenceKey = (companyId: number, fiscalYear: number): string =>
  `${REFERENCE_PREFIX}${companyId}:${fiscalYear}`;

const readReference = (companyId: number, fiscalYear: number): BudgetReference | null => {
  try {
    const raw = window.localStorage.getItem(referenceKey(companyId, fiscalYear));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BudgetReference>;
    return parsed.planId && parsed.versionId
      ? { planId: parsed.planId, versionId: parsed.versionId }
      : null;
  } catch {
    return null;
  }
};

const writeReference = (
  companyId: number,
  fiscalYear: number,
  reference: BudgetReference,
): void => {
  try {
    window.localStorage.setItem(COMPANY_STORAGE_KEY, String(companyId));
    window.localStorage.setItem(referenceKey(companyId, fiscalYear), JSON.stringify(reference));
  } catch {
    // Storage is only a convenience. PostgreSQL remains canonical.
  }
};

const formatMoney = (value: number | null, currency: string): string => {
  if (value == null) return 'Tahmin yüklenmedi';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
};

const statusLabel: Record<BudgetVersionStatus, string> = {
  DRAFT: 'Taslak',
  SUBMITTED: 'Onay bekliyor',
  APPROVED: 'Onaylı · değiştirilemez',
};

const statusTone: Record<BudgetVersionStatus, string> = {
  DRAFT: 'border-state-warning-border bg-state-warning-surface text-state-warning-text',
  SUBMITTED: 'border-selection-outline bg-selection-surface text-action-primary',
  APPROVED: 'border-state-success-border bg-state-success-surface text-state-success-text',
};

type Operation = 'create' | 'load' | 'save' | 'submit' | 'approve' | 'refresh' | null;

const MetricCard: React.FC<{
  label: string;
  value: number | null;
  currency: string;
  detail: string;
  warning?: boolean;
}> = ({ label, value, currency, detail, warning }) => (
  <article
    className={[
      'rounded-xl border bg-surface-default p-4 shadow-xs',
      warning ? 'border-state-warning-border' : 'border-border-subtle',
    ].join(' ')}
  >
    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
    <p className="mt-2 text-xl font-bold tabular-nums text-text-primary">
      {formatMoney(value, currency)}
    </p>
    <p className="mt-2 text-xs leading-5 text-text-secondary">{detail}</p>
  </article>
);

const ResolutionLegend: React.FC = () => {
  const entries = [
    ['Tam satır eşleşmesi', 'Fatura veya kaynak belge satırı muhasebe satırına birebir bağlandı.'],
    ['Yalnız başlık', 'Belge bulundu; satır düzeyi bağlantı henüz kurulamadı.'],
    ['Kısmi eşleşme', 'Tutarın yalnız bir bölümü bütçe kırılımına dağıtıldı.'],
    ['Çözümlenmemiş', 'Muhasebe fiilisi toplamda tutulur; bütçe kırılımına atanmaz.'],
    ['Manuel yevmiye', 'Kaynak belge yerine kontrollü manuel fiş kanıtı beklenir.'],
  ];
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-default p-5">
      <h2 className="text-base font-semibold text-text-primary">Belge bağlantı durumu</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Eşleşmeyen kayıtlar fiili harcamadan düşülmez; yalnız tahsis durumları ayrı gösterilir.
      </p>
      <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {entries.map(([term, definition]) => (
          <div key={term} className="rounded-lg bg-surface-muted p-3">
            <dt className="text-sm font-semibold text-text-primary">{term}</dt>
            <dd className="mt-1 text-xs leading-5 text-text-secondary">{definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const BudgetWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/admin/reports')
    ? '/admin/reports'
    : '/reports';
  const [companyInput, setCompanyInput] = React.useState(readCompany);
  const [fiscalYear, setFiscalYear] = React.useState(currentYear);
  const [currency, setCurrency] = React.useState('TRY');
  const [plan, setPlan] = React.useState<BudgetPlanView | null>(null);
  const [control, setControl] = React.useState<BudgetControlSummary | null>(null);
  const [lines, setLines] = React.useState<EditableBudgetLine[]>([
    emptyLine(currentYear, 'TRY'),
  ]);
  const [manualPlanId, setManualPlanId] = React.useState('');
  const [manualVersionId, setManualVersionId] = React.useState('');
  const [operation, setOperation] = React.useState<Operation>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const companyId = Number(companyInput);
  const busy = operation !== null;

  const syncPlan = React.useCallback((next: BudgetPlanView) => {
    setPlan(next);
    setFiscalYear(next.fiscalYear);
    setCurrency(next.baseCurrency);
    setLines(
      next.lines.length > 0
        ? next.lines.map(({ id: _id, ...line }) => ({
            ...line,
            clientKey: nextLineKey(),
            plannedAmount: Number(line.plannedAmount),
          }))
        : [emptyLine(next.fiscalYear, next.baseCurrency)],
    );
    setManualPlanId(next.planId);
    setManualVersionId(next.versionId);
    writeReference(next.companyId, next.fiscalYear, {
      planId: next.planId,
      versionId: next.versionId,
    });
  }, []);

  const run = async (nextOperation: Exclude<Operation, null>, action: () => Promise<void>) => {
    setOperation(nextOperation);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof BudgetApiError
          ? caught.message
          : 'İşlem tamamlanamadı. Herhangi bir değişiklik onaylanmadı.',
      );
    } finally {
      setOperation(null);
    }
  };

  const refreshControl = async (nextPlan: BudgetPlanView) => {
    const summary = await fetchBudgetControl(
      nextPlan.companyId,
      nextPlan.planId,
      nextPlan.versionId,
    );
    setControl(summary);
  };

  const handleCreate = () =>
    run('create', async () => {
      const created = await createBudget(companyId, fiscalYear, currency);
      syncPlan(created);
      await refreshControl(created);
      setNotice('Taslak PostgreSQL üzerinde oluşturuldu. Satırları düzenleyebilirsiniz.');
    });

  const handleLoad = () =>
    run('load', async () => {
      const saved = readReference(companyId, fiscalYear);
      const reference =
        manualPlanId.trim() && manualVersionId.trim()
          ? { planId: manualPlanId.trim(), versionId: manualVersionId.trim() }
          : saved;
      if (!reference) {
        throw new BudgetApiError(
          'NOT_FOUND',
          'Bu şirket ve yıl için kayıtlı bütçe referansı yok. Yeni taslak oluşturun veya kimlikleri girin.',
        );
      }
      const loaded = await fetchBudget(companyId, reference.planId, reference.versionId);
      syncPlan(loaded);
      await refreshControl(loaded);
      setNotice('Bütçe ve kontrol özeti PostgreSQL kaynağından yenilendi.');
    });

  const handleSave = () => {
    if (!plan) return;
    void run('save', async () => {
      const saved = await replaceBudgetLines(
        companyId,
        plan.planId,
        plan.versionId,
        lines.map(({ clientKey: _clientKey, ...line }) => line),
      );
      syncPlan(saved);
      await refreshControl(saved);
      setNotice('Bütçe satırları kaydedildi ve özet yeniden hesaplandı.');
    });
  };

  const handleSubmit = () => {
    if (!plan) return;
    void run('submit', async () => {
      const submitted = await submitBudget(companyId, plan.planId, plan.versionId);
      syncPlan(submitted);
      await refreshControl(submitted);
      setNotice('Bütçe onaya gönderildi. Onayı farklı bir yetkili kullanıcı vermelidir.');
    });
  };

  const handleApprove = () => {
    if (!plan) return;
    void run('approve', async () => {
      const approved = await approveBudget(companyId, plan.planId, plan.versionId);
      syncPlan(approved);
      await refreshControl(approved);
      setNotice('Bütçe onaylandı; versiyon artık değiştirilemez.');
    });
  };

  const handleRefresh = () => {
    if (!plan) return;
    void run('refresh', async () => {
      const loaded = await fetchBudget(companyId, plan.planId, plan.versionId);
      syncPlan(loaded);
      await refreshControl(loaded);
      setNotice('Canlı bütçe durumu yenilendi.');
    });
  };

  const updateLine = <K extends keyof BudgetLineInput>(
    index: number,
    field: K,
    value: BudgetLineInput[K],
  ) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    );
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  };

  const editable = plan?.status === 'DRAFT';
  const metricCurrency = control?.currency ?? currency;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6" aria-busy={busy}>
      <header className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-default p-6 shadow-xs lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(basePath)}
            className="text-sm font-medium text-action-primary hover:underline"
          >
            ← Raporlar
          </button>
          <h1 className="mt-3 text-2xl font-bold text-text-primary">Bütçe ve maliyet kontrolü</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Plan PostgreSQL üzerinde yönetilir. Muhasebe fiilisi ve kaynak belgeler canlı ERP’den
            yalnız okunur; eşleşmeyen tutarlar toplam fiiliden gizlenmez.
          </p>
        </div>
        {plan ? (
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[plan.status]}`}
            >
              {statusLabel[plan.status]}
            </span>
            <span className="text-xs text-text-secondary">
              Versiyon {plan.versionNo} · Şirket {plan.companyId} · {plan.fiscalYear}
            </span>
          </div>
        ) : null}
      </header>

      <section className="rounded-xl border border-border-subtle bg-surface-default p-5">
        <h2 className="text-base font-semibold text-text-primary">Çalışma alanını seçin</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
            Şirket numarası
            <input
              aria-label="Şirket numarası"
              type="number"
              min={1}
              value={companyInput}
              onChange={(event) => setCompanyInput(event.target.value)}
              disabled={busy || plan !== null}
              className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
            Mali yıl
            <input
              aria-label="Mali yıl"
              type="number"
              min={2000}
              max={2200}
              value={fiscalYear}
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                setFiscalYear(nextYear);
                setLines([emptyLine(nextYear, currency)]);
              }}
              disabled={busy || plan !== null}
              className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
            Baz para birimi
            <select
              aria-label="Baz para birimi"
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
                setLines([emptyLine(fiscalYear, event.target.value)]);
              }}
              disabled={busy || plan !== null}
              className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="TRY">TRY</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        {!plan ? (
          <>
            <details className="mt-4 rounded-lg bg-surface-muted p-3 text-sm">
              <summary className="cursor-pointer font-medium text-text-primary">
                Kayıtlı bütçe kimlikleriyle aç
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  Plan kimliği
                  <input
                    aria-label="Plan kimliği"
                    value={manualPlanId}
                    onChange={(event) => setManualPlanId(event.target.value)}
                    className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  Versiyon kimliği
                  <input
                    aria-label="Versiyon kimliği"
                    value={manualVersionId}
                    onChange={(event) => setManualVersionId(event.target.value)}
                    className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary"
                  />
                </label>
              </div>
            </details>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy || !Number.isInteger(companyId) || companyId < 1}
                className="rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-white hover:bg-action-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {operation === 'create' ? 'Taslak oluşturuluyor…' : 'Yeni taslak oluştur'}
              </button>
              <button
                type="button"
                onClick={() => void handleLoad()}
                disabled={busy || !Number.isInteger(companyId) || companyId < 1}
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted disabled:opacity-50"
              >
                {operation === 'load' ? 'Açılıyor…' : 'Mevcut bütçeyi aç'}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted disabled:opacity-50"
            >
              {operation === 'refresh' ? 'Yenileniyor…' : 'Canlı durumu yenile'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setControl(null);
                setNotice(null);
                setError(null);
              }}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-action-primary hover:bg-surface-muted disabled:opacity-50"
            >
              Başka bütçe seç
            </button>
          </div>
        )}
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-state-error-border bg-state-error-surface p-4 text-sm text-state-error-text">
          <strong>İşlem uygulanmadı.</strong> {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-state-success-border bg-state-success-surface p-4 text-sm text-state-success-text">
          {notice}
        </div>
      ) : null}

      {plan ? (
        <>
          <section className="rounded-xl border border-border-subtle bg-surface-default p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Bütçe satırları</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  İlk dilimde dönem, hesap, masraf merkezi ve proje kırılımı kullanılır.
                </p>
              </div>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setLines((current) => [...current, emptyLine(fiscalYear, currency)])}
                  disabled={busy}
                  className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted"
                >
                  + Satır ekle
                </button>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1050px] border-separate border-spacing-y-2 text-left text-sm">
                <caption className="sr-only">Bütçe plan satırları</caption>
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-text-secondary">
                    <th scope="col" className="px-2">Dönem</th>
                    <th scope="col" className="px-2">Hesap</th>
                    <th scope="col" className="px-2">Masraf merkezi</th>
                    <th scope="col" className="px-2">Proje</th>
                    <th scope="col" className="px-2">Yön</th>
                    <th scope="col" className="px-2">Planlanan</th>
                    <th scope="col" className="px-2">Açıklama</th>
                    <th scope="col" className="px-2"><span className="sr-only">İşlem</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.clientKey} className="bg-surface-muted">
                      <td className="rounded-s-lg p-2">
                        <input
                          aria-label={`${index + 1}. satır dönemi`}
                          type="month"
                          value={line.period}
                          onChange={(event) => updateLine(index, 'period', event.target.value)}
                          disabled={!editable || busy}
                          className="w-32 rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`${index + 1}. satır hesap kodu`}
                          value={line.accountCode}
                          onChange={(event) => updateLine(index, 'accountCode', event.target.value)}
                          disabled={!editable || busy}
                          placeholder="740"
                          className="w-28 rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`${index + 1}. satır masraf merkezi`}
                          value={line.costCenterCode}
                          onChange={(event) => updateLine(index, 'costCenterCode', event.target.value)}
                          disabled={!editable || busy}
                          className="w-36 rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`${index + 1}. satır proje kodu`}
                          value={line.projectCode}
                          onChange={(event) => updateLine(index, 'projectCode', event.target.value)}
                          disabled={!editable || busy}
                          className="w-32 rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          aria-label={`${index + 1}. satır yönü`}
                          value={line.direction}
                          onChange={(event) =>
                            updateLine(index, 'direction', event.target.value as 'EXPENSE' | 'INCOME')
                          }
                          disabled={!editable || busy}
                          className="rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 disabled:opacity-60"
                        >
                          <option value="EXPENSE">Gider</option>
                          <option value="INCOME">Gelir</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`${index + 1}. satır planlanan tutar`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.plannedAmount}
                          onChange={(event) =>
                            updateLine(index, 'plannedAmount', Number(event.target.value))
                          }
                          disabled={!editable || busy}
                          className="w-36 rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 text-right tabular-nums disabled:opacity-60"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`${index + 1}. satır açıklaması`}
                          value={line.description}
                          onChange={(event) => updateLine(index, 'description', event.target.value)}
                          disabled={!editable || busy}
                          className="w-48 rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 disabled:opacity-60"
                        />
                      </td>
                      <td className="rounded-e-lg p-2">
                        {editable && lines.length > 1 ? (
                          <button
                            type="button"
                            aria-label={`${index + 1}. satırı sil`}
                            onClick={() => removeLine(index)}
                            disabled={busy}
                            className="rounded-md px-2 py-1 text-state-error-text hover:bg-state-error-surface"
                          >
                            Sil
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {editable ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={busy || lines.length === 0 || lines.some((line) => !line.accountCode)}
                    className="rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-white hover:bg-action-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {operation === 'save' ? 'Kaydediliyor…' : 'Satırları kaydet'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={busy || plan.lines.length === 0}
                    className="rounded-lg border border-action-primary px-4 py-2 text-sm font-semibold text-action-primary hover:bg-selection-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {operation === 'submit' ? 'Gönderiliyor…' : 'Onaya gönder'}
                  </button>
                </>
              ) : null}
              {plan.status === 'SUBMITTED' ? (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy}
                  className="rounded-lg bg-state-success-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {operation === 'approve' ? 'Onaylanıyor…' : 'Farklı yetkili olarak onayla'}
                </button>
              ) : null}
            </div>
            {plan.status === 'SUBMITTED' ? (
              <p className="mt-3 text-xs text-text-secondary">
                Gönderen kullanıcı aynı bütçeyi onaylayamaz; servis bu ayrımı veritabanı ve API
                seviyesinde zorunlu tutar.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="budget-control-heading">
            <div className="mb-3">
              <h2 id="budget-control-heading" className="text-base font-semibold text-text-primary">
                Kontrol özeti
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Kalan = Plan − tüm muhasebe fiilisi − açık taahhüt. Eşleşme açığı kalan bütçeyi
                olduğundan yüksek gösteremez.
              </p>
            </div>
            {control ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <MetricCard label="Plan" value={control.plan} currency={metricCurrency} detail="Onay akışındaki gider bütçesi." />
                <MetricCard label="Muhasebe fiilisi" value={control.accountingActual} currency={metricCurrency} detail="İptal olmayan tüm muhasebe giderleri; çözümlenmemişler dahildir." />
                <MetricCard label="Tahsisli fiili" value={control.allocatedActual} currency={metricCurrency} detail="Bütçe kırılımına güvenle bağlanan tutar." />
                <MetricCard label="Tahsissiz fiili" value={control.unallocatedActual} currency={metricCurrency} detail="Fiili toplamda bulunan, henüz bütçe satırına dağılmayan tutar." warning={control.unallocatedActual > 0} />
                <MetricCard label="Çözümlenmemiş" value={control.unresolvedActual} currency={metricCurrency} detail="Belge/satır bağı henüz yeterli olmayan fiili." warning={control.unresolvedActual > 0} />
                <MetricCard label="Açık taahhüt" value={control.commitment} currency={metricCurrency} detail="Henüz muhasebeleşmemiş açık satın alma yükümlülüğü." />
                <MetricCard label="Kalan" value={control.remaining} currency={metricCurrency} detail="Plan − muhasebe fiilisi − açık taahhüt." warning={control.remaining < 0} />
                <MetricCard label="ETC" value={control.etc} currency={metricCurrency} detail="Tamamlama için kalan tahmin; yüklenmediyse hesaplanmaz." />
                <MetricCard label="EAC" value={control.eac} currency={metricCurrency} detail="Fiili + taahhüt + ETC; tahmin yoksa hesaplanmaz." />
                <MetricCard label="Sapma" value={control.variance} currency={metricCurrency} detail="Plan − EAC; tahmin yoksa hesaplanmaz." />
              </div>
            ) : (
              <div className="rounded-xl border border-border-subtle bg-surface-muted p-6 text-sm text-text-secondary">
                Kontrol özeti henüz yüklenmedi.
              </div>
            )}
          </section>

          <ResolutionLegend />
        </>
      ) : (
        <section className="rounded-xl border border-dashed border-border-subtle bg-surface-muted p-8 text-center">
          <h2 className="text-base font-semibold text-text-primary">Henüz bütçe seçilmedi</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Şirket ve mali yılı seçerek yeni taslak oluşturun veya kayıtlı bütçeyi açın.
          </p>
        </section>
      )}
    </main>
  );
};

export default BudgetWorkspace;
