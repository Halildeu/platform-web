import React from 'react';
import type { ColDef } from 'ag-grid-community';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  GridShell,
  buildColDefs,
  type BadgeColumnMeta,
  type ColumnMeta,
} from '@mfe/design-system/advanced/data-grid';
import '@mfe/design-system/advanced/data-grid/setup';
import { selectReportingCompany } from '../../components/CompanyPicker';
import {
  BudgetApiError,
  createProjectBinding,
  fetchCompanies,
  fetchProjectActualRows,
  fetchProjectActualSummary,
  fetchProjects,
  findProjectBinding,
  syncProjectActuals,
} from './api';
import type {
  CompanyOption,
  ProjectActualRow,
  ProjectActualSummary,
  ProjectActualSyncResult,
  ProjectBinding,
  ProjectOption,
} from './types';

const today = new Date();
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const currentYearStart = `${today.getFullYear()}-01-01`;
const trNumber = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const trAlphabetical = new Intl.Collator('tr-TR', {
  sensitivity: 'base',
  numeric: true,
});

const errorMessage = (error: unknown): string =>
  error instanceof BudgetApiError
    ? error.message
    : 'Beklenmeyen bir hata oluştu. Kaynak veride değişiklik yapılmadı.';

const companyLabel = (company: CompanyOption): string => {
  const name = company.name?.trim();
  const nickname = company.nickname?.trim();
  if (nickname && name) return `${nickname} — ${name}`;
  return name || nickname || 'Adsız şirket';
};

const projectLabel = (project: ProjectOption): string => {
  const prefix = project.code?.trim();
  const label = prefix ? `${prefix} — ${project.name}` : project.name;
  return project.active ? label : `${label} (pasif)`;
};

const sortCompaniesAlphabetically = (items: CompanyOption[]): CompanyOption[] =>
  [...items].sort(
    (left, right) =>
      trAlphabetical.compare(companyLabel(left), companyLabel(right)) || left.id - right.id,
  );

const sortProjectsAlphabetically = (items: ProjectOption[]): ProjectOption[] =>
  [...items].sort(
    (left, right) =>
      trAlphabetical.compare(left.name.trim(), right.name.trim()) ||
      trAlphabetical.compare(left.code?.trim() ?? '', right.code?.trim() ?? '') ||
      left.id - right.id,
  );

const amountLabel = (amount: number, currency: string): string =>
  `${trNumber.format(amount)} ${currency === 'N/A' ? '' : currency}`.trim();

