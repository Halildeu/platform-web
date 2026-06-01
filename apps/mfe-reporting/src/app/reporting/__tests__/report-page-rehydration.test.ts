/**
 * PR-D1b.B.3 step 6 (Codex thread 019e8074, 2026-06-01) — pure decision
 * function tests for the ReportPage cold-cache rehydration effect.
 *
 * The matrix from `report-page-rehydration.ts`:
 *
 *  1. hasMetadataDrivenFilters !== true → no
 *  2. getFilterDefinitions missing → no
 *  3. getFilterDefinitions returns undefined → no
 *  4. user edited (isInitialState false) → no
 *  5. definitions reference unchanged → no (idempotent guard)
 *  6. otherwise → yes
 */

import { describe, expect, it } from 'vitest';
import { decideRehydration } from '../report-page-rehydration';
import type { ReportModule } from '../../../modules/types';
import type { FilterDefinition } from '../../../modules/dynamic-report/types';

/* -------------------------------------------------------------------------- */
/*  Stub helpers                                                              */
/* -------------------------------------------------------------------------- */

type AnyModule = ReportModule<Record<string, unknown>, Record<string, unknown>>;

const stubModule = (overrides: Partial<AnyModule>): AnyModule => ({
  id: 'stub',

  sharedReportId: 'stub' as any,
  route: 'stub',
  titleKey: 'stub',
  descriptionKey: 'stub',
  breadcrumbKeys: [],
  navKey: 'stub',
  createInitialFilters: () => ({}),
  renderFilters: () => null,
  getColumns: () => [],
  fetchRows: async () => ({ rows: [], total: 0 }),
  ...overrides,
});

const sampleDefinitions: FilterDefinition[] = [
  { key: 'status', kind: 'enum-select' },
  { key: 'period', kind: 'month-picker' },
];

/* -------------------------------------------------------------------------- */
/*  decideRehydration                                                         */
/* -------------------------------------------------------------------------- */

describe('decideRehydration', () => {
  it('1. hasMetadataDrivenFilters !== true → does NOT rehydrate', () => {
    const module = stubModule({
      hasMetadataDrivenFilters: false,
      getFilterDefinitions: () => sampleDefinitions,
    });
    const decision = decideRehydration(module, true, undefined);
    expect(decision.rehydrate).toBe(false);
  });

  it('1.a hasMetadataDrivenFilters undefined → does NOT rehydrate', () => {
    const module = stubModule({
      getFilterDefinitions: () => sampleDefinitions,
    });
    const decision = decideRehydration(module, true, undefined);
    expect(decision.rehydrate).toBe(false);
  });

  it('2. getFilterDefinitions is not a function → does NOT rehydrate', () => {
    const module = stubModule({
      hasMetadataDrivenFilters: true,
    });
    const decision = decideRehydration(module, true, undefined);
    expect(decision.rehydrate).toBe(false);
    if (!decision.rehydrate) {
      expect(decision.reason).toMatch(/getFilterDefinitions/);
    }
  });

  it('3. getFilterDefinitions returns undefined → does NOT rehydrate', () => {
    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => undefined,
    });
    const decision = decideRehydration(module, true, undefined);
    expect(decision.rehydrate).toBe(false);
    if (!decision.rehydrate) {
      expect(decision.reason).toMatch(/undefined/);
    }
  });

  it('4. user edited (isInitialState=false) → does NOT rehydrate', () => {
    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => sampleDefinitions,
    });
    const decision = decideRehydration(module, false, undefined);
    expect(decision.rehydrate).toBe(false);
    if (!decision.rehydrate) {
      expect(decision.reason).toMatch(/edited/);
    }
  });

  it('5. definitions reference unchanged → does NOT rehydrate (idempotent)', () => {
    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => sampleDefinitions,
    });
    // Pass the same reference as `lastRehydratedDefinitions` — the cache
    // returns the same array until a fresh fetch lands.
    const decision = decideRehydration(module, true, sampleDefinitions);
    expect(decision.rehydrate).toBe(false);
    if (!decision.rehydrate) {
      expect(decision.reason).toMatch(/unchanged/);
    }
  });

  it('6. cold mount (initial state, fresh definitions) → REHYDRATE', () => {
    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => sampleDefinitions,
    });
    const decision = decideRehydration(module, true, undefined);
    expect(decision.rehydrate).toBe(true);
    if (decision.rehydrate) {
      expect(decision.definitions).toBe(sampleDefinitions);
    }
  });

  it('6.a metadata invalidation with a NEW definitions reference → REHYDRATE again', () => {
    const firstDefinitions = sampleDefinitions;
    const refreshedDefinitions: FilterDefinition[] = [
      { key: 'status', kind: 'enum-select' },
      { key: 'period', kind: 'month-picker' },
      // A new third definition added by the backend.
      { key: 'department', kind: 'enum-select' },
    ];

    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => refreshedDefinitions,
    });

    const decision = decideRehydration(module, true, firstDefinitions);
    expect(decision.rehydrate).toBe(true);
    if (decision.rehydrate) {
      expect(decision.definitions).toBe(refreshedDefinitions);
      expect(decision.definitions).not.toBe(firstDefinitions);
    }
  });

  it('6.b user edits between rehydration and re-resolve → does NOT rehydrate again', () => {
    // Simulates: cold mount → rehydrate → user edits a filter → metadata
    // re-resolves with the same definitions. We must NOT clobber the
    // user's edit, even though the array reference is the same.
    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => sampleDefinitions,
    });
    // After the first rehydration the ref would track sampleDefinitions
    // AND isInitialFilterStateRef.current would have been flipped to
    // false by the setFieldValue wrapper. Test the false branch wins
    // even when the reference happens to differ.
    const decision = decideRehydration(module, false, undefined);
    expect(decision.rehydrate).toBe(false);
  });

  it('returns the actual definitions array on a positive decision (caller stamps the ref with it)', () => {
    const refreshedDefinitions: FilterDefinition[] = [{ key: 'department', kind: 'enum-select' }];
    const module = stubModule({
      hasMetadataDrivenFilters: true,
      getFilterDefinitions: () => refreshedDefinitions,
    });

    const decision = decideRehydration(module, true, undefined);
    if (decision.rehydrate) {
      expect(decision.definitions).toBe(refreshedDefinitions);
    } else {
      throw new Error('expected rehydrate=true');
    }
  });
});
