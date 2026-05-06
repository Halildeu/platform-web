/**
 * Test-only mock for `mfe_shell/i18n`. Mirrors the mfe-users mock so vitest
 * can resolve the shell's i18n surface without spinning up Module
 * Federation. Production runtime always loads the real implementation
 * via the shell remote.
 */
export const useShellCommonI18n = () => ({
  t: (key: string) => key,
});

export default useShellCommonI18n;
