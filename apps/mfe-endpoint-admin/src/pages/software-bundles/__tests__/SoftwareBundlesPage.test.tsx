import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => {
  const mk = (over: Record<string, unknown>) => ({
    displayName: 'B ' + over.bundleId,
    enabled: false,
    lastUpdatedAt: '2026-06-07T08:00:00Z',
    ...over,
  });
  const page = {
    content: [
      mk({ bundleId: 'b-draft', status: 'DRAFT' }),
      mk({ bundleId: 'b-appr', status: 'APPROVED' }),
      mk({ bundleId: 'b-rev', status: 'REVOKED' }),
    ],
    number: 0,
    size: 20,
    totalElements: 3,
    totalPages: 1,
    first: true,
    last: true,
    empty: false,
  };
  const okResult = {
    data: page,
    error: undefined as unknown,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  return {
    page,
    okResult,
    // Mutable list-query result the mock reads on every render; error specs
    // reassign it, and afterEach resets it back to the happy path.
    listResult: okResult as Record<string, unknown>,
    approveMock: vi.fn((_a: { bundleId: string }) => ({ unwrap: () => Promise.resolve({}) })),
    revokeMock: vi.fn((_a: { bundleId: string; body: { revocationReason: string } }) => ({
      unwrap: () => Promise.resolve({}),
    })),
  };
});

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListSoftwareBundlesQuery: () => h.listResult,
  useApproveSoftwareBundleMutation: () => [h.approveMock, { isLoading: false }],
  useRevokeSoftwareBundleMutation: () => [h.revokeMock, { isLoading: false }],
  useCreateSoftwareBundleMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('../../compliance-policies/useManageGate', () => ({ useManageGate: () => true }));

import { SoftwareBundlesPage } from '../SoftwareBundlesPage';

afterEach(() => {
  cleanup();
  h.approveMock.mockClear();
  h.revokeMock.mockClear();
  h.listResult = h.okResult;
});

describe('SoftwareBundlesPage', () => {
  it('row aksiyonları statüye göre gate edilir (approve=DRAFT, revoke=APPROVED)', () => {
    render(<SoftwareBundlesPage />);
    expect(screen.getByTestId('bundles-approve-b-draft')).toBeInTheDocument();
    expect(screen.queryByTestId('bundles-revoke-b-draft')).toBeNull();
    expect(screen.getByTestId('bundles-revoke-b-appr')).toBeInTheDocument();
    expect(screen.queryByTestId('bundles-approve-b-appr')).toBeNull();
    expect(screen.queryByTestId('bundles-approve-b-rev')).toBeNull();
    expect(screen.queryByTestId('bundles-revoke-b-rev')).toBeNull();
  });

  it('approve DRAFT → approve({bundleId})', () => {
    render(<SoftwareBundlesPage />);
    fireEvent.click(screen.getByTestId('bundles-approve-b-draft'));
    expect(h.approveMock).toHaveBeenCalledTimes(1);
    expect(h.approveMock.mock.calls[0][0]).toEqual({ bundleId: 'b-draft' });
  });

  it('maker-checker 403 → action-error render eder', async () => {
    h.approveMock.mockImplementationOnce(() => ({
      unwrap: () => Promise.reject({ status: 403 }),
    }));
    render(<SoftwareBundlesPage />);
    fireEvent.click(screen.getByTestId('bundles-approve-b-draft'));
    await waitFor(() => expect(screen.getByTestId('bundles-action-error')).toBeInTheDocument());
  });

  it('revoke: blank reason disabled, valid → revoke({bundleId, body:{revocationReason}})', async () => {
    render(<SoftwareBundlesPage />);
    fireEvent.click(screen.getByTestId('bundles-revoke-b-appr'));
    const confirm = screen.getByTestId('bundles-revoke-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('bundles-revoke-reason'), {
      target: { value: 'deprecated set' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(h.revokeMock).toHaveBeenCalledTimes(1));
    expect(h.revokeMock.mock.calls[0][0]).toEqual({
      bundleId: 'b-appr',
      body: { revocationReason: 'deprecated set' },
    });
  });

  it('list-load 404 → bundles-state capability kind=notEnabled (fleet policy)', () => {
    h.listResult = {
      data: undefined,
      error: { status: 404 },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<SoftwareBundlesPage />);
    const state = screen.getByTestId('bundles-state');
    expect(state).toBeInTheDocument();
    expect(state.getAttribute('data-capability-kind')).toBe('notEnabled');
    // list-load error is NOT the approve-action error surface, and the table is hidden
    expect(screen.queryByTestId('bundles-action-error')).toBeNull();
    expect(screen.queryByTestId('bundles-table')).toBeNull();
  });

  it('list-load 403 → bundles-state capability kind=forbidden', () => {
    h.listResult = {
      data: undefined,
      error: { status: 403 },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<SoftwareBundlesPage />);
    expect(screen.getByTestId('bundles-state').getAttribute('data-capability-kind')).toBe(
      'forbidden',
    );
  });
});
