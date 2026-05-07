const readEnv = (keys: string[], fallback: string): string => {
  if (typeof process !== 'undefined' && process?.env) {
    for (const key of keys) {
      const value = process.env[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  if (typeof window !== 'undefined') {
    const scopedWindow = window as Window & { __env__?: Record<string, string> };
    for (const key of keys) {
      const value = scopedWindow.__env__?.[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return fallback;
};

const readEnvBoolean = (keys: string[], fallback = false): boolean => {
  const value = readEnv(keys, fallback ? '1' : '');
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export const isSuggestionsRemoteEnabled = (): boolean =>
  readEnvBoolean(['VITE_SHELL_ENABLE_SUGGESTIONS_REMOTE', 'SHELL_ENABLE_SUGGESTIONS_REMOTE'], true);

/**
 * Endpoint admin remote — default OFF. PR #258 reapply (post-#261):
 * this flag drives BOTH the build-time MF entry (vite.config buildRemotes)
 * AND the runtime shell-services loader list, so flag-OFF means the
 * remote is never registered nor eagerly loaded. This avoids the
 * white-screen reproduced on testai (sha-1911749) where the lazy
 * remote import resolved to an unreachable port 3009 + STUB.
 */
export const isEndpointAdminRemoteEnabled = (): boolean =>
  readEnvBoolean(
    ['VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE', 'SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE'],
    false,
  );

export const isEthicRemoteEnabled = (): boolean =>
  readEnvBoolean(['VITE_SHELL_ENABLE_ETHIC_REMOTE', 'SHELL_ENABLE_ETHIC_REMOTE'], true);
