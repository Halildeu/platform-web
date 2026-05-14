/**
 * TR_PROVINCES dataset invariants — protects the foundation that the
 * adapter, normalizer, GeoMap and filter UI all build on.
 *
 * Codex 019e26a9 plan-time iter-3 — guardrails:
 *   - 81 entries (matches plate code count)
 *   - All TR-01..TR-81 codes present and unique
 *   - Plate codes match the trailing two digits of the ISO code
 *   - Coordinates lie within Türkiye's bounding box
 *   - Region totals match the documented constitutional regions
 *   - Alias index round-trips canonical names back to themselves
 *   - İstanbul Avrupa/Anadolu split labels both resolve to TR-34
 */
import { describe, it, expect } from 'vitest';
import {
  TR_PROVINCES,
  TR_PROVINCE_ALIASES,
  findProvinceCodeByLabel,
  getProvinceByCode,
  normalizeProvinceLabel,
} from '../geo/tr-provinces';

describe('TR_PROVINCES dataset invariants', () => {
  it('contains exactly 81 entries', () => {
    expect(TR_PROVINCES).toHaveLength(81);
  });

  it('every code is unique and matches TR-01..TR-81', () => {
    const codes = TR_PROVINCES.map((p) => p.code);
    expect(new Set(codes).size).toBe(81);
    for (let i = 1; i <= 81; i++) {
      const expected = `TR-${String(i).padStart(2, '0')}`;
      expect(codes).toContain(expected);
    }
  });

  it('plate code matches the trailing digits of the ISO code', () => {
    for (const province of TR_PROVINCES) {
      const platePart = province.code.slice(3); // 'TR-' + '34'
      expect(platePart).toBe(String(province.plate).padStart(2, '0'));
    }
  });

  it('coordinates lie within Türkiye bounding box', () => {
    // Türkiye is roughly 25.5–45.0 longitude, 35.5–42.5 latitude.
    // Pad slightly for province-center anchors near coastal corners.
    for (const province of TR_PROVINCES) {
      const [lng, lat] = province.coordinates;
      expect(lng).toBeGreaterThanOrEqual(25);
      expect(lng).toBeLessThanOrEqual(46);
      expect(lat).toBeGreaterThanOrEqual(35);
      expect(lat).toBeLessThanOrEqual(43);
    }
  });

  it('region counts total to 81 across 7 constitutional regions', () => {
    const counts: Record<string, number> = {};
    for (const province of TR_PROVINCES) {
      counts[province.region] = (counts[province.region] ?? 0) + 1;
    }
    expect(counts.Marmara).toBe(11);
    expect(counts.Ege).toBe(8);
    expect(counts.Akdeniz).toBe(8);
    expect(counts['İç Anadolu']).toBe(13);
    expect(counts.Karadeniz).toBe(18);
    expect(counts['Doğu Anadolu']).toBe(14);
    expect(counts['Güneydoğu Anadolu']).toBe(9);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(81);
  });
});

describe('TR_PROVINCE_ALIASES coverage', () => {
  it('canonical names round-trip to their own codes', () => {
    for (const province of TR_PROVINCES) {
      const found = findProvinceCodeByLabel(province.name);
      expect(found).toBe(province.code);
    }
  });

  it('İstanbul Avrupa/Anadolu split labels resolve to TR-34', () => {
    expect(findProvinceCodeByLabel('İSTANBUL(Avrupa)')).toBe('TR-34');
    expect(findProvinceCodeByLabel('İSTANBUL(Anadolu)')).toBe('TR-34');
    expect(findProvinceCodeByLabel('ISTANBUL')).toBe('TR-34');
  });

  it('handles UPPERCASE Turkish input', () => {
    expect(findProvinceCodeByLabel('ANKARA')).toBe('TR-06');
    expect(findProvinceCodeByLabel('İZMİR')).toBe('TR-35');
    expect(findProvinceCodeByLabel('ÇANAKKALE')).toBe('TR-17');
  });

  it('handles ASCII-folded variants', () => {
    expect(findProvinceCodeByLabel('IZMIR')).toBe('TR-35');
    expect(findProvinceCodeByLabel('CANAKKALE')).toBe('TR-17');
    expect(findProvinceCodeByLabel('SANLIURFA')).toBe('TR-63');
  });

  it('returns null for unknown labels', () => {
    expect(findProvinceCodeByLabel('NoSuchPlace')).toBeNull();
    expect(findProvinceCodeByLabel('')).toBeNull();
  });
});

describe('getProvinceByCode + normalizeProvinceLabel helpers', () => {
  it('getProvinceByCode round-trips valid codes', () => {
    expect(getProvinceByCode('TR-34')?.name).toBe('İstanbul');
    expect(getProvinceByCode('TR-06')?.name).toBe('Ankara');
    expect(getProvinceByCode('TR-35')?.name).toBe('İzmir');
    expect(getProvinceByCode('TR-81')?.name).toBe('Düzce');
  });

  it('getProvinceByCode returns undefined for invalid codes', () => {
    expect(getProvinceByCode('TR-99')).toBeUndefined();
    expect(getProvinceByCode('US-CA')).toBeUndefined();
    expect(getProvinceByCode('')).toBeUndefined();
  });

  it('normalizeProvinceLabel returns canonical name', () => {
    expect(normalizeProvinceLabel('ANKARA')).toBe('Ankara');
    expect(normalizeProvinceLabel('IZMIR')).toBe('İzmir');
    expect(normalizeProvinceLabel('İSTANBUL(Avrupa)')).toBe('İstanbul');
    expect(normalizeProvinceLabel('NoSuchPlace')).toBeNull();
  });
});

describe('TR_PROVINCE_ALIASES is non-empty + well-formed', () => {
  it('contains a reasonable number of entries', () => {
    // 81 canonical + UPPERCASE + ASCII-folded variants + İstanbul splits
    // + colloquial names → at minimum 200+ entries expected.
    const count = Object.keys(TR_PROVINCE_ALIASES).length;
    expect(count).toBeGreaterThan(150);
  });

  it('every alias value is a valid TR-XX code', () => {
    for (const value of Object.values(TR_PROVINCE_ALIASES)) {
      expect(value).toMatch(/^TR-(0[1-9]|[1-7]\d|8[01])$/);
    }
  });
});
