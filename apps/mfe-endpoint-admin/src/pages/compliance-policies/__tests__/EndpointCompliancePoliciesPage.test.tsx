// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { EndpointCompliancePoliciesPage } from '../EndpointCompliancePoliciesPage';
import type {
  CompliancePolicyItem,
  ComplianceEvaluationListResponse,
} from '../../../entities/endpoint-device-compliance/types';

/* ------------------------------------------------------------------ */
/*  WEB-014C — EndpointCompliancePoliciesPage unit tests (Faz 22.5).   */
/*                                                                     */
/*  Component contract:                                                 */
/*   - Default query args (page=0, size=20)                             */
/*   - 403 / loading / empty / error states                             */
/*   - Table rows render with enforcement badge + enabled column        */
/*   - Create button disabled when canManage=false                      */
/*   - Edit / Delete buttons disabled when canManage=false              */
/*   - Pagination hidden when totalPages <= 1                           */
/* ------------------------------------------------------------------ */

const useListCompliancePolicyItemsQueryMock = vi.fn();
const useDeleteCompliancePolicyItemMutationMock = vi.fn();
const useManageGateMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListCompliancePolicyItemsQuery: (...args: unknown[]) =>
    useListCompliancePolicyItemsQueryMock(...args),
  useDeleteCompliancePolicyItemMutation: () => useDeleteCompliancePolicyItemMutationMock(),
}));

vi.mock('../useManageGate', () => ({
  useManageGate: () => useManageGateMock(),
}));

vi.mock('../../../widgets/compliance-policy-dialog/CreatePolicyDialog', () => ({
  CreatePolicyDialog: (props: { open: boolean }) =>
    props.open ? <div data-testid="create-policy-dialog-mock" /> : null,
}));

vi.mock('../../../widgets/compliance-policy-dialog/EditPolicyDialog', () => ({
  EditPolicyDialog: (props: { open: boolean }) =>
    props.open ? <div data-testid="edit-policy-dialog-mock" /> : null,
}));

vi.mock('../../../widgets/compliance-policy-dialog/DeletePolicyConfirm', () => ({
  DeletePolicyConfirm: (props: { open: boolean }) =>
    props.open ? <div data-testid="delete-policy-confirm-mock" /> : null,
}));

type ListResult = {
  data?: ComplianceEvaluationListResponse<CompliancePolicyItem>;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
};

function mockList(result: ListResult): void {
  useListCompliancePolicyItemsQueryMock.mockReturnValue({
    data: result.data,
    error: result.error,
    isLoading: result.isLoading ?? false,
    isFetching: result.isFetching ?? false,
  });
}

function buildPolicyItem(overrides: Partial<CompliancePolicyItem> = {}): CompliancePolicyItem {
  return {
    id: 'policy-1',
    tenantId: 'tenant-1',
    catalogItemId: 'catalog-1',
    catalogItemKey: '7zip.7zip',
    catalogDisplayName: '7-Zip',
    enforcementMode: 'REQUIRED',
    enabled: true,
    createdBySubject: 'admin@acik.com',
    createdAt: '2026-05-28T10:00:00Z',
    lastUpdatedBySubject: 'admin@acik.com',
    lastUpdatedAt: '2026-05-28T10:00:00Z',
    version: 1,
    ...overrides,
  };
}

