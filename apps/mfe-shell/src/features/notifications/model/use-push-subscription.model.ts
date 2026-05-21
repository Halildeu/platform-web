/**
 * Web Push subscription lifecycle hook (Faz 23.7 M7 T4.2 PR-W5).
 *
 * UI surface tarafından çağrılır:
 *   const { isSupported, isSubscribed, subscribe, unsubscribe, status } =
 *     usePushSubscription({ orgId, subscriberId, vapidPublicKey });
 *
 * Hook responsibilities:
 *   1. Browser PushManager + Notification API support detect
 *   2. Backend GET /me ile aktif endpoint listesi al (RTK Query)
 *   3. Subscribe action: permission + SW register + PushManager.subscribe +
 *      POST /api/v1/notify/push/subscribe
 *   4. Unsubscribe action: backend DELETE + browser PushManager.unsubscribe
 *
 * Browser-only — Faz 22.2 mobile FCM/APNS scope DIŞI. Mobile path için
 * ayrı hook + native binding gerekecek (gelecek faz).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  useListMyPushEndpointsQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
} from '../api/notify-push.api';
import {
  detectBrowserPushSupport,
  registerAndSubscribe,
  unsubscribeBrowser,
} from '../api/notify-push.helpers';
import type { PushEndpointDto } from '../api/notify-push.types';

export interface UsePushSubscriptionArgs {
  orgId: string;
  subscriberId: string;
  /**
   * Backend ConfigMap'ten injekte edilen VAPID public key (base64url).
   * mfe-shell env / Vite import.meta.env üzerinden gelebilir
   * (VITE_NOTIFY_VAPID_PUBLIC_KEY); production deploy sırasında doldurulur.
   */
  vapidPublicKey: string;
}

export type PushSubscriptionStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'subscribed' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string };

export interface UsePushSubscriptionResult {
  isSupported: boolean;
  isSubscribed: boolean;
  endpoints: PushEndpointDto[];
  status: PushSubscriptionStatus;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  isListLoading: boolean;
}

export function usePushSubscription({
  orgId: _orgId,
  subscriberId: _subscriberId,
  vapidPublicKey,
}: UsePushSubscriptionArgs): UsePushSubscriptionResult {
  const support = useMemo(() => detectBrowserPushSupport(), []);

  const { data, isLoading: isListLoading, refetch } = useListMyPushEndpointsQuery(undefined, {
    skip: !support.supported,
  });
  const endpoints = data?.endpoints ?? [];

  const [subscribeMutation] = useSubscribePushMutation();
  const [unsubscribeMutation] = useUnsubscribePushMutation();

  const [status, setStatus] = useState<PushSubscriptionStatus>(
    support.supported ? { kind: 'idle' } : { kind: 'unsupported', reason: support.reason }
  );

  const subscribe = useCallback(async () => {
    if (!support.supported) {
      setStatus({ kind: 'unsupported', reason: support.reason });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const material = await registerAndSubscribe(vapidPublicKey);
      if (!material) {
        setStatus({ kind: 'permission-denied' });
        return;
      }
      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 511) : undefined;
      await subscribeMutation({
        orgId: _orgId,
        subscriberId: _subscriberId,
        endpointUrl: material.endpointUrl,
        p256dhKey: material.p256dhKey,
        authSecret: material.authSecret,
        userAgent,
      }).unwrap();
      setStatus({ kind: 'subscribed' });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // permission denied → kullanıcı dostu state
      if (msg.includes('permission')) {
        setStatus({ kind: 'permission-denied' });
      } else {
        setStatus({ kind: 'error', message: msg });
      }
    }
  }, [
    support.supported,
    'reason' in support ? support.reason : '',
    vapidPublicKey,
    subscribeMutation,
    _orgId,
    _subscriberId,
    refetch,
  ]);

  const unsubscribe = useCallback(async () => {
    if (!support.supported || endpoints.length === 0) return;
    setStatus({ kind: 'loading' });
    try {
      // Backend tüm endpoint'leri sil (mevcut subscriber için)
      await Promise.all(
        endpoints.map((ep) =>
          unsubscribeMutation({
            orgId: _orgId,
            subscriberId: _subscriberId,
            endpointId: ep.endpointId,
          }).unwrap()
        )
      );
      // Browser-side cleanup
      await unsubscribeBrowser();
      setStatus({ kind: 'idle' });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ kind: 'error', message: msg });
    }
  }, [support.supported, endpoints, unsubscribeMutation, _orgId, _subscriberId, refetch]);

  return {
    isSupported: support.supported,
    isSubscribed: endpoints.length > 0,
    endpoints,
    status,
    subscribe,
    unsubscribe,
    isListLoading,
  };
}
