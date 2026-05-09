/**
 * WebGL capability probe — Faz 21.11 PR-A0 (Codex thread `019e0e7a`
 * iter-2 verbatim pattern with SSR + isContextLost guards).
 *
 * The probe is intentionally minimal:
 *   1. SSR / jsdom guard — no `window`/`document` → unsupported.
 *   2. WebGL2 detection (preferred when present, but not required).
 *   3. WebGL1 fallback (`webgl` then legacy `experimental-webgl`).
 *   4. `isContextLost()` post-create check (Safari mobile / driver bug).
 *
 * Returns a stable {@link WebGLCapability} regardless of probe path so
 * downstream {@link chooseRenderer} can branch without exception
 * handling. Probe failures collapse to `supported: false` with a
 * diagnostic `reason` so telemetry / the design-lab renderer pill can
 * surface the actual cause.
 *
 * Cached at module scope after first call to avoid creating a throwaway
 * canvas on every chart render.
 */
import type { WebGLCapability } from './types';

let cached: WebGLCapability | null = null;

/**
 * Probe the current environment for WebGL support. Idempotent: the first
 * call runs the actual canvas probe; subsequent calls return the cached
 * result. Use {@link resetWebGLCapabilityCache} in tests to reset.
 */
export function detectWebGLCapability(): WebGLCapability {
  if (cached !== null) return cached;
  cached = runWebGLProbe();
  return cached;
}

/**
 * Test-only: drop the cached probe result so individual unit tests can
 * stub `document.createElement` and re-probe. Production code paths
 * never need to call this — the cache is correct for the lifetime of
 * the page.
 */
export function resetWebGLCapabilityCache(): void {
  cached = null;
}

function runWebGLProbe(): WebGLCapability {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { supported: false, webgl2: false, reason: 'ssr' };
  }

  try {
    const canvas = document.createElement('canvas');
    // Codex iter-4 absorb: a working WebGL2 context counts as supported
    // even when the legacy `'webgl'` lookup returns null. Some browsers
    // expose only the canonical WebGL2 backend; without this we would
    // report `supported: false, webgl2: true`, contradicting the type
    // contract.
    const webgl2Context = canvas.getContext('webgl2') as WebGLRenderingContext | null;
    const gl =
      webgl2Context ??
      canvas.getContext('webgl') ??
      // `experimental-webgl` is the legacy lookup key — still relevant
      // for old WebKit / IE Edge variants where the canonical key is
      // unavailable but a working context can be obtained anyway.
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    const webgl2 = webgl2Context !== null;

    if (!gl) {
      return { supported: false, webgl2, reason: 'context-unavailable' };
    }

    const lostFn = (gl as WebGLRenderingContext).isContextLost;
    const lost = typeof lostFn === 'function' && lostFn.call(gl);

    if (lost) {
      return { supported: false, webgl2, reason: 'context-lost' };
    }

    return { supported: true, webgl2 };
  } catch {
    return { supported: false, webgl2: false, reason: 'probe-failed' };
  }
}
