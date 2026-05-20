/**
 * useRequiredEChartsLiquidFill — Faz 21.11 Campaign 4 LiquidFillChart
 * lazy load + state machine hook (mirrors useRequiredEChartsGL).
 *
 * Drives a LiquidFillChart wrapper's lifecycle through a four-state
 * machine so the wrapper never dispatches a `'liquidFill'` option
 * before the lazy chunk has registered the series type. ECharts core
 * would otherwise log `Series liquidFill is used but not imported`
 * and leave a blank container.
 *
 * Unlike 3D wrappers (echarts-gl) we DO NOT need a WebGL probe; the
 * liquid-fill series renders on standard Canvas/SVG so the only gate
 * is the dynamic import resolving. Codex thread 019e4301 iter-1
 * AGREE.
 *
 * State machine:
 *
 *   - 'idle'         → enabled=false OR component just mounted
 *   - 'loading'      → dynamic `import('echarts-liquidfill')` in flight
 *   - 'ready'        → registration resolved; chart can dispatch its
 *                       `'liquidFill'` series option
 *   - 'unsupported'  → the dynamic import rejected. Caller should
 *                       render an empty/error state, NOT a fallback
 *                       chart type — there is no canvas substitute.
 */
import { useEffect, useState } from 'react';
import {
  isEChartsLiquidFillRegistered,
  registerEChartsLiquidFill,
} from './registerEChartsLiquidFill';

/** Lifecycle state for {@link useRequiredEChartsLiquidFill}. */
export type EChartsLiquidFillStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

/** Why the helper rejected — surfaced for telemetry / dev DX. */
export type EChartsLiquidFillUnsupportedReason = 'liquidfill-import-failed' | 'disabled';

export interface UseRequiredEChartsLiquidFillOptions {
  /**
   * Gate the lifecycle. Default `true`. When `false` the hook stays
   * in 'idle' — useful for wrappers that only need the chunk when
   * data is present (avoids paying the lazy chunk for an empty
   * placeholder).
   */
  enabled?: boolean;
}

export interface UseRequiredEChartsLiquidFillResult {
  /** Current lifecycle state. */
  status: EChartsLiquidFillStatus;
  /**
   * When `status === 'unsupported'`, why. Mirrors the
   * registration-failure path.
   */
  reason?: EChartsLiquidFillUnsupportedReason;
  /** Original error if the dynamic import rejected. */
  error?: Error;
}

/**
 * Lazy-load `echarts-liquidfill` and report a four-state lifecycle so
 * the LiquidFillChart wrapper can branch its render path safely.
 *
 * Behaviour:
 *
 *   1. SSR or `enabled=false` → returns `{ status: 'idle' }`.
 *   2. Already registered → returns `{ status: 'ready' }` synchronously.
 *   3. Otherwise → `{ status: 'loading' }` then `{ status: 'ready' }`
 *      once the import resolves. Errors transition to
 *      `{ status: 'unsupported', reason: 'liquidfill-import-failed', error }`.
 *
 * Cancellation: if the component unmounts while the dynamic import is
 * in flight, the `setState` calls are no-ops (cancelled flag). The
 * underlying registration promise still resolves and the cached flag
 * flips, so the next mount sees `'ready'` synchronously.
 *
 * @example minimal wrapper guard
 * ```tsx
 * const liquidfill = useRequiredEChartsLiquidFill({ enabled: !isEmpty });
 * if (liquidfill.status === 'unsupported') return <Unsupported />;
 * if (liquidfill.status !== 'ready') return <Loading />;
 * // safe to dispatch series.type='liquidFill' now
 * ```
 */
export function useRequiredEChartsLiquidFill(
  options?: UseRequiredEChartsLiquidFillOptions,
): UseRequiredEChartsLiquidFillResult {
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<UseRequiredEChartsLiquidFillResult>(() => {
    if (!enabled) return { status: 'idle', reason: 'disabled' };
    if (isEChartsLiquidFillRegistered()) return { status: 'ready' };
    return { status: 'idle' };
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', reason: 'disabled' });
      return;
    }

    if (isEChartsLiquidFillRegistered()) {
      setState({ status: 'ready' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    registerEChartsLiquidFill().then(
      () => {
        if (cancelled) return;
        setState({ status: 'ready' });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'unsupported', reason: 'liquidfill-import-failed', error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

/**
 * Human-readable copy for the unsupported banner that LiquidFillChart
 * renders when the chunk fails to load.
 */
export function describeEChartsLiquidFillReason(
  reason?: EChartsLiquidFillUnsupportedReason,
): string {
  switch (reason) {
    case 'liquidfill-import-failed':
      return 'Sıvı doluluk grafiği yüklenemedi. Ağ bağlantınızı kontrol edip sayfayı yenileyin.';
    case 'disabled':
      return 'Sıvı doluluk grafiği bu görsel için devre dışı.';
    default:
      return 'Sıvı doluluk grafiği yüklenirken bir sorun oluştu.';
  }
}
