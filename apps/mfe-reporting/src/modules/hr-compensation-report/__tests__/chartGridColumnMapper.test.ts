/**
 * `chartGridColumnMapper` contract tests — PR-A grid-contract
 * migration (Codex thread 019e7f8f).
 *
 * The compensation dashboard's chart-summary mini-tables previously
 * rendered through a direct `<AgGridReact>` with an inline
 * `ColDef[]` + ad-hoc `valueFormatter` chain. The migration to the
 * design-system `GridShell` grid contract relies on
 * `buildChartGridColumnMetas` translating the lightweight
 * `ChartGridColumn` wire shape to declarative `ColumnMeta[]`. These
 * tests pin the mapping policy so the format dispatch + first-column
 * label semantics can't drift back to ad-hoc renderers without a
 * failing test.
 *
 * Plain Vitest contract test — no React runtime, no JSX (matches the
 * column-system/__tests__/hr-compensation-contract.test.ts pattern
 * which inlined expected fields for the same reason).
 */
import { describe, expect, it } from 'vitest';
import {
  buildChartGridColumnMetas,
  identityTranslate,
  type ChartGridColumn,
} from '../chartGridColumnMapper';

describe('buildChartGridColumnMetas — chart-summary mini-table mapper', () => {
  /* ---------------------------------------------------------------- */
  /*  First column policy                                              */
  /* ---------------------------------------------------------------- */

  describe('first column (index 0)', () => {
    it('always maps to bold-text — currency format ignored', () => {
      const input: ChartGridColumn[] = [{ key: 'label', label: 'Bant', format: 'currency' }];
      const out = buildChartGridColumnMetas(input);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({
        field: 'label',
        headerNameKey: 'Bant',
        columnType: 'bold-text',
        flex: 1.5,
        minWidth: 160,
      });
    });

    it('always maps to bold-text — percent format ignored', () => {
      const input: ChartGridColumn[] = [{ key: 'label', label: 'Departman', format: 'percent' }];
      const out = buildChartGridColumnMetas(input);
      expect(out[0].columnType).toBe('bold-text');
    });

    it('always maps to bold-text — number format ignored', () => {
      const input: ChartGridColumn[] = [{ key: 'label', label: 'Şirket', format: 'number' }];
      expect(buildChartGridColumnMetas(input)[0].columnType).toBe('bold-text');
    });

    it('always maps to bold-text — undefined format', () => {
      const input: ChartGridColumn[] = [{ key: 'label', label: 'Bant' }];
      expect(buildChartGridColumnMetas(input)[0].columnType).toBe('bold-text');
    });

    it('first-column layout: flex=1.5, minWidth=160', () => {
      const input: ChartGridColumn[] = [{ key: 'label', label: 'Bant' }];
      const meta = buildChartGridColumnMetas(input)[0];
      expect(meta.flex).toBe(1.5);
      expect(meta.minWidth).toBe(160);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Non-first column format dispatch (idx > 0)                       */
  /* ---------------------------------------------------------------- */

  describe('non-first column format dispatch', () => {
    it('format=currency → CurrencyColumnMeta { currencyCode: "TRY", decimals: 0 }', () => {
      const input: ChartGridColumn[] = [
        { key: 'label', label: 'Bant' },
        { key: 'value', label: 'Ort. Maaş', format: 'currency' },
      ];
      const out = buildChartGridColumnMetas(input);
      expect(out[1]).toEqual({
        field: 'value',
        headerNameKey: 'Ort. Maaş',
        columnType: 'currency',
        currencyCode: 'TRY',
        decimals: 0,
        flex: 1,
        minWidth: 100,
      });
    });

    it('format=percent → PercentColumnMeta { decimals: 1 }', () => {
      const input: ChartGridColumn[] = [
        { key: 'label', label: 'Bant' },
        { key: 'pct', label: 'Yüzde', format: 'percent' },
      ];
      const out = buildChartGridColumnMetas(input);
      expect(out[1]).toEqual({
        field: 'pct',
        headerNameKey: 'Yüzde',
        columnType: 'percent',
        decimals: 1,
        flex: 1,
        minWidth: 100,
      });
    });

    it('format=number → NumberColumnMeta { decimals: 0 }', () => {
      const input: ChartGridColumn[] = [
        { key: 'label', label: 'Bant' },
        { key: 'count', label: 'Kişi Sayısı', format: 'number' },
      ];
      const out = buildChartGridColumnMetas(input);
      expect(out[1]).toEqual({
        field: 'count',
        headerNameKey: 'Kişi Sayısı',
        columnType: 'number',
        decimals: 0,
        flex: 1,
        minWidth: 100,
      });
    });

    it('undefined format → NumberColumnMeta { decimals: 0 } (default fallback)', () => {
      const input: ChartGridColumn[] = [
        { key: 'label', label: 'Bant' },
        { key: 'value', label: 'Değer' },
      ];
      const out = buildChartGridColumnMetas(input);
      expect(out[1].columnType).toBe('number');
      expect(out[1]).toMatchObject({
        decimals: 0,
        flex: 1,
        minWidth: 100,
      });
    });

    it('non-first layout: flex=1, minWidth=100', () => {
      const input: ChartGridColumn[] = [
        { key: 'label', label: 'Bant' },
        { key: 'a', label: 'A', format: 'currency' },
        { key: 'b', label: 'B', format: 'percent' },
        { key: 'c', label: 'C', format: 'number' },
      ];
      const out = buildChartGridColumnMetas(input);
      for (const meta of out.slice(1)) {
        expect(meta.flex).toBe(1);
        expect(meta.minWidth).toBe(100);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Field + headerNameKey passthrough                                */
  /* ---------------------------------------------------------------- */

  describe('field + headerNameKey passthrough', () => {
    it('passes ChartGridColumn.key through as field', () => {
      const input: ChartGridColumn[] = [
        { key: 'firstKey', label: 'First' },
        { key: 'secondKey', label: 'Second', format: 'currency' },
      ];
      const out = buildChartGridColumnMetas(input);
      expect(out[0].field).toBe('firstKey');
      expect(out[1].field).toBe('secondKey');
    });

    it('passes ChartGridColumn.label through as raw headerNameKey (no i18n key indirection)', () => {
      const input: ChartGridColumn[] = [
        { key: 'l', label: 'Maliyet Kalemi' },
        { key: 'v', label: 'Tutar', format: 'currency' },
      ];
      const out = buildChartGridColumnMetas(input);
      expect(out[0].headerNameKey).toBe('Maliyet Kalemi');
      expect(out[1].headerNameKey).toBe('Tutar');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Real call-site fixtures (parity with CompensationDashboard.tsx)  */
  /* ---------------------------------------------------------------- */

  describe('real chart call-site fixtures', () => {
    it('salary-histogram: [label, number] → [bold-text, number]', () => {
      const out = buildChartGridColumnMetas([
        { key: 'label', label: 'Bant' },
        { key: 'value', label: 'Kişi Sayısı', format: 'number' },
      ]);
      expect(out.map((m) => m.columnType)).toEqual(['bold-text', 'number']);
    });

    it('dept-percentile-radar: 4-column [label, currency, currency, currency]', () => {
      const out = buildChartGridColumnMetas([
        { key: 'label', label: 'Departman' },
        { key: 'min_val', label: 'Min', format: 'currency' },
        { key: 'value', label: 'Ort.', format: 'currency' },
        { key: 'max_val', label: 'Max', format: 'currency' },
      ]);
      expect(out.map((m) => m.columnType)).toEqual([
        'bold-text',
        'currency',
        'currency',
        'currency',
      ]);
    });

    it('salary-trend-12m: mixed [label, currency, number]', () => {
      const out = buildChartGridColumnMetas([
        { key: 'label', label: 'Ay' },
        { key: 'value', label: 'Ort. Maaş', format: 'currency' },
        { key: 'value2', label: 'Çalışan Sayısı', format: 'number' },
      ]);
      expect(out.map((m) => m.columnType)).toEqual(['bold-text', 'currency', 'number']);
    });
  });
});

describe('identityTranslate — pass-through TranslateFn for buildColDefs', () => {
  it('returns the raw key verbatim', () => {
    expect(identityTranslate('Bant')).toBe('Bant');
    expect(identityTranslate('Maliyet Kalemi')).toBe('Maliyet Kalemi');
    expect(identityTranslate('')).toBe('');
  });
});
