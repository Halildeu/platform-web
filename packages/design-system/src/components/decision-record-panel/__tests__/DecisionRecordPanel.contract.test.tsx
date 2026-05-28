// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionRecordPanel } from '../DecisionRecordPanel';
import type { ApprovalActor, DecisionRecord } from '../../../types/approval';
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

const alice: ApprovalActor = { id: 'u1', name: 'Alice Adams', role: 'Maintainer' };
const bob: ApprovalActor = { id: 'u2', name: 'Bob Brown', role: 'Reviewer' };

function approve(id: string, actor = alice, reason?: string): DecisionRecord {
  return {
    id,
    actor,
    actorRole: actor.role ?? '',
    action: 'approve',
    reason,
    previousStatus: 'pending',
    newStatus: 'approved',
    timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
  };
}

function delegate(id: string, target: ApprovalActor): DecisionRecord {
  return {
    id,
    actor: alice,
    actorRole: 'Maintainer',
    action: 'delegate',
    reason: 'Tatildeyim',
    previousStatus: 'pending',
    newStatus: 'in_review',
    timestamp: new Date(Date.now() - 60 * 60_000).toISOString(),
    delegateTo: target,
  };
}

function attest(id: string): DecisionRecord {
  return {
    id,
    actor: alice,
    actorRole: 'Maintainer',
    action: 'attest',
    previousStatus: 'in_review',
    newStatus: 'approved',
    timestamp: new Date().toISOString(),
    attestation: {
      statement: 'Yetkim var ve cikar catismam yok.',
      acceptedAt: new Date().toISOString(),
    },
  };
}

describe('DecisionRecordPanel contract', () => {
  it('has displayName', () => {
    expect(DecisionRecordPanel.displayName).toBe('DecisionRecordPanel');
  });

  it('sets data-component attribute', () => {
    const { container } = render(<DecisionRecordPanel history={[]} />);
    expect(container.querySelector('[data-component="decision-record-panel"]')).toBeInTheDocument();
  });

  it('shows the empty state when history is empty', () => {
    render(<DecisionRecordPanel history={[]} emptyMessage="Hic kayit yok." />);
    expect(screen.getByText('Hic kayit yok.')).toBeInTheDocument();
  });

  it('renders one row per DecisionRecord with action label and timestamp', () => {
    render(
      <DecisionRecordPanel history={[approve('d1', alice, 'lgtm'), approve('d2', bob, 'ok')]} />,
    );
    const rows = screen.getAllByRole('button');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
    expect(screen.getByText('Bob Brown')).toBeInTheDocument();
    expect(screen.getAllByText('Onayladi').length).toBeGreaterThanOrEqual(2);
  });

  it('opens the focused detail section on row click', async () => {
    const user = userEvent.setup();
    render(<DecisionRecordPanel history={[approve('d1', alice, 'lgtm')]} />);
    expect(screen.queryByText('Karar detayi')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alice Adams - Onayladi' }));
    expect(screen.getByText('Karar detayi')).toBeInTheDocument();
    // 'lgtm' is rendered twice (row + detail) — assert via getAllByText.
    expect(screen.getAllByText('lgtm').length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces the delegateTo actor on a delegate record detail', async () => {
    const user = userEvent.setup();
    render(<DecisionRecordPanel history={[delegate('d-del', bob)]} />);
    await user.click(screen.getByRole('button', { name: 'Alice Adams - Devretti' }));
    expect(screen.getByText('Devredilen')).toBeInTheDocument();
    expect(screen.getByText(/Bob Brown/)).toBeInTheDocument();
  });

  it('surfaces the attestation statement on an attest record detail', async () => {
    const user = userEvent.setup();
    render(<DecisionRecordPanel history={[attest('d-att')]} />);
    await user.click(screen.getByRole('button', { name: 'Alice Adams - Beyan etti' }));
    expect(screen.getByText('Beyan')).toBeInTheDocument();
    expect(screen.getByText(/Yetkim var/)).toBeInTheDocument();
  });

  it('renders the export trigger when onExport is provided and history is non-empty', () => {
    render(<DecisionRecordPanel history={[approve('d1', alice, 'lgtm')]} onExport={() => {}} />);
    const exportTrigger = screen.getByRole('button', { name: 'Disa aktar' });
    expect(exportTrigger).toBeInTheDocument();
    expect(exportTrigger).not.toBeDisabled();
    // Full DataExportDialog round-trip is covered in that component's own
    // contract suite; this panel test only verifies the wiring & enabled
    // state.
  });

  it('disables export button when history is empty', () => {
    render(<DecisionRecordPanel history={[]} onExport={() => {}} />);
    expect(screen.getByRole('button', { name: 'Disa aktar' })).toBeDisabled();
  });

  it('renders nothing when access=hidden', () => {
    const { container } = render(<DecisionRecordPanel history={[approve('d1')]} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('DecisionRecordPanel — accessibility', () => {
  it('has no axe-core a11y violations on populated render', async () => {
    const { container } = render(<DecisionRecordPanel history={[approve('d1', alice, 'lgtm')]} />);
    await expectNoA11yViolations(container);
  });
});
