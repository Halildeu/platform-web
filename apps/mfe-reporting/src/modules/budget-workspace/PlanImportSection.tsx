import React from 'react';
import {
  BudgetApiError,
  fetchPlanVersion,
  importWorkcubePlan,
  submitPlanVersion,
} from './api';
import type { BudgetPlanView, BudgetVersionStatus, PlanImportResult } from './types';

const currentYear = new Date().getFullYear();
const trNumber = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const amountLabel = (amount: number, currency: string): string =>
  `${trNumber.format(amount)} ${currency}`.trim();

const errorMessage = (error: unknown): string =>
  error instanceof BudgetApiError
    ? error.message
    : 'Beklenmeyen bir hata oluştu. Kaynak veride değişiklik yapılmadı.';

const importFailureLabel = (failureCode: string | null): string => {
  switch (failureCode) {
    case 'PROVIDER_TOKEN_REJECTED':
      return 'ERP erişim belirteci reddedildi.';
    case 'PROVIDER_SCOPE_DENIED':
      return 'ERP bütçe planı kaynağını okuma yetkisi reddedildi.';
    case 'PROVIDER_UNAVAILABLE':
      return 'ERP bütçe planı kaynağına ulaşılamadı.';
    case 'PROVIDER_DATA_INVALID':
      return 'ERP kaynağı doğrulama sınırlarının dışında veri döndürdü.';
    case 'IMPORT_WRITE_FAILED':
      return 'Taslak güvenli biçimde yazılamadı; hiçbir satır kaydedilmedi.';
    default:
      return 'İçe aktarma güvenli biçimde durduruldu.';
  }
};

const SKIP_REASON_LABELS: Record<string, string> = {
  MISSING_ACCOUNT_CODE: 'Hesap kodu boş',
  NEGATIVE_AMOUNT: 'Negatif tutar',
  ZERO_AMOUNT: 'Sıfır tutar',
  SCENARIO_PLAN: 'Senaryo planı (varsayılan hariç)',
};

const STATUS_LABELS: Record<BudgetVersionStatus, string> = {
  DRAFT: 'Taslak',
  SUBMITTED: 'Onaya gönderildi',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  SUPERSEDED: 'Yeni sürümle değişti',
};

const statusBadgeClass = (status: BudgetVersionStatus): string => {
  switch (status) {
    case 'DRAFT':
      return 'border-state-warning-text/30 bg-state-warning-bg text-text-primary';
    case 'SUBMITTED':
    case 'APPROVED':
      return 'border-state-success-text/30 bg-state-success-bg text-state-success-text';
    default:
      return 'border-border-subtle bg-surface-muted text-text-secondary';
  }
};

const directionLabel = (direction: 'EXPENSE' | 'INCOME'): string =>
  direction === 'EXPENSE' ? 'Gider' : 'Gelir';

export type PlanImportSectionProps = {
  companyId: string;
};

