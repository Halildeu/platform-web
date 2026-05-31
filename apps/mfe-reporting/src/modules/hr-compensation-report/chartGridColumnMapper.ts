/**
 * ChartGridColumn → ColumnMeta mapper for the HR compensation
 * dashboard's per-chart summary mini-tables.
 *
 * Migration context (Codex thread 019e7f8f cross-AI plan-time
 * consensus, 2026-05-31): the compensation dashboard's
 * `ChartDataGrid` previously used a direct `<AgGridReact>` with a
 * hand-rolled `ColDef[]` + ad-hoc `valueFormatter` chain. That direct
 * `ag-grid-react` import was a documented permanent exception in
 * `eslint.config.mjs` + `CONTRIBUTING.md` grid-contract section.
 *
 * Per the unified-grid invariant ("all data grids in apps/ go
 * through the design-system `GridShell` + `ColumnMeta` column
 * system"), the mini-table now renders through `GridShell` +
 * `buildColDefs` with this mapper translating the lightweight
 * `ChartGridColumn` shape (carried by `ChartBlock`'s call sites) into
 * the design-system's declarative `ColumnMeta` column-system. The
 * mapper plus an identity `TranslateFn` deliberately keep this file
 * JSX-free so the mapping logic can be unit-tested without booting a
 * React runtime — the same pattern the `column-system/__tests__/
 * hr-compensation-contract.test.ts` test uses to avoid JSX transform
 * overhead.
 *
 * Numeric formatting parity (vs the pre-migration `formatCurrency`/
 * `formatPercent`/`formatNumber` Intl formatters in
 * `CompensationDashboard.tsx`):
 *   - `currency` ⇒ `CurrencyColumnMeta` { currencyCode: 'TRY',
 *     decimals: 0 } — matches the previous `Intl.NumberFormat('tr-
 *     TR', { style: 'currency', currency: 'TRY',
 *     maximumFractionDigits: 0 })`.
 *   - `percent` ⇒ `PercentColumnMeta` { decimals: 1 } — matches
 *     `%${(v * 100).toFixed(1)}`.
 *   - `number` (and undefined format, for forward-compat) ⇒
 *     `NumberColumnMeta` { decimals: 0 } — matches
 *     `Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })`.
 *
 * First column policy: index 0 is always the label column (e.g.,
 * "Bant" / "Departman" / "Şirket") and is mapped to `bold-text`
 * regardless of its `format` value (none of the existing chart-
 * summary mini-tables pass `format` on index 0; the policy is set
 * here so the rule is machine-checked rather than implicit). The
 * design-system's `bold-text` renderer left-aligns by default;
 * numeric columns at idx > 0 right-align via the column-system
 * transformer (`type: 'rightAligned'`).
 *
 * `headerNameKey` carries the raw Turkish label directly. The
 * design-system `BaseColumnMeta.headerNameKey` JSDoc explicitly
 * documents that "raw string also accepted (for dynamic reports)"
 * — the chart-summary mini-tables have no i18n dictionary because
 * the chart definition itself already supplies a translated label
 * (`gridColumns={[{ key, label: 'Bant', ... }]}`).
 */
import type { ColumnMeta, TranslateFn } from '@mfe/design-system/advanced/data-grid';

/**
 * Lightweight wire shape carried on each `ChartBlock` call site's
 * `gridColumns` prop. Intentionally narrower than `ColumnMeta` so
 * chart authors keep using `{ key, label, format }` declarations
 * without learning the full column-system surface.
 */
export interface ChartGridColumn {
  key: string;
  label: string;
  format?: 'currency' | 'percent' | 'number';
}

/**
 * Translate `ChartGridColumn[]` into the design-system's declarative
 * `ColumnMeta[]`. See the file header for the mapping rules and
 * parity rationale.
 */
export const buildChartGridColumnMetas = (columns: ChartGridColumn[]): ColumnMeta[] =>
  columns.map((col, idx): ColumnMeta => {
    if (idx === 0) {
      return {
        field: col.key,
        headerNameKey: col.label,
        columnType: 'bold-text',
        flex: 1.5,
        minWidth: 160,
        // Codex 019e7f8f post-impl review finding #2: per-column
        // `filterable` wins over `defaultColDef.filter`. AG Grid
        // applies the `defaultColDef` per-key only when the column
        // ColDef omits the key — and `buildColDefs` always emits a
        // per-column filter via `buildFilterConfig` (filters.ts).
        // The grid-contract `defaultColDef={{ filter: false }}` set
        // at the GridShell consumer would therefore be silently
        // overridden. Pin `filterable: false` here so the column-
        // system transformer skips the filter wiring and the mini-
        // table actually ships without filter chrome (matches the
        // pre-migration raw AgGridReact which had no filter at all).
        filterable: false,
      };
    }
    const base = {
      field: col.key,
      headerNameKey: col.label,
      flex: 1,
      minWidth: 100,
      filterable: false,
    } as const;
    switch (col.format) {
      case 'currency':
        return { ...base, columnType: 'currency', currencyCode: 'TRY', decimals: 0 };
      case 'percent':
        return { ...base, columnType: 'percent', decimals: 1 };
      case 'number':
      default:
        return { ...base, columnType: 'number', decimals: 0 };
    }
  });

/**
 * Identity `TranslateFn`. The chart-summary mini-tables carry their
 * own already-translated Turkish labels (no i18n key dictionary),
 * so the design-system's `buildColDefs(meta, t)` is invoked with an
 * identity `t` that returns the raw `headerNameKey` verbatim.
 */
export const identityTranslate: TranslateFn = (key: string): string => key;
