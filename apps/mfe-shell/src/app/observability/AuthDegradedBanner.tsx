import React, { useEffect, useRef, useState } from 'react';
import { getMetricsSnapshot, subscribeMetrics, type MetricsSnapshot } from '@mfe/shared-http';
import { useAppSelector } from '../store/store.hooks';
import { selectAuthPhase } from '../../features/auth/model/auth.slice';
import { selectAuthDegradedState, type DegradedReason } from './auth-degraded-state';

const SLOW_INIT_TICK_INTERVAL_MS = 5_000;

const messages: Record<DegradedReason, { title: string; help: string }> = {
  'slow-init': {
    title: 'Oturum başlatma yavaş ilerliyor.',
    help: 'Sayfayı yenileyebilir veya yeniden giriş yapabilirsiniz.',
  },
  'recent-refresh-failures': {
    title: 'Yetkilendirme yenilemesi başarısız oluyor.',
    help: 'Yeniden giriş yapmanız gerekebilir.',
  },
};

const buildLoginRedirect = (): string => {
  if (typeof window === 'undefined') return '/login';
  const { pathname, search, hash } = window.location;
  const current = `${pathname ?? ''}${search ?? ''}${hash ?? ''}` || '/';
  if (pathname?.startsWith('/login')) {
    return '/login';
  }
  return `/login?redirect=${encodeURIComponent(current)}`;
};

const reload = (): void => {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
};

interface AuthDegradedBannerProps {
  /**
   * Test-only override: pin the bootstrap start timestamp so the
   * "slow init" branch is deterministic in tests. In production the
   * component captures {@code Date.now()} on first mount.
   */
  testOnlyBootstrapStartAt?: number;
}

/**
 * Phase 2 PR-Obs-5: lightweight banner that surfaces degraded auth
 * transport state. Reads:
 *   - {@code phase} from Redux (live)
 *   - bootstrapStartAt from a one-time mount-time stamp (live timer
 *     ticks every 5s so the slow-init branch flips without manual
 *     re-render)
 *   - metrics snapshot from the shared-http observability module
 *     (subscribed; updates throttled at the source to ≤ 1Hz)
 *
 * <p>{@code phase === 'failed'} explicitly does NOT render — root
 * failed UI in {@code AppRouter} owns that surface (Codex iter-0
 * P1 #2). The banner is for in-flight degraded states the route UI
 * doesn't have a hook for.
 */
export const AuthDegradedBanner: React.FC<AuthDegradedBannerProps> = ({
  testOnlyBootstrapStartAt,
}) => {
  const phase = useAppSelector(selectAuthPhase);
  const bootstrapStartRef = useRef<number>(testOnlyBootstrapStartAt ?? Date.now());
  const [snapshot, setSnapshot] = useState<MetricsSnapshot>(() => getMetricsSnapshot());
  const [now, setNow] = useState<number>(() => Date.now());

  // Live snapshot from observability (throttled ≤ 1Hz at source).
  useEffect(() => {
    const unsubscribe = subscribeMetrics((next) => setSnapshot(next));
    return unsubscribe;
  }, []);

  // Tick-based timer so the slow-init branch flips without depending
  // on a Redux re-render. 5s cadence is fine for a 30s threshold.
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), SLOW_INIT_TICK_INTERVAL_MS);
    return () => clearInterval(handle);
  }, []);

  const { degraded, reason } = selectAuthDegradedState(
    phase,
    bootstrapStartRef.current,
    snapshot,
    now,
  );

  if (!degraded || reason === null) {
    return null;
  }

  const { title, help } = messages[reason];

  return (
    <div
      role="alert"
      data-testid="auth-degraded-banner"
      data-reason={reason}
      className="bg-warning text-warning-foreground p-2 text-sm flex items-center justify-between"
    >
      <div>
        <strong>{title}</strong> <span className="text-warning-foreground/80">{help}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reload}
          className="underline text-warning-foreground"
          data-testid="auth-degraded-reload"
        >
          Sayfayı yenile
        </button>
        <a
          href={buildLoginRedirect()}
          className="underline text-warning-foreground"
          data-testid="auth-degraded-login"
        >
          Yeniden giriş yap
        </a>
      </div>
    </div>
  );
};
