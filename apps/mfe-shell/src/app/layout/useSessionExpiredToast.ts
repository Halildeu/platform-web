import { useEffect, useRef } from 'react';
import { isAuthCriticalUnauthorizedUrl } from '@mfe/auth/errors';

interface UseSessionExpiredToastOptions {
  token: string | null | undefined;
  showToast: (onCancel: () => void) => string;
  dismissToast: (id: string) => void;
  onSessionExpired: () => void;
}

export function useSessionExpiredToast({
  token,
  showToast,
  dismissToast,
  onSessionExpired,
}: UseSessionExpiredToastOptions): void {
  const toastIdRef = useRef<string | null>(null);
  const previousTokenRef = useRef(token);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handler = (event: Event) => {
      if (!token || window.location.pathname.startsWith('/login')) return;

      const detail = (event as CustomEvent<{ url?: unknown }>).detail;
      if (!isAuthCriticalUnauthorizedUrl(detail?.url)) return;
      if (toastIdRef.current) return;

      let toastId = '';
      toastId = showToast(() => {
        if (toastIdRef.current === toastId) {
          toastIdRef.current = null;
        }
      });
      toastIdRef.current = toastId;
      onSessionExpired();
    };

    window.addEventListener('app:auth:unauthorized', handler);
    return () => window.removeEventListener('app:auth:unauthorized', handler);
  }, [onSessionExpired, showToast, token]);

  useEffect(() => {
    const previousToken = previousTokenRef.current;
    previousTokenRef.current = token;

    if (!token || token === previousToken || !toastIdRef.current) return;

    dismissToast(toastIdRef.current);
    toastIdRef.current = null;
  }, [dismissToast, token]);
}
