import { describe, expect, it } from 'vitest';
import { resolveCandidateDataPolicy } from './candidate-data-policy';
import { noticeFor } from './kvkk-notices';

const policy = {
  mode: 'synthetic-only',
  applicationNoticeVersion: 'kvkk-application-v2',
  resumeImportNoticeVersion: 'candidate-resume-import-v2',
};

describe('candidate policy contract', () => {
  it.each(['synthetic-only', 'real-allowed'])('accepts only the supported %s contract', (mode) => {
    expect(resolveCandidateDataPolicy({ ...policy, mode })).toEqual({ ...policy, mode });
  });

  it.each([
    undefined,
    null,
    false,
    'real-allowed',
    {},
    { ...policy, mode: 'future-mode' },
    { ...policy, applicationNoticeVersion: 'kvkk-application-v1' },
    { ...policy, resumeImportNoticeVersion: 'future-version' },
  ])('fails closed on invalid metadata %j', (value) => {
    expect(resolveCandidateDataPolicy(value)).toBeNull();
  });

  it.each(['kvkk-application', 'candidate-resume-import'])(
    'preserves %s legal terms and old version',
    (prefix) => {
      const oldNotice = noticeFor(`${prefix}-v1`, 'acik');
      const newNotice = noticeFor(`${prefix}-v2`, 'acik');
      expect(oldNotice).not.toBeNull();
      expect(newNotice).toEqual({ ...oldNotice, version: `${prefix}-v2` });
      expect(noticeFor(`${prefix}-v1`, 'acik')?.version).toBe(`${prefix}-v1`);
      expect(noticeFor(`${prefix}-v2`, 'unknown-tenant')).toBeNull();
    },
  );
});
