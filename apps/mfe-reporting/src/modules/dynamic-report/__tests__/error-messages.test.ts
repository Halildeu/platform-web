import { describe, it, expect } from 'vitest';
import { REPORT_QUERY_ERROR_MESSAGES, resolveErrorMessage } from '../error-messages';
import { ReportQueryError } from '../api';

describe('resolveErrorMessage', () => {
  it('maps GROUPING_NOT_SUPPORTED to the Turkish friendly message', () => {
    const err = new ReportQueryError(
      'GROUPING_NOT_SUPPORTED',
      '[GROUPING_NOT_SUPPORTED] Server-side pivot / pivotMode not yet enabled for this report.',
    );
    expect(resolveErrorMessage(err)).toBe(REPORT_QUERY_ERROR_MESSAGES.GROUPING_NOT_SUPPORTED);
  });

  it('maps INVALID_AGGREGATION_REQUEST to the Turkish friendly message', () => {
    const err = new ReportQueryError(
      'INVALID_AGGREGATION_REQUEST',
      'median aggregation is only valid on numeric columns',
    );
    expect(resolveErrorMessage(err)).toBe(REPORT_QUERY_ERROR_MESSAGES.INVALID_AGGREGATION_REQUEST);
  });

  it('maps tenant_selection_required to the picker-prompt copy', () => {
    const err = new ReportQueryError(
      'tenant_selection_required',
      'Yearly report requires explicit COMPANY scope',
    );
    expect(resolveErrorMessage(err)).toBe(REPORT_QUERY_ERROR_MESSAGES.tenant_selection_required);
  });

  it('maps vault_unavailable to the transient-outage copy', () => {
    const err = new ReportQueryError('vault_unavailable', 'Kimlik altyapısı devrede değil.');
    expect(resolveErrorMessage(err)).toBe(REPORT_QUERY_ERROR_MESSAGES.vault_unavailable);
  });

  it('falls back to the raw message when the error code is unknown', () => {
    const err = new ReportQueryError('UNKNOWN_BACKEND_CODE', 'raw backend text');
    expect(resolveErrorMessage(err)).toBe('raw backend text');
  });

  it('falls back to the supplied fallback for non-Error throwables', () => {
    expect(resolveErrorMessage('whoops', 'Export başlatılamadı.')).toBe('Export başlatılamadı.');
    expect(resolveErrorMessage(null)).toBe('Veriler yüklenemedi.');
    expect(resolveErrorMessage(undefined, 'Custom fallback')).toBe('Custom fallback');
  });

  it('uses Error.message when no structured code is present', () => {
    const err = new Error('plain JS error');
    expect(resolveErrorMessage(err)).toBe('plain JS error');
  });

  it('falls back when Error.message is empty / whitespace', () => {
    const err = new Error('   ');
    expect(resolveErrorMessage(err, 'Custom fallback')).toBe('Custom fallback');
  });

  it('accepts duck-typed errors carrying a string `code` field', () => {
    // Axios / fetch wrapper errors may not be `instanceof ReportQueryError`
    // but still carry a structural { code, message } envelope. The
    // resolver should still pick the Türkçe mapping when the code is
    // known.
    const ducked = {
      code: 'GROUPING_NOT_SUPPORTED',
      message: '[GROUPING_NOT_SUPPORTED] ...',
    };
    expect(resolveErrorMessage(ducked)).toBe(REPORT_QUERY_ERROR_MESSAGES.GROUPING_NOT_SUPPORTED);
  });

  it('does not pick the mapping when `code` is non-string', () => {
    const noisy = { code: 42, message: 'odd payload' };
    // Falls back to message because the code is non-string.
    expect(resolveErrorMessage(noisy as unknown)).toBe('Veriler yüklenemedi.');
  });

  it('exposes a frozen mapping so production code cannot mutate it', () => {
    expect(Object.isFrozen(REPORT_QUERY_ERROR_MESSAGES)).toBe(true);
  });
});
