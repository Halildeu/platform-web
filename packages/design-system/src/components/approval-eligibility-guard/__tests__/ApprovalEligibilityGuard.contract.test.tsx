// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalEligibilityGuard } from '../ApprovalEligibilityGuard';
import type { EligibilityReason } from '../../../types/approval';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => cleanup());

const proposerSelf: EligibilityReason = {
  code: 'proposer_self',
  message: 'Kendi onerinizi onaylayamazsiniz (4-eyes).',
};

const tierMismatch: EligibilityReason = {
  code: 'tier_mismatch',
  message: 'Bu kademe icin yetkin yetersiz.',
};

describe('ApprovalEligibilityGuard contract', () => {
  it('has displayName', () => {
    expect(ApprovalEligibilityGuard.displayName).toBe('ApprovalEligibilityGuard');
  });

  it('passthrough rendering when reasons is empty', () => {
    const { container } = render(
      <ApprovalEligibilityGuard reasons={[]}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    const wrapper = container.querySelector('[data-component="approval-eligibility-guard"]');
    expect(wrapper?.getAttribute('data-blocked')).toBe('false');
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeInTheDocument();
  });

  it('sets data-blocked="true" and aria-disabled when reasons present', () => {
    const { container } = render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    const guarded = container.querySelector(
      '[data-component="approval-eligibility-guard"][data-blocked="true"]',
    );
    expect(guarded).toBeInTheDocument();
    expect(guarded?.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders banner notice with reason in banner variant', () => {
    render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} variant="banner">
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    expect(screen.getByText('Kendi onerinizi onaylayamazsiniz (4-eyes).')).toBeInTheDocument();
  });

  it('intercepts click on blocked children via capture handler', async () => {
    const childClick = vi.fn();
    const onBlocked = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} onBlocked={onBlocked}>
        <button type="button" onClick={childClick}>
          Onayla
        </button>
      </ApprovalEligibilityGuard>,
    );
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(childClick).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalled();
  });

  it('fires onBlocked once per unique reason signature on mount', () => {
    const onBlocked = vi.fn();
    render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} onBlocked={onBlocked}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onBlocked.mock.calls[0][0].reasons).toEqual([proposerSelf]);
  });

  it('lists multiple reasons as bullet list', () => {
    render(
      <ApprovalEligibilityGuard reasons={[proposerSelf, tierMismatch]} variant="banner">
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    expect(screen.getByText('Kendi onerinizi onaylayamazsiniz (4-eyes).')).toBeInTheDocument();
    expect(screen.getByText('Bu kademe icin yetkin yetersiz.')).toBeInTheDocument();
  });
});

describe('ApprovalEligibilityGuard — accessibility', () => {
  it('has no axe-core a11y violations when blocked (banner)', async () => {
    const { container } = render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} variant="banner">
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    await expectNoA11yViolations(container);
  });
});
