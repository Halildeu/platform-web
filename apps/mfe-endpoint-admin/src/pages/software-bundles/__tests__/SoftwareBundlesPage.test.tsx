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
  return {
    page,
    approveMock: vi.fn((_a: { bundleId: string }) => ({ unwrap: () => Promise.resolve({}) })),
    revokeMock: vi.fn((_a: { bundleId: string; body: { revocationReason: string } }) => ({
      unwrap: () => Promise.resolve({}),
    })),
  };
});

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListSoftwareBundlesQuery: () => ({
    data: h.page,
    error: undefined,
    isLoading: false,
    isFetching: false,
  }),
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
});
