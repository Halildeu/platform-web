/**
 * useRequiredEChartsGL — Faz 21.11 P1a (3D Extension Pack foundation).
 *
 * Drives a 3D chart wrapper's lifecycle through a four-state machine
 * so the wrapper never silently falls back to canvas / SVG when the
 * caller asked for a 3D chart that the host can't render. ScatterChart
 * (PR-A1.5) uses an opportunistic WebGL path with canvas fallback;
 * 3D wrappers (`scatter3D`, `surface`, `lines3D`, `globe`) cannot do
 * that — there is no 2D substitute, so the wrapper must surface a
 * graceful "unsupported" state instead of dispatching a malformed
 * option.
 *
 * Codex thread `019e10ab` iter-1 verdict (REVISE → A-prime sequencing):
 * a dedicated helper is preferred over inlining the gate per wrapper
 * because the four wrappers share the same lifecycle (lazy import +
 * capability gate + cancellation safety) and any divergence between
 * them would make the bundle-guard / a11y union audit flakier.
 *
 * State machine:
 *
 *   - 'idle'         → enabled=false OR component just mounted (rare;
 *                       only possible if the wrapper hasn't yet asked
 *                       for the helper to start)
 *   - 'loading'      → WebGL probe passed, dynamic `import('echarts-gl')`
 *                       in flight
 *   - 'ready'        → registration resolved; chart can dispatch its
 *                       3D series option
 *   - 'unsupported'  → WebGL probe failed (SSR, Safari context loss,
 *                       no GPU, etc.) OR the dynamic import rejected.
 *                       Caller should render an empty/error state, NOT
 *                       a canvas fallback.
 *
 * @see registerEChartsGL — the underlying lazy import.
 * @see detectWebGLCapability — the WebGL probe (PR-A1 / Codex 019e0e7a).
 */
import { useEffect, useState } from 'react';
import { detectWebGLCapability } from '../detectWebGLCapability';
import { isEChartsGLRegistered, registerEChartsGL } from './registerEChartsGL';

/** Lifecycle state for {@link useRequiredEChartsGL}. */
export type EChartsGLStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

/** Why the helper rejected — surfaced for telemetry / dev DX. */
export type EChartsGLUnsupportedReason = 'webgl-unavailable' | 'gl-import-failed' | 'disabled';

export interface UseRequiredEChartsGLOptions {
  /**
   * Gate the lifecycle. Default `true`. When `false` the hook stays
   * in 'idle' — useful for wrappers that only need GL when the
   * `data` prop is non-empty (avoids paying the ~150 KB lazy chunk
   * for an empty chart that won't render anyway).
   */
  enabled?: boolean;
}

export interface UseRequiredEChartsGLResult {
  /** Current lifecycle state. */
  status: EChartsGLStatus;
  /**
   * When `status === 'unsupported'`, why. Mirrors the WebGL probe's
   * `reason` field where applicable; falls back to `'gl-import-failed'`
   * when the probe passed but the dynamic import rejected.
   */
  reason?: EChartsGLUnsupportedReason;
  /** Original error if the dynamic import rejected. */
  error?: Error;
}

/**
 * Lazy-load `echarts-gl` and report a four-state lifecycle so 3D
 * chart wrappers can branch their render path safely.
 *
 * Behaviour:
 *
 *   1. SSR or `enabled=false` → returns `{ status: 'idle' }`.
 *   2. WebGL unsupported → `{ status: 'unsupported', reason: 'webgl-unavailable' }`.
 *      The dynamic import is skipped.
 *   3. WebGL supported + GL not yet registered → `{ status: 'loading' }`,
 *      then `{ status: 'ready' }` once the import resolves. Errors
 *      transition to `{ status: 'unsupported', reason: 'gl-import-failed', error }`.
 *   4. WebGL supported + GL already registered (subsequent mounts in
 *      the same session) → returns `{ status: 'ready' }` synchronously.
 *
 * Cancellation: if the component unmounts while the dynamic import is
 * in flight, the `setState` calls are no-ops (cancelled flag). The
 * underlying registration promise still resolves and the cached flag
 * flips, so the next mount sees `'ready'` synchronously.
 *
 * @example minimal wrapper guard
 * ```tsx
 * const gl = useRequiredEChartsGL({ enabled: !isEmpty });
 * if (gl.status === 'unsupported') return <Unsupported reason={gl.reason} />;
 * if (gl.status !== 'ready') return <Loading />;
 * // safe to dispatch series.type='scatter3D' now
 * ```
 */
export function useRequiredEChartsGL(
  options?: UseRequiredEChartsGLOptions,
): UseRequiredEChartsGLResult {
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<UseRequiredEChartsGLResult>(() => {
    if (!enabled) return { status: 'idle', reason: 'disabled' };
    if (isEChartsGLRegistered()) return { status: 'ready' };
    return { status: 'idle' };
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', reason: 'disabled' });
      return;
    }

    if (isEChartsGLRegistered()) {
      setState({ status: 'ready' });
      return;
    }

    // Probe BEFORE issuing the dynamic import — there's no point
    // paying the ~150 KB chunk for a host that can't render a WebGL
    // canvas. The probe is cached at module scope so this is cheap.
    const cap = detectWebGLCapability();
    if (!cap.supported) {
      setState({ status: 'unsupported', reason: 'webgl-unavailable' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    registerEChartsGL().then(
      () => {
        if (cancelled) return;
        setState({ status: 'ready' });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'unsupported', reason: 'gl-import-failed', error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
