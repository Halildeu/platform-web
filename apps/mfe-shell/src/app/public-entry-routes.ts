const CANDIDATE_APPLICATION_PATH = /^\/jobs\/[^/]+\/apply\/?$/;

export const normalizePublicBasePath = (basePath: string): string => {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
};

export const isCandidateApplicationPath = (pathname: string, basePath = '/'): boolean => {
  const normalizedBasePath = normalizePublicBasePath(basePath);
  if (normalizedBasePath === '/') return CANDIDATE_APPLICATION_PATH.test(pathname);
  if (!pathname.startsWith(`${normalizedBasePath}/`)) return false;
  return CANDIDATE_APPLICATION_PATH.test(pathname.slice(normalizedBasePath.length));
};
