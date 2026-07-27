import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  ready: vi.fn(),
}));

vi.mock('../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: {
      get: mocks.get,
    },
    auth: {
      ready: mocks.ready,
    },
  }),
}));

import {
  BudgetApiError,
  fetchCompanies,
  fetchProjects,
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
});
