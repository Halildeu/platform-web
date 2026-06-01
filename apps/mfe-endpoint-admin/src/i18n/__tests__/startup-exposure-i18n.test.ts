import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * AG-040 startup-exposure i18n contract tests.
 * Inherits AG-038/AG-039 i18n parity + payload-bit-literal precedents.
 */

describe('AG-040 startup-exposure i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it('tab label resolves', () => {
    expect(t('endpointAdmin.drawer.tab.startupExposure')).toBe('Başlangıç + Maruziyet');
  });

  it('empty-state references `includeStartupExposure:true` literal', () => {
    const copy = t('endpointAdmin.drawer.startupExposure.empty');
    expect(copy).toContain('includeStartupExposure:true');
    expect(copy).not.toContain('includeStartupExposureInventory');
  });

  it('10 location enum labels resolve', () => {
    expect(t('endpointAdmin.drawer.startupExposure.location.HKLM_RUN')).toBe('HKLM Run');
    expect(t('endpointAdmin.drawer.startupExposure.location.HKLM_RUNONCE')).toBe('HKLM RunOnce');
    expect(t('endpointAdmin.drawer.startupExposure.location.HKLM_WOW6432_RUN')).toBe(
      'HKLM WOW64 Run',
    );
    expect(t('endpointAdmin.drawer.startupExposure.location.HKCU_RUN')).toBe('HKCU Run');
    expect(t('endpointAdmin.drawer.startupExposure.location.HKCU_RUNONCE')).toBe('HKCU RunOnce');
    expect(t('endpointAdmin.drawer.startupExposure.location.STARTUP_FOLDER_COMMON')).toBe(
      'Ortak Startup Klasörü',
    );
    expect(t('endpointAdmin.drawer.startupExposure.location.STARTUP_FOLDER_USER')).toBe(
      'Kullanıcı Startup Klasörü',
    );
    expect(t('endpointAdmin.drawer.startupExposure.location.TASK_SCHEDULER:ROOT')).toBe(
      'Görev Zamanlayıcı (Kök)',
    );
    expect(
      t('endpointAdmin.drawer.startupExposure.location.TASK_SCHEDULER:MICROSOFT_WINDOWS'),
    ).toBe('Görev Zamanlayıcı (MS Windows)');
    expect(t('endpointAdmin.drawer.startupExposure.location.TASK_SCHEDULER:CUSTOM')).toBe(
      'Görev Zamanlayıcı (Özel)',
    );
  });

  it('2 probeOrigin enum labels resolve', () => {
    expect(t('endpointAdmin.drawer.startupExposure.probeOrigin.REGISTRY')).toBe('Kayıt Defteri');
    expect(t('endpointAdmin.drawer.startupExposure.probeOrigin.SCHEDULED_TASK')).toBe(
      'Görev Zamanlayıcı',
    );
  });
});

describe('AG-040 startup-exposure i18n — EN locale (DICT_EN parity)', () => {
  const t = createEndpointAdminT('en');

  it('tab label resolves on EN', () => {
    expect(t('endpointAdmin.drawer.tab.startupExposure')).toBe('Startup + Exposure');
  });

  it('empty-state EN references `includeStartupExposure:true`', () => {
    const copy = t('endpointAdmin.drawer.startupExposure.empty');
    expect(copy).toContain('includeStartupExposure:true');
  });

  it('all keys non-raw on EN (DICT_EN parity check)', () => {
    const keys = [
      'endpointAdmin.drawer.startupExposure.title',
      'endpointAdmin.drawer.startupExposure.subtitle',
      'endpointAdmin.drawer.startupExposure.loading',
      'endpointAdmin.drawer.startupExposure.error',
      'endpointAdmin.drawer.startupExposure.forbidden',
      'endpointAdmin.drawer.startupExposure.empty',
      'endpointAdmin.drawer.startupExposure.unsupported',
      'endpointAdmin.drawer.startupExposure.incomplete',
      'endpointAdmin.drawer.startupExposure.staleArg',
      'endpointAdmin.drawer.startupExposure.meta.heading',
      'endpointAdmin.drawer.startupExposure.meta.collectedAt',
      'endpointAdmin.drawer.startupExposure.meta.probeDuration',
      'endpointAdmin.drawer.startupExposure.exposure.heading',
      'endpointAdmin.drawer.startupExposure.exposure.rdp',
      'endpointAdmin.drawer.startupExposure.exposure.firewallEventLog',
      'endpointAdmin.drawer.startupExposure.badge.enabled',
      'endpointAdmin.drawer.startupExposure.badge.disabled',
      'endpointAdmin.drawer.startupExposure.badge.unknown',
      'endpointAdmin.drawer.startupExposure.table.heading',
      'endpointAdmin.drawer.startupExposure.table.empty',
      'endpointAdmin.drawer.startupExposure.table.col.name',
      'endpointAdmin.drawer.startupExposure.table.col.location',
      'endpointAdmin.drawer.startupExposure.table.col.enabled',
      'endpointAdmin.drawer.startupExposure.table.col.probeOrigin',
      'endpointAdmin.drawer.startupExposure.location.HKLM_RUN',
      'endpointAdmin.drawer.startupExposure.location.HKLM_RUNONCE',
      'endpointAdmin.drawer.startupExposure.location.HKLM_WOW6432_RUN',
      'endpointAdmin.drawer.startupExposure.location.HKCU_RUN',
      'endpointAdmin.drawer.startupExposure.location.HKCU_RUNONCE',
      'endpointAdmin.drawer.startupExposure.location.STARTUP_FOLDER_COMMON',
      'endpointAdmin.drawer.startupExposure.location.STARTUP_FOLDER_USER',
      'endpointAdmin.drawer.startupExposure.location.TASK_SCHEDULER:ROOT',
      'endpointAdmin.drawer.startupExposure.location.TASK_SCHEDULER:MICROSOFT_WINDOWS',
      'endpointAdmin.drawer.startupExposure.location.TASK_SCHEDULER:CUSTOM',
      'endpointAdmin.drawer.startupExposure.probeOrigin.REGISTRY',
      'endpointAdmin.drawer.startupExposure.probeOrigin.SCHEDULED_TASK',
      'endpointAdmin.drawer.startupExposure.enabled.true',
      'endpointAdmin.drawer.startupExposure.enabled.false',
      'endpointAdmin.drawer.startupExposure.enabled.unknown',
      'endpointAdmin.drawer.startupExposure.probeErrors.heading',
      'endpointAdmin.drawer.startupExposure.probeErrors.empty',
      'endpointAdmin.drawer.startupExposure.probeErrors.col.rowOrdinal',
      'endpointAdmin.drawer.startupExposure.probeErrors.col.code',
      'endpointAdmin.drawer.startupExposure.probeErrors.col.source',
      'endpointAdmin.drawer.startupExposure.probeErrors.col.summary',
    ];
    for (const key of keys) {
      const value = t(key);
      expect(value, `EN dict missing key: ${key}`).not.toBe(key);
      expect(value, `EN dict empty key: ${key}`).toBeTruthy();
    }
  });
});
