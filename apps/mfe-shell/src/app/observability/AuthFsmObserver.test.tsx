// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { setAuthPhase, bumpAuthEpoch } from '../../features/auth/model/auth.slice';

const { mockEmit, mockRecordTransportReady } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockRecordTransportReady: vi.fn(),
}));

vi.mock('../telemetry/telemetry-client', () => ({
  default: { emit: mockEmit, trackPageView: vi.fn() },
}));

vi.mock('@mfe/shared-http', async () => {
  const actual = await vi.importActual<typeof import('@mfe/shared-http')>('@mfe/shared-http');
  return {
    ...actual,
    recordTransportReady: mockRecordTransportReady,
    getMetricsSnapshot: vi.fn(() => actual.getMetricsSnapshot()),
    subscribeMetrics: vi.fn(() => () => undefined),
  };
});

import { AuthFsmObserver } from './AuthFsmObserver';

const buildStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
    },
  });

describe('AuthFsmObserver (PR-Obs-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits phase-change telemetry on FSM transition', () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <AuthFsmObserver />
      </Provider>,
    );

    // initial phase is 'initializing'; first observation establishes
    // prevPhase. No emit yet.
    expect(mockEmit).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(setAuthPhase('keycloakReady'));
    });

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth_fsm_phase_change',
        payload: expect.objectContaining({
          from: 'initializing',
          to: 'keycloakReady',
        }),
      }),
    );
  });

  it('records transportReady ONCE per epoch even on re-render', () => {
    const store = buildStore();
    const { rerender } = render(
      <Provider store={store}>
        <AuthFsmObserver />
      </Provider>,
    );

    act(() => {
      store.dispatch(setAuthPhase('transportReady'));
    });

    // First transportReady dispatch records the gauge
    expect(mockRecordTransportReady).toHaveBeenCalledTimes(1);

    // Re-render at the same epoch — no double-count
    rerender(
      <Provider store={store}>
        <AuthFsmObserver />
      </Provider>,
    );
    expect(mockRecordTransportReady).toHaveBeenCalledTimes(1);

    // Dispatch transportReady again (e.g. refresh closure path)
    act(() => {
      store.dispatch(setAuthPhase('refreshing'));
      store.dispatch(setAuthPhase('transportReady'));
    });
    // Same epoch still — observer dedups
    expect(mockRecordTransportReady).toHaveBeenCalledTimes(1);
  });

  it('records new transportReady duration after epoch bump', () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <AuthFsmObserver />
      </Provider>,
    );

    act(() => {
      store.dispatch(setAuthPhase('transportReady'));
    });
    expect(mockRecordTransportReady).toHaveBeenCalledTimes(1);

    // bumpAuthEpoch (logout / re-login cycle)
    act(() => {
      store.dispatch(bumpAuthEpoch());
      store.dispatch(setAuthPhase('initializing'));
      store.dispatch(setAuthPhase('keycloakReady'));
      store.dispatch(setAuthPhase('cookieReady'));
      store.dispatch(setAuthPhase('authzReady'));
      store.dispatch(setAuthPhase('transportReady'));
    });

    // New epoch → new observation
    expect(mockRecordTransportReady).toHaveBeenCalledTimes(2);
  });

  it('emits periodic metric snapshots once per minute', async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <AuthFsmObserver />
      </Provider>,
    );

    // Just-mounted: no snapshot emit yet (interval-based)
    const snapshotCallsBefore = mockEmit.mock.calls.filter(
      (call) => call[0]?.type === 'auth_transport_metric_snapshot',
    ).length;
    expect(snapshotCallsBefore).toBe(0);

    // Advance 60s
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const snapshotCallsAfter = mockEmit.mock.calls.filter(
      (call) => call[0]?.type === 'auth_transport_metric_snapshot',
    ).length;
    expect(snapshotCallsAfter).toBe(1);
  });
});
