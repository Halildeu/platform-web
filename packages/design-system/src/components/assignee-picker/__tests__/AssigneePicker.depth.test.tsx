// @vitest-environment jsdom
// depth-keep: behavior depth tests for AssigneePicker (multi/single modes,
// keyboard nav, excludeIds with stale value, access transitions).
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssigneePicker } from '../AssigneePicker';
import type { ApprovalActor } from '../../../types/approval';

afterEach(() => cleanup());

const alice: ApprovalActor = { id: 'u1', name: 'Alice Adams', role: 'Maintainer' };
const bob: ApprovalActor = { id: 'u2', name: 'Bob Brown', role: 'Reviewer' };
const carol: ApprovalActor = { id: 'u3', name: 'Carol Chen', role: 'Maintainer' };

function MultiHarness({
  initial = [],
  excludeIds,
}: {
  initial?: ApprovalActor[];
  excludeIds?: string[];
}) {
  const [value, setValue] = useState<ApprovalActor[]>(initial);
  return (
    <AssigneePicker
      mode="multi"
      candidates={[alice, bob, carol]}
      value={value}
      onChange={setValue}
      excludeIds={excludeIds}
    />
  );
}

function SingleHarness({ initial = null }: { initial?: ApprovalActor | null }) {
  const [value, setValue] = useState<ApprovalActor | null>(initial);
  return <AssigneePicker candidates={[alice, bob, carol]} value={value} onChange={setValue} />;
}

describe('AssigneePicker — multi mode behavior', () => {
  it('selecting two distinct candidates adds both as chips', async () => {
    const user = userEvent.setup();
    render(<MultiHarness />);
    const input = screen.getByRole('combobox');

    await user.click(input);
    await user.type(input, 'Bob');
    await user.click(await screen.findByRole('option', { name: /Bob Brown/ }));

    await user.click(input);
    await user.type(input, 'Car');
    await user.click(await screen.findByRole('option', { name: /Carol Chen/ }));

    expect(screen.getByText('Bob Brown')).toBeInTheDocument();
    expect(screen.getByText('Carol Chen')).toBeInTheDocument();
  });

  it('clicking a chip remove button drops that actor', async () => {
    const user = userEvent.setup();
    render(<MultiHarness initial={[alice, bob]} />);

    const removeBob = screen.getByRole('button', { name: /Bob Brown kaldir/ });
    await user.click(removeBob);

    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
  });

  it('Backspace on empty input drops the last selected actor', async () => {
    const user = userEvent.setup();
    render(<MultiHarness initial={[alice, bob]} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{Backspace}');

    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
  });

  it('value containing an excluded id renders the blocked badge instead of silently dropping it', () => {
    render(<MultiHarness initial={[alice, bob]} excludeIds={[bob.id]} />);
    // Bob still rendered but flagged
    expect(screen.getByText('Bob Brown')).toBeInTheDocument();
    expect(screen.getByText('Uygun degil')).toBeInTheDocument();
  });
});

describe('AssigneePicker — single mode behavior', () => {
  it('selecting a candidate replaces the previous selection', async () => {
    const user = userEvent.setup();
    render(<SingleHarness initial={alice} />);

    expect(screen.getByText('Alice Adams')).toBeInTheDocument();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Car');
    await user.click(await screen.findByRole('option', { name: /Carol Chen/ }));

    expect(screen.queryByText('Alice Adams')).not.toBeInTheDocument();
    expect(screen.getByText('Carol Chen')).toBeInTheDocument();
  });

  it('clicking clear button removes the single selection', async () => {
    const user = userEvent.setup();
    render(<SingleHarness initial={alice} />);

    const clear = screen.getByRole('button', { name: /Alice Adams temizle/ });
    await user.click(clear);
    expect(screen.queryByText('Alice Adams')).not.toBeInTheDocument();
  });
});

describe('AssigneePicker — keyboard navigation', () => {
  it('ArrowDown moves focus into the listbox', async () => {
    const user = userEvent.setup();
    render(<SingleHarness />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'A');
    await user.keyboard('{ArrowDown}');
    // First option (Alice) should be focused
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /Alice Adams/ }));
  });

  it('Enter on a focused option selects it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AssigneePicker candidates={[alice]} value={null} onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'A');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(alice);
  });
});

describe('AssigneePicker — access transitions', () => {
  it('readonly access hides chip remove buttons', () => {
    render(
      <AssigneePicker
        mode="multi"
        candidates={[alice, bob]}
        value={[alice]}
        onChange={() => {}}
        access="readonly"
      />,
    );
    expect(screen.queryByRole('button', { name: /Alice Adams kaldir/ })).not.toBeInTheDocument();
  });

  it('disabled prop disables the combobox input', () => {
    render(<AssigneePicker candidates={[alice, bob]} value={null} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
