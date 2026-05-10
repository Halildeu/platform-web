/**
 * Stale-bundle deploy recovery (2026-05-10).
 *
 * <p>Problem class: when a Vite/Module-Federation SPA gets re-deployed
 * while a tab is open, the running app holds references to the OLD
 * hashed asset filenames (e.g. {@code bootstrap-DXLrVsh1.js}). The
 * NEW image only contains the NEW hashed filenames, so any subsequent
 * dynamic import — route change, lazy chunk, MFE remote, image-bundle
 * preload — fails with a 404. The user sees a blank page or a "module
 * load failed" overlay and reads it as "site is broken / not opening."
 *
 * <p>nginx is already configured correctly:
 * <ul>
 *   <li>{@code index.html}, {@code mf-entry-bootstrap-0.js},
 *       {@code remoteEntry.js} → {@code Cache-Control: no-store}</li>
 *   <li>Hashed assets ({@code assets/*.js}, {@code assets/*.css}) →
 *       {@code public, max-age=3600, immutable}</li>
 * </ul>
 *
 * <p>So the failure is NOT a header bug — it's a runtime bug: the
 * already-running app needs to detect "I'm trying to load an asset
 * that no longer exists" and recover by reloading the page (which
 * re-fetches index.html with {@code no-store} → fresh asset hashes).
 *
 * <p>This module installs three early listeners:
 * <ol>
 *   <li>{@code vite:preloadError} — Vite's native event for static
 *       {@code import()} preload failures.</li>
 *   <li>{@code unhandledrejection} — catches dynamic
 *       {@code import()} failures + Module Federation
 *       {@code remoteEntry.js} chunk-load failures.</li>
 *   <li>{@code error} (capture phase) — catches
 *       {@code <script>}/{@code <link>} element load failures
 *       (legacy + ESM module script tags).</li>
 * </ol>
 *
 * <p>Loop guard: a tab that infinite-reloads on a real persistent
 * problem (e.g. CDN outage, cluster down) is worse than a stale-bundle
 * problem. Track reload attempts in {@code sessionStorage} keyed by
 * a 60-second window. If we already auto-reloaded twice in that
 * window, stop reloading and surface a console warning instead so a
 * human can intervene.
 */

const SESSION_KEY_RELOAD_HISTORY = 'staleBundleReloadHistory_v1';
const RELOAD_WINDOW_MS = 60_000;
const MAX_RELOADS_PER_WINDOW = 2;

/**
 * Heuristic: does this Error/event look like a stale-asset failure?
 * Patterns we treat as "yes":
 * <ul>
 *   <li>Message contains 'Failed to fetch dynamically imported module'
 *       or 'Importing a module script failed' (Vite/Webpack/native ESM
 *       wording variants across browsers).</li>
 *   <li>Message contains 'ChunkLoadError' (Webpack-style; Module
 *       Federation lib also uses this in some adapters).</li>
 *   <li>Message contains URL fragments like {@code /assets/} which
 *       indicates a hashed-asset request (the high-confidence stale
 *       case for our build pipeline).</li>
 * </ul>
 * False positives are tolerable here — a spurious reload is far less
 * harmful than a tab stuck on a blank screen.
 */
const looksLikeStaleAssetFailure = (input: unknown): boolean => {
  if (!input) return false;
  const message =
    input instanceof Error
      ? `${input.name}: ${input.message}`
      : typeof input === 'string'
        ? input
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('chunkloaderror') ||
    lower.includes('error loading dynamically imported module') ||
    // Module Federation wording variants
    lower.includes('script error for') ||
    // Generic 404 on a hashed asset path
    (lower.includes('/assets/') && (lower.includes('404') || lower.includes('not found')))
  );
};

/**
 * Returns true if we are still under the per-window reload budget,
 * AND records the new reload attempt timestamp on the spot. Returns
 * false if the budget is exhausted (caller should NOT reload).
 */
const shouldAutoReload = (): boolean => {
  if (typeof window === 'undefined') return false;
  let history: number[] = [];
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY_RELOAD_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        history = parsed.filter((t): t is number => typeof t === 'number');
      }
    }
  } catch {
    // Privacy mode / disabled storage / corrupt JSON — treat as empty,
    // proceed best-effort. The risk in this branch is higher
    // false-negative (skip reload), but the legitimate stale-bundle
    // case will still surface to the user via console.error so a
    // human can manually reload.
  }
  const now = Date.now();
  const recent = history.filter((t) => now - t < RELOAD_WINDOW_MS);
  if (recent.length >= MAX_RELOADS_PER_WINDOW) {
    return false;
  }
  recent.push(now);
  try {
    window.sessionStorage.setItem(SESSION_KEY_RELOAD_HISTORY, JSON.stringify(recent));
  } catch {
    // best-effort
  }
  return true;
};

/**
 * In-page guard: once the FIRST stale-asset failure schedules a
 * reload, suppress further triggers in this tick / this tab life.
 * Prevents the same underlying chunk-load failure from burning two
 * sessionStorage budget slots when both `vite:preloadError` AND
 * `unhandledrejection` fire for the same root cause (Codex 019e1372
 * P1 #3 absorb).
 */
let reloadScheduled = false;

