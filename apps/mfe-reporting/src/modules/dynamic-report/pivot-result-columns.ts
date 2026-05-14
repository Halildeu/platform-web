/**
 * PR-0.4d-fe (Codex thread 019e2695): AG Grid SSRM secondary column
 * registration helpers. Keep the wiring isolated from the giant
 * ReportPage.tsx so the alignment guard + signature-based churn
 * avoidance + stale cleanup can be unit-tested without spinning up
 * a full render.
 */
import type { GridApi } from 'ag-grid-community';
import type { PivotResultColumn } from '../../grid';

/**
 * Outcome of {@link applyPivotResultColumns}. The datasource branches
 * on this to decide whether to forward {@code pivotResultFields} to
 * {@code params.success} (fallback path) or not (explicit path /
 * cleared / no-op).
 */
export type PivotApplyMode =
  | { mode: 'explicit'; secondaryColDefs: PivotSecondaryColDef[] }
  | { mode: 'fallback'; pivotResultFields: string[] }
  | { mode: 'cleared' }
  | { mode: 'noop' };

/**
 * Minimal AG Grid secondary column shape. Captured locally so the
 * helper stays free of the {@code ag-grid-community} ColDef surface
 * (the real type evolves with every AG Grid major; this projection is
 * the subset SSRM secondary registration accepts).
 *
 * The {@code colId} is the SQL alias from the backend; AG Grid uses it
 * to address row-data fields, so it MUST match the response row key.
 * The {@code headerName} carries the localised pivot label; the
 * frontend renders it as a plain string (no HTML — Codex iter-2
 * defence-in-depth).
 */
export type PivotSecondaryColDef = {
  colId: string;
  field: string;
  headerName: string;
  // Carry the raw metadata so future PRs (header grouping, custom
  // cellRenderer per aggFunc, etc.) can read it off the colDef instead
  // of plumbing the original PivotResultColumn through again.
  pivotField: string;
  pivotValue: string;
  pivotLabel: string;
  aggFunc: string;
  valueField: string;
};

/**
 * PR-0.4d-fe alignment guard. The backend asserts the invariant at
 * construction (canonical constructor on {@code PivotedBuiltQuery}),
 * but rolling-deploy combos (new FE / old BE, BE cache eviction race,
 * etc.) can still serve a mismatch. When that happens the frontend
 * falls back to the {@code pivotResultFields}-only path rather than
 * surfacing the broken metadata to AG Grid.
 */
export const isAlignedPivotEnvelope = (
  fields: string[] | undefined,
  columns: PivotResultColumn[] | undefined,
): columns is PivotResultColumn[] => {
  if (!fields?.length || !columns?.length) return false;
  if (fields.length !== columns.length) return false;
  return columns.every((col, index) => col.field === fields[index]);
};

/**
 * Compute a deterministic signature for the supplied pivot envelope.
 * Used by {@link applyPivotResultColumns} to short-circuit identical
 * back-to-back responses; AG Grid's secondary column reconciliation is
 * expensive and can churn variant state.
 */
const pivotEnvelopeSignature = (columns: PivotResultColumn[]): string =>
  columns.map((c) => `${c.field}|${c.pivotLabel}|${c.aggFunc}|${c.valueField}`).join(',');

/**
 * Render the AG Grid SSRM secondary header for one pivot result
 * column. Multi-valueCol reports otherwise collide on a bare
 * {@code pivotLabel}; appending the agg/value pair keeps every header
 * unique while staying readable in Turkish. Examples:
 *
 *   Aktif / Toplam Tutar
 *   Aktif / Ortalama Adet
 *   Pasif / Toplam Tutar
 *
 * Frontend renders {@code headerName} as a plain string (Codex iter-2
 * P3): no HTML injection through registry-supplied labels.
 */
export const buildPivotSecondaryHeader = (column: PivotResultColumn): string => {
  // Single-valueCol grids tend to have the agg/value identical across
  // every bucket; in that case the bare label reads cleaner. We still
  // keep the metadata on the colDef so a future grouped-header PR can
  // promote it without changing this helper.
  return `${column.pivotLabel} / ${column.aggFunc.toUpperCase()}(${column.valueField})`;
};

/**
 * Apply the latest pivot envelope to the AG Grid SSRM secondary
 * columns. Returns a {@link PivotApplyMode} the datasource branches
 * on to decide whether to forward {@code pivotResultFields} on the
 * fallback path.
 *
 * Codex thread 019e2695 PR-0.4d-fe spec:
 *   - Mode separation: explicit colDefs are only registered when the
 *     response carries an aligned {@code pivotResultColumns} list.
 *   - Signature-based avoidance: identical back-to-back signatures
 *     short-circuit so AG Grid never re-applies the same column state
 *     mid-scroll.
 *   - Stale cleanup: when the latest response no longer ships pivot
 *     metadata, clear any previously registered secondary columns so
 *     a ghost header doesn't outlive the pivotMode toggle.
 */
export const applyPivotResultColumns = (
  api: GridApi | null | undefined,
  pivotResultFields: string[] | undefined,
  pivotResultColumns: PivotResultColumn[] | undefined,
  lastSignatureRef: { current: string | null },
): PivotApplyMode => {
  if (!api) return { mode: 'noop' };

  // Mismatch / desync: backend ordering invariant broken. Fall through
  // to the pivotResultFields-only path (AG Grid's native success
  // signature) so the grid at least registers the row-data keys.
  if (
    pivotResultFields?.length &&
    pivotResultColumns?.length &&
    !isAlignedPivotEnvelope(pivotResultFields, pivotResultColumns)
  ) {
    lastSignatureRef.current = null;
    return {
      mode: 'fallback',
      pivotResultFields,
    };
  }

  // No pivot metadata in the response. Either the request wasn't a
  // pivot request, or the report degraded back to flat/grouped — in
  // both cases we need to clear any previously registered secondary
  // columns so the grid doesn't keep showing ghost pivot headers.
  if (!isAlignedPivotEnvelope(pivotResultFields, pivotResultColumns)) {
    if (lastSignatureRef.current !== null) {
      lastSignatureRef.current = null;
      // AG Grid setPivotResultColumns([]) clears the secondary list;
      // available on the Enterprise SSRM API surface.
      const apiWithPivot = api as GridApi & {
        setPivotResultColumns?: (columns: unknown[]) => void;
      };
      if (typeof apiWithPivot.setPivotResultColumns === 'function') {
        apiWithPivot.setPivotResultColumns([]);
      }
      return { mode: 'cleared' };
    }
    return { mode: 'noop' };
  }

  // Aligned envelope — build the explicit secondary colDefs.
  const signature = pivotEnvelopeSignature(pivotResultColumns);
  if (signature === lastSignatureRef.current) {
    return { mode: 'noop' };
  }
  lastSignatureRef.current = signature;

  const secondaryColDefs: PivotSecondaryColDef[] = pivotResultColumns.map((col) => ({
    colId: col.field,
    field: col.field,
    headerName: buildPivotSecondaryHeader(col),
    pivotField: col.pivotField,
    pivotValue: col.pivotValue,
    pivotLabel: col.pivotLabel,
    aggFunc: col.aggFunc,
    valueField: col.valueField,
  }));

  const apiWithPivot = api as GridApi & {
    setPivotResultColumns?: (columns: unknown[]) => void;
  };
  if (typeof apiWithPivot.setPivotResultColumns === 'function') {
    apiWithPivot.setPivotResultColumns(secondaryColDefs);
  }

  return { mode: 'explicit', secondaryColDefs };
};
