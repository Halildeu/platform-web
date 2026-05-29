/**
 * WEB-015 v1 — Client-side CSV export utility.
 *
 * Generates a CSV string from a column definition + row array that is
 * already available in memory (RTK Query cache). Three hard guarantees,
 * each independently unit-tested:
 *
 *  1. RFC-4180 escaping — any value containing the delimiter, a double
 *     quote, CR or LF is wrapped in double quotes and inner quotes are
 *     doubled. This keeps the cell on one logical field even when the
 *     payload contains commas / newlines.
 *
 *  2. CSV formula-injection guard (a.k.a. CSV injection / DDE) — a cell
 *     whose first character is one of `= + - @` or a control char that
 *     spreadsheet apps treat as a formula lead-in (TAB \t, CR \r) is
 *     prefixed with a single quote (`'`) so Excel / Sheets / LibreOffice
 *     render it as literal text instead of evaluating it. The guard runs
 *     on the *unescaped* value first, then escaping is applied — so a
 *     guarded `'=cmd` still survives quoting correctly. See OWASP
 *     "CSV Injection".
 *
 *  3. Large-row cap — `rowCap` (default {@link DEFAULT_ROW_CAP}) bounds
 *     the number of data rows serialised. When the input exceeds the cap
 *     the output is truncated to the first `rowCap` rows and
 *     {@link buildCsv} reports `truncated: true` + the original
 *     `totalRows`, so the caller can surface a notice. This protects the
 *     browser main thread (and the user's RAM) from a multi-hundred-MB
 *     string materialisation on a huge fleet.
 *
 * The util is intentionally framework-free (no React, no DOM) so the
 * escaping / guard / cap logic is exhaustively testable in isolation.
 * The DOM download side-effect lives in {@link triggerCsvDownload}.
 */

/** Default maximum number of data rows serialised into a single CSV. */
export const DEFAULT_ROW_CAP = 10_000;

/** Default field delimiter. Comma is the canonical CSV separator. */
export const DEFAULT_DELIMITER = ',';

/**
 * BOM prefix so Excel on Windows opens UTF-8 files with Turkish glyphs
 * (ç/ğ/ş/İ…) correctly instead of mojibake. Standard for tr-TR exports.
 */
export const UTF8_BOM = '﻿';

/** A single exportable column: a stable key + header label + accessor. */
export interface CsvColumn<Row> {
  /** Stable column id (used for nothing user-facing, but handy in tests). */
  key: string;
  /** Localised header cell text. */
  header: string;
  /**
   * Pull the raw cell value from a row. Return `null` / `undefined` for a
   * blank cell — they serialise to an empty field.
   */
  value: (row: Row) => string | number | boolean | null | undefined;
}

export interface BuildCsvOptions {
  /** Field delimiter. Defaults to {@link DEFAULT_DELIMITER}. */
  delimiter?: string;
  /** Max data rows. Defaults to {@link DEFAULT_ROW_CAP}. Must be >= 1. */
  rowCap?: number;
  /** Prepend a UTF-8 BOM (Excel compatibility). Defaults to `true`. */
  withBom?: boolean;
}

export interface BuildCsvResult {
  /** The full CSV text (header row + capped data rows). */
  content: string;
  /** Number of data rows actually written (<= rowCap, <= totalRows). */
  writtenRows: number;
  /** Number of data rows in the input before capping. */
  totalRows: number;
  /** True when `totalRows > rowCap` and the output was truncated. */
  truncated: boolean;
  /** The effective row cap applied. */
  rowCap: number;
}

/**
 * Characters that, when leading a cell, make a spreadsheet treat the
 * cell as a formula. `=`, `+`, `-`, `@` are the classic four; `\t` and
 * `\r` are added because Excel strips a leading TAB/CR and can then
 * re-interpret the *next* char as a formula lead.
 */
