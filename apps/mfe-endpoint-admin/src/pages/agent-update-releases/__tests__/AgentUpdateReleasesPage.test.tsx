import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => {
  const mk = (over: Record<string, unknown>) => ({
    id: `u-${over.releaseId}`,
    channel: 'STAGING',
    targetVersion: '0.1.0',
    signingTier: 'TRUSTED_SIGNED',
    enabled: false,
    lastUpdatedAt: '2026-06-07T08:00:00Z',
    ...over,
  });
  const page = {
    content: [
      mk({ releaseId: 'rel-draft', status: 'DRAFT' }),
      mk({ releaseId: 'rel-appr', status: 'APPROVED', signingTier: 'LAB_ONLY_EVIDENCE' }),
      mk({ releaseId: 'rel-rev', status: 'REVOKED' }),
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
    approveMock: vi.fn((_a: { releaseId: string }) => ({ unwrap: () => Promise.resolve({}) })),
    revokeMock: vi.fn((_a: { releaseId: string; body: { revocationReason: string } }) => ({
      unwrap: () => Promise.resolve({}),
    })),
  };
});

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListAgentUpdateReleasesQuery: () => h.listResult,
  useApproveAgentUpdateReleaseMutation: () => [h.approveMock, { isLoading: false }],
  useRevokeAgentUpdateReleaseMutation: () => [h.revokeMock, { isLoading: false }],
  useCreateAgentUpdateReleaseMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('../../compliance-policies/useManageGate', () => ({ useManageGate: () => true }));

import { AgentUpdateReleasesPage } from '../AgentUpdateReleasesPage';

afterEach(() => {
  cleanup();
  h.approveMock.mockClear();
  h.revokeMock.mockClear();
  h.listResult = h.okResult;
});

describe('AgentUpdateReleasesPage', () => {
  it('row aksiyonları statüye göre gate edilir (approve=DRAFT, revoke=APPROVED, edit yok)', () => {
    render(<AgentUpdateReleasesPage />);
    // DRAFT → approve, no revoke
    expect(screen.getByTestId('releases-approve-rel-draft')).toBeInTheDocument();
    expect(screen.queryByTestId('releases-revoke-rel-draft')).toBeNull();
    // APPROVED → revoke, no approve
    expect(screen.getByTestId('releases-revoke-rel-appr')).toBeInTheDocument();
    expect(screen.queryByTestId('releases-approve-rel-appr')).toBeNull();
    // REVOKED → neither
    expect(screen.queryByTestId('releases-approve-rel-rev')).toBeNull();
    expect(screen.queryByTestId('releases-revoke-rel-rev')).toBeNull();
    // no edit surface anywhere
    expect(screen.queryByText(/edit|düzenle/i)).toBeNull();
  });

  it('approve DRAFT row → approve({releaseId}) çağırır', () => {
    render(<AgentUpdateReleasesPage />);
    fireEvent.click(screen.getByTestId('releases-approve-rel-draft'));
    expect(h.approveMock).toHaveBeenCalledTimes(1);
    expect(h.approveMock.mock.calls[0][0]).toEqual({ releaseId: 'rel-draft' });
  });

  it('maker-checker 403 → makerCheckerError mesajı render eder', async () => {
    h.approveMock.mockImplementationOnce(() => ({
      unwrap: () => Promise.reject({ status: 403 }),
    }));
    render(<AgentUpdateReleasesPage />);
    fireEvent.click(screen.getByTestId('releases-approve-rel-draft'));
    await waitFor(() => {
      expect(screen.getByTestId('releases-action-error')).toBeInTheDocument();
    });
  });

  it('revoke modal: boş reason disabled, valid reason → revoke({releaseId, body:{revocationReason}})', async () => {
    render(<AgentUpdateReleasesPage />);
    fireEvent.click(screen.getByTestId('releases-revoke-rel-appr'));
    const confirm = screen.getByTestId('releases-revoke-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // blank reason
    fireEvent.change(screen.getByTestId('releases-revoke-reason'), {
      target: { value: 'compromised signer' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(h.revokeMock).toHaveBeenCalledTimes(1));
    expect(h.revokeMock.mock.calls[0][0]).toEqual({
      releaseId: 'rel-appr',
      body: { revocationReason: 'compromised signer' },
    });
  });

  it('list-load 404 → releases-state capability kind=notEnabled (fleet policy)', () => {
    h.listResult = {
      data: undefined,
      error: { status: 404 },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<AgentUpdateReleasesPage />);
    const state = screen.getByTestId('releases-state');
    expect(state).toBeInTheDocument();
    expect(state.getAttribute('data-capability-kind')).toBe('notEnabled');
    // list-load error is NOT the approve-action error surface, and the table is hidden
    expect(screen.queryByTestId('releases-action-error')).toBeNull();
    expect(screen.queryByTestId('releases-table')).toBeNull();
  });

  it('list-load 403 → releases-state capability kind=forbidden', () => {
    h.listResult = {
      data: undefined,
      error: { status: 403 },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<AgentUpdateReleasesPage />);
    expect(screen.getByTestId('releases-state').getAttribute('data-capability-kind')).toBe(
      'forbidden',
    );
  });
});
