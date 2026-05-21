import { Bell, BellOff, AlertCircle, Loader } from 'lucide-react';
// (Loader, AlertCircle kept for status/error feedback render paths)
import React from 'react';
import { useAppSelector } from '../../app/store/store.hooks';
import { selectNotifyIdentity } from '../../features/notifications/model/identity.selectors';
import { usePushSubscription } from '../../features/notifications/model/use-push-subscription.model';

/**
 * PushSubscriptionCard — Web Push Protocol subscribe/unsubscribe UI
 * (Faz 23.7 M7 T4.2 PR-W5 follow-up).
 *
 * <p>UserPreferences page'inde push subscription state'i ve toggle button'u
 * sergiler. {@link usePushSubscription} hook'u (PR #648 MERGED) ile:
 * <ul>
 *   <li>Browser support detect (PushManager + Notification API +
 *       isSecureContext)</li>
 *   <li>Current browser subscription state (localStorage scoped via
 *       `notify.push.browserEndpointId`)</li>
 *   <li>Subscribe action: permission grant + SW register + PushManager.subscribe +
 *       POST /api/v1/notify/push/subscribe</li>
 *   <li>Unsubscribe action: SADECE current browser endpoint DELETE +
 *       browser PushManager.unsubscribe (cross-device safe)</li>
 * </ul>
 *
 * <p>VAPID public key Vite env'den okunur ({@code VITE_NOTIFY_VAPID_PUBLIC_KEY});
 * env yoksa card "configuration missing" warning state'inde gösterir.
 *
 * <p>Browser-only scope — mobile FCM/APNS Faz 22.2 dep DIŞI; bu kart
 * sadece desktop/mobile browser kanalı için.
 */
const PushSubscriptionCard: React.FC = () => {
  const identity = useAppSelector(selectNotifyIdentity);
  const vapidPublicKey: string | undefined = import.meta.env.VITE_NOTIFY_VAPID_PUBLIC_KEY;

  // VAPID env missing → configuration error (operator action gerek)
  if (!vapidPublicKey) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-none text-amber-600 dark:text-amber-400" />
          <div>
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
              Tarayıcı bildirimleri yapılandırılmamış
            </h3>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              Web Push servisi etkinleştirilmemiş. Operator Vault VAPID anahtar
              yapılandırması ve <code>VITE_NOTIFY_VAPID_PUBLIC_KEY</code> ortam
              değişkeni gerek.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Identity not ready → render nothing (parent NotificationPreferencesPage
  // already early-returns "Önce oturum açın" before this card renders;
  // standalone defensive fallback for non-parent embeddings).
  if (!identity) {
    return null;
  }

  return (
    <PushSubscriptionCardInner
      orgId={identity.orgId}
      subscriberId={identity.subscriberId}
      vapidPublicKey={vapidPublicKey}
    />
  );
};

interface InnerProps {
  orgId: string;
  subscriberId: string;
  vapidPublicKey: string;
}

const PushSubscriptionCardInner: React.FC<InnerProps> = ({ orgId, subscriberId, vapidPublicKey }) => {
  const { isSupported, isSubscribed, endpoints, status, subscribe, unsubscribe, isListLoading } =
    usePushSubscription({ orgId, subscriberId, vapidPublicKey });

  // Browser doesn't support Web Push (no SW / no PushManager / insecure context)
  if (!isSupported) {
    const reason = status.kind === 'unsupported' ? status.reason : 'unknown';
    return (
      <div className="rounded-md border border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start gap-3">
          <BellOff className="h-5 w-5 flex-none text-gray-500" />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Tarayıcı bildirimleri desteklenmiyor
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Bu tarayıcı Web Push Protocol'unu desteklemiyor ({reason}). Lütfen
              güncel bir Chrome, Firefox veya Edge tarayıcı kullanın ve siteye HTTPS
              üzerinden erişin.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isSubscribed ? (
            <Bell className="h-5 w-5 flex-none text-blue-600 dark:text-blue-400" />
          ) : (
            <BellOff className="h-5 w-5 flex-none text-gray-500" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Tarayıcı bildirimleri
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {isSubscribed
                ? 'Bu tarayıcıda bildirimler etkin. Acil bildirimleri pop-up olarak görürsünüz.'
                : 'Bu tarayıcıda bildirim almak için aboneliği açın. Sadece bu cihazınız etkilenir; diğer cihazlarınızdaki abonelikler değişmez.'}
            </p>
            {isListLoading && (
              <p className="mt-1 text-xs text-gray-500">
                <Loader className="mr-1 inline h-3 w-3 animate-spin" />
                Cihaz listesi yükleniyor…
              </p>
            )}
            {!isListLoading && endpoints.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Hesabınıza bağlı toplam {endpoints.length} aktif cihaz
                {isSubscribed ? ' (bu tarayıcı dahil)' : ' (bu tarayıcı dahil değil)'}.
              </p>
            )}
            {status.kind === 'permission-denied' && (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                <AlertCircle className="mr-1 inline h-3 w-3" />
                Bildirim izni reddedildi. Tarayıcı ayarlarından bu site için bildirim
                iznini el ile açmanız gerek.
              </p>
            )}
            {status.kind === 'error' && (
              <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                <AlertCircle className="mr-1 inline h-3 w-3" />
                Hata: {status.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex-none">
          {isSubscribed ? (
            <button
              type="button"
              onClick={() => void unsubscribe()}
              disabled={status.kind === 'loading'}
              className="inline-flex items-center gap-2 rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              data-testid="push-subscription-unsubscribe-button"
            >
              {status.kind === 'loading' ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
              Aboneliği kapat
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void subscribe()}
              disabled={status.kind === 'loading'}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="push-subscription-subscribe-button"
            >
              {status.kind === 'loading' ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              Aboneliği aç
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PushSubscriptionCard;
