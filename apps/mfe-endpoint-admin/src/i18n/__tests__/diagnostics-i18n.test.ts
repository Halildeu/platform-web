import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * AG-038 diagnostics i18n contract tests (Codex 019e833d iter-2
 * must_fix #1 + #4).
 *
 * Component tests mock the i18n module to return the key as the value,
 * so they cannot verify that the actual translation strings carry the
 * expected operator-payload bit name. These tests run the real
 * `createEndpointAdminT` factory against the canonical TR + EN
 * dictionaries.
 */

describe('AG-038 diagnostics i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it('tab label resolves (not raw key)', () => {
    const label = t('endpointAdmin.drawer.tab.diagnostics');
    expect(label).not.toBe('endpointAdmin.drawer.tab.diagnostics');
    expect(label).toMatch(/Agent Tanılaması/);
  });

  it('empty-state copy references `includeDiagnostics:true` (not includeAgentDiagnostics)', () => {
    const copy = t('endpointAdmin.drawer.diagnostics.empty');
    expect(copy).toContain('includeDiagnostics:true');
    expect(copy).not.toContain('includeAgentDiagnostics');
  });

  it('incomplete fail-closed copy mentions probe + connection trustworthiness', () => {
    const copy = t('endpointAdmin.drawer.diagnostics.incomplete');
    expect(copy).toMatch(/probe/);
    expect(copy).toMatch(/güven/i);
  });

  it('connectivity badge keys resolve to translated values', () => {
    expect(t('endpointAdmin.drawer.diagnostics.badge.reachable')).toBe('Erişilebilir');
    expect(t('endpointAdmin.drawer.diagnostics.badge.unreachable')).toBe('Erişilemiyor');
    expect(t('endpointAdmin.drawer.diagnostics.badge.valid')).toBe('Geçerli');
    expect(t('endpointAdmin.drawer.diagnostics.badge.invalid')).toBe('Geçersiz');
    expect(t('endpointAdmin.drawer.diagnostics.badge.unknown')).toBe('Bilinmiyor');
  });

  it('lastError + probeErrors heading keys resolve', () => {
    expect(t('endpointAdmin.drawer.diagnostics.lastError.heading')).toBe('Son Hata');
    expect(t('endpointAdmin.drawer.diagnostics.probeErrors.heading')).toBe('Probe Hataları');
  });
});

describe('AG-038 diagnostics i18n — EN locale (Codex iter-2 must_fix #1)', () => {
  const t = createEndpointAdminT('en');

  it('tab label resolves on EN locale (DICT_EN parity guard)', () => {
    const label = t('endpointAdmin.drawer.tab.diagnostics');
    expect(label).not.toBe('endpointAdmin.drawer.tab.diagnostics');
    expect(label).toMatch(/Agent Diagnostics/);
  });

  it('empty-state EN copy references `includeDiagnostics:true`', () => {
    const copy = t('endpointAdmin.drawer.diagnostics.empty');
    expect(copy).toContain('includeDiagnostics:true');
    expect(copy).not.toContain('includeAgentDiagnostics');
  });

  it('every diagnostics namespace key has a non-raw EN value', () => {
    const keys = [
      'endpointAdmin.drawer.diagnostics.title',
      'endpointAdmin.drawer.diagnostics.subtitle',
      'endpointAdmin.drawer.diagnostics.loading',
      'endpointAdmin.drawer.diagnostics.error',
      'endpointAdmin.drawer.diagnostics.forbidden',
      'endpointAdmin.drawer.diagnostics.empty',
      'endpointAdmin.drawer.diagnostics.unsupported',
      'endpointAdmin.drawer.diagnostics.incomplete',
      'endpointAdmin.drawer.diagnostics.staleArg',
      'endpointAdmin.drawer.diagnostics.meta.heading',
      'endpointAdmin.drawer.diagnostics.meta.agentVersion',
      'endpointAdmin.drawer.diagnostics.meta.configHash',
      'endpointAdmin.drawer.diagnostics.meta.collectedAt',
      'endpointAdmin.drawer.diagnostics.meta.probeDuration',
      'endpointAdmin.drawer.diagnostics.connectivity.heading',
      'endpointAdmin.drawer.diagnostics.connectivity.lastPollLatency',
      'endpointAdmin.drawer.diagnostics.connectivity.dns',
      'endpointAdmin.drawer.diagnostics.connectivity.tls',
      'endpointAdmin.drawer.diagnostics.badge.reachable',
      'endpointAdmin.drawer.diagnostics.badge.unreachable',
      'endpointAdmin.drawer.diagnostics.badge.valid',
      'endpointAdmin.drawer.diagnostics.badge.invalid',
      'endpointAdmin.drawer.diagnostics.badge.unknown',
      'endpointAdmin.drawer.diagnostics.lastError.heading',
      'endpointAdmin.drawer.diagnostics.lastError.occurredAt',
      'endpointAdmin.drawer.diagnostics.lastError.code',
      'endpointAdmin.drawer.diagnostics.lastError.summary',
      'endpointAdmin.drawer.diagnostics.probeErrors.heading',
      'endpointAdmin.drawer.diagnostics.probeErrors.empty',
      'endpointAdmin.drawer.diagnostics.probeErrors.col.rowOrdinal',
      'endpointAdmin.drawer.diagnostics.probeErrors.col.code',
      'endpointAdmin.drawer.diagnostics.probeErrors.col.summary',
    ];
    for (const key of keys) {
      const value = t(key);
      expect(value, `EN dict missing key: ${key}`).not.toBe(key);
      expect(value, `EN dict empty key: ${key}`).toBeTruthy();
    }
  });
});
