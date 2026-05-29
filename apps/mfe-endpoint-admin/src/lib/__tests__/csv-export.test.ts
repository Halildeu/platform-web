// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildCsv,
  buildCsvFilename,
  escapeCsvField,
  guardFormulaInjection,
  triggerCsvDownload,
  DEFAULT_ROW_CAP,
  UTF8_BOM,
  type CsvColumn,
} from '../csv-export';

/**
 * WEB-015 v1 — CSV export utility unit tests.
 *
 * Covers the three hard guarantees: RFC-4180 escaping, formula-injection
 * guard, and the large-row cap, plus the browser-download smoke path.
 */

interface Row {
  name: string;
  note: string | null;
  count: number;
}

const COLUMNS: CsvColumn<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'note', header: 'Note', value: (r) => r.note },
  { key: 'count', header: 'Count', value: (r) => r.count },
];

/** Strip the BOM so body assertions read cleanly. */
const stripBom = (s: string) => (s.startsWith(UTF8_BOM) ? s.slice(UTF8_BOM.length) : s);

describe('escapeCsvField — RFC-4180 escaping', () => {
  it('passes plain values through unquoted', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('quotes and doubles inner quotes when a value contains a double quote', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values containing the delimiter (comma)', () => {
    expect(escapeCsvField('a,b,c')).toBe('"a,b,c"');
  });

  it('quotes values containing a newline (LF) or carriage return (CR)', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
  });

  it('respects a custom delimiter when deciding to quote', () => {
    // A semicolon does NOT need quoting under the default comma delimiter…
    expect(escapeCsvField('a;b')).toBe('a;b');
    // …but DOES when the delimiter is a semicolon.
    expect(escapeCsvField('a;b', ';')).toBe('"a;b"');
  });
});

describe('guardFormulaInjection — CSV formula-injection guard', () => {
  it.each(['=cmd', '+cmd', '-cmd', '@cmd', '\tcmd', '\rcmd'])(
    'prefixes a single quote to a value leading with %j',
    (input) => {
      expect(guardFormulaInjection(input)).toBe(`'${input}`);
    },
  );

  it('leaves safe leading characters untouched', () => {
    expect(guardFormulaInjection('hostname-01')).toBe('hostname-01');
    expect(guardFormulaInjection('1.2.3')).toBe('1.2.3');
    expect(guardFormulaInjection('')).toBe('');
  });

  it('only guards the LEADING char, not interior = + - @', () => {
    expect(guardFormulaInjection('a=b')).toBe('a=b');
    expect(guardFormulaInjection('user@host')).toBe('user@host');
  });
});

describe('buildCsv — composition (guard THEN escape)', () => {
  it('writes a header row plus one data row per input row with CRLF endings', () => {
    const res = buildCsv(
      COLUMNS,
      [
        { name: 'alpha', note: 'ok', count: 1 },
        { name: 'beta', note: null, count: 2 },
      ],
      { withBom: false },
    );
    expect(res.content).toBe(['Name,Note,Count', 'alpha,ok,1', 'beta,,2'].join('\r\n'));
    expect(res.writtenRows).toBe(2);
    expect(res.totalRows).toBe(2);
    expect(res.truncated).toBe(false);
  });

  it('renders null / undefined cells as empty fields', () => {
    const res = buildCsv(COLUMNS, [{ name: 'x', note: null, count: 0 }], { withBom: false });
    expect(stripBom(res.content).split('\r\n')[1]).toBe('x,,0');
  });

  it('applies the formula guard AND escaping together (guarded cell stays one quoted field)', () => {
    // A formula-injection payload that ALSO contains a comma: must be
    // guarded ('=...) and then quoted as a single field.
    const res = buildCsv(
      [{ key: 'name', header: 'Name', value: (r: { name: string }) => r.name }],
      [{ name: '=HYPERLINK("http://evil","x"),1' }],
      { withBom: false },
    );
    const dataLine = stripBom(res.content).split('\r\n')[1];
    // Leading quote from the guard, then the whole thing wrapped+escaped.
    expect(dataLine).toBe('"\'=HYPERLINK(""http://evil"",""x""),1"');
    // Critically it is a SINGLE field — no unescaped delimiter leaks out.
    expect(dataLine!.startsWith('"\'=')).toBe(true);
  });

  it('prepends a UTF-8 BOM by default and omits it when withBom=false', () => {
    const withBom = buildCsv(COLUMNS, [], {});
    expect(withBom.content.startsWith(UTF8_BOM)).toBe(true);
    const noBom = buildCsv(COLUMNS, [], { withBom: false });
    expect(noBom.content.startsWith(UTF8_BOM)).toBe(false);
  });

  it('escapes header cells too', () => {
    const res = buildCsv(
      [{ key: 'k', header: 'A,B', value: () => 'v' }],
      [{} as Record<string, never>],
      { withBom: false },
    );
    expect(stripBom(res.content).split('\r\n')[0]).toBe('"A,B"');
  });
});

