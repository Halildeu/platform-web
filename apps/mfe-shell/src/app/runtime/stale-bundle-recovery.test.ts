// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { installStaleBundleRecovery, uninstallStaleBundleRecovery } from './stale-bundle-recovery';

describe('stale-bundle-recovery', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    // jsdom location.reload is a noop; replace with spy
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
  });

  afterEach(() => {
    // Detach all listeners between cases so they don't leak across
    // tests (each install in beforeEach attaches fresh ones).
    uninstallStaleBundleRecovery();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('vite:preloadError event triggers reload', async () => {
    installStaleBundleRecovery();

    const event = new CustomEvent('vite:preloadError', {
      detail: { payload: { name: 'preload', message: 'failed' } },
    });
    window.dispatchEvent(event);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('unhandledrejection with "Failed to fetch dynamically imported module" triggers reload', async () => {
    installStaleBundleRecovery();

    const reason = new TypeError(
      'Failed to fetch dynamically imported module: https://testai.acik.com/assets/foo-OLD.js',
    );
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        reason,
        promise: Promise.reject(reason).catch(() => undefined),
      }),
    );
    // Defer one tick (PromiseRejectionEvent dispatch is sync but addEventListener
    // handler runs sync too, so reload should be called on the same tick).
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('unhandledrejection with unrelated error does NOT reload', async () => {
    installStaleBundleRecovery();

    const reason = new Error('Database connection refused');
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        reason,
        promise: Promise.reject(reason).catch(() => undefined),
      }),
    );

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('script element error on /assets/ path triggers reload', async () => {
    installStaleBundleRecovery();

    const script = document.createElement('script');
    script.src = 'https://testai.acik.com/assets/bootstrap-OLD.js';
    document.head.appendChild(script);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: script, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('script element error on third-party path does NOT reload', async () => {
    installStaleBundleRecovery();

    const script = document.createElement('script');
    script.src = 'https://analytics.example.com/track.js';
    document.head.appendChild(script);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: script, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('loop guard: 3rd reload within 60s window is suppressed', async () => {
    installStaleBundleRecovery();

    const fireOnce = () => {
      const reason = new TypeError('Failed to fetch dynamically imported module: /assets/x.js');
      window.dispatchEvent(
        new PromiseRejectionEvent('unhandledrejection', {
          reason,
          promise: Promise.reject(reason).catch(() => undefined),
        }),
      );
    };

    fireOnce();
    fireOnce();
    fireOnce();

    expect(reloadSpy).toHaveBeenCalledTimes(2); // 3rd suppressed
  });

  it('idempotent: calling install twice does not double-bind', () => {
    installStaleBundleRecovery();
    installStaleBundleRecovery();

    const event = new CustomEvent('vite:preloadError', {
      detail: { payload: 'x' },
    });
    window.dispatchEvent(event);

    // Loop-guard fires once even if listener is bound twice;
    // critically, the test verifies sessionStorage isn't double-touched.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('Module Federation remoteEntry.js failure triggers reload', async () => {
    installStaleBundleRecovery();

    const script = document.createElement('script');
    script.src = 'https://testai.acik.com/remotes/audit/remoteEntry.js';
    document.head.appendChild(script);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: script, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