const dateTimeLabel = (value: string | null): string => {
  if (!value) return 'Henüz başarılı senkron yok';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const syncFailureLabel = (failureCode: string | null): string => {
  switch (failureCode) {
    case 'PROVIDER_TOKEN_REJECTED':
      return 'ERP erişim belirteci reddedildi.';
    case 'PROVIDER_SCOPE_DENIED':
      return 'ERP kaynağını okuma yetkisi reddedildi.';
    case 'PROVIDER_UNAVAILABLE':
      return 'ERP gerçekleşen maliyet kaynağına ulaşılamadı.';
    case 'PROVIDER_DATA_INVALID':
      return 'ERP kaynağı doğrulama sınırlarının dışında veri döndürdü.';
    case 'SOURCE_GRAIN_CONFLICT':
      return 'Bir muhasebe satırı başka bir proje bağlantısına atanmış.';
    case 'SNAPSHOT_WRITE_FAILED':
      return 'Gerçekleşen maliyet snapshot kaydı güvenli biçimde tamamlanamadı.';
    default:
      return 'Senkron güvenli biçimde durduruldu.';
  }
};

const identityTranslate = (key: string): string => key;

const STATUS_VARIANTS: BadgeColumnMeta['variantMap'] = {
  DEBIT: 'info',
  CREDIT: 'warning',
  INCLUDE_COST: 'success',
  INCLUDE_NEGATIVE_COST: 'success',
  EXCLUDE_COUNTERPART: 'muted',
  EXCLUDE_TRANSFER: 'muted',
  REQUIRES_REVIEW: 'warning',
  EXACT_LINE: 'success',
  HEADER_ONLY: 'info',
  PARTIAL: 'warning',
  UNRESOLVED: 'error',
  MANUAL_JOURNAL: 'muted',
  INVOICE: 'info',
  EXPENSE: 'warning',
  BANK: 'info',
  CURRENT_ACCOUNT: 'info',
  TRANSFER: 'muted',
};

const STATUS_LABELS: BadgeColumnMeta['labelMap'] = {
  DEBIT: 'Borç',
  CREDIT: 'Alacak',
  INCLUDE_COST: 'Maliyete dahil',
  INCLUDE_NEGATIVE_COST: 'Negatif maliyet',
  EXCLUDE_COUNTERPART: 'Karşı hesap hariç',
  EXCLUDE_TRANSFER: 'Virman hariç',
  REQUIRES_REVIEW: 'İncelenecek',
  EXACT_LINE: 'Satır eşleşti',
  HEADER_ONLY: 'Belge başlığı',
  PARTIAL: 'Kısmi',
  UNRESOLVED: 'Çözümlenmedi',
  MANUAL_JOURNAL: 'Mahsup fişi',
  INVOICE: 'Fatura',
  EXPENSE: 'Masraf',
  BANK: 'Banka',
  CURRENT_ACCOUNT: 'Cari hareket',
  TRANSFER: 'Virman',
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'warning';
}> = ({ label, value, detail, tone = 'default' }) => (
  <article
    className={`rounded-xl border p-4 ${
      tone === 'warning'
        ? 'border-state-warning-text/30 bg-state-warning-bg'
        : 'border-border-subtle bg-surface-default'
    }`}
  >
    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
    <p className="mt-2 text-xl font-bold text-text-primary">{value}</p>
    {detail ? <p className="mt-1 text-xs text-text-secondary">{detail}</p> : null}
  </article>
);

export const BudgetWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reportingRoot = location.pathname.startsWith('/admin/reports')
    ? '/admin/reports'
    : '/reports';

  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [companyId, setCompanyId] = React.useState('');
  const [projectId, setProjectId] = React.useState('');
  const [from, setFrom] = React.useState(currentYearStart);
  const [to, setTo] = React.useState(isoDate(today));
  const [catalogBusy, setCatalogBusy] = React.useState(true);
  const [dataBusy, setDataBusy] = React.useState(false);
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [bindingMissing, setBindingMissing] = React.useState(false);
  const [binding, setBinding] = React.useState<ProjectBinding | null>(null);
  const [summary, setSummary] = React.useState<ProjectActualSummary | null>(null);
  const [rows, setRows] = React.useState<ProjectActualRow[]>([]);
  const [lastSync, setLastSync] = React.useState<ProjectActualSyncResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [budgetAuthorizationRequired, setBudgetAuthorizationRequired] = React.useState(false);

  const selectedProject = projects.find((project) => String(project.id) === projectId) ?? null;
  const validSelection = Boolean(companyId && projectId && from && to && from <= to);

  const captureBudgetError = (reason: unknown) => {
    setBudgetAuthorizationRequired(
      reason instanceof BudgetApiError && reason.kind === 'FORBIDDEN',
    );
    setError(errorMessage(reason));
  };

  const renewBudgetAuthorization = async () => {
    const login = (
      window as typeof window & {
        __startKeycloakLogin?: (options: { redirectUri: string }) => Promise<void>;
      }
    ).__startKeycloakLogin;
    if (!login) {
      setError('Bütçe yetkisi güvenli giriş üzerinden yenilenemedi. Lütfen yeniden giriş yapın.');
      return;
    }
    setDataBusy(true);
    try {
      await login({ redirectUri: window.location.href });
    } catch {
      setDataBusy(false);
      setError('Bütçe yetkisi yenileme başlatılamadı. Lütfen yeniden giriş yapın.');
    }
  };

  React.useEffect(() => {
    let active = true;
    void fetchCompanies()
      .then((items) => {
        if (active) setCompanies(sortCompaniesAlphabetically(items));
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setCatalogBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const clearActuals = () => {
    setBinding(null);
    setBindingMissing(false);
    setSummary(null);
    setRows([]);
    setLastSync(null);
  };

  const onCompanyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    setCompanyId(next);
    setProjectId('');
    setProjects([]);
    clearActuals();
    setError(null);
    setBudgetAuthorizationRequired(false);
    if (!next) return;

    setCatalogBusy(true);
    try {
      setProjects(sortProjectsAlphabetically(await fetchProjects(Number(next))));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCatalogBusy(false);
    }
  };

  const onProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setProjectId(event.target.value);
    clearActuals();
    setError(null);
    setBudgetAuthorizationRequired(false);
  };

  const loadSnapshot = React.useCallback(
    async (activeBinding: ProjectBinding) => {
      const numericCompany = Number(companyId);
      const [nextSummary, nextRows] = await Promise.all([
        fetchProjectActualSummary(numericCompany, activeBinding.id, from, to),
        fetchProjectActualRows(numericCompany, activeBinding.id, from, to),
      ]);
      setBinding(activeBinding);
      setSummary(nextSummary);
      setRows(nextRows);
      setBindingMissing(false);
    },
    [companyId, from, to],
  );

  const showStoredActuals = async () => {
    if (!validSelection) return;
    setDataBusy(true);
    setError(null);
    setBudgetAuthorizationRequired(false);
    setLastSync(null);
    selectReportingCompany(companyId);
    try {
      const activeBinding = await findProjectBinding(Number(companyId), Number(projectId));
      await loadSnapshot(activeBinding);
    } catch (reason) {
      if (reason instanceof BudgetApiError && reason.kind === 'NOT_FOUND') {
        clearActuals();
        setBindingMissing(true);
      } else {
        captureBudgetError(reason);
      }
    } finally {
      setDataBusy(false);
    }
  };

  const createAndSync = async () => {
    if (!validSelection || !selectedProject) return;
    setSyncBusy(true);
    setError(null);
    setBudgetAuthorizationRequired(false);
    selectReportingCompany(companyId);
    try {
      const activeBinding = await createProjectBinding(Number(companyId), selectedProject);
      const result = await syncProjectActuals(Number(companyId), activeBinding.id, from, to);
      setLastSync(result);
      setBinding(activeBinding);
      setBindingMissing(false);
      if (result.status === 'BLOCKED') {
        setError(syncFailureLabel(result.failureCode));
        return;
      }
      await loadSnapshot(activeBinding);
    } catch (reason) {
      captureBudgetError(reason);
    } finally {
      setSyncBusy(false);
    }
  };

  const refreshFromErp = async () => {
    if (!binding || !validSelection) return;
    setSyncBusy(true);
    setError(null);
    setBudgetAuthorizationRequired(false);
    selectReportingCompany(companyId);
    try {
      const result = await syncProjectActuals(Number(companyId), binding.id, from, to);
      setLastSync(result);
      if (result.status === 'BLOCKED') {
        setError(syncFailureLabel(result.failureCode));
        return;
      }
      await loadSnapshot(binding);
    } catch (reason) {
      captureBudgetError(reason);
    } finally {
      setSyncBusy(false);
    }
  };

  const openAccountingDetail = () => {
    if (!validSelection) return;
    selectReportingCompany(companyId);
    const params = new URLSearchParams({
      projectId,
      dateFrom: from,
      dateTo: to,
    });
    navigate(`${reportingRoot}/fin-proje-muhasebe-gercekleseni?${params.toString()}`);
  };

  const columnDefs = React.useMemo<ColDef<ProjectActualRow>[]>(() => {
    const currency =
      summary?.currency && /^[A-Z]{3}$/.test(summary.currency) ? summary.currency : 'TRY';
    const meta: ColumnMeta[] = [
      { field: 'postingDate', headerNameKey: 'Tarih', columnType: 'date', width: 125 },
      { field: 'accountCode', headerNameKey: 'Hesap kodu', columnType: 'text', width: 135 },
      {
        field: 'debitCredit',
        headerNameKey: 'Yön',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 105,
      },
      {
        field: 'accountingAmount',
        headerNameKey: 'Muhasebe tutarı',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 160,
      },
      {
        field: 'classifiedCostAmount',
        headerNameKey: 'Sınıflanmış maliyet',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 175,
      },
      {
        field: 'costTreatment',
        headerNameKey: 'Maliyet sınıfı',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 180,
      },
      {
        field: 'documentType',
        headerNameKey: 'Kaynak belge',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 145,
      },
      { field: 'documentNo', headerNameKey: 'Belge no', columnType: 'text', width: 145 },
      {
        field: 'resolutionStatus',
        headerNameKey: 'Belge eşleşmesi',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 155,
      },
      { field: 'journalCardId', headerNameKey: 'Fiş kimliği', columnType: 'number', width: 130 },
      { field: 'journalRowId', headerNameKey: 'Fiş satırı', columnType: 'number', width: 125 },
      { field: 'actionType', headerNameKey: 'İşlem tipi', columnType: 'number', width: 115 },
      { field: 'actionId', headerNameKey: 'Kaynak işlem', columnType: 'number', width: 135 },
      { field: 'sourceLedgerYear', headerNameKey: 'Defter yılı', columnType: 'number', width: 110 },
      { field: 'costRuleVersion', headerNameKey: 'Kural sürümü', columnType: 'number', width: 120 },
      { field: 'syncedAt', headerNameKey: 'Snapshot zamanı', columnType: 'date', width: 175 },
    ];
    return buildColDefs(meta, identityTranslate) as ColDef<ProjectActualRow>[];
  }, [summary?.currency]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => navigate(reportingRoot)}
          >
            ← Raporlar
          </button>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Ayrı ürün · salt okunur ERP kaynağı
          </p>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">
            Proje bazlı gerçekleşen maliyet
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Şirketi adıyla, projeyi kodu ve adıyla seçin. Gerçekleşen muhasebe tutarını, maliyet
            sınıflamasını ve kanıtlanabilen kaynak belge bağını tek görünümde inceleyin.
          </p>
        </div>
        <span className="rounded-full border border-state-success-text/30 bg-state-success-bg px-3 py-1 text-xs font-semibold text-state-success-text">
          W3 / MSSQL salt okunur
        </span>
      </header>

      <section
        aria-label="Gerçekleşen maliyet seçimi"
        className="rounded-xl border border-border-subtle bg-surface-default p-5 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Şirket adı</span>
            <select
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={companyId}
              onChange={onCompanyChange}
              disabled={catalogBusy || dataBusy || syncBusy}
            >
              <option value="">
                {catalogBusy && companies.length === 0 ? 'Yükleniyor…' : 'Şirket seçin'}
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {companyLabel(company)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Proje</span>
            <select
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={projectId}
              onChange={onProjectChange}
              disabled={!companyId || catalogBusy || dataBusy || syncBusy}
            >
              <option value="">
                {!companyId
                  ? 'Önce şirket seçin'
                  : catalogBusy
                    ? 'Projeler yükleniyor…'
                    : 'Proje seçin'}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {projectLabel(project)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Başlangıç tarihi</span>
            <input
              type="date"
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={from}
              disabled={dataBusy || syncBusy}
              onChange={(event) => {
                setFrom(event.target.value);
                clearActuals();
              }}
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Bitiş tarihi</span>
            <input
              type="date"
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={to}
              disabled={dataBusy || syncBusy}
              onChange={(event) => {
                setTo(event.target.value);
                clearActuals();
              }}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            Tarih raporlama penceresidir; bütçe kimliği projedir. “Göster” yalnız kayıtlı PostgreSQL
            snapshot’ını okur.
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!validSelection || dataBusy || syncBusy}
            onClick={showStoredActuals}
          >
            {dataBusy ? 'Gerçekleşen yükleniyor…' : 'Gerçekleşeni göster'}
          </button>
        </div>
      </section>

      {bindingMissing ? (
        <section
          aria-label="Proje bağlantısı kurulumu"
          className="rounded-xl border border-state-warning-text/30 bg-state-warning-bg p-5"
        >
          <h2 className="font-semibold text-text-primary">Bu proje henüz bağlanmamış</h2>
          <p className="mt-2 text-sm text-text-secondary">
            İlk kurulum, proje ile W3 muhasebe kaynağı arasında yalnız kimlik bağı kurar ve seçilen
            tarih aralığını salt okunur kaynaktan PostgreSQL snapshot’ına alır.
          </p>
          <button
            type="button"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={syncBusy}
            onClick={createAndSync}
          >
            {syncBusy ? 'Bağlantı ve senkron yapılıyor…' : 'Bağlantıyı kur ve ilk senkronu yap'}
          </button>
        </section>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-state-danger-text/30 bg-state-danger-bg p-4 text-sm text-state-danger-text"
        >
          <strong>İşlem tamamlanamadı.</strong> {error}
          {budgetAuthorizationRequired ? (
            <button
              type="button"
              className="ml-3 rounded-md border border-state-danger-text/40 px-3 py-1.5 font-semibold hover:bg-surface-default disabled:opacity-50"
              disabled={dataBusy}
              onClick={renewBudgetAuthorization}
            >
              Bütçe yetkisini güvenli girişle yenile
            </button>
          ) : null}
        </div>
      ) : null}

      {lastSync && lastSync.status !== 'BLOCKED' ? (
        <div
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            lastSync.status === 'MATCHED'
              ? 'border-state-success-text/30 bg-state-success-bg text-state-success-text'
              : 'border-state-warning-text/30 bg-state-warning-bg text-text-primary'
          }`}
        >
          <strong>
            {lastSync.status === 'MATCHED'
              ? 'ERP ve snapshot toplamı eşleşti.'
              : 'ERP ve snapshot arasında fark var.'}
          </strong>{' '}
          {lastSync.sourceRowCount} kaynak satırı okundu, {lastSync.changedRowCount} satır
          güncellendi, {lastSync.tombstoneRowCount} satır iptal işaretlendi.
        </div>
      ) : null}

      {summary ? (
        <>
          <section
            aria-label="Gerçekleşen maliyet özeti"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
          >
            <SummaryCard
              label="Muhasebe gerçekleşeni"
              value={amountLabel(summary.accountingActual, summary.currency)}
              detail={
                summary.snapshotRowCount === summary.rowCount
                  ? `${summary.rowCount} muhasebe satırı`
                  : `${summary.rowCount} aktif · ${summary.snapshotRowCount} toplam snapshot satırı`
              }
            />
            <SummaryCard
              label="Sınıflanmış maliyet"
              value={amountLabel(summary.classifiedCost, summary.currency)}
              detail="Aktif kural setine göre"
            />
            <SummaryCard
              label="Hariç tutulan"
              value={amountLabel(summary.excludedAmount, summary.currency)}
              detail="Karşı hesap ve virman"
            />
            <SummaryCard
              label="İncelenecek"
              value={amountLabel(summary.requiresReviewAmount, summary.currency)}
              detail={`${summary.requiresReviewCount} satır`}
              tone={summary.requiresReviewCount > 0 ? 'warning' : 'default'}
            />
            <SummaryCard
              label="Son başarılı senkron"
              value={dateTimeLabel(summary.lastSyncAt)}
              detail={
                summary.reconciliationStatus === 'MATCHED'
                  ? 'Mutabakat eşleşti'
                  : summary.reconciliationStatus === 'DIFFERENCE'
                    ? `Fark: ${amountLabel(summary.reconciliationDifference ?? 0, summary.currency)}`
                    : 'Bu tarih penceresi henüz mutabakat görmedi'
              }
              tone={summary.reconciliationStatus === 'MATCHED' ? 'default' : 'warning'}
            />
          </section>

          <section
            aria-label="Gerçekleşen maliyet satırları"
            className="rounded-xl border border-border-subtle bg-surface-default p-4 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Gerçekleşen maliyet detayları
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Belge eşleşmesi “çözümlenmedi” ise sistem kaynak belgeyi tahmin etmez; fiş ve
                  kaynak işlem kimlikleri inceleme kanıtı olarak korunur.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border-subtle px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted disabled:opacity-50"
                  disabled={syncBusy}
                  onClick={openAccountingDetail}
                >
                  Canlı Muhasebe Detayını aç
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={syncBusy}
                  onClick={refreshFromErp}
                >
                  {syncBusy ? 'ERP’den yenileniyor…' : 'ERP’den yenile'}
                </button>
              </div>
            </div>

            {summary.snapshotRowCount > rows.length ? (
              <div className="mb-4 rounded-lg border border-state-warning-text/30 bg-state-warning-bg p-3 text-sm text-text-primary">
                Snapshot’ta {summary.snapshotRowCount.toLocaleString('tr-TR')} satır var; bu hızlı
                görünüm en güncel {rows.length.toLocaleString('tr-TR')} satırı gösteriyor. Tam
                kapsam için “Canlı Muhasebe Detayını aç” eylemini kullanın.
              </div>
            ) : null}

            {rows.length > 0 ? (
              <GridShell<ProjectActualRow>
                gridKey={`budget-actuals-${binding?.id ?? 'none'}-${from}-${to}`}
                columnDefs={columnDefs}
                rowData={rows}
                rowModelType="clientSide"
                density="compact"
                access="readonly"
                defaultColDef={{ minWidth: 95, resizable: true, sortable: true, filter: true }}
                gridOptions={{
                  pagination: true,
                  paginationPageSize: 50,
                  suppressPaginationPanel: false,
                  animateRows: false,
                  getRowId: (params) => params.data.id,
                }}
                animateRows={false}
                height={560}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border-subtle p-10 text-center text-sm text-text-secondary">
                Seçilen tarih aralığında snapshot satırı bulunamadı. Bu sonuç sıfır maliyet anlamına
                gelmez; son başarılı senkron zamanını ve mutabakat durumunu kontrol edin.
              </div>
            )}
          </section>
        </>
      ) : null}

      <section className="rounded-xl border border-state-warning-text/30 bg-state-warning-bg p-4 text-sm text-text-primary">
        <strong>Kontrollü sınıflama.</strong> AI bu ekranda yalnız ileride maliyet kodu önerebilir;
        ERP kaydını, kaynak belgeyi veya onaylı maliyet kuralını kendiliğinden değiştiremez.
      </section>
    </div>
  );
};

export default BudgetWorkspace;
