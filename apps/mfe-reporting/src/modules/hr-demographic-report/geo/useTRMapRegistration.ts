/**
 * useTRMapRegistration — React hook that lazy-imports the TR GeoJSON
 * asset, normalizes it (stamps `properties.code` + asserts the 81
 * invariant), and registers it with `@mfe/x-charts` GeoMap under the
 * `'TR'` map name.
 *
 * Why a hook (not a top-level side-effect):
 *   - `ensureGeoMapRegistered` is async; the consumer needs to know
 *     when registration is `ready` before rendering `<GeoMap mapName="TR" />`,
 *     otherwise the first render emits a `option.series.map` referring to
 *     an unregistered map and ECharts silently no-ops. Codex 019e26a9 plan-time
 *     iter-1 must-fix #3.
 *   - Errors during fetch / normalize must surface to the UI (not
 *     swallowed in console), otherwise the dashboard renders an
 *     unbranded empty box.
 *   - Strict-mode re-mount safety: `ensureGeoMapRegistered` is idempotent;
 *     a second call with the same map name short-circuits via
 *     `isGeoMapRegistered`. The hook leverages this for the initial
 *     `ready` check so a remount after the asset is loaded skips the
 *     async dance.
 *
 * Vite chunk strategy: the dynamic import (`import('./assets/...')`)
 * splits the 235 KB GeoJSON into its own bundle entry. Consumers that
 * never mount `LocationGeoMap` never pay the asset cost.
 */
import { useEffect, useState } from 'react';
import { ensureGeoMapRegistered, isGeoMapRegistered } from '@mfe/x-charts';
import { normalizeTRGeoJson, type TRGeoFeatureCollection } from './normalizeTRGeoJson';

const TR_MAP_NAME = 'TR';

export interface TRMapRegistrationState {
  /** True once GeoMap is registered with the normalized GeoJSON. */
  ready: boolean;
  /** Populated if asset fetch / normalize / register throws. */
  error: Error | null;
}

/**
 * Lazy-load + register the TR GeoJSON map exactly once per mount tree.
 *
 * Returns `{ ready, error }` for the consumer to gate rendering:
 *
 * ```tsx
 * const { ready, error } = useTRMapRegistration();
 * if (error) return <ErrorPanel message={error.message} />;
 * if (!ready) return <Skeleton variant="map" />;
 * return <GeoMap mapName="TR" nameProperty="code" data={...} />;
 * ```
 */
export function useTRMapRegistration(): TRMapRegistrationState {
  // Codex 019e26a9 iter-3 must-fix #4: initial `ready` mümkünse
  // `isGeoMapRegistered('TR')` ile başlasın — strict-mode double-mount
  // veya navigation re-entry için skip-async fast path.
  const [state, setState] = useState<TRMapRegistrationState>(() => ({
    ready: isGeoMapRegistered(TR_MAP_NAME),
    error: null,
  }));

  useEffect(() => {
    // Already registered (initial state covers strict-mode + navigation
    // re-entry); nothing to do.
    if (state.ready && !state.error) return;

    let cancelled = false;

    void ensureGeoMapRegistered(TR_MAP_NAME, async () => {
      // Dynamic import → Vite chunk. The `.json` import is typed as
      // `unknown` by Vite's default JSON module handling; we cast to
      // our minimal shape (validated by normalizeTRGeoJson).
      const mod = (await import('./assets/tr-provinces.geo.json')) as
        | { default: TRGeoFeatureCollection }
        | TRGeoFeatureCollection;
      const raw =
        'default' in mod && mod.default
          ? (mod.default as TRGeoFeatureCollection)
          : (mod as TRGeoFeatureCollection);
      return normalizeTRGeoJson(raw);
    })
      .then(() => {
        if (!cancelled) {
          setState({ ready: true, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const error =
            err instanceof Error
              ? err
              : new Error(
                  typeof err === 'string'
                    ? err
                    : 'useTRMapRegistration: unknown error during GeoJSON load',
                );
          setState({ ready: false, error });
        }
      });

    return () => {
      cancelled = true;
    };
    // Intentionally empty dep array: registration is a one-shot side
    // effect per mount tree. The early-return on `state.ready` above
    // covers the strict-mode double-effect case.
  }, []);

  return state;
}
