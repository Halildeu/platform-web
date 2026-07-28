export type CompanyOption = {
  id: number;
  nickname: string;
  name: string;
};

export type ProjectOption = {
  id: number;
  code: string | null;
  name: string;
  companyId: number;
  active: boolean;
};

export type ProjectBinding = {
  id: string;
  companyId: number;
  platformProjectRef: string;
  sourceSystem: string;
  externalCompanyNo: number;
  externalProjectId: number;
  externalProjectCode: string | null;
  verifiedAt: string | null;
};

export type ProjectActualRow = {
  id: string;
  postingDate: string;
  accountCode: string | null;
  debitCredit: 'DEBIT' | 'CREDIT' | 'UNKNOWN';
  accountingAmount: number;
  classifiedCostAmount: number;
  currency: string;
  costTreatment:
    | 'INCLUDE_COST'
    | 'INCLUDE_NEGATIVE_COST'
    | 'EXCLUDE_COUNTERPART'
    | 'EXCLUDE_TRANSFER'
    | 'REQUIRES_REVIEW';
  costRuleVersion: number | null;
  documentType: string | null;
  documentNo: string | null;
  resolutionStatus: string | null;
  cancelled: boolean;
  journalCardId: number;
  journalRowId: number;
  actionType: number | null;
  actionId: number | null;
  sourceLedgerYear: number;
  syncedAt: string;
};

export type ProjectActualSummary = {
  projectBindingId: string;
  from: string;
  to: string;
  currency: string;
  accountingActual: number;
  classifiedCost: number;
  excludedAmount: number;
  requiresReviewAmount: number;
  rowCount: number;
  snapshotRowCount: number;
  requiresReviewCount: number;
  reconciliationStatus: 'MATCHED' | 'DIFFERENCE' | 'NOT_RECONCILED_FOR_WINDOW';
  reconciliationDifference: number | null;
  lastSyncAt: string | null;
};

export type ProjectActualSyncResult = {
  batchId: string;
  status: 'MATCHED' | 'DIFFERENCE' | 'BLOCKED';
  failureCode: string | null;
  sourceRowCount: number;
  changedRowCount: number;
  tombstoneRowCount: number;
  sourceAmount: number;
  snapshotAmount: number;
  differenceAmount: number;
  sourceFingerprint: string | null;
  finishedAt: string;
};
