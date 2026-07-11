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
 *
 * FAIL-CLOSED KONTRAT (Codex 019f50b7 post-impl P1): 200 dönen ama beklenen
 * DTO şeklini sağlamayan cevap SESSİZCE boş veriye çevrilmez — AtsContractError
 * fırlatılır (backend kontrat/rewrite regresyonu "transkript yok" gibi
 * görünmesin). Boş liste yalnız gerçekten `[]`, boş segment yalnız gerçekten
 * `segments: []` olduğunda kabul edilir.
 */
export interface LiveTranscriptSummary {
  transcriptKey: string;
  language: string;
  segmentCount: number;
}

/** 200 + beklenmeyen gövde — kontrat regresyonu sinyali (generic hata yüzeyine düşer). */
export class AtsContractError extends Error {
  constructor(detail: string) {
    super(`/api/ats kontrat hatası: ${detail}`);
    this.name = 'AtsContractError';
  }
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

function responseStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/**
 * 401 / oturum-yok → AUTHN (D29 Authn-deny aynası): session/audience problemi,
 * rol atamak çözmez — "yeniden giriş" yüzeyi.
 */
export function isAuthnError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'InterviewEvidenceUnauthenticatedError') {
    return true;
  }
  return responseStatus(error) === 401;
}

/** YALNIZ 403 → AUTHZ (D29 Authz-deny aynası): rol-kapısı — ats-api client-role eksik. */
export function isAuthzError(error: unknown): boolean {
  return responseStatus(error) === 403;
}

function asSummary(raw: unknown, index: number): LiveTranscriptSummary {
  const r = raw as Partial<LiveTranscriptSummary> | null;
  if (
    !r ||
    typeof r.transcriptKey !== 'string' ||
    !r.transcriptKey ||
    typeof r.language !== 'string' ||
    typeof r.segmentCount !== 'number'
  ) {
    throw new AtsContractError(
      `transcripts[${index}] beklenen {transcriptKey,language,segmentCount} şeklinde değil`,
    );
  }
  return { transcriptKey: r.transcriptKey, language: r.language, segmentCount: r.segmentCount };
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
  if (!Array.isArray(response.data)) {
    throw new AtsContractError('transcripts cevabı dizi değil');
  }
  return response.data.map((row, i) => toTranscriptEntry(asSummary(row, i)));
}

function asSegment(raw: unknown, index: number): Segment {
  const s = raw as Partial<Segment> | null;
  if (
    !s ||
    typeof s.index !== 'number' ||
    typeof s.speakerLabel !== 'string' ||
    typeof s.startMs !== 'number' ||
    typeof s.endMs !== 'number' ||
    typeof s.text !== 'string'
  ) {
    throw new AtsContractError(`segments[${index}] beklenen SegmentDto şeklinde değil`);
  }
  return {
    index: s.index,
    speakerLabel: s.speakerLabel,
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text,
  };
}

export async function fetchLiveSegments(
  interviewId: string,
  transcriptKey: string,
): Promise<Segment[]> {
  const services = await resolveServices();
  // transcriptKey '/' içerir (content-addressed) — path-segment değil query-param.
  const response = await services.http.get<{ segments?: unknown }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/transcript`,
    { params: { key: transcriptKey }, headers: { Accept: 'application/json' } },
  );
  const segments = response.data?.segments;
  if (!Array.isArray(segments)) {
    throw new AtsContractError('transcript cevabında segments dizisi yok');
  }
  return segments.map(asSegment);
}
