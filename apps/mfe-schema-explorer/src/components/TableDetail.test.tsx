import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableDetail } from './TableDetail';
import type { SchemaSnapshot } from '../api/schemaApi';

/**
 * gitops#3631 — what the IFS dictionary says about a column reaches the handler:
 * the PROMPT label under the name, the raw comment as the cell's tooltip, the
 * object's own description under the title, and the FLAGS-derived key mark.
 */
const snapshot = (columns: SchemaSnapshot['tables'][string]['columns'], comment?: string | null): SchemaSnapshot => ({
  version: '1.1',
  metadata: {
    dbType: 'oracle', host: '', database: '', schema: 'IFSAPP',
    extractedAt: '', tableCount: 1, columnCount: columns.length, relationshipCount: 0, domainCount: 0,
  },
  tables: { TRYPE_ALL_VOUCHER_QRY: { name: 'TRYPE_ALL_VOUCHER_QRY', schema: 'IFSAPP', columns, rowCount: null, columnCount: columns.length, comment } },
  relationships: [],
  domains: {},
  analysis: { deadTables: [], hubTables: [] },
} as unknown as SchemaSnapshot);

const column = (over: Partial<SchemaSnapshot['tables'][string]['columns'][number]> & { name: string }) => ({
  dataType: 'VARCHAR2', maxLength: 20, nullable: false, identity: false, pk: false, ordinal: 1, ...over,
});

describe('TableDetail — IFS labels and comments', () => {
  it('renders the PROMPT label under the column name, the raw comment as tooltip, and the object comment', () => {
    render(
      <TableDetail
        snapshot={snapshot(
          [column({ name: 'COMPANY', pk: true, label: 'Company', comment: 'FLAGS=PMI--^DATATYPE=STRING(20)/UPPERCASE^PROMPT=Company^' })],
          'Voucher rows across all voucher types',
        )}
        tableName="TRYPE_ALL_VOUCHER_QRY"
        onClose={vi.fn()}
        onFkClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('se-col-label')).toHaveTextContent('Company');
    expect(screen.getByText(/COMPANY/, { selector: 'td' })).toHaveAttribute('title', expect.stringContaining('FLAGS=PMI--'));
    expect(screen.getByText(/COMPANY/, { selector: 'td' })).toHaveClass('se-col--pk');
    expect(screen.getByTestId('se-table-comment')).toHaveTextContent('Voucher rows across all voucher types');
  });

  it('a source without labels or comments renders exactly as before — nothing invented', () => {
    render(
      <TableDetail
        snapshot={snapshot([column({ name: 'INVOICE_ID' })])}
        tableName="TRYPE_ALL_VOUCHER_QRY"
        onClose={vi.fn()}
        onFkClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('se-col-label')).toBeNull();
    expect(screen.queryByTestId('se-table-comment')).toBeNull();
    expect(screen.getByText('INVOICE_ID', { selector: 'td' })).not.toHaveAttribute('title');
  });
});
