/**
 * PR-0.4d-fe (Codex thread 019e2695): unit coverage for the SSRM
 * secondary column wiring helper. Pins the alignment guard,
 * signature-based churn avoidance, stale cleanup and fallback
 * branch so AG Grid integration stays predictable across rolling
 * deploys.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  applyPivotResultColumns,
  buildPivotSecondaryHeader,
  isAlignedPivotEnvelope,
  type PivotApplyMode,
} from '../pivot-result-columns';
import type { PivotResultColumn } from '../../../grid';

type MockGridApi = {
  setPivotResultColumns: ReturnType<typeof vi.fn>;
};

const mockApi = (): MockGridApi => ({
  setPivotResultColumns: vi.fn(),
});

const sampleColumns: PivotResultColumn[] = [
  {
    field: 'pvt__status__A__sum__amount',
    pivotField: 'status',
    pivotValue: 'A',
    pivotLabel: 'Aktif',
    aggFunc: 'sum',
    valueField: 'amount',
  },
  {
    field: 'pvt__status__P__sum__amount',
    pivotField: 'status',
    pivotValue: 'P',
    pivotLabel: 'Pasif',
    aggFunc: 'sum',
    valueField: 'amount',
  },
];
const sampleFields = sampleColumns.map((c) => c.field);

describe('isAlignedPivotEnvelope', () => {
  it('accepts an aligned (fields, columns) pair', () => {
    expect(isAlignedPivotEnvelope(sampleFields, sampleColumns)).toBe(true);
  });

  it('rejects when array lengths differ', () => {
    expect(isAlignedPivotEnvelope(sampleFields, sampleColumns.slice(0, 1))).toBe(false);
  });

  it('rejects when ordering desyncs', () => {
    expect(isAlignedPivotEnvelope(sampleFields, [sampleColumns[1], sampleColumns[0]])).toBe(false);
  });

  it('rejects on null / empty inputs (non-pivot path)', () => {
    expect(isAlignedPivotEnvelope(undefined, undefined)).toBe(false);
    expect(isAlignedPivotEnvelope([], [])).toBe(false);
    expect(isAlignedPivotEnvelope(sampleFields, undefined)).toBe(false);
    expect(isAlignedPivotEnvelope(undefined, sampleColumns)).toBe(false);
  });
});

describe('buildPivotSecondaryHeader', () => {
  it('composes pivotLabel + agg/value so multi-valueCol headers stay unique', () => {
    // Multi-valueCol grids would otherwise collide on bare label.
    expect(
      buildPivotSecondaryHeader({
        field: 'pvt__status__A__sum__amount',
        pivotField: 'status',
        pivotValue: 'A',
        pivotLabel: 'Aktif',
        aggFunc: 'sum',
        valueField: 'amount',
      }),
    ).toBe('Aktif / SUM(amount)');
  });

  it('preserves Turkish characters in pivotLabel', () => {
    expect(
      buildPivotSecondaryHeader({
        field: 'pvt__field__İş_Yeri__avg__amount',
        pivotField: 'field',
        pivotValue: 'İş-Yeri',
        pivotLabel: 'İş Yeri',
        aggFunc: 'avg',
        valueField: 'amount',
      }),
    ).toBe('İş Yeri / AVG(amount)');
  });
});

describe('applyPivotResultColumns', () => {
  it('registers explicit secondary colDefs on a well-formed envelope', () => {
    const api = mockApi();
    const ref = { current: null as string | null };

    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      sampleColumns,
      ref,
    );

    expect(result.mode).toBe('explicit');
    expect((result as Extract<PivotApplyMode, { mode: 'explicit' }>).secondaryColDefs).toHaveLength(
      2,
    );
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(1);
    expect(api.setPivotResultColumns).toHaveBeenCalledWith([
      expect.objectContaining({
        colId: 'pvt__status__A__sum__amount',
        field: 'pvt__status__A__sum__amount',
        headerName: 'Aktif / SUM(amount)',
        pivotLabel: 'Aktif',
      }),
      expect.objectContaining({
        colId: 'pvt__status__P__sum__amount',
        headerName: 'Pasif / SUM(amount)',
      }),
    ]);
    expect(ref.current).not.toBeNull();
  });

  it('short-circuits a repeated identical envelope (signature-based avoidance)', () => {
    const api = mockApi();
    const ref = { current: null as string | null };

    applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      sampleColumns,
      ref,
    );
    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      sampleColumns,
      ref,
    );

    expect(result.mode).toBe('noop');
    // setPivotResultColumns was called once for the first envelope, not
    // a second time for the identical signature.
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(1);
  });

  it('re-registers when the pivot signature changes', () => {
    const api = mockApi();
    const ref = { current: null as string | null };

    applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      sampleColumns,
      ref,
    );

    const updatedColumns: PivotResultColumn[] = [
      ...sampleColumns,
      {
        field: 'pvt__status__C__sum__amount',
        pivotField: 'status',
        pivotValue: 'C',
        pivotLabel: 'Çözüldü',
        aggFunc: 'sum',
        valueField: 'amount',
      },
    ];
    const updatedFields = updatedColumns.map((c) => c.field);

    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      updatedFields,
      updatedColumns,
      ref,
    );

    expect(result.mode).toBe('explicit');
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(2);
    expect(api.setPivotResultColumns.mock.calls[1][0]).toHaveLength(3);
  });

  it('falls back to pivotResultFields when columns desync from fields', () => {
    const api = mockApi();
    const ref = { current: 'previous' as string | null };

    // Reverse the columns so alignment fails.
    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      [sampleColumns[1], sampleColumns[0]],
      ref,
    );

    expect(result.mode).toBe('fallback');
    expect((result as Extract<PivotApplyMode, { mode: 'fallback' }>).pivotResultFields).toEqual(
      sampleFields,
    );
    // Signature ref is cleared so the next aligned response re-registers.
    expect(ref.current).toBeNull();
    // Codex 019e2695 iter-2 P1 absorb: a desync after a prior explicit
    // registration must also clear the stale secondary columns so the
    // grid doesn't keep showing them while the fallback path runs.
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(1);
    expect(api.setPivotResultColumns).toHaveBeenCalledWith([]);
  });

  it('clears previously registered secondary columns when the response drops pivot metadata', () => {
    const api = mockApi();
    const ref = { current: null as string | null };

    // First request: pivot live.
    applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      sampleColumns,
      ref,
    );
    expect(ref.current).not.toBeNull();

    // Second request: user toggled pivotMode off → backend skips the
    // pivot envelope. Helper must clear the AG Grid secondary list so
    // ghost headers don't outlive the toggle.
    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      undefined,
      undefined,
      ref,
    );

    expect(result.mode).toBe('cleared');
    expect(ref.current).toBeNull();
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(2);
    expect(api.setPivotResultColumns).toHaveBeenLastCalledWith([]);
  });

  it('is a no-op when neither pivot metadata is present and nothing was registered', () => {
    const api = mockApi();
    const ref = { current: null as string | null };

    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      undefined,
      undefined,
      ref,
    );

    expect(result.mode).toBe('noop');
    expect(api.setPivotResultColumns).not.toHaveBeenCalled();
  });

  it('falls back to pivotResultFields when api is null but the response carries the alias list', () => {
    // Codex 019e2695 iter-2 P1 absorb: null api closure timing must
    // still let the datasource hand pivotResultFields to params.success
    // so AG Grid registers row-data keys.
    const ref = { current: null as string | null };

    const result = applyPivotResultColumns(null, sampleFields, sampleColumns, ref);

    expect(result.mode).toBe('fallback');
    expect((result as Extract<PivotApplyMode, { mode: 'fallback' }>).pivotResultFields).toEqual(
      sampleFields,
    );
  });

  it('is a no-op when api is null and the response carries no pivot metadata', () => {
    const ref = { current: null as string | null };

    const result = applyPivotResultColumns(null, undefined, undefined, ref);

    expect(result.mode).toBe('noop');
    expect(ref.current).toBeNull();
  });

  it('falls back when AG Grid builds do not expose setPivotResultColumns (Codex iter-2 P1)', () => {
    // Older AG Grid versions / mocks may not surface the SSRM
    // setPivotResultColumns API. Helper must fall back to the
    // pivotResultFields path so AG Grid still registers row-data keys.
    const partialApi = {} as unknown as Parameters<typeof applyPivotResultColumns>[0];
    const ref = { current: null as string | null };

    const result = applyPivotResultColumns(partialApi, sampleFields, sampleColumns, ref);

    expect(result.mode).toBe('fallback');
    expect((result as Extract<PivotApplyMode, { mode: 'fallback' }>).pivotResultFields).toEqual(
      sampleFields,
    );
    expect(ref.current).toBeNull();
  });

  it('falls back when backend ships pivotResultFields without pivotResultColumns (PR-0.4b only deploy)', () => {
    // Codex 019e2695 iter-2 P1 critical: rolling deploy with PR-0.4b
    // backend but no PR-0.4d-be deploy yet. Backend serves the alias
    // list without the semantic metadata; helper must still surface the
    // alias list onto AG Grid via the fallback path.
    const api = mockApi();
    const ref = { current: null as string | null };

    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      undefined,
      ref,
    );

    expect(result.mode).toBe('fallback');
    expect((result as Extract<PivotApplyMode, { mode: 'fallback' }>).pivotResultFields).toEqual(
      sampleFields,
    );
    expect(api.setPivotResultColumns).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it('clears previously registered explicit columns when the response degrades to fields-only', () => {
    // Rolling-deploy sequence: explicit envelope (T0) → fields-only
    // envelope (T1). The helper must clear the previously registered
    // explicit columns AND return the fallback path so the datasource
    // re-supplies pivotResultFields on params.success.
    const api = mockApi();
    const ref = { current: null as string | null };

    // T0: explicit envelope live.
    applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      sampleColumns,
      ref,
    );
    expect(ref.current).not.toBeNull();
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(1);

    // T1: rolling deploy → fields-only response.
    const result = applyPivotResultColumns(
      api as unknown as Parameters<typeof applyPivotResultColumns>[0],
      sampleFields,
      undefined,
      ref,
    );

    expect(result.mode).toBe('fallback');
    expect(ref.current).toBeNull();
    // setPivotResultColumns called twice: once to register T0,
    // once with [] to clear stale columns before falling back.
    expect(api.setPivotResultColumns).toHaveBeenCalledTimes(2);
    expect(api.setPivotResultColumns).toHaveBeenLastCalledWith([]);
  });
});
