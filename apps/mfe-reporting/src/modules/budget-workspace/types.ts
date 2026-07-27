export type BudgetVersionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';

export type BudgetLineInput = {
  period: string;
  accountCode: string;
  costCenterCode: string;
  projectCode: string;
  departmentCode: string;
  branchCode: string;
  direction: 'EXPENSE' | 'INCOME';
  plannedAmount: number;
  currency: string;
  description: string;
};
export type BudgetLineView = BudgetLineInput & {
  id: string;
};

export type BudgetPlanView = {
  planId: string;
  versionId: string;
  companyId: number;
  fiscalYear: number;
  baseCurrency: string;
  versionNo: number;
  status: BudgetVersionStatus;
  submittedBy: string | null;
  approvedBy: string | null;
  lines: BudgetLineView[];
};

export type BudgetControlSummary = {
  planId: string;
  versionId: string;
  companyId: number;
  fiscalYear: number;
  currency: string;
  versionStatus: BudgetVersionStatus;
  plan: number;
  accountingActual: number;
  allocatedActual: number;
  unallocatedActual: number;
  unresolvedActual: number;
  commitment: number;
  remaining: number;
  etc: number | null;
  eac: number | null;
  variance: number | null;
  forecastStatus: 'LOADED' | 'NOT_LOADED';
  actualDefinition: string;
  remainingDefinition: string;
};

export type BudgetReference = {
  planId: string;
  versionId: string;
};
