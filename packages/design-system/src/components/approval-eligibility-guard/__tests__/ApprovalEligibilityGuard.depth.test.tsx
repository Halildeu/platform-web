// @vitest-environment jsdom
// depth-keep: behavior depth tests for ApprovalEligibilityGuard (reason
// signature memoization, keyboard interception, variant switching, helpUrl).
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalEligibilityGuard } from '../ApprovalEligibilityGuard';
import type { EligibilityReason } from '../../../types/approval';

afterEach(() => cleanup());

const proposerSelf: EligibilityReason = {
  code: 'proposer_self',
  message: 'Kendi onerinizi onaylayamazsiniz.',
};

const tierMismatch: EligibilityReason = {
  code: 'tier_mismatch',
  message: 'Kademe yetersiz.',
};

describe('ApprovalEligibilityGuard — reason signature behavior', () => {
  it('does not re-fire onBlocked on rerender with identical reasons', () => {
    const onBlocked = vi.fn();
    const { rerender } = render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} onBlocked={onBlocked}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    rerender(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} onBlocked={onBlocked}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    // mount fires once; identical-signature rerender does not refire
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('re-fires onBlocked when reason signature changes', () => {
    const onBlocked = vi.fn();
    const { rerender } = render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} onBlocked={onBlocked}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    rerender(
      <ApprovalEligibilityGuard reasons={[proposerSelf, tierMismatch]} onBlocked={onBlocked}>
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    expect(onBlocked).toHaveBeenCalledTimes(2);
  });
});

describe('ApprovalEligibilityGuard — keyboard interception', () => {
  it('intercepts Enter key activation on blocked children', async () => {
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
    const btn = screen.getByRole('button', { name: 'Onayla' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(childClick).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalled();
  });
});

describe('ApprovalEligibilityGuard — variant switching', () => {
  it('eligible -> blocked transition adds data-blocked attribute', () => {
    function Harness({ blocked }: { blocked: boolean }) {
      return (
        <ApprovalEligibilityGuard reasons={blocked ? [proposerSelf] : []}>
          <button type="button">Onayla</button>
        </ApprovalEligibilityGuard>
      );
    }
    const { container, rerender } = render(<Harness blocked={false} />);
    expect(
      container
        .querySelector('[data-component="approval-eligibility-guard"]')
        ?.getAttribute('data-blocked'),
    ).toBe('false');
    rerender(<Harness blocked />);
    expect(container.querySelector('[data-blocked="true"]')).toBeInTheDocument();
  });

  it('silentTooltip omits Tooltip wrapper but still intercepts interaction', async () => {
    const childClick = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalEligibilityGuard reasons={[proposerSelf]} silentTooltip>
        <button type="button" onClick={childClick}>
          Onayla
        </button>
      </ApprovalEligibilityGuard>,
    );
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(childClick).not.toHaveBeenCalled();
  });

  it('helpUrl renders a "Detay" link in banner mode', () => {
    render(
      <ApprovalEligibilityGuard
        reasons={[
          { code: 'custom', message: 'Detayli aciklama', helpUrl: 'https://example.com/help' },
        ]}
        variant="banner"
      >
        <button type="button">Onayla</button>
      </ApprovalEligibilityGuard>,
    );
    const link = screen.getByRole('link', { name: 'Detay' });
    expect(link).toHaveAttribute('href', 'https://example.com/help');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('ApprovalEligibilityGuard — controlled blocked toggle', () => {
  it('does not call onBlocked when reasons cleared', () => {
    const onBlocked = vi.fn();
    function Harness() {
      const [blocked, setBlocked] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setBlocked(false)}>
            toggle
          </button>
          <ApprovalEligibilityGuard reasons={blocked ? [proposerSelf] : []} onBlocked={onBlocked}>
            <button type="button">Onayla</button>
          </ApprovalEligibilityGuard>
        </>
      );
    }
    render(<Harness />);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    // clear reasons -> guard passthrough, no new fire
    screen.getByRole('button', { name: 'toggle' }).click();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});
