// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalInbox } from '../ApprovalInbox';
import type { ApprovalActor, ApprovalRequest } from '../../../types/approval';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => cleanup());

const currentUser: ApprovalActor = {
  id: 'u-current',
  name: 'Cara Current',
  role: 'Maintainer',
};
const alice: ApprovalActor = { id: 'u1', name: 'Alice Adams', role: 'Engineer' };

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  const base: ApprovalRequest = {
    id: 'req-1',
    type: 'policy_change',
    title: 'Yeni policy onayi',
    target: 'platform/policies/x',
    proposer: alice,
    reason: 'Yeni guvenlik politikasi.',
    evidenceRefs: ['PR-#100'],
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    status: 'pending',
    currentApprovers: [currentUser],
    history: [],
  };
  return { ...base, ...overrides };
}

describe('ApprovalInbox contract', () => {
  it('has displayName', () => {
    expect(ApprovalInbox.displayName).toBe('ApprovalInbox');
  });

  it('sets data-component and renders empty state when no requests', () => {
    const { container } = render(
      <ApprovalInbox requests={[]} currentUser={currentUser} emptyMessage="Bekleyen yok." />,
    );
    expect(container.querySelector('[data-component="approval-inbox"]')).toBeInTheDocument();
    expect(screen.getByText('Bekleyen yok.')).toBeInTheDocument();
  });

  it('renders a row per request with title and checkbox', () => {
    render(
      <ApprovalInbox
        requests={[makeRequest(), makeRequest({ id: 'req-2', title: 'Ikinci' })]}
        currentUser={currentUser}
      />,
    );
    expect(screen.getByText('Yeni policy onayi')).toBeInTheDocument();
    expect(screen.getByText('Ikinci')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
  });

  it('shows the bulk action bar when ≥1 row is selected', async () => {
    const user = userEvent.setup();
    render(
      <ApprovalInbox
        requests={[makeRequest()]}
        currentUser={currentUser}
        onBulkApprove={() => {}}
      />,
    );
    expect(screen.queryByText(/secildi/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /sec/ }));
    expect(screen.getByText(/1 secildi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toplu onayla' })).toBeInTheDocument();
  });

  it('splits bulk payload into eligibleIds + blockedReasons (proposer_self)', async () => {
    const ownReq = makeRequest({ id: 'r-own', proposer: currentUser });
    const otherReq = makeRequest({ id: 'r-other', title: 'Baska talep' });
    const onBulkApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalInbox
        requests={[ownReq, otherReq]}
        currentUser={currentUser}
        onBulkApprove={onBulkApprove}
      />,
    );
    // Select both rows
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    await user.click(screen.getByRole('button', { name: 'Toplu onayla' }));

    expect(onBulkApprove).toHaveBeenCalledTimes(1);
    const payload = onBulkApprove.mock.calls[0][0];
    expect(payload.eligibleIds).toEqual(['r-other']);
    expect(payload.blockedReasons).toHaveLength(1);
    expect(payload.blockedReasons[0].id).toBe('r-own');
    expect(payload.blockedReasons[0].reasons[0].code).toBe('proposer_self');
  });

  it('fires onRequestOpen when the row primary action is clicked', async () => {
    const onRequestOpen = vi.fn();
    const user = userEvent.setup();
    const req = makeRequest();
    render(
      <ApprovalInbox requests={[req]} currentUser={currentUser} onRequestOpen={onRequestOpen} />,
    );
    await user.click(screen.getByRole('button', { name: 'Detayi ac' }));
    expect(onRequestOpen).toHaveBeenCalledWith(req);
  });

  it('applies the free-text query filter (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(
      <ApprovalInbox
        requests={[
          makeRequest({ id: 'r1', title: 'Policy edit' }),
          makeRequest({ id: 'r2', title: 'Role grant' }),
        ]}
        currentUser={currentUser}
      />,
    );
    expect(screen.getByText('Policy edit')).toBeInTheDocument();
    expect(screen.getByText('Role grant')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Inbox icinde ara' });
    await user.type(search, 'Role');

    expect(screen.queryByText('Policy edit')).not.toBeInTheDocument();
    expect(screen.getByText('Role grant')).toBeInTheDocument();
  });

  it('applies the type filter via select (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(
      <ApprovalInbox
        requests={[
          makeRequest({ id: 'r1', type: 'policy_change', title: 'Policy edit' }),
          makeRequest({ id: 'r2', type: 'role_grant', title: 'Role grant' }),
        ]}
        currentUser={currentUser}
        typeOptions={[
          { value: 'policy_change', label: 'Policy' },
          { value: 'role_grant', label: 'Rol' },
        ]}
      />,
    );
    expect(screen.getByText('Policy edit')).toBeInTheDocument();
    expect(screen.getByText('Role grant')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tip filtresi' }), 'role_grant');

    expect(screen.queryByText('Policy edit')).not.toBeInTheDocument();
    expect(screen.getByText('Role grant')).toBeInTheDocument();
  });

  it('shows "filter matched none" empty copy when filters hide all rows', async () => {
    const user = userEvent.setup();
    render(
      <ApprovalInbox
        requests={[makeRequest({ id: 'r1', title: 'Only one' })]}
        currentUser={currentUser}
        emptyMessage="Bekleyen yok."
      />,
    );
    const search = screen.getByRole('searchbox', { name: 'Inbox icinde ara' });
    await user.type(search, 'no-match');
    expect(screen.getByText('Filtreyle eslesen talep yok.')).toBeInTheDocument();
  });

  it('renders nothing when access=hidden', () => {
    const { container } = render(
      <ApprovalInbox requests={[makeRequest()]} currentUser={currentUser} access="hidden" />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('ApprovalInbox — accessibility', () => {
  it('has no axe-core a11y violations on populated state', async () => {
    const { container } = render(
      <ApprovalInbox
        requests={[makeRequest()]}
        currentUser={currentUser}
        onBulkApprove={() => {}}
        onRequestOpen={() => {}}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
