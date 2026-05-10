/**
 * normalizeBrushSelection — lock the ECharts brush event
 * → BrushSelection contract.
 *
 * Faz 21.11 PR-A2c — Cross-filter rectangle brush parity.
 *
 * Test strategy (Codex iter-1 absorbed)
 *   - Locks the ECharts payload shape we depend on:
 *     `batch[0].areas[0].coordRange` + `batch[0].selected[*].dataIndex`.
 *   - Lock inverted-bounds normalisation on BOTH axes
 *     individually.
 *   - Lock polygon → bbox fallback (kind = 'polygon-bbox').
 *   - Lock clear vs valid-empty separation: no batch / no
 *     area / fully-null bounds → null; valid bounds + empty
 *     dataIndex → real selection with `indices: []`.
 *   - Lock open-ended brush (only x bounded) → `to.y` /
 *     `from.y` stays null.
 *   - Lock `originalIndex` resolution path (data + field) and
 *     explicit `resolveIndex` callback path (callback wins).
 *   - Lock dedupe of resolved indices (anomaly LTTB can map
 *     two rendered points to the same source row in
 *     pathological fixtures).
 */
import { describe, it, expect } from 'vitest';
import { normalizeBrushSelection, type EChartsBrushSelectedEvent } from '../brushSelection';

describe('normalizeBrushSelection — clear / no-area cases', () => {
  it('returns null for null event', () => {
    expect(normalizeBrushSelection(null)).toBeNull();
  });

  it('returns null for empty batch', () => {
    expect(normalizeBrushSelection({ batch: [] })).toBeNull();
  });

  it('returns null for multi-batch event (Codex iter-2 §P2.1: PR-A2c locks single rectangle scope)', () => {
    expect(
      normalizeBrushSelection({
        batch: [
          {
            areas: [
              {
                brushType: 'rect',
                coordRange: [
                  [0, 10],
                  [0, 10],
                ],
              },
            ],
            selected: [{ seriesIndex: 0, dataIndex: [0] }],
          },
          {
            areas: [
              {
                brushType: 'rect',
                coordRange: [
                  [50, 60],
                  [50, 60],
                ],
              },
            ],
            selected: [{ seriesIndex: 0, dataIndex: [1] }],
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns null for multi-area event (disjoint rectangles cannot be expressed as inRange)', () => {
    expect(
      normalizeBrushSelection({
        batch: [
          {
            areas: [
              {
                brushType: 'rect',
                coordRange: [
                  [0, 10],
                  [0, 10],
                ],
              },
              {
                brushType: 'rect',
                coordRange: [
                  [50, 60],
                  [50, 60],
                ],
              },
            ],
            selected: [{ seriesIndex: 0, dataIndex: [0, 1] }],
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns null when batch[0] has no areas', () => {
    expect(
      normalizeBrushSelection({ batch: [{ selected: [{ seriesIndex: 0, dataIndex: [] }] }] }),
    ).toBeNull();
  });

  it('returns null when coordRange is missing', () => {
    expect(
      normalizeBrushSelection({
        batch: [{ areas: [{ brushType: 'rect' }], selected: [] }],
      }),
    ).toBeNull();
  });

  it('returns null when coordRange axes are degenerate (every bound non-numeric)', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [Number.NaN, Number.NaN],
                [Number.NaN, Number.NaN],
              ],
            },
          ],
          selected: [],
        },
      ],
    };
    expect(normalizeBrushSelection(event)).toBeNull();
  });
});

describe('normalizeBrushSelection — rectangle bounds', () => {
  it('returns the rectangle as-is when from.x ≤ to.x and from.y ≤ to.y', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [10, 30],
                [5, 50],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0, 1, 2] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event);
    expect(out).not.toBeNull();
    expect(out?.from).toEqual({ x: 10, y: 5 });
    expect(out?.to).toEqual({ x: 30, y: 50 });
    expect(out?.indices).toEqual([0, 1, 2]);
    expect(out?.kind).toBe('rect');
  });

  it('swaps inverted x and y bounds independently', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [40, 10],
                [80, 20],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event);
    // x got swapped (40 > 10 → from=10, to=40); y already
    // ascending (20 > 80 false → from=20, to=80? wait 80>20 →
    // from=20, to=80); both axes individually min/max.
    expect(out?.from).toEqual({ x: 10, y: 20 });
    expect(out?.to).toEqual({ x: 40, y: 80 });
    // Empty dataIndex MUST still emit a real selection — Codex
    // iter-1 §1: clear ≠ valid-empty.
    expect(out?.indices).toEqual([]);
  });

  it('drops the y bound when y axis pair is non-numeric (open-ended brush)', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [10, 30],
                // y axis collapsed (Infinity is NOT finite)
                [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event);
    expect(out?.from).toEqual({ x: 10, y: null });
    expect(out?.to).toEqual({ x: 30, y: null });
  });
});

