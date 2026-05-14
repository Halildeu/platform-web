/**
 * normalizeTRGeoJson — Stamp `properties.code` (TR-XX) on every feature
 * of the cihadturhan/tr-geojson FeatureCollection, then assert the 81
 * invariant.
 *
 * Why: the raw asset only carries `properties.name` (Turkish display
 * name). `GeoMap` uses `nameProperty="code"` for deterministic matching
 * against adapter output — fuzzy name comparison would break on Turkish
 * locale (İ/I, ç/c, ş/s) and on the `İSTANBUL(Avrupa)` split labels the
 * HR API returns. Stamping `code` at load time gives us a single source
 * of truth that flows from API alias → adapter → series.data → GeoJSON
 * feature.
 *
 * Codex 019e26a9 plan-time iter-3 AGREE — must-fix #6 + iter-3 must-fix
 * #8: validation fails LOUD, never approximates. Asset eksik commit
 * edilmez (Codex iter-3 katı uyarı).
 */
import { TR_PROVINCES, findProvinceCodeByLabel } from './tr-provinces';

/**
 * Minimal GeoJSON types — `@types/geojson` is NOT installed at the
 * monorepo level (verified by Codex 019e26a9 iter-3). We don't need
 * the full library; just the shape we touch.
 */
export interface TRGeoFeature {
  type: 'Feature';
  properties: {
    name?: string;
    code?: string;
    [key: string]: unknown;
  };
  geometry: {
    type: 'MultiPolygon' | 'Polygon';
    coordinates: unknown;
  };
}

export interface TRGeoFeatureCollection {
  type: 'FeatureCollection';
  features: TRGeoFeature[];
}

/**
 * Stamp `properties.code` on each feature and assert the 81 invariant.
 *
 * Throws if:
 *   - Any feature is missing `properties.name`
 *   - Any feature's name does not map to a TR-XX via the alias index
 *   - Final feature count is not exactly 81
 *   - Final unique-code count is not exactly 81
 *   - Any of TR-01..TR-81 is missing from the final set
 *
 * @param raw The raw FeatureCollection (immutable — returns new object)
 * @returns Normalized FeatureCollection with `properties.code` stamped
 *
 * @throws Error if any invariant is violated. Loud failure is intentional —
 *   silent fallback (e.g. continuing with 80 provinces) would defeat the
 *   click/SR contract because adapter output would emit codes that have no
 *   matching feature.
 */
export function normalizeTRGeoJson(raw: TRGeoFeatureCollection): TRGeoFeatureCollection {
  if (raw?.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new Error(
      'normalizeTRGeoJson: input is not a FeatureCollection (got ' +
        JSON.stringify(raw?.type) +
        ')',
    );
  }

  const features: TRGeoFeature[] = raw.features.map((feature, idx) => {
    const name = feature?.properties?.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`normalizeTRGeoJson: feature ${idx} missing properties.name`);
    }
    // Codex 019e26a9 iter-3 must-fix #7: naive toLowerCase YASAK.
    // Use the shared alias helper which handles Turkish locale + ASCII
    // folded variants deterministically.
    const code = findProvinceCodeByLabel(name);
    if (!code) {
      throw new Error(
        `normalizeTRGeoJson: feature ${idx} name "${name}" did not match any TR-XX code in the alias index. ` +
          'Asset upstream may have drifted; update apps/mfe-reporting/src/modules/hr-demographic-report/geo/tr-provinces.ts ' +
          'or the asset itself.',
      );
    }
    return {
      ...feature,
      properties: {
        ...feature.properties,
        code,
      },
    };
  });

  // Invariant 1: exactly 81 features.
  if (features.length !== 81) {
    throw new Error(
      `normalizeTRGeoJson: expected 81 features, got ${features.length}. ` +
        'TR plate codes are 1..81 — drift means asset must be corrected before commit.',
    );
  }

  // Invariant 2: 81 unique codes.
  const codes = new Set(features.map((f) => f.properties.code));
  if (codes.size !== 81) {
    throw new Error(
      `normalizeTRGeoJson: expected 81 unique TR-XX codes, got ${codes.size}. ` +
        'Duplicate name → code mapping or alias collision.',
    );
  }

  // Invariant 3: TR-01..TR-81 all present.
  for (let i = 1; i <= 81; i++) {
    const expected = `TR-${String(i).padStart(2, '0')}`;
    if (!codes.has(expected)) {
      const province = TR_PROVINCES.find((p) => p.code === expected);
      throw new Error(
        `normalizeTRGeoJson: missing province ${expected}` +
          (province ? ` (${province.name})` : '') +
          '. Asset must cover all 81 plate codes.',
      );
    }
  }

  return {
    ...raw,
    features,
  };
}