describe('EndpointCompliancePoliciesPage', () => {
  beforeEach(() => {
    useListCompliancePolicyItemsQueryMock.mockReset();
    useDeleteCompliancePolicyItemMutationMock.mockReset();
    useManageGateMock.mockReset();
    useDeleteCompliancePolicyItemMutationMock.mockReturnValue([
      vi.fn(() => ({ unwrap: () => Promise.resolve() })),
      { isLoading: false },
    ]);
    useManageGateMock.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('queries page 0 with size 20 by default', () => {
    mockList({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } });
    render(<EndpointCompliancePoliciesPage />);
    const lastCall = useListCompliancePolicyItemsQueryMock.mock.calls.at(-1) ?? [];
    const args = lastCall[0] as { page?: number; size?: number };
    expect(args.page).toBe(0);
    expect(args.size).toBe(20);
  });

  it('renders forbidden capability state on 403', () => {
    mockList({ error: { status: 403 } });
    render(<EndpointCompliancePoliciesPage />);
    const state = screen.getByTestId('compliance-policies-state');
    expect(state.getAttribute('data-capability-kind')).toBe('forbidden');
  });

  it('renders generic error capability state on non-403', () => {
    mockList({ error: { status: 500 } });
    render(<EndpointCompliancePoliciesPage />);
    const state = screen.getByTestId('compliance-policies-state');
    expect(state.getAttribute('data-capability-kind')).toBe('error');
  });

  it('renders loading state', () => {
    mockList({ isLoading: true });
    render(<EndpointCompliancePoliciesPage />);
    expect(screen.getByTestId('compliance-policies-loading')).toBeTruthy();
  });

  it('renders empty state when items=[]', () => {
    mockList({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } });
    render(<EndpointCompliancePoliciesPage />);
    expect(screen.getByTestId('compliance-policies-empty')).toBeTruthy();
  });

  it('renders rows + actions when items return', () => {
    mockList({
      data: {
        items: [
          buildPolicyItem({ id: 'p1', enforcementMode: 'REQUIRED' }),
          buildPolicyItem({ id: 'p2', enforcementMode: 'FORBIDDEN', enabled: false }),
        ],
        page: 0,
        size: 20,
        totalElements: 2,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePoliciesPage />);
    expect(screen.getByTestId('compliance-policies-table')).toBeTruthy();
    expect(screen.getByTestId('compliance-policies-row-p1')).toBeTruthy();
    expect(screen.getByTestId('compliance-policies-row-p2')).toBeTruthy();
    expect(screen.getByTestId('compliance-policies-edit-p1')).toBeTruthy();
    expect(screen.getByTestId('compliance-policies-delete-p2')).toBeTruthy();
  });

  it('disables create + edit + delete buttons when canManage=false', () => {
    useManageGateMock.mockReturnValue(false);
    mockList({
      data: {
        items: [buildPolicyItem({ id: 'p1' })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePoliciesPage />);
    const createBtn = screen.getByTestId('compliance-policies-create-button') as HTMLButtonElement;
    const editBtn = screen.getByTestId('compliance-policies-edit-p1') as HTMLButtonElement;
    const deleteBtn = screen.getByTestId('compliance-policies-delete-p1') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    expect(editBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
  });

  it('opens create dialog on create button click', () => {
    mockList({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } });
    render(<EndpointCompliancePoliciesPage />);
    fireEvent.click(screen.getByTestId('compliance-policies-create-button'));
    expect(screen.getByTestId('create-policy-dialog-mock')).toBeTruthy();
  });

  it('opens edit dialog on edit button click', () => {
    mockList({
      data: {
        items: [buildPolicyItem({ id: 'p1' })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePoliciesPage />);
    fireEvent.click(screen.getByTestId('compliance-policies-edit-p1'));
    expect(screen.getByTestId('edit-policy-dialog-mock')).toBeTruthy();
  });

  it('opens delete confirm on delete button click', () => {
    mockList({
      data: {
        items: [buildPolicyItem({ id: 'p1' })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePoliciesPage />);
    fireEvent.click(screen.getByTestId('compliance-policies-delete-p1'));
    expect(screen.getByTestId('delete-policy-confirm-mock')).toBeTruthy();
  });

  it('pagination hidden when totalPages <= 1', () => {
    mockList({
      data: {
        items: [buildPolicyItem({ id: 'p1' })],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      },
    });
    render(<EndpointCompliancePoliciesPage />);
    expect(screen.queryByTestId('compliance-policies-pagination')).toBeNull();
  });

  it('pagination next advances page state', () => {
    mockList({
      data: {
        items: [buildPolicyItem({ id: 'p1' })],
        page: 0,
        size: 20,
        totalElements: 40,
        totalPages: 2,
      },
    });
    render(<EndpointCompliancePoliciesPage />);
    fireEvent.click(screen.getByTestId('compliance-policies-next'));
    const lastCall = useListCompliancePolicyItemsQueryMock.mock.calls.at(-1) ?? [];
    const args = lastCall[0] as { page?: number };
    expect(args.page).toBe(1);
  });
});
