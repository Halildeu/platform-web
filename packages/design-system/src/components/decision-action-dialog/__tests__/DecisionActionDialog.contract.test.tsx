// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionActionDialog, type DecisionActionDialogProps } from '../DecisionActionDialog';
import type { ApprovalActor } from '../../../types/approval';
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

const requestSummary = {
  title: 'Release v2.1',
  target: 'platform/release-canary',
  type: 'release_gate',
};

const baseProps: DecisionActionDialogProps = {
  open: true,
  mode: 'approve',
  requestSummary,
  onConfirm: () => {},
  onCancel: () => {},
};

const alice: ApprovalActor = { id: 'u1', name: 'Alice Adams', role: 'Maintainer' };

describe('DecisionActionDialog contract', () => {
  it('has displayName', () => {
    expect(DecisionActionDialog.displayName).toBe('DecisionActionDialog');
  });

  it('sets data-component and data-mode', () => {
    const { container } = render(<DecisionActionDialog {...baseProps} mode="reject" />);
    expect(
      container.querySelector('[data-component="decision-action-dialog"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-mode="reject"]')).toBeInTheDocument();
  });

  it('renders request title in description', () => {
    render(<DecisionActionDialog {...baseProps} />);
    expect(screen.getByText('Release v2.1')).toBeInTheDocument();
  });

  it('renders mode verb on confirm button (approve)', () => {
    render(<DecisionActionDialog {...baseProps} mode="approve" />);
    expect(screen.getByRole('button', { name: /Onayla/ })).toBeInTheDocument();
  });

  it('renders mode verb on confirm button (reject)', () => {
    render(<DecisionActionDialog {...baseProps} mode="reject" />);
    expect(screen.getByRole('button', { name: /Reddet/ })).toBeInTheDocument();
  });

  it('disables confirm when reject reason is empty (default requireReason)', () => {
    render(<DecisionActionDialog {...baseProps} mode="reject" />);
    const confirm = screen.getByRole('button', { name: /Reddet/ });
    expect(confirm).toBeDisabled();
  });

  it('disables confirm for delegate mode without a selected actor', () => {
    render(<DecisionActionDialog {...baseProps} mode="delegate" candidates={[alice]} />);
    const confirm = screen.getByRole('button', { name: /Devret/ });
    expect(confirm).toBeDisabled();
  });

  it('fires onConfirm with attest payload including attestation', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(
      <DecisionActionDialog
        {...baseProps}
        mode="attest"
        attestationStatement="Yetkim var ve cikar catismam yok."
        onConfirm={handler}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Beyan Et/ }));
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];
    expect(payload.action).toBe('attest');
    expect(payload.attestation.statement).toBe('Yetkim var ve cikar catismam yok.');
    expect(typeof payload.attestation.acceptedAt).toBe('string');
  });

  it('fires onCancel when cancel button clicked', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<DecisionActionDialog {...baseProps} onCancel={handler} />);
    await user.click(screen.getByRole('button', { name: /Iptal/ }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('renders nothing when access=hidden', () => {
    const { container } = render(<DecisionActionDialog {...baseProps} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('DecisionActionDialog — accessibility', () => {
  it('has no axe-core a11y violations when open', async () => {
    const { container } = render(<DecisionActionDialog {...baseProps} />);
    await expectNoA11yViolations(container);
  });
});
