import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * AG-039 services i18n contract tests (Codex 019e8389 must_fix #4 +
 * AG-038 019e833d iter-2 #1/#4 precedent).
 */

describe('AG-039 services i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it('tab label resolves (not raw key)', () => {
    const label = t('endpointAdmin.drawer.tab.services');
    expect(label).not.toBe('endpointAdmin.drawer.tab.services');
    expect(label).toMatch(/Hizmetler/);
  });

  it('empty-state copy references `includeServices:true` (not includeServicesInventory)', () => {
    const copy = t('endpointAdmin.drawer.services.empty');
    expect(copy).toContain('includeServices:true');
    expect(copy).not.toContain('includeServicesInventory');
  });

  it('state enum labels resolve for all 4 wire states', () => {
    expect(t('endpointAdmin.drawer.services.state.RUNNING')).toBe('Çalışıyor');
    expect(t('endpointAdmin.drawer.services.state.STOPPED')).toBe('Durduruldu');
    expect(t('endpointAdmin.drawer.services.state.DISABLED')).toBe('Devre Dışı');
    expect(t('endpointAdmin.drawer.services.state.UNKNOWN')).toBe('Bilinmiyor');
  });

  it('startupMode enum labels resolve + AUTO_DELAYED distinct from AUTO', () => {
    expect(t('endpointAdmin.drawer.services.startupMode.AUTO')).toBe('Otomatik');
    expect(t('endpointAdmin.drawer.services.startupMode.AUTO_DELAYED')).toBe(
      'Otomatik (gecikmeli)',
    );
    expect(t('endpointAdmin.drawer.services.startupMode.MANUAL')).toBe('Manuel');
    expect(t('endpointAdmin.drawer.services.startupMode.DISABLED')).toBe('Devre Dışı');
    expect(t('endpointAdmin.drawer.services.startupMode.UNKNOWN')).toBe('Bilinmiyor');
  });
});

describe('AG-039 services i18n — EN locale (DICT_EN parity)', () => {
  const t = createEndpointAdminT('en');

  it('tab label resolves on EN locale (DICT_EN parity guard)', () => {
    const label = t('endpointAdmin.drawer.tab.services');
    expect(label).not.toBe('endpointAdmin.drawer.tab.services');
    expect(label).toMatch(/Services/);
  });

  it('empty-state EN copy references `includeServices:true`', () => {
    const copy = t('endpointAdmin.drawer.services.empty');
    expect(copy).toContain('includeServices:true');
    expect(copy).not.toContain('includeServicesInventory');
  });

  it('AUTO_DELAYED EN copy preserves the (delayed) qualifier', () => {
    expect(t('endpointAdmin.drawer.services.startupMode.AUTO_DELAYED')).toBe('Auto (delayed)');
  });

  it('every services namespace key has a non-raw EN value', () => {
    const keys = [
      'endpointAdmin.drawer.services.title',
      'endpointAdmin.drawer.services.subtitle',
      'endpointAdmin.drawer.services.loading',
      'endpointAdmin.drawer.services.error',
      'endpointAdmin.drawer.services.forbidden',
      'endpointAdmin.drawer.services.empty',
      'endpointAdmin.drawer.services.unsupported',
      'endpointAdmin.drawer.services.incomplete',
      'endpointAdmin.drawer.services.staleArg',
      'endpointAdmin.drawer.services.meta.heading',
      'endpointAdmin.drawer.services.meta.collectedAt',
      'endpointAdmin.drawer.services.meta.probeDuration',
      'endpointAdmin.drawer.services.table.heading',
      'endpointAdmin.drawer.services.table.col.name',
      'endpointAdmin.drawer.services.table.col.present',
      'endpointAdmin.drawer.services.table.col.state',
      'endpointAdmin.drawer.services.table.col.startupMode',
      'endpointAdmin.drawer.services.present.true',
      'endpointAdmin.drawer.services.present.false',
      'endpointAdmin.drawer.services.present.unknown',
      'endpointAdmin.drawer.services.state.RUNNING',
      'endpointAdmin.drawer.services.state.STOPPED',
      'endpointAdmin.drawer.services.state.DISABLED',
      'endpointAdmin.drawer.services.state.UNKNOWN',
      'endpointAdmin.drawer.services.startupMode.AUTO',
      'endpointAdmin.drawer.services.startupMode.AUTO_DELAYED',
      'endpointAdmin.drawer.services.startupMode.MANUAL',
      'endpointAdmin.drawer.services.startupMode.DISABLED',
      'endpointAdmin.drawer.services.startupMode.UNKNOWN',
      'endpointAdmin.drawer.services.probeErrors.heading',
      'endpointAdmin.drawer.services.probeErrors.empty',
      'endpointAdmin.drawer.services.probeErrors.col.rowOrdinal',
      'endpointAdmin.drawer.services.probeErrors.col.code',
      'endpointAdmin.drawer.services.probeErrors.col.serviceName',
      'endpointAdmin.drawer.services.probeErrors.col.summary',
    ];
    for (const key of keys) {
      const value = t(key);
      expect(value, `EN dict missing key: ${key}`).not.toBe(key);
      expect(value, `EN dict empty key: ${key}`).toBeTruthy();
    }
  });
});
