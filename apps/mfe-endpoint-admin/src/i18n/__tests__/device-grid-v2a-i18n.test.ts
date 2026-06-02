import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * WEB-015 v2-a (Codex 019e87aa AGREE) — i18n contract drift detector for
 * the 5 new DeviceGrid columns (DeviceGridColumns SCHEMA_VERSION = 3).
 *
 * Mirrors the BE-024 / BE-025 / BE-024b drift detector pattern: the
 * page-level test mocks the i18n module to return the key verbatim, so the
 * canonical TR + EN dictionaries need their own drift detector or a silent
 * `DICT_TR`/`DICT_EN` miss would not show up in any component test.
 *
 * Codex guardrail #3: NO_EVALUATION is an explicit domain value, NOT a
 * collapsed "—". This test pins the explicit Turkish copy
 * (`Değerlendirilmedi`) and the parallel English copy (`Not Evaluated`).
 */

const REQUIRED_KEYS = [
  // Column headers (DeviceGridColumns canonical Turkish labels — pinned).
  'endpointAdmin.devices.col.prohibitedStatus',
  'endpointAdmin.devices.col.prohibitedDecision',
  'endpointAdmin.devices.col.prohibitedFindingsCount',
  'endpointAdmin.devices.col.wdacMode',
  'endpointAdmin.devices.col.appIdSvcState',
  // Cell + Set-Filter value labels (raw enum → i18n; raw stays backend-canonical).
  'endpointAdmin.devices.prohibitedStatus.NO_EVALUATION',
  'endpointAdmin.devices.prohibitedStatus.OK',
  'endpointAdmin.devices.prohibitedDecision.COMPLIANT',
  'endpointAdmin.devices.prohibitedDecision.NON_COMPLIANT',
  'endpointAdmin.devices.prohibitedDecision.UNAUTHORIZED',
  'endpointAdmin.devices.prohibitedDecision.UNKNOWN',
  'endpointAdmin.devices.wdacMode.OFF',
  'endpointAdmin.devices.wdacMode.AUDIT',
  'endpointAdmin.devices.wdacMode.ENFORCE',
  'endpointAdmin.devices.wdacMode.UNKNOWN',
  'endpointAdmin.devices.appIdSvcState.RUNNING',
  'endpointAdmin.devices.appIdSvcState.STOPPED',
  'endpointAdmin.devices.appIdSvcState.DISABLED',
  'endpointAdmin.devices.appIdSvcState.UNKNOWN',
] as const;

