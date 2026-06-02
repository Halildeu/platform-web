import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * BE-024b outdated-software diff i18n contract tests (Faz 22.5 P2-A
 * slice-3b; mirrors BE-024 + BE-025 i18n drift detector pattern).
 *
 * The component test mocks the i18n module to return the key verbatim;
 * these tests run `createEndpointAdminT` against the canonical TR + EN
 * dictionaries — catches the BE-024 / BE-025 iter-1 regression class
 * where DICT_TR silently misses a key.
 */

const REQUIRED_KEYS = [
  'endpointAdmin.drawer.tab.outdatedSoftwareDiff',
  'endpointAdmin.drawer.outdatedSoftwareDiff.loading',
  'endpointAdmin.drawer.outdatedSoftwareDiff.error',
  'endpointAdmin.drawer.outdatedSoftwareDiff.forbidden',
  'endpointAdmin.drawer.outdatedSoftwareDiff.staleWarning',
  'endpointAdmin.drawer.outdatedSoftwareDiff.status.OK',
  'endpointAdmin.drawer.outdatedSoftwareDiff.status.NO_CHANGE',
  'endpointAdmin.drawer.outdatedSoftwareDiff.status.INSUFFICIENT_HISTORY',
  'endpointAdmin.drawer.outdatedSoftwareDiff.status.NO_HISTORY',
  'endpointAdmin.drawer.outdatedSoftwareDiff.window.from',
  'endpointAdmin.drawer.outdatedSoftwareDiff.window.to',
  'endpointAdmin.drawer.outdatedSoftwareDiff.truncation.notice',
  'endpointAdmin.drawer.outdatedSoftwareDiff.counts.added',
  'endpointAdmin.drawer.outdatedSoftwareDiff.counts.removed',
  'endpointAdmin.drawer.outdatedSoftwareDiff.counts.versionChanged',
  'endpointAdmin.drawer.outdatedSoftwareDiff.counts.availableVersionBumped',
  'endpointAdmin.drawer.outdatedSoftwareDiff.added.title',
  'endpointAdmin.drawer.outdatedSoftwareDiff.removed.title',
  'endpointAdmin.drawer.outdatedSoftwareDiff.versionChanged.title',
  'endpointAdmin.drawer.outdatedSoftwareDiff.availableVersionBumped.title',
  'endpointAdmin.drawer.outdatedSoftwareDiff.col.packageId',
  'endpointAdmin.drawer.outdatedSoftwareDiff.col.installed',
  'endpointAdmin.drawer.outdatedSoftwareDiff.col.fromInstalled',
  'endpointAdmin.drawer.outdatedSoftwareDiff.col.toInstalled',
  'endpointAdmin.drawer.outdatedSoftwareDiff.col.fromAvailable',
  'endpointAdmin.drawer.outdatedSoftwareDiff.col.toAvailable',
] as const;

describe('BE-024b outdated-software diff i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it.each(REQUIRED_KEYS)('TR key resolves (not raw key): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('tab label is the canonical Turkish copy', () => {
    expect(t('endpointAdmin.drawer.tab.outdatedSoftwareDiff')).toBe('Güncel Olmayan Değişimler');
  });

  it('4-status enum copy is distinct (NEVER collapsed)', () => {
    const ok = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.OK');
    const noChange = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.NO_CHANGE');
    const insufficient = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.INSUFFICIENT_HISTORY');
    const noHistory = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.NO_HISTORY');
    expect(new Set([ok, noChange, insufficient, noHistory]).size).toBe(4);
  });
});

describe('BE-024b outdated-software diff i18n — EN locale', () => {
  const t = createEndpointAdminT('en');

  it.each(REQUIRED_KEYS)('EN key resolves (not raw key): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('tab label is the canonical English copy', () => {
    expect(t('endpointAdmin.drawer.tab.outdatedSoftwareDiff')).toBe('Outdated-Software Changes');
  });

  it('4-status enum copy is distinct (NEVER collapsed)', () => {
    const ok = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.OK');
    const noChange = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.NO_CHANGE');
    const insufficient = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.INSUFFICIENT_HISTORY');
    const noHistory = t('endpointAdmin.drawer.outdatedSoftwareDiff.status.NO_HISTORY');
    expect(new Set([ok, noChange, insufficient, noHistory]).size).toBe(4);
  });
});
