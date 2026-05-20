import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Spinner } from '@mfe/design-system';
import { useRedeemUnsubscribeTokenQuery } from '../../../features/notifications/api/notify-unsubscribe.api';

/**
 * Public landing page for RFC 8058 one-click unsubscribe
 * (Faz 23.5 M5 G3).
 *
 * <p>Reached from email footers via a link like:
 * <pre>https://&lt;host&gt;/notifications/unsubscribe?token=&lt;HMAC-SHA256-token&gt;</pre>
 *
 * <p>The page performs one operation on mount: a GET to
 * {@code /api/v1/notify/unsubscribe?token=...}. The backend
 * ({@code UnsubscribeRevokeService}) verifies the HMAC signature +
 * token expiration and, on success, revokes the preference row + emits
 * an audit event.
 *
 * <p>RFC 8058 one-click semantics: NO confirmation form. The single
 * call IS the unsubscribe action. The page renders one of three
 * terminal states:
 * <ul>
 *   <li><b>Success</b> ({@code status: "unsubscribed"}) — confirmation
 *       message + link to {@code /settings/notifications} (auth-gated)
 *       for further preference management.</li>
 *   <li><b>Token invalid / expired</b> (HTTP 401 / 410) — explanation +
 *       link to login / preference settings (auth-gated fallback).</li>
 *   <li><b>Server error</b> (HTTP 5xx) — retry button + support hint.</li>
 * </ul>
 *
 * <p>This route is intentionally <b>not</b> wrapped in
 * {@code ProtectedRoute} — token verification is the authentication
 * mechanism. The page works for an anonymous user who clicked a link
 * in an email read on a logged-out device.
 */
const UnsubscribeLandingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  // If no token in URL, skip the query and render the "missing token"
  // error state directly. RTK Query's skip option avoids a wasteful
  // request to /unsubscribe with an empty token query param.
  const skip = token.length === 0;
  const { data, error, isLoading, isFetching, refetch } = useRedeemUnsubscribeTokenQuery(token, {
    skip,
  });

  const showSpinner = !skip && (isLoading || isFetching);
  const showSuccess = !skip && !showSpinner && data?.status === 'unsubscribed';
  const showMissingToken = skip;

  // Error state classification — RTK Query surfaces server HTTP
  // status as `error.status` (FetchBaseQueryError shape).
  const errorObj = !skip && !showSpinner && !showSuccess ? error : undefined;
  const httpStatus =
    errorObj && typeof errorObj === 'object' && 'status' in errorObj
      ? (errorObj as { status: number | string }).status
      : undefined;
  const isTokenInvalid = httpStatus === 401 || httpStatus === 410 || httpStatus === 404;
  const isServerError = typeof httpStatus === 'number' && httpStatus >= 500;

  return (
    <div className="mt-16 flex justify-center px-4" data-testid="unsubscribe-landing-page">
      <div className="w-full max-w-xl rounded-2xl border border-border-subtle bg-surface-default p-6 shadow-xs">
        <h1 className="mb-3 text-xl font-semibold text-text-primary">Bildirim Aboneliği</h1>

        {showSpinner && (
          <div className="flex items-center gap-3 py-6" data-testid="unsubscribe-spinner">
            <Spinner />
            <p className="text-sm text-text-secondary">
              Aboneliğiniz iptal ediliyor, lütfen bekleyin...
            </p>
          </div>
        )}

        {showMissingToken && (
          <Alert variant="warning" title="Bağlantı eksik" data-testid="unsubscribe-missing-token">
            Bu sayfaya erişmek için e-posta footer'ındaki bağlantıyı kullanmalısınız. Bağlantınızı
            kaybettiyseniz, hesabınıza giriş yaparak{' '}
            <Link to="/settings/notifications" className="underline">
              bildirim ayarları
            </Link>{' '}
            sayfasından tercihlerinizi yönetebilirsiniz.
          </Alert>
        )}

        {showSuccess && (
          <Alert
            variant="success"
            title="Aboneliğiniz iptal edildi"
            data-testid="unsubscribe-success"
          >
            <p className="mb-3 text-sm">
              Bu bildirim türü için artık size e-posta gönderilmeyecek. İşleminizin kaydı güvenlik
              amaçlı tutuldu.
            </p>
            <p className="text-sm">
              Tüm bildirim tercihlerinizi yönetmek için{' '}
              <Link
                to="/settings/notifications"
                className="underline"
                data-testid="unsubscribe-settings-link"
              >
                bildirim ayarları
              </Link>{' '}
              sayfasını ziyaret edebilirsiniz (oturum açmanız gerekir).
            </p>
          </Alert>
        )}

        {isTokenInvalid && (
          <Alert
            variant="danger"
            title="Bağlantı geçersiz veya süresi dolmuş"
            data-testid="unsubscribe-invalid"
          >
            <p className="mb-3 text-sm">
              Bu abonelik iptal bağlantısı geçersiz veya süresi dolmuş. Bu durum şu sebeplerden
              kaynaklanabilir:
            </p>
            <ul className="mb-3 ml-5 list-disc text-sm">
              <li>Bağlantı daha önce kullanıldı (her bağlantı tek seferlik).</li>
              <li>Bağlantının süresi sona erdi.</li>
              <li>
                Bağlantı bütünlüğü bozulmuş (e-posta istemcisi tarafından değiştirilmiş olabilir).
              </li>
            </ul>
            <p className="text-sm">
              Hesabınıza giriş yaparak{' '}
              <Link to="/settings/notifications" className="underline">
                bildirim ayarları
              </Link>{' '}
              sayfasından doğrudan abonelik tercihlerinizi yönetebilirsiniz.
            </p>
          </Alert>
        )}

        {isServerError && (
          <Alert variant="danger" title="Sistem hatası" data-testid="unsubscribe-server-error">
            <p className="mb-3 text-sm">
              Aboneliğiniz şu anda iptal edilemiyor. Lütfen birkaç dakika sonra tekrar deneyin.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => refetch()} data-testid="unsubscribe-retry">
                Tekrar dene
              </Button>
              <Link to="/settings/notifications">
                <Button variant="tertiary">Bildirim ayarlarına git</Button>
              </Link>
            </div>
          </Alert>
        )}
      </div>
    </div>
  );
};

export default UnsubscribeLandingPage;
