import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { CapabilityState } from '../CapabilityState';

/**
 * S4a presentation contract: retry ONLY for retryable kinds, `alert` vs `status`
 * role by severity, copy is overridable, and no raw error is required (the
 * component never inspects one).
 */

afterEach(cleanup);

describe('CapabilityState', () => {
  it('renders default i18n title + description for a kind (no literal-key leakage)', () => {
    render(<CapabilityState kind="notEnabled" testId="cs" />);
    const title = screen.getByTestId('cs-title');
    // A missing i18n key would fall through to the literal key string.
    expect(title.textContent).not.toContain('endpointAdmin.capabilityState');
    expect(title.textContent).toBeTruthy();
  });

  it('offers a retry ONLY for retryable kinds, and calls onRetry', () => {
    const onRetry = vi.fn();
    render(<CapabilityState kind="error" testId="cs" onRetry={onRetry} />);
    const retry = screen.getByTestId('cs-retry');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders NO retry for a non-retryable kind even when onRetry is supplied', () => {
    render(<CapabilityState kind="forbidden" testId="cs" onRetry={() => undefined} />);
    expect(screen.queryByTestId('cs-retry')).toBeNull();
  });

  it('temporarilyUnavailable is retryable; forbidden/notEnabled/disabled/empty are not', () => {
    const { rerender } = render(
      <CapabilityState kind="temporarilyUnavailable" testId="cs" onRetry={() => undefined} />,
    );
    expect(screen.getByTestId('cs-retry')).toBeTruthy();
    // rerender updates the same root in place — no cleanup between (that would unmount it).
    for (const kind of ['forbidden', 'notEnabled', 'disabled', 'empty'] as const) {
      rerender(<CapabilityState kind={kind} testId="cs" onRetry={() => undefined} />);
      expect(screen.queryByTestId('cs-retry')).toBeNull();
    }
  });

  it('uses role=alert for error/temporarilyUnavailable, role=status otherwise', () => {
    render(<CapabilityState kind="error" testId="cs-err" />);
    expect(screen.getByTestId('cs-err').getAttribute('role')).toBe('alert');
    cleanup();
    render(<CapabilityState kind="forbidden" testId="cs-forbidden" />);
    expect(screen.getByTestId('cs-forbidden').getAttribute('role')).toBe('status');
  });

  it('honors copy overrides (module-level vs resource-level need not share one sentence)', () => {
    render(
      <CapabilityState
        kind="forbidden"
        testId="cs"
        title="Bu politikayı yönetme yetkiniz yok"
        description="özel açıklama"
      />,
    );
    expect(screen.getByTestId('cs-title').textContent).toBe('Bu politikayı yönetme yetkiniz yok');
    expect(screen.getByText('özel açıklama')).toBeTruthy();
  });

  it('exposes the kind via data-capability-kind for styling/e2e', () => {
    render(<CapabilityState kind="disabled" testId="cs" />);
    expect(screen.getByTestId('cs').getAttribute('data-capability-kind')).toBe('disabled');
  });
});
