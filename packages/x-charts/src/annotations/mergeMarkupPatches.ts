/**
 * mergeMarkupPatches — chart-shim helper that folds `SeriesPatch[]`
 * into an existing ECharts series array.
 *
 * Each patch is routed by `seriesIndex` (when set), then by
 * `seriesName`, then to series 0 as a default. The helper preserves
 * existing `markLine`/`markArea`/`markPoint` data on the matching
 * series — Waterfall in particular relies on connector `markLine`
 * data already living on its visible value series, so the markup
 * adapter MUST append (not replace).
 *
 * Pure: no React, no ECharts instance. Codex thread 019e0df1 iter-3
 * impl guardrail.
 */
import type { SeriesPatch } from './adaptToEcharts';

interface EChartsSeriesLike {
  name?: string;
  markLine?: { data?: unknown[] };
  markArea?: { data?: unknown[] };
  markPoint?: { data?: unknown[] };
  [k: string]: unknown;
}

function findTargetIndex(series: EChartsSeriesLike[], patch: SeriesPatch): number {
  if (typeof patch.seriesIndex === 'number') {
    return patch.seriesIndex >= 0 && patch.seriesIndex < series.length ? patch.seriesIndex : -1;
  }
  if (patch.seriesName) {
    const idx = series.findIndex((s) => s.name === patch.seriesName);
    return idx;
  }
  // Default — first series.
  return series.length > 0 ? 0 : -1;
}

function appendMark<T extends { data?: unknown[] }>(
  existing: T | undefined,
  patch: { data: unknown[] } | undefined,
): T | { data: unknown[] } | undefined {
  if (!patch) return existing;
  if (!existing) return patch;
  const existingData = Array.isArray(existing.data) ? existing.data : [];
  return { ...existing, data: [...existingData, ...patch.data] };
}

export function mergeMarkupPatches<S extends EChartsSeriesLike>(
  series: S[],
  patches: SeriesPatch[],
): S[] {
  if (patches.length === 0) return series;
  // Clone shallowly so we don't mutate the caller's series array.
  const out = series.map((s) => ({ ...s }));
  for (const patch of patches) {
    const idx = findTargetIndex(out, patch);
    if (idx === -1) continue;
    const target = out[idx];
    const merged = {
      ...target,
      markLine: appendMark(target.markLine, patch.markLine) as S['markLine'],
      markArea: appendMark(target.markArea, patch.markArea) as S['markArea'],
      markPoint: appendMark(target.markPoint, patch.markPoint) as S['markPoint'],
    };
    out[idx] = merged as S;
  }
  return out;
}
