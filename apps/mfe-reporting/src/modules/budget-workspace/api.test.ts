import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  ready: vi.fn(),
}));

vi.mock('../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: {
      get: mocks.get,
      post: mocks.post,
    },
    auth: {
      ready: mocks.ready,
    },
  }),
}));

import {
  BudgetApiError,
  createProjectBinding,
  fetchCompanies,
  fetchProjectActualRows,
  fetchProjectActualSummary,
  fetchProjects,
  findProjectBinding,
  syncProjectActuals,
} from './api';

describe('project actuals API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ready.mockResolvedValue({ ok: true });
  });

  it('reads company names and company-scoped project codes', async () => {
    mocks.get
      .mockResolvedValueOnce({ data: [{ id: 35, nickname: 'SER', name: 'Serban' }] })
      .mockResolvedValueOnce({
        data: [{ id: 91, code: 'IL05', name: 'Equinix IL05.1', companyId: 35, active: true }],
      });

    await fetchCompanies();
    await fetchProjects(35);

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/v1/reports/company-options');
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/v1/reports/project-options', {
      headers: { 'X-Company-Id': '35' },
    });
  });

  it('does not issue protected requests before auth is ready', async () => {
    mocks.ready.mockResolvedValue({ ok: false });
    await expect(fetchCompanies()).rejects.toEqual(
      expect.objectContaining<Partial<BudgetApiError>>({
        kind: 'AUTHENTICATION_REQUIRED',
      }),
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('finds an existing binding through a read-only company and project scope', async () => {
    mocks.get.mockResolvedValueOnce({
      data: {
        id: 'binding-1',
        companyId: 35,
        externalProjectId: 44200,
      },
    });

    await findProjectBinding(35, 44200);

    expect(mocks.get).toHaveBeenCalledWith('/v1/budgets/projects/bindings', {
      headers: { 'X-Company-Id': '35' },
      params: {
        sourceSystem: 'WORKCUBE',
        externalProjectId: 44200,
      },
    });
  });

  it('keeps binding, sync and snapshot reads on the budget-service contract', async () => {
    const project = {
      id: 44200,
      code: 'IDC1',
      name: 'Red Haven İzmir Data Center',
      companyId: 35,
      active: true,
    };
    mocks.post
      .mockResolvedValueOnce({ data: { id: 'binding-1' } })
      .mockResolvedValueOnce({ data: { batchId: 'batch-1', status: 'MATCHED' } });
    mocks.get
      .mockResolvedValueOnce({ data: { projectBindingId: 'binding-1', rowCount: 1 } })
      .mockResolvedValueOnce({ data: [{ id: 'row-1' }] });

    await createProjectBinding(35, project);
    await syncProjectActuals(35, 'binding-1', '2026-01-01', '2026-07-28');
    await fetchProjectActualSummary(35, 'binding-1', '2026-01-01', '2026-07-28');
    await fetchProjectActualRows(35, 'binding-1', '2026-01-01', '2026-07-28');

    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/v1/budgets/projects',
      {
        platformProjectRef: 'workcube:35:44200',
        sourceSystem: 'WORKCUBE',
        externalCompanyNo: 35,
        externalProjectId: 44200,
        externalProjectCode: 'IDC1',
      },
      { headers: { 'X-Company-Id': '35' } },
    );
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/v1/budgets/projects/binding-1/actuals/sync',
      { from: '2026-01-01', to: '2026-07-28' },
      { headers: { 'X-Company-Id': '35' } },
    );
    expect(mocks.get).toHaveBeenNthCalledWith(
      1,
      '/v1/budgets/projects/binding-1/actuals/summary',
      {
        headers: { 'X-Company-Id': '35' },
        params: { from: '2026-01-01', to: '2026-07-28' },
      },
    );
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/v1/budgets/projects/binding-1/actuals', {
      headers: { 'X-Company-Id': '35' },
      params: { from: '2026-01-01', to: '2026-07-28', limit: 2000 },
    });
  });

  it('maps an absent project binding without treating it as provider outage', async () => {
    mocks.get.mockRejectedValueOnce({ response: { status: 404 } });

    await expect(findProjectBinding(35, 44200)).rejects.toEqual(
      expect.objectContaining<Partial<BudgetApiError>>({ kind: 'NOT_FOUND' }),
    );
  });
});
