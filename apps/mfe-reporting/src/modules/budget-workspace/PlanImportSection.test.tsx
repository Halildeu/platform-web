import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  importWorkcubePlan: vi.fn(),
  fetchPlanVersion: vi.fn(),
  submitPlanVersion: vi.fn(),
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
    importWorkcubePlan: apiMocks.importWorkcubePlan,
    fetchPlanVersion: apiMocks.fetchPlanVersion,
    submitPlanVersion: apiMocks.submitPlanVersion,
  };
});

import PlanImportSection from './PlanImportSection';
import { BudgetApiError } from './api';

const currentYear = new Date().getFullYear();

const completedResult = {
  batchId: 'batch-1',
  planId: 'plan-1',
  versionId: 'version-1',
  status: 'COMPLETED',
  fetchedRows: 16,
  importedLines: 15,
  mergedRows: 1,
  splitRows: 0,
  scenarioRows: 15,
  skippedRows: 0,
  skipSample: [],
  failureCode: null,
  startedAt: '2026-08-18T10:00:00Z',
  finishedAt: '2026-08-18T10:00:05Z',
};

const draftView = (status: string) => ({
  planId: 'plan-1',
  versionId: 'version-1',
  companyId: 1,
  fiscalYear: 2026,
  baseCurrency: 'TRY',
  versionNo: 1,
  status,
  submittedBy: null,
  approvedBy: null,
  lines: [
    {
      id: 'line-1',
      period: '2026-01',
      accountCode: '740.01',
      costCenterCode: '12',
      projectCode: null,
      departmentCode: '5',
      branchCode: null,
      direction: 'EXPENSE',
      plannedAmount: 1500,
      currency: 'TRY',
      description: 'Bakım bütçesi',
    },
  ],
});

describe('PlanImportSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a company before the import can start', () => {
    render(<PlanImportSection companyId="" />);
    expect(screen.getByRole('button', { name: 'Planı içe aktar' })).toBeDisabled();
    expect(screen.getByText(/önce yukarıdan şirket seçin/i)).toBeInTheDocument();
  });

  it('imports with the explicit scenario opt-in and shows the resulting draft', async () => {
    apiMocks.importWorkcubePlan.mockResolvedValue(completedResult);
    apiMocks.fetchPlanVersion.mockResolvedValue(draftView('DRAFT'));

    render(<PlanImportSection companyId="1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /senaryo planlarını da al/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Planı içe aktar' }));

    await waitFor(() =>
      expect(apiMocks.importWorkcubePlan).toHaveBeenCalledWith(1, currentYear, true),
    );
    expect(apiMocks.fetchPlanVersion).toHaveBeenCalledWith(1, 'plan-1', 'version-1');

    expect(await screen.findByRole('status')).toHaveTextContent(
      '16 kaynak satırı okundu, 15 taslak satırı üretildi, 1 satır birleşti, 0 satır atlandı, 15 senaryo satırı.',
    );
    expect(screen.getByText('2026 bütçe taslağı · sürüm 1')).toBeInTheDocument();
    expect(screen.getByText('740.01')).toBeInTheDocument();
    expect(screen.getByText('Taslak')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Taslağı onaya gönder' })).toBeEnabled();
  });

  it('submits the draft and reflects the SUBMITTED state without a second submit button', async () => {
    apiMocks.importWorkcubePlan.mockResolvedValue(completedResult);
    apiMocks.fetchPlanVersion.mockResolvedValue(draftView('DRAFT'));
    apiMocks.submitPlanVersion.mockResolvedValue(draftView('SUBMITTED'));

    render(<PlanImportSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Planı içe aktar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Taslağı onaya gönder' }));

    await waitFor(() =>
      expect(apiMocks.submitPlanVersion).toHaveBeenCalledWith(1, 'plan-1', 'version-1'),
    );
    expect(await screen.findByText('Onaya gönderildi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Taslağı onaya gönder' })).not.toBeInTheDocument();
  });

  it('maps a blocked import to its provider failure message', async () => {
    apiMocks.importWorkcubePlan.mockResolvedValue({
      ...completedResult,
      planId: null,
      versionId: null,
      status: 'BLOCKED',
      failureCode: 'PROVIDER_SCOPE_DENIED',
      fetchedRows: 0,
      importedLines: 0,
      mergedRows: 0,
      scenarioRows: 0,
    });

    render(<PlanImportSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Planı içe aktar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ERP bütçe planı kaynağını okuma yetkisi reddedildi.');
    expect(apiMocks.fetchPlanVersion).not.toHaveBeenCalled();
  });

  it('fails closed on an authorization error from the import call', async () => {
    apiMocks.importWorkcubePlan.mockRejectedValue(
      new BudgetApiError('FORBIDDEN', 'Bütçe planlama yetkiniz bulunmuyor.'),
    );

    render(<PlanImportSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Planı içe aktar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bütçe planlama yetkiniz bulunmuyor.');
  });

  it('lists skip samples with a readable reason', async () => {
    apiMocks.importWorkcubePlan.mockResolvedValue({
      ...completedResult,
      skippedRows: 1,
      skipSample: [
        {
          sourceBudgetPlanRowId: 41,
          sourceBudgetPlanId: 17,
          reason: 'MISSING_ACCOUNT_CODE',
          detail: null,
        },
      ],
    });
    apiMocks.fetchPlanVersion.mockResolvedValue(draftView('DRAFT'));

    render(<PlanImportSection companyId="1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Planı içe aktar' }));

    expect(await screen.findByText(/Plan 17 \/ satır 41 — Hesap kodu boş/)).toBeInTheDocument();
  });
});
