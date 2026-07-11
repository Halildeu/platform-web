import { getShellServices } from '../shell-services';
import type { InterviewEvidenceShellServices } from '../shell-services';
import type { Segment } from '../segment-view/types';
import type { TranscriptEntry } from './types';

/**
 * 39d-6 canlı READ — testai `/api/ats/v1` (same-origin `/api` + ingress rewrite).
 * Kontrat 39d-4 D29 14/14 canlı-kanıtlı (RB-ats-39d-testai.md):
 *   GET /interviews/{id}/transcripts      → [{transcriptKey, language, segmentCount}]
 *   GET /interviews/{id}/transcript?key=  → {interviewId, language, segments[]}
 * Liste pointer-only meta taşır (içerik değil); Segment tipi backend
 * SegmentDto ile bire bir aynıdır (ATS-0013 takma-ad diarization dahil).
 */
export interface LiveTranscriptSummary {
  transcriptKey: string;
  language: string;
  segmentCount: number;
}

async function resolveServices(): Promise<InterviewEvidenceShellServices> {
  const services = getShellServices();
  const ready = await services.auth.ready();
  if (!ready.ok) {
    const error = new Error(ready.error || ready.reason);
    error.name =
      ready.reason === 'unauthenticated'
        ? 'InterviewEvidenceUnauthenticatedError'
        : 'InterviewEvidenceAuthError';
    throw error;
  }
  return services;
}

/** 401/403 → yetki hatası (rol-kapısı: ats-api client-role ataması yok). */
export function isAuthzError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'InterviewEvidenceUnauthenticatedError') {
    return true;
  }
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

function asSummary(raw: unknown): LiveTranscriptSummary | null {
  const r = raw as Partial<LiveTranscriptSummary> | null;
  if (!r || typeof r.transcriptKey !== 'string' || !r.transcriptKey) return null;
  return {
    transcriptKey: r.transcriptKey,
    language: typeof r.language === 'string' ? r.language : '?',
    segmentCount: typeof r.segmentCount === 'number' ? r.segmentCount : 0,
  };
}

/** Pointer-only etiket (PII yok): dil + segment sayısı + key kuyruğu. */
export function toTranscriptEntry(s: LiveTranscriptSummary): TranscriptEntry {
  const tail = s.transcriptKey.length > 12 ? `…${s.transcriptKey.slice(-8)}` : s.transcriptKey;
  return {
    transcriptKey: s.transcriptKey,
    label: `Canlı ${s.language} · ${s.segmentCount} segment · ${tail}`,
    origin: 'LIVE',
    segments: [],
    erasure: null,
  };
}

export async function fetchLiveTranscripts(interviewId: string): Promise<TranscriptEntry[]> {
  const services = await resolveServices();
  const response = await services.http.get<unknown>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/transcripts`,
    { headers: { Accept: 'application/json' } },
  );
  const list = Array.isArray(response.data) ? response.data : [];
  return list
    .map(asSummary)
    .filter((s): s is LiveTranscriptSummary => s !== null)
    .map(toTranscriptEntry);
}

export async function fetchLiveSegments(
  interviewId: string,
  transcriptKey: string,
): Promise<Segment[]> {
  const services = await resolveServices();
  // transcriptKey '/' içerir (content-addressed) — path-segment değil query-param.
  const response = await services.http.get<{ segments?: Segment[] }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/transcript`,
    { params: { key: transcriptKey }, headers: { Accept: 'application/json' } },
  );
  const segments = response.data?.segments;
  return Array.isArray(segments) ? segments : [];
}
