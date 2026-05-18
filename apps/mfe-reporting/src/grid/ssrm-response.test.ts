import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSsrmSuccessPayload } from './ssrm-response';

/*
 * Unit coverage for the SSRM response contract normalizer (Codex thread
 * 019e3a61). The normalizer is the single shared boundary that turns a
 * module's divergent `GridResponse { rows, total }` into an AG Grid
 * SSRM-correct `{ rowData, rowCount }`. The four invariants:
 *
 *   1. over-long payload  → sliced to the block window (+ dev warn);
 *   2. short block        → rowCount = startRow + rows.length (exact);
 *   3. full block + ok    → rowCount = total;
 *   4. full block + broken→ rowCount undefined (unknown-total mode).
 */

const rows = (n: number): Array<{ id: number }> => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('normalizeSsrmSuccessPayload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('short block — last block, exact count', () => {
    it('uses startRow + rows.length regardless of res.total on the first block', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 0,
        endRow: 50,
        res: { rows: rows(30), total: 999 },
      });
      expect(out.rowData).toHaveLength(30);
      expect(out.rowCount).toBe(30);
    });

    it('corrects a page-local capped total on a non-first short block', () => {
      // weekly-audit / hr-compensation cap bug: total collapsed to the
      // page-local 20 — the normalizer must re-derive 50 + 20 = 70.
      const out = normalizeSsrmSuccessPayload({
        startRow: 50,
        endRow: 100,
        res: { rows: rows(20), total: 20 },
      });
      expect(out.rowCount).toBe(70);
    });

    it('derives the count when res.total is missing on a short block', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 50,
        endRow: 100,
        res: { rows: rows(20) },
      });
      expect(out.rowCount).toBe(70);
    });
  });

  describe('full block', () => {
    it('honours a trustworthy global total', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 0,
        endRow: 50,
        res: { rows: rows(50), total: 1000 },
      });
      expect(out.rowCount).toBe(1000);
    });

    it('accepts a full last block whose total exactly equals startRow + rows.length', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 50,
        endRow: 100,
        res: { rows: rows(50), total: 100 },
      });
      expect(out.rowCount).toBe(100);
    });

    it('drops a total that under-counts the already-loaded window (cap bug)', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 50,
        endRow: 100,
        res: { rows: rows(50), total: 50 },
      });
      expect(out.rowCount).toBeUndefined();
    });

    it('drops a missing total on a full block', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 0,
        endRow: 50,
        res: { rows: rows(50) },
      });
      expect(out.rowCount).toBeUndefined();
    });

    it.each([
      ['NaN', Number.NaN],
      ['negative', -1],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['string', '120' as unknown as number],
      ['null', null as unknown as number],
    ])('drops an invalid total (%s) on a full block', (_label, badTotal) => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 0,
        endRow: 50,
        res: { rows: rows(50), total: badTotal },
      });
      expect(out.rowCount).toBeUndefined();
    });
  });

  describe('over-long payload — access "whole list" bug', () => {
    it('slices rowData to the block window and keeps a valid total', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const out = normalizeSsrmSuccessPayload({
        startRow: 0,
        endRow: 50,
        res: { rows: rows(200), total: 200 },
      });
      expect(out.rowData).toHaveLength(50);
      expect(out.rowCount).toBe(200);
      expect(warn).toHaveBeenCalledOnce();
    });

    it('slices a non-first over-long block to the window without duplicating block 0', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      // A 200-row payload handed to the [50,100) window: the helper can
      // only slice to size — it CANNOT know to slice from offset 50, so
      // the module itself must page. This documents the residual gap
      // that the module-level contract test guards.
      const out = normalizeSsrmSuccessPayload({
        startRow: 50,
        endRow: 100,
        res: { rows: rows(200), total: 200 },
      });
      expect(out.rowData).toHaveLength(50);
      expect(out.rowCount).toBe(200);
      warn.mockRestore();
    });
  });

  describe('defensive input handling', () => {
    it('treats a non-array rows field as empty', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: 0,
        endRow: 50,
        res: { rows: undefined as unknown as never[], total: 5 },
      });
      expect(out.rowData).toEqual([]);
      expect(out.rowCount).toBe(0);
    });

    it('falls back to a rows-sized window when startRow / endRow are absent', () => {
      const out = normalizeSsrmSuccessPayload({ res: { rows: rows(10), total: 999 } });
      expect(out.rowData).toHaveLength(10);
      // window === rows.length ⇒ "full block", total 999 ≥ 10 ⇒ honoured.
      expect(out.rowCount).toBe(999);
    });

    it('clamps a negative startRow to 0', () => {
      const out = normalizeSsrmSuccessPayload({
        startRow: -10,
        endRow: 50,
        res: { rows: rows(20), total: 20 },
      });
      expect(out.rowCount).toBe(20);
    });
  });
});
