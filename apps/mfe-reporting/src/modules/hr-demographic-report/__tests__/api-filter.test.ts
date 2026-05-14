/**
 * fetchHrDemographicRows — location-filter regression tests.
 *
 * Codex 019e26a9 post-impl iter-2 must-fix: filter behaviour must
 * agree with the map adapter:
 *   1. Canonical "İstanbul" filter MUST include İSTANBUL(Avrupa) and
 *      İSTANBUL(Anadolu) split rows (which the map adapter aggregates
 *      to TR-34). Earlier `r.location === filters.location` exact
 *      equality dropped these silently.
 *   2. "Belirtilmemiş" filter MUST only catch rows that the adapter
 *      treats as unspecified — NOT every row that fails the alias
 *      lookup. Unmatched labels (typos, new provinces, etc.) surface
 *      via the chart adapter's `unmatchedLabels`, not the grid's
 *      Belirtilmemiş bucket.
 */
import { describe, it, expect } from 'vitest';
import { fetchHrDemographicRows } from '../api';
import type { HrDemographicFilters } from '../types';
import type { GridRequest } from '../../../grid';

const baseRequest: GridRequest = {
  page: 1,
  pageSize: 1000,
  sortModel: [],
};

const emptyFilters: HrDemographicFilters = {
  search: '',
  department: 'all',
  location: 'all',
  employmentType: 'all',
  gender: 'all',
  ageGroup: 'all',
};

describe('fetchHrDemographicRows — location filter (PR-X14 regression)', () => {
  it('İstanbul filter includes İSTANBUL(Avrupa) + İSTANBUL(Anadolu) split labels', async () => {
    const response = await fetchHrDemographicRows(
      { ...emptyFilters, location: 'İstanbul' },
      baseRequest,
    );

    // Mock data Phase 1 seeds each label at least once, so split rows
    // exist; Phase 2 adds weighted-random fill. The filter must surface
    // every row whose `findProvinceCodeByLabel` resolves to TR-34.
    const labels = response.rows.map((r) => r.location);
    expect(labels).toContain('İstanbul');
    expect(labels).toContain('İSTANBUL(Avrupa)');
    expect(labels).toContain('İSTANBUL(Anadolu)');
  });

  it('Belirtilmemiş filter returns ONLY unspecified rows', async () => {
    const response = await fetchHrDemographicRows(
      { ...emptyFilters, location: 'Belirtilmemiş' },
      baseRequest,
    );

    // Every returned row must look unspecified — no canonical TR
    // provinces, no "İstanbul" split labels.
    const uniqueLabels = new Set(response.rows.map((r) => r.location));
    // Common Belirtilmemiş forms: 'Belirtilmemiş', '' (empty), etc.
    // Real rows in the mock seed set use 'Belirtilmemiş' (Phase 1).
    expect(uniqueLabels.has('Belirtilmemiş')).toBe(true);
    expect(uniqueLabels.has('İstanbul')).toBe(false);
    expect(uniqueLabels.has('Ankara')).toBe(false);
    expect(uniqueLabels.has('İSTANBUL(Avrupa)')).toBe(false);
  });

  it('canonical Ankara filter excludes İstanbul + İzmir rows', async () => {
    const response = await fetchHrDemographicRows(
      { ...emptyFilters, location: 'Ankara' },
      baseRequest,
    );

    const labels = response.rows.map((r) => r.location);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l === 'Ankara' || l.toUpperCase().startsWith('ANKARA'))).toBe(true);
  });

  it('all filter returns every row regardless of label', async () => {
    const response = await fetchHrDemographicRows(
      { ...emptyFilters, location: 'all' },
      baseRequest,
    );

    const labels = new Set(response.rows.map((r) => r.location));
    expect(labels.has('İstanbul')).toBe(true);
    expect(labels.has('Ankara')).toBe(true);
    expect(labels.has('Belirtilmemiş')).toBe(true);
    expect(labels.has('İSTANBUL(Avrupa)')).toBe(true);
  });

  it('İzmir filter (ASCII-folded variant) accepts IZMIR canonicalised rows', async () => {
    const response = await fetchHrDemographicRows(
      { ...emptyFilters, location: 'IZMIR' },
      baseRequest,
    );

    // Filter alias normalises IZMIR → TR-35 → matches all İzmir rows.
    const labels = response.rows.map((r) => r.location);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      // Each surviving row's label, when aliased, must equal TR-35
      // — but the simple expectation is: contains İzmir or IZMIR or
      // some normalized form thereof.
      expect(label.toUpperCase().replace(/İ/g, 'I')).toContain('IZMIR');
    }
  });
});
