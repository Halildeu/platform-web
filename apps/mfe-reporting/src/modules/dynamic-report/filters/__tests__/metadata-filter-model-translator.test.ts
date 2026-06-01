/**
 * Unit tests for the pure metadata-filter-model translator (PR-D1b.B step 2).
 *
 * Codex thread `019e8074` iter-3 AGREE.
 *
 * Cases pinned:
 *  - empty state → null
 *  - per-kind × per-operator mapping (text-search / enum-select / date /
 *    number / month-picker)
 *  - company-picker NEVER appears in output (global tenant selector)
 *  - colId resolution priority: advancedFilterTarget > targetField > key
 *  - same-colId collision → compound AND `conditions[]` (NOT silent
 *    overwrite)
 *  - date `gte` / `lte` use INCLUSIVE `greaterThanOrEqual` /
 *    `lessThanOrEqual` (Codex iter-3 fix)
 *  - month-picker → inRange (first→last day of month)
 *  - unknown / null / non-object values fail soft (drop)
 */

import { describe, expect, it } from 'vitest';
import {
  resolveColId,
  translateMetadataFilters,
  type CompoundFilter,
  type SimpleFilterCondition,
} from '../metadata-filter-model-translator';
import type { FilterDefinition } from '../../types';

const def = (overrides: Partial<FilterDefinition>): FilterDefinition => ({
  key: 'status',
  kind: 'enum-select',
  ...overrides,
});

