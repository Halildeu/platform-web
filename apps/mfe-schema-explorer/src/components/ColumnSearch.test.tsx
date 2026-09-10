import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const search = vi.hoisted(() => ({ useColumnSearch: vi.fn() }));
vi.mock('../hooks/useSchemaData', () => ({ useColumnSearch: search.useColumnSearch }));

import { ColumnSearch } from './ColumnSearch';

/** gitops#3631 — a search hit shows the source's label next to the type when the source has one. */
describe('ColumnSearch — IFS labels', () => {
  it('shows the label on entries that carry one and nothing on entries that do not', () => {
    search.useColumnSearch.mockReturnValue({
      isLoading: false,
      data: {
        totalMatches: 2,
        results: [{
          column: 'COMPANY',
          tableCount: 2,
          tables: [
            { table: 'TRYPE_ALL_VOUCHER_QRY', column: 'COMPANY', type: 'VARCHAR2', pk: true, label: 'Company' },
            { table: 'ACCOUNTING_PROJECT', column: 'COMPANY', type: 'VARCHAR2', pk: false },
          ],
        }],
      },
    });
    render(<ColumnSearch onTableSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search columns/), { target: { value: 'COMPANY' } });

    const labels = screen.getAllByTestId('se-search-label');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveTextContent('Company');
    expect(screen.getAllByText('PK')).toHaveLength(1);
  });
});
