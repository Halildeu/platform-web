import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchCompanies: vi.fn(),
  fetchProjects: vi.fn(),
  selectReportingCompany: vi.fn(),
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
    fetchCompanies: apiMocks.fetchCompanies,
    fetchProjects: apiMocks.fetchProjects,
  };
});

vi.mock('../../components/CompanyPicker', () => ({
  selectReportingCompany: apiMocks.selectReportingCompany,
}));

import BudgetWorkspace from './BudgetWorkspace';
import { BudgetApiError } from './api';

const companies = [{ id: 35, nickname: 'SER', name: 'Serban İnşaat' }];
const projects = [
  {
    id: 91,
    code: 'IL05',
    name: 'Equinix IL05.1 Istanbul Data Centre',
    companyId: 35,
    active: true,
  },
];

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
};

const renderWorkspace = () =>
  render(
    <MemoryRouter initialEntries={['/admin/reports/budget-control']}>
      <Routes>
        <Route path="/admin/reports/budget-control" element={<BudgetWorkspace />} />
        <Route
          path="/admin/reports/fin-proje-muhasebe-gercekleseni"
          element={<LocationProbe />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe('BudgetWorkspace project actuals launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchCompanies.mockResolvedValue(companies);
    apiMocks.fetchProjects.mockResolvedValue(projects);
  });

  it('shows names instead of asking the user for a company number', async () => {
    renderWorkspace();
    expect(await screen.findByRole('option', { name: 'SER — Serban İnşaat' })).toBeInTheDocument();
    expect(screen.getByText(/bütçe kimliği projedir/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yeni taslak oluştur' })).not.toBeInTheDocument();
  });

  it('opens the existing AG Grid report with exact company, project and date filters', async () => {
    renderWorkspace();
    fireEvent.change(await screen.findByLabelText('Şirket adı'), {
      target: { value: '35' },
    });
    expect(
      await screen.findByRole('option', {
        name: 'IL05 — Equinix IL05.1 Istanbul Data Centre',
      }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Proje'), { target: { value: '91' } });
    fireEvent.change(screen.getByLabelText('Başlangıç tarihi'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByLabelText('Bitiş tarihi'), {
      target: { value: '2026-07-27' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AG Grid detayını aç' }));

    expect(apiMocks.selectReportingCompany).toHaveBeenCalledWith('35');
    const location = await screen.findByTestId('location');
    expect(location).toHaveTextContent(
      '/admin/reports/fin-proje-muhasebe-gercekleseni?projectId=91&dateFrom=2026-02-01&dateTo=2026-07-27',
    );
  });

  it('fails closed when the authorized company catalog is unavailable', async () => {
    apiMocks.fetchCompanies.mockRejectedValue(
      new BudgetApiError('FORBIDDEN', 'Şirket kataloğu için yetkiniz bulunmuyor.'),
    );
    renderWorkspace();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Veri gösterilemedi.');
    expect(alert).toHaveTextContent('Şirket kataloğu için yetkiniz bulunmuyor.');
  });

  it('returns to the reporting hub', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/reports/budget-control']}>
        <Routes>
          <Route path="/admin/reports/budget-control" element={<BudgetWorkspace />} />
          <Route path="/admin/reports" element={<p>Rapor merkezi</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(apiMocks.fetchCompanies).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '← Raporlar' }));
    expect(screen.getByText('Rapor merkezi')).toBeInTheDocument();
  });
});
