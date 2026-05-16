// Codex 019e2de6 (PR-0.5f) — aggregate-cell tooltip contract.
//
// Locks the rules the GridShell `tooltipValueGetter` wiring relies on:
// only aggregated group / grand-total cells get an explainability
// string; leaf rows and empty values get `undefined`. Pure-function
// tests — no ag-grid imports, no live grid.

import { describe, expect, it } from 'vitest';
import {
  getAggregateCellTooltip,
  getGroupCellTooltip,
  type AggregateTooltipParams,
} from '../aggregate-cell-tooltip';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** An aggregated value cell inside a group row. */
const groupAggregateCell = (
  extra: Partial<AggregateTooltipParams> = {},
): AggregateTooltipParams => ({
  value: 1234567.89,
  valueFormatted: '1.234.567,89',
  colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
  node: { group: true, key: 'ADC2 - Turkcell', allChildrenCount: 1234 },
  ...extra,
});

/** An aggregated value cell inside the grand-total pinned-bottom row. */
const grandTotalCell = (extra: Partial<AggregateTooltipParams> = {}): AggregateTooltipParams => ({
  value: 9876543.21,
  valueFormatted: '9.876.543,21',
  colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
  node: { rowPinned: 'bottom' },
  ...extra,
});

/** A normal leaf / value cell. */
const leafCell = (extra: Partial<AggregateTooltipParams> = {}): AggregateTooltipParams => ({
  value: 42,
  valueFormatted: '42',
  colDef: { headerName: 'Tutar TL', field: 'amount' },
  node: { group: false, rowPinned: null },
  ...extra,
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — group rows                               */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — group row', () => {
  it('1. group aggregate cell with valueFormatted → label · count · agg(col): value', () => {
    expect(getAggregateCellTooltip(groupAggregateCell())).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): 1.234.567,89',
    );
  });

  it('2. omits the "· N satır" segment when no row count is resolvable', () => {
    const params = groupAggregateCell({
      node: { group: true, key: 'ADC2 - Turkcell' },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · Toplam(Tutar TL): 1.234.567,89',
    );
  });

  it('3. falls back to childrenAfterGroup.length when allChildrenCount is absent', () => {
    const params = groupAggregateCell({
      node: {
        group: true,
        key: 'ADC2 - Turkcell',
        childrenAfterGroup: [{}, {}, {}],
      },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 3 satır · Toplam(Tutar TL): 1.234.567,89',
    );
  });

  it('4. omits the group label when node.key is missing', () => {
    const params = groupAggregateCell({
      node: { group: true, allChildrenCount: 10 },
    });
    expect(getAggregateCellTooltip(params)).toBe('10 satır · Toplam(Tutar TL): 1.234.567,89');
  });
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — grand-total pinned-bottom row            */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — grand-total row', () => {
  it('5. grand-total aggregate cell → "Genel toplam · agg(col): value"', () => {
    expect(getAggregateCellTooltip(grandTotalCell())).toBe(
      'Genel toplam · Toplam(Tutar TL): 9.876.543,21',
    );
  });

  it('6. grand-total cell ignores group label / row count even if present', () => {
    const params = grandTotalCell({
      node: { rowPinned: 'bottom', key: 'should-be-ignored', allChildrenCount: 999 },
    });
    expect(getAggregateCellTooltip(params)).toBe('Genel toplam · Toplam(Tutar TL): 9.876.543,21');
  });
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — value formatting fallbacks               */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — value formatting', () => {
  it('7. re-runs colDef.valueFormatter when valueFormatted is absent', () => {
    const params = groupAggregateCell({
      valueFormatted: null,
      colDef: {
        headerName: 'Tutar TL',
        field: 'amount',
        aggFunc: 'sum',
        valueFormatter: (p: { value: unknown }) => `₺${p.value}`,
      },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): ₺1234567.89',
    );
  });

  it('8. falls back to a locale-formatted number when neither valueFormatted nor a formatter exist', () => {
    const params = groupAggregateCell({
      value: 500,
      valueFormatted: undefined,
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): 500',
    );
  });

  it('9. swallows a throwing valueFormatter and falls back to a locale-formatted number', () => {
    const params = groupAggregateCell({
      value: 500,
      valueFormatted: undefined,
      colDef: {
        headerName: 'Tutar TL',
        field: 'amount',
        aggFunc: 'sum',
        valueFormatter: () => {
          throw new Error('boom');
        },
      },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): 500',
    );
  });

  it('10. reads the live colDef via column.getColDef() when params.colDef is absent', () => {
    const params: AggregateTooltipParams = {
      value: 1000,
      valueFormatted: '1.000',
      node: { group: true, key: 'Bucket', allChildrenCount: 5 },
      column: {
        getColDef: () => ({ headerName: 'Adet', field: 'qty', aggFunc: 'count' }),
      },
    };
    expect(getAggregateCellTooltip(params)).toBe('Bucket · 5 satır · Adet(Adet): 1.000');
  });

  it('37. tier-3 locale-formats a large number when no valueFormatted / formatter exists', () => {
    // column-system number/currency columns format the cell via a
    // `cellRenderer` and put an EXPORT getter on `valueFormatter`, so a
    // group-aggregate tooltip reaches the tier-3 fallback with a raw
    // number — which must still be locale-formatted, not raw-stringified.
    const params = groupAggregateCell({
      value: 1234567,
      valueFormatted: undefined,
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): 1.234.567',
    );
  });

  it('38. tier-3 locale-formats a raw float — no float-noise leak (PR-0.5f live fix)', () => {
    const params = groupAggregateCell({
      value: -824820919.1300002,
      valueFormatted: undefined,
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
    });
    const tip = getAggregateCellTooltip(params);
    expect(tip).toBe('ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): -824.820.919,13');
    // the raw IEEE-754 artifact must never reach the tooltip
    expect(tip).not.toContain('1300002');
  });

  it('39. tier-4 String()-falls-back for a non-numeric value', () => {
    const params = groupAggregateCell({
      value: 'PENDING',
      valueFormatted: undefined,
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): PENDING',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — aggFunc label mapping                    */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — aggFunc labels', () => {
  it('11. maps built-in aggFuncs to Turkish labels', () => {
    const cases: Array<[string, string]> = [
      ['sum', 'Toplam'],
      ['avg', 'Ortalama'],
      ['count', 'Adet'],
      ['min', 'Minimum'],
      ['max', 'Maksimum'],
    ];
    for (const [aggFunc, label] of cases) {
      const params = groupAggregateCell({
        colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc },
      });
      expect(getAggregateCellTooltip(params)).toContain(`${label}(Tutar TL)`);
    }
  });

  it('12. unknown / custom string aggFunc falls back to the raw string', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'weightedAvg' },
    });
    expect(getAggregateCellTooltip(params)).toContain('weightedAvg(Tutar TL)');
  });

  it('13. absent aggFunc → neutral "Agregasyon" label', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount' },
    });
    expect(getAggregateCellTooltip(params)).toContain('Agregasyon(Tutar TL)');
  });

  it('14. custom callable aggFunc → neutral "Agregasyon" label', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: () => 0 },
    });
    expect(getAggregateCellTooltip(params)).toContain('Agregasyon(Tutar TL)');
  });
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — live aggFunc (Codex 019e2de6 post-impl)   */
/*                                                                     */
/*  The reporting flow sets aggFunc at RUNTIME via applyColumnState     */
/*  (the "Sütun Hesaplama" menu / variant restore), not on the static  */
/*  colDef — so column.getAggFunc() is authoritative.                  */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — live aggFunc resolution', () => {
  it('32. resolves the live aggFunc from column.getAggFunc() when colDef.aggFunc is absent', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount' },
      column: { getAggFunc: () => 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toContain('Toplam(Tutar TL)');
  });

  it('33. live column.getAggFunc() overrides a stale colDef.aggFunc', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'avg' },
      column: { getAggFunc: () => 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toContain('Toplam(Tutar TL)');
  });

  it('34. grand-total cell also resolves the live aggFunc from column.getAggFunc()', () => {
    const params = grandTotalCell({
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'avg' },
      column: { getAggFunc: () => 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toBe('Genel toplam · Toplam(Tutar TL): 9.876.543,21');
  });

  it('35. live callable aggFunc → neutral "Agregasyon" label', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'sum' },
      column: { getAggFunc: () => () => 0 },
    });
    expect(getAggregateCellTooltip(params)).toContain('Agregasyon(Tutar TL)');
  });

  it('36. falls back to colDef.aggFunc when column.getAggFunc() returns null', () => {
    const params = groupAggregateCell({
      colDef: { headerName: 'Tutar TL', field: 'amount', aggFunc: 'count' },
      column: { getAggFunc: () => null },
    });
    expect(getAggregateCellTooltip(params)).toContain('Adet(Tutar TL)');
  });
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — column display name fallback             */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — column display name', () => {
  it('15. falls back to field when headerName is absent', () => {
    const params = groupAggregateCell({
      colDef: { field: 'amount', aggFunc: 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toContain('Toplam(amount)');
  });

  it('16. falls back to colId when headerName and field are absent', () => {
    const params = groupAggregateCell({
      colDef: { colId: 'amount_col', aggFunc: 'sum' },
    });
    expect(getAggregateCellTooltip(params)).toContain('Toplam(amount_col)');
  });
});

/* ------------------------------------------------------------------ */
/*  getAggregateCellTooltip — undefined cases                          */
/* ------------------------------------------------------------------ */

describe('getAggregateCellTooltip — returns undefined', () => {
  it('17. leaf row (not group, not pinned-bottom) → undefined', () => {
    expect(getAggregateCellTooltip(leafCell())).toBeUndefined();
  });

  it('18. leaf row with no node → undefined', () => {
    expect(getAggregateCellTooltip({ value: 42, valueFormatted: '42' })).toBeUndefined();
  });

  it('19. pinned-TOP row is not a grand-total cell → undefined', () => {
    expect(getAggregateCellTooltip(leafCell({ node: { rowPinned: 'top' } }))).toBeUndefined();
  });

  it('20. group row with null value → undefined', () => {
    expect(
      getAggregateCellTooltip(groupAggregateCell({ value: null, valueFormatted: null })),
    ).toBeUndefined();
  });

  it('21. group row with undefined value → undefined', () => {
    expect(
      getAggregateCellTooltip(groupAggregateCell({ value: undefined, valueFormatted: undefined })),
    ).toBeUndefined();
  });

  it('22. group row with empty-string value → undefined', () => {
    expect(
      getAggregateCellTooltip(groupAggregateCell({ value: '   ', valueFormatted: '   ' })),
    ).toBeUndefined();
  });

  it('23. group row with NaN value → undefined', () => {
    expect(
      getAggregateCellTooltip(groupAggregateCell({ value: NaN, valueFormatted: null })),
    ).toBeUndefined();
  });

  it('24. grand-total cell with null value → undefined', () => {
    expect(
      getAggregateCellTooltip(grandTotalCell({ value: null, valueFormatted: null })),
    ).toBeUndefined();
  });

  it('25. zero is a renderable value (not treated as empty)', () => {
    const params = groupAggregateCell({ value: 0, valueFormatted: '0' });
    expect(getAggregateCellTooltip(params)).toBe(
      'ADC2 - Turkcell · 1.234 satır · Toplam(Tutar TL): 0',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  getGroupCellTooltip — auto group column                            */
/* ------------------------------------------------------------------ */

describe('getGroupCellTooltip — auto group column', () => {
  it('26. group cell → "Grup: <label> · <count> satır"', () => {
    const params: AggregateTooltipParams = {
      node: { group: true, key: 'ADC2 - Turkcell', allChildrenCount: 1234 },
    };
    expect(getGroupCellTooltip(params)).toBe('Grup: ADC2 - Turkcell · 1.234 satır');
  });

  it('27. omits the "· N satır" segment when no count is resolvable', () => {
    const params: AggregateTooltipParams = {
      node: { group: true, key: 'ADC2 - Turkcell' },
    };
    expect(getGroupCellTooltip(params)).toBe('Grup: ADC2 - Turkcell');
  });

  it('28. uses childrenAfterGroup.length as the row-count fallback', () => {
    const params: AggregateTooltipParams = {
      node: { group: true, key: 'Bucket', childrenAfterGroup: [{}, {}] },
    };
    expect(getGroupCellTooltip(params)).toBe('Grup: Bucket · 2 satır');
  });

  it('29. leaf cell in the auto group column → undefined', () => {
    const params: AggregateTooltipParams = {
      node: { group: false },
    };
    expect(getGroupCellTooltip(params)).toBeUndefined();
  });

  it('30. group cell with a missing label → undefined', () => {
    const params: AggregateTooltipParams = {
      node: { group: true, allChildrenCount: 5 },
    };
    expect(getGroupCellTooltip(params)).toBeUndefined();
  });

  it('31. no node → undefined', () => {
    expect(getGroupCellTooltip({})).toBeUndefined();
  });
});
