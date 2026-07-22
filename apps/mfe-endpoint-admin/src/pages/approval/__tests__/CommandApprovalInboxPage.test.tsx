// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CommandApprovalInboxPage } from '../CommandApprovalInboxPage';
import type { EndpointCommand } from '../../../entities/endpoint-command/types';

/* ------------------------------------------------------------------ */
/*  platform-web#982 — dual-control inbox for destructive commands.    */
/*                                                                     */
/*  The backend has enforced maker-checker since BE-017, but nothing   */
/*  in the MFE could record the second decision, so LOCK_USER_LOGIN /  */
/*  UNLOCK_USER_LOGIN / CHANGE_LOCAL_PASSWORD / ROTATE_CREDENTIAL      */
/*  stayed PENDING forever. These tests pin the behaviours that make   */
/*  the queue safe: only PENDING rows appear, the target account is    */
/*  visible, self-approval is blocked client-side AND a backend 403 is */
/*  still explained, and REJECT cannot be sent without a reason.       */
/* ------------------------------------------------------------------ */

const useListEndpointCommandsQueryMock = vi.fn();
const approveTriggerMock = vi.fn();
const useApproveEndpointCommandMutationMock = vi.fn();
vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListEndpointCommandsQuery: (...args: unknown[]) => useListEndpointCommandsQueryMock(...args),
  useApproveEndpointCommandMutation: (...args: unknown[]) =>
    useApproveEndpointCommandMutationMock(...args),
}));

const useCurrentEndpointAdminActorMock = vi.fn();
vi.mock('../../../app/services/useCurrentEndpointAdminActor', () => ({
  useCurrentEndpointAdminActor: () => useCurrentEndpointAdminActorMock(),
}));

function buildCommand(overrides: Partial<EndpointCommand> = {}): EndpointCommand {
  return {
    id: 'cmd-1',
    tenantId: 't-1',
    deviceId: 'dev-1',
    type: 'LOCK_USER_LOGIN',
    idempotencyKey: 'admin:...',
    status: 'QUEUED',
    approvalStatus: 'PENDING',
    payload: { username: 'acme\\jdoe' },
    priority: 100,
    attemptCount: 0,
    maxAttempts: 1,
    lockedBy: null,
    lockedUntil: null,
    visibleAfterAt: null,
    expiresAt: null,
    issuedBySubject: 'maker@example.com',
    issuedAt: '2026-07-22T06:01:00Z',
    deliveredAt: null,
    ackedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    lastError: null,
    createdAt: '2026-07-22T06:01:00Z',
    updatedAt: '2026-07-22T06:01:00Z',
    result: null,
    ...overrides,
  } as EndpointCommand;
}

function mockList(
  rows: EndpointCommand[],
  opts: Partial<{ isLoading: boolean; isError: boolean }> = {},
) {
  useListEndpointCommandsQueryMock.mockReturnValue({
    data: rows,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  });
}

beforeEach(() => {
  useListEndpointCommandsQueryMock.mockReset();
  useApproveEndpointCommandMutationMock.mockReset();
  useCurrentEndpointAdminActorMock.mockReset();
  approveTriggerMock.mockReset();
  approveTriggerMock.mockReturnValue({ unwrap: () => Promise.resolve(buildCommand()) });
  useApproveEndpointCommandMutationMock.mockReturnValue([approveTriggerMock, { isLoading: false }]);
  // Default: a different admin is signed in, so decisions are allowed.
  useCurrentEndpointAdminActorMock.mockReturnValue({ subject: 'checker@example.com' });
});

afterEach(() => cleanup());

