const CANDIDATE_APPLICATION_PATH = /^\/jobs\/[^/]+\/apply\/?$/;
const PUBLIC_JOBS_PATH = /^\/jobs\/?$/;

export const normalizePublicBasePath = (basePath: string): string => {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
};

const pathUnderBase = (pathname: string, basePath: string): string | null => {
  const normalizedBasePath = normalizePublicBasePath(basePath);
  if (normalizedBasePath === '/') return pathname;
  if (!pathname.startsWith(`${normalizedBasePath}/`)) return null;
  return pathname.slice(normalizedBasePath.length);
};

export const isCandidateApplicationPath = (pathname: string, basePath = '/'): boolean => {
  const publicPath = pathUnderBase(pathname, basePath);
  return publicPath !== null && CANDIDATE_APPLICATION_PATH.test(publicPath);
};

export const isPublicJobsPath = (pathname: string, basePath = '/'): boolean => {
  const publicPath = pathUnderBase(pathname, basePath);
  return publicPath !== null && PUBLIC_JOBS_PATH.test(publicPath);
};

export const isPublicCandidatePath = (pathname: string, basePath = '/'): boolean =>
  isPublicJobsPath(pathname, basePath) || isCandidateApplicationPath(pathname, basePath);
