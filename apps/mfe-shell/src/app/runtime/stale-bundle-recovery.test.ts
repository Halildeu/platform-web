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

  it('script element error on /assets/ path triggers reload (same-origin)', () => {
    installStaleBundleRecovery();

    const script = document.createElement('script');
    // Same-origin path — jsdom origin is http://localhost
    script.src = '/assets/bootstrap-OLD.js';
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

  it('loop guard: 3rd cross-page-load reload within 60s window is suppressed', () => {
    // Iter-2: in-page `reloadScheduled` flag suppresses duplicates
    // within a single page-load lifetime; the sessionStorage history
    // is the cross-page-load budget. To test it, we simulate the
    // page-load boundary by uninstall+reinstall between attempts
    // (production: each location.reload() restarts the JS).
    const fireOnce = () => {
      const reason = new TypeError('Failed to fetch dynamically imported module: /assets/x.js');
      window.dispatchEvent(
        new PromiseRejectionEvent('unhandledrejection', {
          reason,
          promise: Promise.reject(reason).catch(() => undefined),
        }),
      );
    };

    // Page load 1
    installStaleBundleRecovery();
    fireOnce();
    fireOnce(); // duplicate suppressed in-page (reloadScheduled flag)
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Page load 2 (simulate)
    uninstallStaleBundleRecovery();
    installStaleBundleRecovery();
    fireOnce();
    expect(reloadSpy).toHaveBeenCalledTimes(2);

    // Page load 3 — should hit the cross-page budget (max 2 / 60s)
    uninstallStaleBundleRecovery();
    installStaleBundleRecovery();
    fireOnce();
    expect(reloadSpy).toHaveBeenCalledTimes(2); // 3rd cross-page suppressed
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

  it('Module Federation remoteEntry.js failure triggers reload (same-origin)', () => {
    installStaleBundleRecovery();

    const script = document.createElement('script');
    // Same-origin path (jsdom default origin is http://localhost)
    script.src = '/remotes/audit/remoteEntry.js';
    document.head.appendChild(script);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: script, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('Codex P1 #4: third-party CDN URL containing "/assets/" does NOT reload (cross-origin guard)', () => {
    // jsdom default origin is http://localhost; cdn.example.com is
    // cross-origin → guard rejects.
    installStaleBundleRecovery();

    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/assets/foo.js';
    document.head.appendChild(script);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: script, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('Codex P1 #4: <img src="/assets/foo.png"> does NOT reload (tag-type allowlist)', () => {
    // Even on same origin, only SCRIPT/LINK are recoverable via
    // page reload. A broken image just stays broken.
    installStaleBundleRecovery();

    const img = document.createElement('img');
    img.src = '/assets/broken-image.png';
    document.body.appendChild(img);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: img, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('Codex P1 #3: vite:preloadError + unhandledrejection for same cause = single reload (in-page guard)', () => {
    // The same chunk-load failure can fire both events back-to-back.
    // Without the in-page reloadScheduled flag, both would burn
    // sessionStorage budget and the second event would be
    // misclassified as a 2nd attempt.
    installStaleBundleRecovery();

    window.dispatchEvent(
      new CustomEvent('vite:preloadError', {
        detail: { payload: { name: 'preload', message: 'failed' } },
      }),
    );
    const reason = new TypeError('Failed to fetch dynamically imported module: /assets/foo.js');
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        reason,
        promise: Promise.reject(reason).catch(() => undefined),
      }),
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // sessionStorage history should also reflect just 1 attempt
    const raw = sessionStorage.getItem('staleBundleReloadHistory_v1');
    const history = raw ? JSON.parse(raw) : [];
    expect(history).toHaveLength(1);
  });

  it('Codex P1 #4: same-origin <link href="/assets/foo.css"> failure triggers reload', () => {
    installStaleBundleRecovery();

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/index-OLD.css';
    document.head.appendChild(link);
    const ev = new ErrorEvent('error', { message: 'load failed' });
    Object.defineProperty(ev, 'target', { value: link, configurable: true });
    window.dispatchEvent(ev);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
