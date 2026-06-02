import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * Faz 22.7 D3 compliance gap i18n contract tests (Codex 019e88db P1
 * absorb: TR+EN parity for every key the page renders).
 */

const KEYS = [
  'endpointAdmin.complianceGap.title',
  'endpointAdmin.complianceGap.subtitle',
  'endpointAdmin.complianceGap.filter.gapTypes',
  'endpointAdmin.complianceGap.filter.gapType.rdp_enabled',
  'endpointAdmin.complianceGap.filter.gapType.pending_security_updates',
  'endpointAdmin.complianceGap.filter.freshnessWindow',
  'endpointAdmin.complianceGap.filter.freshnessWindow.7d',
  'endpointAdmin.complianceGap.filter.freshnessWindow.30d',
  'endpointAdmin.complianceGap.filter.freshnessWindow.90d',
  'endpointAdmin.complianceGap.filter.freshnessWindow.366d',
  'endpointAdmin.complianceGap.col.hostname',
  'endpointAdmin.complianceGap.col.gapCount',
  'endpointAdmin.complianceGap.col.gaps',
  'endpointAdmin.complianceGap.col.gapStrength',
  'endpointAdmin.complianceGap.col.lastSeen',
  'endpointAdmin.complianceGap.strength.strong',
  'endpointAdmin.complianceGap.strength.weak',
  'endpointAdmin.complianceGap.empty',
  'endpointAdmin.complianceGap.loading',
  'endpointAdmin.complianceGap.forbidden',
  'endpointAdmin.complianceGap.error',
  'endpointAdmin.complianceGap.filterEcho.computedAt',
  'endpointAdmin.complianceGap.filterEcho.window',
  'endpointAdmin.complianceGap.filterEcho.gapTypes',
  'endpointAdmin.complianceGap.rowAria',
  'endpointAdmin.complianceGap.paginationAria',
  'endpointAdmin.complianceGap.prev',
  'endpointAdmin.complianceGap.next',
  'endpointAdmin.complianceGap.pageIndicator',
];

describe('Faz 22.7 D3 compliance-gap i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  for (const key of KEYS) {
    it(`${key} resolves to a non-key TR string`, () => {
      const v = t(key);
      expect(v).not.toBe(key);
      expect(v.length).toBeGreaterThan(0);
    });
  }

  it('title contains the Turkish noun "Boşluk"', () => {
    expect(t('endpointAdmin.complianceGap.title')).toContain('Boşluk');
  });
});

describe('Faz 22.7 D3 compliance-gap i18n — EN locale parity', () => {
  const t = createEndpointAdminT('en');

  for (const key of KEYS) {
    it(`${key} resolves to a non-key EN string`, () => {
      const v = t(key);
      expect(v).not.toBe(key);
      expect(v.length).toBeGreaterThan(0);
    });
  }

  it('title contains the English noun "Gap"', () => {
    expect(t('endpointAdmin.complianceGap.title')).toContain('Gap');
  });
});
