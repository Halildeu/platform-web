/**
 * registerGeoMap — idempotent geo map registration helper.
 *
 * PR-X12c (Codex thread 019e2254 AGREE iter-1). ECharts requires
 * `echarts.registerMap(name, geoJson)` BEFORE a `MapChart` series can
 * render with `series.map = name`. We do NOT bundle map JSON inside
 * `@mfe/x-charts` (licensing + tree-shake + payload concerns —
 * TR provinces alone is ~300KB), so this helper exposes a single
 * idempotent entry point for the app/route layer to wire its own
 * map asset.
 *
 * Three concerns handled here that a naive `echarts.registerMap(...)`
 * call would not:
 *   1. **Race condition**: two `<GeoMap>` instances mounting in
 *      parallel can both `await fetch(url)`; without a promise
 *      cache, both calls register the same map twice. We cache the
 *      in-flight promise so concurrent callers de-duplicate to one
 *      network request.
 *   2. **Idempotency**: a re-mount (route navigation, tab switch)
 *      should NOT re-fetch or re-register a map that's already
 *      live. We check `echarts.getMap(name)` first.
 *   3. **Diagnostic clarity**: if a wrapper renders before the
 *      consumer-side registration completes, it should fail loudly
 *      (dev-mode warning) rather than silently emit an empty canvas.
 *
 * Usage (app-side):
 *
 * ```tsx
 * // apps/mfe-reporting/src/routes/hr-demographic.tsx
 * import { ensureGeoMapRegistered } from '@mfe/x-charts';
 * import trProvinces from '../assets/maps/tr-provinces.geo.json';
 *
 * useEffect(() => {
 *   ensureGeoMapRegistered('TR', () => Promise.resolve(trProvinces));
 * }, []);
 * ```
 *
 * Then `<GeoMap mapName="TR" data={...} />` will find the map
 * already registered.
 *
 * @see GeoMap.tsx — the wrapper that consumes this.
 */
import { echarts, registerECharts } from '../renderers/echarts-imports';

/**
 * GeoJSON FeatureCollection — minimal subset for ECharts. Region
 * names are read from `feature.properties.name` by default (override
 * via `nameProperty` on the `<GeoMap>` wrapper).
 */
export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
};

/**
 * Loader returns the GeoJSON (already parsed) or a Promise of it.
 * Lazy import + dynamic fetch both supported. The loader runs at most
 * once per `mapName` for the lifetime of the runtime (registration is
 * an ECharts global side effect).
 */
export type GeoMapLoader = () => GeoJsonFeatureCollection | Promise<GeoJsonFeatureCollection>;

const inflight: Map<string, Promise<void>> = new Map();

/**
 * Check whether ECharts already has a map registered under `name`.
 * Use this to short-circuit conditional render gates without arming
 * the loader.
 */
export function isGeoMapRegistered(name: string): boolean {
  // `getMap` exists on echarts/core ≥ 5.4. Defensive typing because
  // the export surface is loosely typed in the upstream package.
  const e = echarts as unknown as {
    getMap?: (name: string) => unknown;
  };
  return typeof e.getMap === 'function' ? Boolean(e.getMap(name)) : false;
}

/**
 * Idempotent map registration. Safe to call multiple times across
 * concurrent mounts; the first call wins, subsequent callers await
 * the same promise.
 *
 * Returns the same `Promise<void>` for every call until registration
 * settles. The promise resolves only when `echarts.registerMap()`
 * has run successfully. If the loader rejects, the cache is cleared
 * so a later retry can attempt registration again.
 */
export function ensureGeoMapRegistered(name: string, loader: GeoMapLoader): Promise<void> {
  // Codex 019e2254 PR-X12c iter-2 blocker fix: ECharts' `registerMap`
  // / `getMap` only function once `MapChart` + `GeoComponent` have
  // been installed via `echarts.use([...])`. Without this, the global
  // registry is silently a no-op and the wrapper's render gate never
  // flips even after the caller "registered" the map. `registerECharts`
  // itself is idempotent (guarded by a private `_registered` flag),
  // so it's safe to call here before every loader attempt.
  registerECharts();

  if (isGeoMapRegistered(name)) {
    return Promise.resolve();
  }

  const existing = inflight.get(name);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(() => loader())
    .then((geoJson) => {
      // Defensive guard — runtime structure validation. If the
      // loader returns null/undefined or a non-FeatureCollection,
      // we surface the failure here instead of letting ECharts
      // try to parse garbage downstream.
      if (
        !geoJson ||
        typeof geoJson !== 'object' ||
        (geoJson as { type?: unknown }).type !== 'FeatureCollection'
      ) {
        throw new Error(
          `[x-charts] ensureGeoMapRegistered("${name}"): loader returned non-GeoJSON FeatureCollection`,
        );
      }
      const e = echarts as unknown as {
        registerMap: (name: string, geoJson: unknown) => void;
      };
      e.registerMap(name, geoJson);
    })
    .catch((err) => {
      // Clear the cache so the next caller can retry — registration
      // failure (network error, parse error) shouldn't permanently
      // poison the slot.
      inflight.delete(name);
      throw err;
    })
    .finally(() => {
      // Keep success entries cached so subsequent callers resolve
      // immediately without re-checking `getMap`. The catch above
      // already cleared on failure.
      if (isGeoMapRegistered(name)) {
        inflight.set(name, Promise.resolve());
      }
    });

  inflight.set(name, promise);
  return promise;
}

/**
 * TEST-ONLY: reset the in-flight cache. Used by Vitest to ensure
 * each test starts with a clean registration state. Should NOT be
 * called from product code.
 */
export function __resetGeoMapRegistrationCacheForTests(): void {
  inflight.clear();
}