describe('WEB-015 v2-a DeviceGrid i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  it.each(REQUIRED_KEYS)('TR key resolves (not raw fall-through): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('canonical column headers match backend Turkish labels (raw CSV header parity)', () => {
    // These exact strings ALSO live in the backend DeviceGridColumns registry
    // as the Turkish label of each GridColumn — a CSV export sourced from
    // either endpoint should render the same header text.
    expect(t('endpointAdmin.devices.col.prohibitedStatus')).toBe('Yasaklı Yazılım Durumu');
    expect(t('endpointAdmin.devices.col.prohibitedDecision')).toBe('Uygunluk Kararı');
    expect(t('endpointAdmin.devices.col.prohibitedFindingsCount')).toBe(
      'Yasaklı Yazılım Bulgu Sayısı',
    );
    expect(t('endpointAdmin.devices.col.wdacMode')).toBe('WDAC Modu');
    expect(t('endpointAdmin.devices.col.appIdSvcState')).toBe('AppIDSvc Durumu');
  });

  it('NO_EVALUATION renders as explicit "Değerlendirilmedi" — NOT a tire (Codex guardrail #3)', () => {
    const explicit = t('endpointAdmin.devices.prohibitedStatus.NO_EVALUATION');
    expect(explicit).toBe('Değerlendirilmedi');
    expect(explicit).not.toBe('—');
    // OK must NOT collapse into the same string as NO_EVALUATION (2-status distinct).
    const ok = t('endpointAdmin.devices.prohibitedStatus.OK');
    expect(ok).not.toBe(explicit);
  });

  it('OK is "Değerlendirildi" — NOT "Uygun" (Codex 019e87aa iter-2 P1 semantic fix)', () => {
    // `prohibited_status = OK` means an evaluation row EXISTS — NOT
    // compliance success. Real compliance verdict lives in
    // `prohibited_decision` (which can be UNAUTHORIZED). The label must
    // be a neutral presence signal, not a success verdict.
    const ok = t('endpointAdmin.devices.prohibitedStatus.OK');
    expect(ok).toBe('Değerlendirildi');
    expect(ok).not.toBe('Uygun');
    // Decision-level COMPLIANT is the right place for the success copy.
    expect(t('endpointAdmin.devices.prohibitedDecision.COMPLIANT')).toBe('Uyumlu');
  });

  it('4-decision enum copy is distinct (NEVER collapsed) — WEB-015 v2-a LIVE finding', () => {
    // Backend `ComplianceDecision` enum: COMPLIANT, NON_COMPLIANT,
    // UNAUTHORIZED, UNKNOWN (ladder: UNAUTHORIZED > UNKNOWN > NON_COMPLIANT
    // > COMPLIANT). The WEB-015 v2-a LIVE smoke surfaced a row with
    // `decision=UNKNOWN`; the original v0 tuple's INSUFFICIENT_DATA was a
    // draft-time guess the backend never emits and is removed here.
    const labels = new Set(
      ['COMPLIANT', 'NON_COMPLIANT', 'UNAUTHORIZED', 'UNKNOWN'].map((v) =>
        t(`endpointAdmin.devices.prohibitedDecision.${v}`),
      ),
    );
    expect(labels.size).toBe(4);
  });

  it('4-mode WDAC enum copy is distinct (Codex guardrail #4 — Set Filter label parity)', () => {
    const labels = new Set(
      ['OFF', 'AUDIT', 'ENFORCE', 'UNKNOWN'].map((v) => t(`endpointAdmin.devices.wdacMode.${v}`)),
    );
    expect(labels.size).toBe(4);
  });

  it('4-state AppIDSvc enum copy is distinct', () => {
    const labels = new Set(
      ['RUNNING', 'STOPPED', 'DISABLED', 'UNKNOWN'].map((v) =>
        t(`endpointAdmin.devices.appIdSvcState.${v}`),
      ),
    );
    expect(labels.size).toBe(4);
  });
});

describe('WEB-015 v2-a DeviceGrid i18n — EN locale', () => {
  const t = createEndpointAdminT('en');

  it.each(REQUIRED_KEYS)('EN key resolves (DICT_EN parity): %s', (key) => {
    const value = t(key);
    expect(value).not.toBe(key);
    expect(value.length).toBeGreaterThan(0);
  });

  it('NO_EVALUATION renders as explicit "Not Evaluated" — NOT a tire (Codex guardrail #3)', () => {
    expect(t('endpointAdmin.devices.prohibitedStatus.NO_EVALUATION')).toBe('Not Evaluated');
  });

  it('OK is "Evaluated" — NOT "Compliant" (Codex 019e87aa iter-2 P1)', () => {
    expect(t('endpointAdmin.devices.prohibitedStatus.OK')).toBe('Evaluated');
    expect(t('endpointAdmin.devices.prohibitedStatus.OK')).not.toBe('Compliant');
  });

  it('4-decision enum copy is distinct (DICT_EN parity) — WEB-015 v2-a LIVE finding', () => {
    const labels = new Set(
      ['COMPLIANT', 'NON_COMPLIANT', 'UNAUTHORIZED', 'UNKNOWN'].map((v) =>
        t(`endpointAdmin.devices.prohibitedDecision.${v}`),
      ),
    );
    expect(labels.size).toBe(4);
  });

  it('4-mode WDAC enum copy is distinct (DICT_EN parity)', () => {
    const labels = new Set(
      ['OFF', 'AUDIT', 'ENFORCE', 'UNKNOWN'].map((v) => t(`endpointAdmin.devices.wdacMode.${v}`)),
    );
    expect(labels.size).toBe(4);
  });
});
