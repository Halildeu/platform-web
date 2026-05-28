// @vitest-environment jsdom
// depth-keep: behavior depth tests for DecisionActionDialog (mode-specific
// validation, discriminated payload shapes, busy/access transitions, reset).
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionActionDialog, type DecisionActionDialogProps } from '../DecisionActionDialog';
import type { ApprovalActor } from '../../../types/approval';

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

const alice: ApprovalActor = { id: 'u1', name: 'Alice Adams', role: 'Maintainer' };
const bob: ApprovalActor = { id: 'u2', name: 'Bob Brown', role: 'Reviewer' };

function makeProps(overrides: Partial<DecisionActionDialogProps> = {}): DecisionActionDialogProps {
  return {
    open: true,
    mode: 'approve',
    requestSummary,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe('DecisionActionDialog — approve mode', () => {
  it('confirms with action=approve and no reason when reason is empty', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DecisionActionDialog {...makeProps({ onConfirm })} />);
    await user.click(screen.getByRole('button', { name: /Onayla/ }));
    expect(onConfirm).toHaveBeenCalledWith({ action: 'approve' });
  });

  it('confirms with action=approve and reason text when provided', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DecisionActionDialog {...makeProps({ onConfirm })} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'lgtm');
    await user.click(screen.getByRole('button', { name: /Onayla/ }));
    expect(onConfirm).toHaveBeenCalledWith({ action: 'approve', reason: 'lgtm' });
  });
});

describe('DecisionActionDialog — reject mode', () => {
  it('requires reason text and includes presetCode when chosen', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <DecisionActionDialog
        {...makeProps({
          onConfirm,
          mode: 'reject',
          presetReasons: [
            { code: 'incomplete_evidence', label: 'Eksik kanit' },
            { code: 'policy_violation', label: 'Politika ihlali' },
          ],
        })}
      />,
    );
    const confirm = screen.getByRole('button', { name: /Reddet/ });
    expect(confirm).toBeDisabled();

    // pick preset
    await user.selectOptions(screen.getByRole('combobox'), 'policy_violation');
    // still disabled until free text
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'Kayit eksik.');
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({
      action: 'reject',
      reason: 'Kayit eksik.',
      presetCode: 'policy_violation',
    });
  });
});

describe('DecisionActionDialog — delegate mode', () => {
  it('requires a selected actor and emits delegateTo in payload', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <DecisionActionDialog
        {...makeProps({
          onConfirm,
          mode: 'delegate',
          candidates: [alice, bob],
        })}
      />,
    );
    const confirm = screen.getByRole('button', { name: /Devret/ });
    expect(confirm).toBeDisabled();

    // pick alice via AssigneePicker
    const comboboxes = screen.getAllByRole('combobox');
    const picker = comboboxes[0];
    await user.click(picker);
    await user.type(picker, 'Alice');
    await user.click(await screen.findByRole('option', { name: /Alice Adams/ }));

    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delegate', delegateTo: alice }),
    );
  });
});

describe('DecisionActionDialog — request_changes mode', () => {
  it('requires reason and emits action=request_changes', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DecisionActionDialog {...makeProps({ onConfirm, mode: 'request_changes' })} />);
    const confirm = screen.getByRole('button', { name: /Duzeltme Iste/ });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Test eklenmeli.');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({
      action: 'request_changes',
      reason: 'Test eklenmeli.',
    });
  });
});

describe('DecisionActionDialog — attest mode', () => {
  it('requires checkbox + emits attestation with statement/acceptedAt', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <DecisionActionDialog
        {...makeProps({
          onConfirm,
          mode: 'attest',
          attestationStatement: 'Yetkim var.',
        })}
      />,
    );
    const confirm = screen.getByRole('button', { name: /Beyan Et/ });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    const payload = onConfirm.mock.calls[0][0];
    expect(payload.action).toBe('attest');
    expect(payload.attestation.statement).toBe('Yetkim var.');
    expect(typeof payload.attestation.acceptedAt).toBe('string');
  });
});

describe('DecisionActionDialog — busy + reset behavior', () => {
  it('busy=true disables confirm even if otherwise valid', () => {
    render(<DecisionActionDialog {...makeProps({ busy: true })} />);
    const confirm = screen.getByRole('button', { name: /Onayla/ });
    expect(confirm).toBeDisabled();
  });

  it('resets reason / preset / attestation when re-opened', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)}>
            toggle
          </button>
          <DecisionActionDialog
            open={open}
            mode="reject"
            requestSummary={requestSummary}
            onConfirm={() => {}}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const ta = screen.getByRole('textbox');
    await user.type(ta, 'first attempt');
    expect(ta).toHaveValue('first attempt');

    // close + reopen
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
