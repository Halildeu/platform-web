import {
  APPLICATION_POLICY_NOTICE_VERSION,
  RESUME_IMPORT_POLICY_NOTICE_VERSION,
  type CandidateDataPolicyDto,
} from './api/application-api';

/** Unknown server policy/version never enables consent or an upload. */
export const resolveCandidateDataPolicy = (value: unknown): CandidateDataPolicyDto | null => {
  if (!value || typeof value !== 'object') return null;
  const policy = value as Record<string, unknown>;
  if (
    (policy.mode !== 'synthetic-only' && policy.mode !== 'real-allowed') ||
    policy.applicationNoticeVersion !== APPLICATION_POLICY_NOTICE_VERSION ||
    policy.resumeImportNoticeVersion !== RESUME_IMPORT_POLICY_NOTICE_VERSION
  )
    return null;
  return {
    mode: policy.mode,
    applicationNoticeVersion: policy.applicationNoticeVersion,
    resumeImportNoticeVersion: policy.resumeImportNoticeVersion,
  };
};

export const candidateDataPolicyText = (policy: CandidateDataPolicyDto): string =>
  policy.mode === 'synthetic-only'
    ? 'Bu ortamda yalnız sentetik aday verisi kullanın; e-posta adresi .test ile bitmelidir.'
    : 'Bu ortamda sentetik veri kısıtı uygulanmıyor. Yalnız başvuru için gerekli bilgileri paylaşın.';
