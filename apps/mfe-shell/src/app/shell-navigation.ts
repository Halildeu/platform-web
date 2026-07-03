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
 * Endpoint admin remote — default OFF.
 *
 * FE-001 reapply (post-PR #284 hotfix): build-time omit pattern.
 * - When OFF: vite.config buildRemotes() omits the entry entirely
 *   (no STUB), AppRouter Navigate-redirects, lazy-routes resolves to
 *   a noop component, shell-services-wiring skips the eager loader.
 * - When ON: real remote at port 3009 (or override URL).
 *
 * Why no STUB: PR #280 deploy hit MF Runtime #RUNTIME-002 because the
 * disabled-remote `data:text/javascript,export default {}; ...` URI
 * does not satisfy the federation runtime's `init()`/`get()` contract
 * → SPA boot crash before any guard could fire.
 */
export const isEndpointAdminRemoteEnabled = (): boolean =>
  readEnvBoolean(
    ['VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE', 'SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE'],
    false,
  );

export const isMeetingRemoteEnabled = (): boolean =>
  readEnvBoolean(['VITE_SHELL_ENABLE_MEETING_REMOTE', 'SHELL_ENABLE_MEETING_REMOTE'], false);

export const isInterviewEvidenceRemoteEnabled = (): boolean =>
  readEnvBoolean(
    ['VITE_SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE', 'SHELL_ENABLE_INTERVIEW_EVIDENCE_REMOTE'],
    false,
  );
