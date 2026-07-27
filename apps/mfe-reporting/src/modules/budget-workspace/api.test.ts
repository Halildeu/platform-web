import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  ready: vi.fn(),
}));

vi.mock('../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: {
      get: mocks.get,
      post: mocks.post,
      put: mocks.put,
    },
    auth: {
      ready: mocks.ready,
    },
  }),
}));

import {
  BudgetApiError,
  createBudget,
  fetchBudgetControl,
  replaceBudgetLines,
} from './api';

describe('budget workspace API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ready.mockResolvedValue({ ok: true });
  });

  it('creates a budget with matching payload and fail-closed company header', async () => {
    mocks.post.mockResolvedValue({ data: { planId: 'plan-1' } });

    await createBudget(35, 2026, 'TRY');

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/budgets',
      { companyId: 35, fiscalYear: 2026, baseCurrency: 'TRY' },
      { headers: { 'X-Company-Id': '35' } },
    );
  });

  it('sends company scope on line writes and control reads', async () => {
    mocks.put.mockResolvedValue({ data: { planId: 'plan-1' } });
    mocks.get.mockResolvedValue({ data: { plan: 100 } });
    const lines = [
      {
        period: '2026-01',
        accountCode: '740',
        costCenterCode: 'HQ',
        projectCode: '',
        departmentCode: '',
        branchCode: '',
        direction: 'EXPENSE' as const,
        plannedAmount: 100,
        currency: 'TRY',
        description: 'Test',
      },
    ];

    await replaceBudgetLines(35, 'plan/1', 'version/1', lines);
    await fetchBudgetControl(35, 'plan/1', 'version/1');

    expect(mocks.put).toHaveBeenCalledWith(
      '/api/v1/budgets/plan%2F1/versions/version%2F1/lines',
      { lines },
      { headers: { 'X-Company-Id': '35' } },
    );
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/v1/budgets/plan%2F1/versions/version%2F1/control',
      { headers: { 'X-Company-Id': '35' } },
    );
  });

  it('does not send a protected request before shell auth is ready', async () => {
    mocks.ready.mockResolvedValue({ ok: false, reason: 'unauthenticated' });

    await expect(createBudget(35, 2026, 'TRY')).rejects.toMatchObject({
      kind: 'AUTHENTICATION_REQUIRED',
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('maps cross-scope denial to an explicit authorization error', async () => {
    mocks.post.mockRejectedValue({ response: { status: 403 } });

    await expect(createBudget(35, 2026, 'TRY')).rejects.toEqual(
      expect.objectContaining<Partial<BudgetApiError>>({
        kind: 'FORBIDDEN',
      }),
    );
  });
});
