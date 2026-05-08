// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { setAuthPhase } from '../../features/auth/model/auth.slice';
import { __resetMetricsForTesting, recordRefreshAttempt } from '@mfe/shared-http';

import { AuthDegradedBanner } from './AuthDegradedBanner';

const buildStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
    },
  });

describe('AuthDegradedBanner (PR-Obs-5)', () => {
  beforeEach(() => {
    __resetMetricsForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetMetricsForTesting();
    vi.useRealTimers();
  });

  it('does NOT render when phase=initializing within 30s window', () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={Date.now()} />
      </Provider>,
    );
    expect(screen.queryByTestId('auth-degraded-banner')).toBeNull();
  });

  it('renders slow-init banner when phase=cookieReady > 30s after bootstrap', () => {
    const store = buildStore();
    const fakeStart = Date.now() - 35_000;
    act(() => {
      store.dispatch(setAuthPhase('cookieReady'));
    });
    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={fakeStart} />
      </Provider>,
    );
    const banner = screen.getByTestId('auth-degraded-banner');
    expect(banner.getAttribute('data-reason')).toBe('slow-init');
  });

  it('does NOT render banner when phase=failed (root failed UI handles)', () => {
    const store = buildStore();
    const fakeStart = Date.now() - 60_000;
    act(() => {
      store.dispatch(setAuthPhase('failed'));
    });
    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={fakeStart} />
      </Provider>,
    );
    expect(screen.queryByTestId('auth-degraded-banner')).toBeNull();
  });

  it('renders recent-refresh-failures banner after 3 failures within 60s', async () => {
    const store = buildStore();
    act(() => {
      store.dispatch(setAuthPhase('transportReady'));
    });

    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={Date.now()} />
      </Provider>,
    );

    // Inject 3 refresh failures via the observability API; the
    // banner subscribes to metrics changes, but we explicitly tick
    // the throttle window for deterministic assertion.
    act(() => {
      recordRefreshAttempt('handler-threw');
      recordRefreshAttempt('refresh-closure-failed');
      recordRefreshAttempt('handler-threw');
    });

    // Advance the throttle window so the subscription notifies
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    // Then advance the banner's own 5s tick to refresh `now`
    await act(async () => {
      vi.advanceTimersByTime(5_500);
    });

    const banner = screen.getByTestId('auth-degraded-banner');
    expect(banner.getAttribute('data-reason')).toBe('recent-refresh-failures');
  });

  it('reload button calls window.location.reload', () => {
    const store = buildStore();
    const fakeStart = Date.now() - 60_000;
    act(() => {
      store.dispatch(setAuthPhase('cookieReady'));
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/dashboard' },
      writable: true,
    });

    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={fakeStart} />
      </Provider>,
    );

    const button = screen.getByTestId('auth-degraded-reload');
    fireEvent.click(button);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('login link preserves redirect param', () => {
    const store = buildStore();
    const fakeStart = Date.now() - 60_000;
    act(() => {
      store.dispatch(setAuthPhase('cookieReady'));
    });
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        pathname: '/dashboard',
        search: '?from=email',
        hash: '',
        reload: vi.fn(),
      },
      writable: true,
    });

    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={fakeStart} />
      </Provider>,
    );

    const link = screen.getByTestId('auth-degraded-login') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      `/login?redirect=${encodeURIComponent('/dashboard?from=email')}`,
    );
  });

  it('login link does not embed redirect when already on /login', () => {
    const store = buildStore();
    const fakeStart = Date.now() - 60_000;
    act(() => {
      store.dispatch(setAuthPhase('cookieReady'));
    });
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        pathname: '/login',
        search: '',
        hash: '',
        reload: vi.fn(),
      },
      writable: true,
    });

    render(
      <Provider store={store}>
        <AuthDegradedBanner testOnlyBootstrapStartAt={fakeStart} />
      </Provider>,
    );

    const link = screen.getByTestId('auth-degraded-login') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login');
  });
});
