import { describe, expect, it } from 'vitest';
import {
  isCandidateApplicationPath,
  isCandidatePortalPath,
  isPublicCandidatePath,
  isPublicJobDetailPath,
  isPublicJobsPath,
  normalizePublicBasePath,
} from './public-entry-routes';

describe('public entry routes', () => {
  it.each([
    '/jobs/urun-yoneticisi/apply',
    '/jobs/senior-frontend-developer/apply/',
    '/jobs/%C3%BCr%C3%BCn-tasarimcisi/apply',
  ])('recognizes public candidate application path %s', (pathname) => {
    expect(isCandidateApplicationPath(pathname)).toBe(true);
    expect(isPublicCandidatePath(pathname)).toBe(true);
  });

  it.each(['/jobs', '/jobs/'])('recognizes public job discovery path %s', (pathname) => {
    expect(isPublicJobsPath(pathname)).toBe(true);
    expect(isPublicCandidatePath(pathname)).toBe(true);
    expect(isCandidateApplicationPath(pathname)).toBe(false);
  });

  it.each(['/jobs/urun-yoneticisi', '/jobs/senior-frontend-developer/'])(
    'recognizes public job detail path %s',
    (pathname) => {
      expect(isPublicJobDetailPath(pathname)).toBe(true);
      expect(isPublicCandidatePath(pathname)).toBe(true);
      expect(isCandidateApplicationPath(pathname)).toBe(false);
    },
  );

  it.each(['/candidate', '/candidate/'])(
    'recognizes public candidate portal path %s',
    (pathname) => {
      expect(isCandidatePortalPath(pathname)).toBe(true);
      expect(isPublicCandidatePath(pathname)).toBe(true);
      expect(isCandidateApplicationPath(pathname)).toBe(false);
      expect(isPublicJobsPath(pathname)).toBe(false);
    },
  );

  it.each(['/', '/jobs/urun-yoneticisi/apply/preview', '/admin/ats'])(
    'keeps non-candidate path %s on the authenticated shell',
    (pathname) => {
      expect(isPublicCandidatePath(pathname)).toBe(false);
    },
  );

  it('recognizes a candidate route under the configured application base path', () => {
    expect(
      isCandidateApplicationPath('/platform/jobs/veri-bilimi-lideri/apply', '/platform/'),
    ).toBe(true);
    expect(
      isCandidateApplicationPath('/platform/jobs/veri-bilimi-lideri/apply/', '/platform/'),
    ).toBe(true);
    expect(isCandidateApplicationPath('/jobs/veri-bilimi-lideri/apply', '/platform/')).toBe(false);
    expect(isPublicJobsPath('/platform/jobs', '/platform/')).toBe(true);
    expect(isPublicJobsPath('/platform/jobs/', '/platform/')).toBe(true);
    expect(isPublicJobsPath('/jobs', '/platform/')).toBe(false);
    expect(isPublicJobDetailPath('/platform/jobs/veri-bilimi-lideri', '/platform/')).toBe(true);
    expect(isPublicJobDetailPath('/jobs/veri-bilimi-lideri', '/platform/')).toBe(false);
    expect(isCandidatePortalPath('/platform/candidate', '/platform/')).toBe(true);
    expect(isCandidatePortalPath('/platform/candidate/', '/platform/')).toBe(true);
    expect(isCandidatePortalPath('/candidate', '/platform/')).toBe(false);
  });

  it.each([
    ['', '/'],
    ['/', '/'],
    ['platform', '/platform'],
    ['/platform/', '/platform'],
  ])('normalizes public base path %s', (input, expected) => {
    expect(normalizePublicBasePath(input)).toBe(expected);
  });
});
