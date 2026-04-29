/**
 * Build a same-origin login redirect URL from the current location.
 *
 * Codex 019dd818 iter-7 (B-prime PR-2b) safe redirect contract:
 *  - Reject `//evil.com` (protocol-relative)
 *  - Reject `scheme:` URLs (e.g. `javascript:`)
 *  - Reject `/login` and `/register` (would loop)
 *  - Encode the path with encodeURIComponent
 *
 * Modülize ayrı dosyada — ShellLayout.tsx Module Federation remotes
 * (mfe_suggestions, mfe_users vs.) import ettiği için unit test'in
 * vite resolve hatasından bağımsız çalışması için.
 */
export function buildSafeLoginRedirect(location: {
  pathname?: string;
  search?: string;
  hash?: string;
}): string {
  const { pathname, search, hash } = location;
  const current = `${pathname || '/'}${search || ''}${hash || ''}`;
  const isSafePath =
    current.startsWith('/') &&
    !current.startsWith('//') &&
    !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(current);
  const safePath = isSafePath ? current : '/';
  const redirect =
    safePath.startsWith('/login') || safePath.startsWith('/register') ? '/' : safePath;
  return `/login?redirect=${encodeURIComponent(redirect)}`;
}
