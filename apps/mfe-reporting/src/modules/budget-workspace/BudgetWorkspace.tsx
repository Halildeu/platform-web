import React from 'react';
import type { ColDef } from 'ag-grid-community';
import { useLocation, useNavigate } from 'react-router-dom';
import { Descriptions, DetailDrawer } from '@mfe/design-system';
import {
  buildColDefs,
  buildProcessCellCallback,
  type BadgeColumnMeta,
  type ColumnMeta,
} from '@mfe/design-system/advanced/data-grid';
import '@mfe/design-system/advanced/data-grid/setup';
import { selectReportingCompany } from '../../components/CompanyPicker';
import { EntityGridTemplate } from '../../grid';
import {
  BudgetApiError,
  createProjectBinding,
  fetchCompanies,
  fetchProjectActualRows,
  fetchProjectActualSourceDocument,
  fetchProjectActualSourceLines,
  fetchProjectActualSummary,
  fetchProjects,
  findProjectBinding,
  syncProjectActuals,
} from './api';
import type {
  CompanyOption,
  ProjectActualRow,
  ProjectActualSourceDocumentDetail,
  ProjectActualSourceLineRow,
  ProjectActualSummary,
  ProjectActualSyncResult,
  ProjectBinding,
  ProjectOption,
} from './types';

type CostReviewRow = {
  id: string;
  origin: 'SOURCE_LINE' | 'ACCOUNTING_FALLBACK';
  date: string;
  documentType: string | null;
  documentKind: string | null;
  documentNo: string | null;
  productName: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  netAmount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  grossAmount: number | null;
  costBasisAmount: number;
  currency: string;
  accountCode: string | null;
  costStatus: string;
  lineMatchStatus: string | null;
  documentReconciliationStatus: string | null;
  sourceDocumentId: string | null;
  sourceLine: ProjectActualSourceLineRow | null;
  accountingRow: ProjectActualRow | null;
};

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
const PROJECT_ACTUALS_GRID_ID = 'reports.budget-project-actuals';
const PROJECT_ACTUALS_GRID_SCHEMA_VERSION = 2;

const STATUS_VARIANTS: BadgeColumnMeta['variantMap'] = {
  DEBIT: 'info',
  CREDIT: 'warning',
  INCLUDE_COST: 'success',
  INCLUDE_NEGATIVE_COST: 'success',
  EXCLUDE_COUNTERPART: 'muted',
  EXCLUDE_TRANSFER: 'muted',
  REQUIRES_REVIEW: 'warning',
  EXACT_LINE: 'success',
  EXACT_SOURCE_LINE: 'success',
  RECONCILED: 'success',
  DIFFERENCE: 'warning',
  NO_ACCOUNTING: 'warning',
  HEADER_ONLY: 'info',
  PARTIAL: 'warning',
  UNRESOLVED: 'error',
  MANUAL_JOURNAL: 'muted',
  INVOICE: 'info',
  EXPENSE: 'warning',
  BANK: 'info',
  CURRENT_ACCOUNT: 'info',
  TRANSFER: 'muted',
  SOURCE_LINE: 'success',
  ACCOUNTING_FALLBACK: 'warning',
  PURCHASE_INVOICE: 'info',
  PURCHASE_RETURN: 'warning',
  SALES_INVOICE: 'muted',
  SALES_RETURN: 'muted',
  OTHER_INVOICE: 'muted',
  STOCK_CONSUMPTION: 'info',
  DEPRECIATION: 'info',
  PAYROLL: 'info',
  OTHER_SOURCE: 'muted',
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
  EXACT_SOURCE_LINE: 'Kaynak satır eşleşti',
  RECONCILED: 'Belge toplamı mutabık',
  DIFFERENCE: 'Belge toplamında fark',
  NO_ACCOUNTING: 'Muhasebe bağı yok',
  HEADER_ONLY: 'Belge başlığı',
  PARTIAL: 'Kısmi',
  UNRESOLVED: 'Çözümlenmedi',
  MANUAL_JOURNAL: 'Mahsup fişi',
  INVOICE: 'Fatura',
  EXPENSE: 'Masraf',
  BANK: 'Banka',
  CURRENT_ACCOUNT: 'Cari hareket',
  TRANSFER: 'Virman',
  SOURCE_LINE: 'Kaynak işlem satırı',
  ACCOUNTING_FALLBACK: 'Kaynak satırı bekliyor',
  PURCHASE_INVOICE: 'Alış faturası',
  PURCHASE_RETURN: 'Alış iadesi',
  SALES_INVOICE: 'Satış faturası',
  SALES_RETURN: 'Satış iadesi',
  OTHER_INVOICE: 'Diğer fatura',
  STOCK_CONSUMPTION: 'Stok sarfı',
  DEPRECIATION: 'Amortisman',
  PAYROLL: 'Bordro',
  OTHER_SOURCE: 'Diğer kaynak',
};

