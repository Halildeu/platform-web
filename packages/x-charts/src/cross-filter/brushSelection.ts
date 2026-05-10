/**
 * brushSelection — pure helpers that normalise an ECharts
 * `brushselected` payload into a renderer-agnostic
 * `BrushSelection` (data-space rectangle + matched source row
 * indices) and resolve the rendered indices back to source-row
 * indices when the chart was drawn from a downsampled dataset
 * (e.g. PR-A2a anomaly-preserving LTTB output).
 *
 * Faz 21.11 PR-A2c — Cross-filter rectangle brush parity.
 *
 * Why pure
 *   - No React, no DOM, no ECharts runtime import. Lives next to
 *     the existing `cross-filter` adapter helpers
 *     (`useGridCrossFilter`, `AGGridAdapter`) so consumers can
 *     wire the brush event without dragging the chart engine
 *     into the test target.
 *
 * Renderer parity
 *   - Brush works the same way in `canvas` / `lttb` / `webgl`
 *     renderer modes (PR-A0/A1 router). The contract this
 *     helper locks is the **payload shape** that every renderer
 *     funnels into ECharts' shared `brushselected` event — NOT
 *     the screen-pixel pipeline. Tests assert at the
 *     normalisation layer; renderer mounting is out of scope.
 *
 * `originalIndex` resolver
 *   - When the chart was drawn from
 *     `unstable_downsampleAnomalyPreservingLTTB` output, every
 *     rendered point carries a source-row `originalIndex`
 *     (PR-A2a). The brush would otherwise emit downsampled
 *     positions, breaking the round-trip. `normalizeBrushSelection`
 *     accepts either an explicit `resolveIndex` callback or a
 *     `data` array + `originalIndexField` so the consumer can
 *     wire whichever shape is convenient.
 *
 * Out-of-scope (covered elsewhere or in follow-up PRs)
 *   - Wiring `onBrushSelection` onto `ScatterChart` proper —
 *     PR-A2c-wire (separate PR).
 *   - Backend SSRM `filterModel` consumption — already enforced
 *     in `apps/mfe-reporting/src/app/reporting/ReportPage.tsx`
 *     and `buildEntityGridQueryParams.ts`.
 *   - Polygon hit-testing — only the bounding box is locked
 *     here (Codex iter-1 §4: "polygon fallback bbox-only").
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A single bound on one axis. `null` means the axis is open on
 * that side (consumer should drop the corresponding column from
 * the AG Grid filter model). */
export type BrushBound = number | null;

/** Data-space corner of a normalised brush rectangle. */
export interface BrushPoint {
  x: BrushBound;
  y: BrushBound;
}

/**
 * Renderer-agnostic brush selection.
 *
 * - `from` and `to` are normalised so `from.x ≤ to.x` and
 *   `from.y ≤ to.y` (both axes individually, see Codex iter-1
 *   §3 — inverted bounds are swapped both axes).
 * - `indices` are SOURCE-row indices (post `originalIndex`
 *   resolution) when a `data`/`resolveIndex` is provided;
 *   otherwise they are the raw rendered indices ECharts gave
 *   us (no degradation).
 * - `kind` records whether this came from a true rectangle
 *   brush or from a polygon brush whose bounding box we
 *   inferred (Codex iter-1 §4). Consumers MAY refuse polygon
 *   selections; the default AG Grid wiring treats both the
 *   same.
 */
export interface BrushSelection {
  from: BrushPoint;
  to: BrushPoint;
  indices: number[];
  kind: 'rect' | 'polygon-bbox';
}

/** ECharts `brushselected` event area shape (only the fields
 * we read). `coordRange` for rectangle is `[[x1, x2], [y1, y2]]`;
 * for polygon it's `[[x, y], ...]`. */
export interface EChartsBrushArea {
  brushType?: 'rect' | 'polygon' | 'lineX' | 'lineY' | string;
  /** Cartesian-coord brush. ECharts also exposes pixel `range`,
   * but we ignore that — pixel space leaks renderer details. */
  coordRange?: number[] | number[][];
}

/** ECharts `brushselected` per-series payload (only the fields
 * we read). `dataIndex` is the **rendered** index, not source. */
export interface EChartsBrushSelectedSeries {
  seriesIndex?: number;
  dataIndex?: number[];
}

/** ECharts `brushselected` event payload. The real ECharts type
 * is wider; this interface is the minimum we depend on. */
export interface EChartsBrushSelectedEvent {
  batch?: Array<{
    areas?: EChartsBrushArea[];
    selected?: EChartsBrushSelectedSeries[];
  }>;
}

