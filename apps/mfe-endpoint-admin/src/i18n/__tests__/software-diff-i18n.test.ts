import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * BE-024 software-inventory diff i18n contract tests (Codex 019e84ca
 * iter-1 must_fix #2).
 *
 * Component tests mock the i18n module to return the key as the value,
 * so they cannot verify that the actual translation strings exist.
 * These tests run the real `createEndpointAdminT` factory against the
 * canonical TR + EN dictionaries — drift detector against the iter-1
 * regression where DICT_TR was silently missing all softwareDiff keys.
 */

const REQUIRED_KEYS = [
  'endpointAdmin.drawer.tab.softwareDiff',
  'endpointAdmin.drawer.softwareDiff.loading',
  'endpointAdmin.drawer.softwareDiff.error',
  'endpointAdmin.drawer.softwareDiff.forbidden',
  'endpointAdmin.drawer.softwareDiff.staleWarning',
  'endpointAdmin.drawer.softwareDiff.status.OK',
  'endpointAdmin.drawer.softwareDiff.status.NO_CHANGE',
  'endpointAdmin.drawer.softwareDiff.status.INSUFFICIENT_HISTORY',
  'endpointAdmin.drawer.softwareDiff.status.NO_HISTORY',
  'endpointAdmin.drawer.softwareDiff.window.from',
  'endpointAdmin.drawer.softwareDiff.window.to',
  'endpointAdmin.drawer.softwareDiff.counts.added',
  'endpointAdmin.drawer.softwareDiff.counts.removed',
  'endpointAdmin.drawer.softwareDiff.counts.versionChanged',
  'endpointAdmin.drawer.softwareDiff.added.title',
  'endpointAdmin.drawer.softwareDiff.removed.title',
  'endpointAdmin.drawer.softwareDiff.versionChanged.title',
  'endpointAdmin.drawer.softwareDiff.col.displayName',
  'endpointAdmin.drawer.softwareDiff.col.publisher',
  'endpointAdmin.drawer.softwareDiff.col.fromVersion',
  'endpointAdmin.drawer.softwareDiff.col.toVersion',
] as const;

describe('BE-024 software-diff i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it.each(REQUIRED_KEYS)('TR key resolves (not raw key): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('tab label is the canonical Turkish copy', () => {
    expect(t('endpointAdmin.drawer.tab.softwareDiff')).toBe('Yazılım Değişimleri');
  });

  it('4-status enum copy is distinct per status (NEVER collapsed)', () => {
    const ok = t('endpointAdmin.drawer.softwareDiff.status.OK');
    const noChange = t('endpointAdmin.drawer.softwareDiff.status.NO_CHANGE');
    const insufficient = t('endpointAdmin.drawer.softwareDiff.status.INSUFFICIENT_HISTORY');
    const noHistory = t('endpointAdmin.drawer.softwareDiff.status.NO_HISTORY');
    const all = [ok, noChange, insufficient, noHistory];
    expect(new Set(all).size).toBe(4);
  });
});

describe('BE-024 software-diff i18n — EN locale', () => {
  const t = createEndpointAdminT('en');

  it.each(REQUIRED_KEYS)('EN key resolves (not raw key): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('tab label is the canonical English copy', () => {
    expect(t('endpointAdmin.drawer.tab.softwareDiff')).toBe('Software Changes');
  });

  it('4-status enum copy is distinct per status (NEVER collapsed)', () => {
    const ok = t('endpointAdmin.drawer.softwareDiff.status.OK');
    const noChange = t('endpointAdmin.drawer.softwareDiff.status.NO_CHANGE');
    const insufficient = t('endpointAdmin.drawer.softwareDiff.status.INSUFFICIENT_HISTORY');
    const noHistory = t('endpointAdmin.drawer.softwareDiff.status.NO_HISTORY');
    const all = [ok, noChange, insufficient, noHistory];
    expect(new Set(all).size).toBe(4);
  });
});
