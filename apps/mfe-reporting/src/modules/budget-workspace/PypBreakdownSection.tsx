import React from 'react';
import { BudgetApiError, fetchPypActuals } from './api';
import type { PypActualRow } from './types';

const currentYear = new Date().getFullYear();
const MAX_PAGES = 5;

const trNumber = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const trWhole = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

const amountLabel = (amount: number): string => `${trNumber.format(amount)} ₺`;
const wholeLabel = (amount: number): string => `${trWhole.format(amount)} ₺`;

const errorMessage = (error: unknown): string =>
  error instanceof BudgetApiError
    ? error.message
    : 'Beklenmeyen bir hata oluştu. Kaynak veride değişiklik yapılmadı.';

const SOURCE_LABELS: Record<string, string> = {
  INVOICE_LINE: 'Fatura satırı',
  INVOICE_UNIFORM: 'Fatura',
  INVOICE_HEADER: 'Fatura başlığı',
  EXPENSE_UNIFORM: 'Masraf',
  EXPENSE_MIXED: 'Masraf (karışık)',
  INVOICE_MIXED: 'Fatura (karışık)',
  NONE: '—',
};

type LeafRow = PypActualRow;

type ItemNode = {
  name: string;
  total: number;
  rows: LeafRow[];
};

type CenterNode = {
  name: string;
  total: number;
  items: ItemNode[];
  rowCount: number;
};

type Breakdown = {
  centers: CenterNode[];
  labeledTotal: number;
  scannedRows: number;
  labeledRows: number;
  mixedRows: number;
  undimensionedRows: number;
  truncated: boolean;
  dateRange: [string, string] | null;
};

/**
 * Muavin omurgası: yalnız borç (gider) tarafı toplanır — her belge muavine
 * borç+alacak çifti olarak düşer, alacak bacağı da aynı belgeden boyut alır
 * ve toplamı sıfırlar.
 */
