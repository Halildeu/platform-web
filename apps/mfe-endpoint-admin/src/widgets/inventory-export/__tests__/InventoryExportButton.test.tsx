// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InventoryExportButton } from '../InventoryExportButton';
import type { CsvColumn } from '../../../lib/csv-export';

/** Explicitly-typed download spy so `mock.calls[i]` keeps its arg tuple. */
const mockDownload = () => vi.fn<(content: string, filename: string) => boolean>(() => true);

/**
 * WEB-015 v1 — RBAC-gated export button tests.
 *
 * Covers: RBAC hide on `!canView`, disabled-on-empty, the click →
 * download side-effect with the serialised CSV content, and the
 * large-row-cap truncation notice.
 */

interface Row {
  hostname: string;
  formula: string;
}

const COLUMNS: CsvColumn<Row>[] = [
  { key: 'hostname', header: 'Hostname', value: (r) => r.hostname },
  { key: 'formula', header: 'Note', value: (r) => r.formula },
];

const ROWS: Row[] = [
  { hostname: 'ws-1', formula: '=DANGER()' },
  { hostname: 'ws-2', formula: 'safe, value' },
];

describe('InventoryExportButton — RBAC gating', () => {
  it('renders nothing when canView is false (hidden, not just disabled)', () => {
    const { container } = render(
      <InventoryExportButton<Row>
        canView={false}
        rows={ROWS}
        columns={COLUMNS}
        fileBaseName="inv"
        onDownload={vi.fn(() => true)}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('inventory-export-button')).not.toBeInTheDocument();
  });

  it('renders the button when canView is true', () => {
    render(
      <InventoryExportButton<Row>
        canView
        rows={ROWS}
        columns={COLUMNS}
        fileBaseName="inv"
        onDownload={vi.fn(() => true)}
      />,
    );
    expect(screen.getByTestId('inventory-export-button')).toBeEnabled();
  });
});

describe('InventoryExportButton — empty state', () => {
  it('disables the button when there are no rows to export', () => {
    const onDownload = vi.fn(() => true);
    render(
      <InventoryExportButton<Row>
        canView
        rows={[]}
        columns={COLUMNS}
        fileBaseName="inv"
        onDownload={onDownload}
      />,
    );
    const btn = screen.getByTestId('inventory-export-button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onDownload).not.toHaveBeenCalled();
  });
});

describe('InventoryExportButton — export click', () => {
  it('serialises rows to CSV and invokes the download with a timestamped filename', () => {
    const onDownload = mockDownload();
    render(
      <InventoryExportButton<Row>
        canView
        rows={ROWS}
        columns={COLUMNS}
        fileBaseName="endpoint-inventory"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByTestId('inventory-export-button'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    const firstCall = onDownload.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [content, filename] = firstCall!;

    // Filename: <base>-YYYYMMDD-HHmmss.csv
    expect(filename).toMatch(/^endpoint-inventory-\d{8}-\d{6}\.csv$/);

    // Header row present.
    expect(content).toContain('Hostname,Note');
    // Formula-injection payload guarded (leading single quote).
    expect(content).toContain("'=DANGER()");
    // Comma-bearing value quoted as a single field.
    expect(content).toContain('"safe, value"');
    // Safe hostname passes through.
    expect(content).toContain('ws-1');
  });

  it('does NOT show a truncation notice when rows are within the cap', () => {
    render(
      <InventoryExportButton<Row>
        canView
        rows={ROWS}
        columns={COLUMNS}
        fileBaseName="inv"
        rowCap={10}
        onDownload={vi.fn(() => true)}
      />,
    );
    fireEvent.click(screen.getByTestId('inventory-export-button'));
    expect(screen.queryByTestId('inventory-export-truncation-notice')).not.toBeInTheDocument();
  });
});

describe('InventoryExportButton — large-row cap notice', () => {
  it('surfaces a truncation notice reporting written/total rows when the cap is exceeded', () => {
    const manyRows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      hostname: `ws-${i}`,
      formula: 'x',
    }));
    const onDownload = mockDownload();
    render(
      <InventoryExportButton<Row>
        canView
        rows={manyRows}
        columns={COLUMNS}
        fileBaseName="inv"
        rowCap={2}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByTestId('inventory-export-button'));

    const notice = screen.getByTestId('inventory-export-truncation-notice');
    expect(notice).toBeInTheDocument();
    // tr-TR default dict: "İlk 2 / 5 satır dışa aktarıldı (üst sınır 2)."
    expect(notice.textContent).toContain('2');
    expect(notice.textContent).toContain('5');

    // The downloaded content is capped to the first 2 data rows.
    const capCall = onDownload.mock.calls[0];
    expect(capCall).toBeDefined();
    const content = capCall![0];
    const lines = content.split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});
