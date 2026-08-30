import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchPypActuals: vi.fn(),
  fetchCurrentPlan: vi.fn(),
}));

vi.mock('./api', () => {
  class MockBudgetApiError extends Error {
    constructor(
      readonly kind: string,
      message: string,
    ) {
      super(message);
      this.name = 'BudgetApiError';
    }
  }
  return {
    BudgetApiError: MockBudgetApiError,
    fetchPypActuals: apiMocks.fetchPypActuals,
    fetchCurrentPlan: apiMocks.fetchCurrentPlan,
  };
});

import PypBreakdownSection, { buildBreakdown, buildComparison } from './PypBreakdownSection';
import { BudgetApiError } from './api';
import type { BudgetPlanView, PypActualRow } from './types';

const row = (overrides: Partial<PypActualRow>): PypActualRow => ({
  sourceSystem: 'WORKCUBE',
  sourceLedgerYear: 2026,
  sourceCompanyId: 1,
  journalCardId: 9001,
  journalRowId: 70001,
  actionDate: '2026-03-15',
  accountCode: '740.01.001',
  debitCredit: 'DEBIT',
  signedAmount: 1500,
  currency: 'TRY',
  actionType: 56,
  actionId: 4001,
  documentType: 'INVOICE',
  documentNo: 'FTR-17',
  cancelled: false,
  dimensionSource: 'INVOICE_UNIFORM',
  expenseCenterId: 12,
  expenseCenterCode: 'PYP.01.02',
  expenseCenterName: 'Kaba İşler',
  expenseCenterHierarchy: '001.002',
  expenseItemId: 77,
  expenseItemName: 'Kalıp İşçiliği',
  expenseCategoryId: 5,
  projectId: 44200,
  invoiceId: 4001,
  invoiceRowId: null,
  orderId: 3501,
  progressId: null,
  contractId: null,
  rowHash: 'h',
  ...overrides,
});

describe('buildBreakdown — muavin omurgası toplama kuralları', () => {
  it('toplar yalnız borç tarafını; alacak bacağı toplamı sıfırlayamaz', () => {
    const breakdown = buildBreakdown(
      [
        row({}),
        row({ journalRowId: 70002, debitCredit: 'CREDIT', signedAmount: -1500 }),
      ],
      false,
    );
    expect(breakdown.labeledTotal).toBe(1500);
    expect(breakdown.centers).toHaveLength(1);
    expect(breakdown.centers[0].name).toBe('Kaba İşler');
    expect(breakdown.centers[0].items[0].name).toBe('Kalıp İşçiliği');
  });

  it('karışık belgeleri saymaz ama ayrı raporlar; boyutsuzlar da ayrı', () => {
    const breakdown = buildBreakdown(
      [
        row({}),
        row({
          journalRowId: 70003,
          dimensionSource: 'INVOICE_MIXED',
          expenseItemId: null,
          expenseItemName: null,
        }),
        row({
          journalRowId: 70004,
          dimensionSource: 'NONE',
          documentType: 'BANK',
          expenseItemId: null,
          expenseItemName: null,
        }),
      ],
      false,
    );
    expect(breakdown.labeledRows).toBe(1);
    expect(breakdown.mixedRows).toBe(1);
    expect(breakdown.undimensionedRows).toBe(1);
  });

  it('merkezleri ve kalemleri tutara göre büyükten küçüğe sıralar', () => {
    const breakdown = buildBreakdown(
      [
        row({ signedAmount: 100 }),
        row({
          journalRowId: 70005,
          expenseCenterName: 'İnce İşler',
          expenseItemName: 'Boya',
          signedAmount: 900,
        }),
      ],
      false,
    );
    expect(breakdown.centers.map((c) => c.name)).toEqual(['İnce İşler', 'Kaba İşler']);
  });
});

const plan: BudgetPlanView = {
  planId: 'plan-1',
  versionId: 'version-1',
  companyId: 1,
  fiscalYear: 2026,
  baseCurrency: 'TRY',
  versionNo: 2,
  status: 'SUBMITTED',
  submittedBy: null,
  approvedBy: null,
  lines: [
    {
      id: 'l1', period: '2026-01', accountCode: '740.01.001', costCenterCode: null,
      projectCode: null, departmentCode: null, branchCode: null,
      direction: 'EXPENSE', plannedAmount: 2000, currency: 'TRY', description: null,
    },
    {
      id: 'l2', period: '2026-01', accountCode: '600.01.001', costCenterCode: null,
      projectCode: null, departmentCode: null, branchCode: null,
      direction: 'INCOME', plannedAmount: 999, currency: 'TRY', description: null,
    },
  ],
};

