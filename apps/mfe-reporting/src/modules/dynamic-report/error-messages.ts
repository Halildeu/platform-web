/**
 * User-facing Turkish messages for the backend's
 * {@link ReportQueryError} codes. Raw `[CODE] message` envelopes
 * surface as toast strings without a mapping; this module makes the
 * UX text human-friendly while preserving the structured error code
 * for debug paths.
 *
 * <p>The mapping covers every code documented in {@code api.ts}'s
 * {@link ReportQueryError} JSDoc plus the cross-service envelopes
 * the report flow currently relays:
 * <ul>
 *   <li>{@code GROUPING_NOT_SUPPORTED} — non-groupable column ended
 *       up in {@code rowGroupCols}, or pivot requested while the
 *       backend's PR-0.4 path is still off.</li>
 *   <li>{@code INVALID_AGGREGATION_REQUEST} — non-aggregatable
 *       field, unknown {@code aggFunc}, median/percentilecont on a
 *       non-numeric column, percentile param missing or out of
 *       range, duplicate {@code valueCols.field}, or
 *       {@code aggParams} set on a non-parametric aggregation.</li>
 *   <li>{@code INVALID_GROUP_KEY} — type-coercion failure (e.g.
 *       "abc" on a number column).</li>
 *   <li>{@code ANCESTOR_FILTER_COLLISION} — PR-0.3 contract.
 *       Superseded by PR #5b compound merge for same-field
 *       ancestor + user filter; kept here as a defensive fallback
 *       for any legacy backend in the rollout window.</li>
 *   <li>{@code INVALID_ROW_WINDOW} / {@code NON_ALIGNED_ROW_WINDOW} —
 *       malformed pagination window.</li>
 *   <li>{@code tenant_selection_required} — yearly schema report
 *       without an explicit COMPANY scope (X-Company-Id picker).</li>
 *   <li>{@code vault_unavailable} — transient outage envelope from
 *       the credential lookup path.</li>
 *   <li>{@code schema_resolver_miss} — resolved-schemas list is
 *       empty (yearly report against a year/tenant with no
 *       partition present).</li>
 * </ul>
 *
 * <p>{@link resolveErrorMessage} is the single entry point so every
 * {@code showToast} call site stays consistent. Unknown error codes
 * fall back to the supplied {@code Error.message} (or a generic
 * Turkish copy) so a future backend code addition never breaks the
 * UI silently.
 */

export const REPORT_QUERY_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  GROUPING_NOT_SUPPORTED:
    'Bu kolonla gruplama desteklenmiyor. Lütfen gruplanabilir bir kolon seçin.',
  INVALID_AGGREGATION_REQUEST:
    'Toplama hesaplama isteği geçersiz. Sadece desteklenen kolon ve fonksiyonları kullanın.',
  INVALID_GROUP_KEY: 'Grup anahtarı geçersiz. Sayısal kolonlarda metinsel değer kullanmayın.',
  ANCESTOR_FILTER_COLLISION:
    'Filtre çakışması: bu kolonda hem genişletme yolu hem ayrı bir filtre tanımlı.',
  INVALID_ROW_WINDOW: 'Geçersiz satır penceresi. Sayfalama parametreleri hatalı.',
  NON_ALIGNED_ROW_WINDOW: 'Sayfalama penceresi hizalı değil. Sayfa boyutunu kontrol edin.',
  tenant_selection_required: 'Şirket seçimi gerekli. Lütfen sağ üstten bir şirket seçin.',
  vault_unavailable:
    'Kimlik altyapısı geçici olarak devre dışı. Birkaç saniye sonra tekrar deneyin.',
  schema_resolver_miss:
    'Veri kaynağı çözümlenemedi. Seçili yıl veya şirket için kayıt bulunmuyor olabilir.',
});

/**
 * Resolve a user-facing Turkish toast message for any error thrown
 * by the dynamic-report fetch path.
 *
 * <p>Resolution order:
 * <ol>
 *   <li>{@link ReportQueryError} → {@link REPORT_QUERY_ERROR_MESSAGES}
 *       lookup by {@code error.code}.</li>
 *   <li>{@code error.code} is present but not in the map →
 *       {@code error.message} (raw backend envelope text).</li>
 *   <li>Any other {@link Error} → {@code error.message}.</li>
 *   <li>Non-Error throwable → the supplied {@code fallback} or a
 *       generic Turkish copy.</li>
 * </ol>
 *
 * <p>Callers can override the final fallback per-callsite (e.g.
 * "Rapor metaverisi yüklenemedi" vs "Veriler yüklenemedi") so the
 * toast text stays specific to the failing flow.
 */
export function resolveErrorMessage(
  error: unknown,
  fallback: string = 'Veriler yüklenemedi.',
): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const codeRaw = (error as { code: unknown }).code;
    if (typeof codeRaw === 'string') {
      const mapped = REPORT_QUERY_ERROR_MESSAGES[codeRaw];
      if (mapped !== undefined) {
        return mapped;
      }
    }
  }
  if (error instanceof Error && error.message && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
