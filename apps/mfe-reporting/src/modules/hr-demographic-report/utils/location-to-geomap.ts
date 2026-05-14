/**
 * location-to-geomap — Pure data adapter that maps the HR API's raw
 * `locationDistribution: Array<{ label, value }>` payload onto the
 * inputs `GeoMap` + the bubble overlay need.
 *
 * Codex 019e26a9 plan-time iter-3 AGREE — must-fix consolidation:
 *
 *   1. Code-based matching (TR-XX), not Turkish-locale name compare.
 *   2. `Belirtilmemiş` (unspecified) outlier filter → ayrı KPI badge.
 *   3. İstanbul Avrupa/Anadolu merge to TR-34 with `sourceLabels`
 *      breakdown preserved for the drill-down drawer.
 *   4. Unmatched labels surfaced via `unmatchedLabels`, not silently
 *      dropped (Codex iter-1 #5, iter-2 #5).
 *   5. `visualMax` rounded up to nearest 50 with `> 0` zero-guard
 *      (Codex iter-2 #9).
 *   6. Bubble datum carries `category: code` so the click handler
 *      can look up the province from the overlay payload without
 *      maintaining a name→code reverse index in the component
 *      (Codex iter-2 #2).
 *   7. Top-N bubble: default 5, `minBubbleValue` 100, fallback to top
 *      3 when there are fewer than 5 provinces over the floor
 *      (Codex iter-1 #e).
 *
 * Pure function: no React, no I/O. Same inputs → same outputs. Test
 * surface is `__tests__/location-to-geomap.test.ts`.
 */
import type { GeoBubbleLayer } from '@mfe/x-charts';
import { TR_PROVINCES, findProvinceCodeByLabel, getProvinceByCode } from '../geo/tr-provinces';

/**
 * Single row from the HR API location-distribution payload (or mock).
 * Matches `DemographicSummary.locationDistribution` shape.
 */
export interface LocationDistributionItem {
  label: string;
  value: number;
}

/**
 * Per-province source-label breakdown (for the drawer / tooltip).
 * Used to expose the underlying API rows that aggregated into a
 * single TR-XX entry — e.g. İstanbul Avrupa + Anadolu both land in
 * TR-34 but the consumer still wants to see "256 + 121" not "377".
 */
export interface ProvinceSourceBreakdown {
  /** API rows whose alias resolved to this TR-XX code. */
  sourceLabels: ReadonlyArray<LocationDistributionItem>;
}

/**
 * Single map data point — what `<GeoMap data={...} />` consumes.
 * `name` is the canonical Turkish display name (`İstanbul`); `code`
 * is the ISO 3166-2 plate (`TR-34`) that `GeoMap` uses for matching
 * via `nameProperty="code"`.
 */
export interface MapDataPoint {
  name: string;
  value: number;
  code: string;
}

export interface AdaptLocationToGeoMapOptions {
  /**
   * Number of provinces to highlight in the bubble overlay.
   * @default 5
   */
  topN?: number;
  /**
   * Minimum value (count) for a province to qualify for the bubble
   * overlay. Provinces below this threshold are still in the
   * choropleth `mapData`, just not bubbled.
   * @default 100
   */
  minBubbleValue?: number;
  /**
   * Fallback minimum bubble count when fewer than `topN` provinces
   * clear `minBubbleValue` — ensures at least this many bubbles
   * appear so the overlay isn't empty.
   * @default 3
   */
  minBubbleFallback?: number;
}

export interface AdaptLocationToGeoMapOutput {
  /**
   * Province rows for the GeoMap choropleth base. One entry per
   * matched TR-XX; aggregated when multiple API labels resolve to the
   * same code (e.g. İstanbul split).
   */
  mapData: ReadonlyArray<MapDataPoint>;
  /**
   * Bubble overlay layer (top-N highlights) or `null` when there are
   * no provinces above the bubble threshold.
   */
  bubbleOverlay: GeoBubbleLayer | null;
  /**
   * Count of personnel whose `location` is `'Belirtilmemiş'` (or
   * empty / null). Drives a separate data-quality KPI badge.
   */
  unspecifiedCount: number;
  /**
   * API labels that did NOT match any TR-XX alias. Surfaced to the
   * UI so production drift doesn't silently lose data (Codex iter-2
   * #5).
   */
  unmatchedLabels: ReadonlyArray<LocationDistributionItem>;
  /**
   * Dynamic upper bound for `visualMap` — `ceil(max / 50) * 50`,
   * minimum 1. Codex iter-2 #9: zero-guard so empty data doesn't
   * emit `visualMax: 0` which breaks ECharts color scaling.
   */
  visualMax: number;
  /**
   * Per-TR-XX source-label breakdown — drawer drills into this to
   * show "İstanbul (Avrupa) 256 + (Anadolu) 121" instead of just the
   * aggregate 377.
   */
  provinceDetails: Readonly<Record<string, ProvinceSourceBreakdown>>;
}

/**
 * Patterns matched against incoming labels to recognise the
 * "unspecified" bucket. Case- and diacritic-insensitive via the
 * shared alias normalizer.
 */
