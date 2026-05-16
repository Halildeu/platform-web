/**
 * R16 sonrası Adım 14 PR-5 — Adoption Sample (canonical pattern reference).
 *
 * Plan §7 Adım 14 DoD sub-item 5/5: 4 modül adoption sample. Bu dosya
 * **canonical pattern** referansı — useReportFormatter (PR-1 #521) +
 * FilterFormStyle (PR-2 #522) + useReportData (PR-3 #523) hep birlikte
 * tek modülde nasıl kullanılır kanıtı.
 *
 * Diğer modül adoption'ları (audit-report, users-report, hr-compensation,
 * dashboard fin-ratios) bu pattern'i takip eder. Migration sırasında
 * mevcut local formatlama logic'i kaldırılır + bu hook setine geçilir.
 *
 * Codex 019e2a83 plan-time önerisi: kozmetik dalga 5 sub-item; PR-1/2/3
 * MERGED + PR-5 bu adoption sample (reference). PR-4 canonical grid
 * kararı `docs/01-architecture/f6-docs-dx/component-selection-guide.md`
 * "Canonical Grid Decision — Adım 14 PR-4" bölümünde (platform-web
 * PR #548) — daha önce bu yorumdaki "ADR-0019 MERGED" iddiası
 * gerçek değildi (öyle bir ADR / PR yok); Codex 019e2d64 audit
 * absorb ile düzeltildi.
 *
 * @see {@link useReportFormatter}
 * @see {@link FilterFormStyle}
 * @see {@link useReportData}
 */

import React from 'react';
import { useReportFormatter } from './use-report-formatter';
import { useReportData } from '../hooks/use-report-data';
import { FilterFormStyle, FilterFormRow } from '../../components/FilterFormStyle';

type FinBankRow = {
  date: string;
  description: string;
  amount: number;
  balance: number;
};

/**
 * Sample component: finans banka hareketleri raporu canonical pattern.
 *
 * - Filter form: FilterFormStyle + FilterFormRow
 * - Data fetch: useReportData<FinBankRow>
 * - Display formatting: useReportFormatter
 *
 * Production'da bu pattern hr-compensation, audit-report, users-report
 * gibi modüllerde tekrarlanır.
 */
export const AdoptionSampleFinBankReport: React.FC = () => {
  const { formatCurrency, formatDate, formatNumber } = useReportFormatter();

  const [dateFrom, setDateFrom] = React.useState('2026-01-01');
  const [dateTo, setDateTo] = React.useState('2026-05-15');
  const [page, setPage] = React.useState(1);

  const { data, isLoading, error } = useReportData<FinBankRow>({
    reportKey: 'fin-banka-hareketleri',
    filter: { dateFrom, dateTo },
    page,
    pageSize: 50,
  });

  return (
    <div className="flex flex-col gap-4" data-testid="adoption-sample-fin-bank">
      <h2 className="text-lg font-semibold">Finans — Banka Hareketleri</h2>

      <FilterFormStyle direction="horizontal">
        <FilterFormRow label="Başlangıç Tarihi">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-border-default bg-surface-default px-2 py-1"
            data-testid="filter-date-from"
          />
        </FilterFormRow>
        <FilterFormRow label="Bitiş Tarihi">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-border-default bg-surface-default px-2 py-1"
            data-testid="filter-date-to"
          />
        </FilterFormRow>
        <FilterFormRow label="Sayfa">
          <input
            type="number"
            min={1}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            className="w-20 rounded-md border border-border-default bg-surface-default px-2 py-1"
            data-testid="filter-page"
          />
        </FilterFormRow>
      </FilterFormStyle>

      {isLoading && <div data-testid="loading">Yükleniyor…</div>}
      {error && <div data-testid="error">Hata: {(error as Error).message}</div>}
      {data && (
        <div data-testid="results">
          <p className="text-xs text-text-subtle">
            Toplam: {formatNumber(data.total)} kayıt — Sayfa {data.page} / {data.pageSize}
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-3 py-2 text-left">Tarih</th>
                <th className="px-3 py-2 text-left">Açıklama</th>
                <th className="px-3 py-2 text-right">Tutar</th>
                <th className="px-3 py-2 text-right">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i} className="border-b border-border-subtle">
                  <td className="px-3 py-2">{formatDate(row.date)}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.amount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
