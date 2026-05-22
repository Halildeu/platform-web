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
 *      POST /api/v1/notify/push/subscribe; current browser endpointId
 *      localStorage'da persist (Codex 019e4a87 iter-2 P1 absorb)
 *   4. Unsubscribe action: SADECE current browser'ın endpoint'i DELETE +
 *      browser PushManager.unsubscribe (önceki "tüm endpoint'leri DELETE"
 *      cross-device bug fix)
 *
 * Identity readiness guard (Codex 019e4a87 iter-2 P2 absorb): orgId veya
 * subscriberId boş ise list query skip; auth bootstrap sırasında 401
 * yaratmaz.
 *
 * Browser-only — Faz 22.2 mobile FCM/APNS scope DIŞI.
 */

import { skipToken } from '@reduxjs/toolkit/query/react';
import { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../../../app/store/store.hooks';
import { selectAuthToken, selectIsTransportReady } from '../../auth/model/auth.slice';
import {
  useListMyPushEndpointsQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
} from '../api/notify-push.api';
import {
  detectBrowserPushSupport,
  PushPermissionDeniedError,
  registerAndSubscribe,
  unsubscribeBrowser,
} from '../api/notify-push.helpers';
import type { PushEndpointDto } from '../api/notify-push.types';

const LS_BROWSER_ENDPOINT_KEY = 'notify.push.browserEndpointId';

function getBrowserEndpointId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(LS_BROWSER_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function setBrowserEndpointId(endpointId: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (endpointId) {
      window.localStorage.setItem(LS_BROWSER_ENDPOINT_KEY, endpointId);
    } else {
      window.localStorage.removeItem(LS_BROWSER_ENDPOINT_KEY);
    }
  } catch {
    // localStorage quota / disabled — ignore
  }
}

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
  /** Current browser is subscribed (its endpointId in active backend list). */
  isSubscribed: boolean;
  /** All subscriber endpoints across browsers/devices (backend GET /me). */
  endpoints: PushEndpointDto[];
  /** UUID of current browser's endpoint (null if not subscribed in this browser). */
  currentBrowserEndpointId: string | null;
  status: PushSubscriptionStatus;
  subscribe: () => Promise<void>;
  /** Unsubscribe SADECE current browser endpoint (cross-device safe). */
  unsubscribe: () => Promise<void>;
  isListLoading: boolean;
}

export function usePushSubscription({
  orgId,
  subscriberId,
  vapidPublicKey,
}: UsePushSubscriptionArgs): UsePushSubscriptionResult {
  const support = useMemo(() => detectBrowserPushSupport(), []);
  const authToken = useAppSelector(selectAuthToken);
  const isTransportReady = useAppSelector(selectIsTransportReady);

  // Codex 019e4a87 iter-2 P2: identity hazır değilken query skip.
  // Codex 019e50ac: ayrıca auth transport hazır olmadan query fire etmemeli —
  // /settings/notifications cold direct-load'da identity (profile/authz claim)
  // token kullanılabilir olmadan çözülüp header-sız GET /push/subscribe/me →
  // 401 üretiyordu. transportReady + token birlikte gate edilir — yalnız token
  // yetmiyor (ara auth fazında set olabiliyor; 2026-05-22 re-smoke kanıtı).
  const queryArg =
    support.supported && !!orgId && !!subscriberId && !!authToken && isTransportReady
      ? undefined
      : skipToken;
  const { data, isLoading: isListLoading, refetch } = useListMyPushEndpointsQuery(queryArg);
  const endpoints = data?.endpoints ?? [];

  // Codex 019e4a87 iter-2 P1: current browser endpointId (localStorage)
  // tüm aktif endpoint listesi içinde bulunmalı; isSubscribed bu eşleşme.
  const currentBrowserEndpointId = getBrowserEndpointId();
  const isSubscribed = useMemo(
    () =>
      currentBrowserEndpointId !== null &&
      endpoints.some((ep) => ep.endpointId === currentBrowserEndpointId),
    [endpoints, currentBrowserEndpointId],
  );

  const [subscribeMutation] = useSubscribePushMutation();
  const [unsubscribeMutation] = useUnsubscribePushMutation();

  const [status, setStatus] = useState<PushSubscriptionStatus>(
    support.supported
      ? isSubscribed
        ? { kind: 'subscribed' }
        : { kind: 'idle' }
      : { kind: 'unsupported', reason: support.reason },
  );

  const subscribe = useCallback(async () => {
    if (!support.supported) {
      setStatus({ kind: 'unsupported', reason: support.reason });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const material = await registerAndSubscribe(vapidPublicKey);
      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 511) : undefined;
      const response = await subscribeMutation({
        orgId,
        subscriberId,
        endpointUrl: material.endpointUrl,
        p256dhKey: material.p256dhKey,
        authSecret: material.authSecret,
        userAgent,
      }).unwrap();
      // Persist current browser's endpointId for unsubscribe scoping
      setBrowserEndpointId(response.endpointId);
      setStatus({ kind: 'subscribed' });
      refetch();
    } catch (e) {
      if (e instanceof PushPermissionDeniedError) {
        setStatus({ kind: 'permission-denied' });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ kind: 'error', message: msg });
    }
  }, [
    support.supported,
    'reason' in support ? support.reason : '',
    vapidPublicKey,
    subscribeMutation,
    orgId,
    subscriberId,
    refetch,
  ]);

  const unsubscribe = useCallback(async () => {
    if (!support.supported) return;
    const id = currentBrowserEndpointId;
    if (!id) {
      // Browser-side cleanup yine yapılır (subscription dangling olabilir)
      await unsubscribeBrowser();
      setStatus({ kind: 'idle' });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      // SADECE current browser endpoint DELETE (cross-device safe)
      const result = await unsubscribeMutation({
        orgId,
        subscriberId,
        endpointId: id,
      }).unwrap();
      // Browser-side cleanup
      await unsubscribeBrowser();
      setBrowserEndpointId(null);
      setStatus({ kind: 'idle' });
      refetch();
      // result.status: "deleted" or "no_op" — UX feedback hook tüketicide
      void result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ kind: 'error', message: msg });
    }
  }, [
    support.supported,
    currentBrowserEndpointId,
    unsubscribeMutation,
    orgId,
    subscriberId,
    refetch,
  ]);

  return {
    isSupported: support.supported,
    isSubscribed,
    endpoints,
    currentBrowserEndpointId,
    status,
    subscribe,
    unsubscribe,
    isListLoading,
  };
}