const UNSPECIFIED_PATTERNS = new Set([
  'BELIRTILMEMIS',
  'BELIRTILMEMİS',
  'BELIRTILMEMİŞ',
  'BELİRTİLMEMİŞ',
  'BELIRTILMEMIS.',
  'UNSPECIFIED',
  '',
  '—',
]);

/**
 * Roughly normalise a label for unspecified-bucket comparison.
 * Independent of the TR alias index because the alias is for
 * known provinces only; this is for the "missing data" tag.
 */
function looksUnspecified(label: string): boolean {
  if (label == null) return true;
  const trimmed = label.trim();
  if (trimmed.length === 0) return true;
  const upper = trimmed.toLocaleUpperCase('tr-TR');
  return UNSPECIFIED_PATTERNS.has(upper);
}

/**
 * Adapt a raw API distribution into GeoMap-ready inputs.
 *
 * @param input The raw `locationDistribution` payload.
 * @param options Top-N / threshold knobs (see interface).
 */
export function adaptLocationToGeoMap(
  input: ReadonlyArray<LocationDistributionItem>,
  options: AdaptLocationToGeoMapOptions = {},
): AdaptLocationToGeoMapOutput {
  const { topN = 5, minBubbleValue = 100, minBubbleFallback = 3 } = options;

  // Aggregate by TR-XX code, preserving source labels.
  const agg = new Map<string, { value: number; sources: LocationDistributionItem[] }>();
  const unmatched: LocationDistributionItem[] = [];
  let unspecifiedCount = 0;

  for (const row of input) {
    if (!row || typeof row.label !== 'string' || !Number.isFinite(row.value)) {
      continue;
    }
    if (looksUnspecified(row.label)) {
      unspecifiedCount += row.value;
      continue;
    }
    const code = findProvinceCodeByLabel(row.label);
    if (!code) {
      unmatched.push({ label: row.label, value: row.value });
      continue;
    }
    const existing = agg.get(code);
    if (existing) {
      existing.value += row.value;
      existing.sources.push({ label: row.label, value: row.value });
    } else {
      agg.set(code, {
        value: row.value,
        sources: [{ label: row.label, value: row.value }],
      });
    }
  }

  // Build mapData + provinceDetails in parallel.
  const mapData: MapDataPoint[] = [];
  const provinceDetails: Record<string, ProvinceSourceBreakdown> = {};
  for (const [code, { value, sources }] of agg) {
    const province = getProvinceByCode(code);
    if (!province) continue; // Defensive — should never trigger because findProvinceCodeByLabel only emits valid codes.
    mapData.push({ name: province.name, value, code });
    provinceDetails[code] = { sourceLabels: sources };
  }

  // Bubble overlay top-N.
  const sortedDesc = [...mapData].sort((a, b) => b.value - a.value);
  const filteredByFloor = sortedDesc.filter((d) => d.value >= minBubbleValue);
  let bubbleCandidates = filteredByFloor.slice(0, topN);
  // Fallback: if `minBubbleValue` filter eliminated every province,
  // take the top `minBubbleFallback` anyway (capped by both the data
  // size and the user-supplied `topN` so an explicit cap is honoured).
  // The fallback is intentionally narrower than the earlier
  // `< minBubbleFallback` check, which over-rode user `topN < fallback`.
  if (bubbleCandidates.length === 0 && sortedDesc.length > 0) {
    bubbleCandidates = sortedDesc.slice(0, Math.min(minBubbleFallback, sortedDesc.length, topN));
  }

  const bubbleOverlay: GeoBubbleLayer | null =
    bubbleCandidates.length > 0
      ? {
          type: 'bubble',
          name: 'Yoğun ikamet illeri',
          data: bubbleCandidates.map((d) => {
            const province = getProvinceByCode(d.code);
            // Province is guaranteed by mapData construction; coordinates fallback to [0,0] is defensive.
            const coordinates: [number, number] = province
              ? [province.coordinates[0], province.coordinates[1]]
              : [0, 0];
            return {
              name: d.name,
              coordinates,
              value: d.value,
              // Codex iter-2 #2: bubble click handler relies on this
              // category to recover the TR-XX code, since the overlay
              // payload doesn't include `code` directly.
              category: d.code,
            };
          }),
          color: '#dc2626',
          opacity: 0.7,
          showLabels: true,
        }
      : null;

  // visualMax with zero-guard.
  const max = mapData.reduce((m, d) => Math.max(m, d.value), 0);
  const visualMax = max > 0 ? Math.ceil(max / 50) * 50 : 1;

  return {
    mapData,
    bubbleOverlay,
    unspecifiedCount,
    unmatchedLabels: unmatched,
    visualMax,
    provinceDetails,
  };
}

/**
 * Build a `Record<canonicalName, code>` for `<GeoMap nameMap={...} />`.
 *
 * Adapter emits map data with both `name` (Turkish display) and `code`
 * (TR-XX). `GeoMap` uses `nameProperty="code"` for feature matching;
 * the `nameMap` covers the rare edge case where a consumer passes
 * data keyed by display name only.
 */
export function buildTRNameMap(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const province of TR_PROVINCES) {
    out[province.name] = province.code;
  }
  return out;
}
