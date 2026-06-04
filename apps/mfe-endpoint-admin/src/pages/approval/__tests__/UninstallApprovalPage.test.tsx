// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { UninstallApprovalPage } from '../UninstallApprovalPage';
import type { AdminUninstallRequestResponse } from '../../../entities/endpoint-uninstall/types';

/* ------------------------------------------------------------------ */
/*  AG-028 Phase 3 — UninstallApprovalPage guard tests                 */
/*  (Codex 019e93d2 must-fix #1 approve-403 mapping + #2 self-approve  */
/*   / actor-unverified fail-safe).                                    */
/* ------------------------------------------------------------------ */

const useParamsMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => useParamsMock(),
  useNavigate: () => vi.fn(),
}));

const useListUninstallRequestsQueryMock = vi.fn();
const approveTriggerMock = vi.fn();
const useApproveUninstallMutationMock = vi.fn();
vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListUninstallRequestsQuery: (...args: unknown[]) => useListUninstallRequestsQueryMock(...args),
  useApproveUninstallMutation: (...args: unknown[]) => useApproveUninstallMutationMock(...args),
}));

const useCurrentEndpointAdminActorMock = vi.fn();
vi.mock('../../../app/services/useCurrentEndpointAdminActor', () => ({
  useCurrentEndpointAdminActor: () => useCurrentEndpointAdminActorMock(),
}));

function buildRequest(
  overrides: Partial<AdminUninstallRequestResponse> = {},
): AdminUninstallRequestResponse {
  return {
    requestId: 'req-1',
    tenantId: 't-1',
    deviceId: 'dev-1',
    catalogItemId: 'cat-uuid-1',
    commandId: null,
    state: 'PENDING_APPROVAL',
    idempotencyKey: 'admin-uninstall:...',
    reason: 'license revoked',
    createdBy: 'admin-a',
    approvedBy: null,
    createdAt: '2026-06-04T10:00:00Z',
    stateUpdatedAt: '2026-06-04T10:00:00Z',
    ...overrides,
  };
}

function mockEnv(opts: {
  subject: string | null;
  request?: AdminUninstallRequestResponse;
  approveReject?: { status: number; data?: unknown };
}) {
  useParamsMock.mockReturnValue({ deviceId: 'dev-1', requestId: 'req-1' });
  useCurrentEndpointAdminActorMock.mockReturnValue({ subject: opts.subject });
  useListUninstallRequestsQueryMock.mockReturnValue({
    data: opts.request ? [opts.request] : [],
    isLoading: false,
    error: undefined,
  });
  approveTriggerMock.mockReturnValue({
    unwrap: () =>
      opts.approveReject ? Promise.reject(opts.approveReject) : Promise.resolve(buildRequest()),
  });
  useApproveUninstallMutationMock.mockReturnValue([approveTriggerMock, { isLoading: false }]);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe('UninstallApprovalPage — maker-checker guard (Codex 019e93d2 must-fix #2)', () => {
  it('disables approve + warns when the active admin identity is UNRESOLVED (fail-safe)', () => {
    mockEnv({ subject: null, request: buildRequest({ createdBy: 'admin-a' }) });
    render(<UninstallApprovalPage />);
    expect((screen.getByTestId('uninstall-approval-approve') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId('uninstall-approval-actor-unverified')).toBeTruthy();
    expect(screen.queryByTestId('uninstall-approval-self')).toBeNull();
  });

  it('disables approve + shows self-approve warning when subject === createdBy', () => {
    mockEnv({ subject: 'admin-a', request: buildRequest({ createdBy: 'admin-a' }) });
    render(<UninstallApprovalPage />);
    expect((screen.getByTestId('uninstall-approval-approve') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId('uninstall-approval-self')).toBeTruthy();
    expect(screen.queryByTestId('uninstall-approval-actor-unverified')).toBeNull();
  });

  it('enables approve for a distinct resolved admin on a pending request', () => {
    mockEnv({ subject: 'admin-b', request: buildRequest({ createdBy: 'admin-a' }) });
    render(<UninstallApprovalPage />);
    expect((screen.getByTestId('uninstall-approval-approve') as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(screen.queryByTestId('uninstall-approval-self')).toBeNull();
    expect(screen.queryByTestId('uninstall-approval-actor-unverified')).toBeNull();
  });
});

describe('UninstallApprovalPage — approve-context 403 mapping (Codex 019e93d2 must-fix #1)', () => {
  it('a backend 403 surfaces the APPROVE forbidden headline, not the propose-create one', async () => {
    mockEnv({
      subject: 'admin-b',
      request: buildRequest({ createdBy: 'admin-a' }),
      approveReject: { status: 403, data: {} },
    });
    render(<UninstallApprovalPage />);
    fireEvent.click(screen.getByTestId('uninstall-approval-approve'));
    const headline = await screen.findByTestId('uninstall-approval-error-headline');
    // Locale-agnostic: the APPROVE-context forbidden wording (EN "approve" /
    // TR "onaylama") must render — NOT the propose-context "create" / "oluşturma".
    expect(headline.textContent ?? '').toMatch(/approve|onaylama/i);
    expect(headline.textContent ?? '').not.toMatch(/create this uninstall|oluşturma/i);
  });
});
