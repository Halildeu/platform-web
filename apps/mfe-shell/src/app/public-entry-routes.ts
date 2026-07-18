const CANDIDATE_APPLICATION_PATH = /^\/jobs\/[^/]+\/apply\/?$/;
const PUBLIC_JOBS_PATH = /^\/jobs\/?$/;
const PUBLIC_JOB_DETAIL_PATH = /^\/jobs\/[^/]+\/?$/;
const TENANT_CANDIDATE_APPLICATION_PATH = /^\/careers\/[^/]+\/jobs\/[^/]+\/apply\/?$/;
const TENANT_PUBLIC_JOBS_PATH = /^\/careers\/[^/]+\/jobs\/?$/;
const TENANT_PUBLIC_JOB_DETAIL_PATH = /^\/careers\/[^/]+\/jobs\/[^/]+\/?$/;
const CANDIDATE_PORTAL_PATH = /^\/candidate\/?$/;

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
  return (
    publicPath !== null &&
    (CANDIDATE_APPLICATION_PATH.test(publicPath) ||
      TENANT_CANDIDATE_APPLICATION_PATH.test(publicPath))
  );
};

export const isPublicJobsPath = (pathname: string, basePath = '/'): boolean => {
  const publicPath = pathUnderBase(pathname, basePath);
  return (
    publicPath !== null &&
    (PUBLIC_JOBS_PATH.test(publicPath) || TENANT_PUBLIC_JOBS_PATH.test(publicPath))
  );
};

export const isPublicJobDetailPath = (pathname: string, basePath = '/'): boolean => {
  const publicPath = pathUnderBase(pathname, basePath);
  return (
    publicPath !== null &&
    (PUBLIC_JOB_DETAIL_PATH.test(publicPath) || TENANT_PUBLIC_JOB_DETAIL_PATH.test(publicPath))
  );
};

export const isCandidatePortalPath = (pathname: string, basePath = '/'): boolean => {
  const publicPath = pathUnderBase(pathname, basePath);
  return publicPath !== null && CANDIDATE_PORTAL_PATH.test(publicPath);
};

export const isPublicCandidatePath = (pathname: string, basePath = '/'): boolean =>
  isCandidatePortalPath(pathname, basePath) ||
  isPublicJobsPath(pathname, basePath) ||
  isPublicJobDetailPath(pathname, basePath) ||
  isCandidateApplicationPath(pathname, basePath);
