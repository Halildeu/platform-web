import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildAppRedirectUri } from '../auth/auth-config';
import { hasEthicsManagerTokenContract, startKeycloakLogin } from '../auth/keycloakClient';
import { useAppSelector } from '../store/store.hooks';

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
    if (!token || ready || attemptedToken.current === token) return;
    attemptedToken.current = token;
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
