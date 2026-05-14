/**
 * adaptLocationToGeoMap — adapter contract tests.
 *
 * Locks the data-shape contract Codex 019e26a9 plan-time iter-3
 * AGREE built into the adapter:
 *   - "Belirtilmemiş" outlier → unspecifiedCount, never on the map
 *   - Unmatched labels → unmatchedLabels (not silently dropped)
 *   - İstanbul Avrupa/Anadolu → TR-34 merge with sourceLabels breakdown
 *   - Bubble overlay top-N: default 5, minBubbleValue 100, fallback 3
 *   - Bubble datum carries `category: code` for click handler lookup
 *   - visualMax: ceil(max / 50) * 50 with zero guard
 *   - Mixed inputs preserve every code-bearing row
 */
import { describe, it, expect } from 'vitest';
import { adaptLocationToGeoMap, buildTRNameMap } from '../utils/location-to-geomap';

describe('adaptLocationToGeoMap — empty / edge inputs', () => {
  it('empty input yields empty output (visualMax floors at 1)', () => {
    const out = adaptLocationToGeoMap([]);
    expect(out.mapData).toHaveLength(0);
    expect(out.bubbleOverlay).toBeNull();
    expect(out.unspecifiedCount).toBe(0);
    expect(out.unmatchedLabels).toHaveLength(0);
    expect(out.visualMax).toBe(1);
    expect(out.provinceDetails).toEqual({});
  });

  it('only unspecified rows → unspecifiedCount populated, mapData empty', () => {
    const out = adaptLocationToGeoMap([
      { label: 'Belirtilmemiş', value: 939 },
      { label: '', value: 5 },
      { label: '   ', value: 2 },
    ]);
    expect(out.unspecifiedCount).toBe(946);
    expect(out.mapData).toHaveLength(0);
    expect(out.bubbleOverlay).toBeNull();
  });

  it('ignores non-finite values', () => {
    const out = adaptLocationToGeoMap([
      { label: 'Ankara', value: 100 },
      { label: 'İzmir', value: NaN },
      { label: 'Bursa', value: Infinity },
    ]);
    // Only Ankara survives; İzmir + Bursa dropped by Number.isFinite filter.
    expect(out.mapData).toHaveLength(1);
    expect(out.mapData[0].code).toBe('TR-06');
  });
});

describe('adaptLocationToGeoMap — alias + İstanbul merge', () => {
  it('İstanbul Avrupa + Anadolu merge to TR-34 with sourceLabels breakdown', () => {
    const out = adaptLocationToGeoMap([
      { label: 'İSTANBUL(Avrupa)', value: 256 },
      { label: 'İSTANBUL(Anadolu)', value: 121 },
    ]);
    expect(out.mapData).toHaveLength(1);
    expect(out.mapData[0].code).toBe('TR-34');
    expect(out.mapData[0].value).toBe(377);
    expect(out.provinceDetails['TR-34']?.sourceLabels).toHaveLength(2);
    const aggregate = out.provinceDetails['TR-34']?.sourceLabels.reduce((s, l) => s + l.value, 0);
    expect(aggregate).toBe(377);
  });

  it('UPPERCASE Turkish + ASCII-folded variants all match correctly', () => {
    const out = adaptLocationToGeoMap([
      { label: 'ANKARA', value: 10 },
      { label: 'IZMIR', value: 5 },
      { label: 'ÇANAKKALE', value: 3 },
    ]);
    expect(out.mapData.find((d) => d.code === 'TR-06')?.value).toBe(10);
    expect(out.mapData.find((d) => d.code === 'TR-35')?.value).toBe(5);
    expect(out.mapData.find((d) => d.code === 'TR-17')?.value).toBe(3);
  });

  it('unmatched labels surface in unmatchedLabels, do not silently drop', () => {
    const out = adaptLocationToGeoMap([
      { label: 'Ankara', value: 50 },
      { label: 'Unknown Place', value: 8 },
      { label: 'Atlantis', value: 1 },
    ]);
    expect(out.mapData).toHaveLength(1);
    expect(out.unmatchedLabels).toHaveLength(2);
    expect(out.unmatchedLabels[0].label).toBe('Unknown Place');
    expect(out.unmatchedLabels[1].label).toBe('Atlantis');
  });
});

