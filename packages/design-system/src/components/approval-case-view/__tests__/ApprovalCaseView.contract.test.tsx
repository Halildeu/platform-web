// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalCaseView } from '../ApprovalCaseView';
import type { ApprovalActor, ApprovalRequest } from '../../../types/approval';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  }
});

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
    reason: 'Yeni guvenlik politikasi gerekiyor.',
    evidenceRefs: ['PR-100', 'ADR-42'],
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    deadline: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    status: 'pending',
    currentApprovers: [currentUser],
    history: [],
  };
  return { ...base, ...overrides };
}

describe('ApprovalCaseView contract', () => {
  it('has displayName', () => {
    expect(ApprovalCaseView.displayName).toBe('ApprovalCaseView');
  });

  it('sets data-component and data-status', () => {
    const { container } = render(
      <ApprovalCaseView request={makeRequest()} currentUser={currentUser} />,
    );
    expect(container.querySelector('[data-component="approval-case-view"]')).toBeInTheDocument();
    expect(container.querySelector('[data-status="pending"]')).toBeInTheDocument();
  });

  it('renders title, target, proposer name and reason', () => {
    render(<ApprovalCaseView request={makeRequest()} currentUser={currentUser} />);
    expect(screen.getByText('Yeni policy onayi')).toBeInTheDocument();
    expect(screen.getByText('platform/policies/x')).toBeInTheDocument();
    expect(screen.getByText(/Alice Adams/)).toBeInTheDocument();
    expect(screen.getByText('Yeni guvenlik politikasi gerekiyor.')).toBeInTheDocument();
  });

  it('renders evidence chips when evidenceRefs are present', () => {
    render(<ApprovalCaseView request={makeRequest()} currentUser={currentUser} />);
    expect(screen.getByText('PR-100')).toBeInTheDocument();
    expect(screen.getByText('ADR-42')).toBeInTheDocument();
  });

  it('renders the diff section when diff is provided (side-by-side JsonViewer)', () => {
    render(
      <ApprovalCaseView
        request={makeRequest()}
        currentUser={currentUser}
        diff={{ before: { a: 1 }, after: { a: 2 } }}
      />,
    );
    expect(screen.getByText('Onceki')).toBeInTheDocument();
    expect(screen.getByText('Sonraki')).toBeInTheDocument();
  });

  it('renders history entries when request.history is non-empty', () => {
    const req = makeRequest({
      history: [
        {
          id: 'd1',
          actor: currentUser,
          actorRole: 'Maintainer',
          action: 'approve',
          reason: 'Looks good',
          previousStatus: 'pending',
          newStatus: 'approved',
          timestamp: new Date().toISOString(),
        },
      ],
    });
    render(<ApprovalCaseView request={req} currentUser={currentUser} />);
    expect(screen.getByText('Karar gecmisi')).toBeInTheDocument();
    expect(screen.getByText('Cara Current')).toBeInTheDocument();
    expect(screen.getByText('Onaylandi')).toBeInTheDocument();
    expect(screen.getByText('Looks good')).toBeInTheDocument();
  });

  it('shows the eligibility banner when current user is the proposer', () => {
    const req = makeRequest({ proposer: currentUser });
    render(<ApprovalCaseView request={req} currentUser={currentUser} />);
    expect(screen.getByText(/Kendi olusturdugun talebi onaylayamazsin/)).toBeInTheDocument();
  });

  it('disables footer actions when current user is the proposer', () => {
    const req = makeRequest({ proposer: currentUser });
    render(<ApprovalCaseView request={req} currentUser={currentUser} />);
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeDisabled();
  });

  it('opens DecisionActionDialog with the clicked mode and fires the matching callback', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalCaseView request={makeRequest()} currentUser={currentUser} onApprove={onApprove} />,
    );
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    // Confirm dialog opens by checking the dialog confirm button is visible
    const confirms = screen.getAllByRole('button', { name: /Onayla/ });
    expect(confirms.length).toBeGreaterThan(1);
    // Click the dialog confirm (last one — the footer's already the trigger)
    await user.click(confirms[confirms.length - 1]);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove.mock.calls[0][0].action).toBe('approve');
  });

  it('renders the Beyan et primary action when attestationStatement is provided', () => {
    render(
      <ApprovalCaseView
        request={makeRequest()}
        currentUser={currentUser}
        attestationStatement="Yetkim var ve cikar catismam yok."
      />,
    );
    expect(screen.getByRole('button', { name: 'Beyan et' })).toBeInTheDocument();
  });

  it('renders nothing when access=hidden', () => {
    const { container } = render(
      <ApprovalCaseView request={makeRequest()} currentUser={currentUser} access="hidden" />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('ApprovalCaseView — accessibility', () => {
  it('has no axe-core a11y violations on populated render', async () => {
    const { container } = render(
      <ApprovalCaseView request={makeRequest()} currentUser={currentUser} onApprove={() => {}} />,
    );
    await expectNoA11yViolations(container);
  });
});
