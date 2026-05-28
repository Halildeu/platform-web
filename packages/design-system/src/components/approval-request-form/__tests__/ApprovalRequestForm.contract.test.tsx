// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalRequestForm } from '../ApprovalRequestForm';
import type { ApprovalActor } from '../../../types/approval';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => cleanup());

const proposer: ApprovalActor = {
  id: 'u-proposer',
  name: 'Pia Proposer',
  role: 'Engineer',
};
const alice: ApprovalActor = { id: 'u1', name: 'Alice Adams', role: 'Maintainer' };
const bob: ApprovalActor = { id: 'u2', name: 'Bob Brown', role: 'Reviewer' };

const requestTypes = [
  { value: 'policy_change', label: 'Policy degisikligi' },
  { value: 'role_grant', label: 'Rol ataması' },
];

describe('ApprovalRequestForm contract', () => {
  it('has displayName', () => {
    expect(ApprovalRequestForm.displayName).toBe('ApprovalRequestForm');
  });

  it('sets data-component and starts on the basics step', () => {
    const { container } = render(
      <ApprovalRequestForm
        candidates={[alice, bob]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
      />,
    );
    const root = container.querySelector('[data-component="approval-request-form"]');
    expect(root).toBeInTheDocument();
    expect(root?.getAttribute('data-current-step')).toBe('basics');
  });

  it('renders the Steps indicator with 3 steps', () => {
    render(
      <ApprovalRequestForm
        candidates={[alice, bob]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
      />,
    );
    // titles
    expect(screen.getByText('Temel bilgiler')).toBeInTheDocument();
    expect(screen.getByText('Gerekce ve kanit')).toBeInTheDocument();
    expect(screen.getByText('Onaylayanlar')).toBeInTheDocument();
  });

  it('initially disables "Devam et" because basics fields are empty', () => {
    render(
      <ApprovalRequestForm
        candidates={[alice, bob]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Devam et' })).toBeDisabled();
  });

  it('shows the helper hint when the current step is invalid', () => {
    render(
      <ApprovalRequestForm
        candidates={[alice, bob]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText('Devam etmek icin gerekli alanlari doldur.')).toBeInTheDocument();
  });

  it('fires onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalRequestForm
        candidates={[alice, bob]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Iptal' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders nothing when access=hidden', () => {
    const { container } = render(
      <ApprovalRequestForm
        candidates={[alice]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
        access="hidden"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('merges className', () => {
    const { container } = render(
      <ApprovalRequestForm
        candidates={[]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
        className="my-form"
      />,
    );
    expect(
      container.querySelector('[data-component="approval-request-form"]')?.className,
    ).toContain('my-form');
  });
});

describe('ApprovalRequestForm — accessibility', () => {
  it('has no axe-core a11y violations on first render', async () => {
    const { container } = render(
      <ApprovalRequestForm
        candidates={[alice, bob]}
        proposer={proposer}
        requestTypes={requestTypes}
        onSubmit={() => {}}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
