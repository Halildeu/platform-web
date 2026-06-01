import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * BE-025 prohibited-software i18n contract tests (Faz 22.5 P2-A
 * slice-2; mirrors BE-024 / AG-038 / AG-039 / AG-040 / AG-041
 * dictionary-resolution drift detector pattern).
 *
 * Component tests mock the i18n module to return the key as the value;
 * these tests run the real `createEndpointAdminT` factory against the
 * canonical TR + EN dictionaries — catches the case where DICT_TR
 * silently misses a key (the iter-1 regression class).
 */

const REQUIRED_KEYS = [
  'endpointAdmin.drawer.tab.prohibitedSoftware',
  'endpointAdmin.drawer.prohibitedSoftware.loading',
  'endpointAdmin.drawer.prohibitedSoftware.error',
  'endpointAdmin.drawer.prohibitedSoftware.forbidden',
  'endpointAdmin.drawer.prohibitedSoftware.staleWarning',
  'endpointAdmin.drawer.prohibitedSoftware.status.OK',
  'endpointAdmin.drawer.prohibitedSoftware.status.NO_EVALUATION',
  'endpointAdmin.drawer.prohibitedSoftware.noEvaluation.notice',
  'endpointAdmin.drawer.prohibitedSoftware.noFindings.notice',
  'endpointAdmin.drawer.prohibitedSoftware.meta.evaluatedAt',
  'endpointAdmin.drawer.prohibitedSoftware.meta.inventorySnapshotId',
  'endpointAdmin.drawer.prohibitedSoftware.findings.title',
  'endpointAdmin.drawer.prohibitedSoftware.col.ruleId',
  'endpointAdmin.drawer.prohibitedSoftware.col.matchType',
  'endpointAdmin.drawer.prohibitedSoftware.col.matchMode',
  'endpointAdmin.drawer.prohibitedSoftware.col.matchedName',
  'endpointAdmin.drawer.prohibitedSoftware.col.matchedPublisher',
  'endpointAdmin.drawer.prohibitedSoftware.col.matchedVersion',
] as const;

describe('BE-025 prohibited-software i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it.each(REQUIRED_KEYS)('TR key resolves (not raw key): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('tab label is the canonical Turkish copy', () => {
    expect(t('endpointAdmin.drawer.tab.prohibitedSoftware')).toBe('Yasaklı Yazılım');
  });

  it('2-status enum copy is distinct (NEVER collapsed)', () => {
    const ok = t('endpointAdmin.drawer.prohibitedSoftware.status.OK');
    const noEval = t('endpointAdmin.drawer.prohibitedSoftware.status.NO_EVALUATION');
    expect(ok).not.toBe(noEval);
  });

  it('noEvaluation.notice and noFindings.notice are distinct (NEVER collapsed)', () => {
    // Critical: the "no evaluation yet" vs "evaluation ran, no matches"
    // operator stories must read differently. A single copy here would
    // be a usability regression — operator could not tell the two
    // mutually-exclusive states apart.
    const a = t('endpointAdmin.drawer.prohibitedSoftware.noEvaluation.notice');
    const b = t('endpointAdmin.drawer.prohibitedSoftware.noFindings.notice');
    expect(a).not.toBe(b);
  });
});

describe('BE-025 prohibited-software i18n — EN locale', () => {
  const t = createEndpointAdminT('en');

  it.each(REQUIRED_KEYS)('EN key resolves (not raw key): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('tab label is the canonical English copy', () => {
    expect(t('endpointAdmin.drawer.tab.prohibitedSoftware')).toBe('Prohibited Software');
  });

  it('2-status enum copy is distinct (NEVER collapsed)', () => {
    const ok = t('endpointAdmin.drawer.prohibitedSoftware.status.OK');
    const noEval = t('endpointAdmin.drawer.prohibitedSoftware.status.NO_EVALUATION');
    expect(ok).not.toBe(noEval);
  });

  it('noEvaluation.notice and noFindings.notice are distinct (NEVER collapsed)', () => {
    const a = t('endpointAdmin.drawer.prohibitedSoftware.noEvaluation.notice');
    const b = t('endpointAdmin.drawer.prohibitedSoftware.noFindings.notice');
    expect(a).not.toBe(b);
  });
});