const triggerReload = (reason: string): void => {
  if (typeof window === 'undefined') return;
  if (reloadScheduled) {
    console.debug(
      `[stale-bundle] reload already scheduled; ignoring duplicate signal. Reason: ${reason}`,
    );
    return;
  }
  if (!shouldAutoReload()) {
    console.error(
      `[stale-bundle] auto-reload budget exhausted (${MAX_RELOADS_PER_WINDOW}/${RELOAD_WINDOW_MS}ms); not reloading. Reason: ${reason}. Manual hard-reload (Cmd+Shift+R / Ctrl+F5) recommended.`,
    );
    return;
  }
  reloadScheduled = true;
  console.warn(
    `[stale-bundle] detected stale asset failure; reloading page once. Reason: ${reason}`,
  );
  // location.reload() fetches a fresh index.html (which has no-store
  // cache header), so subsequent requests pull the new asset hashes.
  // This preserves the URL pathname + query (auth code in fragment is
  // preserved too) so a mid-flow user lands back at the same logical
  // place.
  window.location.reload();
};

/**
 * Same-origin URL guard for element-error reloads (Codex 019e1372
 * P1 #4 absorb). Returns true if {@code url} is parseable, on the
 * current window's origin, and points at one of our hashed-asset
 * paths. Rejects:
 *   - cross-origin URLs (third-party CDN, analytics, ads)
 *   - schema-relative or javascript: URLs
 *   - non-asset paths even on same origin
 */
const isOwnAssetUrl = (url: string): boolean => {
  if (typeof window === 'undefined') return false;
  if (!url || typeof url !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return false;
  }
  if (parsed.origin !== window.location.origin) {
    return false;
  }
  return parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/remotes/');
};

type ListenerSpec = {
  type: string;
  handler: (event: Event) => void;
  capture: boolean;
};

let installedListeners: ListenerSpec[] | null = null;

/**
 * Install the stale-bundle recovery listeners. Idempotent — calling
 * twice while still installed is a no-op (returns the existing
 * teardown). Should be called as early as possible in the bootstrap
 * sequence so even errors during initial chunk load are caught.
 *
 * <p>Returns a teardown function. Tests use the teardown to ensure
 * isolation between cases; production never calls it.
 */
export const installStaleBundleRecovery = (): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {
      /* no-op */
    };
  }
  if (installedListeners) {
    // Idempotent: already installed; return teardown for the
    // existing bindings.
    return uninstallStaleBundleRecovery;
  }

  const handlers: ListenerSpec[] = [];

  // 1. Vite-native preload error (static `import()` chunks).
  // Vite emits this CustomEvent when a `<link rel="modulepreload">`
  // 404s, BEFORE the fallback retry fires. Most reliable signal.
  const onPreloadError = (event: Event) => {
    const ce = event as CustomEvent<{ payload?: unknown }>;
    triggerReload(`vite:preloadError ${JSON.stringify(ce.detail?.payload ?? '')}`);
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  handlers.push({ type: 'vite:preloadError', handler: onPreloadError, capture: false });

  // 2. Unhandled promise rejections — covers:
  //    - dynamic `import()` calls that reject (route loaders,
  //      lazy components)
  //    - Module Federation `loadRemote()` adapter rejections
  //    - any `await fetch(...)` of a hashed-asset URL that 404s and
  //      whose error path bubbles up uncaught
  const onUnhandledRejection = (event: Event) => {
    const e = event as PromiseRejectionEvent;
    if (looksLikeStaleAssetFailure(e.reason)) {
      triggerReload(`unhandledrejection ${String(e.reason).slice(0, 200)}`);
    }
  };
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  handlers.push({
    type: 'unhandledrejection',
    handler: onUnhandledRejection,
    capture: false,
  });

  // 3. Element load errors (capture phase to catch SCRIPT and LINK
  //    failures from any tree depth). For ESM module scripts that
  //    fail to load, browsers fire 'error' on the <script> element.
  //    Iter-2 (Codex 019e1372 P1 #4 absorb): tag-type allowlist
  //    (SCRIPT/LINK only — ignore broken <img>) AND URL is parsed +
  //    same-origin checked before triggering reload (defends against
  //    a third-party CDN URL that happens to contain '/assets/').
  const onElementError = (event: Event) => {
    const target = (event as ErrorEvent).target as Element | null;
    if (!target) return;
    const tag = target.nodeName;
    if (tag !== 'SCRIPT' && tag !== 'LINK') return;
    const url =
      tag === 'SCRIPT' ? (target as HTMLScriptElement).src : (target as HTMLLinkElement).href;
    if (!isOwnAssetUrl(url)) return;
    triggerReload(`element error ${tag.toLowerCase()} ${url.slice(0, 200)}`);
  };
  window.addEventListener('error', onElementError, /* useCapture */ true);
  handlers.push({ type: 'error', handler: onElementError, capture: true });

  installedListeners = handlers;
  return uninstallStaleBundleRecovery;
};

/**
 * Detach the listeners installed by {@link installStaleBundleRecovery}.
 * Production code never calls this; it exists for test isolation
 * between cases that simulate distinct deploy scenarios.
 */
export const uninstallStaleBundleRecovery = (): void => {
  if (typeof window === 'undefined') return;
  if (installedListeners) {
    for (const spec of installedListeners) {
      window.removeEventListener(spec.type, spec.handler, spec.capture);
    }
    installedListeners = null;
  }
  // Reset the in-page reload-scheduled flag too, so tests that
  // simulate distinct deploy scenarios start clean. Production never
  // calls uninstall.
  reloadScheduled = false;
};
