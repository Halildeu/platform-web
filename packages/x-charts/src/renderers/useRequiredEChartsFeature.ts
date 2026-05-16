/**
 * useRequiredEChartsFeature — PR-X16 ECharts Depth campaign.
 *
 * Drives a depth-chart wrapper through a lazy-registration lifecycle so
 * it never dispatches a `series.type` that ECharts has not registered
 * yet. Dispatching e.g. `series.type='tree'` before the lazy module
 * resolves makes ECharts log `Series tree is used but not imported.`
 * and render a blank canvas, so the wrapper must hold its option until
 * this hook reports `'ready'`.
 *
 * The 2-D analogue of `useRequiredEChartsGL` — but simpler: a depth
 * feature module (`echarts/lib/chart/tree`, etc.) ships inside the
 * already-deployed `echarts` package, so there is no capability probe
 * (no WebGL gate) and no permanent "unsupported host" state. The only
 * failure mode is a dynamic-import rejection (offline mid-session); the
 * retry happens naturally on the next mount.
 *
 * State machine:
 *   - 'idle'    — `enabled=false`, or the mount before the effect runs
 *   - 'loading' — dynamic import of the feature module in flight
 *   - 'ready'   — registered; the wrapper may dispatch its series option
 *   - 'error'   — the dynamic import rejected
 *
 * @see registerEChartsFeature — the underlying lazy import registry.
 * @see renderers/gl/useRequiredEChartsGL — the GL-pack sibling.
 */
import { useEffect, useState } from 'react';
import {
  ensureEChartsFeatureRegistered,
  isEChartsFeatureRegistered,
  type EChartsFeature,
} from './registerEChartsFeature';

/** Lifecycle state for {@link useRequiredEChartsFeature}. */
export type EChartsFeatureStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseRequiredEChartsFeatureOptions {
  /**
   * Gate the lifecycle. Default `true`. When `false` the hook stays
   * `'idle'` and never triggers the dynamic import — used by wrappers
   * that only need the feature when `data` is non-empty (an empty chart
   * renders an empty state and never dispatches a series, so paying the
   * lazy chunk would be wasted).
   */
  enabled?: boolean;
}

export interface UseRequiredEChartsFeatureResult {
  /** Current lifecycle state. */
  status: EChartsFeatureStatus;
  /** Original error when `status === 'error'`. */
  error?: Error;
}

/**
 * Lazy-register an ECharts depth feature and report a four-state
 * lifecycle so the chart wrapper can hold its `series` option until the
 * series type is registered.
 *
 * Behaviour:
 *   1. `enabled=false` → stays `{ status: 'idle' }`, no dynamic import.
 *   2. Feature already registered (a prior chart triggered it) →
 *      `{ status: 'ready' }` synchronously from the `useState` initializer.
 *   3. Otherwise → `{ status: 'loading' }`, then `{ status: 'ready' }`
 *      once the import resolves, or `{ status: 'error', error }` if it
 *      rejects.
 *
 * Cancellation: if the component unmounts while the import is in flight
 * the `setState` calls are no-ops. The underlying registration still
 * resolves and the cached flag flips, so the next mount sees `'ready'`.
 *
 * @example
 * ```tsx
 * const feature = useRequiredEChartsFeature('tree', { enabled: !isEmpty });
 * const ready = feature.status === 'ready';
 * const option = useMemo(() => (ready ? buildTreeOption() : null), [ready, ...]);
 * // safe to dispatch series.type='tree' only once `ready`
 * ```
 */
export function useRequiredEChartsFeature(
  feature: EChartsFeature,
  options?: UseRequiredEChartsFeatureOptions,
): UseRequiredEChartsFeatureResult {
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<UseRequiredEChartsFeatureResult>(() => {
    if (!enabled) return { status: 'idle' };
    if (isEChartsFeatureRegistered(feature)) return { status: 'ready' };
    return { status: 'idle' };
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    if (isEChartsFeatureRegistered(feature)) {
      setState({ status: 'ready' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    ensureEChartsFeatureRegistered(feature).then(
      () => {
        if (!cancelled) setState({ status: 'ready' });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [feature, enabled]);

  return state;
}
