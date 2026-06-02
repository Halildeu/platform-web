import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * WEB-015 v2-b (Codex 019e87bc iter-3 AGREE) — i18n contract drift
 * detector for the 6 new DeviceGrid columns (DeviceGridColumns
 * SCHEMA_VERSION = 4).
 *
 * Mirrors the BE-024 / BE-024b / WEB-015 v2-a drift detector pattern:
 * the page-level test mocks the i18n module to return the key verbatim,
 * so the canonical TR + EN dictionaries need their own drift detector or
 * a silent `DICT_TR`/`DICT_EN` miss would not show up in any component
 * test.
 */

const REQUIRED_KEYS = [
  'endpointAdmin.devices.col.diagnosticsLatency',
  'endpointAdmin.devices.col.diagnosticsLastErrorCode',
  'endpointAdmin.devices.col.diagnosticsLastErrorAt',
  'endpointAdmin.devices.col.startupRdpEnabled',
  'endpointAdmin.devices.col.startupFirewallEventLog',
  'endpointAdmin.devices.col.servicesCriticalStopped',
] as const;

describe('WEB-015 v2-b DeviceGrid i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it.each(REQUIRED_KEYS)('TR key resolves (not raw fall-through): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('canonical column headers match backend Turkish labels (raw CSV header parity)', () => {
    expect(t('endpointAdmin.devices.col.diagnosticsLatency')).toBe('Ajan Son Poll Gecikmesi (ms)');
    expect(t('endpointAdmin.devices.col.diagnosticsLastErrorCode')).toBe('Ajan Son Hata Kodu');
    expect(t('endpointAdmin.devices.col.diagnosticsLastErrorAt')).toBe('Ajan Son Hata Zamanı');
    expect(t('endpointAdmin.devices.col.startupRdpEnabled')).toBe('Başlangıç RDP Etkin');
    expect(t('endpointAdmin.devices.col.startupFirewallEventLog')).toBe(
      'Başlangıç Firewall Olay Günlüğü',
    );
    expect(t('endpointAdmin.devices.col.servicesCriticalStopped')).toBe(
      'Kritik Durdurulmuş Servis Sayısı',
    );
  });

  it('6 column headers are pairwise distinct (NEVER collapsed)', () => {
    const labels = new Set(REQUIRED_KEYS.map((k) => t(k)));
    expect(labels.size).toBe(REQUIRED_KEYS.length);
  });
});

describe('WEB-015 v2-b DeviceGrid i18n — EN locale', () => {
  const t = createEndpointAdminT('en');

  it.each(REQUIRED_KEYS)('EN key resolves (DICT_EN parity): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('canonical column headers carry the parallel EN copy', () => {
    expect(t('endpointAdmin.devices.col.diagnosticsLatency')).toBe('Agent Last Poll Latency (ms)');
    expect(t('endpointAdmin.devices.col.diagnosticsLastErrorCode')).toBe('Agent Last Error Code');
    expect(t('endpointAdmin.devices.col.startupRdpEnabled')).toBe('Startup RDP Enabled');
    expect(t('endpointAdmin.devices.col.servicesCriticalStopped')).toBe(
      'Critical Stopped Services',
    );
  });
});
