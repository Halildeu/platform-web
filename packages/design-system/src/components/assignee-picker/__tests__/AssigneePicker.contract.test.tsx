// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssigneePicker } from '../AssigneePicker';
import type { ApprovalActor } from '../../../types/approval';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => cleanup());

const alice: ApprovalActor = {
  id: 'u1',
  name: 'Alice Adams',
  role: 'Maintainer',
  email: 'alice@example.com',
};
const bob: ApprovalActor = {
  id: 'u2',
  name: 'Bob Brown',
  role: 'Reviewer',
  email: 'bob@example.com',
};
const carol: ApprovalActor = { id: 'u3', name: 'Carol Chen', role: 'Maintainer' };

describe('AssigneePicker contract', () => {
  it('has displayName', () => {
    expect(AssigneePicker.displayName).toBe('AssigneePicker');
  });

  it('sets data-component attribute', () => {
    const { container } = render(
      <AssigneePicker candidates={[]} value={null} onChange={() => {}} />,
    );
    expect(container.querySelector('[data-component="assignee-picker"]')).toBeInTheDocument();
  });

  it('defaults data-mode to single', () => {
    const { container } = render(
      <AssigneePicker candidates={[]} value={null} onChange={() => {}} />,
    );
    expect(container.querySelector('[data-mode="single"]')).toBeInTheDocument();
  });

  it('renders the multi data-mode attribute when mode="multi"', () => {
    const { container } = render(
      <AssigneePicker mode="multi" candidates={[]} value={[]} onChange={() => {}} />,
    );
    expect(container.querySelector('[data-mode="multi"]')).toBeInTheDocument();
  });

  it('renders the combobox input role', () => {
    render(<AssigneePicker candidates={[alice]} value={null} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders selected actor name in single mode', () => {
    render(<AssigneePicker candidates={[alice, bob]} value={alice} onChange={() => {}} />);
    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
  });

  it('shows role label when showRole=true', () => {
    render(<AssigneePicker candidates={[alice]} value={alice} onChange={() => {}} showRole />);
    expect(screen.getByText(/Maintainer/)).toBeInTheDocument();
  });

  it('calls onChange with selected actor when option clicked', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    render(<AssigneePicker candidates={[alice, bob]} value={null} onChange={handler} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'Bob');
    const option = await screen.findByRole('option', { name: /Bob Brown/ });
    await user.click(option);
    expect(handler).toHaveBeenCalledWith(bob);
  });

  it('filters out excludeIds from listbox', async () => {
    const user = userEvent.setup();
    render(
      <AssigneePicker
        candidates={[alice, bob, carol]}
        value={null}
        onChange={() => {}}
        excludeIds={[bob.id]}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'B');
    // Bob excluded -> not present in listbox
    expect(screen.queryByRole('option', { name: /Bob Brown/ })).not.toBeInTheDocument();
  });

  it('renders nothing when access=hidden', () => {
    const { container } = render(
      <AssigneePicker candidates={[alice]} value={null} onChange={() => {}} access="hidden" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('merges className', () => {
    const { container } = render(
      <AssigneePicker candidates={[]} value={null} onChange={() => {}} className="my-picker" />,
    );
    expect(container.querySelector('[data-component="assignee-picker"]')?.className).toContain(
      'my-picker',
    );
  });
});

describe('AssigneePicker — accessibility', () => {
  it('has no axe-core a11y violations', async () => {
    const { container } = render(
      <AssigneePicker candidates={[alice, bob]} value={alice} onChange={() => {}} />,
    );
    await expectNoA11yViolations(container);
  });
});
