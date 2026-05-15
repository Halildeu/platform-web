/**
 * Codex 019e27bf fresh-context audit follow-up — single source of truth
 * for impersonation-related backend error code → localized Turkish UI
 * message mapping. Previously duplicated across:
 *   - widgets/user-management/ui/ImpersonateAction.tsx (drawer affordance)
 *   - widgets/user-management/ui/UserActions.ui.tsx     (row-level quick action)
 *
 * Keeping the map in one place eliminates the drift risk Codex flagged
 * (two files going out of sync as new backend error codes land).
 *
 * BUG #3 path retained: when the orchestration wraps a Spring
 * MethodArgumentNotValidException into an Error with
 * `errorCode === 'VALIDATION_ERROR'`, the localized backend message is
 * surfaced verbatim — Spring's Turkish ValidationMessages bundle has
 * already localized it, so the FE should not re-translate.
 */

export const IMPERSONATION_ERROR_MESSAGES: Record<string, string> = {
  SELF_IMPERSONATION_FORBIDDEN: 'Kendi hesabını impersonate edemezsin.',
  TARGET_USER_DISABLED: 'Pasif kullanıcı için impersonation başlatılamaz.',
  TARGET_SUBJECT_UNRESOLVABLE:
    'Hedef kullanıcının Keycloak eşlemesi eksik (kc_subject backfill bekleniyor). Operatöre bildirin.',
  ADMIN_IDENTITY_MISSING:
    'Admin kimliği eksik. Çıkış yapıp tekrar giriş yapın veya KC userId attribute kontrolü gerekiyor.',
  INSUFFICIENT_AUTHORITY: 'Bu işlem için süper admin yetkisi gerekiyor.',
  NESTED_IMPERSONATION_FORBIDDEN:
    'Zaten aktif bir impersonation oturumu var. Önce mevcut oturumu durdurun.',
  ACTIVE_SESSION_EXISTS:
    'Zaten aktif bir impersonation oturumu var. Önce mevcut oturumu durdurun.',
  ACTIVE_IMPERSONATION_EXISTS:
    'Zaten aktif bir impersonation oturumu var. Önce mevcut oturumu durdurun.',
  TARGET_SUBJECT_MISMATCH:
    'KC token-exchange hedef kullanıcı kontrolü tutmadı (audit poisoning koruması).',
  EXCHANGED_TOKEN_NOT_BROKER_ISSUED: 'KC token-exchange yanıtı broker-imzalı değil.',
  EXCHANGED_TOKEN_EXPIRED: 'KC tarafından dönen token süresi dolmuş.',
  TOKEN_EXCHANGE_FAILED: 'Keycloak token-exchange başarısız.',
  SESSION_PERSIST_FAILED:
    'Impersonation oturumu kaydedilemedi (permission-service hatası).',
};

/**
 * Resolve a localized message for an impersonation error.
 *
 * Resolution precedence:
 *   1. `Error.errorCode === 'VALIDATION_ERROR'` → return localized
 *      backend message verbatim (Spring already localized it).
 *   2. First `[A-Z_]+` token at the start of `error.message` matches a
 *      known code → return the mapped Turkish string.
 *   3. Fallback: original `error.message` if available.
 *   4. Generic fallback string.
 */
export function friendlyImpersonationErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const withCode = err as Error & { errorCode?: string };
    if (withCode.errorCode === 'VALIDATION_ERROR' && err.message) {
      return err.message;
    }
    const codeFromMessage = err.message?.match(/^[A-Z_]+/)?.[0];
    if (codeFromMessage && IMPERSONATION_ERROR_MESSAGES[codeFromMessage]) {
      return IMPERSONATION_ERROR_MESSAGES[codeFromMessage];
    }
    return err.message || 'Impersonation başlatılamadı.';
  }
  return 'Impersonation başlatılamadı.';
}