describe('buildCsv — large-row cap', () => {
  const mkRows = (n: number): Row[] =>
    Array.from({ length: n }, (_, i) => ({ name: `h${i}`, note: null, count: i }));

  it('does not truncate when rows are at or below the cap', () => {
    const res = buildCsv(COLUMNS, mkRows(5), { rowCap: 5, withBom: false });
    expect(res.truncated).toBe(false);
    expect(res.writtenRows).toBe(5);
    expect(res.totalRows).toBe(5);
    // header + 5 data lines
    expect(res.content.split('\r\n')).toHaveLength(6);
  });

  it('truncates to the first `rowCap` rows and reports truncation metadata', () => {
    const res = buildCsv(COLUMNS, mkRows(12), { rowCap: 10, withBom: false });
    expect(res.truncated).toBe(true);
    expect(res.writtenRows).toBe(10);
    expect(res.totalRows).toBe(12);
    expect(res.rowCap).toBe(10);
    // header + 10 data lines (NOT 12)
    const lines = res.content.split('\r\n');
    expect(lines).toHaveLength(11);
    expect(lines[1]).toBe('h0,,0');
    expect(lines[10]).toBe('h9,,9');
  });

  it('defaults the cap to DEFAULT_ROW_CAP (10k)', () => {
    const res = buildCsv(COLUMNS, mkRows(3), { withBom: false });
    expect(res.rowCap).toBe(DEFAULT_ROW_CAP);
  });

  it('falls back to the default cap for non-positive / non-finite caps', () => {
    expect(buildCsv(COLUMNS, mkRows(1), { rowCap: 0, withBom: false }).rowCap).toBe(
      DEFAULT_ROW_CAP,
    );
    expect(buildCsv(COLUMNS, mkRows(1), { rowCap: -5, withBom: false }).rowCap).toBe(
      DEFAULT_ROW_CAP,
    );
    expect(buildCsv(COLUMNS, mkRows(1), { rowCap: Number.NaN, withBom: false }).rowCap).toBe(
      DEFAULT_ROW_CAP,
    );
  });
});

describe('buildCsvFilename', () => {
  it('composes a slug + local timestamp + .csv extension', () => {
    const fixed = new Date(2026, 4, 29, 9, 7, 3); // 2026-05-29 09:07:03 local
    expect(buildCsvFilename('endpoint-inventory', fixed)).toBe(
      'endpoint-inventory-20260529-090703.csv',
    );
  });

  it('sanitises unsafe characters in the base slug', () => {
    const fixed = new Date(2026, 0, 1, 0, 0, 0);
    expect(buildCsvFilename('cihaz envanteri/v1', fixed)).toBe(
      'cihaz-envanteri-v1-20260101-000000.csv',
    );
  });
});

describe('triggerCsvDownload — browser download smoke', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates an object URL, clicks a hidden anchor with the download filename, and revokes the URL', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.useFakeTimers();

    const ok = triggerCsvDownload('a,b\r\n1,2', 'sample.csv');

    expect(ok).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    // The blob handed to createObjectURL carries the CSV mime type.
    const firstCreateCall = createSpy.mock.calls[0];
    expect(firstCreateCall).toBeDefined();
    const blobArg = firstCreateCall![0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toContain('text/csv');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Revoke + DOM cleanup are deferred to a macrotask.
    vi.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelector('a[download="sample.csv"]')).toBeNull();
    vi.useRealTimers();
  });

  it('returns false (no crash) when the download APIs are unavailable', () => {
    const original = URL.createObjectURL;
    // Simulate an environment without Blob URL support by replacing the
    // API with a non-function value (the guard checks `typeof ... !==
    // 'function'`). jsdom + undici keep the prop non-configurable, so a
    // `delete` is a no-op here — overwrite instead.
    // @ts-expect-error — deliberately overriding for the guard test.
    URL.createObjectURL = undefined;
    try {
      expect(triggerCsvDownload('x', 'x.csv')).toBe(false);
    } finally {
      URL.createObjectURL = original;
    }
  });
});