const statusLabel = (value: string | null): string =>
  value ? (STATUS_LABELS?.[value] ?? value) : '—';

const LOCALIZED_QUICK_FILTER_FIELDS = new Set([
  'origin',
  'documentKind',
  'costStatus',
  'lineMatchStatus',
  'documentReconciliationStatus',
]);

const withLocalizedBadgeQuickFilter = <TRow,>(
  columnDefs: ColDef<TRow>[],
): ColDef<TRow>[] =>
  columnDefs.map<ColDef<TRow>>((column) => {
    if (!column.field || !LOCALIZED_QUICK_FILTER_FIELDS.has(column.field)) {
      return column;
    }
    return {
      ...column,
      getQuickFilterText: (params) => {
        if (params.value === null || params.value === undefined) {
          return '';
        }
        const raw = String(params.value);
        const label = statusLabel(raw);
        return label === raw ? raw : `${raw} ${label}`;
      },
    };
  });

const sourceCostStatus = (documentKind: ProjectActualSourceLineRow['documentKind']): string => {
  switch (documentKind) {
    case 'PURCHASE_INVOICE':
    case 'EXPENSE':
    case 'STOCK_CONSUMPTION':
    case 'DEPRECIATION':
    case 'PAYROLL':
      return 'INCLUDE_COST';
    case 'PURCHASE_RETURN':
      return 'INCLUDE_NEGATIVE_COST';
    case 'SALES_INVOICE':
    case 'SALES_RETURN':
      return 'EXCLUDE_COUNTERPART';
    default:
      return 'REQUIRES_REVIEW';
  }
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
  const [accountingRows, setAccountingRows] = React.useState<ProjectActualRow[]>([]);
  const [sourceLines, setSourceLines] = React.useState<ProjectActualSourceLineRow[]>([]);
  const [detailRow, setDetailRow] = React.useState<CostReviewRow | null>(null);
  const [sourceDocumentDetail, setSourceDocumentDetail] =
    React.useState<ProjectActualSourceDocumentDetail | null>(null);
  const [sourceDocumentBusy, setSourceDocumentBusy] = React.useState(false);
  const [lastSync, setLastSync] = React.useState<ProjectActualSyncResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [budgetAuthorizationRequired, setBudgetAuthorizationRequired] = React.useState(false);

  const selectedProject = projects.find((project) => String(project.id) === projectId) ?? null;
  const validSelection = Boolean(companyId && projectId && from && to && from <= to);

  const captureBudgetError = (reason: unknown) => {
    setBudgetAuthorizationRequired(reason instanceof BudgetApiError && reason.kind === 'FORBIDDEN');
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
    setAccountingRows([]);
    setSourceLines([]);
    setDetailRow(null);
    setSourceDocumentDetail(null);
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
      const [nextSummary, nextRows, nextSourceLines] = await Promise.all([
        fetchProjectActualSummary(numericCompany, activeBinding.id, from, to),
        fetchProjectActualRows(numericCompany, activeBinding.id, from, to),
        fetchProjectActualSourceLines(numericCompany, activeBinding.id, from, to),
      ]);
      setBinding(activeBinding);
      setSummary(nextSummary);
      setAccountingRows(nextRows);
      setSourceLines(nextSourceLines);
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

  const reviewRows = React.useMemo<CostReviewRow[]>(() => {
    const representedSourceKeys = new Set(
      sourceLines.map((line) => `${line.documentType}:${line.externalDocumentId}`),
    );
    const sourceRows = sourceLines.map<CostReviewRow>((line) => ({
      id: `source-line:${line.id}`,
      origin: 'SOURCE_LINE',
      date: line.documentDate,
      documentType: line.documentType,
      documentKind: line.documentKind,
      documentNo: line.documentNo,
      productName: line.productName,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      netAmount: line.netAmount,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      grossAmount: line.grossAmount,
      costBasisAmount: line.costBasisAmount,
      currency: line.currency,
      accountCode: line.accountCode,
      costStatus: sourceCostStatus(line.documentKind),
      lineMatchStatus: line.lineMatchStatus,
      documentReconciliationStatus: line.documentReconciliationStatus,
      sourceDocumentId: line.sourceDocumentId,
      sourceLine: line,
      accountingRow: null,
    }));
    const fallbackRows = accountingRows
      .filter(
        (row) =>
          row.documentType === null ||
          row.actionId === null ||
          !representedSourceKeys.has(`${row.documentType}:${row.actionId}`),
      )
      .map<CostReviewRow>((row) => ({
        id: `accounting:${row.id}`,
        origin: 'ACCOUNTING_FALLBACK',
        date: row.postingDate,
        documentType: row.documentType,
        documentKind: null,
        documentNo: row.documentNo,
        productName: row.documentType
          ? `${statusLabel(row.documentType)} kaynak satırı henüz bağlanmamış`
          : 'Kaynak türü çözümlenmemiş muhasebe kaydı',
        description: row.accountCode ? `Hesap: ${row.accountCode}` : null,
        quantity: null,
        unit: null,
        unitPrice: null,
        netAmount: null,
        taxRate: null,
        taxAmount: null,
        grossAmount: null,
        costBasisAmount: row.classifiedCostAmount,
        currency: row.currency,
        accountCode: row.accountCode,
        costStatus: row.costTreatment,
        lineMatchStatus: row.resolutionStatus,
        documentReconciliationStatus: null,
        sourceDocumentId: null,
        sourceLine: null,
        accountingRow: row,
      }));
    return [...sourceRows, ...fallbackRows];
  }, [accountingRows, sourceLines]);

  const openReviewDetail = async (row: CostReviewRow) => {
    setDetailRow(row);
    setSourceDocumentDetail(null);
    if (!row.sourceDocumentId || !binding) return;
    setSourceDocumentBusy(true);
    try {
      setSourceDocumentDetail(
        await fetchProjectActualSourceDocument(
          Number(companyId),
          binding.id,
          row.sourceDocumentId,
        ),
      );
    } catch (reason) {
      captureBudgetError(reason);
    } finally {
      setSourceDocumentBusy(false);
    }
  };

  const columnArtifacts = React.useMemo(() => {
    const currency =
      summary?.currency && /^[A-Z]{3}$/.test(summary.currency) ? summary.currency : 'TRY';
    const meta: ColumnMeta[] = [
      {
        field: 'origin',
        headerNameKey: 'Kayıt kaynağı',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 155,
      },
      { field: 'date', headerNameKey: 'Belge tarihi', columnType: 'date', width: 130 },
      {
        field: 'documentKind',
        headerNameKey: 'Belge türü',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 150,
      },
      { field: 'documentNo', headerNameKey: 'Belge no', columnType: 'text', width: 145 },
      { field: 'productName', headerNameKey: 'Kaynak kalemi', columnType: 'text', width: 250 },
      { field: 'description', headerNameKey: 'Açıklama', columnType: 'text', width: 210 },
      { field: 'quantity', headerNameKey: 'Miktar', columnType: 'number', width: 105 },
      { field: 'unit', headerNameKey: 'Birim', columnType: 'text', width: 85 },
      {
        field: 'unitPrice',
        headerNameKey: 'Birim fiyat',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 135,
      },
      {
        field: 'netAmount',
        headerNameKey: 'Net tutar',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 135,
      },
      { field: 'taxRate', headerNameKey: 'KDV %', columnType: 'number', width: 95 },
      {
        field: 'taxAmount',
        headerNameKey: 'KDV tutarı',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 130,
      },
      {
        field: 'grossAmount',
        headerNameKey: 'Brüt tutar',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 135,
      },
      {
        field: 'costBasisAmount',
        headerNameKey: 'Maliyet esası',
        columnType: 'currency',
        currencyCode: currency,
        decimals: 2,
        width: 145,
      },
      {
        field: 'costStatus',
        headerNameKey: 'Maliyet durumu',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 180,
      },
      {
        field: 'lineMatchStatus',
        headerNameKey: 'Satır eşleşmesi',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 165,
      },
      {
        field: 'documentReconciliationStatus',
        headerNameKey: 'Belge mutabakatı',
        columnType: 'badge',
        variantMap: STATUS_VARIANTS,
        labelMap: STATUS_LABELS,
        defaultVariant: 'muted',
        width: 175,
      },
      { field: 'accountCode', headerNameKey: 'Hesap kodu', columnType: 'text', width: 135 },
    ];
    const columnDefs = buildColDefs(meta, identityTranslate) as ColDef<CostReviewRow>[];
    return {
      columnDefs: withLocalizedBadgeQuickFilter(columnDefs),
      processCellCallback: buildProcessCellCallback(meta, identityTranslate),
    };
  }, [summary?.currency]);

  const exportConfig = React.useMemo(
    () => ({
      fileBaseName: `butce-gerceklesen-${selectedProject?.code || projectId || 'proje'}-${from}-${to}`,
      sheetName: 'Gerçekleşen Maliyet',
      csvFileBaseName: `butce-gerceklesen-${selectedProject?.code || projectId || 'proje'}-${from}-${to}`,
      csvColumnSeparator: ';',
      csvBom: true,
      processCellCallback: columnArtifacts.processCellCallback,
    }),
    [columnArtifacts.processCellCallback, from, projectId, selectedProject?.code, to],
  );

  const gridActions = (
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
  );

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
            Şirketi adıyla, projeyi kodu ve adıyla seçin. Gerçekleşen maliyeti muhasebe fişini
            oluşturan fatura, sarf, masraf, amortisman ve diğer operasyonel kaynak satırından
            inceleyin.
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
          güncellendi, {lastSync.tombstoneRowCount} satır iptal işaretlendi.{' '}
          {lastSync.sourceLineCount} kaynak işlem satırı ve {lastSync.sourceDocumentCount} kaynak
          belge snapshot’a alındı.
        </div>
      ) : null}

      {summary ? (
        <>
          <section
            aria-label="Gerçekleşen maliyet özeti"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
          >
            <SummaryCard
              label="Gerçekleşen maliyet"
              value={amountLabel(summary.actualCost, summary.currency)}
              detail="Kaynak işlem satırları + henüz bağlanmamış kayıtlar"
            />
            <SummaryCard
              label="Kaynak satırı maliyeti"
              value={amountLabel(summary.sourceLineActual, summary.currency)}
              detail={`${summary.sourceLineCount} satır · ${summary.sourceDocumentCount} belge`}
            />
            <SummaryCard
              label="Kaynak satırı bekleyen"
              value={amountLabel(summary.unlinkedAccountingActual, summary.currency)}
              detail="Masraf, sarf, amortisman ve diğer adaptörler"
            />
            <SummaryCard
              label="Muhasebe kontrol toplamı"
              value={amountLabel(summary.classifiedCost, summary.currency)}
              detail={`${summary.rowCount} aktif muhasebe satırı`}
            />
            <SummaryCard
              label="Eşleşmesi incelenecek"
              value={`${summary.unresolvedSourceLineCount} satır`}
              detail={amountLabel(summary.requiresReviewAmount, summary.currency)}
              tone={
                summary.unresolvedSourceLineCount > 0 || summary.requiresReviewCount > 0
                  ? 'warning'
                  : 'default'
              }
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
            <div className="mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Gerçekleşen maliyet · kaynak satırları
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Ana kayıt muhasebe fişini oluşturan operasyonel satırdır: fatura, sarf, masraf,
                  amortisman veya ilgili diğer kaynak. Faturada net tutar maliyet esası; KDV ve
                  brüt ödeme tutarı ayrı alanlardır.
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Çift tıklayarak kaynak belgenin bütün satırlarını, muhasebe dağılımını ve
                  mutabakat farkını birlikte açabilirsiniz.
                </p>
              </div>
            </div>

            {summary.sourceLineCount > sourceLines.length ||
            summary.snapshotRowCount > accountingRows.length ? (
              <div className="mb-4 rounded-lg border border-state-warning-text/30 bg-state-warning-bg p-3 text-sm text-text-primary">
                Kayıt sayısı hızlı görünüm sınırını aşıyor. Tam muhasebe kapsamı için “Canlı
                Muhasebe Detayını aç” eylemini kullanın.
              </div>
            ) : null}

            {reviewRows.length > 0 ? (
              <EntityGridTemplate<CostReviewRow>
                gridId={PROJECT_ACTUALS_GRID_ID}
                gridSchemaVersion={PROJECT_ACTUALS_GRID_SCHEMA_VERSION}
                columnDefs={columnArtifacts.columnDefs}
                rowData={reviewRows}
                total={reviewRows.length}
                pageSize={50}
                dataSourceMode="client"
                onRowDoubleClick={(row) => void openReviewDetail(row)}
                exportLeadingExtras={gridActions}
                exportConfig={exportConfig}
                quickFilterPlaceholder="Tüm gerçekleşen maliyet sütunlarında ara..."
                messages={{
                  resetFiltersLabel: 'Filtreleri sıfırla',
                  fullscreenTooltip: 'Tam ekran',
                  excelLabel: 'Excel indir',
                  csvLabel: 'CSV indir',
                }}
                defaultColDef={{ minWidth: 95, resizable: true, sortable: true, filter: true }}
                gridOptions={{
                  pagination: true,
                  paginationPageSize: 50,
                  animateRows: false,
                  multiSortKey: 'ctrl',
                  getRowId: (params) => params.data.id,
                }}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border-subtle p-10 text-center text-sm text-text-secondary">
                Seçilen tarih aralığında kaynak işlem satırı veya diğer gerçekleşen maliyet kaydı
                bulunamadı. Bu sonuç sıfır maliyet anlamına gelmez; son başarılı senkronu kontrol
                edin.
              </div>
            )}
          </section>

          <DetailDrawer
            open={detailRow !== null}
            onClose={() => {
              setDetailRow(null);
              setSourceDocumentDetail(null);
            }}
            title={
              detailRow?.origin === 'SOURCE_LINE'
                ? 'Kaynak belge ve maliyet satırları'
                : 'Kaynak satırı henüz bağlanmamış gerçekleşen'
            }
            subtitle={detailRow?.documentNo ? `Belge: ${detailRow.documentNo}` : undefined}
            size="xl"
            closeOnBackdrop
            footer={
              <button
                type="button"
                className="rounded-md border border-border-subtle px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted"
                onClick={openAccountingDetail}
              >
                Canlı Muhasebe Detayını aç
              </button>
            }
          >
            {detailRow ? (
              <div className="space-y-6">
                {detailRow.origin === 'SOURCE_LINE' ? (
                  <>
                    {sourceDocumentBusy ? (
                      <p role="status" className="text-sm text-text-secondary">
                        Kaynak belge detayı yükleniyor…
                      </p>
                    ) : null}
                    {sourceDocumentDetail ? (
                      <>
                        <Descriptions
                          title="Belge özeti"
                          description="Belge toplamı mutabakatı, satırların tek tek aynı muhasebe satırına bağlandığı anlamına gelmez."
                          columns={3}
                          density="compact"
                          bordered
                          fullWidth
                          items={[
                            {
                              key: 'documentDate',
                              label: 'Belge tarihi',
                              value: sourceDocumentDetail.documentDate,
                            },
                            {
                              key: 'documentKind',
                              label: 'Belge türü',
                              value: statusLabel(sourceDocumentDetail.documentKind),
                            },
                            {
                              key: 'reconciliationStatus',
                              label: 'Belge mutabakatı',
                              value: statusLabel(sourceDocumentDetail.reconciliationStatus),
                              tone:
                                sourceDocumentDetail.reconciliationStatus === 'RECONCILED'
                                  ? 'success'
                                  : 'warning',
                            },
                            {
                              key: 'sourceLineTotal',
                              label: 'Kaynak satırları maliyet toplamı',
                              value: amountLabel(
                                sourceDocumentDetail.sourceLineTotal,
                                sourceDocumentDetail.currency,
                              ),
                            },
                            {
                              key: 'accountingCostTotal',
                              label: 'Muhasebe maliyet toplamı',
                              value: amountLabel(
                                sourceDocumentDetail.accountingCostTotal,
                                sourceDocumentDetail.currency,
                              ),
                            },
                            {
                              key: 'reconciliationDifference',
                              label: 'Mutabakat farkı',
                              value: amountLabel(
                                sourceDocumentDetail.reconciliationDifference,
                                sourceDocumentDetail.currency,
                              ),
                            },
                          ]}
                        />

                        <section aria-label="Kaynak işlem satırları">
                          <h3 className="text-sm font-semibold text-text-primary">
                            Kaynak işlem satırları
                          </h3>
                          <div className="mt-2 overflow-x-auto rounded-lg border border-border-subtle">
                            <table className="min-w-full text-left text-xs">
                              <thead className="bg-surface-muted text-text-secondary">
                                <tr>
                                  <th className="px-3 py-2">#</th>
                                  <th className="px-3 py-2">Kaynak kalemi</th>
                                  <th className="px-3 py-2">Miktar</th>
                                  <th className="px-3 py-2">Net</th>
                                  <th className="px-3 py-2">Vergi / KDV</th>
                                  <th className="px-3 py-2">Brüt</th>
                                  <th className="px-3 py-2">Eşleşme</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sourceDocumentDetail.lines.map((line) => (
                                  <tr key={line.id} className="border-t border-border-subtle">
                                    <td className="px-3 py-2">{line.lineOrdinal}</td>
                                    <td className="px-3 py-2">
                                      <span className="font-medium text-text-primary">
                                        {line.productName ?? '—'}
                                      </span>
                                      {line.description ? (
                                        <span className="mt-1 block text-text-secondary">
                                          {line.description}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2">
                                      {line.quantity ?? '—'} {line.unit ?? ''}
                                    </td>
                                    <td className="px-3 py-2">
                                      {amountLabel(line.netAmount, line.currency)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {amountLabel(line.taxAmount, line.currency)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {amountLabel(line.grossAmount, line.currency)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {statusLabel(line.lineMatchStatus)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>

                        <section aria-label="Muhasebe dağılımı">
                          <h3 className="text-sm font-semibold text-text-primary">
                            Muhasebe dağılımı
                          </h3>
                          <p className="mt-1 text-xs text-text-secondary">
                            Karşı hesap ve KDV satırları maliyet toplamına ikinci kez eklenmez.
                          </p>
                          <div className="mt-2 overflow-x-auto rounded-lg border border-border-subtle">
                            <table className="min-w-full text-left text-xs">
                              <thead className="bg-surface-muted text-text-secondary">
                                <tr>
                                  <th className="px-3 py-2">Hesap</th>
                                  <th className="px-3 py-2">Yön</th>
                                  <th className="px-3 py-2">Muhasebe tutarı</th>
                                  <th className="px-3 py-2">Maliyet tutarı</th>
                                  <th className="px-3 py-2">Kural</th>
                                  <th className="px-3 py-2">Kaynak bağı</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sourceDocumentDetail.accountingRows.map((row) => (
                                  <tr key={row.id} className="border-t border-border-subtle">
                                    <td className="px-3 py-2">{row.accountCode ?? '—'}</td>
                                    <td className="px-3 py-2">
                                      {statusLabel(row.debitCredit)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {amountLabel(row.accountingAmount, row.currency)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {amountLabel(row.classifiedCostAmount, row.currency)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {statusLabel(row.costTreatment)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {statusLabel(row.resolutionStatus)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      </>
                    ) : null}
                  </>
                ) : detailRow.accountingRow ? (
                  <>
                    <Descriptions
                      title="Muhasebe kaynağı"
                      description="Bu kayıt için kaynak belge satırı snapshot’ı yoktur; kanıtlanmayan belge bağı üretilmez."
                      columns={3}
                      density="compact"
                      bordered
                      fullWidth
                      items={[
                        {
                          key: 'postingDate',
                          label: 'Tarih',
                          value: detailRow.accountingRow.postingDate,
                        },
                        {
                          key: 'accountCode',
                          label: 'Hesap kodu',
                          value: detailRow.accountingRow.accountCode,
                        },
                        {
                          key: 'documentType',
                          label: 'Kaynak türü',
                          value: statusLabel(detailRow.accountingRow.documentType),
                        },
                        {
                          key: 'accountingAmount',
                          label: 'Muhasebe tutarı',
                          value: amountLabel(
                            detailRow.accountingRow.accountingAmount,
                            detailRow.accountingRow.currency,
                          ),
                        },
                        {
                          key: 'classifiedCostAmount',
                          label: 'Maliyet tutarı',
                          value: amountLabel(
                            detailRow.accountingRow.classifiedCostAmount,
                            detailRow.accountingRow.currency,
                          ),
                        },
                        {
                          key: 'costTreatment',
                          label: 'Maliyet durumu',
                          value: statusLabel(detailRow.accountingRow.costTreatment),
                        },
                        {
                          key: 'journalCardId',
                          label: 'Fiş kimliği',
                          value: detailRow.accountingRow.journalCardId,
                        },
                        {
                          key: 'journalRowId',
                          label: 'Fiş satırı',
                          value: detailRow.accountingRow.journalRowId,
                        },
                        {
                          key: 'resolutionStatus',
                          label: 'Kaynak çözümleme',
                          value: statusLabel(detailRow.accountingRow.resolutionStatus),
                        },
                      ]}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </DetailDrawer>
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
