import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createProjectBinding: vi.fn(),
  fetchCompanies: vi.fn(),
  fetchProjectActualRows: vi.fn(),
  fetchProjectActualSummary: vi.fn(),
  fetchProjects: vi.fn(),
  findProjectBinding: vi.fn(),
  syncProjectActuals: vi.fn(),
  selectReportingCompany: vi.fn(),
}));

const gridMocks = vi.hoisted(() => ({
  buildColDefs: vi.fn((meta: unknown[]) => meta),
  buildProcessCellCallback: vi.fn(() => () => ''),
  latestEntityGridProps: null as Record<string, unknown> | null,
}));
const budgetLogin = vi.fn(() => Promise.resolve());

vi.mock('@mfe/design-system/advanced/data-grid', () => ({
  buildColDefs: gridMocks.buildColDefs,
  buildProcessCellCallback: gridMocks.buildProcessCellCallback,
}));

vi.mock('../../grid', () => ({
  EntityGridTemplate: ({
    rowData,
    exportLeadingExtras,
    onRowDoubleClick,
    ...props
  }: {
    rowData: Array<Record<string, unknown>>;
    exportLeadingExtras?: React.ReactNode;
    onRowDoubleClick?: (row: Record<string, unknown>) => void;
    [key: string]: unknown;
  }) => {
    gridMocks.latestEntityGridProps = {
      ...props,
      rowData,
      exportLeadingExtras,
      onRowDoubleClick,
    };
    return (
      <div data-testid="actuals-grid">
        {exportLeadingExtras}
        {rowData.map((row) => (
          <button
            key={String(row.id)}
            type="button"
            aria-label={`Kaynak izini aç ${String(row.id)}`}
            onDoubleClick={() => onRowDoubleClick?.(row)}
          >
            {String(row.accountCode)} · {String(row.documentType)} · {String(row.documentNo)}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('@mfe/design-system', () => ({
  Descriptions: ({
    title,
    description,
    items,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    items: Array<{ key: string; label: React.ReactNode; value?: React.ReactNode }>;
  }) => (
    <section>
      {title ? <h3>{title}</h3> : null}
      {description ? <p>{description}</p> : null}
      <dl>
        {items.map((item) => (
          <React.Fragment key={item.key}>
            <dt>{item.label}</dt>
            <dd>{item.value ?? '—'}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  ),
  DetailDrawer: ({
    open,
    title,
    subtitle,
    children,
    footer,
  }: {
    open: boolean;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <aside role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
        {children}
        {footer}
      </aside>
    ) : null,
}));

vi.mock('@mfe/design-system/advanced/data-grid/setup', () => ({}));

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
    createProjectBinding: apiMocks.createProjectBinding,
    fetchCompanies: apiMocks.fetchCompanies,
    fetchProjectActualRows: apiMocks.fetchProjectActualRows,
    fetchProjectActualSummary: apiMocks.fetchProjectActualSummary,
    fetchProjects: apiMocks.fetchProjects,
    findProjectBinding: apiMocks.findProjectBinding,
    syncProjectActuals: apiMocks.syncProjectActuals,
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
    id: 44200,
    code: 'IDC1',
    name: 'Red Haven İzmir Data Center - 1. Modül Yapım İşi',
    companyId: 35,
    active: true,
  },
];
const binding = {
  id: 'binding-idc1',
  companyId: 35,
  platformProjectRef: 'workcube:35:44200',
  sourceSystem: 'WORKCUBE',
  externalCompanyNo: 35,
  externalProjectId: 44200,
  externalProjectCode: 'IDC1',
  verifiedAt: '2026-07-28T03:00:00+03:00',
};
const summary = {
  projectBindingId: binding.id,
  from: '2026-01-01',
  to: '2026-07-28',
  currency: 'TRY',
  accountingActual: 2450,
  classifiedCost: 900,
  excludedAmount: 1500,
  requiresReviewAmount: 50,
  rowCount: 5,
  snapshotRowCount: 5,
  requiresReviewCount: 1,
  reconciliationStatus: 'MATCHED',
  reconciliationDifference: 0,
  lastSyncAt: '2026-07-28T03:00:00+03:00',
};
const rows = [
  {
    id: 'row-1',
    postingDate: '2026-06-15',
    accountCode: '740.01',
    debitCredit: 'DEBIT',
    accountingAmount: 1000,
    classifiedCostAmount: 1000,
    currency: 'TRY',
    costTreatment: 'INCLUDE_COST',
    costRuleVersion: 1,
    documentType: 'INVOICE',
    documentNo: 'INV-2026-1',
    resolutionStatus: 'EXACT_LINE',
    cancelled: false,
    journalCardId: 10,
    journalRowId: 11,
    actionType: 56,
    actionId: 100,
    sourceLedgerYear: 2026,
    syncedAt: '2026-07-28T03:00:00+03:00',
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
        <Route path="/admin/reports/fin-proje-muhasebe-gercekleseni" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

const chooseIdc1 = async () => {
  fireEvent.change(await screen.findByLabelText('Şirket adı'), {
    target: { value: '35' },
  });
  expect(
    await screen.findByRole('option', {
      name: 'IDC1 — Red Haven İzmir Data Center - 1. Modül Yapım İşi',
    }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Proje'), { target: { value: '44200' } });
  fireEvent.change(screen.getByLabelText('Başlangıç tarihi'), {
    target: { value: '2026-01-01' },
  });
  fireEvent.change(screen.getByLabelText('Bitiş tarihi'), {
    target: { value: '2026-07-28' },
  });
};

describe('BudgetWorkspace project actuals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gridMocks.latestEntityGridProps = null;
    (
      window as typeof window & {
        __startKeycloakLogin?: (options: { redirectUri: string }) => Promise<void>;
      }
    ).__startKeycloakLogin = budgetLogin;
    apiMocks.fetchCompanies.mockResolvedValue(companies);
    apiMocks.fetchProjects.mockResolvedValue(projects);
    apiMocks.findProjectBinding.mockResolvedValue(binding);
    apiMocks.createProjectBinding.mockResolvedValue(binding);
    apiMocks.fetchProjectActualSummary.mockResolvedValue(summary);
    apiMocks.fetchProjectActualRows.mockResolvedValue(rows);
    apiMocks.syncProjectActuals.mockResolvedValue({
      batchId: 'batch-1',
      status: 'MATCHED',
      failureCode: null,
      sourceRowCount: 5,
      changedRowCount: 5,
      tombstoneRowCount: 0,
      sourceAmount: 2450,
      snapshotAmount: 2450,
      differenceAmount: 0,
      sourceFingerprint: 'synthetic-hash',
      finishedAt: '2026-07-28T03:00:00+03:00',
    });
  });

  it('shows company and project names instead of asking for numeric identifiers', async () => {
    renderWorkspace();
    expect(await screen.findByRole('option', { name: 'SER — Serban İnşaat' })).toBeInTheDocument();
    expect(screen.getByText(/bütçe kimliği projedir/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yeni taslak oluştur' })).not.toBeInTheDocument();
  });

  it('sorts companies by visible label and projects by Turkish project name', async () => {
    apiMocks.fetchCompanies.mockResolvedValue([
      { id: 2, nickname: 'Zulu', name: 'Zulu A.Ş.' },
      { id: 35, nickname: 'İnci', name: 'İnci A.Ş.' },
      { id: 1, nickname: 'Açık', name: 'Açık Holding A.Ş.' },
    ]);
    apiMocks.fetchProjects.mockResolvedValue([
      { id: 3, code: 'A01', name: 'Zeytin Projesi', companyId: 1, active: true },
      { id: 2, code: 'Z99', name: 'İzmir Projesi', companyId: 1, active: true },
      { id: 1, code: 'K01', name: 'Ankara Projesi', companyId: 1, active: true },
    ]);

    renderWorkspace();

    const companySelect = await screen.findByLabelText('Şirket adı');
    expect(
      Array.from(companySelect.querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['Şirket seçin', 'Açık — Açık Holding A.Ş.', 'İnci — İnci A.Ş.', 'Zulu — Zulu A.Ş.']);

    fireEvent.change(companySelect, { target: { value: '1' } });
    const projectSelect = screen.getByLabelText('Proje');
    await waitFor(() =>
      expect(
        Array.from(projectSelect.querySelectorAll('option')).map((option) => option.textContent),
      ).toEqual([
        'Proje seçin',
        'K01 — Ankara Projesi',
        'Z99 — İzmir Projesi',
        'A01 — Zeytin Projesi',
      ]),
    );
  });

  it('loads an existing PostgreSQL snapshot without requiring a sync write', async () => {
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));

    expect(await screen.findByText('2.450,00 TRY')).toBeInTheDocument();
    expect(screen.getByText('900,00 TRY')).toBeInTheDocument();
    expect(screen.getByTestId('actuals-grid')).toHaveTextContent('740.01 · INVOICE · INV-2026-1');
    expect(apiMocks.findProjectBinding).toHaveBeenCalledWith(35, 44200);
    expect(apiMocks.syncProjectActuals).not.toHaveBeenCalled();
    expect(apiMocks.selectReportingCompany).toHaveBeenCalledWith('35');
  });

  it('uses the shared reporting grid template with a stable saved-view contract', async () => {
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));
    await screen.findByTestId('actuals-grid');

    expect(gridMocks.latestEntityGridProps).toMatchObject({
      gridId: 'reports.budget-project-actuals',
      gridSchemaVersion: 1,
      dataSourceMode: 'client',
      total: 1,
      pageSize: 50,
    });
    expect(gridMocks.latestEntityGridProps).not.toHaveProperty('access');
    expect(gridMocks.latestEntityGridProps?.exportConfig).toMatchObject({
      fileBaseName: 'butce-gerceklesen-IDC1-2026-01-01-2026-07-28',
      sheetName: 'Gerçekleşen Maliyet',
      csvColumnSeparator: ';',
      csvBom: true,
    });
    expect(screen.getByRole('button', { name: 'ERP’den yenile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canlı Muhasebe Detayını aç' })).toBeInTheDocument();
  });

  it('opens the snapshot source trace from a row double click', async () => {
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Kaynak izini aç row-1' }));

    const drawer = await screen.findByRole('dialog', { name: 'Gerçekleşen maliyet satırı' });
    expect(within(drawer).getByText('Kaynak belge izi')).toBeInTheDocument();
    expect(within(drawer).getByText('Fatura')).toBeInTheDocument();
    expect(within(drawer).getByText('Satır eşleşti')).toBeInTheDocument();
    expect(within(drawer).getByText('Belge: INV-2026-1')).toBeInTheDocument();
    expect(within(drawer).getByText('Snapshot zamanı')).toBeInTheDocument();
  });

  it('discloses when the bounded grid does not contain every snapshot row', async () => {
    apiMocks.fetchProjectActualSummary.mockResolvedValue({
      ...summary,
      snapshotRowCount: 2501,
    });
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));

    expect(
      await screen.findByText(/Snapshot’ta 2.501 satır var; bu hızlı görünüm en güncel 1 satırı/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canlı Muhasebe Detayını aç' })).toBeInTheDocument();
  });

  it('uses a safe display currency when the window contains only cancelled rows', async () => {
    apiMocks.fetchProjectActualSummary.mockResolvedValue({
      ...summary,
      currency: 'N/A',
      accountingActual: 0,
      classifiedCost: 0,
      rowCount: 0,
      snapshotRowCount: 1,
    });
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));
    await screen.findByTestId('actuals-grid');

    const latestColumns = gridMocks.buildColDefs.mock.calls.at(-1)?.[0] as Array<{
      field: string;
      currencyCode?: string;
    }>;
    expect(
      latestColumns
        .filter((column) => ['accountingAmount', 'classifiedCostAmount'].includes(column.field))
        .map((column) => column.currencyCode),
    ).toEqual(['TRY', 'TRY']);
  });

  it('locks scope and date controls while a snapshot request is in flight', async () => {
    apiMocks.findProjectBinding.mockImplementation(() => new Promise(() => undefined));
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gerçekleşen yükleniyor…' })).toBeDisabled(),
    );
    expect(screen.getByLabelText('Şirket adı')).toBeDisabled();
    expect(screen.getByLabelText('Proje')).toBeDisabled();
    expect(screen.getByLabelText('Başlangıç tarihi')).toBeDisabled();
    expect(screen.getByLabelText('Bitiş tarihi')).toBeDisabled();
  });

  it('offers an explicit first binding and sync action when no binding exists', async () => {
    apiMocks.findProjectBinding.mockRejectedValue(
      new BudgetApiError('NOT_FOUND', 'Proje bağlantısı bulunamadı.'),
    );
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));

    expect(
      await screen.findByRole('heading', { name: 'Bu proje henüz bağlanmamış' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kur ve ilk senkronu yap' }));

    expect(await screen.findByText('ERP ve snapshot toplamı eşleşti.')).toBeInTheDocument();
    expect(apiMocks.createProjectBinding).toHaveBeenCalledWith(35, projects[0]);
    expect(apiMocks.syncProjectActuals).toHaveBeenCalledWith(
      35,
      binding.id,
      '2026-01-01',
      '2026-07-28',
    );
    expect(screen.getByTestId('actuals-grid')).toBeInTheDocument();
  });

  it('offers route-scoped SSO reauthorization when the budget API rejects the token', async () => {
    apiMocks.findProjectBinding.mockRejectedValue(
      new BudgetApiError('FORBIDDEN', 'Bütçe yetkiniz bulunmuyor.'),
    );
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Bütçe yetkisini güvenli girişle yenile' }),
    );

    expect(budgetLogin).toHaveBeenCalledWith({ redirectUri: window.location.href });
  });

  it('reports a blocked provider sync without presenting stale data as refreshed', async () => {
    apiMocks.findProjectBinding.mockRejectedValue(
      new BudgetApiError('NOT_FOUND', 'Proje bağlantısı bulunamadı.'),
    );
    apiMocks.syncProjectActuals.mockResolvedValue({
      batchId: 'batch-blocked',
      status: 'BLOCKED',
      failureCode: 'PROVIDER_SCOPE_DENIED',
      sourceRowCount: 0,
      changedRowCount: 0,
      tombstoneRowCount: 0,
      sourceAmount: 0,
      snapshotAmount: 0,
      differenceAmount: 0,
      sourceFingerprint: null,
      finishedAt: '2026-07-28T03:00:00+03:00',
    });
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Bağlantıyı kur ve ilk senkronu yap' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ERP kaynağını okuma yetkisi reddedildi.');
    expect(apiMocks.fetchProjectActualSummary).not.toHaveBeenCalled();
    expect(screen.queryByTestId('actuals-grid')).not.toBeInTheDocument();
  });

  it('opens the richer live accounting report with the same scope on demand', async () => {
    renderWorkspace();
    await chooseIdc1();
    fireEvent.click(screen.getByRole('button', { name: 'Gerçekleşeni göster' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Canlı Muhasebe Detayını aç' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/admin/reports/fin-proje-muhasebe-gercekleseni?projectId=44200&dateFrom=2026-01-01&dateTo=2026-07-28',
    );
  });

  it('fails closed when the authorized company catalog is unavailable', async () => {
    apiMocks.fetchCompanies.mockRejectedValue(
      new BudgetApiError('FORBIDDEN', 'Şirket kataloğu için yetkiniz bulunmuyor.'),
    );
    renderWorkspace();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('İşlem tamamlanamadı.');
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
