import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetControlSummary, BudgetPlanView } from './types';

const apiMocks = vi.hoisted(() => ({
  createBudget: vi.fn(),
  fetchBudgetControl: vi.fn(),
  fetchBudget: vi.fn(),
  replaceBudgetLines: vi.fn(),
  submitBudget: vi.fn(),
  approveBudget: vi.fn(),
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
    ...apiMocks,
  };
});

import BudgetWorkspace from './BudgetWorkspace';
import { BudgetApiError } from './api';

const plan: BudgetPlanView = {
  planId: '11111111-1111-1111-1111-111111111111',
  versionId: '22222222-2222-2222-2222-222222222222',
  companyId: 35,
  fiscalYear: 2026,
  baseCurrency: 'TRY',
  versionNo: 1,
  status: 'DRAFT',
  submittedBy: null,
  approvedBy: null,
  lines: [],
};

const control: BudgetControlSummary = {
  planId: plan.planId,
  versionId: plan.versionId,
  companyId: 35,
  fiscalYear: 2026,
  currency: 'TRY',
  versionStatus: 'DRAFT',
  plan: 0,
  accountingActual: 1250,
  allocatedActual: 1000,
  unallocatedActual: 250,
  unresolvedActual: 100,
  commitment: 200,
  remaining: -1450,
  etc: null,
  eac: null,
  variance: null,
  forecastStatus: 'NOT_LOADED',
  actualDefinition: 'All accounting actual',
  remainingDefinition: 'Plan - actual - commitment',
};

const renderWorkspace = () =>
  render(
    <MemoryRouter>
      <BudgetWorkspace />
    </MemoryRouter>,
  );

const renderWorkspaceAtAdminRoute = () =>
  render(
    <MemoryRouter initialEntries={['/admin/reports/budget-control']}>
      <Routes>
        <Route path="/admin/reports/budget-control" element={<BudgetWorkspace />} />
        <Route path="/admin/reports" element={<p>Rapor merkezi</p>} />
        <Route path="/admin" element={<p>Admin kökü</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('BudgetWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    apiMocks.createBudget.mockResolvedValue(plan);
    apiMocks.fetchBudgetControl.mockResolvedValue(control);
  });

  it('starts empty and does not claim live data before a budget is selected', () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Henüz bütçe seçilmedi' })).toBeInTheDocument();
    expect(apiMocks.createBudget).not.toHaveBeenCalled();
    expect(apiMocks.fetchBudgetControl).not.toHaveBeenCalled();
  });

  it('creates company 35 draft and renders conservative control definitions', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Yeni taslak oluştur' }));

    await waitFor(() => expect(apiMocks.createBudget).toHaveBeenCalled());
    expect(apiMocks.createBudget).toHaveBeenCalledWith(35, expect.any(Number), 'TRY');
    expect(await screen.findByText('Taslak PostgreSQL üzerinde oluşturuldu. Satırları düzenleyebilirsiniz.')).toBeInTheDocument();
    expect(screen.getByText('Muhasebe fiilisi')).toBeInTheDocument();
    expect(screen.getByText('Tahsissiz fiili')).toBeInTheDocument();
    expect(screen.getAllByText('Tahmin yüklenmedi')).toHaveLength(3);
    expect(screen.getByText(/Eşleşmeyen kayıtlar fiili harcamadan düşülmez/)).toBeInTheDocument();
  });

  it('shows an accessible fail-closed authorization state', async () => {
    apiMocks.createBudget.mockRejectedValue(
      new BudgetApiError('FORBIDDEN', 'Bu şirket için yetkiniz bulunmuyor.'),
    );
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Yeni taslak oluştur' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('İşlem uygulanmadı.');
    expect(alert).toHaveTextContent('Bu şirket için yetkiniz bulunmuyor.');
    expect(screen.getByRole('heading', { name: 'Henüz bütçe seçilmedi' })).toBeInTheDocument();
  });

  it('returns to the reporting hub without leaving the reporting route', () => {
    renderWorkspaceAtAdminRoute();

    fireEvent.click(screen.getByRole('button', { name: '← Raporlar' }));

    expect(screen.getByText('Rapor merkezi')).toBeInTheDocument();
    expect(screen.queryByText('Admin kökü')).not.toBeInTheDocument();
  });

  it('shows submit, different-user approval and immutable approved state', async () => {
    const line = {
      id: '33333333-3333-3333-3333-333333333333',
      period: '2026-01',
      accountCode: '740',
      costCenterCode: 'HQ',
      projectCode: '',
      departmentCode: '',
      branchCode: '',
      direction: 'EXPENSE' as const,
      plannedAmount: 1000,
      currency: 'TRY',
      description: 'Operasyon',
    };
    const draftWithLine = { ...plan, lines: [line] };
    const submitted = {
      ...draftWithLine,
      status: 'SUBMITTED' as const,
      submittedBy: 'planner',
    };
    const approved = {
      ...submitted,
      status: 'APPROVED' as const,
      approvedBy: 'controller',
    };
    apiMocks.createBudget.mockResolvedValue(draftWithLine);
    apiMocks.submitBudget.mockResolvedValue(submitted);
    apiMocks.approveBudget.mockResolvedValue(approved);
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Yeni taslak oluştur' }));
    await screen.findByRole('button', { name: 'Onaya gönder' });

    fireEvent.click(screen.getByRole('button', { name: 'Onaya gönder' }));
    expect(await screen.findByText('Onay bekliyor')).toBeInTheDocument();
    expect(screen.getByText(/Gönderen kullanıcı aynı bütçeyi onaylayamaz/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Farklı yetkili olarak onayla' }));
    expect(await screen.findByText('Onaylı · değiştirilemez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Satırları kaydet' })).not.toBeInTheDocument();
  });

  it('renders a conflict without claiming that the write was applied', async () => {
    apiMocks.createBudget.mockRejectedValue(
      new BudgetApiError('CONFLICT', 'Bu şirket ve yıl için bütçe zaten var.'),
    );
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Yeni taslak oluştur' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('İşlem uygulanmadı.');
    expect(alert).toHaveTextContent('Bu şirket ve yıl için bütçe zaten var.');
  });
});