describe('translateMetadataFilters', () => {
  it('returns null when no definitions', () => {
    expect(translateMetadataFilters([], {})).toBe(null);
  });

  it('returns null when no definition value is set', () => {
    const result = translateMetadataFilters([def({ key: 'status', kind: 'text-search' })], {});
    expect(result).toBe(null);
  });

  it('drops empty-string text-search', () => {
    const result = translateMetadataFilters([def({ key: 'name', kind: 'text-search' })], {
      name: '  ',
    });
    expect(result).toBe(null);
  });

  /* --------------------------------------------------------------------- */
  /*  text-search                                                          */
  /* --------------------------------------------------------------------- */

  it('text-search default operator → contains', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: 'foo',
    });
    expect(result).toEqual({
      NAME: { filterType: 'text', type: 'contains', filter: 'foo' },
    });
  });

  it('text-search + equals → equals', () => {
    const result = translateMetadataFilters(
      [def({ key: 'NAME', kind: 'text-search', operator: 'equals' })],
      { NAME: 'bar' },
    );
    expect(result).toEqual({
      NAME: { filterType: 'text', type: 'equals', filter: 'bar' },
    });
  });

  it('text-search trims whitespace', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: '  hello  ',
    });
    expect(result).toEqual({
      NAME: { filterType: 'text', type: 'contains', filter: 'hello' },
    });
  });

  /* --------------------------------------------------------------------- */
  /*  enum-select                                                          */
  /* --------------------------------------------------------------------- */

  it('enum-select default operator → equals', () => {
    const result = translateMetadataFilters([def({ key: 'STATUS', kind: 'enum-select' })], {
      STATUS: 'ACTIVE',
    });
    expect(result).toEqual({
      STATUS: { filterType: 'text', type: 'equals', filter: 'ACTIVE' },
    });
  });

  it('enum-select + contains → contains', () => {
    const result = translateMetadataFilters(
      [def({ key: 'STATUS', kind: 'enum-select', operator: 'contains' })],
      { STATUS: 'PARTIAL' },
    );
    expect(result).toEqual({
      STATUS: { filterType: 'text', type: 'contains', filter: 'PARTIAL' },
    });
  });

  /* --------------------------------------------------------------------- */
  /*  date-range                                                           */
  /* --------------------------------------------------------------------- */

  it('date-range default operator (between) → inRange', () => {
    const result = translateMetadataFilters([def({ key: 'CREATED_AT', kind: 'date-range' })], {
      CREATED_AT: { from: '2026-05-01', to: '2026-05-31' },
    });
    expect(result).toEqual({
      CREATED_AT: {
        filterType: 'date',
        type: 'inRange',
        filter: '2026-05-01',
        filterTo: '2026-05-31',
      },
    });
  });

  it('date-range + gte → greaterThanOrEqual (Codex iter-3 inclusive fix)', () => {
    const result = translateMetadataFilters(
      [def({ key: 'CREATED_AT', kind: 'date-range', operator: 'gte' })],
      { CREATED_AT: { from: '2026-05-01' } },
    );
    expect(result).toEqual({
      CREATED_AT: {
        filterType: 'date',
        type: 'greaterThanOrEqual',
        filter: '2026-05-01',
      },
    });
  });

  it('date-range + lte → lessThanOrEqual (Codex iter-3 inclusive fix)', () => {
    const result = translateMetadataFilters(
      [def({ key: 'CREATED_AT', kind: 'date-range', operator: 'lte' })],
      { CREATED_AT: { to: '2026-05-31' } },
    );
    expect(result).toEqual({
      CREATED_AT: {
        filterType: 'date',
        type: 'lessThanOrEqual',
        filter: '2026-05-31',
      },
    });
  });

  it('date-range between missing one bound → drops', () => {
    const result = translateMetadataFilters([def({ key: 'CREATED_AT', kind: 'date-range' })], {
      CREATED_AT: { from: '2026-05-01' },
    });
    expect(result).toBe(null);
  });

  /* --------------------------------------------------------------------- */
  /*  number-range                                                         */
  /* --------------------------------------------------------------------- */

  it('number-range default (between) → inRange', () => {
    const result = translateMetadataFilters([def({ key: 'SALARY', kind: 'number-range' })], {
      SALARY: { from: 1000, to: 5000 },
    });
    expect(result).toEqual({
      SALARY: {
        filterType: 'number',
        type: 'inRange',
        filter: 1000,
        filterTo: 5000,
      },
    });
  });

  it('number-range + gte → greaterThanOrEqual', () => {
    const result = translateMetadataFilters(
      [def({ key: 'SALARY', kind: 'number-range', operator: 'gte' })],
      { SALARY: { from: 1000 } },
    );
    expect(result).toEqual({
      SALARY: {
        filterType: 'number',
        type: 'greaterThanOrEqual',
        filter: 1000,
      },
    });
  });

  it('number-range + lte → lessThanOrEqual', () => {
    const result = translateMetadataFilters(
      [def({ key: 'SALARY', kind: 'number-range', operator: 'lte' })],
      { SALARY: { to: 5000 } },
    );
    expect(result).toEqual({
      SALARY: {
        filterType: 'number',
        type: 'lessThanOrEqual',
        filter: 5000,
      },
    });
  });

  it('number-range drops non-finite values', () => {
    const result = translateMetadataFilters([def({ key: 'SALARY', kind: 'number-range' })], {
      SALARY: { from: NaN, to: Infinity },
    });
    expect(result).toBe(null);
  });

  /* --------------------------------------------------------------------- */
  /*  month-picker                                                         */
  /* --------------------------------------------------------------------- */

  it('month-picker YYYY-MM → inRange first→last day of month', () => {
    const result = translateMetadataFilters([def({ key: 'PERIOD', kind: 'month-picker' })], {
      PERIOD: '2026-02',
    });
    expect(result).toEqual({
      PERIOD: {
        filterType: 'date',
        type: 'inRange',
        filter: '2026-02-01',
        filterTo: '2026-02-28', // 2026 is not a leap year
      },
    });
  });

  it('month-picker handles leap-year February correctly', () => {
    const result = translateMetadataFilters([def({ key: 'PERIOD', kind: 'month-picker' })], {
      PERIOD: '2024-02',
    });
    expect(result).toEqual({
      PERIOD: {
        filterType: 'date',
        type: 'inRange',
        filter: '2024-02-01',
        filterTo: '2024-02-29', // 2024 is a leap year
      },
    });
  });

  it('month-picker handles 30-day month correctly', () => {
    const result = translateMetadataFilters([def({ key: 'PERIOD', kind: 'month-picker' })], {
      PERIOD: '2026-04',
    });
    expect(result?.PERIOD).toEqual({
      filterType: 'date',
      type: 'inRange',
      filter: '2026-04-01',
      filterTo: '2026-04-30',
    });
  });

  it('month-picker invalid format → drops', () => {
    const result = translateMetadataFilters([def({ key: 'PERIOD', kind: 'month-picker' })], {
      PERIOD: 'not-a-date',
    });
    expect(result).toBe(null);
  });

  it('month-picker out-of-range month → drops', () => {
    const result = translateMetadataFilters([def({ key: 'PERIOD', kind: 'month-picker' })], {
      PERIOD: '2026-13',
    });
    expect(result).toBe(null);
  });

  /* --------------------------------------------------------------------- */
  /*  company-picker (NEVER in output)                                     */
  /* --------------------------------------------------------------------- */

  it('company-picker is skipped (global tenant selector, not column filter)', () => {
    const result = translateMetadataFilters([def({ key: 'companyId', kind: 'company-picker' })], {
      companyId: '7',
    });
    expect(result).toBe(null);
  });

  it('company-picker alongside text-search → only text-search appears', () => {
    const result = translateMetadataFilters(
      [
        def({ key: 'companyId', kind: 'company-picker' }),
        def({ key: 'NAME', kind: 'text-search' }),
      ],
      { companyId: '7', NAME: 'foo' },
    );
    expect(result).toEqual({
      NAME: { filterType: 'text', type: 'contains', filter: 'foo' },
    });
    expect(result?.companyId).toBeUndefined();
  });

  /* --------------------------------------------------------------------- */
  /*  colId resolution priority                                            */
  /* --------------------------------------------------------------------- */

  it('uses advancedFilterTarget when present (highest priority)', () => {
    const result = translateMetadataFilters(
      [
        def({
          key: 'searchTerm',
          targetField: 'NAME',
          advancedFilterTarget: 'CUSTOM_COL',
          kind: 'text-search',
        }),
      ],
      { searchTerm: 'foo' },
    );
    expect(Object.keys(result ?? {})).toEqual(['CUSTOM_COL']);
  });

  it('uses targetField when advancedFilterTarget absent', () => {
    const result = translateMetadataFilters(
      [
        def({
          key: 'searchTerm',
          targetField: 'NAME',
          kind: 'text-search',
        }),
      ],
      { searchTerm: 'foo' },
    );
    expect(Object.keys(result ?? {})).toEqual(['NAME']);
  });

  it('uses key when neither advancedFilterTarget nor targetField present', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: 'foo',
    });
    expect(Object.keys(result ?? {})).toEqual(['NAME']);
  });

  it('resolveColId helper returns same priority result', () => {
    expect(resolveColId(def({ key: 'k', kind: 'text-search' }))).toBe('k');
    expect(resolveColId(def({ key: 'k', targetField: 't', kind: 'text-search' }))).toBe('t');
    expect(
      resolveColId(
        def({
          key: 'k',
          targetField: 't',
          advancedFilterTarget: 'a',
          kind: 'text-search',
        }),
      ),
    ).toBe('a');
  });

  /* --------------------------------------------------------------------- */
  /*  Same-colId collision → compound AND                                  */
  /* --------------------------------------------------------------------- */

  it('two definitions on same colId → compound AND conditions[]', () => {
    const result = translateMetadataFilters(
      [
        def({ key: 'CREATED_AT', kind: 'date-range', operator: 'gte' }),
        def({
          key: 'CREATED_AT_END',
          advancedFilterTarget: 'CREATED_AT',
          kind: 'date-range',
          operator: 'lte',
        }),
      ],
      {
        CREATED_AT: { from: '2026-05-01' },
        CREATED_AT_END: { to: '2026-05-31' },
      },
    );

    expect(result).not.toBeNull();
    const colFilter = result!.CREATED_AT as CompoundFilter;
    expect(colFilter.operator).toBe('AND');
    expect(colFilter.conditions).toHaveLength(2);
    expect(colFilter.conditions[0]).toMatchObject({
      type: 'greaterThanOrEqual',
      filter: '2026-05-01',
    });
    expect(colFilter.conditions[1]).toMatchObject({
      type: 'lessThanOrEqual',
      filter: '2026-05-31',
    });
  });

  it('three definitions on same colId → compound AND with 3 conditions', () => {
    const result = translateMetadataFilters(
      [
        def({ key: 'NAME', kind: 'text-search', operator: 'contains' }),
        def({
          key: 'NAME_ALT_1',
          advancedFilterTarget: 'NAME',
          kind: 'text-search',
          operator: 'equals',
        }),
        def({
          key: 'NAME_ALT_2',
          advancedFilterTarget: 'NAME',
          kind: 'text-search',
          operator: 'contains',
        }),
      ],
      { NAME: 'foo', NAME_ALT_1: 'bar', NAME_ALT_2: 'baz' },
    );

    expect(result).not.toBeNull();
    const colFilter = result!.NAME as CompoundFilter;
    expect(colFilter.operator).toBe('AND');
    expect(colFilter.conditions).toHaveLength(3);
    expect(colFilter.conditions.map((c) => (c as { filter?: string }).filter)).toEqual([
      'foo',
      'bar',
      'baz',
    ]);
  });

  it('collision: existing compound AND gets new condition appended (no double-wrap)', () => {
    // 3 definitions → first two should fold into compound, third appends to
    // existing compound (not wrap compound in another compound)
    const result = translateMetadataFilters(
      [
        def({ key: 'k1', advancedFilterTarget: 'COL', kind: 'text-search' }),
        def({ key: 'k2', advancedFilterTarget: 'COL', kind: 'text-search' }),
        def({ key: 'k3', advancedFilterTarget: 'COL', kind: 'text-search' }),
      ],
      { k1: 'a', k2: 'b', k3: 'c' },
    );

    expect(result).not.toBeNull();
    const compound = result!.COL as CompoundFilter;
    expect(compound.operator).toBe('AND');
    expect(compound.conditions).toHaveLength(3);
    // Verify it's flat, NOT nested
    expect(compound.conditions.every((c) => !('conditions' in c))).toBe(true);
  });

  /* --------------------------------------------------------------------- */
  /*  Multi-column AND                                                     */
  /* --------------------------------------------------------------------- */

  it('two different columns → both top-level keys (backend AND-merges)', () => {
    const result = translateMetadataFilters(
      [def({ key: 'NAME', kind: 'text-search' }), def({ key: 'STATUS', kind: 'enum-select' })],
      { NAME: 'foo', STATUS: 'ACTIVE' },
    );
    expect(result).toEqual({
      NAME: { filterType: 'text', type: 'contains', filter: 'foo' },
      STATUS: { filterType: 'text', type: 'equals', filter: 'ACTIVE' },
    });
  });

  /* --------------------------------------------------------------------- */
  /*  Defensive: weird input                                               */
  /* --------------------------------------------------------------------- */

  it('non-string text-search value → drops', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: 123,
    });
    expect(result).toBe(null);
  });

  it('null state value → drops', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: null,
    });
    expect(result).toBe(null);
  });

  it('extra state keys not referenced by definitions are ignored', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: 'foo',
      UNRELATED: 'bar',
    });
    expect(result).toEqual({
      NAME: { filterType: 'text', type: 'contains', filter: 'foo' },
    });
  });

  it('extracted simple condition is type-narrowable as text', () => {
    const result = translateMetadataFilters([def({ key: 'NAME', kind: 'text-search' })], {
      NAME: 'foo',
    });
    const c = result?.NAME as SimpleFilterCondition;
    expect(c.filterType).toBe('text');
  });
});
