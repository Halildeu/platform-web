/**
 * SSRM response contract normalizer — Codex thread 019e3a61 (AGREE).
 *
 * AG Grid v34 Server-Side Row Model calls `params.success({ rowData,
 * rowCount })` once per cache block. `rowData` is the block window AG
 * Grid asked for (`[startRow, endRow)`); `rowCount` is the global /
 * store total. `ReportPage` previously forwarded a module's raw
 * `GridResponse { rows, total }` straight through — but the report
 * modules carry three divergent total semantics:
 *
 *   - backend-paged (users / monthly-login / audit / dynamic): an
 *     honest global total;
 *   - "last-block cap" (weekly-audit / hr-compensation): a defensive
 *     cap that collapsed `total` to a page-LOCAL count on every
 *     non-first partial block, telling AG Grid the dataset was tiny so
 *     it dropped the already-loaded rows ("Sütunlar var, satır yok");
 *   - no backend pagination (access): returned the WHOLE filtered list
 *     on every block, so block N duplicated block 0.
 *
 * This helper is the single shared boundary that re-derives an AG Grid
 * SSRM-correct `{ rowData, rowCount }` from the request window, so a
 * fix for one report group cannot regress another. The module adapters
 * are also corrected at source (access slices its page window; the two
 * caps now yield `startRow + rows.length`); this helper is the
 * defence-in-depth net and the canonical contract.
 */

/** Minimal structural view of a module's `GridResponse` the helper needs. */
export interface SsrmResponseLike<TRow> {
  rows: TRow[];
  total?: number;
}

export interface NormalizeSsrmSuccessInput<TRow> {
  /** SSRM cache-window start, inclusive (AG Grid `params.request.startRow`). */
  startRow?: number;
  /** SSRM cache-window end, exclusive (AG Grid `params.request.endRow`). */
  endRow?: number;
  /** The module's `fetchRows` result. */
  res: SsrmResponseLike<TRow>;
}

export interface SsrmSuccessPayload<TRow> {
  rowData: TRow[];
  /**
   * Omitted (`undefined`) when the global total is unknown — AG Grid
   * then keeps requesting blocks until a short one ends the dataset,
   * instead of trusting a broken count and hiding loaded rows.
   */
  rowCount?: number;
}

const toSafeIndex = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

/**
 * Re-derives an AG Grid SSRM-correct `{ rowData, rowCount }` from the
 * request window. See the file header for the rationale.
 *
 * Invariants (Codex 019e3a61 iter-2):
 *   1. `rowData.length <= blockSize` — an over-long payload is sliced
 *      to the window (+ a dev warning) so production keeps rendering.
 *   2. short block (`rowData.length < blockSize`) ⇒ this IS the last
 *      block ⇒ `rowCount = startRow + rowData.length` (exact).
 *   3. full block + trustworthy total (`total >= startRow + rowData.length`)
 *      ⇒ the total is forwarded.
 *   4. full block + missing / under-counting / non-finite total ⇒
 *      `rowCount` is omitted (unknown-total mode).
 */
export const normalizeSsrmSuccessPayload = <TRow>(
  input: NormalizeSsrmSuccessInput<TRow>,
): SsrmSuccessPayload<TRow> => {
  const rawRows = Array.isArray(input.res?.rows) ? input.res.rows : [];
  const startRow = toSafeIndex(input.startRow, 0);
  // endRow must be strictly greater than startRow; when it is absent or
  // malformed fall back to a window that exactly fits the rows returned
  // (which then reads as a "last block").
  const endRowCandidate = toSafeIndex(input.endRow, startRow + rawRows.length);
  const endRow =
    endRowCandidate > startRow ? endRowCandidate : startRow + Math.max(rawRows.length, 1);
  const blockSize = Math.max(1, endRow - startRow);

  let rowData = rawRows;
  if (rawRows.length > blockSize) {
    // The module returned more rows than the SSRM window asked for
    // (the `access` "whole list" bug). Slice defensively so the grid
    // still renders; the module-level contract test still fails this
    // case so the real fix stays at source.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[mfe-reporting/ssrm] module returned ${rawRows.length} rows for a ${blockSize}-row block window; slicing to the window`,
      );
    }
    rowData = rawRows.slice(0, blockSize);
  }

  const loadedEnd = startRow + rowData.length;
  const total = input.res?.total;
  const totalIsFinite = typeof total === 'number' && Number.isFinite(total) && total >= 0;

  let rowCount: number | undefined;
  if (rowData.length < blockSize) {
    // Short block ⇒ definitively the last block ⇒ exact final count.
    rowCount = loadedEnd;
  } else if (totalIsFinite && (total as number) >= loadedEnd) {
    // Full block + trustworthy total ⇒ honour the backend total.
    rowCount = Math.floor(total as number);
  } else {
    // Full block + missing / under-counting total ⇒ leave undefined so
    // AG Grid keeps paging instead of hiding already-loaded rows.
    rowCount = undefined;
  }

  return { rowData, rowCount };
};