describe('adaptLocationToGeoMap — bubble overlay top-N', () => {
  it('default top 5 with minBubbleValue 100 selects only provinces ≥100', () => {
    const out = adaptLocationToGeoMap([
      { label: 'Ankara', value: 315 },
      { label: 'İSTANBUL(Avrupa)', value: 256 },
      { label: 'İzmir', value: 155 },
      { label: 'Bursa', value: 57 }, // < 100, excluded from bubble
      { label: 'Van', value: 31 },
    ]);
    expect(out.bubbleOverlay).not.toBeNull();
    const bubble = out.bubbleOverlay!;
    expect(bubble.data).toHaveLength(3); // Ankara, İstanbul, İzmir
    const codes = bubble.data.map((d) => d.category);
    expect(codes).toContain('TR-06');
    expect(codes).toContain('TR-34');
    expect(codes).toContain('TR-35');
  });

  it('fallback minBubbleFallback when fewer than minBubbleValue qualify', () => {
    // Default: topN 5, minBubbleValue 100, fallback 3.
    // 5 rows all < 100 → without fallback, bubbleOverlay would be null.
    // With fallback, top 3 by value should still be bubbled.
    const out = adaptLocationToGeoMap([
      { label: 'Ankara', value: 50 },
      { label: 'İzmir', value: 40 },
      { label: 'Bursa', value: 30 },
      { label: 'Van', value: 20 },
      { label: 'Sakarya', value: 10 },
    ]);
    expect(out.bubbleOverlay).not.toBeNull();
    expect(out.bubbleOverlay!.data).toHaveLength(3);
  });

  it('bubble data carries category=code for click handler lookup', () => {
    const out = adaptLocationToGeoMap([
      { label: 'Ankara', value: 315 },
      { label: 'İstanbul', value: 377 },
    ]);
    expect(out.bubbleOverlay).not.toBeNull();
    for (const datum of out.bubbleOverlay!.data) {
      expect(datum.category).toMatch(/^TR-/);
    }
  });

  it('custom topN respected', () => {
    const out = adaptLocationToGeoMap(
      [
        { label: 'Ankara', value: 500 },
        { label: 'İstanbul', value: 400 },
        { label: 'İzmir', value: 300 },
        { label: 'Bursa', value: 200 },
        { label: 'Antalya', value: 150 },
      ],
      { topN: 2 },
    );
    expect(out.bubbleOverlay!.data).toHaveLength(2);
  });
});

describe('adaptLocationToGeoMap — visualMax rounding', () => {
  it('rounds up to nearest 50', () => {
    expect(adaptLocationToGeoMap([{ label: 'Ankara', value: 377 }]).visualMax).toBe(400);
    expect(adaptLocationToGeoMap([{ label: 'Ankara', value: 1234 }]).visualMax).toBe(1250);
    expect(adaptLocationToGeoMap([{ label: 'Ankara', value: 50 }]).visualMax).toBe(50);
    expect(adaptLocationToGeoMap([{ label: 'Ankara', value: 51 }]).visualMax).toBe(100);
  });

  it('empty / all-zero data yields visualMax 1 (zero guard)', () => {
    expect(adaptLocationToGeoMap([]).visualMax).toBe(1);
    expect(adaptLocationToGeoMap([{ label: 'Ankara', value: 0 }]).visualMax).toBe(1);
  });
});

describe('adaptLocationToGeoMap — realistic production payload', () => {
  it('handles the browser-observed testai snapshot correctly', () => {
    // Subset of the real production response observed 2026-05-14.
    const out = adaptLocationToGeoMap([
      { label: 'Belirtilmemiş', value: 939 },
      { label: 'ANKARA', value: 315 },
      { label: 'İSTANBUL(Avrupa)', value: 256 },
      { label: 'İZMİR', value: 155 },
      { label: 'İSTANBUL(Anadolu)', value: 121 },
      { label: 'ÇANAKKALE', value: 100 },
      { label: 'TEKİRDAĞ', value: 97 },
      { label: 'ANTALYA', value: 74 },
      { label: 'BURSA', value: 57 },
    ]);
    expect(out.unspecifiedCount).toBe(939);
    // 8 distinct provinces (İstanbul Avrupa + Anadolu merged).
    expect(out.mapData).toHaveLength(7);
    const tr34 = out.mapData.find((d) => d.code === 'TR-34');
    expect(tr34?.value).toBe(377); // 256 + 121
    expect(out.unmatchedLabels).toHaveLength(0);
    expect(out.visualMax).toBe(400);
    // Bubble overlay should pick top 5 ≥100: Ankara, İstanbul, İzmir, Çanakkale.
    expect(out.bubbleOverlay!.data.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildTRNameMap', () => {
  it('round-trips canonical Turkish display names to codes', () => {
    const map = buildTRNameMap();
    expect(map['İstanbul']).toBe('TR-34');
    expect(map['Ankara']).toBe('TR-06');
    expect(map['İzmir']).toBe('TR-35');
    expect(Object.keys(map)).toHaveLength(81);
  });
});
