/**
 * F10 DSAR/erasure tipleri (ATS kanonik sözleşmenin UI-yüzü).
 * 39d'de `/api/ats` DTO'larına bağlanır; şimdilik demo motoru kullanır.
 */
export interface ErasureScope {
  transcriptKeys: string[];
  citationKeys: string[];
  exportArtifactKeys: string[];
  reviewCaseKeys: string[];
  tombstoneTargetEvidenceIds: string[];
}

export interface ErasureReceipt {
  dsarKey: string;
  tombstoneCount: number;
  deletedContentCount: number;
  caseTransitioned: boolean;
}
