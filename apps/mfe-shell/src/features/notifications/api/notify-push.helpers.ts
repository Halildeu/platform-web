/**
 * Web Push subscription helpers (Faz 23.7 M7 T4.2 PR-W5).
 *
 * Browser PushManager → backend POST/DELETE bridge utilities.
 *
 * Permission flow:
 *   1. Check `Notification.permission` — 'default'/'granted'/'denied'
 *   2. Request via `Notification.requestPermission()` if 'default'
 *   3. Register service worker `/notification-sw.js`
 *   4. PushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey })
 *   5. Extract endpoint URL + p256dh + auth + POST to backend
 */

/**
 * Convert base64url-encoded VAPID public key to Uint8Array
 * (PushManager.subscribe applicationServerKey field).
 */
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

/**
 * Convert ArrayBuffer to base64url (PushSubscription getKey output).
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type BrowserPushSupport =
  | { supported: true }
  | { supported: false; reason: string };

/**
 * Detect Web Push Protocol support in the current browser.
 * Faz 22.2 mobile FCM/APNS scope DIŞI — sadece browser-side capability check.
 */
export function detectBrowserPushSupport(): BrowserPushSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'no_window' };
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'no_service_worker' };
  }
  if (!('PushManager' in window)) {
    return { supported: false, reason: 'no_push_manager' };
  }
  if (!('Notification' in window)) {
    return { supported: false, reason: 'no_notification_api' };
  }
  return { supported: true };
}

export interface BrowserSubscription {
  endpointUrl: string;
  p256dhKey: string;
  authSecret: string;
}

/**
 * Register service worker + request notification permission +
 * subscribe via PushManager. Returns subscription material ready
 * to POST to backend.
 *
 * @param vapidPublicKey base64url-encoded VAPID public key (from backend ConfigMap)
 * @returns Subscription material or null if denied/error
 */
export async function registerAndSubscribe(
  vapidPublicKey: string
): Promise<BrowserSubscription | null> {
  const support = detectBrowserPushSupport();
  if (!support.supported) {
    throw new Error(`browser does not support Web Push: ${support.reason}`);
  }

  // 1. Permission
  if (Notification.permission === 'denied') {
    throw new Error('notification permission previously denied by user');
  }
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('notification permission not granted');
    }
  }

  // 2. Service worker registration
  const registration = await navigator.serviceWorker.register('/notification-sw.js', {
    scope: '/',
  });
  await navigator.serviceWorker.ready;

  // 3. PushManager subscribe
  // userVisibleOnly=true zorunlu (Chrome/Edge browser policy)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
  });

  return {
    endpointUrl: subscription.endpoint,
    p256dhKey: arrayBufferToBase64Url(subscription.getKey('p256dh')),
    authSecret: arrayBufferToBase64Url(subscription.getKey('auth')),
  };
}

/**
 * Unsubscribe browser-side via PushManager. Backend DELETE çağrısı caller'da
 * (notifyPushApi.useUnsubscribePushMutation); bu fonksiyon sadece browser
 * tarafındaki subscription'ı temizler.
 */
export async function unsubscribeBrowser(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;  // already unsubscribed
  return await subscription.unsubscribe();
}
