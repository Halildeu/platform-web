// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  enterImpersonationMode,
  exitImpersonationMode,
  clearImpersonationOnFailurePath,
  isImpersonationModeActive,
  readImpersonationExchangedToken,
  readImpersonationExpiresAt,
  readImpersonationOriginalAdminExpiresAt,
  readImpersonationOriginalToken,
  readImpersonationSessionId,
  IMPERSONATION_ORIGINAL_TOKEN_KEY,
  IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY,
  IMPERSONATION_EXCHANGED_TOKEN_KEY,
  IMPERSONATION_EXPIRES_AT_KEY,
  IMPERSONATION_MODE_KEY,
  IMPERSONATION_SESSION_ID_KEY,
} from './impersonation-storage';

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * impersonation-storage TTL + cleanup kilitler. Persisted admin token
 * expiry geçtiğinde {@code readImpersonationOriginalToken} null döner;
 * her failure path {@link clearImpersonationOnFailurePath} ile bütün
 * key'leri temizler.
 */

const ADMIN_TOKEN = 'admin-jwt-token';
const BROKER_TOKEN = 'broker-jwt-token';
const SESSION_ID = '00000000-0000-0000-0000-000000000001';

describe('impersonation-storage TTL + cleanup (PR-C2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('enterImpersonationMode persists every key + sets mode=active', () => {
    enterImpersonationMode({
      originalAdminToken: ADMIN_TOKEN,
      originalAdminExpiresAt: Date.now() + 60_000,
      sessionId: SESSION_ID,
      exchangedToken: BROKER_TOKEN,
      expiresAt: Date.now() + 30_000,
    });

    expect(window.localStorage.getItem(IMPERSONATION_MODE_KEY)).toBe('active');
    expect(window.localStorage.getItem(IMPERSONATION_SESSION_ID_KEY)).toBe(SESSION_ID);
    expect(window.localStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN_KEY)).toBe(ADMIN_TOKEN);
    expect(window.localStorage.getItem(IMPERSONATION_EXCHANGED_TOKEN_KEY)).toBe(BROKER_TOKEN);
    expect(window.localStorage.getItem(IMPERSONATION_EXPIRES_AT_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY)).not.toBeNull();
    expect(isImpersonationModeActive()).toBe(true);
  });

  it('readImpersonationOriginalToken returns null when admin TTL expired', () => {
    enterImpersonationMode({
      originalAdminToken: ADMIN_TOKEN,
      originalAdminExpiresAt: Date.now() - 1_000, // already expired
      sessionId: SESSION_ID,
      exchangedToken: BROKER_TOKEN,
      expiresAt: Date.now() + 30_000,
    });

    expect(readImpersonationOriginalToken()).toBeNull();
  });

  it('readImpersonationOriginalToken returns the token when TTL is in the future', () => {
    enterImpersonationMode({
      originalAdminToken: ADMIN_TOKEN,
      originalAdminExpiresAt: Date.now() + 60_000,
      sessionId: SESSION_ID,
      exchangedToken: BROKER_TOKEN,
      expiresAt: Date.now() + 30_000,
    });

    expect(readImpersonationOriginalToken()).toBe(ADMIN_TOKEN);
  });

  it('clearImpersonationOnFailurePath removes every persisted key', () => {
    enterImpersonationMode({
      originalAdminToken: ADMIN_TOKEN,
      originalAdminExpiresAt: Date.now() + 60_000,
      sessionId: SESSION_ID,
      exchangedToken: BROKER_TOKEN,
      expiresAt: Date.now() + 30_000,
    });

    clearImpersonationOnFailurePath();

    expect(window.localStorage.getItem(IMPERSONATION_MODE_KEY)).toBeNull();
    expect(window.localStorage.getItem(IMPERSONATION_SESSION_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(IMPERSONATION_EXCHANGED_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(IMPERSONATION_EXPIRES_AT_KEY)).toBeNull();
    expect(window.localStorage.getItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY)).toBeNull();
    expect(isImpersonationModeActive()).toBe(false);
  });

  it('exitImpersonationMode is the same surface as the failure-path clean-up', () => {
    enterImpersonationMode({
      originalAdminToken: ADMIN_TOKEN,
      originalAdminExpiresAt: Date.now() + 60_000,
      sessionId: SESSION_ID,
      exchangedToken: BROKER_TOKEN,
      expiresAt: Date.now() + 30_000,
    });

    exitImpersonationMode();

    expect(readImpersonationSessionId()).toBeNull();
    expect(readImpersonationExchangedToken()).toBeNull();
    expect(readImpersonationOriginalToken()).toBeNull();
    expect(readImpersonationExpiresAt()).toBeNull();
    expect(readImpersonationOriginalAdminExpiresAt()).toBeNull();
  });
});
