import { getShellServices } from '../shell-services';
import type { InterviewEvidenceShellServices } from '../shell-services';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';

/**
 * 39d-7b canlı claim-citation (F4) — Codex 019f50b7 onaylı plan + kontrat
 * (CitationApiController kaynak-kanıtlı):
 *   POST /interviews/{id}/citations {transcriptKey, claim}
 *     → 201 {citationKey, evidenceId, entailment, resolvedRefCount}
 * Review-case AÇILMAZ (citation ondan bağımsız çalışır — gereksiz mutable
 * state üretilmez); yanıt POINTER-ONLY (claim yankılanmaz; kaynak segment-ref
 * listesi dönmez — content-plane ayrı okuma dilimi). Citation KALICI kanıt
 * üretir (evidenceId → WORM).
 */
export type CitationEntailment = 'SUPPORTED' | 'NOT_SUPPORTED' | 'INSUFFICIENT';

const ENTAILMENTS: readonly CitationEntailment[] = ['SUPPORTED', 'NOT_SUPPORTED', 'INSUFFICIENT'];

/** Backend CitationService.MAX_CLAIM_LENGTH ile senkron (istek atılmadan reddedilir). */
export const MAX_CLAIM_LENGTH = 500;

export interface LiveCitationReceipt {
  citationKey: string;
  evidenceId: string;
  entailment: CitationEntailment;
  resolvedRefCount: number;
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

export async function requestLiveCitation(
  interviewId: string,
  transcriptKey: string,
  claim: string,
): Promise<LiveCitationReceipt> {
  const canonicalClaim = claim.trim();
  if (!canonicalClaim) throw new AtsClientValidationError('İddia (claim) boş olamaz.');
  if (canonicalClaim.length > MAX_CLAIM_LENGTH) {
    throw new AtsClientValidationError(
      `İddia çok uzun (${canonicalClaim.length}; sınır ${MAX_CLAIM_LENGTH}).`,
    );
  }
  if (!transcriptKey.trim()) {
    throw new AtsClientValidationError('Transkript seçili değil.');
  }
  const services = await resolveServices();
  const response = await services.http.post<Partial<LiveCitationReceipt>>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/citations`,
    { transcriptKey, claim: canonicalClaim },
    { headers: { 'Content-Type': 'application/json' } },
  );
  const d = response.data;
  const entailment = d?.entailment;
  if (
    !d ||
    typeof d.citationKey !== 'string' ||
    !d.citationKey ||
    typeof d.evidenceId !== 'string' ||
    !d.evidenceId ||
    typeof entailment !== 'string' ||
    !ENTAILMENTS.includes(entailment as CitationEntailment) ||
    typeof d.resolvedRefCount !== 'number' ||
    d.resolvedRefCount < 0
  ) {
    // Bilinmeyen entailment dahil (Codex şartı): şekil-geçersiz 201 sessizce
    // "öneri" olarak SUNULMAZ — kontrat hatası.
    throw new AtsContractError(
      'citations cevabı beklenen {citationKey,evidenceId,entailment,resolvedRefCount} şeklinde değil',
    );
  }
  return {
    citationKey: d.citationKey,
    evidenceId: d.evidenceId,
    entailment: entailment as CitationEntailment,
    resolvedRefCount: d.resolvedRefCount,
  };
}