describe('normalizeBrushSelection — polygon → bounding-box fallback', () => {
  it('returns the polygon bounding box and tags kind as polygon-bbox', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'polygon',
              coordRange: [
                [10, 5],
                [30, 5],
                [30, 50],
                [10, 50],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [3] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event);
    expect(out?.from).toEqual({ x: 10, y: 5 });
    expect(out?.to).toEqual({ x: 30, y: 50 });
    expect(out?.kind).toBe('polygon-bbox');
  });

  it('drops polygon when any vertex contains a non-finite number (Codex iter-2 §misc strict reject)', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'polygon',
              coordRange: [
                [10, 5],
                [Number.NaN, 50],
                [30, 50],
              ],
            },
          ],
          selected: [],
        },
      ],
    };
    expect(normalizeBrushSelection(event)).toBeNull();
  });

  it('drops malformed polygon points (non-array members) instead of crashing', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'polygon',
              // One bogus entry sneaks in — helper must reject the
              // whole area, not pick "best effort" bounds.
              coordRange: [[10, 5], 'whoops' as unknown as number[], [30, 50]],
            },
          ],
          selected: [],
        },
      ],
    };
    expect(normalizeBrushSelection(event)).toBeNull();
  });

  it('drops lineX / lineY brush primitives — out of scope for PR-A2c', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'lineX',
              coordRange: [10, 30],
            },
          ],
          selected: [],
        },
      ],
    };
    expect(normalizeBrushSelection(event)).toBeNull();
  });
});

