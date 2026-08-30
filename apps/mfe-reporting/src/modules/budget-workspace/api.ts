import { getShellServices } from '../../app/services/shell-services';
import type {
  BudgetPlanView,
  CompanyOption,
  PlanImportResult,
  ProjectActualRow,
  PypActualPage,
  ProjectActualSourceDocumentDetail,
  ProjectActualSourceLineRow,
  ProjectActualSummary,
  ProjectActualSyncResult,
  ProjectBinding,
  ProjectOption,
} from './types';

const REPORTS_BASE = '/v1/reports';
// Shell HTTP client already owns the external `/api` gateway prefix.
// Keep module paths relative to that base to avoid `/api/api/...` requests.
const BUDGETS_BASE = '/v1/budgets';
const PROJECT_BUDGETS_BASE = '/v1/budgets/projects';

export type BudgetErrorKind =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAVAILABLE';

export class BudgetApiError extends Error {
  constructor(
    readonly kind: BudgetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'BudgetApiError';
  }
}

const resolveClient = () => getShellServices().http;

const requireAuthReady = async (): Promise<void> => {
  try {
    const result = await getShellServices().auth.ready();
    if (!result.ok) {
      throw new BudgetApiError(
        'AUTHENTICATION_REQUIRED',
        'Oturum güvenli bağlantı için henüz hazır değil. Lütfen yeniden deneyin.',
      );
    }
  } catch (error) {
    if (error instanceof BudgetApiError) throw error;
    throw new BudgetApiError(
      'AUTHENTICATION_REQUIRED',
      'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.',
    );
  }
};

const companyHeaders = (companyId: number): Record<string, string> => {
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new BudgetApiError('INVALID_REQUEST', 'Geçerli bir şirket seçilmelidir.');
  }
  return { 'X-Company-Id': String(companyId) };
};

const mapError = (error: unknown): never => {
  if (error instanceof BudgetApiError) throw error;
  const response =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number; data?: { message?: string } } }).response
      : undefined;
  const message = response?.data?.message;
  if (response?.status === 401) {
    throw new BudgetApiError('AUTHENTICATION_REQUIRED', 'Oturum süresi dolmuş veya geçersiz.');
  }
  if (response?.status === 403) {
    throw new BudgetApiError(
      'FORBIDDEN',
      message ?? 'Bu şirket veya proje için veri görme yetkiniz bulunmuyor.',
    );
  }
  if (response?.status === 400) {
    throw new BudgetApiError(
      'INVALID_REQUEST',
      message ?? 'Şirket, proje veya tarih aralığı doğrulanamadı.',
    );
  }
  if (response?.status === 404) {
    throw new BudgetApiError(
      'NOT_FOUND',
      message ?? 'Bu proje için gerçekleşen maliyet bağlantısı henüz kurulmamış.',
    );
  }
  if (response?.status === 409) {
    throw new BudgetApiError('CONFLICT', message ?? 'Proje bağlantısı mevcut kayıtla çakışıyor.');
  }
  throw new BudgetApiError(
    'UNAVAILABLE',
    message ?? 'Gerçekleşen maliyet kaynağına ulaşılamadı. Kaynak veride değişiklik yapılmadı.',
  );
};

const execute = async <T>(request: () => Promise<{ data: T }>): Promise<T> => {
  await requireAuthReady();
  try {
    const { data } = await request();
    return data;
  } catch (error) {
    return mapError(error);
  }
};

export const fetchCompanies = (): Promise<CompanyOption[]> =>
  execute(() => resolveClient().get<CompanyOption[]>(`${REPORTS_BASE}/company-options`));

export const fetchProjects = (companyId: number): Promise<ProjectOption[]> =>
  execute(() =>
    resolveClient().get<ProjectOption[]>(`${REPORTS_BASE}/project-options`, {
      headers: companyHeaders(companyId),
    }),
  );

export const findProjectBinding = (
  companyId: number,
  externalProjectId: number,
): Promise<ProjectBinding> =>
  execute(() =>
    resolveClient().get<ProjectBinding>(`${PROJECT_BUDGETS_BASE}/bindings`, {
      headers: companyHeaders(companyId),
      params: {
        sourceSystem: 'WORKCUBE',
        externalProjectId,
      },
    }),
  );

