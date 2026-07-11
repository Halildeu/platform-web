import { getShellServices } from '../shell-services';
import type { InterviewEvidenceShellServices } from '../shell-services';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';

/**
 * 39d-7b-2 canlı insan-onay/finalize (F5) — Codex 019f535a şartlı-onaylı plan.
 * Kontrat (ReviewApiController kaynak-kanıtlı; backend invariant'ları:
 * no-auto-finalize, tek-FINALIZED-girişi):
 *   POST /review-cases {sourceEvidenceRefs[], aiOutputVersionRef} → 201 {caseKey}
 *   GET  /review-cases → [{caseKey, state}]
 *   POST /review-case/transition {caseKey, action, ref?, oversightRoleRef?} → 204
 *   POST /review-case/finalize {caseKey, decisionOutcomeRef} → 200 {caseKey, evidenceId}
 *
 * FAIL-CLOSED: yalnız beklenen status kabul (open 201 / finalize 200 /
 * transition 204 — başka 2xx bile kontrat hatası); gövde doğrulamaları strict.
 * Review çağrıları AI'ya GİTMEZ — 5xx "AI bağımlılığı" DEĞİL, generic-backend
 * (çağıran sınıflandırır). Non-idempotent POST'lar burada da UI'da da OTOMATİK
 * RETRY EDİLMEZ (Codex şart-5; 39d-7a'nın backend replay'i bu endpoint'ler
 * için VARSAYILAMAZ).
 */
export const TRANSITION_ACTIONS = [
  'START',
  'EDIT',
  'REVIEWED_NO_CHANGE',
  'REJECT',
  'RATIONALE',
] as const;
export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

/**
 * READ fail-soft / WRITE fail-closed ayrımı (Codex şart-2): tanınmayan
 * non-empty state listeyi KIRMAZ ama o vakada tüm mutasyonlar kapatılır.
 * Bilinen küme backend HumanReviewService state-machine'inden; İLERİDE
 * genişleyebilir — istemci bilinmeyen state'in geçişlerini TAHMİN ETMEZ.
 */
export const KNOWN_CASE_STATES = ['OPEN', 'IN_REVIEW', 'FINALIZED', 'EXPORTED'] as const;
export type KnownReviewCaseState = (typeof KNOWN_CASE_STATES)[number];
export type ReviewCaseState =
  | { kind: 'known'; value: KnownReviewCaseState }
  | { kind: 'unknown'; raw: string };

export interface LiveReviewCaseSummary {
  caseKey: string;
  state: ReviewCaseState;
}

export interface FinalizeReceipt {
  caseKey: string;
  evidenceId: string;
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

function parseState(raw: unknown, caseIndex: number): ReviewCaseState {
  if (typeof raw !== 'string' || !raw.trim()) {
    // Fail-soft yalnız TANINMAYAN enum içindir; eksik/boş/non-string kontrat hatasıdır.
    throw new AtsContractError(`review-cases[${caseIndex}].state eksik/boş/string-değil`);
  }
  const value = raw.trim();
  return (KNOWN_CASE_STATES as readonly string[]).includes(value)
    ? { kind: 'known', value: value as KnownReviewCaseState }
    : { kind: 'unknown', raw: value };
}

export async function fetchLiveReviewCases(interviewId: string): Promise<LiveReviewCaseSummary[]> {
  const services = await resolveServices();
  const response = await services.http.get<unknown>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/review-cases`,
    { headers: { Accept: 'application/json' } },
  );
  if (!Array.isArray(response.data)) {
    throw new AtsContractError('review-cases cevabı dizi değil');
  }
  return response.data.map((row, i) => {
    const r = row as { caseKey?: unknown; state?: unknown } | null;
    if (!r || typeof r.caseKey !== 'string' || !r.caseKey) {
      throw new AtsContractError(`review-cases[${i}] beklenen {caseKey,state} şeklinde değil`);
    }
    return { caseKey: r.caseKey, state: parseState(r.state, i) };
  });
}

export async function openLiveReviewCase(
  interviewId: string,
  sourceEvidenceRefs: string[],
  aiOutputVersionRef: string,
): Promise<string> {
  if (!sourceEvidenceRefs.length || sourceEvidenceRefs.some((r) => !r.trim())) {
    throw new AtsClientValidationError('Kaynak kanıt referansı (sourceEvidenceRefs) zorunlu.');
  }
  if (!aiOutputVersionRef.trim()) {
    throw new AtsClientValidationError('AI çıktı sürüm referansı zorunlu.');
  }
  const services = await resolveServices();
  const response = await services.http.post<{ caseKey?: unknown }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/review-cases`,
    { sourceEvidenceRefs, aiOutputVersionRef },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (
    response.status !== 201 ||
    typeof response.data?.caseKey !== 'string' ||
    !response.data.caseKey
  ) {
    throw new AtsContractError('review-cases open cevabı beklenen 201 {caseKey} şeklinde değil');
  }
  return response.data.caseKey;
}

export async function transitionLiveReviewCase(
  interviewId: string,
  caseKey: string,
  action: TransitionAction,
  opts: { ref?: string; oversightRoleRef?: string } = {},
): Promise<void> {
  if (!caseKey.trim()) throw new AtsClientValidationError('caseKey zorunlu.');
  if (!TRANSITION_ACTIONS.includes(action)) {
    // Client-side allowlist — enum-dışı action istek atılmadan reddedilir.
    throw new AtsClientValidationError(`Geçersiz aksiyon: ${String(action)}`);
  }
  const services = await resolveServices();
  const response = await services.http.post<unknown>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/review-case/transition`,
    { caseKey, action, ref: opts.ref, oversightRoleRef: opts.oversightRoleRef },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (response.status !== 204) {
    throw new AtsContractError(`transition cevabı 204 değil: ${response.status}`);
  }
}

export async function finalizeLiveReviewCase(
  interviewId: string,
  caseKey: string,
  decisionOutcomeRef: string,
): Promise<FinalizeReceipt> {
  if (!caseKey.trim()) throw new AtsClientValidationError('caseKey zorunlu.');
  if (!decisionOutcomeRef.trim()) {
    throw new AtsClientValidationError('Karar sonucu referansı (decisionOutcomeRef) zorunlu.');
  }
  const services = await resolveServices();
  const response = await services.http.post<{ caseKey?: unknown; evidenceId?: unknown }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/review-case/finalize`,
    { caseKey, decisionOutcomeRef: decisionOutcomeRef.trim() },
    { headers: { 'Content-Type': 'application/json' } },
  );
  const d = response.data;
  if (
    response.status !== 200 ||
    typeof d?.caseKey !== 'string' ||
    !d.caseKey ||
    typeof d?.evidenceId !== 'string' ||
    !d.evidenceId
  ) {
    throw new AtsContractError('finalize cevabı beklenen 200 {caseKey,evidenceId} şeklinde değil');
  }
  if (d.caseKey !== caseKey) {
    // Dönen kimlik gönderilenle eşleşmek ZORUNDA (Codex şart-6).
    throw new AtsContractError('finalize cevabındaki caseKey gönderilenle uyuşmuyor');
  }
  return { caseKey: d.caseKey, evidenceId: d.evidenceId };
}
