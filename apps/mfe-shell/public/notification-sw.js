/**
 * Web Push Protocol service worker (Faz 23.7 M7 T4.2 PR-W5).
 *
 * Browser background push notification handler. Service worker
 * lifecycle:
 *   1. Browser registers SW via navigator.serviceWorker.register('/notification-sw.js')
 *   2. SW listens for 'push' events from push service (FCM/Mozilla/Edge)
 *   3. 'push' handler decrypts payload via subscription.getKey() pipeline
 *      (browser-level; subscription endpoint URL + p256dh + auth managed
 *      by PushManager)
 *   4. self.registration.showNotification(...) creates OS-level toast
 *   5. 'notificationclick' handler navigates back to /notifications inbox
 *
 * KVKK boundary: SW raw payload'u sadece notification body için kullanır;
 * persistent storage YOK. Inbox sync için IndexedDB cache mfe-shell tarafı
 * (notify-inbox.api.ts), service worker scope dışı.
 */

self.addEventListener('install', (event) => {
  // Activate immediately — versioned cache key olarak ileride app version
  // injection eklenir (build-time replace). Şimdilik skip waiting + claim.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Take control of all open tabs immediately (no reload required for
  // first-time registration to start receiving push events).
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    // RFC 8030 zero-byte push — silent wakeup; browser-level only
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    // Fallback: text payload
    payload = { title: 'Bildirim', body: event.data.text() };
  }

  const title = payload.title || 'Yeni bildirim';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    tag: payload.tag || 'notify-default',
    data: {
      url: payload.url || '/notifications',
      intentId: payload.intentId || null,
    },
    // KVKK: silent: false default; user dikkat çekme amaçlı
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Mevcut tab varsa o tab'a focus + navigate
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Yoksa yeni tab aç
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// pushsubscriptionchange: subscription endpoint browser tarafından yeniden
// üretildiğinde (örn. quota refresh, expiration), backend'e re-subscribe
// gerek. Bu event browser-side rare; mfe-shell session başında
// usePushSubscriptionLifecycle hook ile re-check yapılır.
self.addEventListener('pushsubscriptionchange', (event) => {
  // Logging only — actual re-subscribe handled by main thread
  // (mfe-shell usePushSubscription hook will detect the changed endpoint
  // on next visibility check and call POST /api/v1/notify/push/subscribe
  // with the new subscription material).
  // Service worker'da fetch yapılabilirdi, ama auth header (X-Org-Id +
  // X-Subscriber-Id) SW context'inde yok; main thread'in işi.
  // event.waitUntil(self.registration.pushManager.subscribe(...))
  // pattern future iteration.
});
