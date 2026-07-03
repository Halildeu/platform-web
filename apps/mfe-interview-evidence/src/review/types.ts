/**
 * F4/F5 inceleme akışı tipleri (ATS kanonik sözleşmenin UI-yüzü).
 * 39d'de `/api/ats` DTO'larına bağlanır; şimdilik demo motoru kullanır.
 */
export type Entailment = 'SUPPORTED' | 'NOT_SUPPORTED' | 'INSUFFICIENT';

export interface CitationReceipt {
  citationKey: string;
  entailment: Entailment;
  resolvedRefCount: number;
}

export type CaseState =
  | 'AI_SUGGESTED'
  | 'HUMAN_REVIEWING'
  | 'HUMAN_REVIEWED_NO_CHANGE'
  | 'HUMAN_EDITED'
  | 'AI_SUGGESTION_REJECTED'
  | 'HUMAN_RATIONALE_RECORDED'
  | 'FINALIZED'
  | 'EXPORTED';

export interface CaseSummary {
  caseKey: string;
  state: CaseState;
}

export interface ExportReceipt {
  packetDigest: string;
  claimCount: number;
}