export interface NormalizeBrushSelectionOptions {
  /** Series whose `dataIndex` array we want to lift into source
   * indices. Defaults to 0 (single-series ScatterChart). */
  seriesIndex?: number;
  /**
   * Optional rendered-data array. When supplied AND each entry
   * carries an `originalIndex`-shaped field, the helper maps
   * rendered indices → source indices (PR-A2a contract).
   * Without this AND without `resolveIndex`, the rendered
   * indices are returned untouched.
   */
  data?: ReadonlyArray<Record<string, unknown>>;
  /** Field name on the rendered data carrying the source index.
   * @default 'originalIndex' */
  originalIndexField?: string;
  /** Explicit resolver — wins over `data`/`originalIndexField`
   * when both are passed. Returning `undefined` drops the
   * rendered index (consumer wants to filter unmappable rows
   * out). */
  resolveIndex?: (renderedIndex: number) => number | undefined;
  /**
   * Fail-closed `originalIndex` resolution. When `true` and a
   * `data` array is supplied, rendered indices whose entry is
   * missing the `originalIndexField` are DROPPED instead of
   * falling back to the rendered index. Recommended whenever
   * the chart was rendered from a downsampled source (PR-A2a)
   * and the consumer needs strict source-row mapping. Default
   * `false` keeps the legacy backwards-compatible "best-effort"
   * behaviour.
   * Codex iter-2 PR-A2c §P2.
   */
  strictOriginalIndex?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function asBound(value: unknown): BrushBound {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function minBound(a: BrushBound, b: BrushBound): BrushBound {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function maxBound(a: BrushBound, b: BrushBound): BrushBound {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Pull the single cartesian brush area out of the event batch.
 * Returns `null` when the event was a clear / no-area / pixel-
 * only brush — OR when the event carries multiple batches /
 * multiple areas (Codex iter-2 §P2.1: PR-A2c locks single
 * rectangle scope; multi-area would need disjoint range
 * support that simple per-column `inRange` cannot represent).
 */
function readArea(event: EChartsBrushSelectedEvent | null | undefined): EChartsBrushArea | null {
  const batch = event?.batch;
  // Fail-closed on multi-batch — ECharts toolbox brush operations
  // can emit batched events whose union we cannot faithfully
  // express as a single `inRange` filter.
  if (!Array.isArray(batch) || batch.length !== 1) return null;
  const areas = batch[0]?.areas;
  // Fail-closed on multi-area selections for the same reason.
  if (!Array.isArray(areas) || areas.length !== 1) return null;
  const area = areas[0];
  if (!area) return null;
  const coordRange = area.coordRange;
  if (!Array.isArray(coordRange) || coordRange.length === 0) return null;
  return area;
}

/** Read rectangle bounds from `coordRange = [[x1, x2], [y1, y2]]`.
 * Returns axis-individually-normalised `{from, to}` so callers
 * never see `from.x > to.x`. */
function readRectangleBounds(area: EChartsBrushArea): { from: BrushPoint; to: BrushPoint } {
  const [xs, ys] = area.coordRange as number[][];
  const xLo = asBound(xs?.[0]);
  const xHi = asBound(xs?.[1]);
  const yLo = asBound(ys?.[0]);
  const yHi = asBound(ys?.[1]);
  return {
    from: { x: minBound(xLo, xHi), y: minBound(yLo, yHi) },
    to: { x: maxBound(xLo, xHi), y: maxBound(yLo, yHi) },
  };
}

/** Read polygon bounding box from `coordRange = [[x, y], ...]`.
 * Codex iter-1 §4: this PR locks bbox-only fallback; we never
 * claim true polygon hit-testing. */
function readPolygonBoundingBox(area: EChartsBrushArea): { from: BrushPoint; to: BrushPoint } {
  const points = area.coordRange as number[][];
  let xMin: BrushBound = null;
  let xMax: BrushBound = null;
  let yMin: BrushBound = null;
  let yMax: BrushBound = null;
  for (const point of points) {
    const x = asBound(point?.[0]);
    const y = asBound(point?.[1]);
    xMin = minBound(xMin, x);
    xMax = maxBound(xMax, x);
    yMin = minBound(yMin, y);
    yMax = maxBound(yMax, y);
  }
  return {
    from: { x: xMin, y: yMin },
    to: { x: xMax, y: yMax },
  };
}

function readBoundsForArea(area: EChartsBrushArea): {
  from: BrushPoint;
  to: BrushPoint;
  kind: BrushSelection['kind'];
} | null {
  const brushType = area.brushType ?? 'rect';
  if (brushType === 'rect') {
    const coordRange = area.coordRange;
    if (!Array.isArray(coordRange) || coordRange.length < 2) return null;
    const [first, second] = coordRange as Array<unknown>;
    if (!Array.isArray(first) || !Array.isArray(second)) return null;
    const { from, to } = readRectangleBounds(area);
    return { from, to, kind: 'rect' };
  }
  if (brushType === 'polygon') {
    const coordRange = area.coordRange as unknown[];
    if (!Array.isArray(coordRange) || coordRange.length === 0) return null;
    // Codex iter-2 §misc: every vertex must be a 2-tuple of
    // finite numbers. A single NaN/Infinity vertex used to slip
    // through and produce a partial bbox.
    const valid = coordRange.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        typeof p[0] === 'number' &&
        Number.isFinite(p[0]) &&
        typeof p[1] === 'number' &&
        Number.isFinite(p[1]),
    );
    if (!valid) return null;
    const { from, to } = readPolygonBoundingBox(area);
    return { from, to, kind: 'polygon-bbox' };
  }
  // `lineX` / `lineY` and other ECharts brush primitives are
  // out of scope for PR-A2c. Drop them so the consumer isn't
  // surprised by half-formed selections.
  return null;
}

function buildResolver(
  options: NormalizeBrushSelectionOptions,
): (renderedIndex: number) => number | undefined {
  if (typeof options.resolveIndex === 'function') {
    return options.resolveIndex;
  }
  const data = options.data;
  if (!Array.isArray(data) || data.length === 0) {
    return (renderedIndex) => renderedIndex;
  }
  const field = options.originalIndexField ?? 'originalIndex';
  // Codex iter-2 §P2.2: with `data` supplied AND
  // `strictOriginalIndex=true`, drop unmappable indices
  // (entry missing / field missing / non-finite) instead of
  // falling back to the rendered index. This preserves the
  // PR-A2a coupling guarantee that returned indices ARE source
  // rows. Default `false` keeps backwards-compatible best-
  // effort behaviour.
  const strict = options.strictOriginalIndex === true;
  return (renderedIndex) => {
    const entry = data[renderedIndex];
    if (!entry || typeof entry !== 'object') return strict ? undefined : renderedIndex;
    const raw = (entry as Record<string, unknown>)[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return strict ? undefined : renderedIndex;
  };
}

function readSelectedIndices(
  event: EChartsBrushSelectedEvent | null | undefined,
  seriesIndex: number,
  resolve: (renderedIndex: number) => number | undefined,
): number[] {
  const batch = event?.batch?.[0];
  const selected = batch?.selected;
  if (!Array.isArray(selected)) return [];
  // Codex iter-2 §P1.1: NO fallback to `selected[0]`. If the
  // requested series isn't present in the event, the helper
  // returns an empty index list. The previous fallback could
  // silently surface another series' rendered indices as
  // source rows in multi-series scatter or stale-event races.
  const series = selected.find((s) => (s.seriesIndex ?? 0) === seriesIndex);
  if (!series || !Array.isArray(series.dataIndex)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const renderedIndex of series.dataIndex) {
    if (typeof renderedIndex !== 'number' || !Number.isFinite(renderedIndex)) continue;
    const resolved = resolve(renderedIndex);
    if (resolved === undefined || !Number.isFinite(resolved)) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Normalise an ECharts `brushselected` event into a
 * renderer-agnostic `BrushSelection`.
 *
 * Returns `null` when the event represents a CLEAR (no batch /
 * no area / no usable bounds). A valid selection with zero
 * matched rows is NOT collapsed to `null` — callers downstream
 * MUST distinguish "clear filter" from "filter to empty
 * region" (Codex iter-1 §1).
 */
export function normalizeBrushSelection(
  event: EChartsBrushSelectedEvent | null | undefined,
  options: NormalizeBrushSelectionOptions = {},
): BrushSelection | null {
  if (!event) return null;
  const area = readArea(event);
  if (!area) return null;
  const bounds = readBoundsForArea(area);
  if (!bounds) return null;
  // Reject the degenerate "every axis is null" case — that's a
  // clear masquerading as a selection.
  if (
    bounds.from.x === null &&
    bounds.to.x === null &&
    bounds.from.y === null &&
    bounds.to.y === null
  ) {
    return null;
  }
  const seriesIndex = options.seriesIndex ?? 0;
  const resolve = buildResolver(options);
  const indices = readSelectedIndices(event, seriesIndex, resolve);
  return {
    from: bounds.from,
    to: bounds.to,
    indices,
    kind: bounds.kind,
  };
}