describe('normalizeBrushSelection — index resolution', () => {
  const baseEvent: EChartsBrushSelectedEvent = {
    batch: [
      {
        areas: [
          {
            brushType: 'rect',
            coordRange: [
              [0, 100],
              [0, 100],
            ],
          },
        ],
        selected: [{ seriesIndex: 0, dataIndex: [0, 2] }],
      },
    ],
  };

  it('returns the rendered indices unchanged when no resolver is configured', () => {
    const out = normalizeBrushSelection(baseEvent);
    expect(out?.indices).toEqual([0, 2]);
  });

  it('lifts rendered indices to source via data + originalIndex (PR-A2a contract)', () => {
    const data = [
      { x: 1, y: 1, originalIndex: 120 },
      { x: 2, y: 2, originalIndex: 240 },
      { x: 3, y: 3, originalIndex: 390 },
    ];
    const out = normalizeBrushSelection(baseEvent, { data });
    expect(out?.indices).toEqual([120, 390]);
  });

  it('honours a custom originalIndexField name', () => {
    const data = [
      { x: 1, y: 1, srcRow: 11 },
      { x: 2, y: 2, srcRow: 22 },
      { x: 3, y: 3, srcRow: 33 },
    ];
    const out = normalizeBrushSelection(baseEvent, {
      data,
      originalIndexField: 'srcRow',
    });
    expect(out?.indices).toEqual([11, 33]);
  });

  it('falls back to rendered index when an entry is missing the field', () => {
    const data = [
      { x: 1, y: 1, originalIndex: 120 },
      { x: 2, y: 2, originalIndex: 240 },
      { x: 3, y: 3 }, // no originalIndex
    ];
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 100],
                [0, 100],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0, 2] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event, { data });
    expect(out?.indices).toEqual([120, 2]);
  });

  it('lets explicit resolveIndex win over data + originalIndexField', () => {
    const data = [
      { x: 1, y: 1, originalIndex: 999 }, // would map 0 → 999 via data path
    ];
    const out = normalizeBrushSelection(baseEvent, {
      data,
      resolveIndex: (renderedIndex) => renderedIndex * 10, // 0→0, 2→20
    });
    expect(out?.indices).toEqual([0, 20]);
  });

  it('drops rendered indices that resolveIndex returns undefined for', () => {
    const out = normalizeBrushSelection(baseEvent, {
      resolveIndex: (renderedIndex) => (renderedIndex === 2 ? undefined : renderedIndex),
    });
    expect(out?.indices).toEqual([0]);
  });

  it('dedupes resolved indices when two rendered points map to the same source row', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 100],
                [0, 100],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0, 1, 2, 3] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event, {
      resolveIndex: (renderedIndex) => Math.floor(renderedIndex / 2),
    });
    // 0→0, 1→0, 2→1, 3→1 → dedupe to [0, 1]
    expect(out?.indices).toEqual([0, 1]);
  });

  it('honours a non-zero seriesIndex', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 100],
                [0, 100],
              ],
            },
          ],
          selected: [
            { seriesIndex: 0, dataIndex: [0, 1] },
            { seriesIndex: 2, dataIndex: [99] },
          ],
        },
      ],
    };
    const out = normalizeBrushSelection(event, { seriesIndex: 2 });
    expect(out?.indices).toEqual([99]);
  });

  it('returns indices [] when requested seriesIndex is missing (Codex iter-2 §P1.1: no fallback to selected[0])', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 100],
                [0, 100],
              ],
            },
          ],
          // Only seriesIndex 0 present.
          selected: [{ seriesIndex: 0, dataIndex: [0, 1, 2] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event, { seriesIndex: 5 });
    expect(out).not.toBeNull();
    // CRITICAL: previously the helper fell back to `selected[0]`
    // and surfaced series-0 indices as if they belonged to the
    // requested series 5. That silent mis-routing is now gone.
    expect(out?.indices).toEqual([]);
    expect(out?.from).toEqual({ x: 0, y: 0 });
    expect(out?.to).toEqual({ x: 100, y: 100 });
  });

  it('drops unmappable indices when strictOriginalIndex=true and entry/field is missing (Codex iter-2 §P2.2)', () => {
    const data = [
      { x: 1, y: 1, originalIndex: 120 },
      { x: 2, y: 2 }, // no originalIndex
      { x: 3, y: 3, originalIndex: 390 },
    ];
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 100],
                [0, 100],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [0, 1, 2] }],
        },
      ],
    };
    const lenient = normalizeBrushSelection(event, { data });
    expect(lenient?.indices).toEqual([120, 1, 390]); // legacy fallback
    const strict = normalizeBrushSelection(event, { data, strictOriginalIndex: true });
    expect(strict?.indices).toEqual([120, 390]); // unmappable row dropped
  });

  it('emits indices: [] when selected[].dataIndex is empty (valid-empty selection)', () => {
    const event: EChartsBrushSelectedEvent = {
      batch: [
        {
          areas: [
            {
              brushType: 'rect',
              coordRange: [
                [0, 100],
                [0, 100],
              ],
            },
          ],
          selected: [{ seriesIndex: 0, dataIndex: [] }],
        },
      ],
    };
    const out = normalizeBrushSelection(event);
    expect(out).not.toBeNull();
    expect(out?.indices).toEqual([]);
    // Critical: `from`/`to` are still present so the AG Grid
    // adapter emits a real `inRange` filter (zero rows is a
    // valid query result, not a clear).
    expect(out?.from).toEqual({ x: 0, y: 0 });
    expect(out?.to).toEqual({ x: 100, y: 100 });
  });
});