export const createProjectBinding = (
  companyId: number,
  project: ProjectOption,
): Promise<ProjectBinding> =>
  execute(() =>
    resolveClient().post<ProjectBinding>(
      PROJECT_BUDGETS_BASE,
      {
        platformProjectRef: `workcube:${companyId}:${project.id}`,
        sourceSystem: 'WORKCUBE',
        externalCompanyNo: companyId,
        externalProjectId: project.id,
        externalProjectCode: project.code,
      },
      { headers: companyHeaders(companyId) },
    ),
  );

export const fetchProjectActualRows = (
  companyId: number,
  bindingId: string,
  from: string,
  to: string,
): Promise<ProjectActualRow[]> =>
  execute(() =>
    resolveClient().get<ProjectActualRow[]>(`${PROJECT_BUDGETS_BASE}/${bindingId}/actuals`, {
      headers: companyHeaders(companyId),
      params: { from, to, limit: 2000 },
    }),
  );

export const fetchProjectActualSummary = (
  companyId: number,
  bindingId: string,
  from: string,
  to: string,
): Promise<ProjectActualSummary> =>
  execute(() =>
    resolveClient().get<ProjectActualSummary>(
      `${PROJECT_BUDGETS_BASE}/${bindingId}/actuals/summary`,
      {
        headers: companyHeaders(companyId),
        params: { from, to },
      },
    ),
  );

export const fetchProjectActualSourceLines = (
  companyId: number,
  bindingId: string,
  from: string,
  to: string,
): Promise<ProjectActualSourceLineRow[]> =>
  execute(() =>
    resolveClient().get<ProjectActualSourceLineRow[]>(
      `${PROJECT_BUDGETS_BASE}/${bindingId}/actuals/source-lines`,
      {
        headers: companyHeaders(companyId),
        params: { from, to, limit: 2000 },
      },
    ),
  );

export const fetchProjectActualSourceDocument = (
  companyId: number,
  bindingId: string,
  sourceDocumentId: string,
): Promise<ProjectActualSourceDocumentDetail> =>
  execute(() =>
    resolveClient().get<ProjectActualSourceDocumentDetail>(
      `${PROJECT_BUDGETS_BASE}/${bindingId}/actuals/source-documents/${sourceDocumentId}`,
      {
        headers: companyHeaders(companyId),
      },
    ),
  );

export const fetchPypActuals = (
  companyId: number,
  fiscalYear: number,
  cursor: string | null,
): Promise<PypActualPage> =>
  execute(() =>
    resolveClient().get<PypActualPage>(`${REPORTS_BASE}/pyp-actuals/provider`, {
      headers: companyHeaders(companyId),
      params: {
        fiscalYear,
        limit: 2000,
        ...(cursor ? { cursor } : {}),
      },
    }),
  );

export const importWorkcubePlan = (
  companyId: number,
  fiscalYear: number,
  includeScenarios: boolean,
): Promise<PlanImportResult> =>
  execute(() =>
    resolveClient().post<PlanImportResult>(
      `${BUDGETS_BASE}/import/workcube`,
      { fiscalYear, includeScenarios },
      { headers: companyHeaders(companyId) },
    ),
  );

export const fetchPlanVersion = (
  companyId: number,
  planId: string,
  versionId: string,
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().get<BudgetPlanView>(`${BUDGETS_BASE}/${planId}/versions/${versionId}`, {
      headers: companyHeaders(companyId),
    }),
  );

export const submitPlanVersion = (
  companyId: number,
  planId: string,
  versionId: string,
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().post<BudgetPlanView>(
      `${BUDGETS_BASE}/${planId}/versions/${versionId}/submit`,
      null,
      { headers: companyHeaders(companyId) },
    ),
  );

export const syncProjectActuals = (
  companyId: number,
  bindingId: string,
  from: string,
  to: string,
): Promise<ProjectActualSyncResult> =>
  execute(() =>
    resolveClient().post<ProjectActualSyncResult>(
      `${PROJECT_BUDGETS_BASE}/${bindingId}/actuals/sync`,
      { from, to },
      { headers: companyHeaders(companyId) },
    ),
  );