export const PlanImportSection: React.FC<PlanImportSectionProps> = ({ companyId }) => {
  const [fiscalYear, setFiscalYear] = React.useState(String(currentYear));
  const [includeScenarios, setIncludeScenarios] = React.useState(false);
  const [importBusy, setImportBusy] = React.useState(false);
  const [submitBusy, setSubmitBusy] = React.useState(false);
  const [result, setResult] = React.useState<PlanImportResult | null>(null);
  const [draft, setDraft] = React.useState<BudgetPlanView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const numericYear = Number(fiscalYear);
  const validYear = Number.isInteger(numericYear) && numericYear >= 2000 && numericYear <= 2200;
  const canImport = Boolean(companyId) && validYear && !importBusy && !submitBusy;

  React.useEffect(() => {
    setResult(null);
    setDraft(null);
    setError(null);
  }, [companyId]);

  const runImport = async () => {
    if (!canImport) return;
    setImportBusy(true);
    setError(null);
    setResult(null);
    setDraft(null);
    try {
      const importResult = await importWorkcubePlan(
        Number(companyId),
        numericYear,
        includeScenarios,
      );
      setResult(importResult);
      if (importResult.status === 'BLOCKED') {
        setError(importFailureLabel(importResult.failureCode));
        return;
      }
      if (importResult.planId && importResult.versionId) {
        setDraft(
          await fetchPlanVersion(Number(companyId), importResult.planId, importResult.versionId),
        );
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setImportBusy(false);
    }
  };

  const submitDraft = async () => {
    if (!draft || draft.status !== 'DRAFT' || submitBusy || importBusy) return;
    setSubmitBusy(true);
    setError(null);
    try {
      setDraft(await submitPlanVersion(Number(companyId), draft.planId, draft.versionId));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitBusy(false);
    }
  };

  const periodTotals = React.useMemo(() => {
    if (!draft) return [];
    const totals = new Map<string, number>();
    for (const line of draft.lines) {
      const signed = line.direction === 'EXPENSE' ? line.plannedAmount : -line.plannedAmount;
      totals.set(line.period, (totals.get(line.period) ?? 0) + signed);
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [draft]);

  return (
    <section
      aria-label="Workcube bütçe planı içe aktarma"
      className="rounded-xl border border-border-subtle bg-surface-default p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Workcube bütçe planını içe aktar
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">
            ERP&rsquo;deki onaylı bütçe planı atamaları seçilen mali yıl için versiyonlu bir
            taslağa alınır. ERP kaydı değişmez; aynı yıl için tekrar çalıştırmak yeni satır
            uydurmaz, mevcut taslağı kaynak satırlarından yeniden kurar.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="space-y-2 text-sm font-medium text-text-primary">
          <span>Mali yıl</span>
          <input
            type="number"
            min={2000}
            max={2200}
            className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
            value={fiscalYear}
            disabled={importBusy || submitBusy}
            onChange={(event) => setFiscalYear(event.target.value)}
          />
        </label>

        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-text-primary">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-subtle"
            checked={includeScenarios}
            disabled={importBusy || submitBusy}
            onChange={(event) => setIncludeScenarios(event.target.checked)}
          />
          <span>
            Senaryo planlarını da al
            <span className="block text-xs font-normal text-text-secondary">
              Senaryo planları onaylı atama değildir; yalnız bilinçli tercihle taslağa girer.
            </span>
          </span>
        </label>

        <div className="flex items-end justify-end pb-1">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canImport}
            onClick={runImport}
          >
            {importBusy ? 'İçe aktarılıyor…' : 'Planı içe aktar'}
          </button>
        </div>
      </div>

      {!companyId ? (
        <p className="mt-3 text-xs text-text-secondary">
          İçe aktarma için önce yukarıdan şirket seçin.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-state-danger-text/30 bg-state-danger-bg p-4 text-sm text-state-danger-text"
        >
          <strong>İçe aktarma tamamlanamadı.</strong> {error}
        </div>
      ) : null}

      {result && result.status === 'COMPLETED' ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-state-success-text/30 bg-state-success-bg p-4 text-sm text-state-success-text"
        >
          <strong>İçe aktarma tamamlandı.</strong> {result.fetchedRows} kaynak satırı okundu,{' '}
          {result.importedLines} taslak satırı üretildi, {result.mergedRows} satır birleşti,{' '}
          {result.skippedRows} satır atlandı
          {result.scenarioRows > 0 ? `, ${result.scenarioRows} senaryo satırı` : ''}.
        </div>
      ) : null}

      {result && result.skipSample.length > 0 ? (
        <div className="mt-3 rounded-lg border border-state-warning-text/30 bg-state-warning-bg p-3 text-xs text-text-primary">
          <strong>Atlanan satır örnekleri:</strong>
          <ul className="mt-1 list-inside list-disc">
            {result.skipSample.map((skip) => (
              <li key={`${skip.sourceBudgetPlanId}:${skip.sourceBudgetPlanRowId}`}>
                Plan {skip.sourceBudgetPlanId} / satır {skip.sourceBudgetPlanRowId} —{' '}
                {SKIP_REASON_LABELS[skip.reason] ?? skip.reason}
                {skip.detail ? ` (${skip.detail})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {draft.fiscalYear} bütçe taslağı · sürüm {draft.versionNo}
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                {draft.lines.length} satır · para birimi {draft.baseCurrency}. Satır dönemi mali
                yılın yıllık kovasıdır; ERP plan tarihi giriş tarihidir, dönem olarak
                kullanılmaz.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(draft.status)}`}
              >
                {STATUS_LABELS[draft.status]}
              </span>
              {draft.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={submitBusy || importBusy}
                  onClick={submitDraft}
                >
                  {submitBusy ? 'Onaya gönderiliyor…' : 'Taslağı onaya gönder'}
                </button>
              ) : null}
            </div>
          </div>

          {periodTotals.length > 0 ? (
            <p className="text-xs text-text-secondary">
              Dönem net toplamları (gider − gelir):{' '}
              {periodTotals
                .map(([period, total]) => `${period}: ${amountLabel(total, draft.baseCurrency)}`)
                .join(' · ')}
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-surface-muted text-text-secondary">
                <tr>
                  <th className="px-3 py-2">Dönem</th>
                  <th className="px-3 py-2">Hesap kodu</th>
                  <th className="px-3 py-2">Yön</th>
                  <th className="px-3 py-2">Planlanan tutar</th>
                  <th className="px-3 py-2">Masraf merkezi</th>
                  <th className="px-3 py-2">Departman</th>
                  <th className="px-3 py-2">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line) => (
                  <tr key={line.id} className="border-t border-border-subtle">
                    <td className="px-3 py-2">{line.period}</td>
                    <td className="px-3 py-2 font-medium text-text-primary">{line.accountCode}</td>
                    <td className="px-3 py-2">{directionLabel(line.direction)}</td>
                    <td className="px-3 py-2">{amountLabel(line.plannedAmount, line.currency)}</td>
                    <td className="px-3 py-2">{line.costCenterCode ?? '—'}</td>
                    <td className="px-3 py-2">{line.departmentCode ?? '—'}</td>
                    <td className="px-3 py-2">{line.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PlanImportSection;
