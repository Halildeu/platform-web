// @vitest-environment jsdom
/**
 * useRequiredEChartsFeature hook unit tests — PR-X16a.
 *
 * The registration module is mocked so the four lifecycle states
 * (idle / loading / ready / error) are driven deterministically without
 * a real dynamic import.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Hoisted mock fns so the `vi.mock` factory can close over them.
const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  isRegistered: vi.fn(() => false),
}));

vi.mock('../registerEChartsFeature', () => ({
  ensureEChartsFeatureRegistered: mocks.ensure,
  isEChartsFeatureRegistered: mocks.isRegistered,
}));

import { useRequiredEChartsFeature } from '../useRequiredEChartsFeature';

function Probe({ enabled }: { enabled?: boolean }) {
  const { status, error } = useRequiredEChartsFeature('tree', { enabled });
  return (
    <div data-testid="probe" data-status={status} data-error={error?.message ?? ''}>
      {status}
    </div>
  );
}

const statusOf = (c: HTMLElement): string =>
  c.querySelector('[data-testid="probe"]')?.getAttribute('data-status') ?? '';
const errorOf = (c: HTMLElement): string =>
  c.querySelector('[data-testid="probe"]')?.getAttribute('data-error') ?? '';

beforeEach(() => {
  mocks.ensure.mockReset();
  mocks.isRegistered.mockReset();
  mocks.isRegistered.mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useRequiredEChartsFeature', () => {
  it('stays idle when enabled=false and never triggers registration', () => {
    const { container } = render(<Probe enabled={false} />);
    expect(statusOf(container)).toBe('idle');
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('reports ready synchronously when the feature is already registered', () => {
    mocks.isRegistered.mockReturnValue(true);
    const { container } = render(<Probe enabled />);
    expect(statusOf(container)).toBe('ready');
    // No dynamic import when the feature is already on the core namespace.
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('transitions to loading while the dynamic import is in flight', () => {
    mocks.ensure.mockReturnValue(new Promise<void>(() => {})); // never settles
    const { container } = render(<Probe enabled />);
    expect(statusOf(container)).toBe('loading');
    expect(mocks.ensure).toHaveBeenCalledWith('tree');
  });

  it('transitions loading -> ready when registration resolves', async () => {
    mocks.ensure.mockResolvedValue(undefined);
    const { container } = render(<Probe enabled />);
    await waitFor(() => expect(statusOf(container)).toBe('ready'));
  });

  it('transitions to error when registration rejects', async () => {
    mocks.ensure.mockRejectedValue(new Error('tree chunk failed'));
    const { container } = render(<Probe enabled />);
    await waitFor(() => expect(statusOf(container)).toBe('error'));
    expect(errorOf(container)).toBe('tree chunk failed');
  });

  it('defaults `enabled` to true', () => {
    mocks.ensure.mockReturnValue(new Promise<void>(() => {}));
    const { container } = render(<Probe />);
    expect(statusOf(container)).toBe('loading');
  });
});
