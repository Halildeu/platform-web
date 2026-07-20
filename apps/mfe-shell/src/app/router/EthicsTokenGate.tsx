import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildAppRedirectUri } from '../auth/auth-config';
import { hasEthicsManagerTokenContract, startKeycloakLogin } from '../auth/keycloakClient';
import { useAppSelector } from '../store/store.hooks';

const ETHICS_TOKEN_UPGRADE_ATTEMPT_KEY = 'ethicsTokenUpgradeAttempt_v1';
const ETHICS_TOKEN_UPGRADE_ATTEMPT_TTL_MS = 5 * 60 * 1000;

type EthicsTokenUpgradeAttempt = {
  attemptedAt: number;
  route: '/ethic';
};

const clearUpgradeAttempt = (): void => {
  try {
    window.sessionStorage.removeItem(ETHICS_TOKEN_UPGRADE_ATTEMPT_KEY);
  } catch {
    // A successful token is authoritative even when browser storage is unavailable.
  }
};

/**
 * Claims the single automatic SSO-upgrade attempt for this browser-tab session.
 * The marker deliberately contains neither a JWT nor a case path/identifier.
 * Storage failure is fail-closed because an unrecorded redirect could loop.
 */
const claimUpgradeAttempt = (now = Date.now()): boolean => {
  try {
    const raw = window.sessionStorage.getItem(ETHICS_TOKEN_UPGRADE_ATTEMPT_KEY);
    if (raw) {
      const attempt = JSON.parse(raw) as Partial<EthicsTokenUpgradeAttempt>;
      if (
        attempt.route === '/ethic' &&
        typeof attempt.attemptedAt === 'number' &&
        now - attempt.attemptedAt < ETHICS_TOKEN_UPGRADE_ATTEMPT_TTL_MS
      ) {
        return false;
      }
    }

    const attempt: EthicsTokenUpgradeAttempt = { attemptedAt: now, route: '/ethic' };
    window.sessionStorage.setItem(ETHICS_TOKEN_UPGRADE_ATTEMPT_KEY, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
};

/**
 * Upgrades an already-authenticated suite session only after the ordinary
 * ETHIC entitlement gate has passed. Etik scopes remain optional for every
 * other suite module; navigation into /ethic performs a bounded Keycloak SSO
 * authorization request when the current token lacks the staff API contract.
 */
export const EthicsTokenGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const token = useAppSelector((state) => state.auth.token);
  const location = useLocation();
  const attemptedToken = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = hasEthicsManagerTokenContract(token);

  useEffect(() => {
    if (ready) {
      clearUpgradeAttempt();
      return;
    }
    if (!token || attemptedToken.current === token) return;
    attemptedToken.current = token;
    if (!claimUpgradeAttempt()) {
      setFailed(true);
      return;
    }
    setFailed(false);
    const redirectPath = `${location.pathname}${location.search}${location.hash}` || '/ethic';
    startKeycloakLogin({ redirectUri: buildAppRedirectUri(redirectPath) }).catch(() => {
      setFailed(true);
    });
  }, [location.hash, location.pathname, location.search, ready, token]);

  if (!token) return <>{children}</>;
  if (ready) return <>{children}</>;
  if (failed) {
    return (
      <div role="alert" className="px-6 py-10 text-sm font-medium text-danger">
        Etik Speak yetkili oturumu güvenli biçimde yükseltilemedi. Lütfen yeniden giriş yapın.
      </div>
    );
  }
  return null;
};