export const buildBreakdown = (rows: PypActualRow[], truncated: boolean): Breakdown => {
  const centers = new Map<string, Map<string, ItemNode>>();
  let labeledTotal = 0;
  let labeledRows = 0;
  let mixedRows = 0;
  let undimensionedRows = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    if (!minDate || row.actionDate < minDate) minDate = row.actionDate;
    if (!maxDate || row.actionDate > maxDate) maxDate = row.actionDate;
    if (row.dimensionSource === 'EXPENSE_MIXED' || row.dimensionSource === 'INVOICE_MIXED') {
      mixedRows += 1;
      continue;
    }
    if (!row.expenseItemId || !row.expenseItemName) {
      undimensionedRows += 1;
      continue;
    }
    if (row.debitCredit !== 'DEBIT' || row.signedAmount <= 0) {
      continue;
    }
    labeledRows += 1;
    labeledTotal += row.signedAmount;
    const centerKey = row.expenseCenterName ?? 'PYP merkezi atanmamış';
    const items = centers.get(centerKey) ?? new Map<string, ItemNode>();
    const item = items.get(row.expenseItemName) ?? {
      name: row.expenseItemName,
      total: 0,
      rows: [],
    };
    item.total += row.signedAmount;
    item.rows.push(row);
    items.set(row.expenseItemName, item);
    centers.set(centerKey, items);
  }

  const centerNodes: CenterNode[] = Array.from(centers.entries())
    .map(([name, items]) => {
      const itemNodes = Array.from(items.values())
        .map((item) => ({
          ...item,
          rows: [...item.rows].sort((a, b) => b.signedAmount - a.signedAmount),
        }))
        .sort((a, b) => b.total - a.total);
      return {
        name,
        items: itemNodes,
        total: itemNodes.reduce((sum, item) => sum + item.total, 0),
        rowCount: itemNodes.reduce((sum, item) => sum + item.rows.length, 0),
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    centers: centerNodes,
    labeledTotal,
    scannedRows: rows.length,
    labeledRows,
    mixedRows,
    undimensionedRows,
    truncated,
    dateRange: minDate && maxDate ? [minDate, maxDate] : null,
  };
};

export type PypBreakdownSectionProps = {
  companyId: string;
};

export const PypBreakdownSection: React.FC<PypBreakdownSectionProps> = ({ companyId }) => {
  const [fiscalYear, setFiscalYear] = React.useState(String(currentYear));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [breakdown, setBreakdown] = React.useState<Breakdown | null>(null);

  const numericYear = Number(fiscalYear);
  const validYear = Number.isInteger(numericYear) && numericYear >= 2000 && numericYear <= 2200;
  const canLoad = Boolean(companyId) && validYear && !busy;

  React.useEffect(() => {
    setBreakdown(null);
    setError(null);
  }, [companyId]);

  const load = async () => {
    if (!canLoad) return;
    setBusy(true);
    setError(null);
    setBreakdown(null);
    try {
      const rows: PypActualRow[] = [];
      let cursor: string | null = null;
      let truncated = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await fetchPypActuals(Number(companyId), numericYear, cursor);
        rows.push(...result.rows);
        if (!result.hasMore || !result.nextCursor) {
          truncated = false;
          break;
        }
        cursor = result.nextCursor;
        truncated = true;
      }
      setBreakdown(buildBreakdown(rows, truncated));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="PYP gerçekleşen kırılımı"
      className="rounded-xl border border-border-subtle bg-surface-default p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">PYP gerçekleşen kırılımı</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">
            Muavinden gelir, genelden detaya açılır: PYP merkezi → bütçe kalemi → tek tek kaynak
            kayıt (tarih, belge, muavin fişi, hesap, tutar). Boyutlar kaynak belgenin satırından
            çözülür; farklı boyut taşıyan belgeler tahmin edilmez, ayrıca sayılır.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <label className="space-y-1 text-sm font-medium text-text-primary">
            <span>Mali yıl</span>
            <input
              type="number"
              min={2000}
              max={2200}
              className="w-28 rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={fiscalYear}
              disabled={busy}
              onChange={(event) => setFiscalYear(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canLoad}
            onClick={load}
          >
            {busy ? 'Muavin taranıyor…' : 'Kırılımı getir'}
          </button>
        </div>
      </div>

      {!companyId ? (
        <p className="mt-3 text-xs text-text-secondary">Önce yukarıdan şirket seçin.</p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-state-danger-text/30 bg-state-danger-bg p-4 text-sm text-state-danger-text"
        >
          <strong>Kırılım getirilemedi.</strong> {error}
        </div>
      ) : null}

      {breakdown ? (
        <div className="mt-5 space-y-4">
          <div
            role="status"
            className="grid gap-3 rounded-lg border border-border-subtle bg-surface-muted p-4 text-sm md:grid-cols-4"
          >
            <div>
              <span className="block text-xs text-text-secondary">PYP-etiketli gider</span>
              <strong className="text-base">{wholeLabel(breakdown.labeledTotal)}</strong>
            </div>
            <div>
              <span className="block text-xs text-text-secondary">Etiketli kayıt</span>
              <strong className="text-base">{breakdown.labeledRows}</strong>
              <span className="text-xs text-text-secondary"> / {breakdown.scannedRows} taranan</span>
            </div>
            <div>
              <span className="block text-xs text-text-secondary">Karışık belge (tahmin yok)</span>
              <strong className="text-base">{breakdown.mixedRows}</strong>
            </div>
            <div>
              <span className="block text-xs text-text-secondary">Dönem</span>
              <strong className="text-base">
                {breakdown.dateRange
                  ? `${breakdown.dateRange[0]} → ${breakdown.dateRange[1]}`
                  : '—'}
              </strong>
            </div>
          </div>

          {breakdown.truncated ? (
            <div className="rounded-lg border border-state-warning-text/30 bg-state-warning-bg p-3 text-sm text-text-primary">
              Hızlı görünüm sınırı: ilk {MAX_PAGES * 2000} muavin satırı tarandı; dönem aralığı
              yukarıda. Yılın kalanı bir sonraki taramayla gelir.
            </div>
          ) : null}

          {breakdown.centers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-subtle p-8 text-center text-sm text-text-secondary">
              Bu yıl için PYP-etiketli gider kaydı bulunamadı.
            </div>
          ) : (
            <div className="space-y-2">
              {breakdown.centers.map((center) => (
                <details
                  key={center.name}
                  className="rounded-lg border border-border-subtle bg-surface-default"
                >
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                    <span className="min-w-40 flex-1 font-semibold text-text-primary">
                      {center.name}
                    </span>
                    <span className="h-2 w-32 overflow-hidden rounded-full bg-border-subtle">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max((center.total / breakdown.labeledTotal) * 100, 1)}%`,
                        }}
                      />
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {wholeLabel(center.total)}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {center.items.length} kalem · {center.rowCount} kayıt
                    </span>
                  </summary>
                  <div className="space-y-2 px-3 pb-3">
                    {center.items.map((item) => (
                      <details
                        key={item.name}
                        className="rounded-md border border-border-subtle bg-surface-muted/40"
                      >
                        <summary className="flex cursor-pointer items-baseline gap-3 px-3 py-2 hover:bg-surface-muted">
                          <span className="flex-1 text-sm font-medium text-text-primary">
                            {item.name}
                          </span>
                          <span className="font-mono text-sm tabular-nums">
                            {wholeLabel(item.total)}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {item.rows.length} kayıt
                          </span>
                        </summary>
                        <div className="overflow-x-auto px-2 pb-2">
                          <table className="min-w-full text-left text-xs">
                            <thead className="text-text-secondary">
                              <tr>
                                <th className="px-2 py-1">Tarih</th>
                                <th className="px-2 py-1">Kaynak</th>
                                <th className="px-2 py-1">Belge no</th>
                                <th className="px-2 py-1">Muavin · sipariş</th>
                                <th className="px-2 py-1">Hesap</th>
                                <th className="px-2 py-1 text-right">Tutar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.rows.map((row) => (
                                <tr
                                  key={`${row.sourceLedgerYear}-${row.journalRowId}`}
                                  className="border-t border-border-subtle"
                                >
                                  <td className="px-2 py-1 font-mono">{row.actionDate}</td>
                                  <td className="px-2 py-1">
                                    {SOURCE_LABELS[row.dimensionSource] ?? row.documentType}
                                  </td>
                                  <td className="px-2 py-1 font-mono">{row.documentNo ?? '—'}</td>
                                  <td className="px-2 py-1 font-mono">
                                    fiş {row.journalCardId}/{row.journalRowId}
                                    {row.orderId ? ` · sip ${row.orderId}` : ''}
                                  </td>
                                  <td className="px-2 py-1 font-mono">{row.accountCode ?? '—'}</td>
                                  <td className="px-2 py-1 text-right font-mono tabular-nums">
                                    {amountLabel(row.signedAmount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default PypBreakdownSection;
