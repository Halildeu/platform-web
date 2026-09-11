import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAccessTokenProvider,
  registerAccessTokenProvider,
  registerAccessTokenSnapshot,
  resolveAuthToken,
} from './standalone-http';

/**
 * platform-web#1155 — the design-system grid-variants client reads `resolveAuthToken()`
 * synchronously right before its fetch. The manager used to answer with the async
 * provider's Promise (typeof !== 'string' → null), so every /api/v1/variants request
 * went out without an Authorization header and came back 401.
 */
describe('standalone-http resolveAuthToken', () => {
  afterEach(() => clearAccessTokenProvider());

  it('is null before the session is ready', () => {
    expect(resolveAuthToken()).toBeNull();
  });

  it('answers synchronously from the registered snapshot, not from the async provider', () => {
    registerAccessTokenProvider(async () => 'from-async-provider');
    expect(resolveAuthToken()).toBeNull();
    registerAccessTokenSnapshot(() => 'current-session-token');
    expect(resolveAuthToken()).toBe('current-session-token');
  });

  it('forgets the snapshot together with the provider', () => {
    registerAccessTokenSnapshot(() => 'current-session-token');
    clearAccessTokenProvider();
    expect(resolveAuthToken()).toBeNull();
  });
});