const FORMULA_LEAD = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Guard a single raw value against CSV formula injection. Runs BEFORE
 * RFC-4180 escaping. Returns the (possibly prefixed) string form.
 *
 * Exported for direct unit testing of the guard in isolation.
 */
export function guardFormulaInjection(raw: string): string {
  if (raw.length === 0) return raw;
  return FORMULA_LEAD.has(raw[0]!) ? `'${raw}` : raw;
}

/**
 * RFC-4180 escape a single field. Wraps in double quotes and doubles
 * inner quotes when the value contains the delimiter, a double quote,
 * CR or LF. Otherwise returns the value verbatim.
 *
 * Exported for direct unit testing of escaping in isolation.
 */
export function escapeCsvField(value: string, delimiter: string = DEFAULT_DELIMITER): string {
  const mustQuote =
    value.includes('"') ||
    value.includes(delimiter) ||
    value.includes('\n') ||
    value.includes('\r');
  if (!mustQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Normalise any cell value to its string form (null/undefined → ''). */
function stringifyCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Serialise one cell: stringify → formula-guard → RFC-4180 escape. The
 * order matters — the guard prefix must be inside the escaping so a
 * guarded `'=HYPERLINK(...)` stays a single quoted field.
 */
function serialiseCell(
  value: string | number | boolean | null | undefined,
  delimiter: string,
): string {
  return escapeCsvField(guardFormulaInjection(stringifyCell(value)), delimiter);
}

/**
 * Build a CSV document from columns + rows. Pure, DOM-free, deterministic.
 *
 * Uses CRLF (`\r\n`) line endings per RFC-4180 §2.1.
 */
export function buildCsv<Row>(
  columns: ReadonlyArray<CsvColumn<Row>>,
  rows: ReadonlyArray<Row>,
  options: BuildCsvOptions = {},
): BuildCsvResult {
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER;
  const requestedCap = options.rowCap ?? DEFAULT_ROW_CAP;
  // Guard against a non-positive / non-finite cap: fall back to default.
  const rowCap =
    Number.isFinite(requestedCap) && requestedCap >= 1 ? Math.floor(requestedCap) : DEFAULT_ROW_CAP;
  const withBom = options.withBom ?? true;

  const totalRows = rows.length;
  const truncated = totalRows > rowCap;
  const cappedRows = truncated ? rows.slice(0, rowCap) : rows;

  const headerLine = columns.map((c) => serialiseCell(c.header, delimiter)).join(delimiter);
  const dataLines = cappedRows.map((row) =>
    columns.map((c) => serialiseCell(c.value(row), delimiter)).join(delimiter),
  );

  const body = [headerLine, ...dataLines].join('\r\n');
  const content = (withBom ? UTF8_BOM : '') + body;

  return {
    content,
    writtenRows: cappedRows.length,
    totalRows,
    truncated,
    rowCap,
  };
}

/**
 * Trigger a browser download of `content` as a file named `filename`.
 *
 * Mirrors the design-system `useDownloadWithProgress` blob-anchor
 * pattern. No-ops cleanly under non-DOM / SSR environments and when the
 * Blob / URL.createObjectURL APIs are unavailable (jsdom test runs),
 * returning `false` so callers / tests can assert the guard fired
 * without a hard crash.
 *
 * @returns `true` when a download anchor was dispatched, `false` when
 *          the environment could not perform the download.
 */
export function triggerCsvDownload(
  content: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8',
): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  if (typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') return false;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // Defer revoke so the click navigation is committed first.
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore — best-effort cleanup
    }
    anchor.remove();
  }, 0);
  return true;
}

/**
 * Compose a timestamped CSV filename: `<base>-YYYYMMDD-HHmmss.csv`.
 * Uses local time so the filename matches what the operator sees on
 * their clock. `base` is sanitised to a filesystem-safe slug.
 */
export function buildCsvFilename(base: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const slug = base.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
  return `${slug}-${stamp}.csv`;
}