describe('buildComparison — hesap kodu anahtarı', () => {
  it('plan gider satırlarını kodla eşler, geliri dışarıda tutar, farkı işaretler', () => {
    const comparison = buildComparison(plan, [
      row({ signedAmount: 1500 }),
      row({ journalRowId: 70002, signedAmount: 900, accountCode: '740.01.001' }),
      row({ journalRowId: 70003, accountCode: '600.01.001', signedAmount: 5000 }),
    ]);
    expect(comparison.rows).toHaveLength(1);
    expect(comparison.rows[0]).toEqual({
      accountCode: '740.01.001',
      planned: 2000,
      actual: 2400,
      variance: 400,
    });
    expect(comparison.plannedTotal).toBe(2000);
    expect(comparison.actualOnPlanned).toBe(2400);
  });

  it('etiketsiz (dims null) borç kayıtları da kod anahtarıyla sayılır', () => {
    const comparison = buildComparison(plan, [
      row({
        dimensionSource: 'NONE',
        expenseItemId: null,
        expenseItemName: null,
        signedAmount: 700,
      }),
    ]);
    expect(comparison.rows[0].actual).toBe(700);
  });
});

describe('PypBreakdownSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchCurrentPlan.mockRejectedValue(
      new BudgetApiError('NOT_FOUND', 'Plan yok.'),
    );
  });

  it('şirket seçilmeden kırılım getirilemez', () => {
    render(<PypBreakdownSection companyId="" />);
    expect(screen.getByRole('button', { name: 'Kırılımı getir' })).toBeDisabled();
  });

  it('sayfaları cursor ile tüketir ve drill-down ağacını kurar', async () => {
    apiMocks.fetchPypActuals
      .mockResolvedValueOnce({
        rows: [row({}), row({ journalRowId: 70010, orderId: null, documentNo: 'FTR-18' })],
        nextCursor: 'c1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        rows: [
          row({
            journalRowId: 70011,
            expenseCenterName: 'İnce İşler',
            expenseItemName: 'Boya',
            signedAmount: 250,
            dimensionSource: 'EXPENSE_UNIFORM',
            documentType: 'EXPENSE',
            documentNo: 'MSR-9',
          }),
        ],
        nextCursor: null,
        hasMore: false,
      });

    render(<PypBreakdownSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Kırılımı getir' }));

    await waitFor(() => expect(apiMocks.fetchPypActuals).toHaveBeenCalledTimes(2));
    expect(apiMocks.fetchPypActuals).toHaveBeenNthCalledWith(1, 1, expect.any(Number), null);
    expect(apiMocks.fetchPypActuals).toHaveBeenNthCalledWith(2, 1, expect.any(Number), 'c1');

    expect(await screen.findByText('Kaba İşler')).toBeInTheDocument();
    expect(screen.getByText('İnce İşler')).toBeInTheDocument();

    // merkez -> kalem -> kaynak kayıt seviyeleri açılır
    fireEvent.click(screen.getByText('Kaba İşler'));
    fireEvent.click(screen.getByText('Kalıp İşçiliği'));
    expect(screen.getByText('FTR-17')).toBeInTheDocument();
    expect(screen.getByText('fiş 9001/70001 · sip 3501')).toBeInTheDocument();
    expect(apiMocks.fetchCurrentPlan).toHaveBeenCalledWith(1, expect.any(Number));
    expect(
      screen.getByText(/içe aktarılmış bir bütçe planı yok/i),
    ).toBeInTheDocument();
  });

  it('plan varsa hesap-kodu karşılaştırma tablosunu gösterir', async () => {
    apiMocks.fetchPypActuals.mockResolvedValueOnce({
      rows: [row({ signedAmount: 2400 })],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.fetchCurrentPlan.mockResolvedValue(plan);

    render(<PypBreakdownSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Kırılımı getir' }));

    expect(
      await screen.findByText('Plan ↔ Gerçekleşen (hesap kodu anahtarıyla)'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('740.01.001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Plan sürüm 2/)).toBeInTheDocument();
  });

  it('yetki hatasında fail-closed mesaj gösterir', async () => {
    apiMocks.fetchPypActuals.mockRejectedValue(
      new BudgetApiError('FORBIDDEN', 'Bu şirket için veri görme yetkiniz bulunmuyor.'),
    );
    render(<PypBreakdownSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Kırılımı getir' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu şirket için veri görme yetkiniz bulunmuyor.');
  });
});
