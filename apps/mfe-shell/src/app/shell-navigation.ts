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

export const isEthicRemoteEnabled = (): boolean =>
  readEnvBoolean(['VITE_SHELL_ENABLE_ETHIC_REMOTE', 'SHELL_ENABLE_ETHIC_REMOTE'], true);

/**
 * Endpoint-admin remote — defaults OFF (FE-000 safe skeleton).
 *
 * PR #258 attempted to wire this remote without flag-gating in
 * `wireRemoteShellServices()`, which forced the MF runtime to
 * resolve `mfe_endpoint_admin/shell-services` against the STUB
 * entry at startup. STUB lacks an MF container contract → the
 * runtime threw synchronously and white-screened the SPA on
 * testai (PR #261 reverted it).
 *
 * This flag-gate restores the FE-000 skeleton safely:
 *   - flag OFF (default): wiring + route both skip the remote;
 *     the STUB entry registered in vite.config.ts is never
 *     loaded by application code.
 *   - flag ON: full enablement path (shell-services wiring +
 *     route) — gated behind backend `e9cb8dd0` deploy and the
 *     OpenFGA seed for `module:endpoint-admin`.
 */
export const isEndpointAdminRemoteEnabled = (): boolean =>
  readEnvBoolean(
    ['VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE', 'SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE'],
    false,
  );