describe('CommandApprovalInboxPage', () => {
  it('yalnizca PENDING komutlar listelenir', () => {
    mockList([
      buildCommand({ id: 'cmd-pending' }),
      buildCommand({ id: 'cmd-approved', approvalStatus: 'APPROVED' }),
      buildCommand({ id: 'cmd-none', approvalStatus: 'NOT_REQUIRED' }),
    ]);
    render(<CommandApprovalInboxPage />);

    expect(screen.getByTestId('command-approval-row-cmd-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('command-approval-row-cmd-approved')).toBeNull();
    expect(screen.queryByTestId('command-approval-row-cmd-none')).toBeNull();
  });

  it('hedef kullanici adi gorunur', () => {
    // "Lock a user" is not reviewable without knowing which user.
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    expect(screen.getByTestId('command-approval-username-cmd-1').textContent).toBe('acme\\jdoe');
  });

  it('bekleyen yokken bos durum gosterir', () => {
    mockList([buildCommand({ approvalStatus: 'APPROVED' })]);
    render(<CommandApprovalInboxPage />);

    expect(screen.getByTestId('command-approval-empty')).toBeInTheDocument();
  });

  it('onay APPROVE karariyla gonderilir', async () => {
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    fireEvent.click(screen.getByTestId('command-approval-open-cmd-1'));
    fireEvent.click(screen.getByTestId('command-approval-approve-cmd-1'));

    await waitFor(() => expect(approveTriggerMock).toHaveBeenCalledTimes(1));
    expect(approveTriggerMock.mock.calls[0][0]).toEqual({
      commandId: 'cmd-1',
      deviceId: 'dev-1',
      body: { decision: 'APPROVE' },
    });
  });

  it('gerekce girilince APPROVE gövdesine eklenir', async () => {
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    fireEvent.click(screen.getByTestId('command-approval-open-cmd-1'));
    fireEvent.change(screen.getByTestId('command-approval-reason-cmd-1'), {
      target: { value: 'ikinci goz onayi' },
    });
    fireEvent.click(screen.getByTestId('command-approval-approve-cmd-1'));

    await waitFor(() => expect(approveTriggerMock).toHaveBeenCalledTimes(1));
    expect(approveTriggerMock.mock.calls[0][0].body).toEqual({
      decision: 'APPROVE',
      reason: 'ikinci goz onayi',
    });
  });

  it('REJECT gerekce olmadan gonderilemez', () => {
    // The backend requires a reason for REJECT; sending one without would be
    // a guaranteed 400, so the button stays disabled instead.
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    fireEvent.click(screen.getByTestId('command-approval-open-cmd-1'));
    const reject = screen.getByTestId('command-approval-reject-cmd-1') as HTMLButtonElement;
    expect(reject.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('command-approval-reason-cmd-1'), {
      target: { value: 'yanlis hedef kullanici' },
    });
    expect(
      (screen.getByTestId('command-approval-reject-cmd-1') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('kendi komutunu onaylama istemci tarafinda engellenir', () => {
    useCurrentEndpointAdminActorMock.mockReturnValue({ subject: 'maker@example.com' });
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    expect(screen.getByTestId('command-approval-own-cmd-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('command-approval-open-cmd-1'));
    expect(
      (screen.getByTestId('command-approval-approve-cmd-1') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('istemci suresi cozulemese bile backend 403 aciklanir', async () => {
    // The client guard is UX only: when the subject cannot be resolved the
    // button stays enabled, so the maker-checker 403 has to be legible.
    useCurrentEndpointAdminActorMock.mockReturnValue({ subject: null });
    approveTriggerMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 403 }) });
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    fireEvent.click(screen.getByTestId('command-approval-open-cmd-1'));
    expect(
      (screen.getByTestId('command-approval-approve-cmd-1') as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByTestId('command-approval-approve-cmd-1'));

    // The suite resolves to the English dictionary. What matters in any
    // locale is that 403 gets the maker-checker sentence, not the generic one.
    const alert = await screen.findByTestId('command-approval-error-cmd-1');
    expect(alert.textContent).toBe(
      'You cannot approve a command you raised; a second administrator has to decide it.',
    );
  });

  it('409 ayri bir mesajla aciklanir', async () => {
    approveTriggerMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 409 }) });
    mockList([buildCommand()]);
    render(<CommandApprovalInboxPage />);

    fireEvent.click(screen.getByTestId('command-approval-open-cmd-1'));
    fireEvent.click(screen.getByTestId('command-approval-approve-cmd-1'));

    const alert = await screen.findByTestId('command-approval-error-cmd-1');
    expect(alert.textContent).toBe(
      'This command is no longer awaiting approval (it may have been approved, rejected or expired).',
    );
    expect(alert.textContent).not.toBe('Could not record the approval decision.');
  });
});
